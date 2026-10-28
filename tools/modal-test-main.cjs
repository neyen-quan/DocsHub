const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');const {app,BrowserWindow,dialog}=require('electron');
const root=path.resolve(process.argv[2]),report=path.resolve(process.argv[3]),source=process.env.DOCSHUB_SOURCE_ROOT;
const {installDesktopUpdater}=require(path.join(source,'electron/desktop-update-ipc.cjs')),engine=require(path.join(source,'electron/desktop-update.cjs'));
app.setPath('userData',path.join(root,'profile'));app.setName('DocsHub Modal Test');
app.whenReady().then(async()=>{
 const host=new BrowserWindow({width:550,height:350,title:'DocsHub Modal Test'});await host.loadURL('data:text/html,<h1>Prueba de confirmación nativa</h1>');
 const payload=fs.readFileSync(path.join(root,'patch.zip')),asset={from:'0.1.36',to:'0.1.37',sha256:engine.sha(payload),size:payload.length,url:'https://github.com/example/DocsHub/releases/download/v0.1.37/patch.zip'};
 const m=installDesktopUpdater({app,ipcMain:{handle(){}},dialog,host:()=>host,root,client:{options:{},check:async()=>({version:'0.1.37',available:true,patch:asset,full:asset}),request:async(_u,o)=>{fs.mkdirSync(path.dirname(o.destination),{recursive:true});fs.writeFileSync(o.destination,payload);}}});
 try{
  await m.command('channel','https://github.com/example/DocsHub/releases/latest/download/latest.json');await m.command('check');
  const observed=path.join(root,'modal-observed.txt');const automation=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'native-modal.ps1'),'-Report',observed],{windowsHide:true,stdio:['ignore','ignore','pipe']});let automationError='';automation.stderr.on('data',b=>automationError+=b);
  let retainedWhileOpen=false;const monitor=setInterval(()=>{const p=m.getPending();if(m.getState().stage==='confirmation'&&p&&fs.existsSync(p.file))retainedWhileOpen=true;},100);
  const result=await m.command('install');clearInterval(monitor);const pending=m.getPending();if(!result.canceled||!retainedWhileOpen||!pending||!fs.existsSync(pending.file)||!fs.existsSync(observed))throw Error('No se conservó la descarga durante el modal real: '+automationError);
  fs.writeFileSync(report,JSON.stringify({ok:true,nativeModal:true,zipRetained:true,canceled:true}));app.quit();
 }catch(e){fs.writeFileSync(report,JSON.stringify({ok:false,error:e.stack}));app.exit(1);}
});setTimeout(()=>app.exit(3),35000).unref();

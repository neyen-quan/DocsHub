// CI-only preload. Injected using NODE_OPTIONS; never shipped in the app package.
if(process.env.DOCSHUB_QA_HOME){const fs=require('node:fs'),path=require('node:path');fs.mkdirSync(process.env.DOCSHUB_QA_HOME,{recursive:true});fs.appendFileSync(path.join(process.env.DOCSHUB_QA_HOME,'hook-bootstrap.log'),JSON.stringify({pid:process.pid,type:process.type,argv:process.argv,electron:process.versions.electron,nodeMode:process.env.ELECTRON_RUN_AS_NODE})+'\n');}
if(process.type==='browser'){
 const fs=require('node:fs'),path=require('node:path');const electron=require('electron'),{app,BrowserWindow,dialog,session}=electron;
 process.on('uncaughtException',error=>{fs.writeFileSync(path.join(process.env.DOCSHUB_QA_HOME,'uncaught.json'),JSON.stringify({error:error.stack}));app.exit(1);});
 app.disableHardwareAcceleration();
 const qa=process.env.DOCSHUB_QA_HOME,root=process.env.DOCSHUB_QA_INSTALL;if(!qa||!root)throw Error('QA paths missing');fs.mkdirSync(qa,{recursive:true});
 const original=app.getPath.bind(app);app.getPath=k=>k==='appData'?path.join(qa,'profile'):original(k);
 const pkg=()=>JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const captured=new Set();const capture=(wc,role)=>{if(captured.has(role))return;captured.add(role);setTimeout(async()=>{try{fs.writeFileSync(path.join(path.dirname(qa),path.basename(qa)+'-'+role+'.png'),(await wc.capturePage()).toPNG());}catch{}},350);};
 const write=(file,obj)=>fs.writeFileSync(path.join(qa,file),JSON.stringify(obj,null,2));
 const realDialog=dialog.showMessageBox.bind(dialog);
 dialog.showMessageBox=async(win,options)=>options.title==='Confirmar actualización de DocsHub'?{response:0}:realDialog(win,options);
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[process.env.DOCSHUB_QA_PATCH]});
 app.on('web-contents-created',(_event,wc)=>{
  const load=wc.loadURL.bind(wc);wc.loadURL=(url,...args)=>/^https?:/i.test(url)?Promise.resolve():load(url,...args);
  const send=wc.send.bind(wc);wc.send=(channel,...args)=>{if(channel==='update-center-state'){try{fs.appendFileSync(path.join(qa,'progress.log'),JSON.stringify(args[0])+'\n');if(['installation','startup-check'].includes(args[0]?.stage)&&wc.getURL().includes('/.docshub-updates/'))capture(wc,'installer');}catch{}}return send(channel,...args);};
 });
 app.on('browser-window-created',(_event,win)=>{
  win.webContents.on('did-finish-load',async()=>{
   try{
    const url=win.webContents.getURL();
    if(url.endsWith('/dist/index.html')){
     await new Promise(r=>setTimeout(r,700));const version=pkg().version;capture(win.webContents,'main');
     const result=await win.webContents.executeJavaScript(`(async()=>{
       await window.workhub2.desktopReady();
       const key='docshub-ci-preserved',old=localStorage.getItem(key);if(!old)localStorage.setItem(key,'retained');
       let data=await window.workhub2.rinaAccountsRead();if(!data.data.expenses.length)data=await window.workhub2.rinaAccountsMutate({type:'save-expense',expense:{concept:'CI fixture',provider:'CI',categoryId:'category-1',amount:'12.34',date:'2026-10',notes:'Synthetic test data'}},data.data.revision);
       return {local:localStorage.getItem(key),data};
     })()`);
     const cookies=session.fromPartition('persist:workhub2-gpt-personal').cookies;let found=await cookies.get({name:'docshub-ci'});if(!found.length){await cookies.set({url:'https://example.com',name:'docshub-ci',value:'retained',expirationDate:Date.now()/1000+86400});found=await cookies.get({name:'docshub-ci'});}
     write('launch-'+version+'.json',{ok:true,version,local:result.local,expenseCount:result.data.data.expenses.length,amount:result.data.data.expenses[0]?.amountCents,cookie:found[0]?.value,root});
     if(process.env.DOCSHUB_QA_FROM===version&&process.env.DOCSHUB_QA_PATCH&&!fs.existsSync(path.join(qa,'requested'))){fs.writeFileSync(path.join(qa,'requested'),'yes');await win.webContents.executeJavaScript('window.workhub2.desktopUpdate()');}
    }else if(url.endsWith('/electron/update-center.html')&&process.env.DOCSHUB_QA_PATCH){
     capture(win.webContents,'center');await new Promise(r=>setTimeout(r,300));await win.webContents.executeJavaScript("window.docsHubUpdater.command('local')");
    }
   }catch(e){write('hook-error.json',{error:e.stack});}
  });
 });
 setInterval(()=>{if(fs.existsSync(path.join(qa,'stop')))app.quit();},300).unref();
}

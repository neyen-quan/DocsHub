const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn,execFileSync}=require('node:child_process');
const tools=__dirname,root=path.resolve(process.env.DOCSHUB_SOURCE_ROOT||path.join(tools,'..')),qa=path.join(root,'.qa');fs.mkdirSync(qa,{recursive:true});
const engine=require(path.join(root,'electron/desktop-update.cjs')),{zip}=require(path.join(root,'tools/lib/test-zip.cjs'));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),built=path.join(root,'.build/DocsHub'),runtime=path.join(built,'runtime/Workhub2.exe');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFile(file,timeout=90000){const until=Date.now()+timeout;while(!fs.existsSync(file)){if(Date.now()>until)throw Error('Timeout: '+file);await wait(100);}return JSON.parse(fs.readFileSync(file,'utf8'));}
function nextVersion(v){const p=v.split('.').map(Number);p[2]++;return p.join('.');}
function testPatch(base,directory,{fail=false}={}){
 const from=JSON.parse(fs.readFileSync(path.join(base,'assets/docshub-installation.json'),'utf8')),to=nextVersion(from.version),p=JSON.parse(fs.readFileSync(path.join(base,'package.json'),'utf8'));p.version=to;
 const changes={'package.json':JSON.stringify(p,null,2)+'\n'};if(fail)changes['electron/main.cjs']='process.exit(23);';
 const target=structuredClone(from);target.version=to;for(const [name,b]of Object.entries(changes))target.files[name]={size:Buffer.byteLength(b),sha256:engine.sha(b)};
 changes['assets/docshub-installation.json']=JSON.stringify(target,null,2)+'\n';
 const m={format:2,appId:engine.APP_ID,version:to,fromVersions:[from.version],base:from,target,remove:[],files:Object.entries(changes).map(([name,b])=>({path:name,size:Buffer.byteLength(b),sha256:engine.sha(b)}))};
 const file=path.join(directory,'patch.zip');fs.writeFileSync(file,zip([['docshub-patch.json',JSON.stringify(m)],...Object.entries(changes)]));return {file,from:from.version,to};
}
async function modal(){
 const dir=path.join(qa,'modal');fs.mkdirSync(dir,{recursive:true});const {fixture,patch}=require(path.join(root,'tools/lib/update-fixture.cjs')),cleanups=[],f=fixture({after:fn=>cleanups.push(fn)});fs.cpSync(f.root,dir,{recursive:true});fs.writeFileSync(path.join(dir,'patch.zip'),patch(f));cleanups.forEach(fn=>fn());
 const report=path.join(qa,'native-modal.json'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
 const child=spawn(runtime,[path.join(tools,'modal-test-main.cjs'),dir,report,'--disable-gpu','--enable-logging=stderr'],{env,stdio:['ignore',fs.openSync(path.join(qa,'modal.log'),'w'),fs.openSync(path.join(qa,'modal-error.log'),'w')]});
 child.on('error',error=>fs.writeFileSync(path.join(qa,'modal-child.json'),JSON.stringify({error:error.message})));child.on('exit',(code,signal)=>fs.writeFileSync(path.join(qa,'modal-child.json'),JSON.stringify({code,signal})));
 try{const result=await waitFile(report,40000);assert.equal(result.ok,true,JSON.stringify(result));}finally{try{child.kill();}catch{}}
}
async function packaged(fail=false){
 const home=path.join(qa,fail?'rollback':'install'),install=path.join(home,'DocsHub á space');fs.mkdirSync(home,{recursive:true});fs.cpSync(built,install,{recursive:true});
 // Packaged Electron intentionally ignores NODE_OPTIONS --require. Instrument
 // only this disposable install, then describe those exact bytes in its fixture
 // inventory. Never modify the deliverable in .build/DocsHub or release/.
 const hook=path.join(tools,'packaged-test-hook.cjs').replaceAll('\\','/');
 const invFile=path.join(install,'assets/docshub-installation.json'),inv=JSON.parse(fs.readFileSync(invFile));
 for(const name of ['electron/main.cjs','electron/installer-main.cjs']){const file=path.join(install,name);fs.writeFileSync(file,'require('+JSON.stringify(hook)+');\n'+fs.readFileSync(file,'utf8'));const bytes=fs.readFileSync(file);inv.files[name]={size:bytes.length,sha256:engine.sha(bytes)};}
 fs.writeFileSync(invFile,JSON.stringify(inv,null,2)+'\n');
 const patch=testPatch(install,home,{fail});
 const profile=path.join(home,'profile','Neyen.Workhub2');fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'metadata-downloads.json'),JSON.stringify({destination:path.join(home,'downloads')}));fs.mkdirSync(path.join(profile,'document-undo'),{recursive:true});fs.writeFileSync(path.join(profile,'document-undo/history.json'),'[]');
 const env={...process.env,NODE_OPTIONS:require('./lib/node-preload.cjs').preloadOption(path.join(tools,'packaged-test-hook.cjs')),DOCSHUB_QA_HOME:home,DOCSHUB_QA_INSTALL:install,DOCSHUB_QA_PATCH:patch.file,DOCSHUB_QA_FROM:patch.from};delete env.ELECTRON_RUN_AS_NODE;
 const probeEnv={...env,ELECTRON_RUN_AS_NODE:'1'};try{fs.writeFileSync(path.join(home,'runtime-probe.log'),execFileSync(path.join(install,'runtime/Workhub2.exe'),['-e',"console.log(JSON.stringify({type:process.type,argv:process.argv,electron:process.versions.electron,nodeOptions:process.env.NODE_OPTIONS}));"],{env:probeEnv,encoding:'utf8',timeout:15000}));}catch(e){fs.writeFileSync(path.join(home,'runtime-probe.log'),String(e)+'\n'+e.stdout+'\n'+e.stderr);}
 const child=spawn(path.join(install,'DocsHub.exe'),[],{cwd:os.tmpdir(),env,stdio:'ignore'});child.on('error',e=>fs.writeFileSync(path.join(home,'launcher-error.json'),JSON.stringify({error:e.stack})));child.on('exit',(code,signal)=>fs.writeFileSync(path.join(home,'launcher-exit.json'),JSON.stringify({code,signal}))); 
 try{
  const initialFile=path.join(home,'launch-'+patch.from+'.json');const initial=await waitFile(initialFile);const initialTime=fs.statSync(initialFile).mtimeMs;assert.equal(initial.ok,true);assert.ok(initial.windowIcon.yellowPixels>4,'native window must show yellow logo');assert.ok(initial.shellYellow>4,'shell relaunch resource must show yellow logo');assert.equal(initial.amount,1234);assert.equal(initial.local,'retained');assert.equal(initial.cookie,'retained');
  let result;const deadline=Date.now()+90000;while(Date.now()<deadline){const file=path.join(install,'.docshub-updates/result.json');if(fs.existsSync(file)){result=JSON.parse(fs.readFileSync(file,'utf8'));break;}
   const jobs=fs.existsSync(path.join(install,'.docshub-updates'))?fs.readdirSync(path.join(install,'.docshub-updates')).filter(n=>/^[\da-f-]{36}$/.test(n)):[];
   for(const name of jobs){const file=path.join(install,'.docshub-updates',name,'journal.json');if(fs.existsSync(file)){const j=JSON.parse(fs.readFileSync(file,'utf8'));if(j.state===(fail?'rolled-back':'complete'))result={ok:!fail};}}if(result)break;await wait(100);}
  assert.ok(result,'installer must reach a terminal state');assert.equal(result.ok,!fail);
  if(!fail){const next=await waitFile(path.join(home,'launch-'+patch.to+'.json'));assert.equal(next.amount,1234);assert.equal(next.local,'retained');assert.equal(next.cookie,'retained');assert.equal(next.root,install);}
  else{assert.equal(JSON.parse(fs.readFileSync(path.join(install,'package.json'))).version,patch.from);const until=Date.now()+15000;while(fs.statSync(initialFile).mtimeMs<=initialTime&&Date.now()<until)await wait(100);assert.ok(fs.statSync(initialFile).mtimeMs>initialTime,'old app must reopen after rollback');}
  assert.equal(fs.readFileSync(path.join(profile,'document-undo/history.json'),'utf8'),'[]');assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'metadata-downloads.json'))).destination,path.join(home,'downloads'));
  const progress=fs.readFileSync(path.join(home,'progress.log'),'utf8').trim().split('\n').map(JSON.parse);assert.ok(progress.some(p=>p.stage==='installation'),'independent installer progress');assert.ok(progress.some(p=>p.stage===(fail?'recovery':'startup-check')));
  fs.writeFileSync(path.join(qa,fail?'rollback.json':'incremental.json'),JSON.stringify({ok:true,nativeExe:true,from:patch.from,to:patch.to,rollback:fail,dataPreserved:true,progressStages:[...new Set(progress.map(p=>p.stage))]},null,2));
 }catch(error){
  try{fs.writeFileSync(path.join(home,'processes.log'),execFileSync('powershell.exe',['-NoProfile','-Command',"Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'Workhub2|DocsHub' } | Select-Object Name,ProcessId,CommandLine | ConvertTo-Json"],{encoding:'utf8'}));}catch{}
  throw error;
 }finally{fs.writeFileSync(path.join(home,'stop'),'stop');await wait(2500);}
}
async function legacy(){
 const files=fs.readdirSync(path.join(root,'release')).filter(n=>n.endsWith('-transition.zip'));if(!files.length)return;
 const old=require(path.join(root,'compat/legacy-update-engine.cjs')),file=path.join(root,'release',files[0]);const p=old.validatePatch(fs.readFileSync(file),'0.1.35');assert.equal(p.manifest.files.at(-1).path,'DocsHub.exe','launcher must be installed after its new stable bootstrap');
 const dir=path.join(qa,'legacy-transition');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:'workhub2-desktop',version:'0.1.35',main:'electron/main.cjs'}));
 const pending=old.prepare(dir,fs.readFileSync(file),'0.1.35'),j=JSON.parse(fs.readFileSync(path.join(pending.job,'journal.json')));old.apply(pending.job,j);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'package.json'))).version,pkg.version);old.rollback(pending.job,j);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'package.json'))).version,'0.1.35');
 fs.writeFileSync(path.join(qa,'legacy.json'),JSON.stringify({ok:true,legacyValidator:true,applyAndRollback:true}));
}
async function exactDelta(){
 const candidates=fs.readdirSync(path.join(root,'release')).filter(n=>n.endsWith('-patch.zip'));if(!candidates.length)return;
 const base=path.join(root,'.build/published-base'),install=path.join(qa,'exact-delta');fs.cpSync(base,install,{recursive:true});const from=JSON.parse(fs.readFileSync(path.join(install,'package.json'))).version;
 const pending=await engine.prepareAsync(install,fs.readFileSync(path.join(root,'release',candidates[0])),from);const journal=JSON.parse(fs.readFileSync(path.join(pending.job,'journal.json')));
 await engine.applyAsync(pending.job,journal);await engine.verifyInventory(install,journal.targetInventory);await engine.rollbackAsync(pending.job,journal);await engine.verifyInventory(install,journal.baseInventory||JSON.parse(fs.readFileSync(path.join(base,'assets/docshub-installation.json'))));
 fs.writeFileSync(path.join(qa,'exact-delta.json'),JSON.stringify({ok:true,publishedBase:true,actualReleasePatch:true,applyAndRollback:true}));
}
async function main(){if(process.platform!=='win32')throw Error('La aceptación de Windows se ejecuta en Windows.');await legacy();await exactDelta();await modal();await packaged();await packaged(true);console.log('PASS: EXE Windows, modal real, delta exacto, datos, progreso y rollback.');}
if(require.main===module)main().catch(e=>{fs.writeFileSync(path.join(qa,'failure.json'),JSON.stringify({ok:false,error:e.stack},null,2));console.error(e);process.exitCode=1;});
module.exports={testPatch};

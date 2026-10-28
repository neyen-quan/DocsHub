// This file and engine.cjs are copied into the transaction before DocsHub exits.
const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');
const engine=require('./engine.cjs');
const job=__dirname,journalFile=path.join(job,'journal.json');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function alive(pid){try{process.kill(pid,0);return true;}catch{return false;}}
async function run(){
  const journal=JSON.parse(fs.readFileSync(journalFile,'utf8'));
  const parent=Number(process.argv[2]),runtime=process.argv[3],root=journal.root;
  if(!Number.isSafeInteger(parent)||parent<1||!fs.existsSync(runtime))throw Error('No se pudo preparar el reinicio.');
  journal.workerPid=process.pid;engine.atomicJson(journalFile,journal);
  fs.writeFileSync(path.join(job,'ready'),'ready');
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.DOCSHUB_UPDATE_JOB;
  const launch=token=>{const child=spawn(runtime,[root],{cwd:root,env:{...env,...(token?{DOCSHUB_UPDATE_JOB:token}:{})},detached:true,windowsHide:true,stdio:'ignore'});child.on('error',()=>{});return child;};
  let child;
  try{
    const deadline=Date.now()+60000;while(alive(parent)){if(Date.now()>deadline)throw Error('DocsHub no se cerró a tiempo. No se aplicó el parche.');await sleep(150);}
    engine.apply(job,journal);
    child=launch(journal.id);await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    journal.appPid=child.pid;engine.atomicJson(journalFile,journal);
    const until=Date.now()+60000;let healthy=false;
    while(Date.now()<until){
      try{const receipt=JSON.parse(fs.readFileSync(path.join(job,'healthy.json'),'utf8'));if(receipt.id===journal.id&&receipt.version===journal.to){healthy=true;break;}}catch{}
      if(!alive(child.pid))break;await sleep(200);
    }
    if(!healthy)throw Error('La versión nueva no confirmó un inicio correcto. Se recuperó la anterior.');
    journal.state='complete';engine.atomicJson(journalFile,journal);
    engine.atomicJson(path.join(root,'.docshub-updates','result.json'),{ok:true,version:journal.to,message:'DocsHub se actualizó a '+journal.to+'.'});
    fs.rmSync(path.join(root,'.docshub-updates','active.json'),{force:true});child.unref();
  }catch(error){
    if(child?.pid&&alive(child.pid)){try{process.kill(child.pid);}catch{}for(let i=0;i<40&&alive(child.pid);i++)await sleep(100);if(alive(child.pid))throw Error('No se pudo cerrar la versión fallida; la recuperación continuará al abrir DocsHub.exe.');}
    engine.rollback(job,journal);
    engine.atomicJson(path.join(root,'.docshub-updates','result.json'),{ok:false,message:error.message});
    fs.rmSync(path.join(root,'.docshub-updates','active.json'),{force:true});
    if(!alive(parent)){const old=launch();old.unref();}
  }
}
run().catch(error=>{try{fs.writeFileSync(path.join(job,'worker-error.txt'),error.stack||String(error));}catch{}process.exitCode=1;});

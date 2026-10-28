const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');
const {emptyLedger,validateLedger,applyOperation}=require('../shared/rina-model.cjs');
function createRinaStore(root){
  const file=path.join(root,'cuentas-rina.json'),backups=path.join(root,'backups');let queue=Promise.resolve();
  const serialize=action=>{const pending=queue.then(action);queue=pending.catch(()=>{});return pending;};
  const encode=data=>JSON.stringify({payload:data,sha256:crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex')},null,2);
  async function decode(file){const raw=JSON.parse(await fs.readFile(file,'utf8'));if(raw.sha256!==crypto.createHash('sha256').update(JSON.stringify(raw.payload)).digest('hex'))throw Error('El registro no pasó la comprobación de integridad.');return validateLedger(raw.payload);}
  async function atomic(file,content){await fs.mkdir(path.dirname(file),{recursive:true});const temporary=file+'.tmp';const handle=await fs.open(temporary,'w',0o600);try{await handle.writeFile(content,'utf8');await handle.sync();}finally{await handle.close();}await fs.rename(temporary,file);}
  async function load(){
    try{return {data:await decode(file)};}catch(error){
      if(error.code==='ENOENT'){try{const names=await fs.readdir(backups);if(!names.some(n=>n.endsWith('.json')))return {data:emptyLedger()};}catch(e){if(e.code==='ENOENT')return {data:emptyLedger()};throw e;}}
      let names=[];try{names=(await fs.readdir(backups)).filter(n=>n.endsWith('.json')).sort().reverse();}catch{}
      for(const name of names){try{return {data:await decode(path.join(backups,name)),warning:'Se recuperó un respaldo porque el último guardado no estaba disponible. Revisá los últimos movimientos.'};}catch{}}
      throw Error('No se pudo leer Cuentas Rina. Los archivos se conservaron; restaurá un respaldo para continuar.');
    }
  }
  async function persist(data,previous){
    if(previous){await fs.mkdir(backups,{recursive:true});await atomic(path.join(backups,`${String(previous.revision).padStart(12,'0')}-${crypto.randomUUID()}.json`),encode(previous));}
    await atomic(file,encode(data));
    try{const names=(await fs.readdir(backups)).filter(n=>n.endsWith('.json')).sort().reverse();for(const name of names.slice(30))await fs.unlink(path.join(backups,name));}catch{}
  }
  function mutate(operation,revision){return serialize(async()=>{const {data}=await load();if(data.revision!==revision)throw Error('Los datos cambiaron. Actualizá Cuentas Rina y volvé a intentarlo.');const next=applyOperation(data,operation,crypto.randomUUID(),new Date().toISOString());await persist(next,data);return {data:next};});}
  function restore(input,revision){return serialize(async()=>{const replacement=validateLedger(input);let previous;try{previous=(await load()).data;}catch{}if(previous&&previous.revision!==revision)throw Error('Los datos cambiaron. Actualizá antes de restaurar.');replacement.revision=(previous?.revision||0)+1;await persist(replacement,previous);return {data:replacement};});}
  return {read:()=>serialize(load),mutate,restore,file};
}
module.exports={createRinaStore};

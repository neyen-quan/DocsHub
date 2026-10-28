const fs=require('node:fs/promises');const sync=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
async function exists(file){try{await fs.lstat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function signature(file){const hash=crypto.createHash('sha256');async function walk(current,relative){const stat=await fs.lstat(current);hash.update(JSON.stringify([relative,stat.isDirectory()?'dir':stat.isSymbolicLink()?'link':'file']));if(stat.isSymbolicLink())hash.update(await fs.readlink(current));else if(stat.isDirectory()){for(const name of (await fs.readdir(current)).sort())await walk(path.join(current,name),path.join(relative,name));}else{for await(const chunk of sync.createReadStream(current))hash.update(chunk);}}await walk(file,'');return hash.digest('hex');}
async function move(source,target){try{await fs.rename(source,target);}catch(e){if(e.code!=='EXDEV')throw e;await fs.cp(source,target,{recursive:true,force:false,errorOnExist:true});try{await fs.rm(source,{recursive:true});}catch(error){await fs.rm(target,{recursive:true,force:true});throw error;}}}
function createDocumentUndo(root){const journal=path.join(root,'history.json');let history=[];try{history=JSON.parse(sync.readFileSync(journal,'utf8'));if(!Array.isArray(history))history=[];}catch{}
 async function save(){await fs.mkdir(root,{recursive:true});await fs.writeFile(journal+'.tmp',JSON.stringify(history));await fs.rename(journal+'.tmp',journal);}
 async function backup(file){await fs.mkdir(root,{recursive:true});const target=path.join(root,crypto.randomUUID());await fs.cp(file,target,{recursive:true,force:false,errorOnExist:true});return target;}
 async function describe(entry){return{...entry,signature:await signature(entry.target)};}
 async function commit(entries){if(!entries.length)return;history.push(entries);await save();}
 async function undo(){const entries=history.at(-1);if(!entries?.length)return{ok:false,error:'No hay movimientos ni copias para deshacer.'};
  // Validate the entire action before changing anything; preserve later edits.
  for(const e of entries){if(!await exists(e.target)||await signature(e.target)!==e.signature)throw Error(`No puedo deshacer: “${path.basename(e.target)}” fue modificado, movido o eliminado después.`);if(e.operation==='move'&&await exists(e.source))throw Error(`No puedo deshacer: ya existe “${path.basename(e.source)}” en su ubicación original.`);if(e.backup&&!await exists(e.backup))throw Error('No está disponible el respaldo necesario para deshacer.');if(e.operation==='move'&&!(await fs.stat(path.dirname(e.source))).isDirectory())throw Error('La carpeta original ya no está disponible.');}
  let reverted=0;
  try{for(const e of [...entries].reverse()){if(e.operation==='move')await move(e.target,e.source);else await fs.rm(e.target,{recursive:true});if(e.backup)await move(e.backup,e.target);entries.splice(entries.indexOf(e),1);reverted++;await save();}}catch(error){await save();throw Error(`${error.message} (${reverted} elemento(s) deshechos).`);}
  history.pop();await save();return{ok:true,reverted};
 }
 return{backup,describe,commit,undo};
}
module.exports={createDocumentUndo,signature};

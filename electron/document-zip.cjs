const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function createDocumentZip({allowedPath,runArchive}){
 return async function create({folder,files}={}){
  if(typeof folder!=='string'||!path.isAbsolute(folder)||!allowedPath(folder)||!Array.isArray(files)||!files.length)throw Error('Seleccioná archivos o carpetas de Documentos.');
  const root=await fs.realpath(folder);if(!allowedPath(root)||!(await fs.stat(root)).isDirectory())throw Error('La carpeta ya no está disponible.');
  const inputs=[],seen=new Set(),entries=[];
  for(const file of files){
   if(typeof file!=='string'||!path.isAbsolute(file)||!allowedPath(file)||path.resolve(path.dirname(file))!==path.resolve(folder))throw Error('La selección debe pertenecer a la misma carpeta.');
   const stat=await fs.lstat(file);if(stat.isSymbolicLink())throw Error('No se comprimen enlaces o accesos a otras ubicaciones.');
   const canonical=await fs.realpath(file);if(!allowedPath(canonical)||path.dirname(canonical)!==root)throw Error('La selección sale de la carpeta habilitada.');
   const key=process.platform==='win32'?canonical.toLowerCase():canonical;if(!seen.has(key)){seen.add(key);inputs.push(canonical);}
  }
  async function walk(file,name){
   const stat=await fs.lstat(file);if(stat.isSymbolicLink())throw Error('No se comprimen enlaces dentro de las carpetas.');
   const real=await fs.realpath(file);if(!allowedPath(real)||path.relative(root,real).split(path.sep).includes('..'))throw Error('Un elemento sale de la carpeta habilitada.');
   if(stat.isDirectory()){entries.push({path:file,name:name+'/',directory:true});for(const child of await fs.readdir(file))await walk(path.join(file,child),name+'/'+child);}
   else if(stat.isFile())entries.push({path:file,name,directory:false});else throw Error('La selección contiene un elemento que no es un archivo normal.');
  }
  for(const file of inputs)await walk(file,path.basename(file));
  const base=Array.from(inputs.length===1?path.parse(inputs[0]).name:path.basename(root)||'Archivos').slice(0,180).join('')||'Archivos';
  const temp=path.join(root,'.docshub-zip-'+crypto.randomUUID()+'.tmp');let output;
  try{
   await runArchive({folder:root,destination:temp,entries});
   for(let n=1;;n++){
    const candidate=path.join(root,base+(n===1?'':' ('+n+')')+'.zip');
    try{await fs.link(temp,candidate);output=candidate;break;}
    catch(e){if(e.code==='EEXIST')continue;if(!['EPERM','ENOTSUP','EOPNOTSUPP','EXDEV','ENOSYS'].includes(e.code))throw e;
     try{await fs.copyFile(temp,candidate,sync.constants.COPYFILE_EXCL);output=candidate;break;}catch(copyError){if(copyError.code==='EEXIST')continue;throw copyError;}
    }
   }
   return {ok:true,file:output,count:inputs.length};
  }finally{await fs.rm(temp,{force:true}).catch(()=>{});}
 };
}
function installDocumentZip({ipcMain,host,allowedPath,runArchive,queue}){
 const create=createDocumentZip({allowedPath,runArchive});
 ipcMain.handle('create-document-zip',async(event,args)=>{
  const wc=host()?.webContents;if(event.sender!==wc||event.senderFrame!==wc?.mainFrame)return {ok:false,error:'Solicitud inválida.'};
  try{return await queue(()=>create(args));}catch(error){return {ok:false,error:error.message||'No se pudo crear el ZIP.'};}
 });
}
module.exports={createDocumentZip,installDocumentZip};

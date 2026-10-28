// DocsHub patch format 1. No shell, PowerShell, external unzip or npm dependency.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const APP_ID = 'agency.neyen.workhub2';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const MAX_BYTES = 200 * 1024 * 1024;
function version(value) {
  if (typeof value !== 'string' || !/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(value)) throw Error('Versión de parche inválida.');
  return value.split('.').map(Number);
}
function newer(a,b) { const x=version(a),y=version(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false; }
function safeName(name) {
  if(typeof name!=='string'||name.length>220||name.includes('\\')||name.startsWith('/')||/[\x00-\x1f:]/.test(name))throw Error('El ZIP contiene una ruta inválida.');
  const parts=name.split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw Error('El ZIP contiene una ruta insegura para Windows.');
  return name;
}
function allowedFile(name) {
  safeName(name);
  // The recovery bootstrap is deliberately immutable in format 1.
  if(name==='electron/desktop-bootstrap.cjs')return false;
  return /^(dist|electron|shared|src|scripts|assets|native)\//.test(name)||['package.json','package-lock.json','DocsHub.exe','LEEME.txt','INICIAR-DOCSHUB.bat','index.html','vite.config.js'].includes(name);
}
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function unzip(buffer) {
  if(!Buffer.isBuffer(buffer)||buffer.length<22||buffer.length>100*1024*1024)throw Error('El ZIP está vacío o supera 100 MB.');
  let end=-1;for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50&&i+22+buffer.readUInt16LE(i+20)===buffer.length){end=i;break;}
  if(end<0)throw Error('No se pudo leer el ZIP. Volvé a descargar el parche.');
  const count=buffer.readUInt16LE(end+10),size=buffer.readUInt32LE(end+12),offset=buffer.readUInt32LE(end+16);
  if(buffer.readUInt16LE(end+4)||buffer.readUInt16LE(end+6)||count!==buffer.readUInt16LE(end+8)||count>10000||offset+size!==end)throw Error('ZIP dividido, ZIP64 o estructura no compatible.');
  const files=new Map(),seen=new Set();let cursor=offset,total=0;
  for(let i=0;i<count;i++){
    if(cursor+46>end||buffer.readUInt32LE(cursor)!==0x02014b50)throw Error('Directorio del ZIP dañado.');
    const flags=buffer.readUInt16LE(cursor+8),method=buffer.readUInt16LE(cursor+10),crc=buffer.readUInt32LE(cursor+16),compressed=buffer.readUInt32LE(cursor+20),length=buffer.readUInt32LE(cursor+24),nl=buffer.readUInt16LE(cursor+28),el=buffer.readUInt16LE(cursor+30),cl=buffer.readUInt16LE(cursor+32),local=buffer.readUInt32LE(cursor+42),mode=buffer.readUInt32LE(cursor+38)>>>16;
    if(cursor+46+nl+el+cl>end)throw Error('Nombre de archivo truncado.');
    let name=buffer.subarray(cursor+46,cursor+46+nl).toString('utf8');
    cursor+=46+nl+el+cl;
    const directory=name.endsWith('/');if(directory)name=name.slice(0,-1);safeName(name);
    if(seen.has(name.toLowerCase()))throw Error('El ZIP contiene nombres duplicados.');seen.add(name.toLowerCase());
    if((mode&0xf000)===0xa000||(flags&1)||![0,8].includes(method))throw Error('El ZIP contiene enlaces, cifrado o compresión no compatible.');
    if(directory)continue;
    total+=length;if(total>MAX_BYTES)throw Error('El parche descomprimido supera 200 MB.');
    if(local+30>offset||buffer.readUInt32LE(local)!==0x04034b50)throw Error('Cabecera del ZIP dañada.');
    const lnl=buffer.readUInt16LE(local+26),lel=buffer.readUInt16LE(local+28),start=local+30+lnl+lel;
    if(buffer.subarray(local+30,local+30+lnl).toString('utf8')!==name||buffer.readUInt16LE(local+8)!==method||start+compressed>offset)throw Error('El ZIP contiene cabeceras inconsistentes.');
    let bytes;try{const packed=buffer.subarray(start,start+compressed);bytes=method===0?packed:zlib.inflateRawSync(packed,{maxOutputLength:Math.max(1,length)});}catch{throw Error('No se pudo descomprimir un archivo del parche.');}
    if(bytes.length!==length||crc32(bytes)!==crc)throw Error('Un archivo del ZIP está dañado. Volvé a descargarlo.');
    files.set(name,bytes);
  }
  if(cursor!==end)throw Error('Directorio del ZIP inconsistente.');
  return files;
}
function validatePatch(buffer,currentVersion) {
  const files=unzip(buffer),manifestBytes=files.get('docshub-patch.json');
  if(!manifestBytes)throw Error('Este ZIP no es un parche del nuevo actualizador de DocsHub: falta docshub-patch.json. No se modificó el programa.');
  let m;try{m=JSON.parse(manifestBytes);}catch{throw Error('El manifiesto del parche no es válido.');}
  if(m.appId!==APP_ID||m.format!==1)throw Error('El ZIP no corresponde a DocsHub o usa otro formato.');
  if(!newer(m.version,currentVersion))throw Error('El parche debe ser más nuevo que DocsHub '+currentVersion+'.');
  if(!Array.isArray(m.fromVersions)||!m.fromVersions.includes(currentVersion))throw Error('Este parche no es compatible con DocsHub '+currentVersion+'. Necesitás el parche para tu versión.');
  if(!Array.isArray(m.files)||!m.files.length||m.files.length>10000)throw Error('El parche no contiene una lista válida de archivos.');
  const names=new Set();
  for(const f of m.files){
    if(!f||!allowedFile(f.path)||names.has(f.path.toLowerCase()))throw Error('El parche intenta cambiar archivos no permitidos.');
    names.add(f.path.toLowerCase());const bytes=files.get(f.path);
    if(!bytes||!Number.isSafeInteger(f.size)||f.size!==bytes.length||sha(bytes)!==f.sha256)throw Error('El parche está incompleto o falló la verificación de integridad: '+f.path);
  }
  if(files.size!==m.files.length+1)throw Error('El ZIP contiene archivos fuera del manifiesto.');
  let pkg;try{pkg=JSON.parse(files.get('package.json'));}catch{throw Error('El parche debe incluir package.json con su versión.');}
  if(pkg.name!=='workhub2-desktop'||pkg.version!==m.version||pkg.main!=='electron/main.cjs')throw Error('La identidad o versión del programa no coincide con el parche.');
  return {manifest:m,files};
}
function atomicJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';const fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);}
function inside(root,name){safeName(name);let current=root;for(const part of name.split('/')){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('No se actualizan rutas que contienen enlaces.');}return current;}
function prepare(root,buffer,currentVersion){
  const validated=validatePatch(buffer,currentVersion);
  const updates=path.join(root,'.docshub-updates');fs.mkdirSync(updates,{recursive:true});
  const active=path.join(updates,'active.json');if(fs.existsSync(active))throw Error('Hay una actualización pendiente. Cerrá y abrí DocsHub.exe antes de intentarlo otra vez.');
  const id=crypto.randomUUID(),job=path.join(updates,id);fs.mkdirSync(job);
  const journal={id,root,from:currentVersion,to:validated.manifest.version,state:'prepared',workerPid:0,entries:[]};
  try{
    for(const f of validated.manifest.files){
      const target=inside(root,f.path),staged=path.join(job,'stage',f.path),backup=path.join(job,'backup',f.path);
      if(fs.existsSync(target)&&!fs.statSync(target).isFile())throw Error('Un archivo del parche coincide con una carpeta: '+f.path);
      fs.mkdirSync(path.dirname(staged),{recursive:true});fs.writeFileSync(staged,validated.files.get(f.path));
      const existed=fs.existsSync(target);if(existed){fs.mkdirSync(path.dirname(backup),{recursive:true});fs.copyFileSync(target,backup);}
      journal.entries.push({path:f.path,existed,sha256:f.sha256,touched:false});
    }
    fs.copyFileSync(__filename,path.join(job,'engine.cjs'));
    fs.copyFileSync(path.join(__dirname,'desktop-update-worker.cjs'),path.join(job,'worker.cjs'));
    atomicJson(path.join(job,'journal.json'),journal);atomicJson(active,{id});
    return {id,job,version:journal.to,count:journal.entries.length};
  }catch(e){fs.rmSync(job,{recursive:true,force:true});throw e;}
}
function rollback(job,journal){
  for(const entry of journal.entries.slice().reverse()){
    if(!entry.touched)continue;
    if(!allowedFile(entry.path))throw Error('Ruta de recuperación inválida.');
    const target=inside(journal.root,entry.path);
    if(entry.existed){fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(job,'backup',entry.path),target);}
    else fs.rmSync(target,{force:true});
  }
  journal.state='rolled-back';atomicJson(path.join(job,'journal.json'),journal);
}
function apply(job,journal,onFile){
  journal.state='applying';atomicJson(path.join(job,'journal.json'),journal);
  for(const entry of journal.entries){
    const target=inside(journal.root,entry.path),staged=path.join(job,'stage',entry.path);
    if(!allowedFile(entry.path)||sha(fs.readFileSync(staged))!==entry.sha256)throw Error('El archivo preparado cambió: '+entry.path);
    entry.touched=true;atomicJson(path.join(job,'journal.json'),journal);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    // Same-volume atomic replacement; a locked file causes rollback, never a silent partial update.
    const tmp=target+'.docshub-new';fs.copyFileSync(staged,tmp);try{fs.renameSync(tmp,target);}finally{fs.rmSync(tmp,{force:true});}
    onFile?.(entry);
  }
  journal.state='awaiting-health';atomicJson(path.join(job,'journal.json'),journal);
}
module.exports={APP_ID,sha,crc32,version,newer,safeName,allowedFile,unzip,validatePatch,atomicJson,inside,prepare,apply,rollback};

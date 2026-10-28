const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {createVlc,VLC_EXECUTABLE,VLC_WINDOW_ARGUMENTS} = require('../electron/vlc.cjs');
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'docshub-vlc-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const folder=path.join(root,'docs');await fs.mkdir(folder);const file=path.join(folder,'video con espacios & acentos á.MP4');await fs.writeFile(file,'original video');
  const calls=[];const options={allowedPath:p=>p.startsWith(folder+path.sep),launch:async(...args)=>calls.push(args)};
  return {root,folder,file,calls,options,edit:createVlc(options)};
}
test('VLC uses the user-provided executable and passes video as a single argument',async t=>{
  const f=await fixture(t);assert.deepEqual(await f.edit(f.file),{ok:true});assert.equal(VLC_EXECUTABLE,'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe');assert.deepEqual(f.calls,[[VLC_EXECUTABLE,[...VLC_WINDOW_ARGUMENTS,f.file]]]);assert.equal(await fs.readFile(f.file,'utf8'),'original video');
});
test('VLC refuses nonvideos, directories, missing files and links outside Documents',async t=>{
  const f=await fixture(t);const outside=path.join(f.root,'outside.mp4');await fs.writeFile(outside,'outside');const link=path.join(f.folder,'link.mp4');await fs.symlink(outside,link);await fs.mkdir(path.join(f.folder,'directory.mp4'));
  for(const file of [outside,link,path.join(f.folder,'directory.mp4'),path.join(f.folder,'missing.mp4'),path.join(f.folder,'foto.png')])await assert.rejects(f.edit(file));assert.equal(f.calls.length,0);
});
test('VLC launch errors reach Documents without changing video bytes',async t=>{
  const f=await fixture(t);const edit=createVlc({...f.options,launch:async()=>{throw Error('VLC no disponible');}});await assert.rejects(edit(f.file),/VLC no disponible/);assert.equal(await fs.readFile(f.file,'utf8'),'original video');
});
test('VLC opens without video-driven resizing and positions only its own new process',async t=>{
  const f=await fixture(t);let request;
  const edit=createVlc({...f.options,launch:async(executable,args)=>{assert.equal(executable,VLC_EXECUTABLE);assert.equal(args.at(-1),f.file);assert.ok(args.includes('--no-one-instance'));assert.ok(args.includes('--no-qt-video-autoresize'));assert.ok(args.includes('--no-fullscreen'));return 31415;},runWindows:async(action,input)=>{request={action,input};}});
  assert.deepEqual(await edit(f.file),{ok:true});assert.deepEqual(request,{action:'place',input:{processId:31415}});
});
test('placement failure reports a warning while preserving the successful video launch',async t=>{
  const f=await fixture(t);const edit=createVlc({...f.options,launch:async()=>31415,runWindows:async()=>{throw Error('Windows no permitio mover VLC');}});
  const result=await edit(f.file);assert.equal(result.ok,true);assert.match(result.warning,/no permitio/);assert.equal(await fs.readFile(f.file,'utf8'),'original video');
});
test('a missing process identifier never attempts to move unrelated VLC windows',async t=>{
  const f=await fixture(t);let called=false;const edit=createVlc({...f.options,launch:async()=>undefined,runWindows:async()=>{called=true;}});await edit(f.file);assert.equal(called,false);
});

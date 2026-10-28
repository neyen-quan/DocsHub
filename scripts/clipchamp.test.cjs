const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createClipchamp} = require('../electron/clipchamp.cjs');
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'docshub-clipchamp-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const folder=path.join(root,'project');await fs.mkdir(folder);const file=path.join(folder,'video de Rina.MP4');await fs.writeFile(file,'video bytes');
  const requests=[];const options={allowedPath:p=>p===folder||p.startsWith(folder+path.sep),runWindows:async(...args)=>requests.push(args)};
  return {root,folder,file,requests,options,edit:createClipchamp(options)};
}
test('Clipchamp receives the exact authorized video and leaves its bytes untouched',async t=>{
  const f=await fixture(t);assert.deepEqual(await f.edit(f.file),{ok:true});assert.deepEqual(f.requests,[['clipchamp',{file:f.file}]]);assert.equal(await fs.readFile(f.file,'utf8'),'video bytes');assert.deepEqual(await fs.readdir(f.folder),['video de Rina.MP4']);
});
test('folders, nonvideos, relative paths and sources outside Documents are refused',async t=>{
  const f=await fixture(t);await fs.mkdir(path.join(f.folder,'folder.mp4'));
  for(const file of [path.join(f.folder,'foto.png'),'video.mp4',path.join(f.root,'outside.mp4'),path.join(f.folder,'folder.mp4')])await assert.rejects(f.edit(file));
  assert.equal(f.requests.length,0);
});
test('video symlinks cannot escape the authorized folder',async t=>{
  const f=await fixture(t);const outside=path.join(f.root,'outside.mp4');await fs.writeFile(outside,'outside');const link=path.join(f.folder,'linked.mp4');await fs.symlink(outside,link);await assert.rejects(f.edit(link),/habilitadas/);assert.equal(f.requests.length,0);
});
test('native Clipchamp launch errors reach the caller without a program-picker fallback',async t=>{
  const f=await fixture(t);const edit=createClipchamp({...f.options,runWindows:async()=>{throw Error('Clipchamp no instalado');}});await assert.rejects(edit(f.file),/Clipchamp no instalado/);assert.equal(await fs.readFile(f.file,'utf8'),'video bytes');
});

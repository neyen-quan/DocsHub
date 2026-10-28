const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createDocumentEditor} = require('../electron/document-editor.cjs');
const {createDocumentUndo} = require('../electron/document-undo.cjs');
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'docshub-editor-test-')));
  t.after(() => fs.rm(root, {recursive:true,force:true}));
  const folder = path.join(root,'documents'); await fs.mkdir(folder);
  const original = path.join(folder,'foto.png'); await fs.writeFile(original,'original bytes');
  const launches=[], prompts=[], events=[]; let response=1, picked=null;
  const undo=createDocumentUndo(path.join(root,'undo'));
  const options={root:path.join(root,'edits'),allowedPath:file => file===folder || file.startsWith(folder+path.sep),dialog:{showMessageBox:async(_host,options)=>{prompts.push(options);return {response};},showOpenDialog:async()=>picked?{filePaths:[picked]}:{canceled:true}},host:()=>null,undo,queue:fn=>fn(),notify:e=>events.push(e),launch:async(editor,file)=>launches.push({editor,file}),pollMs:0};
  const editor=createDocumentEditor(options);t.after(()=>editor.dispose());
  return {editor,options,root,folder,original,launches,prompts,events,undo,setResponse:v=>response=v,setPicked:v=>picked=v};
}
test('editor receives a separate working file; source stays intact and launch can be cancelled',async t=>{
  const f=await fixture(t);await f.editor.begin(f.original,'paint');
  assert.notEqual(f.launches[0].file,f.original);await fs.writeFile(f.launches[0].file,'edited');
  assert.equal(await fs.readFile(f.original,'utf8'),'original bytes');
  const cancelled=createDocumentEditor({...f.options,root:path.join(f.root,'cancelled'),launch:async()=>false});
  assert.equal((await cancelled.begin(f.original,'fireworks')).cancelled,true);assert.equal(cancelled.list().length,0);
});
test('stable external save prompts once, creates copy beside original, and avoids collisions',async t=>{
  const f=await fixture(t);await f.editor.begin(f.original,'paint');
  await fs.writeFile(f.launches[0].file,'edited');await f.editor.poll();assert.equal(f.prompts.length,0);
  await f.editor.poll();assert.equal(f.prompts.length,1);
  assert.equal(await fs.readFile(path.join(f.folder,'foto - editada.png'),'utf8'),'edited');
  assert.equal(await fs.readFile(f.original,'utf8'),'original bytes');await f.editor.poll();assert.equal(f.prompts.length,1);
  const result=await f.editor.save(f.editor.list()[0].id);assert.equal(path.basename(result.target),'foto - editada (2).png');
});
test('overwrite backs up the source and Ctrl+Z restores its original bytes',async t=>{
  const f=await fixture(t);await f.editor.begin(f.original,'fireworks');await fs.writeFile(f.launches[0].file,'replacement');f.setResponse(0);
  await f.editor.save(f.editor.list()[0].id);assert.equal(await fs.readFile(f.original,'utf8'),'replacement');
  await f.undo.undo();assert.equal(await fs.readFile(f.original,'utf8'),'original bytes');
});
test('cancelled automatic save leaves source unchanged and does not prompt repeatedly',async t=>{
  const f=await fixture(t);await f.editor.begin(f.original,'photos');await fs.writeFile(f.launches[0].file,'edited');f.setResponse(2);
  await f.editor.poll();await f.editor.poll();await f.editor.poll();assert.equal(f.prompts.length,1);assert.equal(await fs.readFile(f.original,'utf8'),'original bytes');
  f.setResponse(1);assert.equal((await f.editor.save(f.editor.list()[0].id)).ok,true);
});
test('external modification to original removes overwrite choice and preserves newer original',async t=>{
  const f=await fixture(t);await f.editor.begin(f.original,'paint');await fs.writeFile(f.launches[0].file,'edited');await fs.writeFile(f.original,'new outside edit');f.setResponse(0);
  const result=await f.editor.save(f.editor.list()[0].id);assert.deepEqual(f.prompts.at(-1).buttons,['Crear copia','Cancelar']);
  assert.notEqual(result.target,f.original);assert.equal(await fs.readFile(f.original,'utf8'),'new outside edit');
});
test('Guardar como accepts selected export, keeps extension and puts copy in original folder',async t=>{
  const f=await fixture(t);await f.editor.begin(f.original,'photos');const saved=path.join(f.root,'export.jpg');await fs.writeFile(saved,'export bytes');f.setPicked(saved);f.setResponse(0);
  const result=await f.editor.save(f.editor.list()[0].id,true);assert.equal(result.target,path.join(f.folder,'foto - editada.jpg'));assert.equal(await fs.readFile(f.original,'utf8'),'original bytes');
});
test('pending editing sessions survive restart and reject unsupported sources and editors',async t=>{
  const f=await fixture(t);await f.editor.begin(f.original,'paint');const next=createDocumentEditor(f.options);assert.deepEqual(next.list(),f.editor.list());
  await assert.rejects(next.begin(f.original,'bad'),/Editor inválido/);
  await assert.rejects(next.begin(path.join(f.root,'outside.png'),'paint'),/habilitada/);
  await assert.rejects(next.begin(path.join(f.folder,'file.exe'),'paint'),/imagen/);
});
test('closing an editor without saves silently ends tracking, with no confirmation',async t=>{
  const f=await fixture(t);await f.editor.begin(f.original,'paint');
  await f.editor.editorClosed(f.editor.list()[0].id);
  assert.equal(f.editor.list().length,0);assert.equal(f.prompts.length,0);
  assert.equal(await fs.readFile(f.original,'utf8'),'original bytes');
});
test('last save followed immediately by close is imported before silent finalization',async t=>{
  const f=await fixture(t);await f.editor.begin(f.original,'paint');await fs.writeFile(f.launches[0].file,'last saved bytes');
  await f.editor.editorClosed(f.editor.list()[0].id);
  assert.equal(f.editor.list().length,0);assert.equal(f.prompts.length,1);assert.equal(f.prompts[0].title,'Guardar edición en DocsHub');
  assert.equal(await fs.readFile(path.join(f.folder,'foto - editada.png'),'utf8'),'last saved bytes');
});
test('already saved changes are not reimported on close; export next to working copy imports once',async t=>{
  const f=await fixture(t);await f.editor.begin(f.original,'photos');
  const session=f.editor.list()[0], exported=path.join(path.dirname(f.launches[0].file),'foto-exportada.jpg');await fs.writeFile(exported,'export');
  f.setPicked(exported);f.setResponse(0);await f.editor.save(session.id,true);
  await f.editor.editorClosed(session.id);assert.equal(f.prompts.length,1);assert.equal(f.editor.list().length,0);
  assert.equal(await fs.readFile(path.join(f.folder,'foto - editada.jpg'),'utf8'),'export');
});
test('closing after choosing Cancelar at save does not leave a pending session',async t=>{
  const f=await fixture(t);await f.editor.begin(f.original,'paint');await fs.writeFile(f.launches[0].file,'edited');f.setResponse(2);
  await f.editor.editorClosed(f.editor.list()[0].id);assert.equal(f.editor.list().length,0);assert.equal(await fs.readFile(f.original,'utf8'),'original bytes');assert.equal(f.prompts.length,1);
});
test('window watcher close callback finalizes automatically and unsubscribes',async t=>{
  const f=await fixture(t);let closed,stopped=0;
  const editor=createDocumentEditor({...f.options,watchEditor:(_session,callback)=>{closed=callback;return ()=>stopped++;}});
  await editor.begin(f.original,'paint');assert.equal(typeof closed,'function');closed();
  for(let i=0;i<100&&editor.list().length;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(editor.list().length,0);assert.equal(stopped,1);assert.equal(f.prompts.length,0);editor.dispose();
});

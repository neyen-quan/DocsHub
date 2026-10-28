const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {EventEmitter}=require('node:events');
const {createGptClipboard}=require('../electron/gpt-clipboard.cjs');
const bytes=Buffer.from('test image bytes');
function mockClipboard(image=true){return {async read(){return image?[{types:['image/png'],getType:async()=>({arrayBuffer:async()=>bytes})}]:[{types:['text/plain']}];}};}
async function setup(t,{image=true,mode='ready',objectId='input-node'}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'workhub2-test-'));
 const wc=new EventEmitter(),calls=[],statuses=[];let allowed=true,fail=false;
 Object.assign(wc,{isDestroyed:()=>false,executeJavaScript:async expression=>expression.includes('Boolean(')?false:mode,focus:()=>calls.push(['focus']),paste:()=>calls.push(['paste']),debugger:{isAttached:()=>true,attach(){},async sendCommand(name,args){calls.push([name,args]);if(name==='Runtime.evaluate')return {result:{objectId}};if(name==='DOM.setFileInputFiles'&&fail)throw Error('fixture failure');}}});
 const view={webContents:wc};const ctrl=createGptClipboard({clipboard:mockClipboard(image),tempRoot:()=>root,getView:id=>id==='gpt'?view:null,isAllowed:()=>allowed,notify:(id,result)=>statuses.push({id,...result})});
 t.after(async()=>{ctrl.cleanup();await fs.rm(root,{recursive:true,force:true});});
 return {root,wc,view,calls,statuses,ctrl,disallow:()=>allowed=false,fail:()=>fail=true};
}
const key={type:'keyDown',key:'v',control:true};
const tick=()=>new Promise(r=>setTimeout(r,20));
test('future async clipboard item becomes a correctly named image file, with no clipboard write',async t=>{
 const h=await setup(t);assert.equal((await h.ctrl.pasteImage('gpt')).ok,true);
 const command=h.calls.find(([name])=>name==='DOM.setFileInputFiles');assert.ok(command);const file=command[1].files[0];assert.match(file,/Captura-\d+\.png$/);assert.deepEqual(await fs.readFile(file),bytes);
 assert.equal(h.calls.filter(([name])=>name==='paste').length,0);h.ctrl.cleanup();assert.deepEqual(await fs.readdir(h.root),[]);
});
test('missing screenshot returns a useful error without creating temporary files',async t=>{
 const h=await setup(t,{image:false});assert.match((await h.ctrl.pasteImage('gpt')).error,/No hay una imagen/);assert.deepEqual(await fs.readdir(h.root),[]);
});
test('inactive or unauthenticated destinations never receive an image',async t=>{
 const h=await setup(t);h.disallow();assert.equal((await h.ctrl.pasteImage('gpt')).ok,false);assert.equal(h.calls.length,0);
});
test('search inputs retain native paste and cannot attach to the composer',async t=>{
 const h=await setup(t,{mode:'other-input'});assert.equal((await h.ctrl.pasteImage('gpt',{shortcut:true})).native,true);assert.equal(h.calls.filter(([name])=>name==='paste').length,1);assert.ok(!h.calls.some(([name])=>name==='DOM.setFileInputFiles'));
});
test('an unavailable composer fails clearly without focusing or attaching',async t=>{
 const h=await setup(t,{mode:'not-ready'});assert.match((await h.ctrl.pasteImage('gpt')).error,/cuadro de mensaje/);assert.ok(!h.calls.some(([name])=>name==='DOM.setFileInputFiles'));
});
test('a missing file selector retains native image paste instead of swallowing it',async t=>{
 const h=await setup(t,{objectId:null});const result=await h.ctrl.pasteImage('gpt');assert.equal(result.ok,true);assert.match(result.message,/pegado normal/);assert.ok(h.calls.some(([name])=>name==='paste'));
});
test('failed delivery removes its temporary image and permits a retry',async t=>{
 const h=await setup(t);h.fail();assert.equal((await h.ctrl.pasteImage('gpt')).ok,false);assert.deepEqual(await fs.readdir(h.root),[]);assert.ok(!/anterior/.test((await h.ctrl.pasteImage('gpt')).error));
});
test('concurrent button requests cannot attach a screenshot twice',async t=>{
 const h=await setup(t);const results=await Promise.all([h.ctrl.pasteImage('gpt'),h.ctrl.pasteImage('gpt')]);assert.equal(results.filter(r=>r.ok).length,1);assert.equal(h.calls.filter(([name])=>name==='DOM.setFileInputFiles').length,1);
});
test('Ctrl+V text uses exactly one native paste, preserving normal text behavior',async t=>{
 const h=await setup(t,{image:false});h.ctrl.install('gpt',h.wc);let prevented=0;h.wc.emit('before-input-event',{preventDefault:()=>prevented++},key);await tick();assert.equal(prevented,1);assert.deepEqual(h.calls,[['paste']]);
});
test('Documents and editable host fields keep their original key event and no image forwarding',async t=>{
 const h=await setup(t);const host=new EventEmitter();host.executeJavaScript=async()=>true;h.ctrl.installHost(host,()=> 'gpt');let prevented=0;host.emit('before-input-event',{preventDefault:()=>prevented++},key);await tick();assert.equal(prevented,0);assert.equal(h.calls.length,0);
});

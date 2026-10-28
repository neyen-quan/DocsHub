const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const {createWindowsEditorLauncher,fireworksScript,fireworksFileURL} = require('../electron/windows-editor-launcher.cjs');
test('Fireworks 8 script opens the exact image and acknowledges successful loading',()=>{
  const file='C:\\Fixtures\\Álbum\\Fotos & pruebas\\Choker "Rina".png', receipt='C:\\work\\opened.txt';
  let opened, output, closed=false;
  const script=fireworksScript(file,receipt);
  assert.equal(/[^\x00-\x7f]/.test(script),false,'script remains compatible with the old engine encoding');
  vm.runInNewContext(script,{fw:{openDocument:(...args)=>{opened=args;return {};}},Files:{open:(url,write)=>{assert.equal(url,fireworksFileURL(receipt));assert.equal(write,true);return {write:v=>output=v,close:()=>closed=true};}}});
  assert.deepEqual([...opened],[fireworksFileURL(file),false,false]);assert.equal(output,'ok');assert.equal(closed,true);
  assert.equal(fireworksFileURL('C:\\Fotos\\a.png'),'file:///C|/Fotos/a.png');
  assert.equal(fireworksFileURL('\\\\server\\Fotos\\a.png'),'file://server/Fotos/a.png');
});
test('Fireworks refusal is reported instead of claiming a successful image open',()=>{
  let output;
  vm.runInNewContext(fireworksScript('C:\\x.avif','C:\\ack.txt'),{fw:{openDocument:()=>null},Files:{open:()=>({write:v=>output=v,close:()=>{}})}});
  assert.match(output,/^error:/);
});
test('Fireworks launch sends a command script, waits for receipt and targets working copy',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'docshub-launch-test-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const file=path.join(directory,'foto de prueba.png');await fs.writeFile(file,'working');let request;
  const launch=createWindowsEditorLauncher({runWindows:async(action,args)=>{
    request={action,...args};const script=await fs.readFile(args.script,'ascii');let receipt;
    vm.runInNewContext(script,{fw:{openDocument:url=>{assert.equal(url,fireworksFileURL(file));return {}; }},Files:{open:url=>{receipt=decodeURI(url.replace(/^file:\/\/\/([a-z])\|/i,'$1:').replace(/^file:\/\//,''));return {write:v=>require('node:fs').writeFileSync(receipt,v),close:()=>{}};}}});
  }});
  assert.equal(await launch('fireworks',file,'C:\\Fireworks 8\\Fireworks.exe'),true);assert.equal(request.action,'fireworks');assert.match(request.script,/\.jsf$/);assert.equal(request.executable,'C:\\Fireworks 8\\Fireworks.exe');
});
test('a missing Fireworks receipt fails clearly rather than succeeding on process start',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'docshub-launch-timeout-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const launch=createWindowsEditorLauncher({runWindows:async()=>{},timeoutMs:1,pause:async()=>{}});
  await assert.rejects(launch('fireworks',path.join(directory,'foto.png'),'fw.exe'),/no confirmó/);
});
test('Paint delegates automatic Windows discovery without choosing an executable',async()=>{
  const calls=[];const launch=createWindowsEditorLauncher({runWindows:async(...args)=>calls.push(args)});
  assert.equal(await launch('paint','C:\\Fotos\\foto.png'),true);assert.deepEqual(calls,[['paint',{file:'C:\\Fotos\\foto.png'}]]);
});

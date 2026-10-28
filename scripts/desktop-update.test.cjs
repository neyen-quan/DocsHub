const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {spawn,spawnSync}=require('node:child_process');const zlib=require('node:zlib');
const engine=require('../compat/legacy-update-engine.cjs');
function zip(entries){let offset=0;const locals=[],central=[];for(const [name,content]of entries){const n=Buffer.from(name),b=Buffer.from(content),packed=zlib.deflateRawSync(b),crc=engine.crc32(b),l=Buffer.alloc(30),c=Buffer.alloc(46);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(0x800,6);l.writeUInt16LE(8,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(packed.length,18);l.writeUInt32LE(b.length,22);l.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(8,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(packed.length,20);c.writeUInt32LE(b.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);locals.push(l,n,packed);central.push(c,n);offset+=30+n.length+packed.length;}const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,cd,end]);}
function patch(changes={},mutate=m=>m){const files={'package.json':JSON.stringify({name:'workhub2-desktop',version:'0.1.35',main:'electron/main.cjs'}),...changes};let m={appId:engine.APP_ID,format:1,version:'0.1.35',fromVersions:['0.1.34'],files:Object.entries(files).map(([p,b])=>({path:p,size:Buffer.byteLength(b),sha256:engine.sha(b)}))};m=mutate(m);return zip([['docshub-patch.json',JSON.stringify(m)],...Object.entries(files)]);}
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'DocsHub update á space '));t.after(()=>fs.promises.rm(root,{recursive:true,force:true,maxRetries:20,retryDelay:100}));fs.mkdirSync(path.join(root,'electron'),{recursive:true});fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'workhub2-desktop',version:'0.1.34',main:'electron/main.cjs'}));fs.writeFileSync(path.join(root,'electron/main.cjs'),"require('node:fs').writeFileSync(require('node:path').join(__dirname,'../old-opened'),'yes');");return root;}
test('accepts a complete compressed patch and compares semantic numeric versions',()=>{const p=engine.validatePatch(patch({'dist/index.html':'hello'}),'0.1.34');assert.equal(p.files.get('dist/index.html').toString(),'hello');assert.equal(engine.newer('0.1.100','0.1.99'),true);});
test('rejects another app, wrong base, downgrade, legacy ZIP and corrupted payload before writing',()=>{
 for(const mutate of [m=>({...m,appId:'workhub'}),m=>({...m,fromVersions:['0.1.32']}),m=>({...m,version:'0.1.33'}),m=>({...m,files:m.files.map(f=>({...f,sha256:'0'.repeat(64)}))})])assert.throws(()=>engine.validatePatch(patch({},mutate),'0.1.34'));
 assert.throws(()=>engine.validatePatch(zip([['package.json','{}']]),'0.1.34'),/nuevo actualizador/);
 const bad=patch();bad[50]^=1;assert.throws(()=>engine.validatePatch(bad,'0.1.34'));
});
test('rejects traversal, absolute paths, device names, duplicates, protected bootstrap and profile/runtime writes',()=>{
 for(const name of ['../evil','/absolute','C:/evil','assets/NUL.png','assets/a.','assets/a\\b'])assert.throws(()=>engine.unzip(zip([[name,'bad']])));
 assert.throws(()=>engine.unzip(zip([['assets/A','a'],['assets/a','b']])));
 for(const name of ['runtime/Workhub2.exe','cuentas-rina/cuentas-rina.json','browser/preferences','electron/desktop-bootstrap.cjs'])assert.throws(()=>engine.validatePatch(patch({[name]:'x'}),'0.1.34'));
});
test('applies, then rolls back every overwritten and newly created file without touching data',t=>{
 const root=fixture(t);fs.writeFileSync(path.join(root,'cuentas-rina.json'),'expenses');
 const pending=engine.prepare(root,patch({'electron/main.cjs':'new code','assets/new.txt':'new asset'}),'0.1.34');
 const j=JSON.parse(fs.readFileSync(path.join(pending.job,'journal.json')));
 engine.apply(pending.job,j);assert.equal(fs.readFileSync(path.join(root,'electron/main.cjs'),'utf8'),'new code');engine.rollback(pending.job,j);
 assert.match(fs.readFileSync(path.join(root,'electron/main.cjs'),'utf8'),/old-opened/);assert.equal(fs.existsSync(path.join(root,'assets/new.txt')),false);assert.equal(fs.readFileSync(path.join(root,'cuentas-rina.json'),'utf8'),'expenses');assert.equal(JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version,'0.1.34');
});
test('failed partial replacement and tampered staging are recoverable',t=>{
 const root=fixture(t);const p=engine.prepare(root,patch({'assets/a':'1','assets/b':'2'}),'0.1.34'),j=JSON.parse(fs.readFileSync(path.join(p.job,'journal.json')));
 assert.throws(()=>engine.apply(p.job,j,()=>{throw Error('simulated disk error');}));engine.rollback(p.job,j);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version,'0.1.34');
 fs.writeFileSync(path.join(p.job,'stage/package.json'),'tampered');assert.throws(()=>engine.apply(p.job,j),/preparado cambió/);
});
test('stable bootstrap repairs an interrupted patch before any app module is loaded',t=>{
 const root=fixture(t),p=engine.prepare(root,patch({'electron/main.cjs':'broken syntax !','assets/new.txt':'x'}),'0.1.34'),j=JSON.parse(fs.readFileSync(path.join(p.job,'journal.json')));engine.apply(p.job,j);
 fs.copyFileSync(path.join(__dirname,'../electron/desktop-bootstrap.cjs'),path.join(root,'electron/desktop-bootstrap.cjs'));
 const run=spawnSync(process.execPath,['-e',"require(process.argv[1]).recover()",path.join(root,'electron/desktop-bootstrap.cjs')],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.match(fs.readFileSync(path.join(root,'electron/main.cjs'),'utf8'),/old-opened/);assert.equal(fs.existsSync(path.join(root,'.docshub-updates/active.json')),false);assert.equal(fs.existsSync(path.join(root,'assets/new.txt')),false);
});
test('symlink targets are refused and pending transactions cannot be replaced',t=>{
 const root=fixture(t);fs.symlinkSync(os.tmpdir(),path.join(root,'assets'),process.platform==='win32'?'junction':'dir');assert.throws(()=>engine.prepare(root,patch({'assets/a':'a'}),'0.1.34'),/enlaces/);
 fs.unlinkSync(path.join(root,'assets'));engine.prepare(root,patch(),'0.1.34');assert.throws(()=>engine.prepare(root,patch(),'0.1.34'),/pendiente/);
});
async function waitFor(file){const deadline=Date.now()+10000;while(!fs.existsSync(file)){if(Date.now()>deadline)throw Error('worker timed out: '+file);await new Promise(r=>setTimeout(r,30));}return JSON.parse(fs.readFileSync(file));}
for(const healthy of [true,false])test('real detached worker '+(healthy?'commits only after renderer receipt':'rolls back a failed startup and relaunches the old app'),async t=>{
 const root=fixture(t);const code=healthy?"const fs=require('node:fs'),path=require('node:path');const id=process.env.DOCSHUB_UPDATE_JOB;fs.writeFileSync(path.join(__dirname,'../.docshub-updates',id,'healthy.json'),JSON.stringify({id,version:'0.1.35'}));setTimeout(()=>{},2000);":"process.exit(1);";
 const p=engine.prepare(root,patch({'electron/main.cjs':code}),'0.1.34');const parent=spawn(process.execPath,['-e','setTimeout(()=>{},300)'],{stdio:'ignore'});
 const worker=spawn(process.execPath,[path.join(p.job,'worker.cjs'),String(parent.pid),process.execPath],{stdio:'ignore'});t.after(()=>{try{worker.kill();}catch{}});
 const result=await waitFor(path.join(root,'.docshub-updates/result.json'));assert.equal(result.ok,healthy);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version,healthy?'0.1.35':'0.1.34');
 if(!healthy){const deadline=Date.now()+3000;while(!fs.existsSync(path.join(root,'old-opened'))&&Date.now()<deadline)await new Promise(r=>setTimeout(r,30));assert.ok(fs.existsSync(path.join(root,'old-opened')));}
});
module.exports={zip,patch};

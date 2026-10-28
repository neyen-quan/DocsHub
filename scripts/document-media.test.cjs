const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {createDocumentMedia}=require('../electron/document-media.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'workhub2-media-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'foto con espacios.jpg');fs.writeFileSync(file,'jpg-fixture');const allowed=p=>p===root||p.startsWith(root+path.sep);let decodes=0;const image={isEmpty:()=>false,getSize:()=>({width:640,height:480}),resize:()=>image,toDataURL:()=> 'data:image/png;base64,preview'};const nativeImage={createThumbnailFromPath:async()=>{decodes++;return image;},createFromPath:()=>image};return{root,file,nativeImage,image,allowed,decodes:()=>decodes};}
test('image preview is cached and invalidated after the original file changes',async t=>{const h=fixture(t);const media=createDocumentMedia({nativeImage:h.nativeImage,allowedPath:h.allowed});const preview=await media.thumbnail(h.file);assert.match(preview.src,/^data:image/);await media.thumbnail(h.file);assert.equal(h.decodes(),1);fs.appendFileSync(h.file,'updated');await media.thumbnail(h.file);assert.equal(h.decodes(),2);});
test('parallel panels request the same thumbnail only once',async t=>{const h=fixture(t);const media=createDocumentMedia({nativeImage:h.nativeImage,allowedPath:h.allowed});await Promise.all([media.thumbnail(h.file),media.thumbnail(h.file)]);assert.equal(h.decodes(),1);});
test('unsupported files and inaccessible images produce a fallback without a decoder request',async t=>{const h=fixture(t);const file=path.join(h.root,'document.txt');fs.writeFileSync(file,'text');const media=createDocumentMedia({nativeImage:h.nativeImage,allowedPath:h.allowed});assert.deepEqual(await media.thumbnail(file),{src:null});assert.deepEqual(await media.thumbnail(path.join(h.root,'missing.jpg')),{src:null});assert.equal(h.decodes(),0);});
test('corrupt images fall back to the file icon',async t=>{const h=fixture(t);const media=createDocumentMedia({nativeImage:{createThumbnailFromPath:async()=>{throw Error('no thumbnail');},createFromPath:()=>({isEmpty:()=>true})},allowedPath:h.allowed});assert.deepEqual(await media.thumbnail(h.file),{src:null});});
test('external drag sends real paths for the entire selection, deduplicating duplicates',t=>{const h=fixture(t);const second=path.join(h.root,'otra imagen.png');fs.writeFileSync(second,'png');const media=createDocumentMedia({nativeImage:h.nativeImage,allowedPath:h.allowed});let payload;assert.equal(media.startExternalDrag({startDrag:p=>payload=p},[h.file,second,h.file],h.image),2);assert.deepEqual(payload.files,[h.file,second]);assert.equal(payload.icon,h.image);assert.equal(fs.readFileSync(h.file,'utf8'),'jpg-fixture');});
test('an invalid selection is rejected atomically before any drag starts',t=>{const h=fixture(t);let started=false;const media=createDocumentMedia({nativeImage:h.nativeImage,allowedPath:h.allowed});assert.throws(()=>media.startExternalDrag({startDrag:()=>started=true},[h.file,h.root],h.image),/no carpetas/);assert.equal(started,false);});
test('external drag and preview cannot follow a symlink outside the chosen folder',async t=>{const h=fixture(t);const outside=fs.mkdtempSync(path.join(os.tmpdir(),'workhub2-outside-'));t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));const secret=path.join(outside,'outside.jpg');fs.writeFileSync(secret,'outside');const link=path.join(h.root,'link.jpg');try{fs.symlinkSync(secret,link);}catch(error){if(error.code==='EPERM'){t.skip('Symlink creation requires OS permission');return;}throw error;}const media=createDocumentMedia({nativeImage:h.nativeImage,allowedPath:h.allowed});assert.deepEqual(await media.thumbnail(link),{src:null});assert.throws(()=>media.startExternalDrag({startDrag(){}},[link],h.image),/fuera/);});
test('video previews persist across app restarts and are regenerated after the file changes',async t=>{
 const h=fixture(t),file=path.join(h.root,'video con espacios.MP4'),cacheDirectory=path.join(h.root,'cache');fs.writeFileSync(file,'video');
 const options={nativeImage:h.nativeImage,allowedPath:h.allowed,cacheDirectory};const first=createDocumentMedia(options);
 await Promise.all([first.thumbnail(file),first.thumbnail(file)]);assert.equal(h.decodes(),1);
 const second=createDocumentMedia(options);assert.match((await second.thumbnail(file)).src,/^data:image/);assert.equal(h.decodes(),1);
 fs.appendFileSync(file,'changed');await second.thumbnail(file);assert.equal(h.decodes(),2);assert.equal(fs.readFileSync(file,'utf8'),'videochanged');
});
test('unavailable video codecs fall back without trying to decode the movie as a still image',async t=>{
 const h=fixture(t),file=path.join(h.root,'corrupt.mp4');fs.writeFileSync(file,'corrupt');let calls=0;
 const media=createDocumentMedia({nativeImage:{createThumbnailFromPath:async()=>{throw Error('Unsupported codec');},createFromPath:()=>{calls++;throw Error('Not an image');}},allowedPath:h.allowed});
 assert.deepEqual(await media.thumbnail(file),{src:null});assert.equal(calls,0);assert.equal(fs.readFileSync(file,'utf8'),'corrupt');
});
test('video extraction is limited to two concurrent jobs',async t=>{
 const h=fixture(t);let active=0,peak=0;const releases=[];
 const nativeImage={...h.nativeImage,createThumbnailFromPath:async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>releases.push(resolve));active--;return h.image;}};
 const media=createDocumentMedia({nativeImage,allowedPath:h.allowed});const jobs=[];
 for(let i=0;i<5;i++){const file=path.join(h.root,`${i}.webm`);fs.writeFileSync(file,'video');jobs.push(media.thumbnail(file));}
 for(let i=0;i<5;i++){while(!releases.length)await new Promise(resolve=>setImmediate(resolve));releases.shift()();}
 await Promise.all(jobs);assert.equal(peak,2);
});
test('damaged on-disk preview cache is regenerated without touching the video',async t=>{
 const h=fixture(t),file=path.join(h.root,'video.mov'),cacheDirectory=path.join(h.root,'cache');fs.writeFileSync(file,'video');const options={nativeImage:h.nativeImage,allowedPath:h.allowed,cacheDirectory};await createDocumentMedia(options).thumbnail(file);
 fs.writeFileSync(path.join(cacheDirectory,fs.readdirSync(cacheDirectory)[0]),'broken json');await createDocumentMedia(options).thumbnail(file);assert.equal(h.decodes(),2);assert.equal(fs.readFileSync(file,'utf8'),'video');
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const {preloadOption}=require('../tools/lib/node-preload.cjs');
test('quoted NODE_OPTIONS preloads retain Windows separators and spaces',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'DocsHub preload '));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'hook.cjs');fs.writeFileSync(file,"process.env.DOCSHUB_PRELOAD_TEST='loaded';");
 assert.equal(preloadOption('D:\\a\\some space\\hook.cjs'),'--require '+JSON.stringify('D:/a/some space/hook.cjs'));
 const result=execFileSync(process.execPath,['-e',"console.log(process.env.DOCSHUB_PRELOAD_TEST)"],{env:{...process.env,NODE_OPTIONS:preloadOption(file)},encoding:'utf8'});assert.equal(result.trim(),'loaded');
});

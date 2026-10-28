const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../electron/main.cjs'),'utf8');
function selected(displays,primary){
  const ctx=vm.createContext({screen:{getAllDisplays:()=>displays,getPrimaryDisplay:()=>primary}});
  vm.runInContext(source.slice(source.indexOf('function startupDisplay()'),source.indexOf('function showWindow()')),ctx);
  return ctx.startupDisplay();
}
const monitor=(id,x,width=1920)=>({id,bounds:{x,y:0,width,height:1080},workArea:{x,y:0,width,height:1040}});
test('three monitors start in the center regardless of enumeration and negative coordinates',()=>{
 const left=monitor(1,-1920),center=monitor(2,0),right=monitor(3,1920);
 assert.equal(selected([right,left,center],right),center);
});
test('one monitor and even monitor counts use the available or primary monitor',()=>{
 const left=monitor(1,-1920),right=monitor(2,0);
 assert.equal(selected([left],left),left);
 assert.equal(selected([right,left],right),right);
});
test('five different-sized monitors choose the spatial middle',()=>{
 const displays=[monitor(1,-3200,1280),monitor(2,-1920),monitor(3,0,2560),monitor(4,2560),monitor(5,4480)];
 assert.equal(selected(displays.reverse(),displays[0]).id,3);
});
test('DocsHub keeps the existing data directory and provider partitions',()=>{
 assert.match(source,/app\.setName\('DocsHub'\)/);
 assert.match(source,/APP_DATA_DIRECTORY = 'Neyen\.Workhub2'/);
 assert.match(source,/app\.setAppUserModelId\('agency\.neyen\.workhub2'\)/);
 assert.ok(source.includes('persist:workhub2-${sessionProfile}'));
});

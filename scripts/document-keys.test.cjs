const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/main.jsx'),'utf8');
function pane(stack){
 const calls=[],state={stack:[...stack]},ctx={calls,activeFolder:'project',activeStack:state.stack,goBack:()=>{state.stack=state.stack.slice(0,-1);calls.push('back');},refreshFolder:()=>{calls.push('refresh');return Promise.resolve();},setDocumentStatus:()=>{},HTMLInputElement:class{},HTMLTextAreaElement:class{},selected:['folder'],selectedItems:()=>[{directory:true,path:'child'}],openDocument:item=>calls.push('open:'+item.path),deleteDocumentSelection:()=>calls.push('delete')};
 const start=source.indexOf('    const handleDocumentKeys = event => {'),end=source.indexOf('    const onDropOver = event => {',start);vm.runInNewContext(source.slice(start,end)+'\nthis.key=handleDocumentKeys;',ctx);
 function key(extra={}){const event={key:'Backspace',target:{closest:()=>null},currentTarget:{focus:()=>calls.push('focus')},preventDefault:()=>calls.push('prevent'),stopPropagation:()=>calls.push('stop'),...extra};ctx.key(event);return calls;}
 return {state,calls,key};
}
test('Backspace goes back only in the focused document pane and restores its keyboard focus',()=>{
 const left=pane(['a','a/b']),middle=pane(['x','x/y']),right=pane(['z']);middle.key();assert.deepEqual(middle.state.stack,['x']);assert.deepEqual(left.state.stack,['a','a/b']);assert.deepEqual(right.state.stack,['z']);assert.deepEqual(middle.calls,['prevent','stop','focus','back']);
 const tree=pane(['parent','child']);tree.key({target:{closest:selector=>selector==='.file-sidebar'?{}:null}});assert.ok(tree.calls.includes('back'));
});
test('root and key repetition never leave DocsHub or skip multiple folders',()=>{
 const root=pane([]);root.key();assert.deepEqual(root.calls,['prevent','stop']);const held=pane(['a','b']);held.key({repeat:true});assert.deepEqual(held.state.stack,['a','b']);assert.ok(!held.calls.includes('back'));
});
test('Backspace keeps native editing, modifier shortcuts and composition untouched',()=>{
 for(const extra of [{target:{isContentEditable:true,closest:()=>null}},{target:{closest:()=>({tagName:'INPUT'})}},{target:{closest:()=>({tagName:'TEXTAREA'})}},{target:{closest:()=>({tagName:'SELECT'})}},{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{isComposing:true},{nativeEvent:{isComposing:true}},{defaultPrevented:true}]){const p=pane(['a']);p.key(extra);assert.deepEqual(p.calls,[]);assert.deepEqual(p.state.stack,['a']);}
});
test('F5 refreshes, Enter opens the selected folder and Delete retains its file action',()=>{
 const p=pane(['a']);p.key({key:'F5'});assert.ok(p.calls.includes('refresh'));p.key({key:'Enter'});assert.ok(p.calls.includes('open:child'));p.key({key:'Delete'});assert.ok(p.calls.includes('delete'));assert.ok(!p.calls.includes('back'));
});

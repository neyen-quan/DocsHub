const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');
const path=require('node:path');
const source=fs.readFileSync(process.env.WORKHUB2_TEST_SOURCE || path.join(__dirname,'../electron/main.cjs'),'utf8');
const uiSource=fs.readFileSync(path.join(__dirname,'../src/main.jsx'),'utf8');
const A='ai-chat-personal-1::gpt-personal', B='ai-chat-personal-2::gpt-personal', C='ai-chat-gemini-2::gemini-personal', D='ai-chat-personal-3::gpt-personal', G='ai-chat-gemini::gemini-personal';
function harness(){
  const events=[],operations=[];
  class Contents extends EventEmitter {
    constructor(){super();this.loads=[];this.styles=[];this.session={};this.debugger={isAttached:()=>true,sendCommand:async()=>{}};}
    focus(){this.focused=true;this.focusCalls=(this.focusCalls||0)+1;} getUserAgent(){return this.ua || 'Electron/default';} insertCSS(css,options){this.styles.push({css,options});return Promise.resolve('style-key');}
    isDestroyed(){return false;} setUserAgent(value){this.ua=value;} setWindowOpenHandler(handler){this.windowOpenHandler=handler;} setAudioMuted(){}
    loadURL(url){this.loads.push(url);return Promise.resolve();}
  }
  class View{
    constructor(options){this.options=options;this.webContents=new Contents();this.rect={x:0,y:0,width:0,height:0};}
    setBounds(rect){operations.push(['bounds',this,{...rect}]);this.rect={...rect};}
    getBounds(){return {...this.rect};} setBackgroundColor(){}
  }
  const host={children:[],addChildView(view,index){operations.push(['add',view,index]);this.children=this.children.filter(v=>v!==view);if(Number.isInteger(index))this.children.splice(Math.max(0,Math.min(index,this.children.length)),0,view);else this.children.push(view);},removeChildView(view){operations.push(['remove',view]);this.children=this.children.filter(v=>v!==view);}};
  const context=vm.createContext({WebContentsView:View,path,process,URL,setImmediate,__dirname:path.join(__dirname,'../electron'),
    shell:{openExternal(){}},win:{contentView:host,getContentBounds:()=>({width:1200,height:900}),webContents:{send:(...args)=>events.push(args)}},
    metadataDownloads:{install(){}},gptClipboard:{install(){}},lastGptViewId:null,applyRemoteTheme(){},configureNotificationPermissions(){},isMessagingService:()=>false,installResizableSidebar(){},installWhatsAppSidebarResize(){},publishSplitRatios(){}});
  vm.runInContext(`let remoteViews=new Map(),currentViews=[],loadedViewTargets=new Map(),currentAiTargets={},currentTheme='dark',workMode=false;
  let currentLayoutIds=[],currentSplitIds=null,currentSplitRatio=50,currentSplitRatio2=66.67,currentAiLayoutIds=null,currentAiRatios={x:50,y:50},contentTop=130;
  let microRefreshView=null,microRefreshAttached=false,currentMicroRefreshViewId=null,splitterXView=null,splitterX2View=null,splitterYView=null;
  let splitterXAttached=false,splitterX2Attached=false,splitterYAttached=false,splitterDraggingAxis=null;
  const sites={metadata:'https://killexif.com/es/','gpt-personal':'https://chatgpt.com/','gpt-alterframe':'https://chatgpt.com/','gemini-personal':'https://gemini.google.com/app?hl=es-419'};
  ${source.slice(source.indexOf('function validatedAiTarget('),source.indexOf('function showWindow('))}
  ${source.slice(source.indexOf('async function navigateGoogleConnection('),source.indexOf("ipcMain.handle('google-connection-view'"))}
  globalThis.api={google:navigateGoogleConnection,layout:(ids,targets={},mixed=false)=>layoutViews(ids,win.getContentBounds(),mixed?ids:null,50,mixed?null:ids,{x:50,y:50},targets),view:id=>remoteViews.get(id),target:(id,service,target)=>{currentAiTargets={[id]:target};return validatedAiTarget(id,service);},resize:resizeCurrentSplitViews,rects:()=>currentViews.map(v=>v.getBounds())};`,context);
  return {...context.api,events,operations,host};
}
test('SPA navigation persisted to renderer must not reload its document',()=>{
 const h=harness();h.layout([A]);const v=h.view(A);
 v.webContents.emit('did-navigate-in-page',{},'https://chatgpt.com/c/workhub',true);
 h.layout([A,B],{[A]:'https://chatgpt.com/c/workhub'});
 assert.equal(v.webContents.loads.length,1,'saving a visited URL triggered a second loadURL');
});
test('stale snapshots and two simultaneous navigations never replay old chat URLs',()=>{
 const h=harness();h.layout([A,B]);
 for(const id of [A,B])h.view(id).webContents.emit('did-navigate-in-page',{},`https://chatgpt.com/c/${id[8]}`,true);
 for(let i=0;i<12;i++)h.layout(i%2?[A]:[A,B],{[A]:i%2?'https://chatgpt.com/':'https://chatgpt.com/c/new',[B]:'https://chatgpt.com/c/other'});
 for(const id of [A,B])assert.equal(h.view(id).webContents.loads.length,1);
});
test('visible GPT stays attached and is never resized to zero when adding a sibling',()=>{
 const h=harness();h.layout([A]);const v=h.view(A);h.operations.length=0;h.layout([A,B]);
 assert.ok(!h.operations.some(([op,view,rect])=>view===v&&(op==='remove'||op==='bounds'&&(!rect.width||!rect.height))));
});
test('stale native GPT views cannot sit above the active panel and steal search clicks',()=>{
 const h=harness();h.layout([A,B,C]);h.layout([A,B]);
 const a=h.view(A),b=h.view(B),stale=h.view(C);
 stale.setBounds({x:0,y:130,width:1200,height:745});
 // Simulate Electron retaining a previously selected remote view at the top
 // of its native z stack after the visible layout has changed.
 h.host.addChildView(stale);
 h.layout([A,B]);
 assert.ok(!h.host.children.includes(stale),'inactive remote view remained attached');
 assert.deepEqual(h.host.children.slice(0,2),[a,b],'active views were not restored to canonical stacking order');
 const point={x:100,y:160};
 const hit=[...h.host.children].reverse().find(view=>{const r=view.getBounds();return point.x>=r.x&&point.x<r.x+r.width&&point.y>=r.y&&point.y<r.y+r.height;});
 assert.equal(hit,a,'a stale or overlapping native view intercepted the click on the first GPT panel');
});
test('providers and 1–4 subpanels retain separate contents and fit the viewport',()=>{
 const h=harness();for(const ids of [[A],[A,B],[A,C,D],[A,B,C,D],[D],[A,B]]){
 h.layout(ids);h.resize();const views=ids.map(id=>h.view(id));assert.equal(new Set(views).size,ids.length);
 for(const r of h.rects()){assert.ok(r.x>=0&&r.y>=130&&r.x+r.width<=1200&&r.y+r.height<=875);}
 for(let i=0;i<views.length;i++)for(let j=i+1;j<views.length;j++){
 const a=views[i].getBounds(),b=views[j].getBounds();assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y);
 }
 }
 for(const id of [A,B,C,D])assert.equal(h.view(id).webContents.loads.length,1);
 assert.equal(h.view(A).options.webPreferences.partition,h.view(B).options.webPreferences.partition);
 assert.notEqual(h.view(A).options.webPreferences.partition,h.view(C).options.webPreferences.partition);
});
test('Gemini Personal has its own persistent profile independent of GPT and Workhub',()=>{
 const h=harness();h.layout([G]);const gemini=h.view(G);
 assert.ok(gemini,'Gemini did not create a remote view');
 assert.equal(gemini.webContents.loads[0],'https://gemini.google.com/app?hl=es-419');
 assert.equal(gemini.options.webPreferences.partition,'persist:workhub2-gemini-personal');
 h.layout([A,G]);
 assert.notEqual(gemini.options.webPreferences.partition,h.view(A).options.webPreferences.partition,'Gemini must not reuse a GPT session');
 assert.equal(h.target(G,'gemini-personal','https://gemini.google.com/app?hl=es-419'),'https://gemini.google.com/app?hl=es-419');
 assert.equal(h.target(G,'gemini-personal','https://example.com/'),'https://gemini.google.com/app?hl=es-419','Gemini sub-tabs must stay on Google Gemini');
 h.layout([A,G]);
 assert.equal(new Set(h.rects().map(rect=>rect.x)).size,2,'Gemini and GPT must split as separate selectable panels');
 assert.equal(gemini.webContents.loads.length,1,'changing panel selection must preserve Gemini login and page');
});
test('Google sign-in popups for Gemini stay in the Gemini view and its isolated Google profile',async()=>{
 const h=harness();h.layout([G]);const wc=h.view(G).webContents;
 const auth='https://accounts.google.com/signin/v2/identifier?service=gemini';
 assert.equal(wc.windowOpenHandler({url:auth}).action,'deny');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(wc.loads[1],auth,'Google authentication should continue inside the Gemini subtab');
 assert.equal(wc.loads.length,2);
});
test('mixed four-panel divider works with a Documents slot',()=>{
 const h=harness();h.layout([A,null,C,D],{},true);h.resize();assert.equal(h.rects().length,3);
});
test('modal hide/show retains chat contents without reloading',()=>{
 const h=harness();h.layout([A,B]);const a=h.view(A);h.layout([]);assert.ok(!h.host.children.includes(a));h.layout([A,B]);assert.equal(h.view(A),a);assert.equal(a.webContents.loads.length,1);
});
test('errors identify the failing panel and successful load announces recovery',()=>{
 const h=harness();h.layout([A,B]);const wc=h.view(B).webContents;
 wc.emit('did-fail-load',{},-105,'ERR_NAME_NOT_RESOLVED','https://chatgpt.com/',true);
 assert.equal(h.events.find(([type])=>type==='view-error')[1].viewId,B);
 wc.emit('did-finish-load');assert.equal(h.events.find(([type])=>type==='view-ready')[1].viewId,B);
});

test('embedded-frame navigation does not replace the saved chat address',()=>{
 const h=harness();h.layout([A]);h.view(A).webContents.emit('did-navigate-in-page',{},'https://embedded.example/',false);
 assert.equal(h.events.filter(([type])=>type==='ai-view-navigation').length,0);
});

test('every remote document disables native drag regions before finish-load, including reused GPT panels',()=>{
 const h=harness();h.layout([A,B,C,D]);
 for(const id of [A,B,C,D]){
  const wc=h.view(id).webContents;
  wc.emit('dom-ready');
  assert.equal(wc.styles.length,1,'pointer policy missing before did-finish-load');
  assert.equal(wc.styles[0].options.cssOrigin,'user','author CSS could override the policy');
  assert.match(wc.styles[0].css,/app-region:\s*no-drag\s*!important/);
  assert.match(wc.styles[0].css,/:root \*/,'dynamically mounted controls must be covered');
 }
 const wc=h.view(A).webContents;
 h.layout([C]);h.layout([A,B]);
 assert.equal(wc.styles.length,1,'layout updates must not accumulate styles');
 wc.emit('dom-ready');
 assert.equal(wc.styles.length,2,'a fresh document needs its own policy');
 assert.equal(wc.loads.length,1,'installing the policy must not reload chats');
});

test('Gmail login and Gemini return reuse one Workhub 2 profile and preserve GPT',async()=>{
 const h=harness();h.layout([A,G]);const gemini=h.view(G),gpt=h.view(A);
 const profile=gemini.options.webPreferences.partition;
 const providerUA=gemini.webContents.getUserAgent();
 assert.equal((await h.google(G,'gmail')).ok,true);
 assert.equal(gemini.webContents.loads.at(-1),'https://mail.google.com/mail/u/0/');
 assert.equal(gemini.webContents.getUserAgent(),'Electron/default');
 h.layout([A,G]);assert.equal(gemini.webContents.loads.length,2,'layout must not interrupt Gmail login');
 assert.equal((await h.google(G,'gemini')).ok,true);
 assert.equal(gemini.webContents.loads.at(-1),'https://gemini.google.com/app?hl=es-419');
 assert.equal(gemini.webContents.getUserAgent(),providerUA);
 assert.equal(gemini.options.webPreferences.partition,profile);
 assert.equal(gpt.webContents.loads.length,1);
 assert.equal((await h.google(A,'gmail')).ok,false);
 assert.equal((await h.google(G,'invalid')).ok,false);
});

test('Alter Frame uses its own persistent profile and remains selectable beside GPT and Gemini',()=>{
 const h=harness(),alter='ai-chat-alter-1::gpt-alterframe',second='ai-chat-alter-2::gpt-alterframe';
 h.layout([A,alter,G,second]);
 assert.equal(h.view(alter).options.webPreferences.partition,'persist:workhub2-gpt-alterframe');
 assert.notEqual(h.view(alter).options.webPreferences.partition,h.view(A).options.webPreferences.partition);
 assert.equal(h.view(alter).options.webPreferences.partition,h.view(second).options.webPreferences.partition);
 assert.equal(h.view(alter).webContents.loads[0],'https://chatgpt.com/');
 assert.match(h.view(alter).options.webPreferences.preload,/attachment-preload\.cjs$/);
 assert.equal(h.target(alter,'gpt-alterframe','https://chatgpt.com/c/alter'),'https://chatgpt.com/c/alter');
 assert.equal(h.target(alter,'gpt-alterframe','https://example.com/'),'https://chatgpt.com/');
 h.layout([A]);h.layout([alter]);assert.equal(h.view(alter).webContents.loads.length,1);
});

function workspaceHarness(initial){
 const data=new Map(Object.entries(initial));
 const context=vm.createContext({localStorage:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value))},Sparkles:{},FolderOpen:{},ShieldCheck:{},Wallet:{}});
 vm.runInContext(uiSource.slice(uiSource.indexOf('const EMAILS ='),uiSource.indexOf('function normalizeAiSplitPanes('))+'\nglobalThis.load=loadAiWorkspace;',context);
 return {data,load:()=>JSON.parse(JSON.stringify(context.load()))};
}
test('upgrade adds Alter Frame once without replacing saved names, chat URLs, or other preferences',()=>{
 const saved=[{id:'personal-custom',service:'gpt-personal',name:'Proyecto personal',url:'https://chatgpt.com/c/my-chat',customName:true},{id:'gemini-custom',service:'gemini-personal',name:'Gemini trabajo',url:'https://gemini.google.com/app/existing',customName:true}];
 const h=workspaceHarness({'workhub2-ai-chat-tabs':JSON.stringify(saved),'workhub2-ai-provider-tabs-migrated-v1':'done','workhub2-gemini-personal-tab-v1':'done','workhub2-folder':'C:\\Proyecto','workhub2-theme':'light'});
 const upgraded=h.load();assert.deepEqual(upgraded.slice(0,2),saved);
 assert.equal(upgraded.filter(item=>item.service==='gpt-alterframe').length,1);
 assert.deepEqual(h.load(),upgraded,'repeat load must not duplicate the new provider');
 assert.equal(h.data.get('workhub2-folder'),'C:\\Proyecto');assert.equal(h.data.get('workhub2-theme'),'light');
});
test('existing Alter Frame chats are retained without an extra default chat',()=>{
 const saved=[{id:'alter-custom',service:'gpt-alterframe',name:'Cliente',url:'https://chatgpt.com/c/client',customName:true}];
 const h=workspaceHarness({'workhub2-ai-chat-tabs':JSON.stringify(saved),'workhub2-ai-provider-tabs-migrated-v1':'done','workhub2-gemini-personal-tab-v1':'done'});
 assert.deepEqual(h.load(),saved);
});
test('fresh install has all three providers and an existing navigation layout gains the new tab',()=>{
 const fresh=workspaceHarness({}).load();assert.deepEqual(fresh.map(item=>item.service),['gpt-personal','gpt-alterframe','gemini-personal']);
 const saved=[{type:'tab',id:'documents'},{type:'folder',id:'my-folder',name:'Mis IA',open:true,children:['gpt-personal','gemini-personal']}];
 const context=vm.createContext({localStorage:{getItem:key=>key==='workhub2-tab-structure'?JSON.stringify(saved):null},Sparkles:{},FolderOpen:{},ShieldCheck:{},Wallet:{}});
 vm.runInContext(uiSource.slice(uiSource.indexOf('const EMAILS ='),uiSource.indexOf('function normalizeAiSplitPanes('))+uiSource.slice(uiSource.indexOf('const DEFAULT_FOLDER_TABS ='),uiSource.indexOf('function removeTab('))+'\nglobalThis.nav=loadNavItems();',context);
 const nav=JSON.parse(JSON.stringify(context.nav));assert.deepEqual(nav.slice(0,2),saved);assert.deepEqual(nav[2],{type:'tab',id:'gpt-alterframe'});
});
test('Alter Frame login button targets its own view while GPT Personal login remains supported',async()=>{
 const h=harness(),alter='ai-chat-alter-1::gpt-alterframe';h.layout([A,alter]);
 let handler;const context=vm.createContext({ipcMain:{handle:(_name,fn)=>handler=fn},remoteViews:new Map([[A,h.view(A)],[alter,h.view(alter)]]),navigateGoogleConnection:h.google});
 vm.runInContext(source.slice(source.indexOf("ipcMain.handle('reload-view'"),source.indexOf("ipcMain.handle('set-theme'")),context);
 assert.equal((await handler(null,{viewId:alter,login:true})).ok,true);
 assert.equal(h.view(alter).webContents.loads.at(-1),'https://chatgpt.com/auth/login');
 assert.equal(h.view(A).webContents.loads.length,1);
 assert.equal((await handler(null,{viewId:A,login:true})).ok,true);
});


test('switching a single chat restores keyboard focus without stealing it on ordinary layout updates',()=>{
 const h=harness();h.layout([A]);const a=h.view(A);assert.equal(a.webContents.focusCalls,1);
 h.layout([A]);h.resize();assert.equal(a.webContents.focusCalls,1);
 h.layout([A,G]);assert.equal(h.view(G).webContents.focusCalls,undefined,'split additions must not steal focus');
 h.layout([G]);assert.equal(h.view(G).webContents.focusCalls,undefined,'an already visible view must keep its current editor focus');
 h.layout([A]);assert.equal(a.webContents.focusCalls,2,'returning to a hidden chat must restore native keyboard focus');
});

test('Metadatos accepts editable web URLs and updates only its existing panel',()=>{const h=harness(),id='global-1::metadata';h.layout([A,id],{[id]:'https://killexif.com/es/'},true);const meta=h.view(id),gpt=h.view(A);assert.equal(meta.options.webPreferences.partition,'persist:workhub2-metadata');assert.ok(meta.options.webPreferences.preload.endsWith('attachment-preload.cjs'));h.layout([A,id],{[id]:'https://example.org/clean'},true);assert.equal(h.view(id),meta);assert.deepEqual(meta.webContents.loads,['https://killexif.com/es/','https://example.org/clean']);assert.equal(gpt.webContents.loads.length,1);assert.equal(h.target(id,'metadata','file:///private'),'https://killexif.com/es/');});

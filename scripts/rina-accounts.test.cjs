const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {emptyLedger,amountCents,validDate,applyOperation,validateLedger,totals,csvLedger}=require('../shared/rina-model.cjs');
const {createRinaStore}=require('../electron/rina-store.cjs');
const operation=(overrides={})=>({type:'save-expense',expense:{concept:'Higgsfield mensual',provider:'Higgsfield',amount:'50.35',date:'2026-10',categoryId:'category-3',notes:'Pago manual',...overrides}});
test('amounts are stored as exact USD cents; ambiguous and invalid inputs are rejected',()=>{
 assert.equal(amountCents('50,35'),5035);assert.equal(amountCents('0.01'),1);assert.equal(amountCents('200'),20000);
 for(const value of ['0','-1','1.234','1,234.56','1e3','abc','',Infinity])assert.throws(()=>amountCents(value));
});
test('calendar validation accepts a month without inventing its day and handles leap years',()=>{
 for(const value of ['2026-10','2024-02-29','2026-01-31'])assert.equal(validDate(value),true);
 for(const value of ['2026-02-29','2026-04-31','2026-13','2026-01-00','2026-1','1899-12'])assert.equal(validDate(value),false);
});
test('create, edit and delete expenses preserve identity and exact monthly totals',()=>{
 let data=applyOperation(emptyLedger(),operation(),'expense-1','2026-10-18T00:00:00Z');
 data=applyOperation(data,operation({amount:'0.10',date:'2026-10-01',concept:'Otro pago'}),'expense-2','2026-10-19T00:00:00Z');
 assert.equal(totals(data,{month:'2026-10'}).total,5045);assert.equal(data.expenses[0].date,'2026-10');
 data=applyOperation(data,operation({id:'expense-1',amount:'49.90'}),'ignored','2026-10-20T00:00:00Z');assert.equal(data.expenses[0].createdAt,'2026-10-18T00:00:00Z');assert.equal(totals(data).allTime,5000);
 data=applyOperation(data,{type:'delete-expense',id:'expense-2'},'ignored','now');assert.equal(totals(data).allTime,4990);
});
test('categories can be reordered and archived without losing expense categorization',()=>{
 let data=applyOperation(emptyLedger(),operation(),'expense','now');
 data=applyOperation(data,{type:'save-category',category:{...data.categories[2],name:'Herramientas IA',active:false}},'ignored','now');
 data=applyOperation(data,{type:'reorder-categories',ids:data.categories.map(c=>c.id).reverse()},'ignored','now');
 assert.equal(totals(data).categories[0].name,'Herramientas IA');assert.equal(data.expenses[0].categoryId,'category-3');
 assert.throws(()=>applyOperation(data,{type:'save-category',category:{name:'Herramientas IA'}},'new','now'),/existe/);
});
test('category, month and provider search filters never change total project investment',()=>{
 let data=applyOperation(emptyLedger(),operation(),'one','now');data=applyOperation(data,operation({date:'2026-09',amount:'30',provider:'Kling',concept:'Video'}),'two','now');
 assert.equal(totals(data,{month:'2026-09',search:'kling'}).total,3000);assert.equal(totals(data,{search:'Video'}).expenses.length,1);assert.equal(totals(data,{category:'missing'}).total,0);assert.equal(totals(data,{month:'2026-09'}).allTime,8035);
});
test('CSV preserves month precision and protects spreadsheet cells from formula execution',()=>{
 const data=applyOperation(emptyLedger(),operation({concept:'=HYPERLINK("bad")',provider:'@formula',notes:'una;nota\nsegunda línea'}),'one','now');const csv=csvLedger(data);
 assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes('Mes y año'));assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes("'@formula"));assert.ok(csv.includes('"50.35"'));
 assert.throws(()=>validateLedger({...data,expenses:[{...data.expenses[0],amountCents:0}]}));assert.throws(()=>validateLedger({...data,currency:'ARS'}));
});
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'rina-store-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return {root,store:createRinaStore(root)};}
test('saved expenses and category changes survive a fresh store instance',async t=>{
 const {root,store}=await fixture(t);const first=await store.read();assert.equal(first.data.expenses.length,0);await store.mutate(operation(),0);
 const {data}=await createRinaStore(root).read();assert.equal(data.expenses[0].amountCents,5035);assert.equal(data.revision,1);
});
test('concurrent stale revisions cannot overwrite each other',async t=>{
 const {store}=await fixture(t);const results=await Promise.allSettled([store.mutate(operation(),0),store.mutate(operation({amount:'30'}),0)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await store.read()).data.expenses.length,1);
});
test('damaged latest file recovers a validated backup; no empty reset on unreadable data',async t=>{
 const {root,store}=await fixture(t);await store.mutate(operation(),0);await store.mutate(operation({amount:'30'}),1);await fs.writeFile(store.file,'damaged');
 const recovered=await createRinaStore(root).read();assert.equal(recovered.data.expenses.length,1);assert.match(recovered.warning,/respaldo/);
 await fs.rm(path.join(root,'backups'),{recursive:true});await assert.rejects(createRinaStore(root).read(),/conservaron/);
});
test('JSON restoration validates every record and keeps a backup before replacement',async t=>{
 const {root,store}=await fixture(t);await store.mutate(operation(),0);await assert.rejects(store.restore({currency:'USD'},1));
 const replacement=applyOperation(emptyLedger(),operation({amount:'200',concept:'Celular'}),'imported','now');const {data}=await store.restore(replacement,1);assert.equal(data.revision,2);assert.equal(data.expenses[0].concept,'Celular');assert.ok((await fs.readdir(path.join(root,'backups'))).length>=2);
});

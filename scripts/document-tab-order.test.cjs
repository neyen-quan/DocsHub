const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/main.jsx'),'utf8');const ctx=vm.createContext({});vm.runInContext(source.slice(source.indexOf('function orderDocumentPanels('),source.indexOf('function documentFolderName(')),ctx);
const doc=slot=>({section:'documents',slot});const order=(panels,slots)=>JSON.parse(JSON.stringify(ctx.orderDocumentPanels(panels,slots)));
test('visible document panes follow tab order, independent of selection order',()=>assert.deepEqual(order([doc(3),doc(0),doc(19)],[19,0,3]),[doc(19),doc(0),doc(3)]));
test('Metadatos stays rightmost while document panes follow their tab order',()=>{const metadata={section:'metadata'};assert.deepEqual(order([doc(0),metadata,doc(19)],[19,0]),[doc(19),doc(0),metadata]);});
test('a newly created tab stays after existing tabs before its order state commits',()=>assert.deepEqual(order([doc(0),doc(4)],[0,1,2,3]),[doc(0),doc(4)]));

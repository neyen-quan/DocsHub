const fs=require('node:fs/promises');const path=require('node:path');
const {createRinaStore}=require('./rina-store.cjs');const {validateLedger,csvLedger}=require('../shared/rina-model.cjs');
function installRinaAccounts({ipcMain,dialog,app,host,root}){
  const store=createRinaStore(root);
  const publish=data=>{const win=host();if(win&&!win.isDestroyed())win.webContents.send('rina-accounts-changed',data);};
  const register=(channel,action)=>ipcMain.handle(channel,async(event,input)=>{if(event.sender!==host()?.webContents)return {ok:false,error:'Solicitud inválida.'};try{return {ok:true,...await action(input)};}catch(error){return {ok:false,error:error.message||'No se pudo guardar Cuentas Rina.'};}});
  register('rina-accounts-read',()=>store.read());
  register('rina-accounts-mutate',async({operation,revision}={})=>{const result=await store.mutate(operation,revision);publish(result);return result;});
  register('rina-accounts-export',async(format)=>{
    if(!['json','csv'].includes(format))throw Error('Formato de exportación inválido.');
    const {data}=await store.read();const stamp=new Date().toISOString().slice(0,10);
    const picked=await dialog.showSaveDialog(host(),{title:format==='json'?'Guardar respaldo de Cuentas Rina':'Exportar gastos de Cuentas Rina',defaultPath:path.join(app.getPath('downloads'),`Cuentas-Rina-${format==='json'?'Respaldo-':''}${stamp}.${format}`),filters:[{name:format==='json'?'Respaldo completo':'CSV para Excel',extensions:[format]}]});
    if(picked.canceled||!picked.filePath)return {cancelled:true};
    await fs.writeFile(picked.filePath,format==='json'?JSON.stringify(data,null,2):csvLedger(data),'utf8');return {path:picked.filePath};
  });
  register('rina-accounts-restore',async(revision)=>{
    const picked=await dialog.showOpenDialog(host(),{title:'Restaurar respaldo de Cuentas Rina',filters:[{name:'Respaldo JSON',extensions:['json']}],properties:['openFile']});
    if(picked.canceled||!picked.filePaths?.[0])return {cancelled:true};
    const file=picked.filePaths[0];if((await fs.stat(file)).size>15*1024*1024)throw Error('El respaldo supera el tamaño admitido.');
    const raw=JSON.parse(await fs.readFile(file,'utf8'));const data=validateLedger(raw.payload||raw);
    const confirmed=await dialog.showMessageBox(host(),{type:'question',title:'Restaurar Cuentas Rina',message:`¿Reemplazar los datos actuales por este respaldo?`,detail:`Contiene ${data.expenses.length} gastos y ${data.categories.length} categorías. Se conservará un respaldo automático de los datos actuales.`,buttons:['Cancelar','Restaurar'],defaultId:0,cancelId:0,noLink:true});
    if(confirmed.response!==1)return {cancelled:true};
    const result=await store.restore(data,revision);publish(result);return result;
  });
  return store;
}
module.exports={installRinaAccounts};

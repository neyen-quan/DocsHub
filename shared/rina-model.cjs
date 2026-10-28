const DEFAULT_CATEGORIES = ['Generación de imágenes','Generación de videos','Generación de imagen y video','Otros programas','Equipos y accesorios','Telefonía','Formación','Publicidad','Otros'];
const COLORS = ['#b39cff','#6eb8ef','#65cfbd','#e1b56b','#ef929e','#a8c86b','#cc9bd6','#73cad7','#a0aab8'];
function emptyLedger() { return {schemaVersion:1,revision:0,currency:'USD',categories:DEFAULT_CATEGORIES.map((name,i)=>({id:`category-${i+1}`,name,color:COLORS[i],active:true})),expenses:[],income:[]}; }
function amountCents(value) {
  const text=String(value).trim().replace(',','.');
  if(!/^\d{1,9}(\.\d{1,2})?$/.test(text))throw Error('Ingresá un importe positivo en USD, con hasta dos decimales.');
  const [whole,decimal='']=text.split('.');const cents=Number(whole)*100+Number(decimal.padEnd(2,'0'));
  if(!Number.isSafeInteger(cents)||cents<=0)throw Error('El importe debe ser mayor a cero.');return cents;
}
function validDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}(-\d{2})?$/.test(value))return false;
  const [year,month,day]=value.split('-').map(Number);if(year<1900||month<1||month>12)return false;
  if(day===undefined)return true;
  return day>=1&&day<=new Date(Date.UTC(year,month,0)).getUTCDate();
}
function text(value,max,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error('Hay un texto vacío o demasiado largo.');return value.trim();}
function validateLedger(input) {
  if(!input||input.schemaVersion!==1||input.currency!=='USD'||!Number.isSafeInteger(input.revision)||input.revision<0||!Array.isArray(input.categories)||input.categories.length<1||input.categories.length>200||!Array.isArray(input.expenses)||input.expenses.length>50000||!Array.isArray(input.income)||input.income.length)throw Error('El respaldo no es un registro de Cuentas Rina compatible.');
  const ids=new Set();const categories=input.categories.map(category=>{const id=text(category.id,100,true);if(ids.has(id))throw Error('Hay categorías duplicadas.');ids.add(id);if(!/^#[a-f0-9]{6}$/i.test(category.color)||typeof category.active!=='boolean')throw Error('Categoría inválida.');return {id,name:text(category.name,80,true),color:category.color,active:category.active};});
  const expenseIds=new Set();let total=0;const expenses=input.expenses.map(expense=>{const id=text(expense.id,100,true);if(expenseIds.has(id)||!ids.has(expense.categoryId)||!validDate(expense.date)||!Number.isSafeInteger(expense.amountCents)||expense.amountCents<=0||expense.amountCents>99999999999)throw Error('Hay un gasto con datos inválidos.');expenseIds.add(id);total+=expense.amountCents;if(!Number.isSafeInteger(total))throw Error('El total excede el límite admitido.');return {id,concept:text(expense.concept,160,true),provider:text(expense.provider,100),amountCents:expense.amountCents,date:expense.date,categoryId:expense.categoryId,notes:text(expense.notes,2000),createdAt:text(expense.createdAt,40,true),updatedAt:text(expense.updatedAt,40,true)};});
  return {schemaVersion:1,revision:input.revision,currency:'USD',categories,expenses,income:[]};
}
function applyOperation(current,operation,id,now) {
  const next=JSON.parse(JSON.stringify(current));
  if(operation.type==='save-expense'){
    const entry=operation.expense||{};const previous=entry.id?next.expenses.find(e=>e.id===entry.id):null;
    if(entry.id&&!previous)throw Error('El gasto ya no existe.');
    const expense={id:previous?.id||id,concept:entry.concept,provider:entry.provider||'',amountCents:amountCents(entry.amount),date:entry.date,categoryId:entry.categoryId,notes:entry.notes||'',createdAt:previous?.createdAt||now,updatedAt:now};
    if(previous)next.expenses[next.expenses.indexOf(previous)]=expense;else next.expenses.push(expense);
  }else if(operation.type==='delete-expense'){
    if(!next.expenses.some(e=>e.id===operation.id))throw Error('El gasto ya no existe.');next.expenses=next.expenses.filter(e=>e.id!==operation.id);
  }else if(operation.type==='save-category'){
    const value=operation.category||{};const previous=value.id?next.categories.find(c=>c.id===value.id):null;
    if(value.id&&!previous)throw Error('La categoría ya no existe.');
    const name=text(value.name,80,true);if(next.categories.some(c=>c.id!==previous?.id&&c.name.toLowerCase()===name.toLowerCase()))throw Error('Ya existe una categoría con ese nombre.');
    const category={id:previous?.id||id,name,color:value.color||COLORS[next.categories.length%COLORS.length],active:value.active!==false};
    if(previous)next.categories[next.categories.indexOf(previous)]=category;else next.categories.push(category);
  }else if(operation.type==='reorder-categories'){
    const order=operation.ids;if(!Array.isArray(order)||new Set(order).size!==next.categories.length||order.length!==next.categories.length||order.some(id=>!next.categories.some(c=>c.id===id)))throw Error('Orden de categorías inválido.');next.categories=order.map(id=>next.categories.find(c=>c.id===id));
  }else throw Error('Operación desconocida.');
  next.revision++;return validateLedger(next);
}
function csvLedger(data){const quote=value=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text)||/^[\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};return '\ufeff'+[['Fecha','Precisión','Concepto','Proveedor','Categoría','Importe USD','Notas'],...data.expenses.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(e=>[e.date,e.date.length===7?'Mes y año':'Día exacto',e.concept,e.provider,data.categories.find(c=>c.id===e.categoryId)?.name||'',(e.amountCents/100).toFixed(2),e.notes])].map(row=>row.map(quote).join(';')).join('\r\n');}
function totals(data,{month='',category='',search=''}={}){
  const query=search.trim().toLocaleLowerCase('es');
  const expenses=data.expenses.filter(e=>(!month||e.date.slice(0,7)===month)&&(!category||e.categoryId===category)&&(!query||[e.concept,e.provider,e.notes].join(' ').toLocaleLowerCase('es').includes(query))).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
  const sum=entries=>entries.reduce((total,e)=>total+e.amountCents,0);
  return {expenses,total:sum(expenses),allTime:sum(data.expenses),categories:data.categories.map(c=>({...c,total:sum(expenses.filter(e=>e.categoryId===c.id))})).filter(c=>c.total),months:[...new Set(data.expenses.map(e=>e.date.slice(0,7)))].sort()};
}
module.exports={emptyLedger,amountCents,validDate,validateLedger,applyOperation,csvLedger,totals,COLORS};

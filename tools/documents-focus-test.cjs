// Runs against the packaged React UI, real folder IPC and native key events.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async function testDocumentsFocus(win,qa){
 const wc=win.webContents,project=path.join(qa,'focus-project');fs.mkdirSync(path.join(project,'child','grandchild'),{recursive:true});fs.mkdirSync(path.join(project,'empty'),{recursive:true});
 const run=body=>wc.executeJavaScript('(()=>{'+body+'})()');
 const pane=i=>`document.querySelectorAll('.documents-page')[${i}]`;
 async function waitFor(expression){const until=Date.now()+15000;while(!await run('return !!('+expression+');')){if(Date.now()>until)throw Error('Navigation timeout: '+expression);await new Promise(r=>setTimeout(r,50));}}
 async function open(i,name){await run(`const pane=${pane(i)},row=Array.from(pane.querySelectorAll('.file-row')).find(e=>e.querySelector('.document-file-label')?.textContent===${JSON.stringify(name)});if(!row)throw Error('Missing folder');row.focus();row.click();row.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,detail:2}));`);await waitFor(`${pane(i)}?.querySelector('.file-heading h1')?.textContent===${JSON.stringify(name)}`);assert.equal(await run(`return document.activeElement===${pane(i)};`),true,'pane must already have focus after double-click');}
 async function back(i,name){wc.sendInputEvent({type:'keyDown',keyCode:'Backspace'});wc.sendInputEvent({type:'keyUp',keyCode:'Backspace'});await waitFor(`${pane(i)}?.querySelector('.file-heading h1')?.textContent===${JSON.stringify(name)}`);}
 win.focus();wc.focus();await run(`Array.from(document.querySelectorAll('button.tab')).find(b=>b.textContent.trim()==='Documentos').click();`);await waitFor(`${pane(0)}`);
 await run(`Array.from(${pane(0)}.querySelectorAll('button')).find(b=>/Cambiar carpeta|Elegir carpeta/.test(b.textContent)).click();`);await waitFor(`${pane(0)}?.querySelector('.file-heading h1')?.textContent==='focus-project' && ${pane(0)}.querySelectorAll('.file-row').length===2`);
 for(const mode of ['Miniaturas','Lista']){
  await run(`Array.from(${pane(0)}.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(mode)}).click();`);
  await open(0,'child');await waitFor(`${pane(0)}.querySelector('.file-row')`);await open(0,'grandchild');await back(0,'child');await back(0,'focus-project');await waitFor(`${pane(0)}.querySelectorAll('.file-row').length===2`);await open(0,'empty');await back(0,'focus-project');
 }
 await run(`document.querySelector('button[aria-label="Agregar otra vista de Documentos"]').click();`);await waitFor(`document.querySelectorAll('.documents-page').length===2 && ${pane(1)}.querySelectorAll('.file-row').length===2`);
 await open(1,'child');assert.equal(await run(`return ${pane(0)}.querySelector('.file-heading h1').textContent;`),'focus-project');await back(1,'focus-project');
 await run(`${pane(1)}.querySelector('.searchbox input').focus();`);await wc.insertText('ab');wc.sendInputEvent({type:'keyDown',keyCode:'Backspace'});wc.sendInputEvent({type:'keyUp',keyCode:'Backspace'});await waitFor(`${pane(1)}.querySelector('.searchbox input').value==='a'`);assert.equal(await run(`return ${pane(1)}.querySelector('.file-heading h1').textContent;`),'focus-project');
 fs.writeFileSync(path.join(qa,'navigation-focus.json'),JSON.stringify({ok:true,doubleClickThenNativeBackspace:true,previewsAndList:true,nestedAndEmptyFolders:true,splitIsolation:true,textEditing:true}));
};

const { ipcRenderer } = require('electron');
const markerType = 'application/x-workhub2-attachment';
let hint = null;
let depth = 0;

function clearHint() { hint?.remove(); hint = null; depth = 0; }
function showHint(text) {
  if (!hint) {
    hint = document.createElement('div');
    hint.style.cssText = 'position:fixed;inset:14px;z-index:2147483647;pointer-events:none;border:3px dashed #a899ff;border-radius:18px;background:rgba(20,17,35,.82);color:white;display:flex;align-items:center;justify-content:center;font:600 20px system-ui;text-align:center;padding:30px;';
    document.documentElement.appendChild(hint);
  }
  hint.textContent = text;
}
function ours(event) {
  return event.isTrusted && [...(event.dataTransfer?.types || [])].includes(markerType);
}
function mime(name) {
  const ext = name.split('.').pop().toLowerCase();
  return ({ pdf:'application/pdf', txt:'text/plain', md:'text/markdown', csv:'text/csv', json:'application/json', doc:'application/msword', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls:'application/vnd.ms-excel', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', svg:'image/svg+xml', mp4:'video/mp4', zip:'application/zip' })[ext] || 'application/octet-stream';
}
for (const type of ['dragenter', 'dragover', 'dragleave']) {
  window.addEventListener(type, event => {
    if (!ours(event)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (type === 'dragleave') {
      if (--depth <= 0) clearHint();
    } else {
      if (type === 'dragenter') depth++;
      event.dataTransfer.dropEffect = 'copy';
      showHint('Soltá para adjuntar el archivo');
    }
  }, true);
}
window.addEventListener('drop', async event => {
  if (!ours(event)) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const token = event.dataTransfer.getData(markerType);
  const target = event.target;
  const coordinates = { clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY };
  showHint('Preparando adjunto…');
  try {
    const result = await ipcRenderer.invoke('consume-attachment-drag', token);
    if (result?.error || !result?.files?.length) throw new Error(result?.error || 'No se pudo leer el archivo.');
    const transfer = new DataTransfer();
    for (const file of result.files) {
      const bytes = new Uint8Array(file.bytes);
      transfer.items.add(new globalThis.File([bytes], file.name, { type: mime(file.name), lastModified: file.lastModified }));
    }
    transfer.effectAllowed = 'copy';
    transfer.dropEffect = 'copy';
    clearHint();
    const destination = target?.isConnected ? target : document.elementFromPoint(coordinates.clientX, coordinates.clientY) || document.body;
    // The real inter-panel drag carries only a capability. Construct the File
    // objects in the receiving renderer, where Chromium cannot strip them.
    for (const type of ['dragenter', 'dragover', 'drop']) {
      destination.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: transfer, ...coordinates }));
    }
    ipcRenderer.send('attachment-drag-result', { ok: true });
  } catch (error) {
    ipcRenderer.send('attachment-drag-result', { ok: false, error: error.message });
    showHint(error.message || 'No se pudo adjuntar el archivo.');
    setTimeout(clearHint, 4500);
  }
}, true);
window.addEventListener('dragend', clearHint, true);
window.addEventListener('pagehide', clearHint);

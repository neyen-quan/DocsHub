const fs = require('node:fs/promises');
const path = require('node:path');
const fsSync = require('node:fs');
const { randomUUID } = require('node:crypto');

function isPaste(input) {
  return input.type === 'keyDown' && (input.control || input.meta) && !input.alt && !input.shift && !input.isAutoRepeat && String(input.key).toLowerCase() === 'v';
}
const hostEditing = `Boolean(document.querySelector('[role="dialog"], .ai-dialog, .folder-dialog, .context-menu') || document.activeElement?.closest('input,textarea,[contenteditable="true"],.documents-page,.file-table'))`;
function prepareComposer(respectEditable) {
  return `(() => {
    const editor = document.querySelector('#prompt-textarea, .ProseMirror[contenteditable="true"]');
    const active = document.activeElement;
    if (${Boolean(respectEditable)} && active && active !== editor && !editor?.contains(active) && active.matches('input,textarea,[contenteditable="true"]')) return 'other-input';
    if (!editor || editor.getAttribute('contenteditable') === 'false' || editor.disabled || !editor.getClientRects().length) return 'not-ready';
    editor.focus({preventScroll:true});
    return 'ready';
  })()`;
}
const fileInputExpression = `(() => {
  const editor = document.querySelector('#prompt-textarea, .ProseMirror[contenteditable="true"]');
  const form = editor?.closest('form');
  const candidates = [...document.querySelectorAll('input[type="file"]')].filter(input => {
    if (input.disabled) return false;
    const accept = input.accept.toLowerCase();
    return !accept || accept.split(',').some(type => /^(image\\/|\\.(png|jpg|jpeg|webp|gif)$|\\*\\/\\*)/.test(type.trim()));
  });
  candidates.sort((a,b) => (Number(form?.contains(b))*10 + Number(b.id === 'upload-files')*5 + Number(b.multiple)) - (Number(form?.contains(a))*10 + Number(a.id === 'upload-files')*5 + Number(a.multiple)));
  return candidates[0] || null;
})()`;

function createGptClipboard({ clipboard, tempRoot, getView, isAllowed, notify = () => {} }) {
  const busy = new WeakSet();
  const folders = new Set();
  async function readImage() {
    // Electron 44 uses async ClipboardItem payloads. Older runtimes expose readImage.
    try {
      if (typeof clipboard.read === 'function') {
        for (const item of await clipboard.read()) {
          const type = ['image/png','image/jpeg','image/webp','image/gif'].find(type => item.types.includes(type));
          if (!type) continue;
          const blob = await item.getType(type);
          return { bytes: Buffer.from(await blob.arrayBuffer()), extension: { 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp', 'image/gif':'gif' }[type] };
        }
        return null;
      }
      const image = clipboard.readImage();
      return image.isEmpty() ? null : { bytes: image.toPNG(), extension: 'png' };
    } catch { return null; }
  }
  async function pasteImage(viewId, { image = null, shortcut = false } = {}) {
    const view = getView(viewId);
    const wc = view?.webContents;
    if (!wc || wc.isDestroyed() || !isAllowed(viewId, view)) return { ok: false, error: 'Seleccioná un chat de GPT visible y conectado.' };
    if (busy.has(wc)) return { ok: false, error: 'La captura anterior todavía se está preparando.' };
    busy.add(wc);
    const group = `workhub2-clipboard-${randomUUID()}`;
    let folder;
    let delivered = false;
    try {
      image ||= await readImage();
      if (!image) return { ok: false, error: 'No hay una imagen en el portapapeles. Hacé una captura nueva y volvé a pegar.' };
      const mode = await wc.executeJavaScript(prepareComposer(shortcut), true);
      if (!isAllowed(viewId, view)) return { ok: false, error: 'El chat cambió mientras se preparaba la captura. Volvé a seleccionarlo.' };
      if (mode === 'other-input') { wc.paste(); return { ok: true, native: true }; }
      if (mode !== 'ready') return { ok: false, error: 'El cuadro de mensaje todavía no está listo. Esperá a que cargue el chat o recargá esa pestaña.' };
      const debug = wc.debugger;
      if (!debug.isAttached()) debug.attach('1.3');
      const response = await debug.sendCommand('Runtime.evaluate', { expression: fileInputExpression, objectGroup: group, returnByValue: false });
      const objectId = response.result?.objectId;
      if (!objectId || response.exceptionDetails) { wc.paste(); return { ok: true, native: false, message: 'Usé el pegado normal: si no aparece la captura, probá el botón + de GPT o recargá esta pestaña.' }; }
      folder = await fs.mkdtemp(path.join(tempRoot(), 'workhub2-clipboard-'));
      folders.add(folder);
      const filename = path.join(folder, `Captura-${Date.now()}.${image.extension}`);
      await fs.writeFile(filename, image.bytes);
      if (!isAllowed(viewId, view)) return { ok: false, error: 'El chat cambió. La captura no se adjuntó.' };
      wc.focus();
      await debug.sendCommand('DOM.setFileInputFiles', { files: [filename], objectId });
      delivered = true;
      return { ok: true, message: 'Captura entregada al selector de adjuntos. Revisá la vista previa antes de enviar.' };
    } catch (error) {
      return { ok: false, error: 'No pude adjuntar la captura. Recargá esta pestaña y probá de nuevo.' };
    } finally {
      // Leave successful files alive for deferred reads by the upload handler.
      // Release only our own remote handles; the theme/sidebar debugger stays attached.
      if (!wc.isDestroyed() && wc.debugger.isAttached()) await wc.debugger.sendCommand('Runtime.releaseObjectGroup', { objectGroup: group }).catch(() => {});
      if (folder && !delivered) { await fs.rm(folder, { recursive: true, force: true }).catch(() => {}); folders.delete(folder); }
      busy.delete(wc);
    }
  }
  function install(viewId, wc) {
    wc.on('before-input-event', (event, input) => {
      if (!isPaste(input) || !isAllowed(viewId, getView(viewId))) return;
      event.preventDefault();
      readImage().then(image => {
        if (!image) { if (!wc.isDestroyed()) wc.paste(); return; }
        return pasteImage(viewId, { image, shortcut: true }).then(result => { if (!result.native) notify(viewId, result); });
      }).catch(() => { if (!wc.isDestroyed()) wc.paste(); });
    });
  }
  function installHost(host, pickTarget) {
    host.on('before-input-event', (_event, input) => {
      if (!isPaste(input)) return;
      const viewId = pickTarget();
      if (!viewId) return;
      // Keep Workhub's native key event intact, particularly Documents shortcuts.
      // Only non-editing chrome can forward an image to the visible GPT.
      host.executeJavaScript(hostEditing).then(async editing => {
        if (editing) return;
        const image = await readImage();
        if (!image) return;
        const result = await pasteImage(viewId, { image, shortcut: true });
        if (!result.native) notify(viewId, result);
      }).catch(() => {});
    });
  }
  function cleanup() {
    for (const folder of folders) { try { fsSync.rmSync(folder, { recursive: true, force: true }); } catch {} }
    folders.clear();
  }
  return { pasteImage, install, installHost, cleanup };
}
module.exports = { createGptClipboard, isPaste };

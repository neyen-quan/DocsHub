const fs = require('node:fs');
const path = require('node:path');
function createMetadataDownloads({ app, dialog, host }) {
  const settings = path.join(app.getPath('userData'), 'metadata-downloads.json');
  let destination = '';
  try { destination = JSON.parse(fs.readFileSync(settings, 'utf8')).destination || ''; } catch {}
  const installed = new WeakSet(), reserved = new Set();
  const send = result => { const win = host(); if (win && !win.webContents.isDestroyed()) win.webContents.send('metadata-download-status', result); };
  function getDestination() { return destination || app.getPath('downloads'); }
  function save(value) {
    fs.writeFileSync(settings + '.tmp', JSON.stringify({ destination: value }));
    fs.renameSync(settings + '.tmp', settings);
    destination = value;
    return getDestination();
  }
  async function pickDestination() {
    const result = await dialog.showOpenDialog(host(), { title: 'Guardar archivos de Metadatos en…', defaultPath: getDestination(), properties: ['openDirectory', 'createDirectory'] });
    return result.canceled || !result.filePaths[0] ? null : save(result.filePaths[0]);
  }
  function install(session) {
    if (installed.has(session)) return;
    installed.add(session);
    session.on('will-download', (_event, item) => {
      let file;
      try {
        const folder = getDestination();
        fs.mkdirSync(folder, { recursive: true });
        let name = path.basename(item.getFilename()).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '');
        if (!name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = 'archivo-limpio' + path.extname(name);
        const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
        file = path.join(folder, name);
        for (let n = 1; fs.existsSync(file) || reserved.has(file); n++) file = path.join(folder, `${stem} (${n})${ext}`);
        reserved.add(file);
        item.setSavePath(file);
        item.once('done', (_event, state) => {
          reserved.delete(file);
          send(state === 'completed' ? { ok: true, path: file, message: `Guardado: ${file}` } : { ok: false, message: `La descarga no terminó (${state}).` });
        });
      } catch (error) {
        if (file) reserved.delete(file);
        item.cancel();
        send({ ok: false, message: `No pude guardar la descarga: ${error.message}. Elegí otra carpeta de destino.` });
      }
    });
  }
  return { getDestination, pickDestination, useDownloads: () => save(''), install };
}
module.exports = { createMetadataDownloads };

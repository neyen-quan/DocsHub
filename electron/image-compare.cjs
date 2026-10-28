const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { IMAGE_EXTENSIONS } = require('./document-media.cjs');
function imageRects(area, count) {
  if (!Number.isInteger(count) || count < 1) return [];
  let rows = 1;
  if (count >= 4) {
    if (count % 2 === 0) {
      let best = Infinity;
      for (let columns = 1; columns <= count; columns++) {
        if (count % columns) continue;
        const candidateRows = count / columns;
        const score = Math.abs(Math.log((area.width / columns) / (area.height / candidateRows)));
        if (score < best) { best = score; rows = candidateRows; }
      }
    } else rows = Math.max(2, Math.round(Math.sqrt(count * area.height / area.width)));
  }
  const rects = [];
  for (let row = 0; row < rows; row++) {
    const columns = Math.floor(count / rows) + (row < count % rows ? 1 : 0);
    const top = Math.floor(area.height * row / rows), bottom = Math.floor(area.height * (row + 1) / rows);
    for (let col = 0; col < columns; col++) {
      const left = Math.floor(area.width * col / columns), right = Math.floor(area.width * (col + 1) / columns);
      rects.push({ x: area.x + left, y: area.y + top, width: count === 1 ? Math.min(720, Math.floor(area.width / 2)) : right - left, height: bottom - top });
    }
  }
  return rects;
}
function comparisonDisplay(displays, host) {
  const others = displays.filter(display => display.id !== host.id);
  const left = others.filter(display => display.bounds.x < host.bounds.x).sort((a,b) => b.bounds.x - a.bounds.x);
  return left[0] || others.sort((a,b) => Math.abs(a.bounds.x - host.bounds.x) - Math.abs(b.bounds.x - host.bounds.x))[0] || host;
}
function createImageCompare({ BrowserWindow, screen, allowedPath, mainWindow }) {
  const entries = new Map();
  let displayId = null, closing = false, groupDrag = null;
  function endGroupDrag(contents, snap = true) {
    if (!groupDrag || (contents && groupDrag.owner !== contents)) return;
    const drag = groupDrag; groupDrag = null;
    clearInterval(drag.timer);
    if (snap) {
      const target = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      if (target.id !== drag.displayId) { displayId = target.id; arrange(); }
    }
  }
  function beginGroupDrag(contents) {
    if (groupDrag || !owns(contents)) return;
    const start = screen.getCursorScreenPoint();
    const windows = [...entries.values()].filter(win => !win.isDestroyed());
    for (const win of windows) { if (win.isMinimized()) win.restore(); if (win.isMaximized()) win.unmaximize(); }
    const drag = { owner: contents, start, displayId: screen.getDisplayNearestPoint(start).id, windows: windows.map(win => ({ win, rect: win.getBounds() })) };
    groupDrag = drag;
    drag.timer = setInterval(() => {
      if (!groupDrag || groupDrag.owner.isDestroyed?.()) { endGroupDrag(null, false); return; }
      const point = screen.getCursorScreenPoint();
      const dx = point.x - drag.start.x, dy = point.y - drag.start.y;
      for (const {win,rect} of drag.windows) if (!win.isDestroyed()) win.setBounds({ ...rect, x: rect.x + dx, y: rect.y + dy });
    }, 16);
    drag.timer.unref?.();
  }
  function display() {
    const displays = screen.getAllDisplays();
    let selected = displays.find(item => item.id === displayId);
    if (!selected) {
      const host = screen.getDisplayMatching(mainWindow().getBounds());
      selected = comparisonDisplay(displays, host);
      displayId = selected.id;
    }
    return selected;
  }
  function arrange() {
    if (!entries.size || closing || groupDrag) return;
    const rects = imageRects(display().workArea, entries.size);
    [...entries.values()].forEach((win,index) => {
      if (win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      if (win.isMaximized()) win.unmaximize();
      win.setBounds(rects[index]);
    });
  }
  async function open(file) {
    if (typeof file !== 'string' || !path.isAbsolute(file) || !allowedPath(file)) throw new Error('Elegí una imagen de Documentos.');
    const canonical = fs.realpathSync(file);
    if (!allowedPath(canonical) || !fs.statSync(canonical).isFile() || !IMAGE_EXTENSIONS.has(path.extname(canonical).toLowerCase())) throw new Error('Ese archivo no es una imagen compatible.');
    const existing = entries.get(canonical);
    if (existing && !existing.isDestroyed()) { arrange(); existing.show(); existing.focus(); return { ok: true }; }
    if (entries.size >= 16) throw new Error('Cerrá alguna imagen antes de abrir otra: el comparador admite 16 ventanas.');
    const win = new BrowserWindow({ width: 640, height: 700, minWidth: 120, minHeight: 100, show: false, backgroundColor: '#10151d', title: `${path.basename(canonical)} · Comparar · DocsHub`, autoHideMenuBar: true, icon: path.join(__dirname, '../assets/docshub.png'), webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, 'image-viewer-preload.cjs') } });
    if (process.platform === 'win32') win.setAppDetails({appId:'agency.neyen.workhub2',appIconPath:path.join(__dirname,'../assets/docshub.ico'),appIconIndex:0,relaunchCommand:'"'+path.join(__dirname,'../DocsHub.exe')+'"',relaunchDisplayName:'DocsHub'});
    entries.set(canonical, win);
    const viewerContents = win.webContents;
    win.setMenu(null);
    win.on('closed', () => { if (groupDrag?.owner === viewerContents) endGroupDrag(null, false); entries.delete(canonical); if (!entries.size) displayId = null; else arrange(); });
    try {
      await win.loadFile(path.join(__dirname, 'image-viewer.html'), { query: { image: pathToFileURL(canonical).href, name: path.basename(canonical) } });
      arrange();
      for (const other of entries.values()) if (!other.isDestroyed()) other.showInactive();
      win.focus();
      return { ok: true };
    } catch (error) { win.close(); throw error; }
  }
  function closeAll() {
    endGroupDrag(null, false);
    closing = true;
    for (const win of [...entries.values()]) if (!win.isDestroyed()) win.close();
    entries.clear(); displayId = null; closing = false;
  }
  for (const event of ['display-metrics-changed','display-added','display-removed']) screen.on(event, arrange);
  const owns = contents => [...entries.values()].some(win => !win.isDestroyed() && win.webContents === contents);
  return { open, arrange, closeAll, owns, beginGroupDrag, endGroupDrag };
}
module.exports = { createImageCompare, imageRects, comparisonDisplay };

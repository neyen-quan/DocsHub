const { app, BrowserWindow, WebContentsView, ipcMain, dialog, shell, screen, clipboard, nativeImage } = require('electron');
const path = require('node:path');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');

const APP_DATA_DIRECTORY = 'Neyen.Workhub2';
app.setName('DocsHub');
const profileRoot = path.join(app.getPath('appData'), APP_DATA_DIRECTORY);
fsSync.mkdirSync(profileRoot, { recursive: true });
app.setPath('userData', profileRoot);
const sessionRoot = path.join(profileRoot, 'browser');
fsSync.mkdirSync(sessionRoot, { recursive: true });
app.setPath('sessionData', sessionRoot);
app.setAppUserModelId('agency.neyen.workhub2');
const ownsProfile = app.requestSingleInstanceLock();
if (!ownsProfile) app.quit();
app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
});

let win;
require('./rina-ipc.cjs').installRinaAccounts({ipcMain,dialog,app,host:()=>win,root:path.join(profileRoot,'cuentas-rina')});
let imageCompare;
const metadataDownloads = require('./metadata-downloads.cjs').createMetadataDownloads({ app, dialog, host: () => win });
app.whenReady().then(() => { imageCompare = require('./image-compare.cjs').createImageCompare({ BrowserWindow, screen, allowedPath: isUnderAllowedFolder, mainWindow: () => win }); });
let remoteViews = new Map();
let currentViews = [];
let splitterXView = null;
let splitterX2View = null;
let splitterYView = null;
let microRefreshView = null;
let microRefreshAttached = false;
let currentMicroRefreshViewId = null;
let splitterXAttached = false;
let splitterX2Attached = false;
let splitterYAttached = false;
let splitterDraggingAxis = null;
let currentLayoutIds = [];
let currentSplitIds = null;
let currentSplitRatio = 50;
let currentSplitRatio2 = 66.67;
let currentAiLayoutIds = null;
let currentAiRatios = { x: 50, y: 50 };
let currentAiTargets = {};
const loadedViewTargets = new Map();
let lastGptViewId = null;
const gptClipboard = require('./gpt-clipboard.cjs').createGptClipboard({
  clipboard,
  tempRoot: () => app.getPath('temp'),
  getView: id => remoteViews.get(id),
  isAllowed: (id, view) => {
    if (!view || view.webContents.isDestroyed() || !currentViews.includes(view) || !['gpt-personal','gpt-alterframe'].includes(String(id).split('::').at(-1))) return false;
    try { const url = new URL(view.webContents.getURL()); return url.protocol === 'https:' && url.hostname === 'chatgpt.com'; } catch { return false; }
  },
  notify: (viewId, result) => win?.webContents.send('gpt-clipboard-status', { viewId, ...result })
});
app.on('will-quit', () => { void gptClipboard.cleanup(); });
let contentTop = 112;
let currentTheme = 'dark';
let workMode = false;
let projectsFolder = '';
const allowedFolderRoots = new Set();
const notificationPermissionSessions = new WeakSet();
const ZIP_VIRTUAL_PREFIX = 'zip://';
function encodeZipPath(archive, entry = '') {
  const encoded = String(entry).split('/').filter(Boolean).map(part => encodeURIComponent(part)).join('/');
  return `${ZIP_VIRTUAL_PREFIX}${encodeURIComponent(path.resolve(archive))}!/${encoded}`;
}
function decodeZipPath(value) {
  if (typeof value !== 'string' || !value.startsWith(ZIP_VIRTUAL_PREFIX)) return null;
  const marker = value.indexOf('!/', ZIP_VIRTUAL_PREFIX.length);
  if (marker < 0) return null;
  try {
    const archive = path.resolve(decodeURIComponent(value.slice(ZIP_VIRTUAL_PREFIX.length, marker)));
    const entry = value.slice(marker + 2).split('/').filter(Boolean).map(decodeURIComponent).join('/');
    if (entry.split('/').includes('..')) return null;
    return { archive, entry };
  } catch { return null; }
}
function runPowerShellScript(script, action, input = {}) {
  if (process.platform !== 'win32') return Promise.reject(new Error('Esta operación requiere DocsHub en Windows.'));
  const executable = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const scriptPath = path.join(__dirname, script);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...(action ? [action] : [])], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => {
      if (code !== 0) return reject(new Error(stderr.trim() || `PowerShell terminó con código ${code}.`));
      try { resolve(stdout.trim() ? JSON.parse(stdout.trim()) : {}); }
      catch { reject(new Error(stderr.trim() || 'La operación de archivos devolvió una respuesta inválida.')); }
    });
    child.stdin.end(Buffer.from(JSON.stringify(input), 'utf8').toString('base64'));
  });
}
// Keep one STA process alive: starting PowerShell for every click caused the delay.
let clipboardWorker = null;
let clipboardRequestId = 0;
const clipboardRequests = new Map();
function startClipboardWorker() {
  if (clipboardWorker || process.platform !== 'win32') return;
  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'file-clipboard.ps1'), 'server'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  clipboardWorker = child;
  let buffer = '';
  const fail = error => {
    if (clipboardWorker !== child) return;
    clipboardWorker = null;
    for (const pending of clipboardRequests.values()) { clearTimeout(pending.timer); pending.reject(error); }
    clipboardRequests.clear();
  };
  child.on('error', fail);
  child.on('exit', () => fail(new Error('El servicio de portapapeles se cerró. Volvé a intentar.')));
  child.stdin.on('error', fail);
  child.stderr.on('data', () => {});
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
      try {
        const result = JSON.parse(line);
        const pending = clipboardRequests.get(result.id);
        if (!pending) continue;
        clipboardRequests.delete(result.id); clearTimeout(pending.timer);
        if (result.ok) pending.resolve(result.result || {}); else pending.reject(new Error(result.error));
      } catch { /* Ignore non-protocol startup output. */ }
    }
  });
}
function runFileClipboard(action, payload = {}) {
  if (process.platform !== 'win32') return runPowerShellScript('file-clipboard.ps1', action, payload);
  startClipboardWorker();
  return new Promise((resolve, reject) => {
    const id = ++clipboardRequestId;
    const timer = setTimeout(() => { clipboardRequests.delete(id); reject(new Error('El portapapeles no respondió.')); clipboardWorker?.kill(); }, 15000);
    clipboardRequests.set(id, { resolve, reject, timer });
    clipboardWorker.stdin.write(JSON.stringify({ id, action, payload }) + '\n');
  });
}
app.on('before-quit', () => clipboardWorker?.kill());

function isUnderAllowedFolder(candidate) {
  const target = path.resolve(candidate);
  return [...allowedFolderRoots, ...(projectsFolder ? [projectsFolder] : [])].some(root => {
    const relative = path.relative(path.resolve(root), target);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  });
}
const sites = Object.freeze({
  metadata: 'https://killexif.com/es/',
  'gpt-personal': 'https://chatgpt.com/',
  'gpt-alterframe': 'https://chatgpt.com/',
  'gemini-personal': 'https://gemini.google.com/app?hl=es-419'
});
const labels = { 'gpt-personal': 'GPT Personal', 'gpt-alterframe': 'GPT Alter Frame', 'gemini-personal': 'Gemini Personal' };

function applyRemoteTheme(webContents, theme) {
  if (!webContents || webContents.isDestroyed()) return;
  const debuggerApi = webContents.debugger;
  try {
    if (!debuggerApi.isAttached()) debuggerApi.attach('1.3');
  } catch {}
  if (!debuggerApi.isAttached()) return;
  debuggerApi.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: theme }]
  }).catch(() => {});
  debuggerApi.sendCommand('Emulation.setAutoDarkModeOverride', {
    enabled: theme === 'dark'
  }).catch(() => {});
}

function configureNotificationPermissions(session) {
  if (!session || notificationPermissionSessions.has(session)) return;
  notificationPermissionSessions.add(session);
  session.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'notifications') return !workMode;
    return true;
  });
  session.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'notifications') return callback(!workMode);
    callback(true);
  });
}

function isMessagingService(id) {
  const serviceId = id?.includes('::') ? id.split('::').at(-1) : id;
  return ['wa-personal', 'wa-work', 'telegram'].includes(serviceId);
}

function applyWorkModeAudioMute() {
  for (const [viewId, view] of remoteViews) {
    if (isMessagingService(viewId) && !view.webContents.isDestroyed()) {
      view.webContents.setAudioMuted(workMode);
    }
  }
}

function installWhatsAppSidebarResize(webContents, serviceId) {
  if (!webContents || webContents.isDestroyed()) return;
  const script = `(${function (service) {
    if (window.__workhub2WhatsAppResizeV2) return;
    window.__workhub2WhatsAppResizeV2 = true;
    const key = 'workhub2-wa-sidebar-width-v2-' + service;
    let sidebar = null;
    let mainPane = null;
    let grip = null;
    let queued = false;
    let dragging = false;
    let dragStartX = 0;
    let dragStartWidth = 0;

    function findColumns() {
      const side = document.querySelector('#side');
      const main = document.querySelector('#main');
      if (!side || !main) return null;
      let container = side.parentElement;
      for (let i = 0; container && i < 24 && !container.contains(main); i++) container = container.parentElement;
      if (!container) return null;
      let sideBranch = side;
      let mainBranch = main;
      while (sideBranch.parentElement !== container && sideBranch.parentElement) sideBranch = sideBranch.parentElement;
      while (mainBranch.parentElement !== container && mainBranch.parentElement) mainBranch = mainBranch.parentElement;
      if (!container || sideBranch === mainBranch) return null;
      const a = side.getBoundingClientRect();
      const b = main.getBoundingClientRect();
      const p = container.getBoundingClientRect();
      if (Math.abs(a.top - b.top) > 80 || Math.min(a.height, b.height) < innerHeight * .45 || p.width < innerWidth * .55) return null;
      return {side, main, sideBranch, mainBranch, container};
    }

    function setHorizontalLayout(width) {
      const cols = findColumns();
      if (!cols) return false;
      sidebar = cols.side;
      mainPane = cols.main;
      const sidebarRect = sidebar.getBoundingClientRect();
      const branchRect = cols.sideBranch.getBoundingClientRect();
      const leftRailWidth = Math.max(0, sidebarRect.left - branchRect.left);
      const sideColumnWidth = Math.round(leftRailWidth + width);
      cols.container.style.setProperty('display', 'flex', 'important');
      cols.container.style.setProperty('flex-direction', 'row', 'important');
      cols.container.style.setProperty('flex-wrap', 'nowrap', 'important');
      cols.container.style.setProperty('width', '100%', 'important');
      cols.container.style.setProperty('min-width', '0', 'important');
      cols.sideBranch.style.setProperty('box-sizing', 'border-box', 'important');
      cols.sideBranch.style.setProperty('width', sideColumnWidth + 'px', 'important');
      cols.sideBranch.style.setProperty('min-width', sideColumnWidth + 'px', 'important');
      cols.sideBranch.style.setProperty('max-width', sideColumnWidth + 'px', 'important');
      cols.sideBranch.style.setProperty('flex', '0 0 ' + sideColumnWidth + 'px', 'important');
      sidebar.style.setProperty('width', width + 'px', 'important');
      sidebar.style.setProperty('min-width', width + 'px', 'important');
      sidebar.style.setProperty('max-width', width + 'px', 'important');
      cols.mainBranch.style.setProperty('box-sizing', 'border-box', 'important');
      cols.mainBranch.style.setProperty('width', '0', 'important');
      cols.mainBranch.style.setProperty('min-width', '0', 'important');
      cols.mainBranch.style.setProperty('flex', '1 1 0%', 'important');
      mainPane.style.setProperty('width', '100%', 'important');
      mainPane.style.setProperty('min-width', '0', 'important');
      localStorage.setItem(key, String(Math.round(width)));
      updateGrip();
      return true;
    }

    function clampWidth(width) {
      const max = Math.max(260, Math.min(520, innerWidth * .58));
      return Math.round(Math.min(max, Math.max(220, width)));
    }

    function updateGrip() {
      if (!sidebar?.isConnected || !grip?.isConnected) return;
      const rect = sidebar.getBoundingClientRect();
      grip.style.left = (rect.right - 5) + 'px';
      grip.style.top = Math.max(0, rect.top) + 'px';
      grip.style.height = Math.max(120, Math.min(innerHeight - Math.max(0, rect.top), rect.height)) + 'px';
    }

    function startDrag(event) {
      if (event.button !== 0 || !sidebar?.isConnected) return;
      event.preventDefault();
      event.stopPropagation();
      dragging = true;
      dragStartX = event.clientX;
      dragStartWidth = sidebar.getBoundingClientRect().width;
      grip.style.background = 'rgba(151,126,255,.16)';
      document.body.style.setProperty('cursor', 'col-resize', 'important');
      document.body.style.setProperty('user-select', 'none', 'important');
      grip.setPointerCapture?.(event.pointerId);
    }

    function moveDrag(event) {
      if (!dragging) return;
      setHorizontalLayout(clampWidth(dragStartWidth + event.clientX - dragStartX));
    }

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      if (grip?.isConnected) grip.style.background = 'transparent';
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    }

    function ensureGrip() {
      const cols = findColumns();
      if (!cols || !document.body) return;
      const changed = sidebar !== cols.side;
      sidebar = cols.side;
      mainPane = cols.main;
      if (!grip?.isConnected) {
        grip = document.createElement('div');
        grip.id = 'workhub2-wa-sidebar-resizer-v2';
        grip.title = 'Arrastrá horizontalmente para ajustar el ancho de la lista';
        grip.style.cssText = 'position:fixed;z-index:2147483647;width:11px;cursor:col-resize;background:transparent;border-left:2px solid rgba(151,126,255,.55);touch-action:none;';
        grip.addEventListener('pointerdown', startDrag);
        grip.addEventListener('pointermove', moveDrag);
        grip.addEventListener('pointerup', endDrag);
        grip.addEventListener('pointercancel', endDrag);
        document.body.appendChild(grip);
      }
      if (changed) {
        const saved = Number(localStorage.getItem(key));
        if (saved >= 220) setHorizontalLayout(clampWidth(saved));
      }
      updateGrip();
    }

    function queueEnsure() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; ensureGrip(); });
    }

    document.addEventListener('pointermove', moveDrag, true);
    document.addEventListener('pointerup', endDrag, true);
    window.addEventListener('resize', queueEnsure);
    window.addEventListener('scroll', updateGrip, true);
    new MutationObserver(queueEnsure).observe(document.documentElement, {childList:true,subtree:true});
    queueEnsure();
    setTimeout(queueEnsure, 500);
    setTimeout(queueEnsure, 1800);
  }.toString()})(${JSON.stringify(serviceId)});`;
  webContents.executeJavaScript(script, true).catch(() => {});
}

function installResizableSidebar(webContents, serviceId) {
  if (!webContents || webContents.isDestroyed()) return;
  const script = `(${function (service) {
    if (window.__workhub2ResizeReady) return;
    window.__workhub2ResizeReady = true;
    const key = 'workhub2-sidebar-width-' + service + (service === 'gmail-hincharc' ? '-v4' : '');
    let sidebar = null;
    let mainPane = null;
    let grip = null;
    let queued = false;
    let dragging = false;

    function findColumns() {
      if (service === 'wa-personal' || service === 'wa-work') {
        const side = document.querySelector('#side');
        const main = document.querySelector('#main');
        return side && main ? {side, main} : null;
      }
      if (service === 'gmail-hincharc') {
        const main = document.querySelector('[role="main"]') || document.querySelector('.aeJ');
        if (!main) return null;
        const mainRect = main.getBoundingClientRect();
        const navTerms = ['recibidos','bandeja de entrada','inbox','destacados','starred','pospuestos','snoozed','importantes','important','enviados','sent','borradores','drafts','etiquetas','labels'];
        const candidates = [...document.querySelectorAll('.aeN, [role="navigation"], nav, aside')]
          .map(el => ({el, rect: el.getBoundingClientRect(), text: (el.innerText || '').toLowerCase()}))
          .map(x => ({...x, score: navTerms.filter(term => x.text.includes(term)).length, rail: /\b(chat|meet)\b/.test(x.text)}))
          .filter(x => x.rect.width >= 150 && x.rect.width <= Math.min(620, innerWidth * .82) && x.rect.height > innerHeight * .35 && x.rect.left < mainRect.left && x.rect.right <= mainRect.left + 60 && x.score >= 2 && !x.rail)
          .sort((a,b) => Math.abs(a.rect.right-mainRect.left)-Math.abs(b.rect.right-mainRect.left) || b.score-a.score || a.rect.width-b.rect.width);
        const side = candidates[0]?.el || null;
        return side ? {side, main} : null;
      }
      if (service.startsWith('gmail-')) {
        const candidates = [...document.querySelectorAll('.aeN, [role="navigation"], nav, aside')]
          .map(el => ({el, rect: el.getBoundingClientRect()}))
          .map(x => ({...x, text: (x.el.innerText || '').toLowerCase()}))
          .filter(x => x.rect.width >= 160 && x.rect.width <= Math.min(520, innerWidth * .72) && x.rect.height > innerHeight * .35 && x.rect.left < innerWidth * .48 && /(recibidos|bandeja de entrada|inbox)/.test(x.text))
          .sort((a,b) => (a.el.matches('.aeN') ? -1 : 0) - (b.el.matches('.aeN') ? -1 : 0) || a.rect.width - b.rect.width || a.rect.left - b.rect.left);
        const side = candidates[0]?.el || null;
        const main = document.querySelector('[role="main"]') || document.querySelector('.aeJ');
        return side && main ? {side, main} : null;
      }
      return null;
    }

    function connectColumns(side, main) {
      let sideBranch = side;
      let mainBranch = main;
      while (sideBranch && mainBranch && sideBranch.parentElement !== mainBranch.parentElement) {
        if (sideBranch.parentElement && sideBranch.parentElement.contains(mainBranch)) sideBranch = sideBranch.parentElement;
        else if (mainBranch.parentElement && mainBranch.parentElement.contains(sideBranch)) mainBranch = mainBranch.parentElement;
        else if (sideBranch.parentElement && mainBranch.parentElement) {
          sideBranch = sideBranch.parentElement;
          mainBranch = mainBranch.parentElement;
        } else return;
      }
      const parent = sideBranch?.parentElement;
      if (!parent || sideBranch === mainBranch) return;
      const rect = parent.getBoundingClientRect();
      if (rect.width < innerWidth * .5 || rect.height < innerHeight * .35) return;
      parent.style.setProperty('display', 'flex', 'important');
      parent.style.setProperty('width', '100%', 'important');
      parent.style.setProperty('min-width', '0', 'important');
      sideBranch.style.setProperty('flex', '0 0 auto', 'important');
      mainBranch.style.setProperty('flex', '1 1 auto', 'important');
      mainBranch.style.setProperty('min-width', '0', 'important');
    }

    function clampWidth(value) {
      const min = service.startsWith('gmail-') ? 120 : 220;
      const max = Math.max(min, Math.min(620, innerWidth * .72));
      return Math.round(Math.max(min, Math.min(max, value)));
    }

    function applyWidth(value) {
      if (!sidebar || !sidebar.isConnected) return;
      const width = clampWidth(value);
      sidebar.style.setProperty('width', width + 'px', 'important');
      sidebar.style.setProperty('min-width', width + 'px', 'important');
      sidebar.style.setProperty('max-width', width + 'px', 'important');
      sidebar.style.setProperty('flex', '0 0 ' + width + 'px', 'important');
      localStorage.setItem(key, String(width));
      updateGrip();
    }

    function updateGrip() {
      if (!sidebar || !sidebar.isConnected || !grip || !grip.isConnected) return;
      const rect = sidebar.getBoundingClientRect();
      grip.style.left = (rect.right - 4) + 'px';
      grip.style.top = Math.max(0, rect.top) + 'px';
      grip.style.height = Math.max(80, Math.min(innerHeight - Math.max(0, rect.top), rect.height)) + 'px';
    }

    function startDrag(event) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      dragging = true;
      document.body.style.setProperty('cursor', 'col-resize', 'important');
      document.body.style.setProperty('user-select', 'none', 'important');
      grip.setPointerCapture(event.pointerId);
    }
    function moveDrag(event) {
      if (!dragging || !sidebar) return;
      applyWidth(event.clientX - sidebar.getBoundingClientRect().left);
    }
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    }

    function ensureGrip() {
      const columns = findColumns();
      if (!columns || !document.body) return;
      const found = columns.side;
      if (!grip || !grip.isConnected) {
        grip = document.createElement('div');
        grip.id = 'workhub2-sidebar-resizer';
        grip.title = 'Arrastrá para cambiar el ancho del panel';
        grip.style.cssText = 'position:fixed;z-index:2147483647;width:10px;cursor:col-resize;background:transparent;border-left:2px solid rgba(151,126,255,.38);touch-action:none;';
        grip.addEventListener('pointerenter', () => { grip.style.background = 'rgba(151,126,255,.12)'; });
        grip.addEventListener('pointerleave', () => { if (!dragging) grip.style.background = 'transparent'; });
        grip.addEventListener('pointerdown', startDrag);
        grip.addEventListener('pointermove', moveDrag);
        grip.addEventListener('pointerup', endDrag);
        grip.addEventListener('pointercancel', endDrag);
        document.body.appendChild(grip);
      }
      const saved = Number(localStorage.getItem(key));
      const changedSidebar = sidebar !== found;
      sidebar = found;
      mainPane = columns.main;
      connectColumns(sidebar, mainPane);
      if (changedSidebar || !sidebar.dataset.workhub2ResizeApplied) {
        sidebar.dataset.workhub2ResizeApplied = '1';
        if (saved > 0) applyWidth(saved);
      }
      updateGrip();
    }

    function queueEnsure() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; ensureGrip(); });
    }

    document.addEventListener('pointermove', moveDrag, true);
    document.addEventListener('pointerup', endDrag, true);
    window.addEventListener('resize', queueEnsure);
    window.addEventListener('scroll', updateGrip, true);
    new MutationObserver(queueEnsure).observe(document.documentElement, {childList:true,subtree:true});
    queueEnsure();
    setTimeout(queueEnsure, 500);
    setTimeout(queueEnsure, 1800);
  }.toString()})(${JSON.stringify(serviceId)});`;
  webContents.executeJavaScript(script, true).catch(() => {});
}

function validatedAiTarget(viewId, serviceId) {
  const candidate = currentAiTargets?.[viewId] ?? currentAiTargets?.[serviceId];
  if (serviceId === 'metadata') {
    try { const url = new URL(candidate); if (['https:', 'http:'].includes(url.protocol)) return url.href; } catch {}
    return sites.metadata;
  }
  if (serviceId === 'microinfluencers') {
    if (typeof candidate === 'string' && candidate.trim()) {
      try {
        const parsed = new URL(candidate.trim());
        if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) return parsed.href;
      } catch {}
    }
    return 'data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;height:100vh;display:grid;place-items:center;background:#f4f5f7;color:#344054;font:15px system-ui}main{max-width:280px;padding:24px;text-align:center}strong{font-size:18px}p{line-height:1.5;color:#667085}</style><main><strong>Vista móvil 390 × 844</strong><p>Pegá arriba el enlace de vista previa de Microinfluencers y tocá recargar.</p></main>');
  }
  if (typeof candidate !== 'string' || !candidate) return sites[serviceId];
  try {
    const parsed = new URL(candidate);
    const allowed = ['gpt-personal','gpt-alterframe'].includes(serviceId) ? parsed.hostname === 'chatgpt.com'
      : serviceId === 'ia-nico' ? parsed.hostname === 'portal-colegas.vercel.app'
      : serviceId === 'gemini-personal' ? parsed.hostname === 'gemini.google.com' : false;
    return parsed.protocol === 'https:' && allowed ? parsed.href : sites[serviceId];
  } catch { return sites[serviceId]; }
}
function installRemotePointerPolicy(webContents) {
  // Remote sites can ship desktop-shell CSS. In a frameless Electron window,
  // app-region:drag turns those parts of a page into non-client areas: mouse
  // clicks never reach the site's controls. Only DocsHub's own title bar may
  // declare native window drag regions. This is unrelated to HTML file DnD.
  webContents.on('dom-ready', () => {
    if (webContents.isDestroyed()) return;
    // User-origin !important wins over site styles, including inline styles.
    // A stylesheet also covers controls added later by SPA navigation. Install
    // again for every new document; did-finish-load can be delayed by resources.
    webContents.insertCSS(`
      :root, :root *, :root::before, :root::after,
      :root *::before, :root *::after {
        -webkit-app-region: no-drag !important;
        app-region: no-drag !important;
      }
    `, { cssOrigin: 'user' }).catch(error => {
      if (!webContents.isDestroyed()) console.warn('DocsHub remote pointer policy:', error.message);
    });
  });
}
function makeView(viewId) {
  // Split and IA panel IDs carry their own WebContents key before `::`,
  // while the final segment names the underlying service.
  const id = viewId.includes('::') ? viewId.split('::').at(-1) : viewId;
  if (!sites[id]) return null;
  let view = remoteViews.get(viewId);
  const targetUrl = validatedAiTarget(viewId, id);
  if (!view || view.webContents.isDestroyed()) {
    // Keep a stable, isolated profile for each service. AI panels use a unique
    // WebContents id but share the profile of the selected AI service.
    const sessionProfile = id;
    const partition = `persist:workhub2-${sessionProfile}`;
    view = new WebContentsView({
      webPreferences: { partition, contextIsolation: true, sandbox: true, nodeIntegration: false, ...(['gpt-personal', 'gpt-alterframe', 'ia-nico', 'metadata'].includes(id) ? { preload: path.join(__dirname, 'attachment-preload.cjs') } : {}) }
    });
    if (['gpt-personal', 'gpt-alterframe'].includes(id)) {
      gptClipboard.install(viewId, view.webContents);
      view.webContents.on('focus', () => { lastGptViewId = viewId; });
    }
    view.googleDefaultUserAgent = view.webContents.getUserAgent();
    installRemotePointerPolicy(view.webContents);
    if (isMessagingService(viewId)) view.webContents.setAudioMuted(workMode);
    configureNotificationPermissions(view.webContents.session);
    if (id === 'metadata') metadataDownloads.install(view.webContents.session);
    // Some services reject Electron's default UA. Report the exact Chromium
    // version bundled with this Electron build for messaging and AI sites.
    if (['wa-personal', 'wa-work', 'gpt-personal', 'gpt-alterframe', 'ia-nico', 'gemini-personal', 'facebook', 'linkedin'].includes(id)) {
      const chromeVersion = process.versions.chrome || '120.0.0.0';
      view.webContents.setUserAgent(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`);
    }
    view.providerUserAgent = view.webContents.getUserAgent();
    view.webContents.setWindowOpenHandler(({ url }) => {
      // Keep Google authentication inside its existing isolated remote view.
      let googleSignInPopup = false;
      try {
        const popupUrl = new URL(url);
        googleSignInPopup = popupUrl.protocol === 'https:' &&
          ((id === 'gmail-deva' && ['accounts.google.com', 'myaccount.google.com'].includes(popupUrl.hostname)) ||
           (id === 'gemini-personal' && ['accounts.google.com', 'myaccount.google.com', 'consent.google.com'].includes(popupUrl.hostname)));
      } catch {}
      if (googleSignInPopup) {
        setImmediate(() => {
          if (view && !view.webContents.isDestroyed()) {
            view.webContents.loadURL(url).catch(error => {
              if (error.code !== 'ERR_ABORTED') win?.webContents.send('view-error', { id, viewId, code: error.code || 'LOAD_FAILED', desc: error.message });
            });
          }
        });
        return { action: 'deny' };
      }
      if (id === 'metadata' && /^(https?:|blob:)/.test(url)) {
        if (url.startsWith('blob:')) view.webContents.downloadURL(url);
        else view.webContents.loadURL(url).catch(() => {});
        return { action: 'deny' };
      }
      if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
      return { action: 'deny' };
    });
    view.webContents.on('will-navigate', (event, url) => {
      if (!/^https?:/.test(url)) event.preventDefault();
    });
    view.webContents.on('did-fail-load', (_event, code, desc, url, isMainFrame) => {
      if (isMainFrame && code !== -3) win?.webContents.send('view-error', { id, viewId, code, desc, url });
    });
    view.webContents.on('did-finish-load', () => {
      win?.webContents.send('view-ready', { viewId });
      applyRemoteTheme(view.webContents, currentTheme);
      if (id === 'microinfluencers') {
        try {
          if (!view.webContents.debugger.isAttached()) view.webContents.debugger.attach('1.3');
          view.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } }).catch(() => {});
        } catch {}
      }
      if (id === 'wa-personal' || id === 'wa-work') installWhatsAppSidebarResize(view.webContents, id);
      // Gmail already has its own hamburger menu to collapse/expand navigation.
      // Do not inject DocsHub's draggable width grip into Gmail: its position
      // differs across accounts and can overlap the message list.
      else if (['gpt-personal', 'gpt-alterframe', 'ia-nico', 'telegram'].includes(id)) installResizableSidebar(view.webContents, sessionProfile);
    });
    view.webContents.on('did-navigate', (_event, url) => {
      if (viewId.startsWith('ai-chat-')) win?.webContents.send('ai-view-navigation', { viewId, url });
    });
    view.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame === false) return;
      if (viewId.startsWith('ai-chat-')) win?.webContents.send('ai-view-navigation', { viewId, url });
    });
    loadedViewTargets.set(viewId, targetUrl);
    view.webContents.loadURL(targetUrl).catch(error => {
      if (error.code !== 'ERR_ABORTED') win?.webContents.send('view-error', { id, viewId, code: error.code || 'LOAD_FAILED', desc: error.message });
    });
    remoteViews.set(viewId, view);
  // AI URLs from the renderer are history snapshots for the next launch, not
  // navigation commands. Replaying them here interrupts SPA routing and can
  // restore a stale URL while another tab's navigation event is still in IPC.
  } else if (['microinfluencers', 'metadata'].includes(id) && loadedViewTargets.get(viewId) !== targetUrl && !view.webContents.isDestroyed()) {
    loadedViewTargets.set(viewId, targetUrl);
    view.webContents.loadURL(targetUrl).catch(error => {
      if (error.code !== 'ERR_ABORTED') win?.webContents.send('view-error', { id, viewId, code: error.code || 'LOAD_FAILED', desc: error.message });
    });
  }
  return view;
}
function globalSplitCellRects(ids, bounds) {
  const usableH = Math.max(220, bounds.height - contentTop - 25);
  const gap = 5;
  const count = Math.min(4, ids.length);
  const firstW = Math.floor((bounds.width - gap) * currentSplitRatio / 100);
  const secondW = bounds.width - firstW - gap;
  const topH = Math.floor((usableH - gap) * currentAiRatios.y / 100);
  const availableW3 = bounds.width - 2 * gap;
  const firstW3 = Math.floor(availableW3 * currentSplitRatio / 100);
  const secondW3 = Math.floor(availableW3 * (currentSplitRatio2 - currentSplitRatio) / 100);
  return ids.map((id, index) => {
    if (!id || !sites[id.includes('::') ? id.split('::').at(-1) : id]) return null;
    let rect;
    if (count === 1) rect = { x: 0, y: contentTop, width: bounds.width, height: usableH };
    else if (count === 2) rect = { x: index === 0 ? 0 : firstW + gap, y: contentTop, width: index === 0 ? firstW : secondW, height: usableH };
    else if (count === 3) rect = { x: index === 0 ? 0 : index === 1 ? firstW3 + gap : firstW3 + secondW3 + 2 * gap, y: contentTop, width: index === 0 ? firstW3 : index === 1 ? secondW3 : availableW3 - firstW3 - secondW3, height: usableH };
    else {
      const col = index % 2;
      const row = Math.floor(index / 2);
      rect = { x: col === 0 ? 0 : firstW + gap, y: row === 0 ? contentTop : contentTop + topH + gap, width: col === 0 ? firstW : secondW, height: row === 0 ? topH : usableH - topH - gap };
    }
    return rect;
  });
}
function globalSplitRects(ids, bounds) {
  return globalSplitCellRects(ids, bounds).map((rect, index) => {
    const id = ids[index];
    return rect && (id?.includes('::') ? id.split('::').at(-1) : id) === 'microinfluencers' ? fitMobilePreview(rect) : rect;
  });
}
function fitMobilePreview(rect) {
  const aspect = 390 / 844;
  let width = Math.max(1, rect.width), height = Math.max(1, rect.height);
  if (width / height > aspect) width = Math.floor(height * aspect);
  else height = Math.floor(width / aspect);
  return { x: rect.x + Math.floor((rect.width - width) / 2), y: rect.y + Math.floor((rect.height - height) / 2), width, height };
}
function aiSplitEntries(ids) {
  const serviceId = id => id.includes('::') ? id.split('::').at(-1) : id;
  return [...new Set(ids)].filter(id => sites[serviceId(id)]).slice(0, 4);
}
function aiSplitRects(ids, bounds) {
  const unique = aiSplitEntries(ids);
  const usableH = Math.max(220, bounds.height - contentTop - 25);
  const gap = 5;
  const x = currentAiRatios.x / 100;
  const y = currentAiRatios.y / 100;
  const widths = unique.length === 2 ? [Math.floor((bounds.width-gap)*x), bounds.width-gap-Math.floor((bounds.width-gap)*x)] : unique.length === 3 ? [Math.floor((bounds.width-2*gap)*x),0,0] : [Math.floor((bounds.width-gap)*x),0,0,0];
  if (unique.length === 3) { widths[1] = widths[2] = Math.floor((bounds.width-2*gap-widths[0])/2); widths[2] = bounds.width-2*gap-widths[0]-widths[1]; }
  if (unique.length === 4) widths[1] = bounds.width-gap-widths[0];
  return unique.map((id,index) => {
    if (unique.length === 1) return { x:0,y:contentTop,width:bounds.width,height:usableH };
    if (unique.length < 4) return { x:index===0?0:widths.slice(0,index).reduce((a,b)=>a+b,0)+gap*index,y:contentTop,width:widths[index],height:usableH };
    const row=Math.floor(index/2),col=index%2,topH=Math.floor((usableH-gap)*y);
    return { x:col===0?0:widths[0]+gap,y:row===0?contentTop:contentTop+topH+gap,width:widths[col],height:row===0?topH:usableH-topH-gap };
  });
}
function splitterDocument() {
  const html = `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}.grip{position:absolute;inset:0;display:grid;place-items:center;background:transparent;touch-action:none;user-select:none}.grip.x,.grip.x2{cursor:col-resize}.grip.y{cursor:row-resize}.line{border-radius:999px;background:rgba(182,190,205,.42);box-shadow:0 0 0 1px rgba(10,15,23,.18);transition:background .12s,box-shadow .12s}.x .line,.x2 .line{width:2px;height:38px}.y .line{height:2px;width:38px}.grip:hover .line,.grip.dragging .line{background:#b5a2ff;box-shadow:0 0 0 1px rgba(23,16,47,.2),0 0 12px rgba(157,133,240,.5)}.grip.dragging.x .line,.grip.dragging.x2 .line{width:3px;height:48px}.grip.dragging.y .line{height:3px;width:48px}</style><div class="grip ${'AXIS'}" data-axis="${'AXIS'}" role="slider" aria-label="Arrastrar para ajustar el tamaño de los paneles" tabindex="0"><span class="line"></span></div>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
function microRefreshDocument() {
  const html = `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}button{width:28px;height:28px;padding:0;display:grid;place-items:center;border:1px solid rgba(255,255,255,.18);border-radius:8px;color:#d5caff;background:rgba(20,22,31,.92);cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)}button:hover{background:#39304f;color:#fff;border-color:#a995ff}svg{width:15px;height:15px;pointer-events:none}</style><button type="button" title="Actualizar Microinfluencers" aria-label="Actualizar Microinfluencers"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3"/></svg></button>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
function ensureMicroRefreshView() {
  if (microRefreshView) return;
  microRefreshView = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'splitter-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  microRefreshView.setBackgroundColor('#00000000');
  microRefreshView.webContents.loadURL(microRefreshDocument());
}
function syncMicroRefreshView() {
  if (!win) return;
  const index = Array.isArray(currentSplitIds) ? currentSplitIds.findIndex(id => (id?.includes('::') ? id.split('::').at(-1) : id) === 'microinfluencers') : -1;
  if (index < 0 || currentSplitIds.length < 2) {
    if (microRefreshAttached) { win.contentView.removeChildView(microRefreshView); microRefreshAttached = false; }
    currentMicroRefreshViewId = null;
    return;
  }
  ensureMicroRefreshView();
  currentMicroRefreshViewId = currentSplitIds[index];
  const rect = globalSplitCellRects(currentSplitIds, win.getContentBounds())[index];
  if (!rect) return;
  // Keep the control in the panel's native title strip, outside the embedded
  // page bounds. This avoids hit-testing conflicts with remote site content.
  microRefreshView.setBounds({ x: rect.x + 91, y: contentTop - 6, width: 29, height: 28 });
  if (!microRefreshAttached) { win.contentView.addChildView(microRefreshView); microRefreshAttached = true; }
}
function ensureSplitterViews() {
  const options = { webPreferences: { preload: path.join(__dirname, 'splitter-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } };
  if (!splitterXView) { splitterXView = new WebContentsView(options); splitterXView.setBackgroundColor('#00000000'); splitterXView.webContents.loadURL(splitterDocument().replaceAll('AXIS','x')); }
  if (!splitterX2View) { splitterX2View = new WebContentsView(options); splitterX2View.setBackgroundColor('#00000000'); splitterX2View.webContents.loadURL(splitterDocument().replaceAll('AXIS','x2')); }
  if (!splitterYView) { splitterYView = new WebContentsView(options); splitterYView.setBackgroundColor('#00000000'); splitterYView.webContents.loadURL(splitterDocument().replaceAll('AXIS','y')); }
}
function detachSplitterViews() {
  splitterDraggingAxis = null;
  if (splitterXAttached) { win.contentView.removeChildView(splitterXView); splitterXAttached = false; }
  if (splitterX2Attached) { win.contentView.removeChildView(splitterX2View); splitterX2Attached = false; }
  if (splitterYAttached) { win.contentView.removeChildView(splitterYView); splitterYAttached = false; }
}
function syncSplitterViews() {
  if (!win) return;
  const global = Array.isArray(currentSplitIds);
  const ids = global ? currentSplitIds : currentAiLayoutIds;
  const count = global ? Math.min(4, ids?.length || 0) : aiSplitEntries(ids || []).length;
  if (!ids || count < 2) { detachSplitterViews(); return; }
  ensureSplitterViews();
  const bounds = win.getContentBounds();
  const usableH = Math.max(220, bounds.height - contentTop - 25);
  const gap = 6;
  const threeGlobalColumns = global && count === 3;
  const x = global ? currentSplitRatio : currentAiRatios.x;
  const xEnabled = count >= 2;
  const xHeight = usableH;
  if (threeGlobalColumns) {
    const available = bounds.width - 10;
    const first = Math.floor(available * currentSplitRatio / 100);
    const second = Math.floor(available * (currentSplitRatio2 - currentSplitRatio) / 100);
    const x1 = first + 2.5;
    const x2 = first + second + 7.5;
    if (splitterDraggingAxis !== 'x') splitterXView.setBounds({ x: Math.max(0, Math.round(x1-gap/2)), y: contentTop, width: gap, height: usableH });
    if (!splitterXAttached) { win.contentView.addChildView(splitterXView); splitterXAttached = true; }
    if (splitterDraggingAxis !== 'x2') splitterX2View.setBounds({ x: Math.max(0, Math.round(x2-gap/2)), y: contentTop, width: gap, height: usableH });
    if (!splitterX2Attached) { win.contentView.addChildView(splitterX2View); splitterX2Attached = true; }
  } else if (splitterX2Attached) {
    win.contentView.removeChildView(splitterX2View); splitterX2Attached = false;
  }
  if (xEnabled) {
    const aiThreeColumnLayout = !global && count === 3;
    const xAvailable = aiThreeColumnLayout ? bounds.width - 2 * 5 : bounds.width - 5;
    const xPos = Math.round(xAvailable * x / 100) + (aiThreeColumnLayout ? 5 : 0);
    if (!threeGlobalColumns && splitterDraggingAxis !== 'x') splitterXView.setBounds({ x: Math.max(0, xPos-gap/2), y: contentTop, width: gap, height: xHeight });
    if (!splitterXAttached) { win.contentView.addChildView(splitterXView); splitterXAttached = true; }
  } else if (splitterXAttached) {
    win.contentView.removeChildView(splitterXView); splitterXAttached = false;
  }
  const yEnabled = (global && count >= 4) || (!global && count === 4);
  if (yEnabled) {
    const yPos = contentTop + Math.round((usableH-5) * currentAiRatios.y / 100) + 2.5;
    if (splitterDraggingAxis !== 'y') splitterYView.setBounds({ x: 0, y: Math.max(contentTop, yPos-gap/2), width: bounds.width, height: gap });
    if (!splitterYAttached) { win.contentView.addChildView(splitterYView); splitterYAttached = true; }
  } else if (splitterYAttached) {
    win.contentView.removeChildView(splitterYView); splitterYAttached = false;
  }
}
function resizeCurrentSplitViews() {
  if (!win) return;
  const bounds = win.getContentBounds();
  let rects;
  if (Array.isArray(currentSplitIds)) rects = globalSplitRects(currentSplitIds, bounds);
  else if (Array.isArray(currentAiLayoutIds) && currentAiLayoutIds.length) rects = aiSplitRects(currentAiLayoutIds, bounds);
  else return;
  const activeRects = rects.filter(Boolean);
  activeRects.forEach((rect,index) => currentViews[index]?.setBounds(rect));
  syncSplitterViews();
  syncMicroRefreshView();
}
function attachRemoteView(view, bounds) {
  const previous = view.getBounds();
  if (['x', 'y', 'width', 'height'].some(key => previous[key] !== bounds[key])) view.setBounds(bounds);
  if (!win.contentView.children.includes(view)) win.contentView.addChildView(view);
}
function finishRemoteLayout(previousViews) {
  const active = new Set(currentViews);
  const remote = new Set(remoteViews.values());
  // A layout can change provider/global mode while reusing its WebContents.
  // Sweep every child, not only the previous currentViews snapshot: a stale
  // native WebContentsView above the active panes can paint correctly yet
  // steal their mouse clicks.
  for (const view of new Set([...previousViews, ...win.contentView.children])) {
    if (remote.has(view) && !active.has(view)) win.contentView.removeChildView(view);
  }
  // Pin the selected panes to a deterministic left-to-right stack. Electron
  // routes pointer input using this native child order when bounds touch or
  // overlap by a pixel after DPI rounding.
  currentViews.forEach((view, index) => {
    if (win.contentView.children[index] !== view) win.contentView.addChildView(view, index);
  });
  const paneCount = currentSplitIds?.length || currentAiLayoutIds?.length || currentLayoutIds.length;
  if (paneCount === 1 && currentViews.length === 1 && !previousViews.includes(currentViews[0])) currentViews[0].webContents.focus();
}
function layoutViews(ids, bounds, splitIds = null, splitRatio = 50, aiLayoutIds = null, aiRatios = null, aiViewTargets = null) {
  const previousGlobalCount = Array.isArray(currentSplitIds) ? currentSplitIds.length : 0;
  let resetThreeColumns = false;
  currentLayoutIds = ids;
  currentSplitIds = splitIds;
  if (!Array.isArray(splitIds) && microRefreshAttached) { win.contentView.removeChildView(microRefreshView); microRefreshAttached = false; currentMicroRefreshViewId = null; }
  currentSplitRatio = Math.max(25, Math.min(75, Number(splitRatio) || 50));
  if (Array.isArray(splitIds) && splitIds.length === 3 && previousGlobalCount !== 3) {
    currentSplitRatio = 33.33;
    currentSplitRatio2 = 66.67;
    resetThreeColumns = true;
  }
  currentAiLayoutIds = Array.isArray(aiLayoutIds) ? aiLayoutIds : null;
  const aiColumnsMax = !Array.isArray(splitIds) && aiSplitEntries(currentAiLayoutIds || []).length === 3 ? 50 : 75;
  currentAiRatios = { x: Math.max(25,Math.min(aiColumnsMax,Number(aiRatios?.x)||50)), x2: Math.max(43,Math.min(82,Number(aiRatios?.x2)||currentSplitRatio2)), y: Math.max(25,Math.min(75,Number(aiRatios?.y)||50)) };
  currentAiTargets = aiViewTargets && typeof aiViewTargets === 'object' ? aiViewTargets : {};
  detachSplitterViews();
  const previousViews = currentViews;
  currentViews = [];
  const serviceId = id => id.includes('::') ? id.split('::').at(-1) : id;
  if (Array.isArray(splitIds)) {
    const { width, height } = bounds;
    const usableH = Math.max(220, height - contentTop - 25);
    const gap = 5;
    const count = Math.min(4, splitIds.length);
    const firstW = Math.floor((width - gap) * currentSplitRatio / 100);
    const secondW = width - firstW - gap;
    const topH = Math.floor((usableH - gap) * currentAiRatios.y / 100);
    const availableW3 = width - 2 * gap;
    const firstW3 = Math.floor(availableW3 * currentSplitRatio / 100);
    const secondW3 = Math.floor(availableW3 * (currentSplitRatio2 - currentSplitRatio) / 100);
    splitIds.forEach((id, index) => {
      if (!id || !sites[serviceId(id)]) return;
      const view = makeView(id);
      if (!view) return;
      let rect;
      if (count === 1) rect = { x: 0, y: contentTop, width, height: usableH };
      else if (count === 2) rect = { x: index === 0 ? 0 : firstW + gap, y: contentTop, width: index === 0 ? firstW : secondW, height: usableH };
      else if (count === 3) rect = { x: index === 0 ? 0 : index === 1 ? firstW3 + gap : firstW3 + secondW3 + 2 * gap, y: contentTop, width: index === 0 ? firstW3 : index === 1 ? secondW3 : availableW3 - firstW3 - secondW3, height: usableH };
      else {
        const col = index % 2;
        const row = Math.floor(index / 2);
        rect = { x: col === 0 ? 0 : firstW + gap, y: row === 0 ? contentTop : contentTop + topH + gap, width: col === 0 ? firstW : secondW, height: row === 0 ? topH : usableH - topH - gap };
      }
      attachRemoteView(view, id.includes('::') && id.split('::').at(-1) === 'microinfluencers' ? fitMobilePreview(rect) : rect);
      currentViews.push(view);
    });
    finishRemoteLayout(previousViews);
    syncSplitterViews();
    syncMicroRefreshView();
    if (resetThreeColumns) publishSplitRatios();
    return;
  }
  if (Array.isArray(aiLayoutIds) && aiLayoutIds.length) {
    const unique = [...new Set(aiLayoutIds)].filter(id => sites[serviceId(id)]).slice(0, 4);
    const { width, height } = bounds;
    const usableH = Math.max(220, height - contentTop - 25);
    const gap = 5;
    const x = currentAiRatios.x / 100;
    const y = currentAiRatios.y / 100;
    const widths = unique.length === 2 ? [Math.floor((width-gap)*x), 0] : unique.length === 3 ? [Math.floor((width-2*gap)*x), 0, 0] : [Math.floor((width-gap)*x), 0, 0, 0];
    if (unique.length === 2) widths[1] = width - gap - widths[0];
    if (unique.length === 3) { widths[1] = widths[2] = Math.floor((width - 2*gap - widths[0]) / 2); widths[2] = width - 2*gap - widths[0] - widths[1]; }
    if (unique.length === 4) widths[1] = width - gap - widths[0];
    unique.forEach((id, index) => {
      const view = makeView(id);
      if (!view) return;
      let rect;
      if (unique.length === 1) rect = { x: 0, y: contentTop, width, height: usableH };
      else if (unique.length < 4) rect = { x: index === 0 ? 0 : widths.slice(0,index).reduce((a,b)=>a+b,0) + gap*index, y: contentTop, width: widths[index], height: usableH };
      else {
        const row = Math.floor(index / 2), col = index % 2;
        const colW = widths[col];
        const topH = Math.floor((usableH-gap)*y);
        const rowY = row === 0 ? contentTop : contentTop + topH + gap;
        rect = { x: col === 0 ? 0 : widths[0] + gap, y: rowY, width: colW, height: row === 0 ? topH : usableH - topH - gap };
      }
      attachRemoteView(view, rect);
      currentViews.push(view);
    });
    finishRemoteLayout(previousViews);
    syncSplitterViews();
    return;
  }
  const unique = [...new Set(ids)].filter(id => sites[serviceId(id)]).slice(0, 6);
  const { width, height } = bounds;
  const usableH = Math.max(220, height - contentTop - 25);
  const gap = 5;
  const cols = unique.length === 4 ? 2 : unique.length >= 5 ? 3 : Math.max(1, unique.length);
  const rows = Math.ceil(unique.length / cols);
  const cellW = Math.floor((width - gap * (cols - 1)) / cols);
  const cellH = Math.floor((usableH - gap * (rows - 1)) / rows);
  unique.forEach((id, i) => {
    const view = makeView(id);
    if (!view) return;
    const row = Math.floor(i / cols);
    const centeredFinalPair = unique.length === 5 && row === 1;
    const x = centeredFinalPair ? Math.floor((width - (cellW * 2 + gap)) / 2) + (i % cols) * (cellW + gap) : (i % cols) * (cellW + gap);
      const rect = { x, y: contentTop + row * (cellH + gap), width: cellW, height: cellH };
      attachRemoteView(view, id === 'microinfluencers' ? fitMobilePreview(rect) : rect);
    currentViews.push(view);
  });
  finishRemoteLayout(previousViews);
}
function startupDisplay() {
  const displays = screen.getAllDisplays().slice().sort((a, b) =>
    (a.bounds.x + a.bounds.width / 2) - (b.bounds.x + b.bounds.width / 2) || a.bounds.y - b.bounds.y
  );
  // An even number has no single middle monitor; use Windows' primary display.
  return displays.length % 2 ? displays[Math.floor(displays.length / 2)] : screen.getPrimaryDisplay();
}
function showWindow() {
  // Position on the middle display before maximizing.
  const area = startupDisplay().workArea;
  win = new BrowserWindow({
    x: area.x, y: area.y, width: area.width, height: area.height,
    minWidth: 1040, minHeight: 700,
    backgroundColor: '#0b0f14', title: 'DocsHub', frame: false, thickFrame: true,
    icon: path.join(__dirname, '../assets/docshub.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  gptClipboard.installHost(win.webContents, () => {
    const gptIds = [...remoteViews].filter(([id, view]) => currentViews.includes(view) && ['gpt-personal','gpt-alterframe'].includes(id.split('::').at(-1))).map(([id]) => id);
    return gptIds.includes(lastGptViewId) ? lastGptViewId : gptIds.length === 1 ? gptIds[0] : null;
  });
  require('./windows-identity.cjs').applyWindowsIdentity(win,path.resolve(__dirname,'..'));
  win.maximize();
  win.setMenu(null);
  win.setMenuBarVisibility(false);
  if (process.argv.includes('--dev')) win.loadURL('http://127.0.0.1:5187');
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
  win.on('resize', () => {
    layoutViews(currentLayoutIds, win.getContentBounds(), currentSplitIds, currentSplitRatio, currentAiLayoutIds, currentAiRatios, currentAiTargets);
  });
  win.on('closed', () => { imageCompare.closeAll(); win = null; currentViews = []; });
}
if (ownsProfile) app.whenReady().then(() => { startClipboardWorker(); showWindow(); require('./desktop-update-ipc.cjs').installDesktopUpdater({app,ipcMain,dialog,host:()=>win,root:path.resolve(__dirname,'..')}); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!win) showWindow(); });
ipcMain.handle('layout-views', (_event, { ids, top, splitIds, splitRatio, aiLayoutIds, aiRatios, aiViewTargets }) => {
  if (!win) return;
  contentTop = Math.max(80, Math.round(top || 112));
  layoutViews(Array.isArray(ids) ? ids : [], win.getContentBounds(), Array.isArray(splitIds) ? splitIds : null, splitRatio, Array.isArray(aiLayoutIds) ? aiLayoutIds : null, aiRatios, aiViewTargets);
});
function publishSplitRatios() {
  const globalThree = Array.isArray(currentSplitIds) && currentSplitIds.length === 3;
  win?.webContents.send('split-ratios-changed', {
    x: Array.isArray(currentSplitIds) ? currentSplitRatio : currentAiRatios.x,
    x2: globalThree ? currentSplitRatio2 : currentAiRatios.x2,
    y: currentAiRatios.y
  });
}
function applySplitRatios({ x, x2, y } = {}) {
  const global = Array.isArray(currentSplitIds);
  const count = global ? Math.min(4, currentSplitIds?.length || 0) : aiSplitEntries(currentAiLayoutIds || []).length;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Math.round((Number(value) || 50) * 100) / 100));
  const clampX = value => clamp(value, 25, global && count === 3 ? currentSplitRatio2 - 18 : !global && count === 3 ? 50 : 75);
  const clampY = value => clamp(value, 75);
  if (x !== undefined) {
    currentSplitRatio = clampX(x);
    currentAiRatios.x = clampX(x);
  }
  if (x2 !== undefined && global && count === 3) { currentSplitRatio2 = clamp(x2, currentSplitRatio + 18, 82); currentAiRatios.x2 = currentSplitRatio2; }
  if (y !== undefined) currentAiRatios.y = clampY(y);
  resizeCurrentSplitViews();
  publishSplitRatios();
  return { x: Array.isArray(currentSplitIds) ? currentSplitRatio : currentAiRatios.x, y: currentAiRatios.y };
}
ipcMain.on('splitter-pointer', (_event, { axis, screenX, screenY } = {}) => {
  if (!win || !['x', 'x2', 'y'].includes(axis)) return;
  const bounds = win.getContentBounds();
  const usableH = Math.max(220, bounds.height - contentTop - 25);
  if (axis === 'x' || axis === 'x2') {
    const global = Array.isArray(currentSplitIds);
    const ids = global ? currentSplitIds : currentAiLayoutIds;
    const count = global ? Math.min(4, ids?.length || 0) : aiSplitEntries(ids || []).length;
    if (global && count === 3) {
      const available = bounds.width - 10;
      const ratio = ((Number(screenX) - bounds.x - (axis === 'x' ? 2.5 : 7.5)) / available) * 100;
      applySplitRatios(axis === 'x' ? { x: ratio } : { x2: ratio });
      return;
    }
    if (axis === 'x2') return;
    const available = !global && count === 3 ? bounds.width - 10 : bounds.width - 5;
    const offset = !global && count === 3 ? 5 : 0;
    const x = ((Number(screenX) - bounds.x - offset) / available) * 100;
    applySplitRatios({ x });
  } else {
    const y = ((Number(screenY) - bounds.y - contentTop - 2.5) / (usableH - 5)) * 100;
    applySplitRatios({ y });
  }
});
ipcMain.on('splitter-drag-state', (_event, axis) => {
  splitterDraggingAxis = axis === 'x' || axis === 'x2' || axis === 'y' ? axis : null;
  syncSplitterViews();
});
ipcMain.on('micro-preview-refresh', () => {
  const view = currentMicroRefreshViewId ? remoteViews.get(currentMicroRefreshViewId) : null;
  if (view && !view.webContents.isDestroyed()) view.webContents.reloadIgnoringCache();
});
ipcMain.handle('close-ai-view', (_event, viewId) => {
  if (typeof viewId !== 'string' || !viewId.startsWith('ai-chat-')) return { ok: false };
  const view = remoteViews.get(viewId);
  if (!view) return { ok: true };
  try { win?.contentView.removeChildView(view); } catch {}
  try { view.webContents.close({ waitForBeforeUnload: false }); } catch {}
  remoteViews.delete(viewId);
  loadedViewTargets.delete(viewId);
  currentViews = currentViews.filter(item => item !== view);
  return { ok: true };
});
async function navigateGoogleConnection(viewId, destination = 'gmail') {
  const view = remoteViews.get(viewId);
  const service = String(viewId || '').split('::').at(-1);
  if (service !== 'gemini-personal' || !view || view.webContents.isDestroyed()) {
    return { ok: false, error: 'Abrí una subpestaña de Gemini Personal para conectar Google.' };
  }
  if (!['gmail', 'gemini'].includes(destination)) return { ok: false, error: 'Destino de Google inválido.' };
  const url = destination === 'gmail'
    ? 'https://mail.google.com/mail/u/0/'
    : sites['gemini-personal'];
  try {
    // Reproduce the native UA used by Gmail Personal in the original Workhub.
    // Both stages keep this same WebContents and DocsHub Google partition.
    view.webContents.setUserAgent(destination === 'gmail' ? view.googleDefaultUserAgent : view.providerUserAgent);
    await view.webContents.loadURL(url);
    return { ok: true };
  } catch (error) {
    if (error.code === 'ERR_ABORTED') return { ok: true };
    return { ok: false, error: error.message };
  }
}
ipcMain.handle('google-connection-view', (_event, { viewId, destination } = {}) => navigateGoogleConnection(viewId, destination));
ipcMain.handle('paste-gpt-image', async (event, viewId) => {
  if (event.sender !== win?.webContents) return { ok: false, error: 'Solicitud inválida.' };
  return gptClipboard.pasteImage(viewId);
});
ipcMain.handle('reload-view', async (_event, { viewId, login = false } = {}) => {
  const view = remoteViews.get(viewId);
  if (!view || view.webContents.isDestroyed()) return { ok: false, error: 'El panel no está disponible. Volvé a seleccionarlo.' };
  const serviceId = viewId.includes('::') ? viewId.split('::')[1] : viewId;
  try {
    if (login) {
      if (serviceId === 'gemini-personal') return navigateGoogleConnection(viewId, 'gmail');
      const loginUrl = ['gpt-personal', 'gpt-alterframe'].includes(serviceId) ? 'https://chatgpt.com/auth/login' : null;
      if (!loginUrl) return { ok: false, error: 'Este panel no permite iniciar sesión.' };
      await view.webContents.loadURL(loginUrl);
    } else {
      view.webContents.reloadIgnoringCache();
    }
    return { ok: true };
  } catch (error) {
    if (error.code === 'ERR_ABORTED') return { ok: true };
    return { ok: false, error: error.message };
  }
});
ipcMain.handle('set-theme', (_event, theme) => {
  currentTheme = theme === 'light' ? 'light' : 'dark';
  for (const view of remoteViews.values()) {
    if (!view.webContents.isDestroyed()) applyRemoteTheme(view.webContents, currentTheme);
  }
  return currentTheme;
});
ipcMain.handle('set-work-mode', (_event, enabled) => {
  workMode = Boolean(enabled);
  applyWorkModeAudioMute();
  return workMode;
});
for (const [channel, action] of [['metadata-destination', () => metadataDownloads.getDestination()], ['pick-metadata-destination', () => metadataDownloads.pickDestination()], ['metadata-use-downloads', () => metadataDownloads.useDownloads()]]) {
  ipcMain.handle(channel, (event) => event.sender === win?.webContents ? action() : null);
}
ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return null;
  allowedFolderRoots.add(path.resolve(result.filePaths[0]));
  return result.filePaths[0];
});
ipcMain.handle('ensure-patch-folder', async (_event, folder) => {
  try {
    const selected = path.resolve(String(folder || ''));
    if (!selected || selected === path.parse(selected).root) return null;
    allowedFolderRoots.add(selected);
    const updateFolder = path.join(selected, 'Actualizacion');
    await fs.mkdir(updateFolder, { recursive: true });
    projectsFolder = selected;
    return updateFolder;
  } catch { return null; }
});
ipcMain.handle('stage-patches', async (_event, files) => {
  try {
    if (!projectsFolder || !Array.isArray(files) || files.length < 1 || files.length > 5) return { ok: false, error: 'Soltá entre 1 y 5 archivos ZIP.' };
    const updateFolder = path.join(projectsFolder, 'Actualizacion');
    await fs.mkdir(updateFolder, { recursive: true });
    const sources = await Promise.all(files.map(async item => {
      const source = path.resolve(String(item || ''));
      if (path.extname(source).toLowerCase() !== '.zip') throw new Error('Solo se pueden agregar archivos ZIP.');
      const stat = await fs.stat(source);
      if (!stat.isFile() || stat.size > 50 * 1024 * 1024) throw new Error('Cada ZIP debe pesar menos de 50 MB.');
      return source;
    }));
    const added = [];
    for (const source of sources) {
      const base = path.basename(source);
      let destination = path.join(updateFolder, base);
      let suffix = 1;
      while (true) {
        try { await fs.access(destination); destination = path.join(updateFolder, `${base.replace(/\.zip$/i, '')} (${suffix++}).zip`); }
        catch { break; }
      }
      await fs.copyFile(source, destination);
      added.push(path.basename(destination));
    }
    return { ok: true, added };
  } catch (error) { return { ok: false, error: error.message || 'No se pudieron copiar los ZIP.' }; }
});
ipcMain.handle('apply-patch', async () => ({ ok: false, error: 'Esta versión se actualiza con el ZIP completo de DocsHub.' }));
const documentMedia = require('./document-media.cjs').createDocumentMedia({ nativeImage, allowedPath: isUnderAllowedFolder, cacheDirectory: path.join(profileRoot,'document-thumbnails') });
const externalDragIcon = nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAA2UlEQVR4nO2ZsRGDMAxFTS7LpE/JMmmSEZiBEUiTZSjTZxzS5Xw0/rKNfnz+r6IQSA8ZHXcKQYgiBkvw571tRxUSc7kOcF0nNNCreGsuyDR+4GtZc2qCuT3G3zXSiWQHPIvf50A6AR8hj+JzcsEC/4oE2EiAjQTYSIBN8wLnkpvn55gOApju+b8pfXeg5M3VovkOSIBN8wIao2w0RtlIgE3zAu5jtPaH33cHNEYrIAE2EmDTj0C8uzoaS66kQLxo85CwLvngfaznmjUEfFcMHyHL8rkUz1yie773SDlB4htRbwAAAABJRU5ErkJggg==', 'base64'));
ipcMain.handle('rename-document', (event, { file, name } = {}) => {
  if (event.sender !== win?.webContents) return { ok: false, error: 'Solicitud inválida.' };
  try {
    const result = require('./document-rename.cjs').renameDocument(file, name, isUnderAllowedFolder);
    if (result.directory) {
      const source = path.resolve(file);
      for (const root of [...allowedFolderRoots]) {
        const relative = path.relative(source, root);
        if (relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
          allowedFolderRoots.delete(root);
          allowedFolderRoots.add(path.join(result.path, relative));
        }
      }
      if (projectsFolder) {
        const relative = path.relative(source, projectsFolder);
        if (relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) projectsFolder = path.join(result.path, relative);
      }
    }
    return result;
  }
  catch (error) { return { ok: false, error: error.code === 'EACCES' || error.code === 'EPERM' ? 'No pude cambiar el nombre. Cerrá el archivo si está abierto y revisá sus permisos.' : error.message || 'No pude cambiar el nombre.' }; }
});
ipcMain.handle('document-thumbnail', (event, file) => {
  if (event.sender !== win?.webContents) return { src: null };
  return documentMedia.thumbnail(file);
});
ipcMain.on('external-file-drag', (event, files) => {
  if (event.sender !== win?.webContents) return;
  try { documentMedia.startExternalDrag(event.sender, files, externalDragIcon); }
  catch (error) { event.sender.send('attachment-drag-status', error.message || 'No pude iniciar el arrastre hacia otra ventana.'); }
});
ipcMain.handle('list-folder', async (event, folder) => {
  if (event.sender !== win?.webContents) return [];
  try {
    const virtual = decodeZipPath(String(folder || ''));
    if (virtual || path.extname(String(folder || '')).toLowerCase() === '.zip') {
      const archive = virtual?.archive || path.resolve(String(folder));
      const raw = await runPowerShellScript('zip-files.ps1', 'list', { archive, prefix: virtual?.entry || '' });
      const zipEntries = Array.isArray(raw) ? raw : raw ? [raw] : [];
      return zipEntries.map(item => ({ name: item.name, path: encodeZipPath(archive, item.entry), directory: Boolean(item.directory), archive: Boolean(item.directory), archiveEntry: item.entry, archiveFile: archive, size: item.size == null ? null : Number(item.size) }));
    }
    const entries = await fs.readdir(folder, { withFileTypes: true });
    // Restore access for folders remembered by the trusted app after restart.
    allowedFolderRoots.add(path.resolve(folder));
    allowedFolderRoots.add(await fs.realpath(folder));
    const items = await Promise.all(entries.map(async e => {
      const fullPath = path.join(folder, e.name);
      let size = null, modifiedMs = null;
      if (!e.isDirectory()) { try { const stat = await fs.stat(fullPath); size = stat.size; modifiedMs = stat.mtimeMs; } catch {} }
      const isZip = !e.isDirectory() && path.extname(e.name).toLowerCase() === '.zip';
      return { name: e.name, path: fullPath, directory: e.isDirectory() || isZip, archive: isZip, size, modifiedMs };
    }));
    return items.sort((a,b) => Number(b.directory)-Number(a.directory) || a.name.localeCompare(b.name));
  } catch { return []; }
});
ipcMain.handle('list-subfolders', async (event, folder) => {
  if (event.sender !== win?.webContents || typeof folder !== 'string' || !path.isAbsolute(folder)) return [];
  try {
    const canonical = await fs.realpath(folder);
    const entries = await fs.readdir(folder, { withFileTypes: true });
    // Like list-folder, restore the trusted UI's remembered root after restart.
    allowedFolderRoots.add(path.resolve(folder)); allowedFolderRoots.add(canonical);
    return entries.filter(e => e.isDirectory() && !e.isSymbolicLink()).map(e => ({ name: e.name, path: path.join(folder, e.name) })).sort((a,b) => a.name.localeCompare(b.name));
  } catch { return []; }
});
ipcMain.handle('create-folder', async (_event, { parent, name } = {}) => {
  try {
    const destination = path.resolve(String(parent || ''));
    const folderName = String(name || '').trim();
    if (!isUnderAllowedFolder(destination)) throw new Error('Elegí una carpeta habilitada en Documentos.');
    if (!(await fs.stat(destination)).isDirectory()) throw new Error('La carpeta actual ya no está disponible.');
    if (!folderName || folderName === '.' || folderName === '..' || /[<>:"/\\|?*\x00-\x1f]/.test(folderName) || /[. ]$/.test(folderName)) throw new Error('Ese nombre no es válido para una carpeta de Windows.');
    const createdPath = path.join(destination, folderName);
    await fs.mkdir(createdPath);
    return { ok: true, path: createdPath };
  } catch (error) {
    if (error.code === 'EEXIST') return { ok: false, error: 'Ya existe una carpeta o archivo con ese nombre.' };
    return { ok: false, error: error.message || 'No se pudo crear la carpeta.' };
  }
});
async function confirmDocumentConflict(name) {
  const result = await dialog.showMessageBox(win, { type: 'question', title: 'El elemento ya existe', message: `Ya hay un elemento llamado “${name}” en la carpeta de destino.`, detail: 'Elegí si querés sobrescribirlo, conservar ambos con otro nombre o cancelar la operación.', buttons: ['Sobrescribir', 'Conservar ambos con sufijo', 'Cancelar'], defaultId: 2, cancelId: 2, noLink: true });
  return result.response;
}
async function suffixedDestination(folder, name) {
  const parsed = path.parse(name);
  for (let index = 1; ; index++) {
    const candidate = path.join(folder, `${parsed.name} (${index})${parsed.ext}`);
    try { await fs.lstat(candidate); } catch { return candidate; }
  }
}
function sameVolume(source, destination) {
  return path.parse(path.resolve(source)).root.toLowerCase() === path.parse(path.resolve(destination)).root.toLowerCase();
}
async function materializeZipItem(item, stagingRoot) {
  const virtual = decodeZipPath(String(item.path || ''));
  if (!virtual) return { path: path.resolve(String(item.path || '')), temporary: false, fromArchive: false };
  const name = path.basename(virtual.entry) || path.basename(virtual.archive, path.extname(virtual.archive));
  const isDirectory = Boolean(item.directory);
  const output = path.join(stagingRoot, name || 'Contenido');
  const result = await runPowerShellScript('zip-files.ps1', 'extract', { archive: virtual.archive, entry: virtual.entry, directory: isDirectory, destination: isDirectory ? output : stagingRoot });
  if (!Number(result.count)) throw new Error(`No se encontró “${name}” dentro del ZIP.`);
  return { path: output, temporary: true, fromArchive: true };
}
const documentUndo = require('./document-undo.cjs').createDocumentUndo(path.join(profileRoot, 'document-undo'));
let documentOperations = Promise.resolve();
function queueDocumentOperation(action) { const result = documentOperations.then(action); documentOperations = result.catch(() => {}); return result; }
require('./document-zip.cjs').installDocumentZip({ipcMain,host:()=>win,allowedPath:isUnderAllowedFolder,queue:queueDocumentOperation,runArchive:input=>runPowerShellScript('create-zip.ps1',null,input)});
const editVlc = require('./vlc.cjs').createVlc({allowedPath:isUnderAllowedFolder,runWindows:(action,input)=>runPowerShellScript('vlc-window.ps1',action,input)});
ipcMain.handle('document-video-vlc', async (event,file) => {
  if (event.sender !== win?.webContents) return {ok:false,error:'Solicitud inválida.'};
  try { return await editVlc(file); }
  catch(error) { return {ok:false,error:error.message || 'No se pudo abrir VLC.'}; }
});
const editClipchamp = require('./clipchamp.cjs').createClipchamp({
  allowedPath: isUnderAllowedFolder,
  runWindows: (action,input) => runPowerShellScript('clipchamp.ps1',action,input)
});
ipcMain.handle('document-video-edit', async (event,file) => {
  if (event.sender !== win?.webContents) return {ok:false,error:'Solicitud inválida.'};
  try { return await editClipchamp(file); }
  catch(error) { return {ok:false,error:error.message || 'No se pudo abrir Clipchamp.'}; }
});
const documentEditor = require('./document-editor.cjs').createDocumentEditor({
  root: path.join(profileRoot, 'document-edits'), allowedPath: isUnderAllowedFolder,
  dialog, host: () => win, shell, undo: documentUndo, queue: queueDocumentOperation,
  runWindows: (action, input) => runPowerShellScript('document-editor.ps1', action, input),
  watchEditor: require('./editor-window-monitor.cjs').watchEditorWindow,
  notify: result => { if (win && !win.isDestroyed()) win.webContents.send('document-edit-status', result); }
});
app.on('will-quit', () => documentEditor.dispose());
for (const [channel, action] of Object.entries({
  'document-edit-list': () => ({ok:true,sessions:documentEditor.list()}),
  'document-edit-begin': ({file,editor} = {}) => documentEditor.begin(file,editor),
  'document-edit-save': ({id,importFile} = {}) => documentEditor.save(id,Boolean(importFile)),
  'document-edit-finish': ({id} = {}) => documentEditor.finish(id)
})) ipcMain.handle(channel, async (event, args) => {
  if (event.sender !== win?.webContents) return {ok:false,error:'Solicitud inválida.'};
  try { return await queueDocumentOperation(() => action(args)); }
  catch(error) { return {ok:false,error:error.message || 'No se pudo completar la edición.'}; }
});
async function transferDocumentItems(items, destinationFolder, requestedOperation = 'auto') {
  const destination = path.resolve(String(destinationFolder || ''));
  if (!isUnderAllowedFolder(destination)) throw new Error('Elegí como destino una carpeta habilitada en Documentos.');
  if (!(await fs.stat(destination)).isDirectory()) throw new Error('La carpeta de destino ya no está disponible.');
  if (!Array.isArray(items) || !items.length) throw new Error('No hay archivos seleccionados para transferir.');
  const staging = await fs.mkdtemp(path.join(app.getPath('temp'), 'workhub2-docs-'));
  let transferred = 0;
  const undoEntries = [];
  try {
    for (const raw of items) {
      const item = typeof raw === 'string' ? { path: raw } : raw || {};
      const itemStaging = await fs.mkdtemp(path.join(staging, 'item-'));
      const sourceInfo = await materializeZipItem(item, itemStaging);
      const source = sourceInfo.path;
      const info = await fs.stat(source);
      const directory = info.isDirectory();
      const name = path.basename(source);
      if (directory && (destination === source || destination.startsWith(`${source}${path.sep}`))) throw new Error('No se puede mover una carpeta dentro de sí misma.');
      const operation = sourceInfo.fromArchive ? 'copy' : requestedOperation === 'auto' ? (sameVolume(source, destination) ? 'move' : 'copy') : requestedOperation;
      if (!['copy', 'move'].includes(operation)) throw new Error('La operación solicitada no es válida.');
      if (!sourceInfo.fromArchive && path.dirname(source).toLowerCase() === destination.toLowerCase()) continue;
      let target = path.join(destination, name);
      let existing = false;
      let backup = null;
      try { await fs.lstat(target); existing = true; } catch {}
      if (existing) {
        const choice = await confirmDocumentConflict(name);
        if (choice === 2) return { ok: false, cancelled: true, transferred };
        if (choice === 1) target = await suffixedDestination(destination, name);
        else { backup = await documentUndo.backup(target); await fs.rm(target, { recursive: true, force: true }); }
      }
      try {
      if (operation === 'move' && !sourceInfo.fromArchive) {
        try { await fs.rename(source, target); }
        catch (error) {
          if (error.code !== 'EXDEV') throw error;
          if (directory) await fs.cp(source, target, { recursive: true, errorOnExist: true, force: false });
          else await fs.copyFile(source, target, fsSync.constants.COPYFILE_EXCL);
          try { await fs.rm(source, { recursive: directory }); }
          catch (removeError) { await fs.rm(target, { recursive: true, force: true }).catch(() => {}); throw removeError; }
        }
      } else if (directory) await fs.cp(source, target, { recursive: true, errorOnExist: true, force: false });
      else await fs.copyFile(source, target, fsSync.constants.COPYFILE_EXCL);
      } catch (error) { if (backup) { await fs.rm(target, {recursive:true,force:true}).catch(() => {}); await fs.cp(backup,target,{recursive:true,force:false,errorOnExist:true}); await fs.rm(backup,{recursive:true,force:true}); } throw error; }
      transferred++;
      undoEntries.push(await documentUndo.describe({ source, target, operation, backup }));
    }
    return { ok: true, transferred };
  } finally { await documentUndo.commit(undoEntries); await fs.rm(staging, { recursive: true, force: true }).catch(() => {}); }
}
ipcMain.handle('transfer-files', async (event, { items, destinationFolder, operation } = {}) => {
  if(event.sender !== win?.webContents) return {ok:false,error:'Solicitud inválida.'};
  try { return await queueDocumentOperation(() => transferDocumentItems(items, destinationFolder, operation || 'auto')); }
  catch (error) { return { ok: false, error: error.message || 'No se pudieron transferir los archivos.' }; }
});
ipcMain.handle('move-file', async (event, { source, destinationFolder } = {}) => {
  if(event.sender !== win?.webContents) return {ok:false,error:'Solicitud inválida.'};
  try { return await queueDocumentOperation(() => transferDocumentItems([{ path: source }], destinationFolder, 'move')); }
  catch (error) { return { ok: false, error: error.message || 'No se pudo mover el archivo.' }; }
});
ipcMain.handle('undo-documents', async event => {
  if(event.sender !== win?.webContents) return {ok:false,error:'Solicitud inválida.'};
  try { return await queueDocumentOperation(() => documentUndo.undo()); } catch(error) { return {ok:false,error:error.message}; }
});
ipcMain.handle('extract-document-zip', async (event, {file, elsewhere} = {}) => {
  if(event.sender !== win?.webContents) return {ok:false,error:'Solicitud inválida.'};
  if(typeof file !== 'string' || !path.isAbsolute(file) || !isUnderAllowedFolder(file) || path.extname(file).toLowerCase() !== '.zip') return {ok:false,error:'Seleccioná un ZIP de Documentos.'};
  let destination = path.dirname(file);
  if(elsewhere){const picked=await dialog.showOpenDialog(win,{title:'Extraer ZIP en…',defaultPath:destination,properties:['openDirectory','createDirectory']});if(picked.canceled||!picked.filePaths[0])return{ok:false,cancelled:true};destination=picked.filePaths[0];allowedFolderRoots.add(path.resolve(destination));}
  return queueDocumentOperation(async () => {
    const staging = await fs.mkdtemp(path.join(app.getPath('temp'),'docshub-extract-'));
    try { await runPowerShellScript('zip-files.ps1','extractall',{archive:file,destination:staging});const names=await fs.readdir(staging);if(!names.length)return{ok:true,transferred:0,destination};const result=await transferDocumentItems(names.map(name=>({path:path.join(staging,name)})),destination,'copy');return{...result,destination}; }
    catch(error){return{ok:false,error:error.message||'No se pudo extraer el ZIP.'};}
    finally{await fs.rm(staging,{recursive:true,force:true}).catch(()=>{});}
  });
});
ipcMain.handle('trash-files', async (_event, items) => {
  let removed = 0;
  try {
    if (!Array.isArray(items) || !items.length) throw new Error('No hay elementos seleccionados.');
    const paths = [...new Set(items.map(item => String(item.path || '')))];
    for (const source of paths) {
      if (!source || source.startsWith('zip://') || !isUnderAllowedFolder(path.resolve(source))) throw new Error('Solo podés eliminar elementos de las carpetas habilitadas.');
      if (path.resolve(source) === path.parse(path.resolve(source)).root) throw new Error('No se puede eliminar una unidad.');
    }
    const answer = await dialog.showMessageBox(win, { type: 'question', title: 'Enviar a la Papelera', message: `¿Enviar ${paths.length} elemento(s) a la Papelera?`, detail: paths.map(source => path.basename(source)).slice(0,8).join('\n'), buttons: ['Cancelar', 'Enviar a la Papelera'], defaultId: 0, cancelId: 0, noLink: true });
    if (answer.response !== 1) return { cancelled: true };
    for (const source of paths) { await shell.trashItem(source); removed++; }
    return { ok: true, removed };
  } catch (error) { return { ok: false, removed, error: error.message }; }
});
ipcMain.handle('file-clipboard-read', async () => {
  try { return await runFileClipboard('read'); }
  catch (error) { return { paths: [], operation: 'copy', error: error.message }; }
});
ipcMain.handle('file-clipboard-clear', async () => {
  try { await runFileClipboard('clear'); return { ok: true }; }
  catch (error) { return { ok: false, error: error.message }; }
});
require('./attachment-drag.cjs').registerAttachmentDrag({
  ipcMain,
  source: () => win?.webContents,
  allowedPath: isUnderAllowedFolder,
  allowedTarget: contents => {
    const entry = [...remoteViews].find(([, view]) => view.webContents === contents && currentViews.includes(view));
    if (!entry) return false;
    const service = entry[0].split('::').at(-1);
    try {
      const url = new URL(contents.getURL());
      if (service === 'metadata') return ['http:', 'https:'].includes(url.protocol);
      return url.protocol === 'https:' && (['gpt-personal', 'gpt-alterframe'].includes(service)
        ? url.hostname === 'chatgpt.com'
        : service === 'ia-nico' && url.hostname === 'portal-colegas.vercel.app');
    } catch { return false; }
  }
});
ipcMain.handle('file-clipboard-write', async (_event, { items, operation } = {}) => {
  try {
    const exportsRoot = path.join(app.getPath('userData'), 'document-clipboard');
    await fs.mkdir(exportsRoot, { recursive: true });
    const prepared = [];
    let fromArchive = false;
    for (const raw of (Array.isArray(items) ? items : [])) {
      const item = typeof raw === 'string' ? { path: raw } : raw || {};
      if (decodeZipPath(String(item.path || ''))) {
        fromArchive = true;
        const dir = await fs.mkdtemp(path.join(exportsRoot, 'zip-'));
        prepared.push((await materializeZipItem(item, dir)).path);
      } else prepared.push(path.resolve(String(item.path || '')));
    }
    await runFileClipboard('write', { paths: prepared, operation: fromArchive ? 'copy' : operation === 'move' ? 'move' : 'copy' });
    return { ok: true };
  } catch (error) { return { ok: false, error: error.message || 'No se pudo usar el portapapeles de Windows.' }; }
});
ipcMain.handle('start-file-drag', async (_event, { items, operation } = {}) => {
  const staging = await fs.mkdtemp(path.join(app.getPath('temp'), 'workhub2-drag-'));
  try {
    const prepared = [];
    let fromArchive = false;
    for (const raw of (Array.isArray(items) ? items : [])) {
      const item = typeof raw === 'string' ? { path: raw } : raw || {};
      if (decodeZipPath(String(item.path || ''))) fromArchive = true;
      const itemStaging = await fs.mkdtemp(path.join(staging, 'item-'));
      prepared.push((await materializeZipItem(item, itemStaging)).path);
    }
    await runPowerShellScript('native-file-drag.ps1', '', { paths: prepared, operation: fromArchive ? 'copy' : operation || 'auto' });
    return { ok: true };
  } catch (error) { return { ok: false, error: error.message || 'No se pudo iniciar el arrastre.' }; }
  finally { await fs.rm(staging, { recursive: true, force: true }).catch(() => {}); }
});
ipcMain.on('image-group-drag', (event, action) => {
  if (!imageCompare?.owns(event.sender)) return;
  if (action === 'start') imageCompare.beginGroupDrag(event.sender);
  else if (action === 'end' || action === 'cancel') imageCompare.endGroupDrag(event.sender, action !== 'cancel');
});
ipcMain.on('close-image-comparisons', event => {
  if (event.sender === win?.webContents || imageCompare?.owns(event.sender)) imageCompare?.closeAll();
});
ipcMain.handle('open-image-comparison', async (event, file) => {
  if (event.sender !== win?.webContents) return { ok: false, error: 'Solicitud inválida.' };
  try { return await imageCompare.open(file); }
  catch (error) { return { ok: false, error: error.message || 'No pude abrir esta imagen.' }; }
});
ipcMain.handle('open-file', async (_event, file) => {
  const virtual = decodeZipPath(String(file || ''));
  if (!virtual) return shell.openPath(file);
  const temporary = await fs.mkdtemp(path.join(app.getPath('temp'), 'workhub2-open-'));
  try {
    await runPowerShellScript('zip-files.ps1', 'extract', { archive: virtual.archive, entry: virtual.entry, directory: false, destination: temporary });
    return await shell.openPath(path.join(temporary, path.basename(virtual.entry)));
  } catch (error) { await fs.rm(temporary, { recursive: true, force: true }).catch(() => {}); return error.message || 'No se pudo abrir el archivo del ZIP.'; }
});
ipcMain.handle('window-control', (_event, action) => {
  if (!win) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (action === 'close') win.close();
});
ipcMain.handle('open-external', async (_event, url) => {
  if (/^https:\/\//.test(url)) await shell.openExternal(url);
});

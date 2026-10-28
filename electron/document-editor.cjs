const fs = require('node:fs/promises');
const sync = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createWindowsEditorLauncher } = require('./windows-editor-launcher.cjs');
const extensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif', '.tif', '.tiff']);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function createDocumentEditor({ root, allowedPath, dialog, host, shell, undo, queue, notify = () => {}, launch, platform = process.platform, pollMs = 1200, runWindows, watchEditor }) {
  const journal = path.join(root, 'sessions.json');
  const launchWindows = createWindowsEditorLauncher({runWindows});
  let sessions = [], programs = {}, checking = false;
  const watchers = new Map();
  function follow(session) {
    watchers.get(session.id)?.();
    if (watchEditor) watchers.set(session.id, watchEditor(session, () => {
      queue(() => editorClosed(session.id)).catch(error => notify({sessions:list(),error:error.message}));
    }));
  }
  try { const data = JSON.parse(sync.readFileSync(journal, 'utf8')); sessions = data.sessions.filter(s => /^[a-f0-9-]{36}$/.test(s.id) && path.dirname(s.working) === path.join(root, s.id)); programs = data.programs || {}; } catch {}
  const list = () => sessions.map(({ id, original, editor }) => ({ id, original, name: path.basename(original), editor }));
  async function persist() { await fs.mkdir(root, { recursive: true }); await fs.writeFile(journal + '.tmp', JSON.stringify({ sessions, programs })); await fs.rename(journal + '.tmp', journal); notify({ sessions: list() }); }
  async function source(file) {
    if (typeof file !== 'string' || !path.isAbsolute(file) || !extensions.has(path.extname(file).toLowerCase()) || !allowedPath(file)) throw Error('Elegí una imagen de una carpeta habilitada en Documentos.');
    const canonical = await fs.realpath(file);
    if (!allowedPath(canonical) || !(await fs.stat(canonical)).isFile()) throw Error('La imagen está fuera de las carpetas habilitadas.');
    return canonical;
  }
  async function executable(editor) {
    const candidates = [programs.fireworks, ...[process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean).map(p => path.join(p, 'Macromedia', 'Fireworks 8', 'Fireworks.exe'))];
    for (const candidate of candidates.filter(Boolean)) { try { if ((await fs.stat(candidate)).isFile()) return candidate; } catch {} }
    const picked = await dialog.showOpenDialog(host(), { title: 'Localizar Fireworks 8 (Fireworks.exe)', filters: [{ name: 'Programa de Windows', extensions: ['exe'] }], properties: ['openFile'] });
    if (picked.canceled || !picked.filePaths?.[0]) return null;
    const file = picked.filePaths[0];
    if (path.extname(file).toLowerCase() !== '.exe' || !(await fs.stat(file)).isFile()) throw Error('Seleccioná el ejecutable .exe del editor.');
    programs[editor] = file; await persist(); return file;
  }
  async function openEditor(editor, file) {
    if (launch) return launch(editor, file);
    if (platform !== 'win32') throw Error('Los editores externos de este parche requieren Windows.');
    if (editor === 'photos') { await shell.openExternal(`ms-photos:viewer?fileName=${encodeURIComponent(file)}`); return true; }
    if (editor === 'paint') return launchWindows(editor, file);
    const exe = await executable(editor);
    if (!exe) return false;
    return launchWindows(editor, file, exe);
  }

  async function begin(file, editor) {
    if (!['paint', 'fireworks', 'photos'].includes(editor)) throw Error('Editor inválido.');
    file = await source(file);
    const existing = sessions.find(s => s.original === file);
    if (existing) { const opened = await openEditor(editor, existing.working); if (opened === false) return { ok: false, cancelled: true }; existing.editor = editor; await persist(); follow(existing); return { ok: true, sessions: list() }; }
    const id = crypto.randomUUID(), directory = path.join(root, id);
    await fs.mkdir(directory, { recursive: true });
    const working = path.join(directory, path.basename(file));
    const bytes = await fs.readFile(file); await fs.writeFile(working, bytes, { flag: 'wx' });
    const session = { id, original: file, working, editor, originalHash: digest(bytes), observed: digest(bytes) };
    sessions.push(session); await persist();
    try { if (await openEditor(editor, working) === false) { sessions = sessions.filter(s => s !== session); await persist(); await fs.rm(directory, { recursive: true, force: true }); return { ok: false, cancelled: true }; } }
    catch (error) { notify({sessions:list(),error:error.message}); throw error; }
    follow(session);
    return { ok: true, sessions: list() };
  }
  async function save(id, importFile = false, automatic = false, exportedFile = null) {
    const session = sessions.find(s => s.id === id);
    if (!session) throw Error('La edición ya no está abierta.');
    let file = exportedFile || session.working;
    if (importFile) {
      const picked = await dialog.showOpenDialog(host(), { title: 'Seleccionar la imagen guardada por el editor', defaultPath: path.dirname(session.working), filters: [{ name: 'Imágenes', extensions: [...extensions].map(e => e.slice(1)) }], properties: ['openFile'] });
      if (picked.canceled || !picked.filePaths?.[0]) return { ok: false, cancelled: true };
      file = picked.filePaths[0];
    }
    if (!extensions.has(path.extname(file).toLowerCase()) || !(await fs.stat(file)).isFile()) throw Error('Seleccioná una imagen guardada por el editor.');
    const bytes = await fs.readFile(file), hash = digest(bytes);
    if (!bytes.length) throw Error('El archivo editado está vacío. Esperá a que termine de guardar.');
    if (automatic && hash === session.observed) return { ok: true };
    // Remember the prompt, even when cancelled; manual Save can retry at any time.
    if (file === session.working) { session.observed = hash; await persist(); }
    let originalHash = null;
    try { await source(session.original); originalHash = digest(await fs.readFile(session.original)); } catch {}
    const overwrite = originalHash === session.originalHash && path.extname(file).toLowerCase() === path.extname(session.original).toLowerCase();
    const answer = await dialog.showMessageBox(host(), { type: 'question', title: 'Guardar edición en DocsHub', message: `¿Cómo querés guardar “${path.basename(session.original)}”?`, detail: `Destino: ${path.dirname(session.original)}\n${overwrite ? 'Sobrescribir reemplaza el original. Crear copia conserva ambos.' : 'El original cambió, ya no está disponible o el formato es diferente. Solo se permite crear una copia.'}`, buttons: overwrite ? ['Sobrescribir', 'Crear copia', 'Cancelar'] : ['Crear copia', 'Cancelar'], defaultId: overwrite ? 1 : 0, cancelId: overwrite ? 2 : 1, noLink: true });
    if (answer.response === (overwrite ? 2 : 1)) return { ok: false, cancelled: true };
    const replace = overwrite && answer.response === 0;
    const folder = path.dirname(session.original);
    if (!allowedPath(folder) || !allowedPath(await fs.realpath(folder))) throw Error('Volvé a abrir la carpeta original en Documentos antes de guardar.');
    let target, backup = null, temporary;
    if (replace) {
      await source(session.original);
      if (digest(await fs.readFile(session.original)) !== originalHash) throw Error('El original cambió mientras elegías. Volvé a guardar como copia.');
      target = session.original; backup = await undo.backup(target);
      temporary = path.join(folder, `.docshub-${crypto.randomUUID()}${path.extname(target)}`);
      try { await fs.writeFile(temporary, bytes, { flag: 'wx' }); await fs.rename(temporary, target); }
      finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
    } else {
      const name = path.basename(session.original, path.extname(session.original));
      for (let n = 1; ; n++) { target = path.join(folder, `${name} - editada${n === 1 ? '' : ` (${n})`}${path.extname(file).toLowerCase()}`); try { await fs.writeFile(target, bytes, { flag: 'wx' }); break; } catch (error) { if (error.code !== 'EEXIST') throw error; } }
    }
    try { await undo.commit([await undo.describe({ source: file, target, operation: 'copy', backup })]); }
    catch (error) { if (backup) await fs.copyFile(backup, target); else await fs.rm(target, { force: true }); throw error; }
    if (replace) session.originalHash = hash;
    if (file !== session.working) session.exports = {...session.exports,[file]:hash};
    await persist(); notify({ sessions: list(), saved: target });
    return { ok: true, target, sessions: list() };
  }
  async function finish(id) {
    watchers.get(id)?.(); watchers.delete(id);
    sessions = sessions.filter(s => s.id !== id);
    await persist(); return {ok:true,sessions:list()};
  }
  async function editorClosed(id) {
    const session = sessions.find(s => s.id === id);
    if (!session) return {ok:true,sessions:list()};
    // Check a last save before ending the session, even if the poll has not seen it.
    const hash = digest(await fs.readFile(session.working));
    if (hash !== session.observed) await save(id, false, true);
    else {
      // Photos/Fireworks may save a new image next to the working copy.
      const exports = (await fs.readdir(path.dirname(session.working))).filter(name => name !== path.basename(session.working) && extensions.has(path.extname(name).toLowerCase()));
      if (exports.length === 1) {
        const file = path.join(path.dirname(session.working), exports[0]);
        if (digest(await fs.readFile(file)) !== session.exports?.[file]) await save(id, false, false, file);
      }
    }
    await finish(id);
    notify({sessions:list(),closed:true});
    return {ok:true,sessions:list()};
  }
  async function poll() {
    if (checking) return; checking = true;
    try {
      for (const s of [...sessions]) {
        try {
          const hash = digest(await fs.readFile(s.working));
          if (hash === s.observed) { s.pending = null; continue; }
          if (s.pending !== hash) { s.pending = hash; continue; }
          s.pending = null;
          await queue(() => save(s.id, false, true));
        } catch (error) { notify({ sessions: list(), error: error.message }); }
      }
    } finally { checking = false; }
  }
  for (const session of sessions) follow(session);
  const timer = pollMs ? setInterval(poll, pollMs) : null; timer?.unref();
  return { begin, save, finish, editorClosed, list, poll, dispose: () => {clearInterval(timer); for (const stop of watchers.values()) stop(); watchers.clear();} };
}
module.exports = { createDocumentEditor };

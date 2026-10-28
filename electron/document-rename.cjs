const fs = require('node:fs');
const path = require('node:path');
function validateName(name) {
  if (typeof name !== 'string' || !name.trim() || name.length > 255 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || name === '.' || name === '..' || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name)) throw new Error('Ese nombre no es válido en Windows. No uses barras, dos puntos ni nombres reservados.');
}
function renameDocument(file, name, allowedPath) {
  validateName(name);
  if (typeof file !== 'string' || !path.isAbsolute(file) || !allowedPath(file)) throw new Error('Elegí un archivo o carpeta de Documentos.');
  const source = path.resolve(file);
  const stat = fs.lstatSync(source);
  if ((!stat.isFile() && !stat.isDirectory()) || !allowedPath(fs.realpathSync(source))) throw new Error('Seleccioná un archivo o carpeta normal, fuera de un ZIP.');
  const destination = path.join(path.dirname(source), name);
  if (source === destination) return { ok: true, path: source, name, directory: stat.isDirectory() };
  let exists = false;
  try { fs.lstatSync(destination); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const caseOnly = process.platform === 'win32' && source.toLowerCase() === destination.toLowerCase();
  if (exists && !caseOnly) throw new Error('Ya existe un archivo o carpeta con ese nombre. Elegí otro; no se reemplazó nada.');
  fs.renameSync(source, destination);
  return { ok: true, path: destination, name, directory: stat.isDirectory() };
}
module.exports = { renameDocument, validateName };

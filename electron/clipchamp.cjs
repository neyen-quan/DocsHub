const fs = require('node:fs/promises');
const path = require('node:path');
const VIDEO_EXTENSIONS = new Set(['.mp4','.mov','.m4v','.webm','.avi','.mkv','.wmv','.mpg','.mpeg','.mts','.m2ts','.3gp','.ogv']);
function createClipchamp({allowedPath, runWindows}) {
  return async file => {
    if (typeof file !== 'string' || !path.isAbsolute(file) || !VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase()) || !allowedPath(file)) throw Error('Elegí un video de una carpeta habilitada en Documentos.');
    const canonical = await fs.realpath(file);
    if (!allowedPath(canonical) || !(await fs.stat(canonical)).isFile()) throw Error('El video no está disponible en las carpetas habilitadas.');
    await runWindows('clipchamp', {file:canonical});
    return {ok:true};
  };
}
module.exports = {createClipchamp};

const fs = require('node:fs/promises');
const path = require('node:path');
const {spawn} = require('node:child_process');
const VLC_EXECUTABLE = 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe';
const VIDEO_EXTENSIONS = new Set(['.mp4','.mov','.m4v','.webm','.avi','.mkv','.wmv','.mpg','.mpeg','.mts','.m2ts','.3gp','.ogv']);
const VLC_WINDOW_ARGUMENTS = ['--no-one-instance','--no-qt-video-autoresize','--no-fullscreen'];
function createVlc({allowedPath, platform = process.platform, launch, runWindows}) {
  return async file => {
    if (typeof file !== 'string' || !path.isAbsolute(file) || !VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase()) || !allowedPath(file)) throw Error('Elegí un video de una carpeta habilitada en Documentos.');
    const canonical = await fs.realpath(file);
    if (!allowedPath(canonical) || !(await fs.stat(canonical)).isFile()) throw Error('El video no está disponible en las carpetas habilitadas.');
    const args = [...VLC_WINDOW_ARGUMENTS, canonical];
    let processId;
    if (launch) processId = await launch(VLC_EXECUTABLE, args);
    else {
      if (platform !== 'win32') throw Error('Esta apertura de VLC requiere Windows.');
      try { if (!(await fs.stat(VLC_EXECUTABLE)).isFile()) throw Error(); }
      catch { throw Error(`No se encontró VLC en ${VLC_EXECUTABLE}.`); }
      processId = await new Promise((resolve,reject) => {
        const child = spawn(VLC_EXECUTABLE, args, {shell:false,detached:true,stdio:'ignore'});
        child.once('error', reject); child.once('spawn', () => {child.unref();resolve(child.pid);});
      });
    }
    if (runWindows && Number.isInteger(processId) && processId > 0) {
      try { await runWindows('place', {processId}); }
      catch(error) { return {ok:true,warning:`VLC se abrió, pero no pude ubicar la ventana: ${error.message}`}; }
    }
    return {ok:true};
  };
}
module.exports = {createVlc,VLC_EXECUTABLE,VLC_WINDOW_ARGUMENTS};

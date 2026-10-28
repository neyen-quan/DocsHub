const fs = require('node:fs');
const path = require('node:path');
const promises = require('node:fs/promises');
const crypto = require('node:crypto');
const IMAGE_EXTENSIONS = new Set(['.png','.jpg','.jpeg','.webp','.gif','.bmp','.avif']);
const VIDEO_EXTENSIONS = new Set(['.mp4','.mov','.m4v','.webm','.avi','.mkv','.wmv','.mpg','.mpeg','.mts','.m2ts','.3gp','.ogv']);
function createDocumentMedia({ nativeImage, allowedPath, cacheDirectory }) {
  const cache = new Map();
  let activeVideos = 0;
  const videoQueue = [];
  function scheduleVideo(action) {
    return new Promise((resolve,reject) => {
      const start = () => { activeVideos++; Promise.resolve().then(action).then(resolve,reject).finally(() => {activeVideos--;videoQueue.shift()?.();}); };
      if (activeVideos < 2) start(); else videoQueue.push(start);
    });
  }
  let cacheWrites = Promise.resolve();
  function cacheFile(key) { return cacheDirectory && path.join(cacheDirectory, crypto.createHash('sha256').update('video-v1:' + key).digest('hex') + '.json'); }
  async function readVideoCache(key) {
    const file = cacheFile(key); if (!file) return null;
    try {
      const info = await promises.stat(file); if (info.size > 1024 * 1024) return null;
      const value = JSON.parse(await promises.readFile(file,'utf8'));
      return typeof value.src === 'string' && value.src.startsWith('data:image/png;base64,') ? value : null;
    } catch { return null; }
  }
  function saveVideoCache(key, result) {
    const file = cacheFile(key); if (!file || !result.src) return Promise.resolve();
    const write = cacheWrites.then(async () => {
      await promises.mkdir(cacheDirectory,{recursive:true});
      await promises.writeFile(file + '.tmp',JSON.stringify(result));
      await promises.rename(file + '.tmp',file);
      const names = (await promises.readdir(cacheDirectory)).filter(name => /^[a-f0-9]{64}\.json$/.test(name));
      if (names.length > 500) {
        const files = await Promise.all(names.map(async name => ({name,time:(await promises.stat(path.join(cacheDirectory,name))).mtimeMs})));
        for (const old of files.sort((a,b) => b.time-a.time).slice(500)) await promises.unlink(path.join(cacheDirectory,old.name)).catch(() => {});
      }
    });
    cacheWrites = write.catch(() => {});
    return cacheWrites;
  }
  function validate(file) {
    if (typeof file !== 'string' || !path.isAbsolute(file) || !allowedPath(file)) throw new Error('Elegí un archivo de la carpeta abierta en Documentos.');
    const canonical = fs.realpathSync(file);
    if (!allowedPath(canonical)) throw new Error('El archivo está fuera de las carpetas abiertas.');
    const stat = fs.statSync(canonical);
    if (!stat.isFile()) throw new Error('Para adjuntar, seleccioná archivos; no carpetas.');
    return { file: canonical, stat };
  }
  function remember(key, value) {
    cache.set(key, value);
    while (cache.size > 96) cache.delete(cache.keys().next().value);
  }
  async function thumbnail(file) {
    try {
      const entry = validate(file);
      const extension = path.extname(entry.file).toLowerCase();
      const video = VIDEO_EXTENSIONS.has(extension);
      if (!video && !IMAGE_EXTENSIONS.has(extension)) return { src: null };
      const key = `${entry.file}:${entry.stat.size}:${entry.stat.mtimeMs}:${entry.stat.ctimeMs}`;
      if (cache.has(key)) return cache.get(key);
      const pending = (async () => {
        if (video) { const saved = await readVideoCache(key); if (saved) return saved; }
        let image;
        const extract = () => nativeImage.createThumbnailFromPath(entry.file, { width: 320, height: 240 });
        try { image = await (video ? scheduleVideo(extract) : extract()); } catch {}
        if ((!image || image.isEmpty()) && !video) image = nativeImage.createFromPath(entry.file);
        if (!image || image.isEmpty()) return { src: null };
        const size = image.getSize();
        const ratio = Math.min(1, 320 / size.width, 240 / size.height);
        if (ratio < 1) image = image.resize({ width: Math.max(1, Math.round(size.width * ratio)), height: Math.max(1, Math.round(size.height * ratio)), quality: 'good' });
        const result = { src: image.toDataURL() };
        if (video) await saveVideoCache(key,result);
        return result;
      })().catch(() => ({ src: null }));
      remember(key, pending);
      return pending;
    } catch { return { src: null }; }
  }
  function startExternalDrag(contents, files, icon) {
    if (!Array.isArray(files) || !files.length || files.length > 256) throw new Error('Seleccioná entre 1 y 256 archivos para arrastrar.');
    // Validate the whole selection before handing any file to the OS.
    const paths = [...new Set(files.map(file => validate(file).file))];
    contents.startDrag({ files: paths, icon });
    // startDrag provides the real file payload; upload acceptance belongs to the destination.
    return paths.length;
  }
  return { thumbnail, startExternalDrag };
}
module.exports = { createDocumentMedia, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS };

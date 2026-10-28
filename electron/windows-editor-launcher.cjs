const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
function fireworksFileURL(file) {
  const normalized = file.replace(/\\/g, '/');
  if (normalized.startsWith('//')) return 'file:' + normalized;
  return 'file:///' + normalized.replace(/^([a-z]):/i, '$1|');
}
const literal = value => JSON.stringify(value).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
function fireworksScript(file, receipt) {
  return `// DocsHub: explicitly open the working image, then acknowledge it.\n(function () {\n  var result = "ok";\n  try {\n    var document = fw.openDocument(${literal(fireworksFileURL(file))}, false, false);\n    if (!document) result = "error:Fireworks no pudo abrir esta imagen. Comproba que el formato sea compatible con Fireworks 8.";\n  } catch (error) { result = "error:" + String(error); }\n  var output = Files.open(${literal(fireworksFileURL(receipt))}, true);\n  if (output) { output.write(result); output.close(); }\n})();\n`;
}
function createWindowsEditorLauncher({ runWindows, timeoutMs = 20000, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  return async (editor, file, executable) => {
    if (editor === 'paint') {
      await runWindows('paint', { file });
      return true;
    }
    const token = crypto.randomUUID();
    const script = path.join(path.dirname(file), `open-${token}.jsf`);
    const receipt = path.join(path.dirname(file), `opened-${token}.txt`);
    await fs.writeFile(script, fireworksScript(file, receipt), { flag: 'wx', encoding: 'ascii' });
    await runWindows('fireworks', { executable, script });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const result = (await fs.readFile(receipt, 'utf8')).trim();
        if (result === 'ok') return true;
        if (result.startsWith('error:')) throw Error(result.slice(6));
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await pause(250);
    }
    // Keep the command available for a late-starting Fireworks process.
    throw Error('Fireworks arrancó, pero todavía no confirmó la apertura de la imagen. Esperá a que termine de iniciar y volvé a elegir Editar con Fireworks 8.');
  };
}
module.exports = { createWindowsEditorLauncher, fireworksScript, fireworksFileURL };

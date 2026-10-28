const { spawn } = require('node:child_process');
const path = require('node:path');
function watchEditorWindow(session, onClose) {
  if (process.platform !== 'win32') return () => {};
  const executable = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const child = spawn(executable, ['-NoLogo','-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'editor-window-monitor.ps1')], {windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output = '', stopped = false;
  child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
  child.stderr.resume(); child.stdin.on('error', () => {});
  child.on('error', () => {});
  child.once('close', () => {
    if (stopped) return;
    try { if (JSON.parse(output.trim()).status === 'closed') onClose(); } catch {}
  });
  child.stdin.end(Buffer.from(JSON.stringify({file:session.working,editor:session.editor}),'utf8').toString('base64'));
  return () => { stopped = true; child.kill(); };
}
module.exports = {watchEditorWindow};

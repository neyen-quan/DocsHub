const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {applyWindowsIdentity}=require('../electron/windows-identity.cjs');
test('Windows window icon and shell relaunch resource keep the same identity and actual installation',()=>{
 const root=path.resolve('DocsHub á space'),calls=[],win={setIcon:p=>calls.push(['icon',p]),setAppDetails:d=>calls.push(['details',d])};applyWindowsIdentity(win,root,{platform:'win32'});
 assert.equal(calls[0][1],path.join(root,'assets/docshub.png'));assert.equal(calls[1][1].appId,'agency.neyen.workhub2');assert.equal(calls[1][1].appIconPath,path.join(root,'assets/docshub-taskbar.ico'));assert.equal(calls[1][1].relaunchCommand,'"'+path.join(root,'DocsHub.exe')+'"');
 const original=fs.readFileSync(path.join(__dirname,'../assets/docshub.ico')),fresh=fs.readFileSync(path.join(__dirname,'../assets/docshub-taskbar.ico'));assert.deepEqual(fresh,original);
 applyWindowsIdentity({},root,{platform:'linux'});
});

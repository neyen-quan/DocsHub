const path=require('node:path');
// A distinct shell resource path refreshes stale RelaunchIconResource entries
// while keeping the existing AppUserModelID, profile and launcher unchanged.
function applyWindowsIdentity(win,root,{platform=process.platform}={}){
 if(platform!=='win32')return;
 win.setIcon(path.join(root,'assets/docshub.png'));
 win.setAppDetails({appId:'agency.neyen.workhub2',appIconPath:path.join(root,'assets/docshub-taskbar.ico'),appIconIndex:0,relaunchCommand:'"'+path.join(root,'DocsHub.exe')+'"',relaunchDisplayName:'DocsHub'});
}
module.exports={applyWindowsIdentity};

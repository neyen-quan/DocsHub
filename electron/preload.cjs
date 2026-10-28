const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('workhub2', {
  desktopUpdate: () => ipcRenderer.invoke('desktop-update-install'),
  desktopReady: () => ipcRenderer.invoke('desktop-update-ready'),
  rinaAccountsRead: () => ipcRenderer.invoke('rina-accounts-read'),
  rinaAccountsMutate: (operation,revision) => ipcRenderer.invoke('rina-accounts-mutate',{operation,revision}),
  rinaAccountsExport: format => ipcRenderer.invoke('rina-accounts-export',format),
  rinaAccountsRestore: revision => ipcRenderer.invoke('rina-accounts-restore',revision),
  onRinaAccountsChanged: callback => {const listener=(_event,result)=>callback(result);ipcRenderer.on('rina-accounts-changed',listener);return()=>ipcRenderer.removeListener('rina-accounts-changed',listener);},
  layout: (ids, top, splitIds = null, splitRatio = 50, aiLayoutIds = null, aiRatios = null, aiViewTargets = null) => ipcRenderer.invoke('layout-views', { ids, top, splitIds, splitRatio, aiLayoutIds, aiRatios, aiViewTargets }),
  onSplitRatiosChanged: callback => {
    const listener = (_event, ratios) => callback(ratios);
    ipcRenderer.on('split-ratios-changed', listener);
    return () => ipcRenderer.removeListener('split-ratios-changed', listener);
  },
  pasteGptImage: viewId => ipcRenderer.invoke('paste-gpt-image', viewId),
  onGptClipboardStatus: callback => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('gpt-clipboard-status', listener);
    return () => ipcRenderer.removeListener('gpt-clipboard-status', listener);
  },
  reloadView: (viewId, login = false) => ipcRenderer.invoke('reload-view', { viewId, login }),
  googleConnection: (viewId, destination) => ipcRenderer.invoke('google-connection-view', { viewId, destination }),
  closeAiView: viewId => ipcRenderer.invoke('close-ai-view', viewId),
  setTheme: theme => ipcRenderer.invoke('set-theme', theme),
  setWorkMode: enabled => ipcRenderer.invoke('set-work-mode', Boolean(enabled)),
  metadataDestination: () => ipcRenderer.invoke('metadata-destination'),
  pickMetadataDestination: () => ipcRenderer.invoke('pick-metadata-destination'),
  metadataUseDownloads: () => ipcRenderer.invoke('metadata-use-downloads'),
  onMetadataDownload: callback => { const listener = (_event, result) => callback(result); ipcRenderer.on('metadata-download-status', listener); return () => ipcRenderer.removeListener('metadata-download-status', listener); },
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  ensurePatchFolder: folder => ipcRenderer.invoke('ensure-patch-folder', folder),
  stagePatches: files => ipcRenderer.invoke('stage-patches', files),
  applyPatch: file => ipcRenderer.invoke('apply-patch', file),
  listSubfolders: folder => ipcRenderer.invoke('list-subfolders', folder),
  listFolder: folder => ipcRenderer.invoke('list-folder', folder),
  editVideoVlc: file => ipcRenderer.invoke('document-video-vlc', file),
  editVideoClipchamp: file => ipcRenderer.invoke('document-video-edit', file),
  documentEditList: () => ipcRenderer.invoke('document-edit-list'),
  documentEditBegin: (file, editor) => ipcRenderer.invoke('document-edit-begin', {file, editor}),
  documentEditSave: (id, importFile = false) => ipcRenderer.invoke('document-edit-save', {id, importFile}),
  documentEditFinish: id => ipcRenderer.invoke('document-edit-finish', {id}),
  onDocumentEditStatus: callback => { const listener = (_event, result) => callback(result); ipcRenderer.on('document-edit-status', listener); return () => ipcRenderer.removeListener('document-edit-status', listener); },
  undoDocuments: () => ipcRenderer.invoke('undo-documents'),
  extractDocumentZip: (file, elsewhere = false) => ipcRenderer.invoke('extract-document-zip', { file, elsewhere }),
  createFolder: (parent, name) => ipcRenderer.invoke('create-folder', { parent, name }),
  moveFile: (source, destinationFolder) => ipcRenderer.invoke('move-file', { source, destinationFolder }),
  trashFiles: items => ipcRenderer.invoke('trash-files', items),
  transferFiles: (items, destinationFolder, operation = 'auto') => ipcRenderer.invoke('transfer-files', { items, destinationFolder, operation }),
  readFileClipboard: () => ipcRenderer.invoke('file-clipboard-read'),
  writeFileClipboard: (items, operation) => ipcRenderer.invoke('file-clipboard-write', { items, operation }),
  clearFileClipboard: () => ipcRenderer.invoke('file-clipboard-clear'),
  renameDocument: (file, name) => ipcRenderer.invoke('rename-document', { file, name }),
  documentThumbnail: file => ipcRenderer.invoke('document-thumbnail', file),
  startExternalFileDrag: files => ipcRenderer.send('external-file-drag', files),
  startFileDrag: (items, operation = 'auto') => ipcRenderer.invoke('start-file-drag', { items, operation }),
  beginAttachmentDrag: paths => ipcRenderer.sendSync('begin-attachment-drag', paths),
  onAttachmentDragStatus: callback => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('attachment-drag-status', listener);
    return () => ipcRenderer.removeListener('attachment-drag-status', listener);
  },
  getPathForFile: file => webUtils.getPathForFile(file),
  closeImageComparisons: () => ipcRenderer.send('close-image-comparisons'),
  openImageComparison: file => ipcRenderer.invoke('open-image-comparison', file),
  openFile: file => ipcRenderer.invoke('open-file', file),
  windowControl: action => ipcRenderer.invoke('window-control', action),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  onViewError: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('view-error', listener);
    return () => ipcRenderer.removeListener('view-error', listener);
  },
  onViewReady: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('view-ready', listener);
    return () => ipcRenderer.removeListener('view-ready', listener);
  },
  onAiViewNavigation: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('ai-view-navigation', listener);
    return () => ipcRenderer.removeListener('ai-view-navigation', listener);
  }
});

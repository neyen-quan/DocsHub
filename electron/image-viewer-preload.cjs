const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('imageCompare', {
  closeAll: () => ipcRenderer.send('close-image-comparisons'),
  beginGroupDrag: () => ipcRenderer.send('image-group-drag', 'start'),
  endGroupDrag: cancel => ipcRenderer.send('image-group-drag', cancel ? 'cancel' : 'end')
});

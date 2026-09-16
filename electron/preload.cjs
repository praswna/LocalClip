const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('localclip', {
  openSource: (url) => ipcRenderer.invoke('open-source', url),
});

const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('localclip', {
  openSource: (url) => ipcRenderer.invoke('open-source', url),
  getArchiveInfo: () => ipcRenderer.invoke('archive-info'),
  chooseArchiveFolder: () => ipcRenderer.invoke('archive-choose-folder'),
  savePost: (post) => ipcRenderer.invoke('archive-save-post', post),
  deletePost: (post) => ipcRenderer.invoke('archive-delete-post', post),
  refreshAagag: () => ipcRenderer.invoke('aagag-refresh'),
});

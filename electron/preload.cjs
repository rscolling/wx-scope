const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('wxDesktop', {
  openPip: () => ipcRenderer.invoke('open-pip'),
  closePip: () => ipcRenderer.invoke('close-pip'),
})

// Privileged preload for obsidian:// pages only (settings).
// Never attached to web content.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('obsidian', {
  history: {
    query: search => ipcRenderer.invoke('history:query', search),
    clear: sinceMs => ipcRenderer.invoke('history:clear', sinceMs)
  },
  data: {
    clear: (types, sinceMs = null) => ipcRenderer.invoke('data:clear', { types, sinceMs })
  },
  adblock: { stats: () => ipcRenderer.invoke('adblock:stats') },
  tab: {
    open: url => ipcRenderer.send('tab:new', url),
    openPrivate: () => ipcRenderer.send('tab:private')
  }
});

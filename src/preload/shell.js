const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('obsidian', {
  layout: () => ipcRenderer.invoke('shell:layout'),

  tab: {
    open: url => ipcRenderer.send('tab:new', url),
    openPrivate: () => ipcRenderer.send('tab:private'),
    openSettings: () => ipcRenderer.send('tab:settings'),
    close: id => ipcRenderer.send('tab:close', id),
    activate: id => ipcRenderer.send('tab:activate', id),
    navigate: input => ipcRenderer.send('tab:navigate', input),
    back: () => ipcRenderer.send('tab:back'),
    forward: () => ipcRenderer.send('tab:forward'),
    reload: () => ipcRenderer.send('tab:reload'),
    devtools: () => ipcRenderer.send('tab:devtools'),
    pin: (id, pinned) => ipcRenderer.send('tab:pin', id, pinned),
    contextMenu: id => ipcRenderer.send('tab:contextmenu', id),
    onState: cb => ipcRenderer.on('tabs:state', (_e, state) => cb(state))
  },

  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close'),
    isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
    onState: cb => ipcRenderer.on('win:state', (_e, s) => cb(s))
  },

  adblock: { stats: () => ipcRenderer.invoke('adblock:stats') },

  history: {
    query: search => ipcRenderer.invoke('history:query', search),
    clear: sinceMs => ipcRenderer.invoke('history:clear', sinceMs)
  },

  data: {
    clear: (types, sinceMs = null) => ipcRenderer.invoke('data:clear', { types, sinceMs })
  },

  onFocusOmnibox: cb => ipcRenderer.on('omnibox:focus', cb),
  onPaletteOpen: cb => ipcRenderer.on('palette:open', cb),
  paletteClosed: () => ipcRenderer.send('palette:closed'),
  onToast: cb => ipcRenderer.on('toast', (_e, msg) => cb(msg)),
  splashDone: () => ipcRenderer.send('splash:done')
});

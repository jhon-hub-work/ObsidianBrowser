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

  theme: {
    get: () => ipcRenderer.invoke('theme:get'),
    set: patch => ipcRenderer.invoke('theme:set', patch),
    onChanged: cb => ipcRenderer.on('theme:changed', (_e, t) => cb(t))
  },

  history: {
    query: search => ipcRenderer.invoke('history:query', search),
    clear: sinceMs => ipcRenderer.invoke('history:clear', sinceMs)
  },

  data: {
    clear: (types, sinceMs = null) => ipcRenderer.invoke('data:clear', { types, sinceMs })
  },

  workspace: {
    list: () => ipcRenderer.invoke('ws:list'),
    create: name => ipcRenderer.send('ws:create', name),
    rename: (id, name) => ipcRenderer.send('ws:rename', id, name),
    remove: id => ipcRenderer.send('ws:remove', id),
    switch: id => ipcRenderer.send('ws:switch', id),
    onChanged: cb => ipcRenderer.on('ws:changed', (_e, list) => cb(list)),
    onSwitching: cb => ipcRenderer.on('workspace:switching', (_e, d) => cb(d)),
    onSwitched: cb => ipcRenderer.on('workspace:switched', (_e, d) => cb(d))
  },

  onFocusOmnibox: cb => ipcRenderer.on('omnibox:focus', cb),
  onPaletteOpen: cb => ipcRenderer.on('palette:open', cb),
  paletteClosed: () => ipcRenderer.send('palette:closed'),
  onToast: cb => ipcRenderer.on('toast', (_e, msg) => cb(msg)),
  splashDone: () => ipcRenderer.send('splash:done')
});

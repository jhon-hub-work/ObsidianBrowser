const { app, BrowserWindow, ipcMain, session, shell, screen } = require('electron');
const path = require('path');
const { TabManager, SETTINGS, NORMAL_PARTITION, PRIVATE_PARTITION } = require('./tabs');
const { enableAdblock } = require('./adblock');
const { History } = require('./history');
const { SessionStore } = require('./session-store');
const { UA, applyToSession } = require('./ua');
const layout = require('./layout');

// Must be set before any web contents exist.
app.userAgentFallback = UA;

// A single misbehaving async path must never hard-kill the browser.
process.on('uncaughtException', err => console.error('[main] uncaught exception:', err));
process.on('unhandledRejection', reason => console.error('[main] unhandled rejection:', reason));

// One Obsidian, one profile. A second launch focuses the existing window.
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();

let win, tabs, adblock, history, store;
let quitting = false;

// --- window state ----------------------------------------------------------

// Keep the saved rect only if it still lands on a connected display.
function validBounds(saved) {
  if (!saved || !saved.width || !saved.height) return null;
  const inside = screen.getAllDisplays().some(d => {
    const a = d.workArea;
    return saved.x < a.x + a.width && saved.x + saved.width > a.x &&
           saved.y < a.y + a.height && saved.y + saved.height > a.y;
  });
  return inside ? saved : null;
}

function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  // getNormalBounds() is the un-maximized rect, so restore isn't stuck fullscreen.
  const b = win.getNormalBounds();
  store.setWindow({ x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() });
}

function saveSession() {
  if (!tabs) return;
  const { tabs: list, activeIndex } = tabs.serialize();
  store.setTabs(list, activeIndex);
}

// --- window ----------------------------------------------------------------

async function createWindow() {
  const saved = store.getWindow();
  const b = validBounds(saved);

  win = new BrowserWindow({
    width: b?.width ?? 1440,
    height: b?.height ?? 900,
    x: b?.x,
    y: b?.y,
    minWidth: 940,
    minHeight: 620,
    frame: false,
    backgroundColor: '#0b0b0b',
    show: false,
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'shell.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (saved?.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'shell.html'));

  tabs = new TabManager(win, history, saveSession);

  win.on('resize', () => { tabs.layout(); saveWindowState(); });
  win.on('move', saveWindowState);

  // Windows caption button needs to reflect real maximize state.
  const sendState = () => {
    if (!win.isDestroyed()) win.webContents.send('win:state', { maximized: win.isMaximized() });
  };
  win.on('maximize', () => { sendState(); saveWindowState(); });
  win.on('unmaximize', () => { sendState(); saveWindowState(); });
  sendState();

  // Last-chance save if the window closes directly (not via app quit).
  win.on('close', () => { saveWindowState(); saveSession(); store.flush(); });

  // The native tab view paints OVER the HTML shell, so tabs are attached only
  // after the splash animation reports done (4s failsafe).
  let booted = false;
  const boot = () => {
    if (booted) return;
    booted = true;
    const restored = tabs.restore(store.getWorkspace());
    if (!restored) tabs.create(); // fresh profile: one new-tab page
  };
  ipcMain.once('splash:done', boot);
  setTimeout(boot, 4000);
}

if (hasLock) {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    history = new History(app.getPath('userData'));
    store = new SessionStore(app.getPath('userData'));

    const normal = session.fromPartition(NORMAL_PARTITION);
    const priv = session.fromPartition(PRIVATE_PARTITION);
    applyToSession(normal);
    applyToSession(priv);

    try {
      adblock = await enableAdblock([normal, priv], app.getPath('userData'));
    } catch (err) {
      console.error('[adblock] failed to load, continuing unblocked:', err.message);
    }

    await createWindow();

    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}

// Persist a final snapshot synchronously before the process exits.
app.on('before-quit', () => {
  quitting = true;
  saveWindowState();
  saveSession();
  store?.flush();
});

app.on('window-all-closed', () => app.quit());

// --- app-scoped shortcuts --------------------------------------------------
// before-input-event fires for the shell and every tab's web contents.
const SHORTCUTS = {
  't': () => tabs.create(),
  'w': () => tabs.close(tabs.activeId),
  'l': () => win.webContents.send('omnibox:focus'),
  'k': () => { tabs.hideActive(); win.webContents.focus(); win.webContents.send('palette:open'); },
  'h': () => tabs.create(SETTINGS),
  ',': () => tabs.create(SETTINGS),
  'r': () => tabs.reload(tabs.activeId)
};

app.on('web-contents-created', (_e, wc) => {
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control || !tabs) return;
    const key = input.key.toLowerCase();

    if (input.shift && key === 'n') {
      tabs.create(undefined, { incognito: true });
      event.preventDefault();
      return;
    }
    if (!input.shift && SHORTCUTS[key]) {
      SHORTCUTS[key]();
      event.preventDefault();
    }
  });
});

// --- IPC: tabs -------------------------------------------------------------

ipcMain.handle('shell:layout', () => layout);

ipcMain.on('tab:new', (_e, url) => tabs.create(url || undefined));
ipcMain.on('tab:private', () => tabs.create(undefined, { incognito: true }));
ipcMain.on('tab:settings', () => tabs.create(SETTINGS));
ipcMain.on('tab:close', (_e, id) => tabs.close(id));
ipcMain.on('tab:activate', (_e, id) => tabs.activate(id));
ipcMain.on('tab:navigate', (_e, input) => tabs.navigate(tabs.activeId, input));
ipcMain.on('tab:back', () => tabs.back(tabs.activeId));
ipcMain.on('tab:forward', () => tabs.forward(tabs.activeId));
ipcMain.on('tab:reload', () => tabs.reload(tabs.activeId));
ipcMain.on('tab:pin', (_e, id, pinned) => tabs.setPinned(id, pinned));
ipcMain.on('tab:contextmenu', (_e, id) => tabs.showTabMenu(id));
ipcMain.on('tab:scroll', (e, y) => tabs?.setScrollByWc(e.sender.id, y));
ipcMain.on('palette:closed', () => tabs.showActive());
ipcMain.on('tab:devtools', () => {
  const wc = tabs.active()?.view.webContents;
  if (wc) wc.isDevToolsOpened() ? wc.closeDevTools() : wc.openDevTools({ mode: 'right' });
});

// --- IPC: window -----------------------------------------------------------

ipcMain.on('win:minimize', () => win.minimize());
ipcMain.on('win:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
ipcMain.on('win:close', () => win.close());
ipcMain.handle('win:isMaximized', () => win.isMaximized());

// --- IPC: settings ---------------------------------------------------------

ipcMain.handle('adblock:stats', () => adblock?.stats ?? { blocked: 0 });

ipcMain.handle('history:query', (_e, search) => history.query(search));
ipcMain.handle('history:clear', (_e, sinceMs) => { history.clear(sinceMs); return true; });

// Clear cookies, cache, storage. `sinceMs` null means everything.
ipcMain.handle('data:clear', async (_e, { types, sinceMs }) => {
  const opts = { storages: types };
  if (sinceMs != null) opts.origin = undefined; // Electron clears all origins
  await session.fromPartition(NORMAL_PARTITION).clearStorageData(opts);
  if (types.includes('cachestorage')) {
    await session.fromPartition(NORMAL_PARTITION).clearCache();
  }
  return true;
});

ipcMain.on('external:open', (_e, url) => shell.openExternal(url));

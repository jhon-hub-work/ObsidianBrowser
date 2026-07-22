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

// The app layer owns windows (ARCHITECTURE.md). Each window carries its own
// TabManager; nothing below this layer knows how many windows exist.
const wins = new Map(); // BrowserWindow.id -> { win, tabs, incognito, booted }
let mainCtx = null;     // the persistent, normal-profile window
let adblock, history, store;

// --- context lookup --------------------------------------------------------

// A sender is either a window's shell renderer or a tab's web contents; both
// must resolve to the window that owns them.
function ctxOf(sender) {
  const owner = BrowserWindow.fromWebContents(sender);
  if (owner && wins.has(owner.id)) return wins.get(owner.id);

  for (const ctx of wins.values()) {
    for (const tab of ctx.tabs.tabs.values()) {
      if (tab.view.webContents.id === sender.id) return ctx;
    }
  }
  return null;
}

// Fall back to the focused window so a stray event never lands nowhere.
function ctxOrFocused(sender) {
  return ctxOf(sender) || wins.get(BrowserWindow.getFocusedWindow()?.id) || mainCtx;
}

function privateCtx() {
  for (const ctx of wins.values()) if (ctx.incognito) return ctx;
  return null;
}

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

// Only the normal window is ever persisted — a private window leaves no trace
// of its geometry or its tabs.
function saveWindowState() {
  const win = mainCtx?.win;
  if (!win || win.isDestroyed()) return;
  // getNormalBounds() is the un-maximized rect, so restore isn't stuck fullscreen.
  const b = win.getNormalBounds();
  store.setWindow({ x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() });
}

function saveSession() {
  if (!mainCtx?.tabs) return;
  const { tabs: list, activeIndex } = mainCtx.tabs.serialize();
  store.setTabs(list, activeIndex);
}

// --- window ----------------------------------------------------------------

async function createWindow({ incognito = false } = {}) {
  const saved = incognito ? null : store.getWindow();
  const b = validBounds(saved);

  // A private window cascades off the normal one rather than reusing its rect,
  // so it is obviously a second, separate window.
  const base = incognito ? mainCtx?.win?.getNormalBounds() : null;

  const win = new BrowserWindow({
    width: b?.width ?? base?.width ?? 1440,
    height: b?.height ?? base?.height ?? 900,
    x: b?.x ?? (base ? base.x + 42 : undefined),
    y: b?.y ?? (base ? base.y + 42 : undefined),
    minWidth: 940,
    minHeight: 620,
    frame: false,
    backgroundColor: incognito ? '#0d0a16' : '#0b0b0b',
    show: false,
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'shell.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (!incognito && saved?.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  // The shell reads this to strip every trace of the signed-in identity —
  // account, pinned links, workspaces — from a private window's chrome.
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'shell.html'), {
    query: incognito ? { private: '1' } : {}
  });

  const tabs = new TabManager(win, incognito ? null : history, incognito ? () => {} : saveSession);
  const ctx = { win, tabs, incognito, booted: false };
  wins.set(win.id, ctx);
  if (!incognito) mainCtx = ctx;

  win.on('resize', () => { tabs.layout(); if (!incognito) saveWindowState(); });
  if (!incognito) win.on('move', saveWindowState);

  // Windows caption button needs to reflect real maximize state.
  const sendState = () => {
    if (!win.isDestroyed()) win.webContents.send('win:state', { maximized: win.isMaximized() });
  };
  win.on('maximize', () => { sendState(); if (!incognito) saveWindowState(); });
  win.on('unmaximize', () => { sendState(); if (!incognito) saveWindowState(); });
  sendState();

  win.on('close', () => {
    if (incognito) return;
    // Last-chance save if the window closes directly (not via app quit).
    saveWindowState();
    saveSession();
    store.flush();
  });

  win.on('closed', () => {
    wins.delete(win.id);
    if (ctx === mainCtx) mainCtx = null;
    // Closing the last private window discards its throwaway profile outright.
    if (incognito && !privateCtx()) {
      session.fromPartition(PRIVATE_PARTITION)
        .clearStorageData()
        .catch(err => console.warn('[private] failed to clear session:', err.message));
    }
  });

  // The native tab view paints OVER the HTML shell, so tabs are attached only
  // after the splash animation reports done (4s failsafe).
  const boot = () => {
    if (ctx.booted || win.isDestroyed()) return;
    ctx.booted = true;
    if (incognito) {
      tabs.create(undefined, { incognito: true }); // lands on obsidian://private
      return;
    }
    const restored = tabs.restore(store.getWorkspace());
    if (!restored) tabs.create(); // fresh profile: one new-tab page
  };
  ctx.boot = boot;
  setTimeout(boot, 4000);

  return ctx;
}

// Private browsing is a *window*, not a tab — the separation has to be visible
// at the OS level, or "private" is just a colour on a tab.
function openPrivateWindow() {
  const existing = privateCtx();
  if (existing) {
    if (existing.win.isMinimized()) existing.win.restore();
    existing.win.focus();
    existing.tabs.create(undefined, { incognito: true });
    return;
  }
  createWindow({ incognito: true });
}

if (hasLock) {
  app.on('second-instance', () => {
    const win = mainCtx?.win;
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
  saveWindowState();
  saveSession();
  store?.flush();
});

app.on('window-all-closed', () => app.quit());

// --- app-scoped shortcuts --------------------------------------------------
// before-input-event fires for the shell and every tab's web contents.
const SHORTCUTS = {
  't': ctx => ctx.tabs.create(undefined, { incognito: ctx.incognito }),
  'w': ctx => ctx.tabs.close(ctx.tabs.activeId),
  'l': ctx => ctx.win.webContents.send('omnibox:focus'),
  'k': ctx => {
    ctx.tabs.hideActive();
    ctx.win.webContents.focus();
    ctx.win.webContents.send('palette:open');
  },
  'h': ctx => ctx.tabs.create(SETTINGS),
  ',': ctx => ctx.tabs.create(SETTINGS),
  'r': ctx => ctx.tabs.reload(ctx.tabs.activeId)
};

app.on('web-contents-created', (_e, wc) => {
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control) return;
    const key = input.key.toLowerCase();

    if (input.shift && key === 'n') {
      openPrivateWindow();
      event.preventDefault();
      return;
    }

    const ctx = ctxOrFocused(wc);
    if (!ctx) return;
    if (!input.shift && SHORTCUTS[key]) {
      SHORTCUTS[key](ctx);
      event.preventDefault();
    }
  });
});

// --- IPC: tabs -------------------------------------------------------------
// Every handler resolves the sender's window first; nothing addresses a global.

ipcMain.handle('shell:layout', () => layout);

// Ready as soon as the splash finishes, per window.
ipcMain.on('splash:done', e => ctxOf(e.sender)?.boot?.());

const onTab = (channel, fn) => ipcMain.on(channel, (e, ...args) => {
  const ctx = ctxOrFocused(e.sender);
  if (ctx) fn(ctx, ...args);
});

// New tabs inherit the window's mode — a tab opened in a private window is private.
onTab('tab:new', (ctx, url) => ctx.tabs.create(url || undefined, { incognito: ctx.incognito }));
onTab('tab:private', () => openPrivateWindow());
onTab('tab:settings', ctx => ctx.tabs.create(SETTINGS));
onTab('tab:close', (ctx, id) => ctx.tabs.close(id));
onTab('tab:activate', (ctx, id) => ctx.tabs.activate(id));
onTab('tab:navigate', (ctx, input) => ctx.tabs.navigate(ctx.tabs.activeId, input));
onTab('tab:back', ctx => ctx.tabs.back(ctx.tabs.activeId));
onTab('tab:forward', ctx => ctx.tabs.forward(ctx.tabs.activeId));
onTab('tab:reload', ctx => ctx.tabs.reload(ctx.tabs.activeId));
onTab('tab:pin', (ctx, id, pinned) => ctx.tabs.setPinned(id, pinned));
onTab('tab:contextmenu', (ctx, id) => ctx.tabs.showTabMenu(id));
onTab('palette:closed', ctx => ctx.tabs.showActive());

ipcMain.on('tab:scroll', (e, y) => ctxOf(e.sender)?.tabs.setScrollByWc(e.sender.id, y));

onTab('tab:devtools', ctx => {
  const wc = ctx.tabs.active()?.view.webContents;
  if (wc) wc.isDevToolsOpened() ? wc.closeDevTools() : wc.openDevTools({ mode: 'right' });
});

// --- IPC: window -----------------------------------------------------------

const onWin = (channel, fn) => ipcMain.on(channel, e => {
  const win = ctxOrFocused(e.sender)?.win;
  if (win && !win.isDestroyed()) fn(win);
});

onWin('win:minimize', win => win.minimize());
onWin('win:maximize', win => (win.isMaximized() ? win.unmaximize() : win.maximize()));
onWin('win:close', win => win.close());
ipcMain.handle('win:isMaximized', e => !!ctxOrFocused(e.sender)?.win.isMaximized());

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

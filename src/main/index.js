const { app, BrowserWindow, ipcMain, session, shell, screen, nativeTheme } = require('electron');
const path = require('path');
const { TabManager, SETTINGS, PRIVATE_PARTITION } = require('./tabs');
const { WorkspaceManager } = require('./workspaces');
const { enableAdblock } = require('./adblock');
const { HistoryManager } = require('./history');
const { SessionStore } = require('./session-store');
const tokens = require('./tokens');
const { UA, applyToSession } = require('./ua');
const layout = require('./layout');

// Must be set before any web contents exist.
app.userAgentFallback = UA;

// Baseline metrics for later milestones — cheap, log-only (CT-0003).
const startupT0 = Date.now();

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
let adblock, history, store, workspaces;

// Partitions that already have UA rules and ad blocking applied. applyToSession
// registers an onBeforeSendHeaders listener, so calling it twice on one session
// would double-rewrite every request header.
const preparedPartitions = new Set();

// Handed to WorkspaceManager so it can obtain a browsing session without ever
// touching Electron itself. See workspaces.js and ADR-0003.
function prepareSession(partition) {
  const ses = session.fromPartition(partition);
  if (!preparedPartitions.has(partition)) {
    applyToSession(ses);
    adblock?.enableFor(ses); // a workspace created before adblock loads stays unblocked, not broken
    preparedPartitions.add(partition);
  }
  return ses;
}

// --- theme -----------------------------------------------------------------
// Main owns theme resolution end to end: it resolves 'system' via nativeTheme,
// paints window and view backgrounds from tokens.css, and hands renderers an
// already-resolved value on the query string so nothing has to decide (and
// flash) after first paint. See ADR-0007.

function resolvedMode() {
  const { mode } = store.getTheme();
  if (mode === 'light' || mode === 'dark') return mode;
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

// Query params consumed by renderer/theme-boot.js before styles resolve.
function themeQuery(isPrivate) {
  if (isPrivate) return { private: '1' };
  const { ambience } = store.getTheme();
  return { theme: resolvedMode(), amb: ambience || 'none' };
}

function themeColors(isPrivate = false) {
  const { ambience } = store.getTheme();
  return tokens.resolve({ mode: resolvedMode(), ambience, private: isPrivate });
}

// Repaint everything currently alive after a theme change. Internal
// obsidian:// pages are reloaded rather than messaged: they run the sandboxed
// content preload, which has no receive channel, and adding one would put a
// theme listener on every web page on the internet for no benefit.
function applyThemeEverywhere() {
  nativeTheme.themeSource = store.getTheme().mode || 'system';

  for (const ctx of wins.values()) {
    if (ctx.win.isDestroyed()) continue;
    const colors = themeColors(ctx.incognito);

    ctx.win.setBackgroundColor(colors.bg);
    if (!ctx.win.webContents.isDestroyed()) {
      ctx.win.webContents.send('theme:changed', {
        ...store.getTheme(), resolved: resolvedMode(), private: ctx.incognito
      });
    }

    const managers = ctx.managers ? [...ctx.managers.values()] : [ctx.tabs];
    for (const mgr of managers) {
      if (!mgr) continue;
      mgr.setTheme(colors, themeQuery(ctx.incognito));
    }
  }
}

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

// Snapshot one workspace's tabs into the store (no disk write yet).
function saveWorkspaceTabs(id, mgr) {
  if (!id || !mgr) return;
  const { tabs, activeIndex } = mgr.serialize();
  store.setTabs(tabs, activeIndex, id);
}

// Assemble ONE complete snapshot — every hot workspace's tabs plus the active
// id — so a single atomic flush can never leave the store half-updated (CC-0003).
function saveSession() {
  if (!mainCtx?.managers) return;
  for (const [id, mgr] of mainCtx.managers) saveWorkspaceTabs(id, mgr);
  store.setActiveWorkspaceId(mainCtx.activeWsId);
}

// --- workspace switching ---------------------------------------------------
// WorkspaceManager owns *which* workspace is active; the app layer owns the
// TabManager instances and performs the mount/unmount here. See ADR-0004.

const HOT_WORKSPACES = 4; // keep the N most-recently-used hydrated; evict the rest

function touchLru(ctx, id) {
  ctx.lru = [id, ...ctx.lru.filter(x => x !== id)];
}

// Bound memory: destroy the least-recently-used hot workspaces beyond the cap,
// snapshotting each first so it rehydrates identically on return.
function evictExcess(ctx) {
  while (ctx.lru.length > HOT_WORKSPACES) {
    const victim = ctx.lru.pop();
    if (victim === ctx.activeWsId) { ctx.lru.unshift(victim); break; }
    const mgr = ctx.managers.get(victim);
    if (mgr) { saveWorkspaceTabs(victim, mgr); mgr.destroy(); ctx.managers.delete(victim); }
  }
}

function broadcastWorkspaces(ctx = mainCtx) {
  if (ctx && !ctx.win.isDestroyed()) ctx.win.webContents.send('ws:changed', workspaces.list());
}

// Swap the live workspace. Only ever driven by WorkspaceManager's 'activated'
// event, so by the time we run, ensureSession() has already attached adblock +
// UA to the target partition — no request can race ahead of protection (CC-0001).
function switchWorkspace(ctx, id, prevId) {
  if (!ctx?.managers || ctx.activeWsId === id) return;
  const t0 = Date.now();

  // Overlay covers the moment the native views are detached (CC-0002).
  ctx.win.webContents.send('workspace:switching', { id });

  const from = prevId ?? ctx.activeWsId;
  const prevMgr = ctx.managers.get(from);
  if (prevMgr) { saveWorkspaceTabs(from, prevMgr); prevMgr.unmount(); }

  let mgr = ctx.managers.get(id);
  let hydrated = false;
  if (!mgr) {
    try {
      mgr = new TabManager(ctx.win, history.for(id), () => saveWorkspaceTabs(id, mgr),
        { partition: workspaces.partition(id),
          theme: { colors: themeColors(false), query: themeQuery(false) } });
      const restored = mgr.restore(store.getWorkspace(id));
      if (!restored) mgr.create();
      ctx.managers.set(id, mgr);
      hydrated = true;
    } catch (err) {
      // Never switch into a broken workspace — roll back to the previous one (CT-0002).
      console.error(`[workspace] hydration failed for ${id}:`, err.message);
      workspaces.markFailed(id);
      prevMgr?.mount();
      ctx.win.webContents.send('workspace:switched', { id: ctx.activeWsId, failed: id });
      broadcastWorkspaces(ctx);
      return;
    }
  } else {
    mgr.mount();
  }

  if (!mgr.active()) mgr.create(); // health repair: a hot workspace must always have a tab

  ctx.activeWsId = id;
  ctx.tabs = mgr;
  touchLru(ctx, id);

  // One atomic write of the whole snapshot (CC-0003).
  store.setActiveWorkspaceId(id);
  saveSession();
  store.flush();

  evictExcess(ctx);
  ctx.win.webContents.send('workspace:switched', { id });
  broadcastWorkspaces(ctx);

  console.log(`[perf] workspace ${from} -> ${id} (${hydrated ? 'hydrated' : 'hot'}) in ${Date.now() - t0}ms`);
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
    backgroundColor: themeColors(incognito).bg, // from tokens.css, never a literal
    show: false,
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'shell.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (!incognito && saved?.maximized) win.maximize();
  win.once('ready-to-show', () => {
    win.show();
    if (!incognito) console.log(`[perf] startup to first paint in ${Date.now() - startupT0}ms`);
  });

  // The shell reads this to strip every trace of the signed-in identity —
  // account, pinned links, workspaces — from a private window's chrome.
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'shell.html'), {
    query: themeQuery(incognito)
  });

  // A private window belongs to no workspace — it browses the throwaway
  // partition and is deliberately outside the workspace system entirely.
  const wsId = incognito ? null : workspaces.activeId;
  const partition = incognito ? PRIVATE_PARTITION : workspaces.partition();

  let tabs;
  tabs = new TabManager(
    win,
    incognito ? null : history.for(wsId),
    incognito ? () => {} : (() => saveWorkspaceTabs(wsId, tabs)),
    { partition, theme: { colors: themeColors(incognito), query: themeQuery(incognito) } }
  );

  // ctx.tabs is always the ACTIVE workspace's manager; ctx.managers holds every
  // hot workspace in this window (one per workspace, per ADR-0004).
  const ctx = { win, tabs, incognito, booted: false };
  if (!incognito) {
    ctx.managers = new Map([[wsId, tabs]]);
    ctx.activeWsId = wsId;
    ctx.lru = [wsId];
  }
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
    history = new HistoryManager(app.getPath('userData'));
    store = new SessionStore(app.getPath('userData'));
    workspaces = new WorkspaceManager({ store, prepareSession });

    // Set BEFORE the first window exists, so Chromium's own base background,
    // scrollbars and form controls agree from the very first frame.
    nativeTheme.themeSource = store.getTheme().mode || 'system';

    // Follow the OS only while the user has actually chosen "system".
    nativeTheme.on('updated', () => {
      if ((store.getTheme().mode || 'system') === 'system') applyThemeEverywhere();
    });

    // The default workspace resolves to the original persist:obsidian
    // partition, so existing cookies and logins survive the introduction of
    // workspaces untouched. Only workspaces created later get persist:ws-<id>.
    const normal = session.fromPartition(workspaces.partition());
    const priv = session.fromPartition(PRIVATE_PARTITION);

    try {
      adblock = await enableAdblock([normal, priv], app.getPath('userData'));
    } catch (err) {
      console.error('[adblock] failed to load, continuing unblocked:', err.message);
    }

    // Applies UA rules and records both as prepared. Ad blocking is already
    // attached above; enableFor is idempotent.
    prepareSession(workspaces.partition());
    prepareSession(PRIVATE_PARTITION);

    await createWindow();

    // WorkspaceManager is the switching authority; the app layer reacts to it.
    workspaces.on('activated', ({ id, previous }) => switchWorkspace(mainCtx, id, previous));
    workspaces.on('created', () => broadcastWorkspaces());
    workspaces.on('renamed', () => broadcastWorkspaces());
    workspaces.on('failed', () => broadcastWorkspaces());
    workspaces.on('removed', ({ id }) => {
      const mgr = mainCtx?.managers.get(id);
      if (mgr) {
        mgr.destroy();
        mainCtx.managers.delete(id);
        mainCtx.lru = mainCtx.lru.filter(x => x !== id);
      }
      // The switch-away that precedes this event snapshots every hot manager,
      // which re-adds the just-dropped workspace. Drop it again so no orphaned
      // tab data lingers in session.json.
      store.dropWorkspace(id);
      history.drop(id); // and its per-workspace history file
      broadcastWorkspaces();
    });

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

// --- IPC: workspaces -------------------------------------------------------
// All switching flows through WorkspaceManager (the authority); the app layer's
// 'activated' subscriber performs the actual TabManager swap.

ipcMain.handle('ws:list', () => workspaces.list());
ipcMain.on('ws:create', (_e, name) => {
  const id = workspaces.create(name);
  workspaces.activate(id); // ensureSession runs here, before the switch mounts it
});
ipcMain.on('ws:rename', (_e, id, name) => workspaces.rename(id, name));
ipcMain.on('ws:remove', (_e, id) => workspaces.remove(id));
ipcMain.on('ws:switch', (_e, id) => workspaces.activate(id));

// --- IPC: theme ------------------------------------------------------------

ipcMain.handle('theme:get', () => ({
  ...store.getTheme(),
  resolved: resolvedMode(),
  ambiences: tokens.ambiences()
}));

ipcMain.handle('theme:set', (_e, patch) => {
  store.setTheme(patch || {});
  store.flush();            // a preference must survive a hard kill
  applyThemeEverywhere();
  return { ...store.getTheme(), resolved: resolvedMode() };
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

// History is scoped to the active workspace (WS-001).
ipcMain.handle('history:query', (_e, search) => history.for(mainCtx?.activeWsId).query(search));
ipcMain.handle('history:clear', (_e, sinceMs) => { history.for(mainCtx?.activeWsId).clear(sinceMs); return true; });

// Clear cookies, cache, storage. `sinceMs` null means everything.
// Scoped to the ACTIVE workspace — clearing data must never reach across an
// isolation boundary and sign the user out of a workspace they weren't in.
ipcMain.handle('data:clear', async (_e, { types, sinceMs }) => {
  const opts = { storages: types };
  if (sinceMs != null) opts.origin = undefined; // Electron clears all origins
  const ses = session.fromPartition(workspaces.partition());
  await ses.clearStorageData(opts);
  if (types.includes('cachestorage')) await ses.clearCache();
  return true;
});

ipcMain.on('external:open', (_e, url) => shell.openExternal(url));

const { WebContentsView, Menu } = require('electron');
const path = require('path');
const { TOPBAR, TABBAR, SIDEBAR, RIGHT } = require('./layout');
const { UA } = require('./ua');

const NEW_TAB = 'obsidian://home';
const SETTINGS = 'obsidian://settings';
// Private tabs get their own landing page — the normal home greets you by name
// and lists your workspaces, which is precisely what a private session must not do.
const PRIVATE_HOME = 'obsidian://private';

// Google sign-in happens IN-APP: ua.js presents a Firefox identity on
// accounts.google.com only, which Google accepts without client-hint checks.

// Persistent profile vs. a throwaway in-memory one for private tabs.
const NORMAL_PARTITION = 'persist:obsidian';
const PRIVATE_PARTITION = 'obsidian-private';

// Map an internal obsidian:// url to its local file.
const INTERNAL_FILES = {
  [NEW_TAB]: 'home.html',
  [SETTINGS]: 'settings.html',
  [PRIVATE_HOME]: 'private.html'
};

let nextId = 1;

class TabManager {
  // onChange fires after any state change that should be persisted.
  //
  // `partition` is the session this manager's normal tabs browse in. It is
  // supplied rather than assumed, because a workspace owns its partition and a
  // TabManager belongs to exactly one workspace (ADR-0004). Private tabs always
  // use PRIVATE_PARTITION regardless — they belong to no workspace at all.
  // `theme` is supplied, never looked up: a TabManager paints what the app
  // layer tells it to, the same way it browses the partition it is given.
  // { colors, query } — colors for the native view background (the white
  // flash on tab creation), query for internal obsidian:// pages.
  constructor(win, history, onChange = () => {},
              { partition = NORMAL_PARTITION, theme = null } = {}) {
    this.win = win;
    this.history = history;
    this.onChange = onChange;
    this.partition = partition;
    this.theme = theme;
    this.tabs = new Map(); // id -> tab
    this.activeId = null;
    this.restoring = false; // suppress churn while rebuilding a saved session
    this.mounted = true;    // false while its workspace is backgrounded (views detached)
  }

  // --- lifecycle -----------------------------------------------------------

  create(url = NEW_TAB, { activate = true, incognito = false, pinned = false, scroll = 0 } = {}) {
    const id = nextId++;

    // A private tab opening "home" must land on the private explainer instead —
    // the normal home page is personalized and belongs to the persistent profile.
    if (incognito && url === NEW_TAB) url = PRIVATE_HOME;

    // Internal pages get a privileged preload; the web gets the sandboxed one.
    const internal = INTERNAL_FILES[url];
    const preload = internal === 'settings.html' ? 'internal.js' : 'content.js';

    const view = new WebContentsView({
      webPreferences: {
        partition: incognito ? PRIVATE_PARTITION : this.partition,
        preload: path.join(__dirname, '..', 'preload', preload),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    const wc = view.webContents;
    wc.setUserAgent(UA);

    // A WebContentsView paints white until its document's first paint. Main
    // already knows the theme synchronously, so this costs nothing and is the
    // difference between a clean new tab and a white flash on every one.
    const themeBg = incognito ? null : this.theme?.colors?.bg;
    if (themeBg) { try { view.setBackgroundColor(themeBg); } catch { /* older API */ } }

    const tab = {
      id, view,
      title: internal ? 'New Tab' : url,
      url,
      logicalUrl: url,   // what we persist; stays obsidian:// for internal pages
      favicon: null,
      loading: false,
      incognito,
      pinned,
      scroll: scroll || 0
    };
    this.tabs.set(id, tab);

    this._wire(tab);
    this.win.contentView.addChildView(view);

    if (internal) {
      // private.html carries data-private in its markup, so it needs no query.
      const q = internal === 'private.html' ? {} : (this.theme?.query || {});
      wc.loadFile(path.join(__dirname, '..', 'renderer', internal), { query: q })
        .catch(() => {});
    } else {
      wc.loadURL(url).catch(() => {}); // failures surface via did-fail-load, never reject-crash
    }

    // Restore scroll position once the page is laid out.
    if (scroll > 0 && !internal) {
      wc.once('did-finish-load', () => {
        wc.executeJavaScript(`window.scrollTo(0, ${Number(scroll) || 0});`).catch(() => {});
      });
    }

    if (activate) this.activate(id);
    else view.setVisible(false);

    this.emit();
    return id;
  }

  close(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;

    this.win.contentView.removeChildView(tab.view);
    try { tab.view.webContents.close(); } catch { /* already gone */ }
    this.tabs.delete(id);

    if (this.activeId === id) {
      const remaining = [...this.tabs.keys()];
      if (remaining.length) this.activate(remaining[remaining.length - 1]);
      else if (this.mounted) this.create(); // never leave the active window tab-less
    }
    this.emit();
  }

  activate(id) {
    if (!this.tabs.has(id)) return;
    this.activeId = id;
    for (const [tid, tab] of this.tabs) tab.view.setVisible(tid === id);
    this.layout();
    this.emit();
  }

  active() {
    return this.tabs.get(this.activeId) || null;
  }

  // The native view paints over the shell HTML, so overlays (command palette)
  // require temporarily hiding it.
  hideActive() { this.active()?.view.setVisible(false); }
  showActive() { this.active()?.view.setVisible(true); }

  // --- workspace mounting --------------------------------------------------
  // A window shows exactly one workspace at a time. Backgrounded workspaces keep
  // their tabs (and web contents) alive but detach their views from the window,
  // so only the active workspace paints or receives input. See ADR-0004.

  mount() {
    if (this.mounted) return;
    this.mounted = true;
    for (const tab of this.tabs.values()) this.win.contentView.addChildView(tab.view);
    for (const [tid, tab] of this.tabs) tab.view.setVisible(tid === this.activeId);
    this.layout();
    this.emit();
  }

  unmount() {
    if (!this.mounted) return;
    this.mounted = false;
    for (const tab of this.tabs.values()) {
      try { this.win.contentView.removeChildView(tab.view); } catch { /* window gone */ }
    }
  }

  // Full teardown for LRU eviction: drop from the window and kill the renderers.
  // The caller must snapshot tabs first — nothing here is persisted.
  destroy() {
    for (const tab of this.tabs.values()) {
      try { this.win.contentView.removeChildView(tab.view); } catch { /* window gone */ }
      try { tab.view.webContents.close(); } catch { /* already gone */ }
    }
    this.tabs.clear();
    this.activeId = null;
    this.mounted = false;
  }

  // --- theme ---------------------------------------------------------------

  // Repaint after a theme change. Internal obsidian:// pages are reloaded
  // rather than messaged: they run the sandboxed content preload, which has
  // no receive channel by design. Theme changes are rare and these are local
  // files, so the reload is instant and costs nothing on the browsing path.
  setTheme(colors, query) {
    this.theme = { colors, query };

    for (const tab of this.tabs.values()) {
      if (tab.incognito) continue; // private surfaces are never re-themed
      try { tab.view.setBackgroundColor(colors.bg); } catch { /* older API */ }
      if (tab.logicalUrl && tab.logicalUrl.startsWith('obsidian://')) {
        try { tab.view.webContents.reload(); } catch { /* torn down */ }
      }
    }
  }

  // --- pinning -------------------------------------------------------------

  setPinned(id, pinned) {
    const tab = this.tabs.get(id);
    if (!tab || tab.pinned === pinned) return;
    tab.pinned = pinned;
    this.emit();
  }

  // Native right-click menu on a tab. Standard browser affordances only.
  showTabMenu(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const menu = Menu.buildFromTemplate([
      { label: tab.pinned ? 'Unpin Tab' : 'Pin Tab', click: () => this.setPinned(id, !tab.pinned) },
      { label: 'Reload', click: () => this.reload(id) },
      { type: 'separator' },
      { label: 'Close Tab', click: () => this.close(id) },
      {
        label: 'Close Other Tabs',
        enabled: this.tabs.size > 1,
        click: () => {
          for (const other of [...this.tabs.keys()]) if (other !== id) this.close(other);
        }
      }
    ]);
    menu.popup({ window: this.win });
  }

  // --- navigation ----------------------------------------------------------

  navigate(id, input) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    tab.view.webContents.loadURL(toURL(input)).catch(() => {});
  }

  back(id) {
    const wc = this.tabs.get(id)?.view.webContents;
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  forward(id) {
    const wc = this.tabs.get(id)?.view.webContents;
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }

  reload(id) {
    try { this.tabs.get(id)?.view.webContents.reload(); } catch { /* noop */ }
  }

  // --- scroll (best-effort, reported from content preload) -----------------

  setScrollByWc(wcId, y) {
    for (const tab of this.tabs.values()) {
      if (tab.view.webContents.id === wcId) {
        tab.scroll = Number(y) || 0;
        this.onChange();
        return;
      }
    }
  }

  // --- geometry ------------------------------------------------------------

  layout() {
    const { width, height } = this.win.getContentBounds();
    const bounds = {
      x: SIDEBAR,
      y: TOPBAR + TABBAR,
      width: Math.max(0, width - SIDEBAR - RIGHT),
      height: Math.max(0, height - TOPBAR - TABBAR)
    };
    for (const tab of this.tabs.values()) tab.view.setBounds(bounds);
  }

  // --- session persistence -------------------------------------------------

  // Plain snapshot for session.json. Order preserved; active stored as index.
  serialize() {
    const list = [...this.tabs.values()].filter(t => !t.incognito); // private tabs are never persisted
    const ordered = [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned)); // pinned first, stable
    const tabs = ordered.map(t => ({
      url: t.logicalUrl,
      pinned: !!t.pinned,
      scroll: t.scroll || 0
    }));
    const activeTab = this.active();
    let activeIndex = ordered.findIndex(t => t === activeTab);
    if (activeIndex < 0) activeIndex = 0;
    return { tabs, activeIndex };
  }

  // Rebuild tabs from a saved snapshot. Returns true if anything was restored.
  restore(snapshot) {
    const saved = Array.isArray(snapshot?.tabs) ? snapshot.tabs : [];
    if (!saved.length) return false;

    this.restoring = true;
    const ids = [];
    for (const s of saved) {
      const url = typeof s.url === 'string' && s.url ? s.url : NEW_TAB;
      ids.push(this.create(url, { activate: false, pinned: !!s.pinned, scroll: s.scroll || 0 }));
    }
    this.restoring = false;

    const idx = Math.min(Math.max(snapshot.activeIndex | 0, 0), ids.length - 1);
    this.activate(ids[idx]);
    return true;
  }

  // --- renderer sync -------------------------------------------------------

  emit() {
    // Guard the two crash vectors on this hot path: a window torn down during
    // shutdown, and an active tab whose renderer just died (render-process-gone
    // can fire mid-emit and make navigationHistory throw).
    if (!this.win || this.win.isDestroyed() || this.win.webContents.isDestroyed()) return;

    // A backgrounded workspace must not drive the tab strip — that belongs to
    // whichever workspace is currently mounted.
    if (!this.mounted) return;

    const active = this.active();
    const nav = active && !active.view.webContents.isDestroyed()
      ? active.view.webContents.navigationHistory
      : null;

    this.win.webContents.send('tabs:state', {
      activeId: this.activeId,
      tabs: [...this.tabs.values()].map(t => ({
        id: t.id,
        title: t.title,
        url: t.url,
        favicon: t.favicon,
        loading: t.loading,
        incognito: t.incognito,
        pinned: t.pinned
      })),
      incognito: active ? active.incognito : false,
      canGoBack: nav ? nav.canGoBack() : false,
      canGoForward: nav ? nav.canGoForward() : false
    });
    if (!this.restoring) this.onChange();
  }

  _wire(tab) {
    const wc = tab.view.webContents;
    const sync = () => this.emit();
    const record = () => this.history?.add(tab);

    wc.on('page-title-updated', (_e, title) => { tab.title = title; record(); sync(); });
    wc.on('page-favicon-updated', (_e, icons) => { tab.favicon = icons[0] || null; sync(); });
    wc.on('did-start-loading', () => { tab.loading = true; sync(); });
    wc.on('did-stop-loading', () => { tab.loading = false; sync(); });

    const onNav = url => {
      tab.url = url;
      if (/^https?:/i.test(url)) tab.logicalUrl = url; // keep internal urls as obsidian://
      record();
      sync();
    };
    wc.on('did-navigate', (_e, url) => onNav(url));
    wc.on('did-navigate-in-page', (_e, url) => onNav(url));

    // --- crash & error resilience: a dead tab must never take down the app ---

    wc.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit') return;
      console.warn(`[tab ${tab.id}] renderer gone (${details.reason}); reloading`);
      try { wc.reload(); } catch { /* view already torn down */ }
    });

    wc.on('unresponsive', () => {
      console.warn(`[tab ${tab.id}] unresponsive`);
    });

    wc.on('did-fail-load', (_e, code, desc, validatedURL, isMainFrame) => {
      if (!isMainFrame || code === -3) return; // -3 = user-aborted, ignore
      tab.title = 'Page failed to load';
      wc.loadURL(errorPage(validatedURL, desc, code, this.theme?.colors)).catch(() => {});
      sync();
    });

    // target=_blank and window.open become real tabs, never popups.
    wc.setWindowOpenHandler(({ url }) => {
      this.create(url, { incognito: tab.incognito });
      return { action: 'deny' };
    });
  }
}

// Self-contained error page so a failed load shows something usable, not a
// white void, and offers a one-click retry.
function errorPage(url, desc, code, c) {
  const text = String(url || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const jsUrl = JSON.stringify(String(url || '')); // safe inside the onclick handler
  // Colours come from tokens.css via the app layer (ADR-0007). The literals
  // here are only the last-resort fallback if the token table is unavailable.
  const t = {
    bg: '#0b0b0b', text: '#f5f5f5', muted: '#7a7a7a',
    border: '#222222', raised: '#1c1c1c', accent: '#4169e1', dim: '#b4b4b4',
    ...(c || {})
  };
  const html = `<!doctype html><meta charset="utf-8">
    <style>
      html,body{height:100%;margin:0;background:${t.bg};color:${t.text};
        font:15px/1.6 "Segoe UI",system-ui,sans-serif;display:grid;place-items:center}
      .box{max-width:440px;text-align:center;padding:24px}
      h1{font-size:20px;font-weight:600;margin:0 0 8px}
      p{color:${t.muted};margin:0 0 20px;word-break:break-all}
      button{height:38px;padding:0 20px;border:1px solid ${t.border};border-radius:10px;
        background:${t.raised};color:${t.text};font:inherit;cursor:pointer}
      button:hover{border-color:${t.accent}}
      code{color:${t.dim}}
    </style>
    <div class="box">
      <h1>This page didn't load</h1>
      <p>${text}<br><code>${String(desc)} (${code})</code></p>
      <button onclick='location.replace(${jsUrl})'>Try again</button>
    </div>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

// Search-or-navigate, the omnibox rule.
function toURL(input) {
  const s = String(input).trim();
  if (!s) return NEW_TAB;
  if (/^[a-z]+:\/\//i.test(s)) return s;
  if (/^localhost(:\d+)?(\/|$)/i.test(s)) return 'http://' + s;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$)/.test(s)) return 'https://' + s;
  return 'https://www.google.com/search?q=' + encodeURIComponent(s);
}

module.exports = {
  TabManager, toURL,
  NEW_TAB, SETTINGS, PRIVATE_HOME,
  NORMAL_PARTITION, PRIVATE_PARTITION
};

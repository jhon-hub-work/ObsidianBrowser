// Persists "where you left off" to userData/session.json and restores it on
// launch: window bounds + the open tabs (url, pinned, scroll), per workspace.
//
// Two kinds of state live here and are kept apart deliberately:
//   `workspaceMeta` — identity: id, display name, order. Rarely changes.
//   `workspaces`    — runtime: which tabs were open, which was active.
// Splitting them means future metadata (icon, colour, AI provider, memory
// settings) is additive and never touches the tab-restore path.
const path = require('path');
const fs = require('fs');

const VERSION = 1;
const SAVE_DEBOUNCE_MS = 700;
const DEFAULT_ID = 'default';

function defaultMeta() {
  return [{ id: DEFAULT_ID, name: 'Default', createdAt: null }];
}

// mode: 'system' | 'light' | 'dark'  —  ambience: 'none' | <id from tokens.css>
function defaultTheme() {
  return { mode: 'system', ambience: 'none' };
}

function emptyData() {
  return {
    version: VERSION,
    window: null,
    activeWorkspace: DEFAULT_ID,
    theme: defaultTheme(),
    workspaceMeta: defaultMeta(),
    workspaces: { [DEFAULT_ID]: { activeIndex: 0, tabs: [] } }
  };
}

class SessionStore {
  constructor(userDataPath) {
    this.file = path.join(userDataPath, 'session.json');
    this.data = this._read();
    this._timer = null;
  }

  _read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (parsed && parsed.version === VERSION && parsed.workspaces) {
        return this._migrate(parsed);
      }
    } catch {
      // Missing or corrupt session is not fatal — start clean.
    }
    return emptyData();
  }

  // Additive migration, deliberately without a VERSION bump: bumping would make
  // the check above reject every existing session.json and silently throw away
  // the user's restored tabs. New fields are filled in; nothing is rewritten.
  _migrate(data) {
    if (!Array.isArray(data.workspaceMeta)) {
      const ids = Object.keys(data.workspaces || {});
      data.workspaceMeta = ids.length
        ? ids.map(id => ({
            id,
            name: id === DEFAULT_ID ? 'Default' : id,
            createdAt: null
          }))
        : defaultMeta();
    }
    if (!data.activeWorkspace) data.activeWorkspace = DEFAULT_ID;
    if (!data.theme || typeof data.theme !== 'object') data.theme = defaultTheme();
    return data;
  }

  // --- theme (global; see ADR-0008 — private surfaces are never themed) ----

  getTheme() {
    return { ...defaultTheme(), ...this.data.theme };
  }

  setTheme(patch) {
    this.data.theme = { ...this.getTheme(), ...patch };
    this.scheduleSave();
    return this.data.theme;
  }

  // --- window -------------------------------------------------------------

  getWindow() { return this.data.window; }

  setWindow(bounds) {
    this.data.window = bounds;
    this.scheduleSave();
  }

  // --- workspace metadata (identity, not runtime state) -------------------

  getWorkspaceMeta() {
    return this.data.workspaceMeta.map(w => ({ ...w }));
  }

  setWorkspaceMeta(list) {
    this.data.workspaceMeta = list.map(w => ({ ...w }));
    this.scheduleSave();
  }

  getActiveWorkspaceId() { return this.data.activeWorkspace; }

  setActiveWorkspaceId(id) {
    this.data.activeWorkspace = id;
    this.scheduleSave();
  }

  // Drops a workspace's runtime state. Metadata is owned by the caller.
  dropWorkspace(id) {
    delete this.data.workspaces[id];
    this.scheduleSave();
  }

  // --- tabs (per workspace) ----------------------------------------------

  getWorkspace(id = this.data.activeWorkspace) {
    return this.data.workspaces[id] || { activeIndex: 0, tabs: [] };
  }

  setTabs(tabs, activeIndex, id = this.data.activeWorkspace) {
    if (!this.data.workspaces[id]) this.data.workspaces[id] = {};
    this.data.workspaces[id].tabs = tabs;
    this.data.workspaces[id].activeIndex = activeIndex;
    this.scheduleSave();
  }

  // --- persistence --------------------------------------------------------

  scheduleSave() {
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; this.flush(); }, SAVE_DEBOUNCE_MS);
  }

  // Synchronous — safe to call from app 'before-quit'.
  flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    try {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file); // atomic-ish: never leave a half-written file
    } catch (err) {
      console.error('[session] save failed:', err.message);
    }
  }
}

module.exports = { SessionStore };

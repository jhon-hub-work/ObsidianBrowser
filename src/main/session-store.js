// Persists "where you left off" to userData/session.json and restores it on
// launch: window bounds + the open tabs (url, pinned, scroll), per workspace.
//
// The shape is intentionally keyed by workspace even though only "default"
// exists today — the future Workspace Engine drops in as extra keys under
// `workspaces` with zero changes to this file or the tab engine.
const path = require('path');
const fs = require('fs');

const VERSION = 1;
const SAVE_DEBOUNCE_MS = 700;

function emptyData() {
  return {
    version: VERSION,
    window: null,
    activeWorkspace: 'default',
    workspaces: { default: { activeIndex: 0, tabs: [] } }
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
      if (parsed && parsed.version === VERSION && parsed.workspaces) return parsed;
    } catch {
      // Missing or corrupt session is not fatal — start clean.
    }
    return emptyData();
  }

  // --- window -------------------------------------------------------------

  getWindow() { return this.data.window; }

  setWindow(bounds) {
    this.data.window = bounds;
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

// Browsing history, persisted as plain JSON in userData.
// Deliberately not electron-store: v10 is ESM-only and the rest of main is CJS.
//
// History is scoped PER WORKSPACE (ADR/ARCHITECTURE: workspace-first). Each
// workspace owns its own history file; private windows record nothing. A global
// "history across all workspaces" view is a possible later feature, but the
// default — and the only thing that exists today — is per-workspace history.
const path = require('path');
const fs = require('fs');

const MAX = 5000;
const DEFAULT_ID = 'default';

class History {
  // Takes a full file path so callers control per-workspace file naming.
  constructor(file) {
    this.file = file;
    this.entries = this._read();
    this._flushTimer = null;
  }

  _read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return [];
    }
  }

  // Batched so a fast redirect chain doesn't hammer the disk.
  _scheduleFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      fs.writeFile(this.file, JSON.stringify(this.entries), () => {});
    }, 2000);
  }

  add({ url, title, incognito }) {
    if (incognito) return;                       // private tabs leave no trace
    if (!/^https?:/i.test(url)) return;          // skip internal pages

    const last = this.entries[0];
    if (last && last.url === url) {              // same page, just retitle
      last.title = title || last.title;
      last.at = Date.now();
    } else {
      this.entries.unshift({ url, title: title || url, at: Date.now() });
      if (this.entries.length > MAX) this.entries.length = MAX;
    }
    this._scheduleFlush();
  }

  query(search = '') {
    const q = search.trim().toLowerCase();
    if (!q) return this.entries.slice(0, 300);
    return this.entries
      .filter(e => e.url.toLowerCase().includes(q) || e.title.toLowerCase().includes(q))
      .slice(0, 300);
  }

  clear(sinceMs = null) {
    if (sinceMs == null) this.entries = [];
    else {
      const cutoff = Date.now() - sinceMs;
      this.entries = this.entries.filter(e => e.at < cutoff);
    }
    fs.writeFile(this.file, JSON.stringify(this.entries), () => {});
  }
}

// Hands out one History per workspace, created lazily. The default workspace
// keeps the original history.json so existing history is never orphaned; other
// workspaces get history-<id>.json.
class HistoryManager {
  constructor(userDataPath) {
    this.dir = userDataPath;
    this.byWorkspace = new Map();
  }

  for(id = DEFAULT_ID) {
    if (!this.byWorkspace.has(id)) {
      const file = id === DEFAULT_ID
        ? path.join(this.dir, 'history.json')
        : path.join(this.dir, `history-${id}.json`);
      this.byWorkspace.set(id, new History(file));
    }
    return this.byWorkspace.get(id);
  }

  // Discards a deleted workspace's history file. Metadata lifecycle is the
  // caller's concern; this only removes the on-disk history.
  drop(id) {
    if (id === DEFAULT_ID) return; // the default profile's history is never auto-deleted
    this.byWorkspace.delete(id);
    fs.unlink(path.join(this.dir, `history-${id}.json`), () => {});
  }
}

module.exports = { History, HistoryManager };

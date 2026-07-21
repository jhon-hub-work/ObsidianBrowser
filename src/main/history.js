// Browsing history, persisted as plain JSON in userData.
// Deliberately not electron-store: v10 is ESM-only and the rest of main is CJS.
const path = require('path');
const fs = require('fs');

const MAX = 5000;

class History {
  constructor(userDataPath) {
    this.file = path.join(userDataPath, 'history.json');
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

module.exports = { History };

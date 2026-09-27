// WorkspaceManager — the single authority for which workspace is active and
// what partition it browses in.
//
// It deliberately does NOT require('electron'). It cannot create a window, a
// session, or a tab even by accident; it receives `prepareSession` from the
// application layer and asks for what it needs. That makes ADR-0003's guard
// ("WorkspaceManager must never own BrowserWindow") structural rather than a
// convention someone has to remember.
//
// See docs/adr/0004-workspace-isolation.md.
const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');

const DEFAULT_ID = 'default';

// The default workspace keeps browsing in the ORIGINAL partition rather than
// moving to persist:ws-default. Renaming it would orphan every existing cookie
// and log the user out of every site they were signed into. Workspaces created
// from here on get their own partition; the first one never moves.
const LEGACY_PARTITION = 'persist:obsidian';

// States that actually occur today. ADR-0004 describes `background`,
// `suspended`, and `destroyed` for the hot/cold lifecycle — those are not
// implemented, and are not listed here, because an unused state invites code
// that handles a situation which never arises.
const STATE = {
  COLD: 'cold',          // known, not hydrated — no TabManager
  HYDRATING: 'hydrating',// session being prepared
  ACTIVE: 'active',      // current workspace
  FAILED: 'failed'       // hydration failed — never switched into (CT-0002)
};

function partitionFor(id) {
  return id === DEFAULT_ID ? LEGACY_PARTITION : `persist:ws-${id}`;
}

class WorkspaceManager extends EventEmitter {
  /**
   * @param {object}   opts
   * @param {object}   opts.store           SessionStore — sole owner of persistence
   * @param {Function} opts.prepareSession  (partition) => Electron.Session, with
   *                                        UA rules and ad blocking applied
   */
  constructor({ store, prepareSession }) {
    super();
    this.store = store;
    this.prepareSession = prepareSession;

    this.meta = store.getWorkspaceMeta();
    if (!this.meta.length) this.meta = [{ id: DEFAULT_ID, name: 'Default', createdAt: null }];

    const savedId = store.getActiveWorkspaceId();
    this.activeId = this.meta.some(w => w.id === savedId) ? savedId : this.meta[0].id;

    this.states = new Map(this.meta.map(w => [w.id, STATE.COLD]));
  }

  // --- read ---------------------------------------------------------------

  list() {
    return this.meta.map(w => ({
      ...w,
      partition: partitionFor(w.id),
      state: this.states.get(w.id) || STATE.COLD,
      active: w.id === this.activeId
    }));
  }

  active() {
    return this.list().find(w => w.active) || null;
  }

  partition(id = this.activeId) {
    return partitionFor(id);
  }

  stateOf(id) {
    return this.states.get(id) || STATE.COLD;
  }

  // --- session ------------------------------------------------------------

  // Prepares (and caches, via the app layer) the Electron session backing a
  // workspace. Idempotent — the app layer guards against double-applying
  // request-header rules.
  ensureSession(id = this.activeId) {
    this.states.set(id, STATE.HYDRATING);
    const ses = this.prepareSession(partitionFor(id));
    this.states.set(id, id === this.activeId ? STATE.ACTIVE : STATE.COLD);
    return ses;
  }

  // --- mutate -------------------------------------------------------------

  // Ids are immutable UUIDs; names are editable metadata. Context and Knowledge
  // will bind to the id, so a rename must never invalidate anything.
  create(name = 'New workspace') {
    const ws = { id: randomUUID(), name: String(name).trim() || 'New workspace', createdAt: Date.now() };
    this.meta.push(ws);
    this.states.set(ws.id, STATE.COLD);
    this._persistMeta();
    this.emit('created', { ...ws, partition: partitionFor(ws.id) });
    return ws.id;
  }

  rename(id, name) {
    const ws = this.meta.find(w => w.id === id);
    const next = String(name).trim();
    if (!ws || !next || ws.name === next) return false;
    ws.name = next;
    this._persistMeta();
    this.emit('renamed', { id, name: next });
    return true;
  }

  // The default workspace is not removable — it owns the original partition,
  // and there must always be somewhere to browse.
  remove(id) {
    if (id === DEFAULT_ID || this.meta.length <= 1) return false;
    const idx = this.meta.findIndex(w => w.id === id);
    if (idx < 0) return false;

    this.meta.splice(idx, 1);
    this.states.delete(id);
    this.store.dropWorkspace(id);
    this._persistMeta();

    if (this.activeId === id) this.activate(this.meta[0].id);
    this.emit('removed', { id });
    return true;
  }

  // Marks the active workspace and prepares its session. Swapping the live
  // TabManager is Milestone 2 step 3 — the app layer owns that, and subscribes
  // to 'activated' to do it.
  activate(id) {
    if (!this.meta.some(w => w.id === id) || id === this.activeId) return false;
    const previous = this.activeId;

    this.states.set(previous, STATE.COLD);
    this.activeId = id;
    this.store.setActiveWorkspaceId(id);
    this.ensureSession(id);

    this.emit('activated', { id, previous, partition: partitionFor(id) });
    return true;
  }

  // The app layer calls this when a workspace's TabManager/partition fails to
  // hydrate, so the UI can show it as broken instead of switching into a void.
  markFailed(id) {
    if (!this.states.has(id)) return;
    this.states.set(id, STATE.FAILED);
    this.emit('failed', { id });
  }

  _persistMeta() {
    this.store.setWorkspaceMeta(this.meta);
  }
}

module.exports = { WorkspaceManager, DEFAULT_ID, LEGACY_PARTITION, STATE, partitionFor };

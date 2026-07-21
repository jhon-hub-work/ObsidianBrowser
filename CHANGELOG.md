# Changelog

All notable changes to Obsidian Browser are recorded here.
This project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] — Foundation — 2026-07-21

The first foundation release: a stable, daily-usable browser that reopens exactly where you left
off, plus the core browsing experience built up to this point.

### Added — Stability & Session Restore (Milestone 1)
- Full session restore on relaunch: all tabs, pinned tabs, window size/position, and scroll
- Tab pinning with a native right-click tab menu (Pin / Reload / Close / Close Others)
- Crash-resistant lifecycle: dead renderers auto-reload, failed loads show a retry page
- Single-instance lock; clean, atomic session persistence with a synchronous flush on quit
- `uncaughtException` / `unhandledRejection` guards in the main process

### Added — Core browser (earlier foundation work)
- Chromium-based tabbed browsing in a Windows-native frameless window
- Command palette (`Ctrl+K`) and an AI-aware address bar
- Ad & tracker blocking (EasyList / EasyPrivacy)
- Private tabs (`Ctrl+Shift+N`) on an isolated throwaway session
- Settings: history (persisted), privacy / clear-data, ad-blocker stats

### Architecture Decisions (guiding v0.2)
- **Workspace Engine** design approved: one `TabManager` per active workspace; each workspace gets
  its own session partition for true isolation (separate cookies/logins); a `WorkspaceManager` owns
  switching; `SessionStore` remains the sole owner of on-disk persistence; the app layer owns
  windows; inactive workspaces hydrate lazily (LRU hot set) to keep memory bounded.
- **KnowledgeStore** approved as a first-class subsystem, independent of Workspace, SessionStore,
  and History. Knowledge is scoped — global (you) plus per-workspace namespaces — with
  default-isolated retrieval, realizing the "accumulated knowledge, not model retraining" vision.

### Deferred
- Google login compatibility, Chrome Sync, extensions, cloud accounts, themes, mobile.

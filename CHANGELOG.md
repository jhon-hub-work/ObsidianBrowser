# Changelog

All notable changes to Obsidian Browser are recorded here.
This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

Milestone 2 (Workspace Engine) in progress. Appearance (theme system) added alongside it.

### Added — Appearance
- **Light / dark / system theme.** System follows the OS via `nativeTheme` and changes live with it.
- **Ambience** — a visual identity layered on the mode axis. Ships with one, *Milky Way*, CSS-generated.
- **`src/renderer/tokens.css`** — the single source of truth for every colour, linked by all four renderer surfaces and parsed at boot by `src/main/tokens.js` so the main process paints window backgrounds and the error page from the same values ([ADR-0007](docs/adr/0007-tokens-in-one-css-file.md)).
- **Appearance pane** in Settings.
- `theme-boot.js` — render-blocking, applies the theme before first style resolution so no window or tab flashes the wrong theme.

### Fixed — Appearance
- **The chrome and the new-tab page were painting different colours.** `shell.css` used `--bg: #0b0b0b` / `--accent: #4169e1` while `home.html` and `settings.html` used `#08080b` / `#2563eb`. Three duplicated `:root` blocks had silently drifted apart; consolidating them is what surfaced it. `shell.css`'s values (the written brand spec) are canonical.
- Hardcoded dark greys in hover, recessed and focus states that would have rendered as black flashes against a light surface are now tokens (`--hover`, `--hover-strong`, `--sunken`).

### Notes — Appearance
- **The private window is not themeable** and never will be — its violet palette *is* the implementation of [ADR-0002](docs/adr/0002-private-browsing-as-a-window.md)'s identifiability guarantee, not decoration ([ADR-0008](docs/adr/0008-private-window-is-not-themeable.md)).
- **Ambience renders only where no native view covers it** — new tab, settings, splash, switch overlay — and never animates. A web page's `WebContentsView` is opaque and paints over the chrome, so chrome ambience would survive only as a gutter crop while still costing repaint ([ADR-0009](docs/adr/0009-ambience-only-where-nothing-covers-it.md)).
- Themes were removed from the deferred list in `README.md` and `ROADMAP.md`.

### Added
- **`WorkspaceManager`** — single authority for the active workspace and its partition. Deliberately does not `require('electron')`, so it cannot create a window even by accident (see [ADR-0003](docs/adr/0003-window-ownership.md)).
- Workspace lifecycle events (`created`, `renamed`, `removed`, `activated`) on a plain `EventEmitter`. Milestones 3–6 subscribe rather than modifying `WorkspaceManager`. No subscribers yet — the seam exists, the infrastructure does not.
- Workspace identity: immutable UUIDs with editable names, stored apart from runtime tab state ([ADR-0005](docs/adr/0005-workspace-identity.md)).
- `adblock.enableFor(session)` — workspaces create partitions at runtime, and a fixed session list would have left new workspaces silently unblocked.

### Changed
- `TabManager` receives its partition instead of assuming one. Private tabs still use the throwaway partition regardless — they belong to no workspace.
- `data:clear` is scoped to the active workspace, so clearing data cannot reach across an isolation boundary.
- `SessionStore` migrates additively **without a `VERSION` bump** — bumping would make the loader reject every existing `session.json` and discard the user's tabs.

### Notes
- The default workspace keeps browsing `persist:obsidian` rather than moving to `persist:ws-default`. Renaming the partition would have signed the user out of every site ([ADR-0006](docs/adr/0006-legacy-partition-reuse.md)).
- Not yet implemented: runtime workspace switching, one `TabManager` per workspace, hot/cold lifecycle, and the sidebar wiring. The sidebar remains a shell.

## [0.2.0] — Private windows — 2026-07-22

The browser learns to open more than one window, and private browsing becomes a real boundary
rather than a differently-coloured tab.

### Added — Private windows
- **Private browsing is now a separate window, not a tab.** `Ctrl+Shift+N` opens a dedicated private
  window; if one is already open it is focused and given a new tab instead of spawning a second.
- **Dedicated private landing page** (`obsidian://private`) replacing the personalized home page.
  States plainly what the mode does (no history, isolated identity, discarded on close, trackers
  still blocked), what it does **not** do (no anonymity from network/ISP/employer, sites you sign
  into still know you, downloads persist), and why the mode exists.
- **Private windows carry no identity in their chrome.** Account, pinned links, workspaces, assistant
  nav, and the Today panel are removed from the DOM — not hidden with CSS — and replaced with a
  standing "Private window" note.
- Private windows are never persisted: no saved geometry, no saved tabs, never restored on relaunch.
  Closing the last one clears the throwaway session partition explicitly.
- Private tabs pass no `History` instance to their `TabManager` at all — a second layer of defense
  beneath the existing `incognito` check in `history.js`.

### Changed — Multi-window support
- The main process now owns a **map of window contexts** (`BrowserWindow.id → { win, tabs, incognito }`)
  instead of `win`/`tabs` singletons. Every IPC handler and keyboard shortcut resolves the sender's
  window first, so nothing addresses a global. This realizes the "app/main layer owns windows"
  decision in ARCHITECTURE.md and is the groundwork the Workspace Engine needs.
- New tabs inherit their window's mode — a tab opened in a private window is private.
- Only the normal window writes session or window state; private windows are excluded at the source.

### Fixed
- **Private tabs were visually indistinguishable from normal tabs.** They were styled with a 1px
  dashed border in `#3b2f56`, which is invisible against the dark theme. Private tabs now use a
  tinted fill, a solid accent border, and a marker dot that survives the pinned favicon-only collapse.
  The isolation was always correct; the affordance was missing.
- Internal pages now style their own scrollbars — Chromium's default light scrollbar read as a bright
  seam against the dark UI.

### Documentation
- Added `ARCHITECTURE.md` as the canonical, permanent engineering guidance.
- Clarified product identity: a **workspace-first** browser that accumulates engineering knowledge —
  explicitly *not* an AI browser. Updated README and VISION accordingly.
- Codified seven guiding principles and the long-term layered architecture (Browser → Workspace →
  Context Engine → Knowledge Engine → Intent Engine → AI Provider).
- Recorded knowledge principles (knowledge is separate from history; deleting history never erases
  Core Memory; knowledge grows through confirmed user actions, not passive observation; Core Memory
  stays optional/transparent/exportable/deletable) and performance principles.
- Added the Intent Engine and a replaceable AI provider to the roadmap; moved Google OAuth to a
  longer-term goal.

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

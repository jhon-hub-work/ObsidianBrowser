# Roadmap

Obsidian is built one milestone at a time. Each completed milestone leaves the browser stable
enough for daily use. We implement only the current milestone; future work is documented, not built.

## Completed

### ✅ Milestone 1 — Foundation (v0.1)
Stability and session restore.
- Crash-resistant browser lifecycle and error handling
- Restore all tabs, pinned tabs, window size/position, and scroll on relaunch
- Clean startup/shutdown, single-instance lock
- Architecture prepared for the Workspace Engine

Also present from earlier foundation work: tabbed Chromium browsing, Windows-native window,
command palette, AI-aware address bar, ad/tracker blocking, private tabs, and settings.

## Upcoming

### Milestone 2 — Workspace Engine
Persistent, isolated workspaces that replace bookmarks.
- One workspace = its own tabs, cookies, logins, and history (isolated session per workspace)
- Instant switching that restores the full environment
- Vertical workspace sidebar

### Milestone 3 — Context Engine
The browser becomes aware of what you're working on.
- Observes navigation and page content to build working context per workspace
- No conversation yet — context first

### Milestone 4 — Knowledge Engine
Accumulated long-term knowledge.
- Dedicated, independent knowledge store
- Scoped: global (you) + per-workspace namespaces, isolated by default

### Milestone 5 — Intent Engine
Understands what the developer is trying to accomplish, built on accumulated context and knowledge.

### Milestone 6 — AI Actions
Built-in, no extensions.
- Summarize, explain, rewrite, explain code, review — acting on accumulated context
- Runs through a **replaceable AI provider** (no vendor baked in; cloud optional)

## Longer-term goals

- Become a complete daily-driver browser replacement
- Google OAuth compatibility, solved with supported approaches (not embedded-browser workarounds)
- Optional cloud AI providers — the browser and its local intelligence must stand alone

## Deferred (intentionally not on the roadmap yet)

Chrome Sync, extension ecosystem, cloud accounts, themes, mobile.
These are postponed until the browser itself is exceptional.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the permanent design principles behind this roadmap.

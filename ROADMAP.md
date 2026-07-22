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

### ✅ Window system (v0.2)
Multi-window support, ahead of the milestone that needs it.
- Per-window context map; every IPC handler and shortcut resolves its sender's window
- The application layer owns windows — see [ADR-0003](docs/adr/0003-window-ownership.md)
- Groundwork for the Workspace Engine, composed into rather than rewritten

### ✅ Private architecture (v0.2)
Private browsing as a structural boundary rather than a styled tab.
- Private browsing is a separate window with no identity in its chrome
- Dedicated `obsidian://private` landing page stating capabilities *and* limits
- Nothing persisted; no `History` instance injected at all
- Rationale in [ADR-0002](docs/adr/0002-private-browsing-as-a-window.md)

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

## Definition of done

A milestone is not finished when it works. It is finished when the next person to touch it — six
months from now, with no memory of this — can understand it without reading the diff.

A milestone is complete when all of the following are true:

1. **It ships a browser that is stable enough for daily use.** No milestone leaves the browser worse than it found it.
2. **`CHANGELOG.md` records what changed**, under Added / Changed / Fixed, with a version and a date.
3. **`ROADMAP.md` marks it complete** and the next milestone is unambiguous.
4. **Any decision with a rejected alternative has an ADR** in [`docs/adr/`](docs/adr/). If there was no real alternative, there was no decision — skip it.
5. **`README.md` reflects what is actually shipped**, and explicitly labels anything visible in the UI that is a designed-ahead shell.
6. **`VISION.md` / `ARCHITECTURE.md` are updated only if a principle genuinely changed.** Restating existing principles in new words is documentation debt, not documentation.

Point 6 is the one that keeps this set honest: more documents saying the same thing is worse than
fewer, because they drift apart and then none of them can be trusted.

Implementation begins only after the previous milestone's documentation is merged.

---

See [ARCHITECTURE.md](ARCHITECTURE.md) for the permanent design principles behind this roadmap, and
[`docs/adr/`](docs/adr/) for the record of individual decisions and what they rejected.

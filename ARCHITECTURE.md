# Architecture

Permanent engineering principles and long-term system design for Obsidian Browser.
These are **decisions, not a to-do list** — future implementations must follow them, but nothing
here is built until its milestone. The current milestone (Foundation) is complete.

## Product identity

Obsidian is **not an AI browser**. It is a **workspace-first browser that accumulates engineering
knowledge over time**.

**Mission:** build a lightweight, premium browser that becomes a Personal Intelligence System while
remaining an excellent daily browser.

## Guiding principles

1. **Browser first.**
2. **Workspace first.**
3. **Performance before features.**
4. **Context before conversation.**
5. **Knowledge before model retraining.**
6. **Privacy before convenience.**
7. **Local-first. Cloud optional.**

When a decision is unclear, these win — in order.

## Long-term layered architecture

Each layer sits *below* the next and never depends upward. AI reads from the lower layers; it is
never foundational.

```
AI Provider        replaceable inference layer — consumes Context + Knowledge; cloud optional
Intent Engine      understands what the developer is trying to accomplish
Knowledge Engine   independent subsystem for durable long-term knowledge (Core Memory)
Context Engine     per-workspace; understands the current working context
Workspace          the primary organizational unit
Browser            the primary product — always fast, always usable on its own
```

- **Browser** — must always remain the primary product. It is excellent and usable every day with
  no AI at all.
- **Workspace** — the primary organizational unit. See the ownership model below.
- **Context Engine** *(future)* — attached to each Workspace; understands the current working
  context. Ephemeral and observational.
- **Knowledge Engine** *(future)* — an independent subsystem responsible for durable long-term
  knowledge. Independent of Workspace, SessionStore, and History.
- **Intent Engine** *(future)* — understands what the developer is trying to accomplish.
- **AI Provider** *(future)* — a replaceable inference layer that consumes Context and Knowledge.
  No single vendor is baked in; cloud providers are always optional.

## Workspace Engine ownership (approved design)

- **One `TabManager` per active workspace.** Cold workspaces are lightweight descriptors, hydrated
  on demand.
- **Per-workspace session partitions** (`persist:ws-<id>`) give true isolation — separate cookies,
  logins, cache, and history per workspace. This is the isolation mechanism, not just visual.
- **`WorkspaceManager`** owns workspace switching and is the single authority for the active
  workspace. It also assembles the session snapshot.
- **`SessionStore`** remains the sole owner of on-disk session persistence.
- **The app/main layer owns windows.** WorkspaceManager receives the window as a mount target; it
  never creates windows.
- **Intelligent lifecycle management** for inactive workspaces: an LRU hot set stays live for
  instant switching; older workspaces evict to cold to keep memory bounded.

## Knowledge principles

- **Knowledge is separate from browser history.** They are different subsystems with different
  lifecycles.
- **Deleting browsing history must never automatically erase Core Memory.**
- **Knowledge grows through confirmed user actions, not passive observation.** The Context Engine
  may observe, but nothing becomes durable Knowledge without a confirmed user action. This is the
  hard line between *Context* (ephemeral, observed) and *Knowledge* (durable, confirmed).
- **Core Memory must always remain optional, transparent, exportable, and deletable.**

## Performance principles

- Every architectural decision prioritizes browser responsiveness.
- AI must never noticeably impact browsing performance.
- Memory usage stays as low as reasonably possible.
- Inactive workspaces use intelligent lifecycle management (see above).

## Privacy & data

Local-first by default; cloud is optional and never required. Knowledge and Core Memory stay on the
user's machine unless the user explicitly opts in. Privacy comes before convenience.

## Future browser goals

- Obsidian should eventually become a complete daily-driver browser replacement.
- Google OAuth compatibility is an important future milestone, to be solved with supported
  approaches (not embedded-browser workarounds).
- Cloud AI providers remain optional; the browser and its local intelligence must stand alone.

## Decision records

This document describes the design **as it currently stands** and is edited as the design evolves.
It deliberately does not record what was rejected along the way.

That reasoning lives in [`docs/adr/`](docs/adr/), which is append-only: an accepted ADR is never
rewritten, only superseded. When this file and an ADR disagree, this file describes today and the ADR
describes the decision that produced it.

| # | Decision |
|---|---|
| [0001](docs/adr/0001-browser-first.md) | AI is the topmost layer, never the foundation |
| [0002](docs/adr/0002-private-browsing-as-a-window.md) | Private browsing is a window, not a tab |
| [0003](docs/adr/0003-window-ownership.md) | The application layer owns windows |
| [0004](docs/adr/0004-workspace-isolation.md) | Workspaces isolate via Chromium session partitions |

---

*These are architectural decisions only. Implementation belongs to future milestones.*

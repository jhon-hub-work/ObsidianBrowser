# ADR-0003: The application layer owns windows

- **Status:** Accepted
- **Date:** 2026-07-22
- **Milestone:** Window system (between 1 and 2)

## Context

Until v0.2.0 the main process assumed exactly one window. Two module-level globals, `win` and `tabs`,
were referenced directly by every IPC handler, every keyboard shortcut, and every persistence call.

[ADR-0002](0002-private-browsing-as-a-window.md) required a second window. That made the singletons
untenable — but it also arrived early, before the Workspace Engine, which is the milestone that
genuinely multiplies windows and workspaces. Getting ownership wrong here would have been paid for
twice.

The question is narrow and consequential: **which layer creates and owns `BrowserWindow` instances?**

The tempting answer is `WorkspaceManager`. Workspaces will feel like the organizing unit of the
product, so it reads naturally that a workspace owns its window. That instinct is the thing this
record exists to refuse.

## Decision

The **application/main layer** owns windows. Nothing below it creates, destroys, or holds authority
over a `BrowserWindow`.

The main process holds a map of window contexts:

```js
wins: Map<BrowserWindow.id, { win, tabs, incognito, booted }>
```

Every IPC handler and every keyboard shortcut resolves the sender's window first — via
`BrowserWindow.fromWebContents`, falling back to a scan of tab web contents, then to the focused
window. No handler addresses a global.

The ownership hierarchy, top down:

| Layer | Owns |
|---|---|
| **Application** | Browser windows, app lifecycle, IPC surface, `WorkspaceManager` |
| **WorkspaceManager** | Workspace switching, workspace lifecycle, the hot/cold set |
| **Workspace** | Its `TabManager`, and later its Context and Knowledge engines |
| **TabManager** | Tabs, navigation, rendering, per-tab crash recovery |

> **Guard:** `WorkspaceManager` must never become responsible for `BrowserWindow` ownership. It
> receives a window as a mount target. It does not create one.

## Alternatives considered

**`WorkspaceManager` owns windows.**
Intuitive, and wrong. It inverts the dependency: the workspace layer would need to know about window
lifecycle, display geometry, and OS-level events, none of which are workspace concerns. It also makes
a private window incoherent — a private window has no workspace, so a workspace-owned window model
has no place to put it. The layer that must handle the exception is the layer that should own the
concept.

**Keep the singletons and special-case the private window.**
Smallest immediate diff: one extra global, a handful of `if (isPrivate)` branches. Rejected because
the branch count grows with every handler, and Milestone 2 multiplies windows anyway. This is the
change that gets more expensive the longer it is deferred, which is precisely the kind to make early.

**One `TabManager` shared across windows, keyed by window.**
Rejected. `TabManager` already took its window as a constructor argument and used `this.win`
throughout — it was correctly scoped from the start. Merging that scope to add a key would have
destroyed a boundary that was already right.

## Consequences

**Easier:** N windows work without further change. The Workspace Engine composes into this instead of
rewriting it — `WorkspaceManager` slots in beneath the application layer and receives windows as
mount targets. This refactor cost roughly one file because the boundary underneath it was already
correct.

**Harder:** every new IPC handler must resolve its sender rather than reaching for a global. That is
one extra line per handler and a rule that has to be remembered. The `onTab` / `onWin` helpers exist
to make the correct path the shortest one.

**Foreclosed:** any design where a subsystem below the application layer creates windows. That
includes the plausible future request "let a workspace open its own window" — which must be
implemented as the workspace *asking* the application layer, never as the workspace doing it.

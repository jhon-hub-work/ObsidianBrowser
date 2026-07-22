# ADR-0004: Workspaces isolate via Chromium session partitions

- **Status:** Accepted (design approved; implementation is Milestone 2)
- **Date:** 2026-07-21
- **Milestone:** 2 — Workspace Engine

## Context

Workspaces are Obsidian's primary organizational unit — the thing that replaces bookmarks and
undifferentiated tab piles. VISION.md puts "workspace first" second only to "browser first".

The question is what a workspace actually *is* at runtime. The answer determines whether workspaces
are a genuine feature or a cosmetic grouping, and it cannot be changed later without invalidating
every workspace a user has created.

The concrete driver: signing into the same service as two different identities — a client's account
in one project, my own in another — is a real, daily problem that tab groups cannot solve at all.

## Decision

Each workspace gets its own **Chromium session partition**, `persist:ws-<id>`. Separate cookies,
logins, cache, and storage. Switching workspaces switches identity, not just which tabs are visible.

Supporting decisions:

- **One `TabManager` per active workspace.** Cold workspaces are lightweight descriptors, hydrated on demand.
- **`WorkspaceManager` is the single authority** for the active workspace and assembles the session snapshot. It receives a window as a mount target — see [ADR-0003](0003-window-ownership.md).
- **`SessionStore` remains the sole owner** of on-disk session persistence. `session-store.js` is already keyed by workspace with only `default` populated, so the engine drops in as additional keys with no change to that file or to the tab engine.
- **Intelligent lifecycle management:** an LRU hot set stays live for instant switching; older workspaces evict to cold so memory stays bounded as workspace count grows.

## Alternatives considered

**Visual tab groups.**
Far less work, and what the first instinct reached for. Rejected because grouping is cosmetic: it
solves "too many tabs" and solves nothing about identity, cookies, or logins. It would also have had
to be torn out to add real isolation later, since users would already have grouped tabs that carry no
partition. Isolation must be architectural, not visual — the same conclusion
[ADR-0002](0002-private-browsing-as-a-window.md) reached from a different direction.

**One partition, with cookie-jar swapping on switch.**
Rejected as both slower and less trustworthy. Swapping is an operation that can partially fail; a
partition is a boundary that cannot. Correctness under failure is the whole point.

**Keep every workspace live for instant switching.**
Rejected on the performance principle: memory use must stay as low as reasonably possible, and
unbounded growth in workspace count is exactly the scenario a power user creates. The LRU hot set
buys most of the switching speed at a bounded cost.

**A separate OS process per workspace.**
Strongest isolation available, and rejected as disproportionate. Chromium partitions already provide
the isolation the problem calls for; process-per-workspace multiplies memory for a guarantee not
being asked for.

## Consequences

**Easier:** two identities on one service becomes trivial and requires no user ceremony. Per-workspace
history and, later, per-workspace Context and Knowledge scoping all follow naturally from a boundary
that already exists.

**Harder:** partitions are heavier than tab groups — more disk, more cache, slower cold start for a
workspace that has not been used in a while. The hot/cold split exists to keep that cost bounded, and
adds real complexity to workspace lifecycle.

**Foreclosed:** sharing a login across workspaces without signing in twice. That is the intended
trade, but it will surface as a complaint, and the answer must be a deliberate opt-in mechanism
rather than a weakening of the default.

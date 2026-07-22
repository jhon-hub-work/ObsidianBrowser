# ADR-0002: Private browsing is a window, not a tab

- **Status:** Accepted
- **Date:** 2026-07-22
- **Milestone:** Private architecture (between 1 and 2)

## Context

Private tabs shipped in v0.1.0 and were **correct underneath**: their own Chromium session partition,
excluded from history, never persisted. Every guarantee held.

They were also, on screen, indistinguishable from normal tabs. The styling was a 1px dashed border
in `#3b2f56` — a colour that disappears against the dark theme. And a private tab opened
`obsidian://home`, the personalized new-tab page, which greets the user by name and lists their
workspaces.

That combination is worse than having no private mode. A user who cannot tell which mode they are in
gets none of the benefit and all of the false confidence. The failure is not that privacy was broken;
it is that the *interface lied about which session the user was in*, while the storage layer told the
truth.

Obsidian's stated principle is privacy before convenience. A privacy feature that depends on the user
noticing a 1px border does not implement that principle, it gestures at it.

## Decision

Private browsing is a **separate browser window**, and that window carries no identity.

1. `Ctrl+Shift+N` opens a private window. An existing private window is focused and given a new tab rather than a second window being spawned.
2. A dedicated landing page, `obsidian://private`, replaces the personalized home page. It states what the mode does, **what it explicitly does not do**, and why it exists.
3. The account card, pinned links, workspace list, assistant nav, and session stats are **removed from the DOM** in a private window — not hidden with CSS.
4. Private windows persist nothing: no window geometry, no tabs, never restored. Closing the last one clears the partition explicitly.
5. A private window's `TabManager` is constructed with **no `History` instance at all**.

### The principle this encodes

> Private browsing must be **structurally** different, not cosmetically different.
> If the user cannot identify private mode instantly, the implementation has failed.

Four properties follow, and each maps to a decision above: remove **ambiguity** (2), remove
**identity** (3), remove **persistence** (4), and make the boundary **structural** (1, 5).

### On stating the limits

The landing page documents what private mode *cannot* do — no anonymity from an ISP, employer, or
network administrator; signed-in sites still know exactly who you are; downloads outlive the window.

This is a deliberate product choice, not legal hedging. Users systematically overestimate private
browsing. A page listing only the guarantees would leave that overestimate intact and call it
reassurance. **The omission is the vulnerability.**

## Alternatives considered

**Style the private tab more aggressively.**
The obvious fix, and the one initially applied: tinted fill, solid accent border, a marker dot.
Rejected as insufficient on its own. It treats a mode boundary as a visual problem, which leaves the
personalized home page and the signed-in sidebar as edge cases to suppress one by one. Every future
chrome element becomes another thing to remember to hide. (The improved tab styling was kept — it
still marks private tabs *within* the private window.)

**Hide identity elements with CSS in private windows.**
Rejected outright. Hidden-but-present means the user's name is sitting in the DOM of a session whose
landing page claims not to know them. Any bug, any devtools inspection, any future refactor that
touches display rules re-exposes it. Absence is the only implementation that matches the claim.

**Keep a `history.add()` call guarded by an `if (incognito) return` check.**
That guard exists in `history.js` and is correct. Rejected as *sufficient*, and kept as
defence-in-depth. A component that has no reference to the History subsystem cannot record history
regardless of future edits; a component holding a reference and a conditional is one careless change
away from recording it. Not injecting the dependency is a stronger guarantee than instructing it to
behave.

**A separate private profile the user switches into, Chrome-style.**
Rejected as heavier than the problem. Switching profiles is a deliberate, persistent act; private
browsing needs to be momentary and disposable.

## Consequences

**Easier:** mode confusion is now structurally hard rather than visually discouraged — the operating
system enforces the boundary, shows it in the taskbar, and manages it as a distinct window. The
personalized surfaces stopped being edge cases because they are simply never constructed there.

**Harder:** this forced multi-window support before it was otherwise needed. See
[ADR-0003](0003-window-ownership.md) — which turned out to be a benefit, since it is the groundwork
Milestone 2 required anyway.

**Foreclosed:** a private tab living beside normal tabs in one window. Users who want that will not
get it, and that is the intent — the ambiguity it creates is the thing being removed.

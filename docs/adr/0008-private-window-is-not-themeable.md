# ADR-0008: The private window is not themeable

- **Status:** Accepted
- **Date:** 2026-07-22
- **Milestone:** 3 — Appearance

## Context

[ADR-0002](0002-private-browsing-as-a-window.md) makes one guarantee: *private browsing must be
structurally different, not cosmetically different — if the user cannot identify private mode
instantly, the implementation has failed.*

That guarantee is **implemented** by the violet chrome. `body.private-window` in `shell.css`, the
`#0d0a16` window background in `index.js`, and `private.html`'s palette are not decoration; they are
the mechanism by which a user knows that what they type is not being recorded.

A theme system that recolours the chrome therefore reaches directly into a safety guarantee. A ruby
or galaxy ambience would recolour the window and the violet would stop being distinctive. A light
theme would produce a light private window, and the mode contrast that currently makes private mode
obvious at a glance disappears.

Either would degrade ADR-0002 back to "a colour on a window" — the exact failure that ADR was
written to kill — **silently**, with no test that would catch it, as a side effect of a user
adjusting an unrelated preference.

## Decision

Neither mode nor ambience applies to a private surface. The private palette is fixed, lives in a
block no theme selector can reach, and is not user-configurable.

This is enforced structurally rather than by CSS specificity. `theme-boot.js` refuses to set
`data-theme` or `data-ambience` on a private surface at all, and `private.html` carries
`data-private` in its markup rather than acquiring it at runtime — so there is nothing for a theme
rule to compete with, and no ordering bug can expose one.

## Alternatives considered

**Theme the private window like everything else, for consistency.** Consistency is the wrong
objective for the one surface whose entire purpose is to be inconsistent with the others.

**Apply mode but not ambience.** Rejected: a light private window is precisely the case where private
chrome stops being unmistakable at a glance. Mode is the more dangerous of the two axes here, not the
safer one.

**Offer a user-selectable "private" ambience.** Makes the identifiability of private mode a
preference. That is the same mistake as a 1px dashed border, one level up: a safety property that
holds only while the user has not changed a setting is not a safety property.

## Consequences

- The private window ignores the user's theme entirely. This is intentional and is stated in the
  Appearance settings pane, so it reads as a guarantee rather than a bug.
- `nativeTheme.themeSource` is app-global in Electron and cannot be varied per-session. A light-mode
  user's `prefers-color-scheme` is therefore visible to web content in private windows too. That is
  one bit, exposed by every mainstream browser, and not preventable in this architecture — it
  belongs in the documented limits of private mode rather than being left to be discovered.

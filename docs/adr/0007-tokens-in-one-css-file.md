# ADR-0007: Design tokens live in one CSS file, which the main process parses

- **Status:** Accepted
- **Date:** 2026-07-22
- **Milestone:** 3 — Appearance

## Context

Colour was declared in five places: `shell.css`, and an inline `:root` block in each of `home.html`,
`settings.html` and `private.html`, plus literals in `index.js` (window background) and `tabs.js`
(the `did-fail-load` error page). 128 hex literals in total.

They had already drifted. The chrome painted `--bg: #0b0b0b` and `--accent: #4169e1` while the
new-tab page it frames painted `#08080b` and `#2563eb` — different blacks and different blues, on
adjacent surfaces, in shipped code. Nobody introduced that deliberately; it is what duplication does
on its own. A theme system built on top of five sources would multiply the drift by the number of
themes.

The main process is the hard half. `BrowserWindow.backgroundColor` and the error page are painted
from JavaScript, where CSS cannot reach — and `index.js:210` already hardcoded `#0b0b0b`, which
matched `shell.css`, and `#0d0a16`, which matched `private.html`. Two sources that happen to agree
today is the failure mode, not the fix.

## Decision

`src/renderer/tokens.css` is the sole source of design tokens. Every renderer surface links it.
`src/main/tokens.js` reads that same file once at boot, regex-parses `--name: value` pairs per
selector block, and resolves the cascade in JS for the main process's use, with a frozen hardcoded
fallback so a malformed stylesheet yields a wrong colour rather than a crash or a white window.

The direction is deliberate: **CSS is the source and main reads it**, never the reverse. 128 of the
values already lived in CSS, custom properties are the natural home for cascading theme values, and
there is then exactly one artifact — nothing to keep in sync, because there is no second thing.

Cost is one synchronous read of a ~4KB file at boot, on a path where `SessionStore` already does the
same.

## Alternatives considered

**A JS/JSON token module, with `tokens.css` generated from it.** The strongest alternative: types,
comments, programmatic derivation of shades. Rejected because it is a build step in a project whose
stated advantage is having none, and because the generated file must be committed — so the first
person to hand-edit the CSS reintroduces exactly the drift the generator exists to prevent. That is
precisely how the current three-way divergence happened.

**Duplicate the values as constants in main.** This is the status quo at small scale. It is what
produced the divergence being fixed.

**Ship tokens to renderers over IPC.** Makes first paint depend on an async round trip, which
introduces a flash of the wrong theme on every window and every new tab — the exact problem
[ADR-0008](0008-private-window-is-not-themeable.md)'s sibling mechanism exists to avoid.

## Consequences

- Adding a theme or an ambience is a CSS-only change; the settings UI enumerates what the stylesheet
  defines rather than carrying its own list.
- `tokens.js` depends on the *shape* of `tokens.css`. Nesting or `@media` blocks inside it would
  break the flat parser. The file is documented as declarations-only for that reason.
- Not every literal was removed. Favicon-fallback chip colours, the Windows caption-close red, and
  brand accents on the new-tab cards are not theme values; a token that exists to be set once is
  worse than the literal it replaced.

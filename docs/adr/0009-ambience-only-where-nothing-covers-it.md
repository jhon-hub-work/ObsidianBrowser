# ADR-0009: Ambience renders only where no native view covers it, and never animates

- **Status:** Accepted
- **Date:** 2026-07-22
- **Milestone:** 3 — Appearance

## Context

An *ambience* is a visual identity — Milky Way, aurora, ruby — applied on top of the light/dark axis.
The obvious place to put one is "the browser", meaning the chrome.

The geometry forbids it. A tab's `WebContentsView` is added to `win.contentView` and given bounds
covering the `#content` grid area. It **paints over the HTML shell and it is opaque** — the reason
`hideActive()` / `showActive()` exist at all is that the command palette cannot be seen until the
view is hidden.

So there is no "behind the web page". Ambience rendered in the shell is visible only in the 236px
sidebar, the 216px right rail and the two 54px bars: an L-shaped gutter around an opaque hole. A
photographic background in the chrome is not a photograph — it is a crop of one, with the interesting
70% permanently covered by whatever page is open. It would look wrong for structural reasons, not
aesthetic ones.

Animation has a separate problem. The shell renderer is a distinct process that does not know it is
covered. The window is visible, so compositor frames keep being produced: an animated aurora in the
sidebar burns GPU and CPU continuously **while delivering pixels nobody can see**. That inverts the
project's third principle, *performance before features*, with the feature not even being AI.

## Decision

Ambience renders only on surfaces no native view covers: `obsidian://home`, `obsidian://settings`,
the boot splash and the workspace-switch overlay. The browser chrome carries no ambience — it takes
the ambience's *palette*, but no imagery. Ambience is static.

The chrome stays quiet; the new-tab page carries identity. Those are compatible readings of
"everything disappears until you need it": the frame disappears, the empty state has personality.
`home.html` already established this pattern with its CSS mountain ridges — ambience generalises an
existing idea rather than relocating it somewhere it cannot work.

## Alternatives considered

**Ambience in the chrome.** Rejected on geometry: it survives only as a gutter crop, while costing
repaint in a region that is mostly occluded.

**Animated ambience, gated on visibility.** To be free it needs four guards — occlusion, window blur,
`visibilitychange`, and `prefers-reduced-motion` (which nothing in this codebase currently honours
anywhere). Needing four guards to make a decoration free is evidence it is in the wrong layer.

**A transparent `WebContentsView`, so ambience shows behind web content.** Rejected: it breaks every
page that assumes an opaque background, makes text legibility on real sites a function of a
decorative choice, and takes a materially more expensive compositing path.

## Consequences

- Ambiences are CSS-generated first. Photographic assets remain possible later but carry their own
  budget (single image, pre-scaled, no `background-attachment: fixed`), a licensing question and a
  per-DPI question — none of which are theme-system problems.
- `home.html` uses `backdrop-filter` on its ask box. Layering a photographic ambience behind a live
  `backdrop-filter` is an expensive compositing path and must be measured, not assumed, if that
  option is ever taken.
- Startup-to-first-paint is already logged. It is the metric that decides whether an ambience is
  affordable.

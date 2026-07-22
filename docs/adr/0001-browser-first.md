# ADR-0001: AI is the topmost layer, never the foundation

- **Status:** Accepted
- **Date:** 2026-07-21
- **Milestone:** 1 — Foundation

## Context

Obsidian's long-term goal is a browser that accumulates engineering knowledge and understands what
you are working on. That goal makes it tempting to build the intelligence layer early and deeply —
to treat AI as the product and the browser as its delivery mechanism.

The category is already full of products built that way. They share a failure mode: once inference
sits on the critical path of browsing, every latency problem becomes structural. You cannot optimize
your way out of an architecture that requires a model call before a page feels ready.

The constraint that settles it is personal and non-negotiable: this browser has to be my daily
driver. A browser I avoid because it feels slow is worth nothing regardless of how intelligent it is.

## Decision

AI sits at the **top** of a strictly layered stack and reads downward. It is never depended upon by
any layer beneath it.

```
AI Provider        replaceable inference; cloud optional
Intent Engine      what the developer is trying to accomplish
Knowledge Engine   durable, user-confirmed knowledge
Context Engine     per-workspace, ephemeral, observational
Workspace          primary organizational unit
Browser            the primary product — excellent with AI off
```

The operative test: **with every AI feature disabled, Obsidian must remain a browser worth using
every day.** If AI ever slows down browsing, the AI is wrong.

## Alternatives considered

**Build AI into the core, as the "AI browser" category does.**
This is the strongest alternative and deserves a fair hearing: deep integration allows AI to see
everything, act anywhere, and feel native rather than bolted on. Rejected because the coupling is
one-way expensive. Deep integration is easy to add later to a clean core and effectively impossible
to remove from a compromised one. The option value runs entirely in one direction.

**Ship AI first to validate the idea, harden the browser later.**
Faster to something demonstrable. Rejected because the browser is the part that must be excellent,
and "harden it later" is not a plan that has ever survived contact with a working product. Every
shortcut taken under an AI-first architecture becomes a constraint on the browser underneath it.

**Integrate one vendor deeply for a better experience.**
Rejected in favour of a replaceable provider. Model vendors change on a quarterly cadence; the
knowledge substrate has to outlive all of them. See the composability principle in VISION.md.

## Consequences

**Easier:** performance work stays tractable, because browsing never waits on inference. Swapping or
removing the AI provider is a local change. The browser ships and is useful long before any
intelligence exists — which is why v0.1.0 was a usable browser rather than a demo.

**Harder:** AI features cannot take shortcuts through lower layers. Anything the Intent Engine wants
must be exposed deliberately by Context or Knowledge, which is more design work than reaching
directly into tab state.

**Foreclosed:** Obsidian will not compete on AI-native feel in the short term. A product that put
inference in the core can do things sooner. That is an accepted cost, not an oversight.

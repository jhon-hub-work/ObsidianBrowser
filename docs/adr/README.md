# Architecture Decision Records

An ADR records **one decision, with the context that forced it and the alternatives that were
rejected** — at the moment it was made.

## The question these own

**"Why was it decided this way, and what was rejected?"** — see the
[documentation map](../README.md) for how that fits alongside the other documents.

ADRs are **append-only**. They are never edited to match new reality. When a decision is overturned,
a new ADR supersedes the old one and the old one stays, marked. That immutability is the whole value:
a document that can't drift is a document you can trust years later.

## Rules

1. One decision per record. If it needs "and", it is two records.
2. Numbered sequentially, never renumbered.
3. Status is one of: `Accepted`, `Superseded by ADR-XXXX`, `Deprecated`.
4. Never rewrite an accepted ADR. Supersede it.
5. Record the alternatives seriously — a rejected option described weakly is not a record, it is a defence.

## Index

| # | Decision | Status | Date |
|---|---|---|---|
| [0001](0001-browser-first.md) | AI is the topmost layer, never the foundation | Accepted | 2026-07-21 |
| [0002](0002-private-browsing-as-a-window.md) | Private browsing is a window, not a tab | Accepted | 2026-07-22 |
| [0003](0003-window-ownership.md) | The application layer owns windows | Accepted | 2026-07-22 |
| [0004](0004-workspace-isolation.md) | Workspaces isolate via Chromium session partitions | Accepted | 2026-07-21 |
| [0005](0005-workspace-identity.md) | Workspace ids are immutable UUIDs; names are metadata | Accepted | 2026-07-22 |
| [0006](0006-legacy-partition-reuse.md) | The default workspace keeps the original partition | Accepted | 2026-07-22 |
| [0007](0007-tokens-in-one-css-file.md) | Design tokens live in one CSS file, which main parses | Accepted | 2026-07-22 |
| [0008](0008-private-window-is-not-themeable.md) | The private window is not themeable | Accepted | 2026-07-22 |
| [0009](0009-ambience-only-where-nothing-covers-it.md) | Ambience renders only where nothing covers it, and never animates | Accepted | 2026-07-22 |

## Template

```markdown
# ADR-XXXX: <decision, stated as a claim>

- **Status:** Accepted
- **Date:** YYYY-MM-DD
- **Milestone:** <n — name>

## Context
What was true that forced a decision. Constraints, not preferences.

## Decision
What was chosen, stated plainly.

## Alternatives considered
Each option, and the specific reason it lost. Argue them honestly.

## Consequences
What this makes easy, what it makes hard, and what it forecloses.
```

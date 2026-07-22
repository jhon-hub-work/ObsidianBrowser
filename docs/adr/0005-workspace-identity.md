# ADR-0005: Workspace ids are immutable UUIDs; names are editable metadata

- **Status:** Accepted
- **Date:** 2026-07-22
- **Milestone:** 2 — Workspace Engine

## Context

A workspace needs an identifier. That identifier will be referenced by things that do not exist yet:
the session partition (`persist:ws-<id>`), per-workspace tab state in `session.json`, and — from
Milestones 3 and 4 — the Context Engine and the scoped Knowledge namespaces.

Those later references are the constraint. Knowledge is meant to be durable and to accumulate over
years. Anything it binds to has to be stable for that long.

Workspace *names*, meanwhile, are exactly the kind of thing a user edits casually. "Client work"
becomes "Acme" becomes "Acme (archived)". Renaming is a normal, frequent act with no expectation of
consequence.

## Decision

Ids are **immutable UUIDs**, generated at creation and never changed. Names are **metadata**, freely
editable, and referenced by nothing but the UI.

Metadata is also stored separately from runtime state in `session.json`:

- `workspaceMeta` — id, name, createdAt. Identity. Rarely written.
- `workspaces` — open tabs, active index. Runtime. Written constantly.

Future metadata (icon, colour, AI provider, memory settings) is additive to the first and never
touches the tab-restore path.

The default workspace is the single exception: its id is the literal string `default`, not a UUID.
It predates this decision — existing installs already have `workspaces.default` in `session.json`,
and rewriting that id would orphan the saved tabs it keys. See
[ADR-0006](0006-legacy-partition-reuse.md), which reuses the same reasoning for its partition.

## Alternatives considered

**Name as the id (slugified).**
Simplest, human-readable in `session.json`, and debuggable at a glance. Rejected because rename then
becomes a destructive migration: the partition path changes, so cookies and logins are orphaned, and
every Knowledge entry scoped to the old slug is stranded. A rename is a UI affordance users expect to
be free. Making it free is only possible if nothing depends on the name.

**Incrementing integers.**
Compact and ordered. Rejected because ids must be unique across merges, restores, and any future
sync. An integer counter held in one `session.json` collides the moment a second source of truth
exists — and "we will never sync" is not a commitment this project has made.

**Name as id, with a rename-migration routine.**
Rejected as strictly worse than a UUID: it accepts all the coupling and then pays engineering effort
to survive it. The migration would have to move a Chromium partition directory, rewrite session keys,
and re-scope Knowledge — every one of which can partially fail.

## Consequences

**Easier:** rename is a metadata write and nothing else. Context and Knowledge can bind to ids from
day one without a stability caveat. Adding workspace metadata never risks the tab-restore path.

**Harder:** `session.json` is less readable — `persist:ws-9f8c...` tells a human nothing. Debugging
needs the meta list alongside it, and any future workspace-related logging should print the name for
that reason.

**Foreclosed:** treating the name as a stable handle anywhere. If a feature ever wants to address a
workspace by name, it must resolve name → id first and accept that the resolution can fail.

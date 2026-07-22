# ADR-0006: The default workspace keeps the original partition

- **Status:** Accepted
- **Date:** 2026-07-22
- **Milestone:** 2 — Workspace Engine

## Context

[ADR-0004](0004-workspace-isolation.md) gives each workspace its own Chromium session partition,
`persist:ws-<id>`. Applied uniformly, that means the default workspace browses in
`persist:ws-default`.

Every existing install browses in `persist:obsidian`. That partition holds every cookie and every
active login the user has. A partition name is a storage path, not a label — changing it does not
migrate anything, it points the browser at an empty directory.

So the uniform rule has a concrete cost on first launch after upgrade: **the user is silently signed
out of every site**, with no error, no explanation, and their previous session still on disk but
unreachable. For a browser being used as a daily driver, that is the most damaging possible
regression, and it would land as a side effect of an internal refactor.

The same tension exists in `session.json`, where saved tabs are already keyed `workspaces.default`.

## Decision

The default workspace maps to the **original** `persist:obsidian` partition. Only workspaces created
after this change receive `persist:ws-<id>`.

```js
function partitionFor(id) {
  return id === DEFAULT_ID ? LEGACY_PARTITION : `persist:ws-${id}`;
}
```

Correspondingly, `SessionStore` migrates **additively and without a `VERSION` bump**: `workspaceMeta`
is synthesized when absent, and nothing existing is rewritten. Bumping the version would have made
the loader reject every existing `session.json` and discard the user's tabs — the same class of
silent data loss, in a different subsystem.

## Alternatives considered

**Rename uniformly to `persist:ws-default` and accept the sign-out.**
Cleanest model, one rule with no exception. Rejected: the cost is borne entirely by the existing user
and the benefit is entirely internal tidiness. No user has ever been glad to be signed out so that a
naming scheme could be consistent.

**Copy the partition directory on first launch, then use the new name.**
Preserves both the clean rule and the logins. Rejected as a genuinely attractive option that loses on
failure modes: it is a multi-gigabyte recursive copy of a live Chromium profile, during startup,
which can partially fail and leave two divergent profiles with no way to tell which is authoritative.
The exception in `partitionFor` is one line and cannot fail.

**Migrate lazily — try the new partition, fall back to the old if empty.**
Rejected as the worst of both. "Empty" is not reliably detectable, the fallback path would live
forever, and the resulting behaviour depends on state that is invisible to the user.

## Consequences

**Easier:** upgrading is a non-event. No sign-out, no re-authentication, no data migration to get
wrong. Verified on a real install: `session.json` migrated in place with all five tabs, pinned flags,
and scroll positions intact, and `Partitions/` still contained only `obsidian` — no `ws-default` was
created.

**Harder:** one permanent special case in `partitionFor`. It is load-bearing and easy to "clean up"
by someone who does not know why it exists — which is precisely why this record exists.

**Foreclosed:** deleting the default workspace. It owns the original partition, so `remove()` refuses
it. Users who want a clean start must clear data rather than delete the workspace.

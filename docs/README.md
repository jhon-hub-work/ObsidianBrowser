# Documentation map

## The Single Question Rule

> **Every document answers exactly one architectural question.**
> If two documents answer the same question, merge them or delete one.

A new document belongs in this repository only if you can name the question it owns and no existing
document already owns it. "Similar projects have one" is not a reason. Two documents answering the
same question drift apart the moment either is edited — and once they disagree, neither can be
trusted and a reader has to diff them to find the truth.

The corollary matters as much: when a document's answer changes, **edit that document**. Do not add a
second one that explains the change.

## Who owns which question

| Document | The one question it answers |
|---|---|
| [README.md](../README.md) | What is this, and how do I run it? |
| [VISION.md](../VISION.md) | What is this trying to become, and what principles decide close calls? |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | How is the system designed *right now*? |
| [ROADMAP.md](../ROADMAP.md) | What is built, what is next, and when is a milestone finished? |
| [CHANGELOG.md](../CHANGELOG.md) | What changed, in which release? |
| [docs/adr/](adr/) | Why was it decided this way, and what was rejected? |
| [docs/screenshots/](screenshots/) | What does it actually look like? |

## Where things go

- **A principle changed** → VISION.md. Rare. Principles that change monthly were preferences.
- **The design changed** → ARCHITECTURE.md. It describes today, so it is edited freely.
- **A decision was made with a real alternative** → a new ADR. Never edit an accepted one; supersede it.
- **A decision had no alternative** → nowhere. There was no decision, only an implementation.
- **Something shipped** → CHANGELOG.md, and ROADMAP.md if it completed a milestone.
- **You want to explain reasoning at length** → an ADR. That is what they are for, and it is the only document class here that cannot drift, because it is append-only.

## Why ADRs are append-only

Every other document above describes the present and is rewritten as the present changes. That makes
them useful and makes them lossy: the reasoning that produced today's design is overwritten by today's
design.

ADRs are the only record of what was considered and rejected. Rejected alternatives are the most
expensive knowledge in a project and the first thing lost, because they exist nowhere but in the head
of whoever made the call. See [docs/adr/README.md](adr/README.md) for the rules and the template.

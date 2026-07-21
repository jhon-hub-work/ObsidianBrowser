# Obsidian Browser

An AI-first workspace browser for developers, creators, and power users — built to become a
personal intelligence system while remaining a fast, fully functional local browser.

Obsidian is not a Chrome clone. Chrome is for browsing websites; Obsidian is for building things.

> **Status:** early development · Windows · single-user · not yet packaged for distribution

## Why

Modern browsers optimize for consuming the web. Obsidian optimizes for *work* — keeping your
projects, context, and tools in one quiet, keyboard-first environment that remembers where you
left off and, over time, understands what you're working on. See [VISION.md](VISION.md).

## Current status

The browser is functional and stable enough for daily use. The foundation milestone
(stability + full session restore) is complete. The next milestone is the Workspace Engine.

## Features completed

- **Chromium-based browsing** — tabbed, with a Windows-native frameless window
- **Command palette** (`Ctrl+K`) — every action reachable, no menu hunting
- **AI-aware address bar** — one input for URLs, web search, or natural-language questions
- **Ad & tracker blocking** — EasyList / EasyPrivacy filters applied at the network layer
- **Private tabs** (`Ctrl+Shift+N`) — throwaway, isolated session
- **Settings** — history, privacy / clear-data, ad-blocker stats
- **Session restore** — reopens exactly where you left off: tabs, pinned tabs, window
  size/position, and scroll
- **Crash resilience** — dead tabs auto-recover; failed loads show a retry page, never a blank void

## Roadmap (high level)

1. ✅ **Foundation** — stability and session restore
2. **Workspace Engine** — persistent, isolated workspaces (tabs, cookies, logins per workspace)
3. **Context Engine** — the browser becomes aware of what you're working on
4. **Knowledge Engine** — accumulated, scoped long-term knowledge
5. **AI actions** — summarize, explain, review — built in, no extensions

Full detail in [ROADMAP.md](ROADMAP.md).

## Getting started

Requires Node.js and runs on Windows.

```bash
npm install
npm run dev
```

## Philosophy

Browser first. AI second. Context over conversation. Knowledge over model retraining.
The full reasoning lives in [VISION.md](VISION.md).

## License

Personal project. All rights reserved for now.

// Reads src/renderer/tokens.css once at boot so the MAIN process paints from
// the same values the renderer does — BrowserWindow.backgroundColor and the
// did-fail-load error page, neither of which CSS can reach. See ADR-0007.
//
// The direction matters: CSS is the source and main reads it, never the
// reverse. Two places that happen to agree today is the failure mode we are
// fixing, not the fix.
const path = require('path');
const fs = require('fs');

const FILE = path.join(__dirname, '..', 'renderer', 'tokens.css');

// If the stylesheet is ever malformed we want a wrong colour, never a crash
// or a white window. These mirror :root in tokens.css.
const FALLBACK = Object.freeze({
  bg: '#0b0b0b', panel: '#0f0f0f', surface: '#141414', raised: '#1c1c1c',
  border: '#222222', muted: '#7a7a7a', dim: '#b4b4b4', text: '#f5f5f5',
  accent: '#4169e1', danger: '#ef4444'
});

const PRIVATE_FALLBACK = Object.freeze({ ...FALLBACK, bg: '#0d0a16', accent: '#a78bfa' });

// selector -> { tokenName: value }
let blocks = null;

function parse() {
  const out = {};
  let css;
  try {
    css = fs.readFileSync(FILE, 'utf8');
  } catch (err) {
    console.error('[tokens] unreadable, using fallback:', err.message);
    return out;
  }

  // Strip comments first: they contain braces-free prose but also colons and
  // hex values that would otherwise be scraped as declarations.
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');

  // Values may contain commas and parens (gradients) but never braces, so a
  // flat block match is sufficient — no nesting exists in this file.
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = blockRe.exec(css)) !== null) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    const decls = {};
    for (const line of m[2].split(';')) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const name = line.slice(0, i).trim();
      if (!name.startsWith('--')) continue;
      decls[name.slice(2)] = line.slice(i + 1).trim();
    }
    if (Object.keys(decls).length) out[selector] = decls;
  }
  return out;
}

function load() {
  if (!blocks) blocks = parse();
  return blocks;
}

/**
 * Resolve the token set for a surface, applying the same cascade the browser
 * would: base -> ambience -> light -> ambience+light.
 *
 * @param {object} opts
 * @param {'light'|'dark'} opts.mode     already resolved; 'system' never reaches here
 * @param {string}         opts.ambience 'none' or an ambience id
 * @param {boolean}        opts.private  private surfaces ignore mode and ambience entirely
 */
function resolve({ mode = 'dark', ambience = 'none', private: isPrivate = false } = {}) {
  const b = load();

  if (isPrivate) {
    return { ...PRIVATE_FALLBACK, ...(b['html[data-private]'] || {}) };
  }

  let t = { ...FALLBACK, ...(b[':root'] || {}) };

  if (ambience && ambience !== 'none') {
    Object.assign(t, b[`:root[data-ambience="${ambience}"]`] || {});
  }
  if (mode === 'light') {
    Object.assign(t, b[':root[data-theme="light"]'] || {});
    if (ambience && ambience !== 'none') {
      Object.assign(t, b[`:root[data-ambience="${ambience}"][data-theme="light"]`] || {});
    }
  }
  return t;
}

// Every ambience the stylesheet actually defines. The settings UI reads this
// rather than carrying its own list that could fall out of sync.
function ambiences() {
  const ids = new Set();
  for (const selector of Object.keys(load())) {
    const m = /^:root\[data-ambience="([^"]+)"\]$/.exec(selector);
    if (m) ids.add(m[1]);
  }
  return [...ids];
}

module.exports = { resolve, ambiences, FALLBACK };

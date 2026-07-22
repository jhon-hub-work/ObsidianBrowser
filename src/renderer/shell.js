const $ = sel => document.querySelector(sel);

// Main passes this on the window URL. A private window renders the same shell
// with every trace of the signed-in identity removed — no account, no pinned
// links, no workspaces. "Obsidian doesn't know who you are here" has to be
// literally true of the chrome, not just of the session partition.
const IS_PRIVATE = new URLSearchParams(location.search).get('private') === '1';

// --- nav data --------------------------------------------------------------

const PINNED = [
  { label: 'Wave3',     url: 'https://wave3.ph' },
  { label: 'Portfolio', url: 'https://jhonmbuerano.netlify.app' },
  { label: 'Clients',   url: 'https://www.onlinejobs.ph' },
  { label: 'Personal',  url: 'https://mail.google.com' },
  { label: 'Research',  url: 'https://claude.ai' }
];

const WORKSPACES = ['Development', 'Business', 'Learning'];

const ASSIST = [
  { label: 'History',     icon: 'history' },
  { label: 'Downloads',   icon: 'download' },
  { label: 'Notes',       icon: 'note' },
  { label: 'Clipboard',   icon: 'clip' },
  { label: 'Screenshots', icon: 'shot' }
];

const ICONS = {
  rows: '<path d="M4 5h16M4 10h16M4 15h16M4 19h16"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 8v4l3 2"/>',
  download: '<path d="M12 4v12"/><path d="m7 12 5 5 5-5"/><path d="M5 20h14"/>',
  note: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h5"/>',
  clip: '<rect x="8" y="3" width="12" height="14" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h10"/>',
  shot: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 15l5-4 4 3 3-2 6 4"/>'
};

const svg = name =>
  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

// --- render ----------------------------------------------------------------

function navItem(label, icon, onClick, active = false) {
  const b = document.createElement('button');
  b.className = 'nav-item' + (active ? ' active' : '');
  b.innerHTML = svg(icon) + `<span>${label}</span>`;
  b.onclick = onClick;
  return b;
}

function renderNav() {
  // A private window has no identity to show. Bail before anything personal is
  // ever put in the DOM — hiding it with CSS would still leave it there.
  if (IS_PRIVATE) {
    document.body.classList.add('private-window');
    $('.profile')?.remove();   // name + plan + avatar are the signed-in identity
    $('.avatar')?.remove();
    $('.today')?.remove();     // focus/session stats belong to the normal profile
    $('.side-scroll').innerHTML =
      '<div class="private-note">'
      + '<b>Private window</b>'
      + '<span>No account. No workspaces. No history.</span>'
      + '<span>Everything here is discarded when this window closes.</span>'
      + '</div>';
    return;
  }

  for (const p of PINNED) {
    $('#pinned').append(navItem(p.label, 'rows', () => obsidian.tab.open(p.url)));
  }

  const wsButtons = WORKSPACES.map((w, i) =>
    navItem(w, 'rows', () => {
      wsButtons.forEach(b => b.classList.remove('active'));
      wsButtons[i].classList.add('active');
    }, i === 0)
  );
  wsButtons.forEach(b => $('#workspaces').append(b));

  for (const a of ASSIST) {
    const action = a.label === 'History' ? () => obsidian.tab.openSettings() : () => {};
    $('#aside-nav').append(navItem(a.label, a.icon, action));
  }
}

// Stable per-host color so tabs without a favicon still read as distinct chips,
// the way the reference mock shows them.
const CHIP_COLORS = ['#6b7280', '#d97757', '#10a37f', '#2563eb', '#22c55e', '#a855f7', '#eab308'];

function chipColor(url) {
  let host = '';
  try { host = new URL(url).hostname; } catch { return CHIP_COLORS[0]; }
  let h = 0;
  for (const ch of host) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CHIP_COLORS[h % CHIP_COLORS.length];
}

let openedCount = 0;
const knownIds = new Set();

function renderTabs(state) {
  const host = $('#tabs');
  host.innerHTML = '';

  // Pinned tabs live first and keep their order; the rest follow.
  const ordered = [...state.tabs].sort((a, b) => Number(b.pinned) - Number(a.pinned));

  for (const t of ordered) {
    if (!knownIds.has(t.id)) { knownIds.add(t.id); openedCount++; }

    const el = document.createElement('div');
    el.className = 'tab'
      + (t.id === state.activeId ? ' active' : '')
      + (t.incognito ? ' private' : '')
      + (t.pinned ? ' pinned' : '');
    el.title = t.title || '';
    el.onclick = () => obsidian.tab.activate(t.id);
    el.oncontextmenu = e => { e.preventDefault(); obsidian.tab.contextMenu(t.id); };

    if (t.loading) {
      el.append(Object.assign(document.createElement('div'), { className: 'spinner' }));
    } else if (t.favicon) {
      const img = document.createElement('img');
      img.className = 'fav';
      img.src = t.favicon;
      img.onerror = () => { img.removeAttribute('src'); img.style.background = chipColor(t.url); };
      el.append(img);
    } else {
      const chip = document.createElement('div');
      chip.className = 'fav';
      chip.style.background = chipColor(t.url);
      el.append(chip);
    }

    // Pinned tabs are favicon-only; title + close are hidden via CSS but kept
    // in the DOM so unpinning needs no re-layout logic.
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = t.title || 'New Tab';
    el.append(title);

    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '×';
    close.onclick = e => { e.stopPropagation(); obsidian.tab.close(t.id); };
    el.append(close);

    host.append(el);
  }

  $('#nav-back').disabled = !state.canGoBack;
  $('#nav-forward').disabled = !state.canGoForward;
  const statTabs = $('#stat-tabs');
  if (statTabs) statTabs.textContent = openedCount; // absent in a private window
  $('#topbar').classList.toggle('private', !!state.incognito);

  // Don't fight the user while they're typing in the omnibox.
  const box = $('#omnibox');
  const active = state.tabs.find(t => t.id === state.activeId);
  if (active && document.activeElement !== box) {
    box.value = active.url.startsWith('file://') ? '' : active.url;
  }
}

// Windows convention: the maximize glyph becomes a "restore" pair of squares.
const MAX_GLYPH = '<rect x="0.5" y="0.5" width="9" height="9" />';
const RESTORE_GLYPH =
  '<rect x="0.5" y="2.5" width="7" height="7" /><path d="M2.5 2.5V0.5h7v7h-2" />';

function setMaximized(maximized) {
  const icon = $('#max-icon');
  icon.innerHTML = maximized ? RESTORE_GLYPH : MAX_GLYPH;
  $('#w-max').title = maximized ? 'Restore' : 'Maximize';
}

// --- wiring ----------------------------------------------------------------

const startedAt = Date.now();

// --- universal address bar -------------------------------------------------
// One input, three intents: a URL, a web search, or a question for the AI.

function looksLikeUrl(s) {
  if (/^[a-z]+:\/\//i.test(s)) return true;
  if (/^localhost(:\d+)?(\/|$)/i.test(s)) return true;
  return /^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$)/.test(s) && !/\s/.test(s);
}

const AI_VERBS = /^(summarize|explain|rewrite|translate|improve|generate|write|draft|fix|debug|how|why|what|when|where|who|should|can|is|are|do|does)\b/i;

function looksLikeQuestion(s) {
  return s.trim().endsWith('?') || (AI_VERBS.test(s.trim()) && s.trim().split(/\s+/).length >= 3);
}

function submitOmni(raw) {
  const s = raw.trim();
  if (!s) return;
  if (looksLikeUrl(s)) return obsidian.tab.navigate(s);
  if (looksLikeQuestion(s)) return obsidian.tab.open('https://claude.ai/new?q=' + encodeURIComponent(s));
  obsidian.tab.navigate(s); // main's toURL falls back to web search
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2600);
}

// --- command palette -------------------------------------------------------

const P_ICON = {
  link: '<path d="M10 13a5 5 0 0 0 7 0l1-1a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-1 1a5 5 0 0 0 7 7l1-1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  ghost: '<path d="M9 10h.01M15 10h.01M12 2a7 7 0 0 0-7 7v11l3-2 2 2 2-2 2 2 3-2V9a7 7 0 0 0-7-7z"/>',
  reload: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  code: '<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/>',
  down: '<path d="M12 4v12M7 12l5 5 5-5M5 20h14"/>',
  broom: '<path d="M4 20l6-6M14 4l6 6-8 3-1 6-4-4 6-1z"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  cam: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 7l1.5-3h5L16 7"/>',
  spark: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>'
};
const pIco = name =>
  `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${P_ICON[name]}</svg>`;

const palette = (() => {
  const root = $('#palette');
  const input = $('#palette-input');
  const list = $('#palette-list');

  const ACTIONS = [
    { g: 'Navigate', t: 'Open GitHub',   i: 'link', run: () => obsidian.tab.open('https://github.com') },
    { g: 'Navigate', t: 'Open Claude',   i: 'link', run: () => obsidian.tab.open('https://claude.ai') },
    { g: 'Navigate', t: 'Open ChatGPT',  i: 'link', run: () => obsidian.tab.open('https://chatgpt.com') },
    { g: 'Navigate', t: 'Open Localhost', s: ':3000', i: 'link', run: () => obsidian.tab.open('http://localhost:3000') },

    { g: 'Browser', t: 'New Tab',          k: 'Ctrl T',       i: 'plus',   run: () => obsidian.tab.open() },
    { g: 'Browser', t: 'New Private Tab',  k: 'Ctrl Shift N', i: 'ghost',  run: () => obsidian.tab.openPrivate() },
    { g: 'Browser', t: 'Reload Page',      k: 'Ctrl R',       i: 'reload', run: () => obsidian.tab.reload() },
    { g: 'Browser', t: 'Developer Tools',  i: 'code',  run: () => obsidian.tab.devtools() },
    { g: 'Browser', t: 'History',          k: 'Ctrl H', i: 'clock', run: () => obsidian.tab.openSettings() },
    { g: 'Browser', t: 'Downloads',        i: 'down',  run: () => obsidian.tab.openSettings() },
    { g: 'Browser', t: 'Settings',         k: 'Ctrl ,', i: 'gear', run: () => obsidian.tab.openSettings() },
    { g: 'Browser', t: 'Clear Cache',      i: 'broom', run: async () => { await obsidian.data.clear(['cachestorage']); toast('Cache cleared'); } },

    { g: 'Workspace', t: 'New Workspace',    i: 'grid', soon: true },
    { g: 'Workspace', t: 'Switch Workspace', i: 'grid', soon: true },
    { g: 'View', t: 'Split View', i: 'split', soon: true },
    { g: 'View', t: 'Screenshot', i: 'cam',   soon: true },

    { g: 'AI', t: 'Summarize Page',         i: 'spark', soon: true },
    { g: 'AI', t: 'Explain Code',           i: 'spark', soon: true },
    { g: 'AI', t: 'Translate Page',         i: 'spark', soon: true },
    { g: 'AI', t: 'Rewrite Professionally', i: 'spark', soon: true }
  ];

  let rows = [];       // flat selectable rows currently shown
  let sel = 0;

  function build(q) {
    const query = q.trim().toLowerCase();
    list.innerHTML = '';
    rows = [];

    // Dynamic Search / Ask-AI rows when there's a free-text query.
    const dynamic = [];
    if (query) {
      const ask = { t: `Ask AI: “${q.trim()}”`, i: 'spark', run: () => obsidian.tab.open('https://claude.ai/new?q=' + encodeURIComponent(q.trim())) };
      const search = { t: `Search the web for “${q.trim()}”`, i: 'link', run: () => submitOmni(q.trim()) };
      dynamic.push(looksLikeQuestion(q) ? ask : search, looksLikeQuestion(q) ? search : ask);
    }

    const matches = query
      ? ACTIONS.filter(a => (a.t + ' ' + a.g).toLowerCase().includes(query))
      : ACTIONS;

    if (dynamic.length) {
      addGroup('');
      dynamic.forEach(addRow);
    }

    if (!matches.length && !dynamic.length) {
      list.innerHTML = '<div class="palette-empty">No commands match.</div>';
      return;
    }

    let lastG = null;
    for (const a of matches) {
      if (a.g !== lastG) { lastG = a.g; addGroup(a.g); }
      addRow(a);
    }

    sel = 0;
    paint();
  }

  function addGroup(label) {
    if (!label) return;
    const el = document.createElement('div');
    el.className = 'palette-group';
    el.textContent = label;
    list.append(el);
  }

  function addRow(a) {
    const idx = rows.length;
    const el = document.createElement('div');
    el.className = 'palette-item';
    el.innerHTML =
      `<span class="p-ico">${pIco(a.i || 'link')}</span>` +
      `<span class="p-title">${a.t}</span>` +
      (a.s ? `<span class="p-sub">${a.s}</span>` : '') +
      (a.k ? `<span class="p-sub">${a.k}</span>` : '') +
      (a.soon ? `<span class="p-soon">SOON</span>` : '');
    el.onmousemove = () => { sel = idx; paint(); };
    el.onclick = () => exec(a);
    list.append(el);
    rows.push({ a, el });
  }

  function paint() {
    rows.forEach((r, i) => r.el.classList.toggle('sel', i === sel));
    rows[sel]?.el.scrollIntoView({ block: 'nearest' });
  }

  function exec(a) {
    if (a.soon) { toast(`${a.t} — coming soon`); return; }
    close();
    a.run();
  }

  function open() {
    root.hidden = false;
    input.value = '';
    build('');
    input.focus();
  }
  function close() {
    if (root.hidden) return;
    root.hidden = true;
    obsidian.paletteClosed(); // main restores the tab view
  }

  function wire() {
    input.oninput = () => build(input.value);
    input.onkeydown = e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, rows.length - 1); paint(); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); sel = Math.max(sel - 1, 0); paint(); }
      else if (e.key === 'Enter')     { e.preventDefault(); if (rows[sel]) exec(rows[sel].a); }
    };
    root.onmousedown = e => { if (e.target === root) close(); };
  }

  return { open, close, wire };
})();

function wire() {
  $('#w-close').onclick = () => obsidian.win.close();
  $('#w-min').onclick = () => obsidian.win.minimize();
  $('#w-max').onclick = () => obsidian.win.maximize();
  obsidian.win.onState(({ maximized }) => setMaximized(maximized));

  $('#nav-back').onclick = () => obsidian.tab.back();
  $('#nav-forward').onclick = () => obsidian.tab.forward();
  $('#nav-reload').onclick = () => obsidian.tab.reload();
  $('#new-tab').onclick = () => obsidian.tab.open();
  $('#private').onclick = () => obsidian.tab.openPrivate();
  $('#open-settings').onclick = () => obsidian.tab.openSettings();

  // These live in the profile / Today blocks, which a private window strips out.
  const settingsBtn = $('#settings');
  if (settingsBtn) settingsBtn.onclick = () => obsidian.tab.openSettings();

  const todayClose = $('#today-close');
  if (todayClose) todayClose.onclick = e => e.target.closest('.today').remove();

  const box = $('#omnibox');
  box.onkeydown = e => {
    if (e.key === 'Enter') { submitOmni(box.value); box.blur(); }
    if (e.key === 'Escape') box.blur();
  };
  obsidian.onFocusOmnibox(() => { box.focus(); box.select(); });

  palette.wire();
  obsidian.onPaletteOpen(() => palette.open());

  obsidian.tab.onState(renderTabs);

  obsidian.onToast(msg => toast(msg));

  setInterval(async () => {
    const { blocked } = await obsidian.adblock.stats();
    $('#shield-badge').hidden = blocked === 0;
    $('#shield').title = `${blocked.toLocaleString()} trackers blocked`;

    // The Today panel is absent in a private window.
    const statBlocked = $('#stat-blocked');
    if (statBlocked) statBlocked.textContent = blocked.toLocaleString();

    const statTime = $('#stat-time');
    if (statTime) {
      const mins = Math.floor((Date.now() - startedAt) / 60000);
      statTime.textContent = mins < 60 ? `${mins}m` : `${(mins / 60) | 0}h ${mins % 60}m`;
    }
  }, 1500);
}

// --- boot splash -----------------------------------------------------------
// The icon must land dead-center of the window, then glide left to its seat
// in the lockup. Its "centered" position is its final position shifted right
// by half of (wordmark + gap), so measure and feed that to the CSS.
function splash() {
  const el = $('#splash');
  const word = $('.splash-word-clip');
  const GAP = 22;

  const shift = (word.getBoundingClientRect().width + GAP) / 2;
  $('.splash-icon').style.setProperty('--center-shift', `${shift}px`);

  // icon lands (.7s) + glide/wipe (~1.7s) + hold -> fade at 2.2s
  setTimeout(() => {
    el.classList.add('done');
    obsidian.splashDone(); // main attaches the first tab underneath the fade
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 2200);
}

renderNav();
wire();
splash();

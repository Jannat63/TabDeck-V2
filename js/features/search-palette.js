'use strict';
// =============================================
//  TabDeck · First-run welcome, search box and the command palette
// =============================================

// ===== FIRST RUN =====
function openWelcome() {
  el('welcomeName').value = '';
  el('welcomeStarter').checked = true;
  openModal('welcomeModal');
}
function finishWelcome() {
  const name = el('welcomeName').value.trim().slice(0, 40);
  if (name) S.user.name = name;
  if (!el('welcomeStarter').checked) {   // start empty: one blank workspace, no example bookmarks
    S.workspaces = [{ id: 1, name: 'Home', icon: '🏠' }];
    S.wsData = { 1: { quickAccess: [], notes: [], tasks: [], importedBookmarks: [], folders: [] } };
    S.activeWsId = 1;
  }
  S.firstRun = false;
  normalizeLoadedState();
  updateAvatarDisplay(); updateGreeting();
  save();
  renderAll();
  closeModal('welcomeModal');
}

// Links to chrome:// pages, files etc. can't be opened by a normal link from an extension page, so ask Chrome to do it.
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href]');
  if (!a || e.defaultPrevented || e.button !== 0 || !IS_CHROME || !chrome.tabs) return;
  const href = a.getAttribute('href') || '';
  if (!/^(chrome|edge|about|file|chrome-extension):/i.test(href)) return;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey || a.target === '_blank') chrome.tabs.create({ url: href }); else chrome.tabs.update({ url: href });
});

// ===== SEARCH BOX =====
function setupSearch() {
  // Search trigger button opens command palette
  el('searchTriggerBtn').addEventListener('click', () => openCmdPalette());
}

// ===== COMMAND PALETTE =====
let _cmdActiveIdx = -1;

// ----- actions the palette can run (type "note", "theme", "settings"…) -----
const CMD_ACTIONS = [
  { id: 'new-note',     icon: '📝', label: 'New note',               kw: 'write create add',          run: () => openNoteNew() },
  { id: 'new-task',     icon: '✅', label: 'New task',               kw: 'todo create add',           run: () => openModal('taskModal') },
  { id: 'new-bookmark', icon: '🔖', label: 'Add a bookmark',         kw: 'save create',               run: () => openWsBookmarkEditModal(null, null, null) },
  { id: 'new-quick',    icon: '⚡', label: 'Add a Quick Access link', kw: 'tile shortcut create',      run: () => openQAEditModal(null) },
  { id: 'new-ws',       icon: '🗂️', label: 'New workspace',          kw: 'create group',              run: () => openNewWorkspaceModal() },
  { id: 'timer',        icon: '⏱️', label: 'Start or pause the focus timer', kw: 'pomodoro focus',    run: () => timerPlay() },
  { id: 'theme',        icon: '🌓', label: 'Switch light / dark',    kw: 'theme mode appearance dark light',           run: () => el('themeBtn').click() },
  { id: 'settings',     icon: '⚙️', label: 'Open settings',          kw: 'preferences options',       run: () => openSettings() },
  { id: 'go-home',      icon: '🏠', label: 'Go to Home',             kw: 'dashboard',                 run: () => navigateTo('home') },
  { id: 'go-bookmarks', icon: '🔖', label: 'Go to Bookmarks',        kw: 'page',                      run: () => navigateTo('bookmarks') },
  { id: 'go-notes',     icon: '📝', label: 'Go to Notes',            kw: 'page',                      run: () => navigateTo('notes') },
  { id: 'go-history',   icon: '🕐', label: 'Go to History',          kw: 'page browsing',             run: () => navigateTo('history') },
  { id: 'go-downloads', icon: '⬇️', label: 'Go to Downloads',        kw: 'page files',                run: () => navigateTo('downloads') },
  { id: 'go-trash',     icon: '🗑️', label: 'Go to Trash',            kw: 'page restore deleted',      run: () => navigateTo('trash') },
  { id: 'go-analytics', icon: '📊', label: 'Go to Analytics',        kw: 'page stats',                run: () => navigateTo('analytics') },
  { id: 'backup',       icon: '💾', label: 'Download a backup',      kw: 'export save data',          run: () => exportData() },
  { id: 'shortcuts',    icon: '⌨️', label: 'Keyboard shortcuts',     kw: 'help keys',                 run: () => openModal('shortcutsModal') },
];
const _cmdActions = () => [...CMD_ACTIONS, ...S.workspaces.filter(w => w.id !== S.activeWsId).map(w => ({ id: 'ws-' + w.id, icon: w.icon, label: 'Switch to ' + w.name, kw: 'workspace', run: () => setActiveWorkspace(w.id) }))];
const _cmdActionHtml = a => `<div class="cmd-result-item" role="option" data-cmd-item data-act="${escH(a.id)}"><div class="cmd-note-icon" aria-hidden="true">${escH(a.icon)}</div><div class="cmd-item-body"><div class="cmd-item-title">${escH(a.label)}</div></div></div>`;
let _cmdToken = 0;

function openCmdPalette(prefill) {
  if (typeof prefill !== 'string') prefill = '';   // click handlers pass the event object
  const overlay = el('cmdPaletteOverlay');
  const inp = el('cmdInput');
  overlay.classList.add('open');
  // Defer the GPU-heavy blur until after the opacity transition has settled
  setTimeout(() => { if (overlay.classList.contains('open')) overlay.classList.add('blur-on'); }, 200);
  inp.value = prefill;
  _cmdActiveIdx = -1;
  setTimeout(() => inp.focus(), 50);
  if (prefill.trim()) _renderCmdResults(prefill.trim());
  else el('cmdResults').innerHTML = _cmdEmptyState();
}

function closeCmdPalette() {
  const overlay = el('cmdPaletteOverlay');
  overlay.classList.remove('open');
  overlay.classList.remove('blur-on');
  el('cmdInput').value = '';
  el('cmdResults').innerHTML = '';
  _cmdActiveIdx = -1;
}

function _cmdEmptyState() {
  return '<div class="cmd-section-label">Suggested</div>' + _cmdActions().slice(0, 7).map(_cmdActionHtml).join('') +
    '<div class="cmd-hint">Type to search bookmarks, notes and history. Press Enter to search Google.</div>';
}

function _buildCmdResults(q) {
  const ql = q.toLowerCase();
  const has = (s) => (s || '').toLowerCase().includes(ql);
  const bmMatches = [], seen = new Set();
  const add = (bm, wsName) => { if (bmMatches.length < 8 && !seen.has(bm.url)) { seen.add(bm.url); bmMatches.push({ ...bm, _ws: wsName }); } };
  S.workspaces.forEach(ws => (S.wsData[ws.id]?.importedBookmarks || []).forEach(bm => { if (has(bm.title) || has(bm.url)) add(bm, ws.id === S.activeWsId ? '' : ws.name); }));
  for (const f of S.allBookmarks) for (const it of f.items) if (has(it.title) || has(it.url)) add(it, '');
  const noteMatches = [];
  S.workspaces.forEach(ws => (S.wsData[ws.id]?.notes || []).forEach(n => { if (has(n.title) || has(n.content)) noteMatches.push({ ...n, _wsId: ws.id, _ws: ws.id === S.activeWsId ? '' : ws.name }); }));
  return { bmMatches, noteMatches: noteMatches.slice(0, 4) };
}

function _renderCmdResults(q) {
  const token = ++_cmdToken;
  const ql = q.toLowerCase();
  const actions = _cmdActions().filter(a => (a.label + ' ' + (a.kw || '')).toLowerCase().includes(ql)).slice(0, 4);
  const { bmMatches, noteMatches } = _buildCmdResults(q);
  let html = '';
  if (actions.length) html += '<div class="cmd-section-label">Actions</div>' + actions.map(_cmdActionHtml).join('');
  if (bmMatches.length) {
    html += '<div class="cmd-section-label">Bookmarks</div>';
    html += bmMatches.map(bm => `
      <a href="${escH(bm.url)}" class="cmd-result-item" role="option" target="_self" data-cmd-item>
        <div class="cmd-favicon-wrap"><img loading="lazy" decoding="async" src="${favSrc(bm.url)}" data-fb="fade" alt=""></div>
        <div class="cmd-item-body"><div class="cmd-item-title">${escH(bm.title || bm.url)}</div></div>
        <div class="cmd-domain-tag">${escH(bm._ws ? bm._ws + ' · ' : '')}${escH(getDomain(bm.url))}</div>
      </a>`).join('');
  }
  if (noteMatches.length) {
    html += '<div class="cmd-section-label">Notes</div>';
    html += noteMatches.map(n => `
      <div class="cmd-result-item" role="option" data-cmd-item data-note-id="${n.id}" data-ws-id="${n._wsId}">
        <div class="cmd-note-icon" aria-hidden="true">📝</div>
        <div class="cmd-item-body">
          <div class="cmd-item-title">${escH(n.title || 'Untitled Note')}</div>
          <div class="cmd-item-sub">${escH((n.content || '').replace(/<[^>]+>/g, '').slice(0, 55))}${(n.content || '').length > 55 ? '…' : ''}</div>
        </div>
        ${n._ws ? `<div class="cmd-domain-tag">${escH(n._ws)}</div>` : ''}
      </div>`).join('');
  }
  if (!actions.length && !bmMatches.length && !noteMatches.length) {
    html += `<div class="cmd-empty"><div class="cmd-empty-icon" style="font-size:20px">∅</div>Nothing found for “<em style="color:var(--accent-light)">${escH(q)}</em>”</div>`;
  }
  html += '<div id="cmdHistoryBlock"></div>';   // filled in below once Chrome answers
  html += `<a href="https://www.google.com/search?q=${encodeURIComponent(q)}" class="cmd-google-item" role="option" target="_blank" rel="noopener" data-cmd-item>
    <div class="cmd-google-icon">G</div>
    <div class="cmd-google-label">Search Google for <em>“${escH(q)}”</em></div>
  </a>`;
  el('cmdResults').innerHTML = html;
  _cmdActiveIdx = -1;
  if (IS_CHROME && chrome.history) {
    chrome.history.search({ text: q, maxResults: 6, startTime: Date.now() - 90 * 86400000 }, items => {
      void chrome.runtime.lastError;
      const box = el('cmdHistoryBlock');
      if (token !== _cmdToken || !box) return;
      const known = new Set(bmMatches.map(b => b.url));
      const hist = (items || []).filter(h => h.url && !known.has(h.url)).slice(0, 4);
      if (!hist.length) return;
      el('cmdResults').querySelector('.cmd-empty')?.remove();
      box.innerHTML = '<div class="cmd-section-label">History</div>' + hist.map(h => `
        <a href="${escH(h.url)}" class="cmd-result-item" role="option" target="_self" data-cmd-item>
          <div class="cmd-favicon-wrap"><img loading="lazy" decoding="async" src="${favSrc(h.url)}" data-fb="fade" alt=""></div>
          <div class="cmd-item-body"><div class="cmd-item-title">${escH(h.title || h.url)}</div></div>
          <div class="cmd-domain-tag">${escH(getDomain(h.url))}</div>
        </a>`).join('');
    });
  }
}

function _cmdItems() {
  return Array.from(el('cmdResults').querySelectorAll('[data-cmd-item]'));
}

function _cmdSetActive(idx) {
  const items = _cmdItems();
  items.forEach(i => i.classList.remove('active'));
  if (idx >= 0 && idx < items.length) {
    items[idx].classList.add('active');
    items[idx].scrollIntoView({ block: 'nearest' });
  }
  _cmdActiveIdx = idx;
}

function _cmdInitKeyboard() {
  const inp = el('cmdInput');
  inp.addEventListener('input', debounce(e => {
    const q = e.target.value.trim();
    if (!q) { el('cmdResults').innerHTML = _cmdEmptyState(); _cmdActiveIdx = -1; _cmdToken++; return; }
    _renderCmdResults(q);
  }, 150));

  inp.addEventListener('keydown', e => {
    const items = _cmdItems();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _cmdSetActive(Math.min(_cmdActiveIdx + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _cmdSetActive(Math.max(_cmdActiveIdx - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const q = inp.value.trim();
      if (_cmdActiveIdx >= 0 && items[_cmdActiveIdx]) items[_cmdActiveIdx].click();
      else if (q) { window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank', 'noopener'); closeCmdPalette(); }
    } else if (e.key === 'Escape') {
      closeCmdPalette();
    }
  });

  // actions and notes
  el('cmdResults').addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    if (act) { const a = _cmdActions().find(x => x.id === act.dataset.act); closeCmdPalette(); if (a) a.run(); return; }
    const note = e.target.closest('[data-note-id]');
    if (note) { closeCmdPalette(); openNoteEdit(Number(note.dataset.noteId), Number(note.dataset.wsId)); return; }
    if (e.target.closest('a[data-cmd-item]')) setTimeout(closeCmdPalette, 0);
  });
  el('cmdPaletteOverlay').addEventListener('click', e => {
    if (e.target === el('cmdPaletteOverlay')) closeCmdPalette();
  });
}

function hideSearch() {} // kept for any legacy references

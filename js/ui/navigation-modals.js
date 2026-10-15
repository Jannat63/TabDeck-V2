'use strict';
// =============================================
//  TabDeck · Page navigation, the + button, dialogs, toasts
// =============================================

// ===== NAVIGATION =====
function navigateTo(view) {
  const current = document.querySelector('.view.active');
  const next = el(`view-${view}`);
  if (current && current !== next) {
    current.style.animation = 'wsContentOut .12s ease forwards';
    setTimeout(() => {
      current.style.animation = '';
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      if (next) {
        next.classList.add('active');
        next.style.animation = 'wsContentIn .2s cubic-bezier(.4,0,.2,1) both';
        setTimeout(() => { next.style.animation = ''; }, 220);
      }
      document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view===view));
      _navigateLoad(view);
    }, 120);
    return;
  }
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  next?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view===view));
  _navigateLoad(view);
}

function _navigateLoad(view) {
  if (view === 'bookmarks') {
    if (!S.allBookmarks.length) loadBookmarks();
    renderBmWorkspaceTabs();
    S.bmFolderFilter = null;
    setBmSource(S.bmSource);
  }
  if (view === 'history') loadHistory(el('historySearch').value || '');
  if (view === 'downloads') loadDownloads();
  if (view === 'trash') renderTrash();
  if (view === 'analytics') renderAnalytics();
}

function renderBmWorkspaceTabs() {
  const bar = el('bmWsTabs');
  if (!bar) return;
  bar.innerHTML = S.workspaces.map(ws => `
    <div class="bm-ws-tab ${ws.id===S.activeWsId?'active':''}" data-wsid="${ws.id}">
      <span>${escH(ws.icon)}</span>
      <span>${escH(ws.name)}</span>
    </div>`).join('');
  bar.querySelectorAll('.bm-ws-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      setActiveWorkspace(tab.dataset.wsid);
      S.bmFolderFilter = null;
      renderBmWorkspaceTabs();
      renderBmForActiveWorkspace();
    });
  });
}

function setBmSource(src) {
  S.bmSource = src === 'chrome' ? 'chrome' : 'workspace';
  S.bmFolderFilter = null;
  document.querySelectorAll('#bmSourceSeg [data-src]').forEach(b => {
    const on = b.dataset.src === S.bmSource;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const tabs = el('bmWsTabs'); if (tabs) tabs.style.display = S.bmSource === 'workspace' ? '' : 'none';
  if (S.bmSource === 'chrome' && !S.allBookmarks.length) loadBookmarks(); else renderBookmarksPage();
}
function renderBookmarksPage() {
  if (S.bmSource === 'chrome') renderAllBookmarks(S.allBookmarks);
  else renderBmForActiveWorkspace();
}

function renderBmForActiveWorkspace() {
  const list = el('allBookmarksList');
  const q = (el('bookmarkSearch')?.value || '').toLowerCase().trim();
  const tops = topLevelFolders();
  const bmIdx = buildBookmarksByFolderIndex(), chIdx = buildChildrenByParentIndex();
  const topName = id => (tops.find(f => f.id === id) || {}).name;
  let groups = [];
  tops.forEach(f => {
    groups.push({ key: f.id, top: f.id, label: f.name, bms: bmIdx.get(f.id) || [] });
    (chIdx.get(f.id) || []).forEach(c => groups.push({ key: c.id, top: f.id, label: `${f.name} › ${c.name}`, bms: bmIdx.get(c.id) || [] }));
  });
  groups = groups.filter(g => g.bms.length);
  renderBmToolbar([...new Set(groups.map(g => topName(g.top)))]);
  if (!groups.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔖</div><div class="empty-state-text">No bookmarks in this workspace yet</div>
      <div class="empty-state-sub">Add one here, or import the ones you already have in Chrome from Settings.</div>
      <button type="button" class="btn-primary empty-state-cta" id="bmEmptyAdd">Add a bookmark</button></div>`;
    el('bmEmptyAdd').addEventListener('click', () => openWsBookmarkEditModal(null, null, null));
    return;
  }
  if (S.bmFolderFilter) groups = groups.filter(g => topName(g.top) === S.bmFolderFilter);
  if (q) groups = groups.map(g => ({ ...g, bms: g.bms.filter(b => (b.title || '').toLowerCase().includes(q) || (b.url || '').toLowerCase().includes(q) || g.label.toLowerCase().includes(q)) })).filter(g => g.bms.length);
  const cmp = { az: (a, b) => (a.title || '').localeCompare(b.title || ''), za: (a, b) => (b.title || '').localeCompare(a.title || ''),
    newest: (a, b) => (b.date || 0) - (a.date || 0), oldest: (a, b) => (a.date || 0) - (b.date || 0) }[S.bmSort];
  if (cmp) groups = groups.map(g => ({ ...g, bms: [...g.bms].sort(cmp) }));
  if (!groups.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">No bookmarks match your search</div></div>';
    return;
  }
  const editIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const delIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;
  const openAll = !!(S.bmFolderFilter || q);
  list.innerHTML = groups.map(g => `
    <div class="bm-folder${openAll ? ' open' : ''}">
      <div class="bm-folder-header bm-ws-folder-header" role="button" tabindex="0" aria-expanded="${openAll}">
        <span class="bm-folder-chevron" aria-hidden="true">▶</span>
        <div class="bm-folder-icon-wrap" aria-hidden="true">📁</div>
        <span class="bm-folder-name">${escH(g.label)}</span>
        <span class="bm-folder-count">${g.bms.length}</span>
      </div>
      <div class="bm-items">
        <div class="bm-items-inner">
          ${g.bms.map(bm => `
            <div class="bm-item-row">
              <a href="${escH(bm.url)}" class="bm-item" target="_self">
                <div class="bm-favicon-wrap"><img loading="lazy" decoding="async" src="${favSrc(bm.url)}" data-fb="hide" alt=""></div>
                <div class="bm-item-text">
                  <span class="bm-item-title">${escH(bm.title || bm.url)}</span>
                  <span class="bm-item-url">${escH(getDomain(bm.url))}</span>
                </div>
              </a>
              <button class="bm-action-btn ws-bm-edit" data-bmid="${escH(bm.id)}" data-tip="Edit" aria-label="Edit ${escH(bm.title || bm.url)}">${editIcon}</button>
              <button class="bm-action-btn bm-del-btn ws-bm-remove" data-bmid="${escH(bm.id)}" data-tip="Move to Trash" aria-label="Move ${escH(bm.title || bm.url)} to Trash">${delIcon}</button>
            </div>`).join('')}
        </div>
      </div>
    </div>`).join('');
  list.querySelectorAll('.bm-ws-folder-header').forEach(h => {
    h.addEventListener('click', () => { const box = h.closest('.bm-folder'); box.classList.toggle('open'); h.setAttribute('aria-expanded', box.classList.contains('open')); });
  });
  list.querySelectorAll('.ws-bm-edit').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const bm = wsBookmarks().find(b => b.id === btn.dataset.bmid);
      if (bm) openWsBookmarkEditModal(bm.folderName, bm.id, bm.folderId);
    });
  });
  list.querySelectorAll('.ws-bm-remove').forEach(btn => {
    btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); removeWsBm(btn.dataset.bmid); renderBmForActiveWorkspace(); });
  });
}

// ===== FAB =====
function toggleFab() {
  el('fabBtn').classList.toggle('open');
  el('fabMenu').classList.toggle('open');
}
function closeFab() {
  el('fabBtn').classList.remove('open');
  el('fabMenu').classList.remove('open');
}

// ===== MODALS =====
let _modalOpener = new Map();   // modal id -> element that had focus before it opened (focus goes back on close)
function openModal(id) {
  const m = el(id);
  if (!m) return;
  if (!m.classList.contains('open')) _modalOpener.set(id, document.activeElement);
  m.classList.add('open');
  setTimeout(() => {   // put the cursor in the first field so people can just start typing
    if (!m.classList.contains('open') || m.contains(document.activeElement) && document.activeElement !== m) return;
    const target = m.querySelector('[data-autofocus]') || m.querySelector('input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=color]), textarea');
    if (target && target.offsetParent !== null) target.focus({ preventScroll: true });
  }, 50);
}
function closeModal(id) {
  const m = el(id);
  if (!m || !m.classList.contains('open')) return;
  if (id === 'noteModal' && typeof autosaveNote === 'function') autosaveNote();   // never lose typed text
  m.classList.remove('open');
  if (id === 'quickAccessModal') _qaEditId = null;
  if (id === 'noteModal') S.editingNoteId = null;
  if (id === 'confirmModal' && _confirmCancel) { const f = _confirmCancel; _confirmCancel = null; f(); }
  const back = _modalOpener.get(id);
  _modalOpener.delete(id);
  if (back && back !== document.body && document.contains(back) && back.focus) back.focus({ preventScroll: true });
}
function closeAllModals() { document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id)); _closeCsel(); closeCtxMenu(); }

// Confirm helper
let _confirmCancel = null;
function confirm2(title, msg, onOk, onCancel, opts = {}) {
  el('confirmTitle').textContent = title;
  el('confirmMessage').textContent = msg;
  const ok = el('confirmOkBtn');
  ok.textContent = opts.okLabel || 'Delete';
  ok.classList.toggle('btn-danger', opts.danger !== false);
  _confirmCancel = onCancel || null;                       // runs for Cancel, ✕, Esc and clicking outside
  ok.onclick = () => { _confirmCancel = null; closeModal('confirmModal'); onOk(); };
  openModal('confirmModal');
}

// ===== TOAST =====
let toastTO;
function showToast(msg, type = '', opts = {}) {
  let t = document.getElementById('_toast');
  if (!t) { t = document.createElement('div'); t.id = '_toast'; document.body.appendChild(t); }
  t.className = `toast ${type}`;
  t.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const icons = { success:'✓', error:'✕', info:'ℹ', warning:'⚠' };
  const icon = icons[type] || '';
  t.innerHTML = (icon ? `<span class="toast-icon" aria-hidden="true">${icon}</span>` : '') + `<span class="toast-msg">${escH(msg)}</span>` +
    (opts.action ? `<button type="button" class="toast-action">${escH(opts.action)}</button>` : '');
  t.querySelector('.toast-action')?.addEventListener('click', () => { clearTimeout(toastTO); t.classList.remove('show'); if (opts.onAction) opts.onAction(); });
  clearTimeout(toastTO);
  requestAnimationFrame(() => t.classList.add('show'));
  toastTO = setTimeout(() => t.classList.remove('show'), opts.duration || (opts.action ? 7000 : 3200));
}

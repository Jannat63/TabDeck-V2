'use strict';
// =============================================
//  TabDeck · Quick Access tiles
// =============================================

// ===== QUICK ACCESS =====
function renderQuickAccess() {
  const grid = el('quickAccessGrid');
  const items = wsQA();
  grid.innerHTML = items.map(item => `
    <a href="${escH(item.url)}" class="qa-item" data-qaid="${item.id}" draggable="true">
      <span class="qa-menu-btn" role="button" tabindex="0" data-qaid="${item.id}" data-tip="Options" aria-label="Options for ${escH(item.name)}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
      </span>
      <img class="qa-item-favicon" loading="lazy" decoding="async" src="${favSrc(item.url)}" data-fb="hide" alt="${escH(item.name)}">
      <span class="qa-item-name">${escH(item.name)}</span>
    </a>`).join('') + `
  <button class="qa-add-btn" id="_qaAddBtn">
    <div class="qa-add-icon">+</div>
    <span style="font-size:11px;color:var(--text-muted)">Add</span>
  </button>`;
  grid.querySelectorAll('.qa-menu-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const item = items.find(q => String(q.id) === btn.dataset.qaid);
      if (item) openQACtxMenu(btn, item);
    });
  });
  initDragReorder(grid, '.qa-item', () => {
    const newOrder = [...grid.querySelectorAll('.qa-item')].map(el => Number(el.dataset.qaid));
    wsData().quickAccess = newOrder.map(id => items.find(q => q.id === id)).filter(Boolean);
    save();
  });
  grid.querySelector('#_qaAddBtn')?.addEventListener('click', () => openQAEditModal(null));
}



const QA_MAX = 8;

function addQA(name, url) {
  const data = wsData();
  const item = { id: nid(), name, url };
  if (data.quickAccess.length >= QA_MAX) { openQAReplaceModal(item); return; }
  data.quickAccess.push(item);
  save();
  renderQuickAccess();
  showToast('Quick Access link added', 'success');
}

function openQAReplaceModal(newItem) {
  const current = wsData().quickAccess;
  el('qaReplaceNewName').textContent = newItem.name;
  const list = el('qaReplaceList');
  list.innerHTML = current.map(q => `
    <button class="qa-replace-row" data-qaid="${q.id}">
      <img loading="lazy" decoding="async" src="${favSrc(q.url)}" width="16" height="16" style="border-radius:3px;flex-shrink:0" data-fb="hide">
      <span class="qa-replace-name">${escH(q.name)}</span>
      <span class="qa-replace-url">${escH(getDomain(q.url))}</span>
      <span class="qa-replace-tag">Replace</span>
    </button>`).join('');
  list.querySelectorAll('.qa-replace-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = wsData();
      const idx = d.quickAccess.findIndex(q => String(q.id) === btn.dataset.qaid);
      if (idx !== -1) d.quickAccess[idx] = newItem;
      save(); renderQuickAccess();
      closeModal('qaReplaceModal');
      showToast(`Replaced with "${newItem.name}"`, 'success');
    });
  });
  openModal('qaReplaceModal');
}

function openQAEditModal(item) {
  _qaEditId = item ? item.id : null;
  const modal = el('quickAccessModal');
  modal.querySelector('h3').textContent = item ? 'Edit Quick Access' : 'Add Quick Access';
  el('qaName').value = item ? item.name : '';
  el('qaUrl').value = item ? item.url : '';
  el('saveQuickAccessBtn').textContent = item ? 'Save' : 'Add';
  openModal('quickAccessModal');
}

function openQACtxMenu(btn, item) {
  const menu = _getOrCreateCtxMenu();
  const rect = btn.getBoundingClientRect();
  menu.style.top  = (rect.bottom + 4) + 'px';
  menu.style.left = Math.min(rect.left, window.innerWidth - 180) + 'px';
  menu.innerHTML = `
    <div class="bm-ctx-item" data-action="edit">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      Edit
    </div>
    <div class="bm-ctx-sep"></div>
    <div class="bm-ctx-item danger" data-action="delete">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
      Delete
    </div>`;
  menu.querySelector('[data-action="edit"]').addEventListener('click', () => {
    closeCtxMenu(); openQAEditModal(item);
  });
  menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
    closeCtxMenu();
    const data = wsData();
    const found = data.quickAccess.find(q => q.id === item.id);
    if (!found) return;
    const trashed = trashAdd('quickAccess', { ...found });
    data.quickAccess = data.quickAccess.filter(q => q.id !== item.id);
    save(); renderQuickAccess(); renderTrash();
    undoToast('Removed from Quick Access', trashed);
  });
  menu.classList.add('open');
  _ctxSub.classList.remove('open');
}

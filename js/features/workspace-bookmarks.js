'use strict';
// =============================================
//  TabDeck · Workspace bookmarks and folders, context menus, drag and drop
// =============================================

// ===== WORKSPACE BOOKMARKS =====
// Cached grid dimensions — invalidated by ResizeObserver only when the grid
// actually changes width. Saves a forced reflow on every render.
const _wsBmGridCache = { width: null, cardHeight: null };
let _wsBmGridResizeObs = null;

// Returns total descendant bookmark count for a folder (own + subfolders').
function folderTotalBookmarkCount(folderId) {
  const own = bookmarksInFolder(folderId).length;
  const sub = childFolders(folderId).reduce((n, c) => n + bookmarksInFolder(c.id).length, 0);
  return own + sub;
}

function renderWorkspaceBookmarks() {
  const section = el('wsBmSection');
  if (!section) return;
  if (!IS_CHROME) { section.style.display = 'none'; return; }
  section.style.display = '';
  const grid = el('wsBmGrid');
  // Build indices once (O(n)); avoids quadratic per-folder scans introduced by nesting.
  const bmIdx = buildBookmarksByFolderIndex();
  const chIdx = buildChildrenByParentIndex();
  const totalForFolder = (id) => {
    const own = (bmIdx.get(id) || []).length;
    const subs = chIdx.get(id) || [];
    let sub = 0;
    for (let i = 0; i < subs.length; i++) sub += (bmIdx.get(subs[i].id) || []).length;
    return own + sub;
  };
  const tops = (chIdx.get(null) || []).filter(f => totalForFolder(f.id) > 0);
  if (!tops.length) {
    grid.innerHTML = `<button class="qa-add-btn ws-bm-add-card" id="_wsBmAddCard">
      <div class="qa-add-icon">+</div>
      <span style="font-size:11px;color:var(--text-muted)">Add</span>
    </button>`;
    grid.querySelector('#_wsBmAddCard')?.addEventListener('click', openWsBmChooser);
    return;
  }
  const colors = ['#e11d48','#7c3aed','#059669','#f59e0b','#3b82f6','#ec4899','#0891b2','#d97706'];
  grid.innerHTML = tops.map((folder, i) => {
    // Aggregate own + subfolder bookmarks for the preview favicons + count
    const own = bmIdx.get(folder.id) || [];
    const subs = chIdx.get(folder.id) || [];
    const subBms = [];
    for (let s = 0; s < subs.length; s++) subBms.push(...(bmIdx.get(subs[s].id) || []));
    const allBms = own.concat(subBms);
    const color = colors[i % colors.length];
    const prev = allBms.slice(0, 4);
    const extra = allBms.length - prev.length;
    const favs = prev.map(bm => `<img class="favicon-img" loading="lazy" decoding="async" src="${favSrc(bm.url)}" data-fb="hide" alt="">`).join('');
    const subBadge = subs.length ? `<span class="folder-card-sub-badge" data-tip="${subs.length} subfolder${subs.length!==1?'s':''}">📁 ${subs.length}</span>` : '';
    return `
      <div class="folder-card ws-bm-folder-card" data-fid="${escH(folder.id)}" data-folder="${escH(folder.name)}" draggable="true">
        <button class="ws-folder-menu-btn" data-fid="${escH(folder.id)}" data-tip="Options">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
        </button>
        <div class="folder-card-top">
          <div class="folder-card-icon" style="background:${color}22">
            <span style="font-size:16px">📁</span>
          </div>
          <div class="folder-card-text">
            <div class="folder-card-name">${escH(folder.name)}</div>
            <div class="folder-card-count">${allBms.length} bookmark${allBms.length !== 1 ? 's' : ''}${subBadge}</div>
          </div>
        </div>
        <div class="folder-favicons">
          ${favs}
          ${extra > 0 ? `<div class="favicon-more">+${extra}</div>` : ''}
        </div>
      </div>`;
  }).join('') + `<button class="qa-add-btn ws-bm-add-card" id="_wsBmAddCard">
    <div class="qa-add-icon">+</div>
    <span style="font-size:11px;color:var(--text-muted)">Add</span>
  </button>`;
  // Single delegated click handler — bound once. Skips re-binding 40+ listeners per render.
  if (!grid.dataset.delegated) {
    grid.dataset.delegated = '1';
    grid.addEventListener('click', e => {
      const addBtn = e.target.closest('#_wsBmAddCard');
      if (addBtn) { openWsBmChooser(); return; }
      const menuBtn = e.target.closest('.ws-folder-menu-btn');
      if (menuBtn) {
        e.stopPropagation();
        const f = getFolderById(menuBtn.dataset.fid);
        if (!f) return;
        openFolderCardCtxMenu(menuBtn, f.name, bookmarksInFolder(f.id), f.id);
        return;
      }
      const card = e.target.closest('.ws-bm-folder-card');
      if (card) openWsBmFolderModal(card.dataset.fid);
    });
  }

  // Bookmark-drag-onto-folder (drop-to-move + spring-open after dwell)
  attachBookmarkDropTargets(grid, '.ws-bm-folder-card');

  initDragReorder(grid, '.ws-bm-folder-card', () => {
    const newIds = [...grid.querySelectorAll('.ws-bm-folder-card')].map(el => el.dataset.fid);
    const d = wsData();
    // Reorder only top-level entries; keep subfolders in place after their parents
    const subs = (d.folders || []).filter(f => f.parentId != null);
    const topMap = new Map((d.folders || []).filter(f => f.parentId == null).map(f => [f.id, f]));
    const orderedTops = newIds.map(id => topMap.get(id)).filter(Boolean);
    d.folders = [...orderedTops, ...subs];
    save();
  });

  // Collapse to 2 rows if there are many folders
  let viewMoreBtn = el('_wsBmViewMore');
  if (viewMoreBtn) viewMoreBtn.remove();

  // Calculate how many items fit in 2 rows. ResizeObserver invalidates the cache
  // only when the grid width actually changes — so most renders skip the layout read.
  const colWidth = 200 + 12; // minmax + gap
  if (_wsBmGridCache.width == null) {
    _wsBmGridCache.width = grid.offsetWidth || section.offsetWidth || (window.innerWidth - 260);
  }
  if (!_wsBmGridResizeObs && typeof ResizeObserver !== 'undefined') {
    _wsBmGridResizeObs = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width);
        if (w !== _wsBmGridCache.width) {
          _wsBmGridCache.width = w;
          _wsBmGridCache.cardHeight = null; // re-measure on next render
        }
      }
    });
    _wsBmGridResizeObs.observe(grid);
  }
  const cols = Math.max(2, Math.floor((_wsBmGridCache.width + 12) / colWidth));
  const twoRowsMax = cols * 2;
  const totalCards = tops.length + 1; // +1 for Add card

  const addCard = grid.querySelector('#_wsBmAddCard');

  function placeAddCardCollapsed() {
    if (!addCard) return;
    const allCards = [...grid.querySelectorAll('.folder-card')];
    // Insert add card at slot twoRowsMax-1 (last slot of 2nd row)
    const insertBefore = allCards[twoRowsMax - 1];
    if (insertBefore) grid.insertBefore(addCard, insertBefore);
  }

  function placeAddCardExpanded() {
    if (addCard) grid.appendChild(addCard);
  }

  if (totalCards > twoRowsMax) {
    // Place add card at last slot of 2nd row, hiding one extra folder card
    placeAddCardCollapsed();
    // Measure card height once, then reuse — only re-measures when ResizeObserver invalidates.
    if (_wsBmGridCache.cardHeight) {
      grid.style.maxHeight = (_wsBmGridCache.cardHeight * 2 + 12 + 8) + 'px';
    } else {
      requestAnimationFrame(() => {
        const firstCard = grid.querySelector('.folder-card');
        if (firstCard) {
          const cardH = firstCard.offsetHeight;
          _wsBmGridCache.cardHeight = cardH;
          grid.style.maxHeight = (cardH * 2 + 12 + 8) + 'px';
        }
      });
    }
    grid.classList.add('ws-bm-grid-collapsed');
    viewMoreBtn = document.createElement('button');
    viewMoreBtn.id = '_wsBmViewMore';
    viewMoreBtn.className = 'ws-bm-view-more-btn';
    // hidden = all folders not visible + the one displaced by add card
    const hiddenCount = tops.length - (twoRowsMax - 1);
    viewMoreBtn.innerHTML = `View ${hiddenCount} more <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6,9 12,15 18,9"/></svg>`;
    viewMoreBtn.addEventListener('click', () => {
      const collapsed = grid.classList.toggle('ws-bm-grid-collapsed');
      if (collapsed) {
        placeAddCardCollapsed();
        const cardH = _wsBmGridCache.cardHeight || (grid.querySelector('.folder-card')?.offsetHeight || 100);
        _wsBmGridCache.cardHeight = cardH;
        grid.style.maxHeight = (cardH * 2 + 12 + 8) + 'px';
      } else {
        placeAddCardExpanded();
        // scrollHeight returns full content height even while max-height is constraining it
        grid.style.maxHeight = grid.scrollHeight + 'px';
      }
      viewMoreBtn.innerHTML = collapsed
        ? `View ${hiddenCount} more <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6,9 12,15 18,9"/></svg>`
        : `Show less <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18,15 12,9 6,15"/></svg>`;
    });
    section.appendChild(viewMoreBtn);
  } else {
    grid.classList.remove('ws-bm-grid-collapsed');
  }
}

// ===== BOOKMARK CONTEXT MENU =====
let _ctxMenu = null;
let _ctxSub  = null;
let _ctxCurrentFolder = null;

function _getOrCreateCtxMenu() {
  if (!_ctxMenu) {
    _ctxMenu = document.createElement('div');
    _ctxMenu.className = 'bm-ctx-menu';
    document.body.appendChild(_ctxMenu);
    _ctxSub = document.createElement('div');
    _ctxSub.className = 'bm-ctx-sub';
    document.body.appendChild(_ctxSub);
    document.addEventListener('click', e => {
      if (!_ctxMenu.contains(e.target) && !_ctxSub.contains(e.target)) closeCtxMenu();
    });
  }
  return _ctxMenu;
}

function closeCtxMenu() {
  _ctxMenu?.classList.remove('open');
  _ctxSub?.classList.remove('open');
}

// ----- moving bookmarks / folders to another workspace (re-creates folder ids so nothing gets orphaned) -----
function moveFolderToWorkspace(folderId, targetWsId) {
  const src = wsData();
  const root = (src.folders || []).find(f => f.id === folderId);
  if (!root) return null;
  const tgt = S.wsData[targetWsId] || (S.wsData[targetWsId] = DEFAULT_WS_DATA(targetWsId));
  ['importedBookmarks', 'folders'].forEach(k => { if (!Array.isArray(tgt[k])) tgt[k] = []; });
  const family = [root, ...src.folders.filter(f => f.parentId === root.id)];
  const idMap = new Map(family.map(f => [f.id, _newFolderId()]));
  const taken = new Set(tgt.folders.filter(f => f.parentId == null).map(f => f.name));
  const name = taken.has(root.name) ? `${root.name} (moved)` : root.name;
  family.forEach(f => tgt.folders.push({ ...f, id: idMap.get(f.id), name: f.id === root.id ? name : f.name, parentId: f.id === root.id ? null : idMap.get(f.parentId) }));
  const nameOf = id => (id === root.id ? name : (family.find(f => f.id === id) || {}).name);
  const moved = src.importedBookmarks.filter(b => idMap.has(b.folderId));
  moved.forEach(b => tgt.importedBookmarks.push({ ...b, folderId: idMap.get(b.folderId), folderName: nameOf(b.folderId) }));
  src.importedBookmarks = src.importedBookmarks.filter(b => !idMap.has(b.folderId));
  src.folders = src.folders.filter(f => !idMap.has(f.id));
  return { name, count: moved.length };
}
function moveBookmarkToWorkspace(bmId, targetWsId, targetFolderId) {
  const src = wsData();
  const bm = (src.importedBookmarks || []).find(b => b.id === bmId);
  if (!bm) return null;
  const tgt = S.wsData[targetWsId] || (S.wsData[targetWsId] = DEFAULT_WS_DATA(targetWsId));
  ['importedBookmarks', 'folders'].forEach(k => { if (!Array.isArray(tgt[k])) tgt[k] = []; });
  const folder = (targetFolderId && tgt.folders.find(f => f.id === targetFolderId)) || _ensureFolderByName(tgt, 'Unsorted');
  src.importedBookmarks = src.importedBookmarks.filter(b => b.id !== bmId);
  tgt.importedBookmarks.push({ ...bm, folderId: folder.id, folderName: folder.name });
  return folder;
}

function openFolderCardCtxMenu(btn, folderName, items, folderId) {
  const menu = _getOrCreateCtxMenu();
  const rect = btn.getBoundingClientRect();
  menu.style.top  = (rect.bottom + 4) + 'px';
  menu.style.left = Math.min(rect.left, window.innerWidth - 210) + 'px';
  const otherWorkspaces = S.workspaces.filter(w => w.id !== S.activeWsId);
  menu.innerHTML = `
    <div class="bm-ctx-item" data-action="add">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Bookmark
    </div>
    <div class="bm-ctx-item" data-action="rename">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      Rename
    </div>
    ${otherWorkspaces.length ? `<div class="bm-ctx-item" data-action="move-ws">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
      Move folder to workspace
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:auto"><polyline points="9,6 15,12 9,18"/></svg>
    </div>` : ''}
    <div class="bm-ctx-sep"></div>
    <div class="bm-ctx-item danger" data-action="delete">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
      Delete folder
    </div>`;
  menu.querySelector('[data-action="add"]').addEventListener('click', () => {
    closeCtxMenu(); openWsBookmarkEditModal(folderName, null, folderId);
  });
  menu.querySelector('[data-action="rename"]').addEventListener('click', () => {
    closeCtxMenu(); openWsFolderEditModal(folderId || folderName);
  });
  menu.querySelector('[data-action="move-ws"]')?.addEventListener('click', e => {
    e.stopPropagation();
    const itemRect = e.currentTarget.getBoundingClientRect();
    _ctxSub.innerHTML = otherWorkspaces.map((ws, i) =>
      `${i > 0 ? '<div class="bm-ctx-sep"></div>' : ''}
      <div class="bm-ctx-ws-header bm-ctx-ws-direct" data-wsid="${ws.id}" style="cursor:pointer">
        <span class="bm-ctx-ws-icon">${escH(ws.icon)}</span>
        <span style="flex:1">${escH(ws.name)}</span>
      </div>`
    ).join('');
    _ctxSub.classList.add('open');
    requestAnimationFrame(() => {
      const subW = _ctxSub.offsetWidth, subH = _ctxSub.offsetHeight;
      const spaceRight = window.innerWidth - itemRect.right - 8;
      const left = spaceRight >= subW ? itemRect.right + 4 : itemRect.left - subW - 4;
      _ctxSub.style.left = Math.max(4, left) + 'px';
      _ctxSub.style.top  = Math.min(itemRect.top, window.innerHeight - subH - 8) + 'px';
    });
    _ctxSub.querySelectorAll('.bm-ctx-ws-direct').forEach(opt => {
      opt.addEventListener('click', async () => {
        const targetId = Number(opt.dataset.wsid);
        const fid = folderId || (wsFolders().find(f => f.parentId == null && f.name === folderName) || {}).id;
        const res = moveFolderToWorkspace(fid, targetId);
        await save();
        closeCtxMenu();
        renderWorkspaceBookmarks(); renderSidebarFolders();
        const ws = S.workspaces.find(w => w.id === targetId);
        if (res) showToast(`Folder “${res.name}” moved to ${ws?.name || 'workspace'}`, 'success');
      });
    });
  });
  menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
    closeCtxMenu();
    const count = items.length;
    confirm2(
      `Delete "${folderName}"?`,
      count ? `This will also delete ${count} bookmark${count !== 1 ? 's' : ''} inside.` : 'The folder is empty.',
      () => folderId ? removeWsFolderById(folderId) : removeWsFolder(folderName)
    );
  });
  menu.classList.add('open');
  _ctxSub.classList.remove('open');
}

function openBmCtxMenu(btn, bm, currentFolder) {
  const menu = _getOrCreateCtxMenu();
  _ctxCurrentFolder = currentFolder;

  // Position below/above the button
  const rect = btn.getBoundingClientRect();
  menu.style.top  = (rect.bottom + 4) + 'px';
  menu.style.left = Math.min(rect.left, window.innerWidth - 210) + 'px';

  const otherFoldersIndented = allWsFoldersIndented().filter(f => f.label !== currentFolder || f.depth > 0);
  const otherWorkspaces = S.workspaces.filter(w => w.id !== S.activeWsId);
  const isPinned = wsQA().some(q => q.url === bm.url);

  menu.innerHTML = `
    <div class="bm-ctx-item" data-action="edit">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      Edit
    </div>
    <div class="bm-ctx-item" data-action="pin">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      ${isPinned ? 'Unpin from Quick Access' : 'Pin to Quick Access'}
    </div>
    ${otherFoldersIndented.length ? `<div class="bm-ctx-item" data-action="move-folder">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
      Move to folder
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:auto"><polyline points="9,6 15,12 9,18"/></svg>
    </div>` : ''}
    ${otherWorkspaces.length ? `<div class="bm-ctx-item" data-action="move-ws">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
      Move to workspace
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:auto"><polyline points="9,6 15,12 9,18"/></svg>
    </div>` : ''}
    <div class="bm-ctx-sep"></div>
    <div class="bm-ctx-item danger" data-action="delete">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
      Delete
    </div>`;

  menu.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
    closeCtxMenu(); closeModal('folderModal');
    openWsBookmarkEditModal(currentFolder, bm.id);
  });

  menu.querySelector('[data-action="pin"]')?.addEventListener('click', () => {
    closeCtxMenu();
    if (isPinned) {
      const d = wsData();
      d.quickAccess = d.quickAccess.filter(q => q.url !== bm.url);
      save(); renderQuickAccess();
      showToast('Unpinned from Quick Access', 'success');
    } else {
      addQA(bm.title || getDomain(bm.url), bm.url);
    }
  });

  menu.querySelector('[data-action="move-folder"]')?.addEventListener('click', e => {
    e.stopPropagation();
    const itemRect = e.currentTarget.getBoundingClientRect();
    _ctxSub.innerHTML = otherFoldersIndented.map(f => {
      const indent = f.depth ? '<span class="csel-indent">↳</span> ' : '';
      return `<div class="bm-ctx-sub-item" data-fid="${escH(f.id)}">${indent}📁 ${escH(f.label)}</div>`;
    }).join('');
    _ctxSub.classList.add('open');
    requestAnimationFrame(() => {
      const subW = _ctxSub.offsetWidth, subH = _ctxSub.offsetHeight;
      const spaceRight = window.innerWidth - itemRect.right - 8;
      const left = spaceRight >= subW ? itemRect.right + 4 : itemRect.left - subW - 4;
      _ctxSub.style.left = Math.max(4, left) + 'px';
      _ctxSub.style.top  = Math.min(itemRect.top, window.innerHeight - subH - 8) + 'px';
    });
    _ctxSub.querySelectorAll('.bm-ctx-sub-item').forEach(opt => {
      opt.addEventListener('click', async () => {
        const d = wsData();
        const tgt = (d.folders || []).find(f => f.id === opt.dataset.fid);
        if (!tgt) return;
        d.importedBookmarks = (d.importedBookmarks || []).map(b =>
          b.id === bm.id ? { ...b, folderId: tgt.id, folderName: tgt.name } : b
        );
        await save();
        closeCtxMenu(); closeModal('folderModal');
        renderWorkspaceBookmarks(); renderSidebarFolders();
        showToast(`Moved to "${tgt.name}"`, 'success');
      });
    });
  });

  menu.querySelector('[data-action="move-ws"]')?.addEventListener('click', e => {
    e.stopPropagation();
    const itemRect = e.currentTarget.getBoundingClientRect();
    _ctxSub.innerHTML = otherWorkspaces.map((ws, i) => {
      const tgtFolders = S.wsData[ws.id]?.folders || [];
      const ordered = [];
      tgtFolders.filter(f => f.parentId == null).forEach(f => { ordered.push({ f, depth: 0 }); tgtFolders.filter(c => c.parentId === f.id).forEach(c => ordered.push({ f: c, depth: 1 })); });
      const folderItems = ordered.map(({ f, depth }) =>
        `<div class="bm-ctx-ws-folder" data-wsid="${ws.id}" data-folderid="${escH(f.id)}"${depth ? ' style="padding-left:28px"' : ''}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
          ${escH(f.name)}
        </div>`
      ).join('');
      return `${i > 0 ? '<div class="bm-ctx-sep"></div>' : ''}
<div class="bm-ctx-ws-header" data-ws-toggle="${ws.id}">
  <span class="bm-ctx-ws-icon">${escH(ws.icon)}</span>
  <span style="flex:1">${escH(ws.name)}</span>
  <svg class="bm-ctx-ws-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6,9 12,15 18,9"/></svg>
</div>
<div class="bm-ctx-ws-body" data-ws-body="${ws.id}" style="display:none">
${folderItems}
<div class="bm-ctx-ws-folder bm-ctx-ws-nofolder" data-wsid="${ws.id}" data-folderid="">
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
  Unsorted
</div>
</div>`;
    }).join('');
    // Auto-expand first workspace
    const firstBody = _ctxSub.querySelector('[data-ws-body]');
    const firstHeader = _ctxSub.querySelector('[data-ws-toggle]');
    if (firstBody) { firstBody.style.display = ''; firstHeader?.querySelector('.bm-ctx-ws-chevron')?.classList.add('open'); }
    // Toggle collapse on header click
    _ctxSub.querySelectorAll('[data-ws-toggle]').forEach(hdr => {
      hdr.addEventListener('click', e => {
        e.stopPropagation();
        const body = _ctxSub.querySelector(`[data-ws-body="${hdr.dataset.wsToggle}"]`);
        if (!body) return;
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : '';
        hdr.querySelector('.bm-ctx-ws-chevron')?.classList.toggle('open', !open);
      });
    });
    _ctxSub.classList.add('open');
    requestAnimationFrame(() => {
      const subW = _ctxSub.offsetWidth;
      const subH = _ctxSub.offsetHeight;
      const spaceRight = window.innerWidth - itemRect.right - 8;
      const left = spaceRight >= subW ? itemRect.right + 4 : itemRect.left - subW - 4;
      const maxTop = window.innerHeight - subH - 8;
      _ctxSub.style.left = Math.max(4, left) + 'px';
      _ctxSub.style.top  = Math.min(itemRect.top, maxTop) + 'px';
    });
    _ctxSub.querySelectorAll('.bm-ctx-ws-folder').forEach(opt => {
      opt.addEventListener('click', async () => {
        const targetId = Number(opt.dataset.wsid);
        const folder = moveBookmarkToWorkspace(bm.id, targetId, opt.dataset.folderid || null);
        await save();
        closeCtxMenu(); closeModal('folderModal');
        renderWorkspaceBookmarks(); renderSidebarFolders();
        const ws = S.workspaces.find(w => w.id === targetId);
        if (folder) showToast(`Moved to “${folder.name}” in ${ws?.name || 'workspace'}`, 'success');
      });
    });
  });

  menu.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
    closeCtxMenu();
    removeWsBm(bm.id);   // goes to Trash, with an Undo button
    if (el('folderModal').classList.contains('open') && _wsFolderModalId) openWsBmFolderModal(_wsFolderModalId);   // refresh the open folder
  });

  menu.classList.add('open');
  _ctxSub.classList.remove('open');
}

// Currently-open workspace folder modal id (for re-rendering after drop)
let _wsFolderModalId = null;

function openWsBmFolderModal(folderId /* or legacy folderName */, _legacyItems) {
  closeCtxMenu();
  // Backwards compat: callers may still pass (folderName, items)
  let folder = getFolderById(folderId);
  if (!folder && typeof folderId === 'string') {
    folder = wsFolders().find(f => f.parentId == null && f.name === folderId) || null;
  }
  if (!folder) return;

  _wsFolderModalId = folder.id;
  // Index once to avoid repeated scans when computing subfolder bookmark counts
  const bmIdx = buildBookmarksByFolderIndex();
  const chIdx = buildChildrenByParentIndex();
  const items = bmIdx.get(folder.id) || [];
  const subs  = chIdx.get(folder.id) || [];
  const crumb = folderBreadcrumb(folder.id);
  const isTop = folder.parentId == null;

  // View mode (grid/list) for the bookmark cards section — persisted via localStorage.
  let _fmView = 'grid';
  try { _fmView = localStorage.getItem('__td_fmView') === 'list' ? 'list' : 'grid'; } catch(e){}

  // Header: breadcrumb when we're inside a subfolder
  const titleEl = el('folderModalTitle');
  if (crumb.length > 1) {
    const root = crumb[0];
    titleEl.innerHTML = `<span class="folder-modal-crumb-link" data-fid="${escH(root.id)}">${escH(root.name)}</span><span class="folder-modal-crumb-sep">›</span><span>${escH(folder.name)}</span>`;
    titleEl.querySelector('.folder-modal-crumb-link')?.addEventListener('click', () => openWsBmFolderModal(root.id));
  } else {
    titleEl.textContent = folder.name;
  }
  el('folderModalIcon').textContent = '📁';
  const total = items.length + subs.reduce((n, s) => n + (bmIdx.get(s.id) || []).length, 0);
  const subSummary = subs.length ? ` · ${subs.length} subfolder${subs.length!==1?'s':''}` : '';
  el('folderModalCount').textContent = total ? `${total} bookmark${total !== 1 ? 's' : ''}${subSummary}` : (subs.length ? `${subs.length} subfolder${subs.length!==1?'s':''}` : 'Empty');

  // Header actions: View toggle, Add Bookmark, New Subfolder (only at top-level), Rename, Delete
  const actionsEl = el('folderModalActions');
  const gridIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`;
  const listIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>`;
  const newSubBtn = isTop ? `
    <button class="icon-btn" id="_wsFmNewSub" data-tip="New subfolder" style="width:26px;height:26px">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
    </button>` : '';
  actionsEl.innerHTML = `
    <button class="icon-btn" id="_wsFmViewGrid" data-tip="Grid view" style="width:26px;height:26px">${gridIcon}</button>
    <button class="icon-btn" id="_wsFmViewList" data-tip="List view" style="width:26px;height:26px">${listIcon}</button>
    <button class="btn-primary" id="_wsFmAddBm" style="font-size:12px;padding:5px 10px">+ Add Bookmark</button>
    ${newSubBtn}
    <button class="icon-btn" id="_wsFmRename" data-tip="Rename folder" style="width:26px;height:26px">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    </button>
    <button class="icon-btn" id="_wsFmDelete" data-tip="Delete folder" style="width:26px;height:26px;color:var(--red)">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
    </button>`;
  const setActiveView = (v) => {
    actionsEl.querySelector('#_wsFmViewGrid').classList.toggle('active', v === 'grid');
    actionsEl.querySelector('#_wsFmViewList').classList.toggle('active', v === 'list');
  };
  setActiveView(_fmView);
  actionsEl.querySelector('#_wsFmViewGrid').addEventListener('click', () => {
    _fmView = 'grid';
    try { localStorage.setItem('__td_fmView', 'grid'); } catch(e){}
    setActiveView('grid'); renderItems();
  });
  actionsEl.querySelector('#_wsFmViewList').addEventListener('click', () => {
    _fmView = 'list';
    try { localStorage.setItem('__td_fmView', 'list'); } catch(e){}
    setActiveView('list'); renderItems();
  });

  actionsEl.querySelector('#_wsFmAddBm').addEventListener('click', () => {
    closeModal('folderModal');
    openWsBookmarkEditModal(folder.name, null, folder.id);
  });
  actionsEl.querySelector('#_wsFmNewSub')?.addEventListener('click', () => {
    closeModal('folderModal');
    openWsFolderEditModal(null, folder.id);
  });
  actionsEl.querySelector('#_wsFmRename').addEventListener('click', () => {
    closeModal('folderModal');
    openWsFolderEditModal(folder.id);
  });
  actionsEl.querySelector('#_wsFmDelete').addEventListener('click', () => {
    const subBmCount = subs.reduce((n,s) => n + (bmIdx.get(s.id) || []).length, 0);
    const total = items.length + subBmCount;
    let msg;
    if (subs.length && total) msg = `This will also delete ${subs.length} subfolder${subs.length!==1?'s':''} and ${total} bookmark${total!==1?'s':''} inside.`;
    else if (subs.length)     msg = `This will also delete ${subs.length} subfolder${subs.length!==1?'s':''}.`;
    else if (total)           msg = `This will also delete ${total} bookmark${total!==1?'s':''} inside.`;
    else                      msg = 'The folder is empty.';
    confirm2(`Delete "${folder.name}"?`, msg, () => removeWsFolderById(folder.id));
  });

  const itemsEl = el('folderModalItems');

  // Build subfolder strip (renders the same regardless of view mode)
  let stripHtml = '';
  if (subs.length) {
    stripHtml = `<div class="folder-modal-subfolders">${subs.map(s => {
      const sBms = bmIdx.get(s.id) || [];
      const prev = sBms.slice(0, 4);
      const favs = prev.map(bm => `<img class="favicon-img" loading="lazy" decoding="async" src="${favSrc(bm.url)}" data-fb="hide" alt="">`).join('');
      return `
        <div class="folder-modal-subfolder" data-fid="${escH(s.id)}" draggable="true">
          <button class="ws-folder-menu-btn" data-fid="${escH(s.id)}" data-tip="Options" style="position:absolute;top:6px;right:6px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
          </button>
          <div class="folder-modal-subfolder-top">
            <span style="font-size:14px">📁</span>
            <span class="folder-modal-subfolder-name">${escH(s.name)}</span>
          </div>
          <div class="folder-modal-subfolder-meta">${sBms.length} bookmark${sBms.length!==1?'s':''}</div>
          <div class="folder-favicons" style="margin-top:6px">${favs}</div>
        </div>`;
    }).join('')}</div>`;
  }

  function renderItems() {
    if (!items.length && !subs.length) {
      itemsEl.style.display = 'block';
      itemsEl.classList.remove('fm-list');
      itemsEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:20px 0;text-align:center">No bookmarks yet. Click "+ Add Bookmark" above.</div>';
      return;
    }
    itemsEl.style.display = '';
    itemsEl.classList.toggle('fm-list', _fmView === 'list');

    // Build bookmark cards (grid) or rows (list)
    let cardsHtml = '';
    if (items.length) {
      if (_fmView === 'list') {
        cardsHtml = items.map(bm => {
          const name = bm.title || getDomain(bm.url);
          return `
          <div class="bm-list-row" data-bmid="${escH(bm.id)}" draggable="true">
            <a class="bm-list-link" href="${escH(bm.url)}" target="_self">
              <img class="bm-list-favicon" loading="lazy" decoding="async" src="${favSrc(bm.url)}" data-fb="invisible" alt="">
              <div class="bm-list-info">
                <span class="bm-list-name">${escH(name)}</span>
                <span class="bm-list-domain">${escH(getDomain(bm.url))}</span>
              </div>
            </a>
            <span class="bm-card-menu bm-list-menu" role="button" tabindex="0" data-bmid="${escH(bm.id)}" data-tip="Options" aria-label="Options for ${escH(bm.title || bm.url)}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
            </span>
          </div>`;
        }).join('');
      } else {
        cardsHtml = items.map(bm => {
          const letter = (bm.title || getDomain(bm.url) || '?')[0].toUpperCase();
          const name = bm.title || getDomain(bm.url);
          return `
          <a class="bm-card" href="${escH(bm.url)}" target="_self" data-bmid="${escH(bm.id)}" draggable="true" data-tip="${escH(name)}">
            <span class="bm-card-menu" role="button" tabindex="0" data-bmid="${escH(bm.id)}" data-tip="Options" aria-label="Options for ${escH(bm.title || bm.url)}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
            </span>
            <div class="bm-card-icon" data-letter="${escH(letter)}">
              <img loading="lazy" decoding="async" src="${favSrc(bm.url)}" data-fb="card" alt="">
            </div>
            <div class="bm-card-name">${escH(name)}</div>
            <div class="bm-card-domain">${escH(getDomain(bm.url))}</div>
          </a>`;
        }).join('');
      }
    }

    itemsEl.innerHTML = stripHtml + (cardsHtml ? `<div class="folder-modal-cards">${cardsHtml}</div>` : '');

    // Single delegated click on the modal body — bound once across modal opens/view-toggles.
    if (!itemsEl.dataset.delegated) {
      itemsEl.dataset.delegated = '1';
      itemsEl.addEventListener('click', e => {
        const subMenuBtn = e.target.closest('.folder-modal-subfolder .ws-folder-menu-btn');
        if (subMenuBtn) {
          e.stopPropagation();
          const f = getFolderById(subMenuBtn.dataset.fid);
          if (!f) return;
          openFolderCardCtxMenu(subMenuBtn, f.name, bookmarksInFolder(f.id), f.id);
          return;
        }
        const subCard = e.target.closest('.folder-modal-subfolder');
        if (subCard) { openWsBmFolderModal(subCard.dataset.fid); return; }
        const bmMenu = e.target.closest('.bm-card-menu');
        if (bmMenu) {
          e.preventDefault();
          e.stopPropagation();
          const fid = _wsFolderModalId;
          const bms = fid ? (wsBookmarks().filter(b => b.folderId === fid)) : [];
          const bm = bms.find(b => b.id === bmMenu.dataset.bmid);
          if (bm) {
            const cur = getFolderById(fid);
            openBmCtxMenu(bmMenu, bm, cur ? cur.name : '');
          }
        }
      });
    }

    // Spring-load drop targets on subfolder cards
    if (subs.length) attachBookmarkDropTargets(itemsEl, '.folder-modal-subfolder');

    // Drag-reorder for bookmark cards/rows in whichever view is active
    const cardsContainer = itemsEl.querySelector('.folder-modal-cards');
    if (cardsContainer && items.length) {
      const rowSel = _fmView === 'list' ? '.bm-list-row' : '.bm-card';
      initDragReorder(cardsContainer, rowSel, () => {
        const newIds = [...cardsContainer.querySelectorAll(rowSel)].map(el => el.dataset.bmid);
        const d = wsData();
        const folderIndices = d.importedBookmarks.reduce((acc, b, i) => {
          if (b.folderId === folder.id) acc.push(i);
          return acc;
        }, []);
        const reordered = newIds.map(id => d.importedBookmarks.find(b => b.id === id)).filter(Boolean);
        folderIndices.forEach((origIdx, i) => { if (reordered[i]) d.importedBookmarks[origIdx] = reordered[i]; });
        save();
      });
    }
  }
  renderItems();
  openModal('folderModal');
}

async function removeWsBm(id) {
  const d = wsData();
  const bm = (d.importedBookmarks || []).find(b => b.id === id);
  if (!bm) return;
  const item = trashAdd('bookmark', { ...bm, name: bm.title });
  d.importedBookmarks = d.importedBookmarks.filter(b => b.id !== id);
  renderWorkspaceBookmarks(); renderSidebarFolders(); renderTrash();
  undoToast('Bookmark moved to Trash', item);
  await save();
}

function openWsBmChooser() {
  openModal('wsBmChooserModal');
}

// Edit existing folder: pass folderId. Create new: pass null + optional parentId for subfolder.
let _wsFolderNewParentId = null;
function openWsFolderEditModal(existingFolderIdOrName, parentId) {
  let existingId = null;
  if (existingFolderIdOrName) {
    const byId = getFolderById(existingFolderIdOrName);
    existingId = byId ? byId.id : (wsFolders().find(f => f.parentId == null && f.name === existingFolderIdOrName)?.id || null);
  }
  _wsFolderEditName = existingId; // store id (legacy var name)
  _wsFolderNewParentId = parentId || null;
  const isEdit = !!existingId;
  const existingFolder = isEdit ? getFolderById(existingId) : null;
  let title = isEdit ? 'Rename Folder' : 'New Folder';
  if (!isEdit && parentId) {
    const parent = getFolderById(parentId);
    if (parent) title = `New Subfolder in “${parent.name}”`;
  }
  el('wsFolderEditTitle').textContent = title;
  el('wsFolderEditNameInput').value = existingFolder ? existingFolder.name : '';
  el('wsFolderEditSaveBtn').textContent = isEdit ? 'Save' : 'Create';
  openModal('wsFolderEditModal');
}

async function saveWsFolderEdit() {
  const name = el('wsFolderEditNameInput').value.trim();
  if (!name) { showToast('Enter a folder name', 'error'); return; }
  const d = wsData();
  if (_wsFolderEditName) {
    // Rename existing folder by id
    const f = d.folders.find(x => x.id === _wsFolderEditName);
    if (!f) { showToast('Folder not found', 'error'); return; }
    const oldName = f.name;
    f.name = name;
    // Keep folderName mirror in sync for any bookmark inside this folder
    d.importedBookmarks = (d.importedBookmarks || []).map(b =>
      b.folderId === f.id ? { ...b, folderName: name } : b
    );
    showToast('Folder renamed!', 'success');
  } else {
    // Create new folder. Cap depth at MAX_FOLDER_DEPTH.
    const parentId = _wsFolderNewParentId || null;
    if (parentId) {
      const parent = d.folders.find(x => x.id === parentId);
      if (!parent) { showToast('Parent folder not found', 'error'); return; }
      if (parent.parentId != null) { showToast('Subfolders cannot be nested further', 'error'); return; }
      if (parent.parentId == null && /* depth 0 */ MAX_FOLDER_DEPTH < 1) {
        showToast('Nesting is disabled', 'error'); return;
      }
    }
    // Duplicate check within same parent scope
    const sameParent = d.folders.filter(f => f.parentId === parentId);
    if (sameParent.some(f => f.name.toLowerCase() === name.toLowerCase())) {
      showToast('A folder with that name already exists here', 'error'); return;
    }
    const newFolder = { id: _newFolderId(), name, parentId };
    d.folders.push(newFolder);
    showToast('Folder created!', 'success');
    _wsFolderNewParentId = null;
  }
  await save();
  closeModal('wsFolderEditModal');
  renderWorkspaceBookmarks();
  renderSidebarFolders();
  if (_wsFolderModalId) {
    // Re-render the open folder modal so changes show
    openWsBmFolderModal(_wsFolderModalId);
  }
}

function _setWsBmFolder(value, label) {
  _wsBmFolderValue = value;
  el('wsBmFolderLabel').textContent = label || value;
  el('wsBmFolderLabel').style.color = value ? 'var(--text-primary)' : 'var(--text-muted)';
  // Update selected highlight
  el('wsBmFolderDropdown').querySelectorAll('.csel-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.value === value);
  });
  _closeCsel();
}

function _closeCsel() {
  el('wsBmFolderBtn')?.classList.remove('open');
  el('wsBmFolderDropdown')?.classList.remove('open');
}

// Build a flat indented list of {id, label, depth} for all folders in the active workspace
function allWsFoldersIndented() {
  const out = [];
  topLevelFolders().forEach(top => {
    out.push({ id: top.id, label: top.name, depth: 0 });
    childFolders(top.id).forEach(sub => {
      out.push({ id: sub.id, label: sub.name, depth: 1 });
    });
  });
  return out;
}

function openWsBookmarkEditModal(defaultFolderName, bmId, defaultFolderId) {
  _wsBmEditId = bmId || null;
  _wsBmDefaultFolder = defaultFolderName || null;
  const isEdit = !!bmId;
  const folderList = allWsFoldersIndented();

  // Build custom dropdown options (indented breadcrumb-style entries)
  const dropdown = el('wsBmFolderDropdown');
  if (!folderList.length) {
    dropdown.innerHTML = `<div class="csel-option" data-value="__new__">📁 Create a folder first...</div>`;
    _setWsBmFolder('__new__', '📁 Create a folder first...');
  } else {
    dropdown.innerHTML = folderList.map(f => {
      const indent = f.depth ? '<span class="csel-indent">↳</span> ' : '';
      return `<div class="csel-option csel-depth-${f.depth}" data-value="${escH(f.id)}">${indent}📁 ${escH(f.label)}</div>`;
    }).join('');
    let initialId = null;
    if (isEdit) {
      const bm = wsBookmarks().find(b => b.id === bmId);
      initialId = bm?.folderId || null;
    } else if (defaultFolderId) {
      initialId = defaultFolderId;
    } else if (defaultFolderName) {
      initialId = wsFolders().find(f => f.parentId == null && f.name === defaultFolderName)?.id || null;
    }
    if (!initialId) initialId = folderList[0].id;
    const sel = folderList.find(f => f.id === initialId) || folderList[0];
    const indent = sel.depth ? '↳ ' : '';
    _setWsBmFolder(sel.id, `${indent}📁 ${sel.label}`);
  }
  dropdown.querySelectorAll('.csel-option').forEach(opt => {
    opt.addEventListener('click', () => _setWsBmFolder(opt.dataset.value, opt.textContent.trim()));
  });

  if (isEdit) {
    const bm = wsBookmarks().find(b => b.id === bmId);
    if (!bm) return;
    el('wsBookmarkEditTitle').textContent = 'Edit Bookmark';
    el('wsBmEditTitle').value = bm.title || '';
    el('wsBmEditUrl').value = bm.url || '';
    el('wsBmEditDeleteBtn').style.display = 'block';
    el('wsBmEditSaveBtn').textContent = 'Save';
  } else {
    el('wsBookmarkEditTitle').textContent = 'Add Bookmark';
    el('wsBmEditTitle').value = '';
    el('wsBmEditUrl').value = '';
    el('wsBmEditDeleteBtn').style.display = 'none';
    el('wsBmEditSaveBtn').textContent = 'Add Bookmark';
  }
  openModal('wsBookmarkEditModal');
}

async function saveWsBookmarkEdit() {
  const folderValue = _wsBmFolderValue;
  if (folderValue === '__new__') {
    closeModal('wsBookmarkEditModal');
    openWsFolderEditModal(null);
    return;
  }
  const title = el('wsBmEditTitle').value.trim();
  const u = normalizeUrl(el('wsBmEditUrl').value);
  if (!u.ok) { showToast(u.error, 'error'); el('wsBmEditUrl').focus(); return; }
  const d = wsData();
  const tgt = (d.folders || []).find(f => f.id === folderValue);   // folderValue is a folder id
  if (!tgt) { showToast('Choose a folder for this bookmark.', 'error'); return; }
  if (_wsBmEditId) {
    d.importedBookmarks = (d.importedBookmarks || []).map(b =>
      b.id === _wsBmEditId ? { ...b, title: title || u.url, url: u.url, folderId: tgt.id, folderName: tgt.name } : b
    );
    showToast('Bookmark updated', 'success');
  } else {
    d.importedBookmarks = [...(d.importedBookmarks || []), { id: 'ws_' + uid(), title: title || u.url, url: u.url, folderId: tgt.id, folderName: tgt.name, date: Date.now() }];
    showToast('Bookmark added', 'success');
  }
  closeModal('wsBookmarkEditModal');
  renderWorkspaceBookmarks();
  renderSidebarFolders();
  if (S.bmSource === 'workspace' && el('view-bookmarks')?.classList.contains('active')) renderBmForActiveWorkspace();
  await save();
}

// Delete folder + all its descendants and bookmarks (recursive).
async function removeWsFolderById(folderId) {
  const d = wsData();
  const target = (d.folders || []).find(f => f.id === folderId);
  if (!target) return;
  const ids = new Set([folderId]);
  (d.folders || []).filter(f => f.parentId === folderId).forEach(f => ids.add(f.id));   // subfolders (one level)
  const bundle = { rootId: folderId, folders: clone((d.folders || []).filter(f => ids.has(f.id))), bookmarks: clone((d.importedBookmarks || []).filter(b => ids.has(b.folderId))) };
  const item = trashAdd('folder', { name: target.name, bundle });
  d.folders = (d.folders || []).filter(f => !ids.has(f.id));
  d.importedBookmarks = (d.importedBookmarks || []).filter(b => !ids.has(b.folderId));
  closeModal('folderModal');
  _wsFolderModalId = null;
  renderWorkspaceBookmarks(); renderSidebarFolders(); renderTrash();
  undoToast(`Folder “${target.name}” moved to Trash`, item);
  await save();
}

// Legacy delete-by-name: still used by older code paths (sidebar / context menu) — resolve to id then delegate.
async function removeWsFolder(folderName) {
  const f = wsFolders().find(x => x.parentId == null && x.name === folderName);
  if (f) return removeWsFolderById(f.id);
}

async function importAllChromeBookmarks() {
  if (!IS_CHROME) { showToast('This only works inside Chrome.', 'error'); return; }
  if (!S.allBookmarks.length) { showToast('No Chrome bookmarks found', 'error'); return; }
  const folders = [], bms = [];
  S.allBookmarks.forEach(cf => {
    const items = (cf.items || []).filter(it => isSafeLink(it.url));
    if (!items.length) return;
    const f = { id: _newFolderId(), name: cf.title || 'Bookmarks', parentId: null };
    folders.push(f);
    items.forEach(it => bms.push({ id: 'ws_' + uid(), title: it.title || it.url, url: it.url, folderId: f.id, folderName: f.name, date: it.dateAdded || Date.now() }));
  });
  if (!bms.length) { showToast('No bookmarks to import', 'error'); return; }
  const ws = { id: nid(), name: 'Chrome Bookmarks', icon: '🔖' };
  S.workspaces.push(ws);
  S.wsData[ws.id] = { quickAccess: [], notes: [], tasks: [], importedBookmarks: bms, folders };
  S.activeWsId = ws.id;
  await save();
  el('importChromeBookmarksBtn').closest('.settings-section').style.display = 'none';
  closeSettings();
  renderAll();
  showToast(`Imported ${bms.length} bookmarks into a new workspace`, 'success');
}

// ===== BOOKMARK DRAG → FOLDER (drop-to-move + spring-open) =====
// Module-level state for an in-flight bookmark drag.
let _draggedBmId = null;
const SPRING_OPEN_MS = 700;

function _moveBookmarkToFolder(bmId, targetFolderId) {
  const d = wsData();
  const tgt = (d.folders || []).find(f => f.id === targetFolderId);
  if (!tgt) return false;
  const bm = (d.importedBookmarks || []).find(b => b.id === bmId);
  if (!bm) return false;
  if (bm.folderId === tgt.id) return false;
  bm.folderId = tgt.id;
  bm.folderName = tgt.name;
  save();
  return true;
}

// Wire .bm-card dragstart globally so any bookmark drag is observable to folder cards.
document.addEventListener('dragstart', e => {
  const card = e.target.closest && e.target.closest('.bm-card');
  if (!card || !card.dataset.bmid) return;
  _draggedBmId = card.dataset.bmid;
  document.body.classList.add('dragging-bookmark');
});
document.addEventListener('dragend', () => {
  _draggedBmId = null;
  document.body.classList.remove('dragging-bookmark');
  document.querySelectorAll('.folder-drop-hover').forEach(el => el.classList.remove('folder-drop-hover'));
});

// Attach drop-target behaviour on every element matching `selector` inside `container`.
// `selector` elements must carry data-fid (folder id).
function attachBookmarkDropTargets(container, selector) {
  container.querySelectorAll(selector).forEach(card => {
    let springTimer = null;
    const fid = card.dataset.fid;
    if (!fid) return;
    card.addEventListener('dragenter', e => {
      if (!_draggedBmId) return;
      e.preventDefault();
      card.classList.add('folder-drop-hover');
      if (!springTimer) {
        springTimer = setTimeout(() => {
          springTimer = null;
          // Spring-open: open this folder modal so the user can continue the drag inside.
          openWsBmFolderModal(fid);
        }, SPRING_OPEN_MS);
      }
    });
    card.addEventListener('dragover', e => {
      if (!_draggedBmId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    card.addEventListener('dragleave', e => {
      // Only clear when leaving the card itself (not bubbling from children)
      if (e.relatedTarget && card.contains(e.relatedTarget)) return;
      card.classList.remove('folder-drop-hover');
      if (springTimer) { clearTimeout(springTimer); springTimer = null; }
    });
    card.addEventListener('drop', e => {
      if (!_draggedBmId) return;
      e.preventDefault();
      e.stopPropagation();
      card.classList.remove('folder-drop-hover');
      if (springTimer) { clearTimeout(springTimer); springTimer = null; }
      const bmId = _draggedBmId;
      const moved = _moveBookmarkToFolder(bmId, fid);
      _draggedBmId = null;
      document.body.classList.remove('dragging-bookmark');
      if (moved) {
        renderWorkspaceBookmarks();
        renderSidebarFolders();
        if (_wsFolderModalId) openWsBmFolderModal(_wsFolderModalId);
        const tgt = getFolderById(fid);
        if (tgt) showToast(`Moved to “${tgt.name}”`, 'success');
      }
    });
  });
}

// ===== DRAG REORDER =====
function initDragReorder(container, itemSelector, onDrop) {
  container._drag = { itemSelector, onDrop };   // newest settings; the grids are redrawn often, so handlers are attached only once
  if (container._dragBound) return;
  container._dragBound = true;
  const sel = () => container._drag.itemSelector;
  let dragSrc = null;
  let placeholder = null;
  let didDrop = false;
  // rAF throttling for dragover — coalesce many ticks into one frame.
  let rafScheduled = false;
  let pendingTarget = null;

  function getItems() {
    return [...container.querySelectorAll(sel())];
  }

  function clearTransforms() {
    getItems().forEach(el => { el.style.transition = ''; el.style.transform = ''; });
  }

  // FLIP move — only forces layout twice per move (once for snapshot, once after insert),
  // and dragover ticks are coalesced via rAF so this can run at most once per frame.
  function movePlaceholder(newNext) {
    if (placeholder.nextElementSibling === newNext) return;
    const items = getItems();
    const snap = new Map();
    for (let i = 0; i < items.length; i++) snap.set(items[i], items[i].getBoundingClientRect());
    container.insertBefore(placeholder, newNext);
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      const before = snap.get(el);
      if (!before) continue;
      const after = el.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top  - after.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.style.transition = 'none';
      el.style.transform  = `translate(${dx}px,${dy}px)`;
    }
    requestAnimationFrame(() => {
      for (let i = 0; i < items.length; i++) {
        const el = items[i];
        if (!el.style.transform) continue;
        el.style.transition = 'transform 0.16s ease';
        el.style.transform  = '';
      }
    });
  }

  container.addEventListener('dragstart', e => {
    if (e.target.closest('button')) { e.preventDefault(); return; }
    const item = e.target.closest(sel());
    if (!item) return;
    dragSrc = item;
    didDrop = false;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');

    // Custom ghost: slightly scaled + shadow so it looks "lifted"
    const ghost = item.cloneNode(true);
    Object.assign(ghost.style, {
      position: 'fixed', top: '-9999px', left: '-9999px',
      width: item.offsetWidth + 'px', pointerEvents: 'none',
      transform: 'scale(1.05) rotate(-1deg)',
      boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
      borderRadius: getComputedStyle(item).borderRadius,
      opacity: '0.95'
    });
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, item.offsetWidth / 2, item.offsetHeight / 2);
    requestAnimationFrame(() => ghost.remove());

    // Hide original + insert placeholder in its spot
    requestAnimationFrame(() => {
      if (!dragSrc) return;
      placeholder = document.createElement('div');
      placeholder.className = 'drag-placeholder';
      placeholder.style.cssText =
        `width:${item.offsetWidth}px;height:${item.offsetHeight}px;flex-shrink:0`;
      container.insertBefore(placeholder, dragSrc);
      dragSrc.style.display = 'none';
    });
  });

  container.addEventListener('dragover', e => {
    e.preventDefault();
    if (!dragSrc || !placeholder) return;
    const target = e.target.closest(sel());
    if (!target || target === dragSrc) return;
    const rect = target.getBoundingClientRect();
    const after = e.clientX > rect.left + rect.width / 2;
    pendingTarget = after ? target.nextElementSibling : target;
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      if (placeholder && pendingTarget !== undefined) movePlaceholder(pendingTarget);
      pendingTarget = null;
    });
  });

  container.addEventListener('drop', e => {
    e.preventDefault();
    if (!dragSrc || !placeholder) return;
    didDrop = true;
    clearTransforms();
    dragSrc.style.display = '';
    container.insertBefore(dragSrc, placeholder);
    placeholder.remove();
    placeholder = null;
    dragSrc = null;
    container._drag.onDrop();
  });

  container.addEventListener('dragend', () => {
    if (didDrop) return;
    clearTransforms();
    if (dragSrc) {
      dragSrc.style.display = '';
      if (placeholder) container.insertBefore(dragSrc, placeholder);
    }
    placeholder?.remove();
    placeholder = null;
    dragSrc = null;
  });
}

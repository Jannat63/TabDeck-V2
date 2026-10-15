'use strict';
// =============================================
//  TabDeck · The browser’s own bookmarks (view, add, edit, delete)
// =============================================

// ===== CHROME BOOKMARKS (the browser's own) =====
async function loadBookmarks() {
  el('bookmarksLoading').style.display = 'flex';
  if (S.bmSource === 'chrome') el('allBookmarksList').innerHTML = '';
  const tree = await API.bookmarks();
  S.allBookmarks = parseBookmarkTree(tree);
  el('bookmarksLoading').style.display = 'none';
  S.bmFolderFilter = null;
  renderBookmarksPage();
}

// Recursively flatten bookmark tree into array of folder objects
function parseBookmarkTree(nodes) {
  const folders = [];
  function walk(node) {
    if (!node.url && node.title && node.children) {
      // It's a folder
      const items = [];
      collectLeafs(node.children, items);
      if (items.length > 0 || node.id !== '0') {
        // Only add if has bookmarks
        if (items.length > 0) {
          folders.push({ id: node.id, title: node.title || 'Untitled', items });
        }
      }
      // Also recurse subfolders
      node.children.forEach(child => {
        if (!child.url) walk(child);
      });
    }
  }
  function collectLeafs(children, arr) {
    if (!children) return;
    children.forEach(c => {
      if (c.url) { arr.push(c); }
      // Don't recurse into sub-folders here, they become their own folders
    });
  }
  // Start from root children
  if (nodes && nodes[0] && nodes[0].children) {
    nodes[0].children.forEach(rootFolder => {
      walk(rootFolder);
    });
  }
  return folders;
}

// Sidebar bookmark folders list (click to open popup)
function renderSidebarFolders() {
  const list = document.getElementById('sidebarFoldersList');
  if (!list) return;
  const tops = topLevelFolders();
  if (!tops.length) {
    list.innerHTML = '<div class="sidebar-empty" style="color:var(--text-muted);font-size:11.5px;padding:4px 9px">No folders yet</div>';
    return;
  }
  list.innerHTML = tops.map(f => `
      <div class="sidebar-folder-item" data-fid="${escH(f.id)}" role="button" tabindex="0">
        <span style="font-size:12px" aria-hidden="true">📁</span>
        <span class="sidebar-folder-name" data-tip="${escH(f.name)}">${escH(f.name)}</span>
        <span class="sidebar-folder-count">${folderTotalBookmarkCount(f.id)}</span>
      </div>`).join('');
  list.querySelectorAll('.sidebar-folder-item[data-fid]').forEach(item => {
    item.addEventListener('click', () => openWsBmFolderModal(item.dataset.fid));
  });
  // Scroll overflow indicator
  const wrap = list.parentElement;
  if (wrap && wrap.classList.contains('sidebar-folders-wrap')) {
    const update = () => {
      const overflows = list.scrollHeight > list.clientHeight;
      const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 2;
      wrap.classList.toggle('no-overflow', !overflows || atBottom);
    };
    update();
    list.removeEventListener('scroll', list._scrollIndicator);
    list._scrollIndicator = update;
    list.addEventListener('scroll', update);
  }
}


// FIX #6 — Folders click opens modal


// FIX #6 — Folder modal actually shows bookmarks and they're clickable
function openFolderModal(folderId) {
  const folder = S.allBookmarks.find(f => f.id === folderId);
  if (!folder) return;
  _openFolderId = folderId;
  el('folderModalIcon').textContent = '📁';
  el('folderModalTitle').textContent = folder.title;
  el('folderModalCount').textContent = `${folder.items.length} bookmarks`;

  // Header action buttons (rename / delete folder)
  const actionsEl = el('folderModalActions');
  if (actionsEl) {
    actionsEl.innerHTML = IS_CHROME ? `
      <button class="icon-btn" id="_fmRename" data-tip="Rename folder" style="width:26px;height:26px">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="icon-btn" id="_fmDelete" data-tip="Delete folder" style="width:26px;height:26px;color:var(--red)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
      </button>` : '';
    if (IS_CHROME) {
      actionsEl.querySelector('#_fmRename')?.addEventListener('click', () => openEditFolderModal(folderId));
      actionsEl.querySelector('#_fmDelete')?.addEventListener('click', () => deleteChromeFolder(folderId));
    }
  }

  const editIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const delIcon  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;

  const itemsEl = el('folderModalItems');
  itemsEl.innerHTML = folder.items.map(item => `
    <div class="folder-modal-row">
      <a href="${escH(item.url)}" class="folder-modal-item" target="_blank" style="flex:1">
        <img loading="lazy" decoding="async" src="${favSrc(item.url)}" alt="">
        <div class="folder-modal-item-info">
          <span class="folder-modal-item-title">${escH(item.title||item.url)}</span>
          <span class="folder-modal-item-url">${escH(getDomain(item.url))}</span>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;opacity:.4"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
      ${IS_CHROME ? `
        <button class="folder-modal-action-btn" data-bmid="${escH(item.id)}" data-action="edit" data-tip="Edit bookmark">${editIcon}</button>
        <button class="folder-modal-action-btn folder-modal-del-btn" data-bmid="${escH(item.id)}" data-action="del" data-tip="Delete bookmark">${delIcon}</button>
      ` : ''}
    </div>`).join('') +
    (IS_CHROME ? `<button class="bm-add-item-btn" id="_fmAddBm" style="padding:9px 12px;border-top:1px solid var(--border);margin-top:4px;width:100%">+ Add bookmark to this folder</button>` : '');

  // Close modal on link click
  itemsEl.querySelectorAll('.folder-modal-item').forEach(a => {
    a.addEventListener('click', () => closeModal('folderModal'));
  });
  if (IS_CHROME) {
    itemsEl.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => openEditBookmarkModal(btn.dataset.bmid));
    });
    itemsEl.querySelectorAll('[data-action="del"]').forEach(btn => {
      btn.addEventListener('click', () => deleteChromeBm(btn.dataset.bmid));
    });
    itemsEl.querySelector('#_fmAddBm')?.addEventListener('click', () => openAddBookmarkModal(folderId));
  }
  openModal('folderModal');
}

function renderBmToolbar(folderNames) {
  const filtersEl = el('bmFolderFilters');
  const sortEl = el('bmSortSelect');
  if (sortEl) sortEl.value = S.bmSort;

  if (!filtersEl) return;
  // "All" chip + one chip per folder
  const chips = [{ label: 'All', value: null }, ...folderNames.map(n => ({ label: n, value: n }))];
  filtersEl.innerHTML = chips.map(c =>
    `<button class="bm-folder-chip${S.bmFolderFilter === c.value ? ' active' : ''}" data-folder="${c.value === null ? '' : escH(c.value)}">${escH(c.label)}</button>`
  ).join('');
  filtersEl.querySelectorAll('.bm-folder-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      S.bmFolderFilter = btn.dataset.folder === '' ? null : btn.dataset.folder;
      renderBookmarksPage();
    });
  });
}

function renderAllBookmarks(folders) {
  const list = el('allBookmarksList');
  if (!folders || !folders.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔖</div><div class="empty-state-text">No bookmarks found</div></div>';
    return;
  }

  // Build toolbar
  renderBmToolbar(folders.map(f => f.title));

  // Apply folder filter
  let visible = S.bmFolderFilter ? folders.filter(f => f.title === S.bmFolderFilter) : folders;

  // Sort items within each folder
  visible = visible.map(f => {
    let items = [...f.items];
    if (S.bmSort === 'az') items.sort((a,b) => (a.title||'').localeCompare(b.title||''));
    else if (S.bmSort === 'za') items.sort((a,b) => (b.title||'').localeCompare(a.title||''));
    else if (S.bmSort === 'newest') items.sort((a,b) => (b.dateAdded||0) - (a.dateAdded||0));
    else if (S.bmSort === 'oldest') items.sort((a,b) => (a.dateAdded||0) - (b.dateAdded||0));
    // 'most' — no reliable visit count from Chrome bookmarks API, keep as-is
    return {...f, items};
  });

  const editIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const delIcon  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;

  list.innerHTML = visible.map(f => `
    <div class="bm-folder${S.bmFolderFilter ? ' open' : ''}" id="bm-${escH(f.id)}">
      <div class="bm-folder-header" data-fid="${escH(f.id)}">
        <span class="bm-folder-chevron">▶</span>
        <div class="bm-folder-icon-wrap">📁</div>
        <span class="bm-folder-name">${escH(f.title)}</span>
        ${IS_CHROME ? `
          <button class="bm-action-btn" data-action="edit-folder" data-fid="${escH(f.id)}" data-tip="Rename">${editIcon}</button>
          <button class="bm-action-btn bm-del-btn" data-action="delete-folder" data-fid="${escH(f.id)}" data-tip="Delete">${delIcon}</button>
        ` : ''}
        <span class="bm-folder-count">${f.items.length}</span>
      </div>
      <div class="bm-items">
        <div class="bm-items-inner">
          ${f.items.map(it=>`
            <div class="bm-item-row">
              <a href="${escH(it.url)}" class="bm-item" target="_self">
                <div class="bm-favicon-wrap"><img loading="lazy" decoding="async" src="${favSrc(it.url)}" data-fb="hide" alt=""></div>
                <div class="bm-item-text">
                  <span class="bm-item-title">${escH(it.title||it.url)}</span>
                  <span class="bm-item-url">${escH(getDomain(it.url))}</span>
                </div>
              </a>
              ${IS_CHROME ? `
                <button class="bm-action-btn" data-action="edit-bm" data-bmid="${escH(it.id)}" data-tip="Edit">${editIcon}</button>
                <button class="bm-action-btn bm-del-btn" data-action="delete-bm" data-bmid="${escH(it.id)}" data-tip="Delete">${delIcon}</button>
              ` : ''}
            </div>`).join('')}
          ${IS_CHROME ? `<button class="bm-add-item-btn" data-action="add-bm" data-fid="${escH(f.id)}">+ Add bookmark</button>` : ''}
        </div>
      </div>
    </div>`).join('');

  list.querySelectorAll('.bm-folder-header[data-fid]').forEach(h => {
    h.addEventListener('click', e => { if (!e.target.closest('[data-action]')) toggleBmFolder(h.dataset.fid); });
  });
  list.querySelectorAll('[data-action="edit-folder"]').forEach(b => {
    b.addEventListener('click', e => { e.stopPropagation(); openEditFolderModal(b.dataset.fid); });
  });
  list.querySelectorAll('[data-action="delete-folder"]').forEach(b => {
    b.addEventListener('click', e => { e.stopPropagation(); deleteChromeFolder(b.dataset.fid); });
  });
  list.querySelectorAll('[data-action="edit-bm"]').forEach(b => {
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openEditBookmarkModal(b.dataset.bmid); });
  });
  list.querySelectorAll('[data-action="delete-bm"]').forEach(b => {
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); deleteChromeBm(b.dataset.bmid); });
  });
  list.querySelectorAll('[data-action="add-bm"]').forEach(b => {
    b.addEventListener('click', () => openAddBookmarkModal(b.dataset.fid));
  });
}

function toggleBmFolder(id) {
  // Works for Chrome bookmark folders (id="bm-{id}") and ws folders (data-folder header's parent)
  const byId = el('bm-'+id);
  if (byId) { byId.classList.toggle('open'); return; }
  // Workspace folder: find header by data-folder, toggle parent .bm-folder
  const header = document.querySelector(`.bm-ws-folder-header[data-folder="${CSS.escape(id)}"]`);
  header?.closest('.bm-folder')?.classList.toggle('open');
}

// ===== BOOKMARK CRUD =====
function populateFolderSelect(selectId, selectedId) {
  const sel = el(selectId);
  if (!sel) return;
  sel.innerHTML = S.allBookmarks.map(f =>
    `<option value="${escH(f.id)}"${f.id === selectedId ? ' selected' : ''}>${escH(f.title)}</option>`
  ).join('');
}

function openAddBookmarkModal(parentId) {
  if (!IS_CHROME) { showToast('Bookmark editing requires Chrome', 'error'); return; }
  _bmEditId = null;
  _bmEditParentId = parentId || (S.allBookmarks[0] && S.allBookmarks[0].id) || '1';
  el('bookmarkEditModalTitle').textContent = 'Add Bookmark';
  el('bmEditName').value = '';
  el('bmEditUrl').value = '';
  el('bmEditDeleteBtn').style.display = 'none';
  populateFolderSelect('bmEditFolder', _bmEditParentId);
  openModal('bookmarkEditModal');
}

function openEditBookmarkModal(bmId) {
  if (!IS_CHROME) { showToast('Bookmark editing requires Chrome', 'error'); return; }
  let item = null, parentId = null;
  for (const f of S.allBookmarks) {
    const found = f.items.find(i => i.id === bmId);
    if (found) { item = found; parentId = f.id; break; }
  }
  if (!item) return;
  _bmEditId = bmId;
  _bmEditParentId = parentId;
  el('bookmarkEditModalTitle').textContent = 'Edit Bookmark';
  el('bmEditName').value = item.title || '';
  el('bmEditUrl').value = item.url || '';
  el('bmEditDeleteBtn').style.display = 'block';
  populateFolderSelect('bmEditFolder', parentId);
  openModal('bookmarkEditModal');
}

async function saveBookmarkEdit() {
  const title = el('bmEditName').value.trim();
  const u = normalizeUrl(el('bmEditUrl').value);
  const newParentId = el('bmEditFolder').value;
  if (!title) { showToast('Give the bookmark a title.', 'error'); return; }
  if (!u.ok) { showToast(u.error, 'error'); return; }
  if (_bmEditId) {
    if (!await API.updateBookmark(_bmEditId, { title, url: u.url })) { showToast('Chrome couldn’t update that bookmark.', 'error'); return; }
    if (newParentId && newParentId !== _bmEditParentId && !await API.moveBookmark(_bmEditId, { parentId: newParentId })) { showToast('Chrome couldn’t move that bookmark.', 'error'); return; }
    showToast('Bookmark updated', 'success');
  } else {
    const node = await API.createBookmark({ parentId: newParentId || '1', title, url: u.url });
    if (!node) { showToast('Chrome couldn’t add that bookmark.', 'error'); return; }
    showToast('Bookmark added', 'success');
  }
  closeModal('bookmarkEditModal');
  await loadBookmarks();
}

function deleteChromeBm(bmId) {
  if (!IS_CHROME) { showToast('Requires Chrome', 'error'); return; }
  confirm2('Delete Bookmark?', 'This will permanently remove it from Chrome.', async () => {
    if (!await API.removeBookmark(bmId)) { showToast('Chrome couldn’t delete that bookmark.', 'error'); return; }
    closeModal('bookmarkEditModal');
    showToast('Bookmark deleted', 'success');
    await loadBookmarks();
    if (_openFolderId) openFolderModal(_openFolderId);
  });
}

// ===== FOLDER CRUD =====
function openAddFolderModal(parentId) {
  if (!IS_CHROME) { showToast('Folder creation requires Chrome', 'error'); return; }
  _folderEditId = null;
  _folderParentId = parentId || '1';
  el('folderEditModalTitle').textContent = 'New Folder';
  el('folderEditName').value = '';
  el('folderEditSaveBtn').textContent = 'Create';
  openModal('folderEditModal');
}

function openEditFolderModal(folderId) {
  if (!IS_CHROME) { showToast('Folder editing requires Chrome', 'error'); return; }
  const folder = S.allBookmarks.find(f => f.id === folderId);
  if (!folder) return;
  _folderEditId = folderId;
  el('folderEditModalTitle').textContent = 'Rename Folder';
  el('folderEditName').value = folder.title || '';
  el('folderEditSaveBtn').textContent = 'Save';
  openModal('folderEditModal');
}

async function saveFolderEdit() {
  const name = el('folderEditName').value.trim();
  if (!name) { showToast('Enter a folder name', 'error'); return; }
  if (_folderEditId) {
    if (!await API.updateBookmark(_folderEditId, { title: name })) { showToast('Chrome couldn’t rename that folder.', 'error'); return; }
    showToast('Folder renamed', 'success');
  } else {
    const node = await API.createBookmark({ parentId: _folderParentId, title: name });
    if (!node) { showToast('Chrome couldn’t create that folder.', 'error'); return; }
    showToast('Folder created', 'success');
  }
  closeModal('folderEditModal');
  await loadBookmarks();
}

function deleteChromeFolder(folderId) {
  if (!IS_CHROME) { showToast('Requires Chrome', 'error'); return; }
  const folder = S.allBookmarks.find(f => f.id === folderId);
  const title = folder ? folder.title : 'this folder';
  confirm2(`Delete "${title}"?`, 'All bookmarks inside will be permanently deleted from Chrome.', async () => {
    if (!await API.removeBookmarkTree(folderId)) { showToast('Chrome couldn’t delete that folder.', 'error'); return; }
    closeModal('folderModal');
    showToast('Folder deleted', 'success');
    await loadBookmarks();
  });
}

'use strict';
// =============================================
//  TabDeck · Profile, rendering everything, workspaces and the sidebar
// =============================================

// ===== PROFILE =====


// Fetch Google profile picture using OAuth token


// Update avatar: show Google photo if available, else letter
function updateAvatarDisplay() {
  const avatarEl = el('userAvatar');
  if (!avatarEl) return;
  const first = [...(S.user.name || '')][0];
  avatarEl.textContent = first ? first.toUpperCase() : 'U';
  avatarEl.style.background = safeColor(S.user.avatarColor);
  avatarEl.style.padding = '';
}

// ===== RENDER ALL =====
function renderAll() {
  renderSidebarWorkspaces();
  renderTabsWorkspaces();
  renderSidebarFolders();
  applyWidgetVisibility();
  renderQuickAccess();
  renderWorkspaceBookmarks();
  renderNotesWidget();
  renderTasksWidget();
  renderQuote();
  renderNotesView();
  renderTrash();
  renderJannatChips();
  updateJannatProfile();
}

// ===== WORKSPACE SWITCHING =====
function setActiveWorkspace(wsId) {
  const id = Number(wsId);
  if (id === S.activeWsId) return;
  S.activeWsId = id;
  save();
  renderSidebarWorkspaces();
  renderTabsWorkspaces();
  renderSidebarFolders();

  const content = document.querySelector('.home-content');
  const doRender = () => {
    renderQuickAccess();
    renderWorkspaceBookmarks();
    renderNotesWidget();
    renderTasksWidget();
    renderNotesView();
  };
  if (content) {
    content.style.animation = 'wsContentOut .14s ease forwards';
    setTimeout(() => {
      doRender();
      content.style.animation = 'wsContentIn .2s cubic-bezier(.4,0,.2,1) both';
      content.addEventListener('animationend', () => { content.style.animation = ''; }, { once: true });
    }, 140);
  } else {
    doRender();
  }
}

// ===== WORKSPACES SIDEBAR =====
function renderSidebarWorkspaces() {
  const list = el('sidebarWorkspacesList');
  list.innerHTML = S.workspaces.map(ws => `
    <div class="workspace-sidebar-item ${ws.id===S.activeWsId?'active':''}" data-wsid="${ws.id}">
      <div class="ws-icon">${escH(ws.icon)}</div>
      <span style="flex:1">${escH(ws.name)}</span>
    </div>`).join('');
  list.querySelectorAll('.workspace-sidebar-item').forEach(item => {
    item.addEventListener('click', () => setActiveWorkspace(item.dataset.wsid));
  });
  _addDragDrop(list, '.workspace-sidebar-item');
  // Scroll overflow indicator (same as folders)
  const wrap = el('sidebarWorkspacesWrap');
  if (wrap) {
    const update = () => {
      const overflows = list.scrollHeight > list.clientHeight;
      const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 2;
      wrap.classList.toggle('no-overflow', !overflows || atBottom);
    };
    update();
    list.removeEventListener('scroll', list._wsScrollIndicator);
    list._wsScrollIndicator = update;
    list.addEventListener('scroll', update);
  }
}

function reorderWorkspaces(fromId, toId) {
  fromId = Number(fromId); toId = Number(toId);
  if (fromId === toId) return;
  const from = S.workspaces.findIndex(w => w.id === fromId);
  const to   = S.workspaces.findIndex(w => w.id === toId);
  if (from < 0 || to < 0) return;
  const [item] = S.workspaces.splice(from, 1);
  S.workspaces.splice(to, 0, item);
  save();
  renderSidebarWorkspaces();
  renderTabsWorkspaces();
  renderManageWorkspacesList();
}

function _addDragDrop(container, itemSelector) {
  let dragId = null;
  container.querySelectorAll(itemSelector).forEach(item => {
    item.setAttribute('draggable', 'true');
    item.addEventListener('dragstart', e => {
      dragId = item.dataset.wsid;
      item.classList.add('ws-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      dragId = null;
      container.querySelectorAll(itemSelector).forEach(el => el.classList.remove('ws-dragging', 'ws-drag-over'));
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      container.querySelectorAll(itemSelector).forEach(el => el.classList.remove('ws-drag-over'));
      if (item.dataset.wsid !== dragId) item.classList.add('ws-drag-over');
    });
    item.addEventListener('dragleave', () => item.classList.remove('ws-drag-over'));
    item.addEventListener('drop', e => {
      e.preventDefault();
      item.classList.remove('ws-drag-over');
      if (dragId && item.dataset.wsid !== dragId) reorderWorkspaces(dragId, item.dataset.wsid);
    });
  });
}

function renderTabsWorkspaces() {
  const tabs = el('workspaceTabs');
  tabs.innerHTML = S.workspaces.map(ws => `
    <div class="ws-tab ${ws.id===S.activeWsId?'active':''}" data-wsid="${ws.id}">
      <span class="ws-tab-icon">${escH(ws.icon)}</span>
      <span>${escH(ws.name)}</span>
    </div>`).join('');
  tabs.querySelectorAll('.ws-tab').forEach(tab => {
    tab.addEventListener('click', () => setActiveWorkspace(tab.dataset.wsid));
  });
  _addDragDrop(tabs, '.ws-tab');
}

function renderManageWorkspacesList() {
  const list = el('manageWsList');
  if (!list) return;
  list.innerHTML = S.workspaces.map(ws => `
    <div class="manage-ws-row" data-wsid="${ws.id}">
      <span class="manage-ws-drag" data-tip="Drag to reorder" aria-hidden="true">⠿</span>
      <span class="manage-ws-icon">${escH(ws.icon)}</span>
      <span class="manage-ws-name">${escH(ws.name)}</span>
      <div class="manage-ws-actions">
        <button class="manage-ws-edit" data-wsid="${ws.id}" data-tip="Edit">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
        <button class="manage-ws-delete" data-wsid="${ws.id}" data-tip="Delete">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          Delete
        </button>
      </div>
    </div>`).join('');
  list.querySelectorAll('.manage-ws-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal('manageWorkspacesModal');
      openEditWorkspaceModal(btn.dataset.wsid);
    });
  });
  list.querySelectorAll('.manage-ws-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal('manageWorkspacesModal');
      const wsId = Number(btn.dataset.wsid);
      if (S.workspaces.length <= 1) { showToast('You need at least one workspace.', 'error'); renderManageWorkspacesList(); openModal('manageWorkspacesModal'); return; }
      const ws = S.workspaces.find(w => w.id === wsId);
      if (!ws) return;
      const d = S.wsData[wsId] || {};
      const count = (d.importedBookmarks || []).length + (d.notes || []).length + (d.tasks || []).length + (d.quickAccess || []).length;
      confirm2(
        `Delete “${ws.name}”?`,
        `The workspace and everything in it (${count} item${count === 1 ? '' : 's'}) moves to Trash. You can restore it for ${TRASH_DAYS} days.`,
        () => {
          const item = trashAdd('workspace', { name: ws.name, ws: { ...ws }, data: clone(S.wsData[wsId]) }, wsId);
          delete S.wsData[wsId];
          S.workspaces = S.workspaces.filter(w => w.id !== wsId);
          if (S.activeWsId === wsId) S.activeWsId = S.workspaces[0].id;
          save();
          renderAll();
          renderManageWorkspacesList();
          undoToast(`Workspace “${ws.name}” moved to Trash`, item);
        },
        () => { renderManageWorkspacesList(); openModal('manageWorkspacesModal'); },
        { okLabel: 'Move to Trash' }
      );
    });
  });
  _addDragDrop(list, '.manage-ws-row');
}

function openNewWorkspaceModal() {
  _editingWsId = null;
  el('workspaceModalTitle').textContent = 'New Workspace';
  el('workspaceName').value = '';
  el('selectedEmoji').value = '🏠';
  document.querySelectorAll('.emoji-picker span').forEach(s => s.classList.remove('selected'));
  document.querySelector('.emoji-picker span[data-emoji="🏠"]')?.classList.add('selected');
  el('saveWorkspaceBtn').textContent = 'Create';
  openModal('workspaceModal');
}

function openEditWorkspaceModal(wsId) {
  const ws = S.workspaces.find(w => w.id === Number(wsId));
  if (!ws) return;
  _editingWsId = ws.id;
  el('workspaceModalTitle').textContent = 'Edit Workspace';
  el('workspaceName').value = ws.name;
  el('selectedEmoji').value = ws.icon;
  document.querySelectorAll('.emoji-picker span').forEach(s => {
    s.classList.toggle('selected', s.dataset.emoji === ws.icon);
  });
  el('saveWorkspaceBtn').textContent = 'Save';
  openModal('workspaceModal');
}

function addWorkspace(name, icon) {
  const ws = { id: nid(), name: String(name).trim().slice(0, 30) || 'Workspace', icon: cleanIcon(icon) };
  S.workspaces.push(ws);
  S.wsData[ws.id] = DEFAULT_WS_DATA(ws.id);
  save();
  renderSidebarWorkspaces();
  renderTabsWorkspaces();
  showToast(`Workspace “${ws.name}” created`, 'success');
  return ws;
}

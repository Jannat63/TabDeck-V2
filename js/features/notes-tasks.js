'use strict';
// =============================================
//  TabDeck · Notes, the note editor and tasks
// =============================================

// ===== NOTES =====
function renderNotesWidget() {
  const notes = [...wsNotes()].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || b.date || 0) - (a.updatedAt || a.date || 0));
  const list = el('notesList');
  if (!notes.length) {
    list.innerHTML = `<div class="widget-empty-state">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      <span>No notes yet</span>
      <button type="button" class="widget-empty-cta" data-act="new-note">Write a note</button></div>`;
    list.querySelector('[data-act="new-note"]').addEventListener('click', openNoteNew);
    return;
  }
  list.innerHTML = notes.slice(0, 5).map(n => `
    <div class="note-item${n.pinned ? ' pinned' : ''}" data-nid="${n.id}" role="button" tabindex="0">
      <span class="note-text">${escH(n.title || n.content)}</span>${n.pinned ? '<span class="note-pin" role="img" aria-label="Pinned">📌</span>' : ''}
    </div>`).join('') + (notes.length > 5 ? `<button type="button" class="widget-more" data-act="all-notes">View all ${notes.length} notes</button>` : '');
  list.querySelectorAll('.note-item[data-nid]').forEach(item => {
    item.addEventListener('click', () => openNoteEdit(Number(item.dataset.nid)));
  });
  list.querySelector('[data-act="all-notes"]')?.addEventListener('click', () => navigateTo('notes'));
}

function renderNotesView() {
  const allNotes = wsNotes();
  const list = el('notesViewList');
  const filtersEl = el('notesTagFilters');

  // Build tag filter bar from all unique tags
  const allTags = [...new Set(allNotes.flatMap(n => n.tags || []))].sort();
  if (filtersEl) {
    filtersEl.innerHTML = allTags.map(t =>
      `<button class="notes-tag-filter${S.notesViewTagFilter===t?' active':''}" data-tag="${escH(t)}">${escH(t)}</button>`
    ).join('');
    filtersEl.querySelectorAll('.notes-tag-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        S.notesViewTagFilter = S.notesViewTagFilter === btn.dataset.tag ? null : btn.dataset.tag;
        renderNotesView();
      });
    });
  }

  // Filter notes by search query and active tag
  let notes = allNotes;
  const q = S.notesViewSearch.toLowerCase();
  if (q) notes = notes.filter(n => (n.title||'').toLowerCase().includes(q) || (n.content||'').toLowerCase().includes(q));
  if (S.notesViewTagFilter) notes = notes.filter(n => (n.tags||[]).includes(S.notesViewTagFilter));

  if (!notes.length) {
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">📝</div><div class="empty-state-text">${q||S.notesViewTagFilter?'No notes match your search.':'No notes yet. Click "+ New Note" to create one.'}</div></div>`;
    return;
  }

  // Pinned first
  const sorted = [...notes.filter(n=>n.pinned), ...notes.filter(n=>!n.pinned)];
  list.innerHTML = sorted.map(n => {
    const tags = n.tags||[];
    const dateStr = new Date(n.updatedAt||n.date).toLocaleDateString(undefined,{month:'short',day:'numeric'});
    return `<div class="note-card${n.pinned?' pinned':''}" data-nid="${n.id}">
      ${n.pinned?'<span class="note-card-pin" data-tip="Pinned">📌</span>':''}
      <div class="note-card-title">${escH(n.title||'Untitled')}</div>
      <div class="note-card-content">${escH(n.content)}</div>
      <div class="note-card-footer">
        <span class="note-card-date">${dateStr}</span>
        ${tags.length?`<div class="note-card-tags">${tags.slice(0,3).map(t=>`<span class="note-card-tag">${escH(t)}</span>`).join('')}</div>`:''}
      </div>
      <button class="note-card-del-btn" data-nid="${n.id}" data-tip="Delete">🗑</button>
    </div>`;
  }).join('');
  list.querySelectorAll('.note-card[data-nid]').forEach(card => {
    card.addEventListener('click', e => { if (!e.target.closest('.note-card-del-btn')) openNoteEdit(Number(card.dataset.nid)); });
    card.querySelector('.note-card-del-btn')?.addEventListener('click', e => { e.stopPropagation(); deleteNoteById(Number(card.dataset.nid)); });
  });
}

// ===== NOTE EDITOR HELPERS =====
let _noteTags = [];
let _notePinned = false;

function renderNoteEditorTags() {
  const list = el('noteTagsList');
  if (!list) return;
  list.innerHTML = _noteTags.map((t,i) =>
    `<span class="note-tag-chip">${escH(t)}<span class="note-tag-chip-x" data-i="${i}">✕</span></span>`
  ).join('');
  list.querySelectorAll('.note-tag-chip-x').forEach(x => {
    x.addEventListener('click', () => { _noteTags.splice(Number(x.dataset.i),1); renderNoteEditorTags(); });
  });
}

function updateNotePinBtn() {
  const btn = el('notePinBtn');
  const lbl = el('notePinLabel');
  if (!btn) return;
  btn.classList.toggle('pinned', _notePinned);
  if (lbl) lbl.textContent = _notePinned ? 'Pinned' : 'Pin';
}

function updateNoteWordCount() {
  const wc = el('noteWordCount');
  if (!wc) return;
  const words = (el('noteContent')?.value||'').trim().split(/\s+/).filter(Boolean).length;
  wc.textContent = `${words} word${words===1?'':'s'}`;
}

// ----- note editor: saves automatically (while typing, and when it closes) -----
let _noteSnap = null, _noteAutoTimer = null;
const _noteState = () => JSON.stringify([el('noteTitle').value.trim(), el('noteContent').value.trim(), [..._noteTags], !!_notePinned]);
const setNoteSaveState = text => { const n = el('noteSaveState'); if (n) n.textContent = text; };
const noteIsDirty = () => _noteSnap !== null && _noteState() !== _noteSnap;

function _syncNoteButtons() {
  el('noteModalTitle').textContent = S.editingNoteId ? 'Edit Note' : 'New Note';
  const del = el('deleteNoteBtn');
  del.style.display = 'block';
  del.textContent = S.editingNoteId ? '🗑 Delete' : 'Discard';
}
// Writes the editor contents to the note (creating it on the first save). Returns true when something was saved.
function persistNote() {
  const title = el('noteTitle').value.trim(), content = el('noteContent').value.trim();
  if (!title && !content) return false;
  const notes = wsNotes(), now = Date.now();
  const idx = S.editingNoteId ? notes.findIndex(n => n.id === S.editingNoteId) : -1;
  if (idx > -1) notes[idx] = { ...notes[idx], title: title || 'Untitled', content, updatedAt: now, tags: [..._noteTags], pinned: _notePinned };
  else {
    const n = { id: nid(), title: title || 'Untitled', content, date: now, updatedAt: now, tags: [..._noteTags], pinned: _notePinned };
    notes.unshift(n);
    S.editingNoteId = n.id;
  }
  _noteSnap = _noteState();
  _syncNoteButtons();
  save();
  renderNotesWidget(); renderNotesView();
  return true;
}
function scheduleNoteAutosave() {
  clearTimeout(_noteAutoTimer);
  if (!noteIsDirty()) return;
  setNoteSaveState('Editing…');
  _noteAutoTimer = setTimeout(() => { if (el('noteModal').classList.contains('open') && noteIsDirty() && persistNote()) setNoteSaveState('Saved'); }, 1500);
}
// Runs whenever the editor closes (✕, Esc, clicking outside, Done) so typed text is never lost.
function autosaveNote() {
  clearTimeout(_noteAutoTimer);
  const m = el('noteModal');
  if (!m || !m.classList.contains('open') || !noteIsDirty()) return;
  if (persistNote()) showToast('Note saved', 'success');
}
function openNoteEdit(id, wsId) {
  if (wsId != null && Number(wsId) !== S.activeWsId && S.workspaces.some(w => w.id === Number(wsId))) setActiveWorkspace(Number(wsId));
  const noteId = Number(id);
  const note = wsNotes().find(n => n.id === noteId);
  if (!note) return;
  S.editingNoteId = noteId;
  el('noteTitle').value = note.title || '';
  el('noteContent').value = note.content || '';
  _noteTags = Array.isArray(note.tags) ? [...note.tags] : [];
  _notePinned = !!note.pinned;
  _syncNoteButtons();
  renderNoteEditorTags();
  updateNotePinBtn();
  updateNoteWordCount();
  _noteSnap = _noteState();
  setNoteSaveState('');
  openModal('noteModal');
}
function openNoteNew() {
  S.editingNoteId = null;
  el('noteTitle').value = '';
  el('noteContent').value = '';
  _noteTags = [];
  _notePinned = false;
  _syncNoteButtons();
  renderNoteEditorTags();
  updateNotePinBtn();
  updateNoteWordCount();
  _noteSnap = _noteState();
  setNoteSaveState('');
  openModal('noteModal');
  setTimeout(() => el('noteTitle').focus(), 60);
}
// "Done"
function saveNote() {
  const saved = noteIsDirty() && persistNote();
  closeModal('noteModal');
  if (saved) showToast('Note saved', 'success');
}
// "Delete" for an existing note, "Discard" for a note that was never saved
function deleteNote() {
  const id = S.editingNoteId;
  _noteSnap = _noteState();     // nothing left to autosave
  closeModal('noteModal');
  if (id) deleteNoteById(id);
}







// Delete a note directly by ID (used by inline buttons in note cards)
function deleteNoteById(id) {
  const noteId = Number(id), data = wsData();
  const note = data.notes.find(n => n.id === noteId);
  if (!note) return;
  const item = trashAdd('note', { ...note });
  data.notes = data.notes.filter(n => n.id !== noteId);
  S.editingNoteId = null;
  save();
  renderNotesWidget(); renderNotesView(); renderTrash();
  undoToast('Note moved to Trash', item);
}

// ===== TASKS =====
function renderTasksWidget() {
  const tasks = wsTasks();
  const list = el('tasksList');
  const chip = el('tasksProgressChip');
  const done = tasks.filter(x => x.done).length;
  const clearBtn = el('clearDoneTasksBtn');
  if (clearBtn) clearBtn.style.display = done ? '' : 'none';
  if (!tasks.length) {
    list.innerHTML = `<div class="widget-empty-state">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
      <span>Nothing to do yet</span></div>`;
    if (chip) chip.className = 'tasks-progress-chip';
    return;
  }
  if (chip) {
    if (done === tasks.length) { chip.textContent = '✓ All done'; chip.className = 'tasks-progress-chip visible all-done'; }
    else { chip.textContent = `${done}/${tasks.length}`; chip.className = 'tasks-progress-chip visible'; }
  }
  const ordered = [...tasks.filter(x => !x.done), ...tasks.filter(x => x.done)];   // open tasks first
  list.innerHTML = ordered.map(x => `
    <div class="task-item ${x.done ? 'done' : ''}" data-tid="${x.id}">
      <div class="task-checkbox" data-tid="${x.id}" role="checkbox" tabindex="0" aria-checked="${x.done ? 'true' : 'false'}" aria-label="${escH(x.text)}"></div>
      <span class="task-text" data-tid="${x.id}" title="Double-click to edit">${escH(x.text)}</span>
      <button class="task-del-btn" data-tid="${x.id}" data-tip="Delete" aria-label="Delete task: ${escH(x.text)}">✕</button>
    </div>`).join('');
  list.querySelectorAll('.task-checkbox[data-tid]').forEach(cb => cb.addEventListener('click', () => toggleTask(Number(cb.dataset.tid))));
  list.querySelectorAll('.task-del-btn[data-tid]').forEach(btn => btn.addEventListener('click', () => deleteTask(Number(btn.dataset.tid))));
  list.querySelectorAll('.task-text[data-tid]').forEach(sp => sp.addEventListener('dblclick', () => editTaskInline(sp)));
}
function editTaskInline(span) {
  const task = wsTasks().find(x => x.id === Number(span.dataset.tid));
  if (!task) return;
  const input = document.createElement('input');
  input.type = 'text'; input.className = 'task-edit-input'; input.value = task.text; input.maxLength = 200;
  input.setAttribute('aria-label', 'Edit task');
  span.replaceWith(input);
  input.focus(); input.select();
  let finished = false;
  const finish = commit => {
    if (finished) return; finished = true;
    const v = input.value.trim();
    if (commit && v && v !== task.text) { task.text = v; save(); }
    renderTasksWidget();
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') { e.stopPropagation(); finish(false); } });
  input.addEventListener('blur', () => finish(true));
}
function clearDoneTasks() {
  const d = wsData();
  const done = d.tasks.filter(x => x.done);
  if (!done.length) return;
  const items = done.map(x => trashAdd('task', { ...x }));
  d.tasks = d.tasks.filter(x => !x.done);
  save(); renderTasksWidget(); renderTrash();
  showToast(`${done.length} completed task${done.length === 1 ? '' : 's'} moved to Trash`, 'success', { action: 'Undo', onAction: () => items.forEach(i => restoreItem(i._tid)) });
}

function toggleTask(id) {
  const taskId = Number(id);
  const t = wsTasks().find(t => t.id === taskId);
  if (!t) return;
  // Brief animation before re-render
  const row = document.querySelector(`.task-checkbox[data-tid="${taskId}"]`)?.closest('.task-item');
  if (row && !t.done) {
    row.style.transition = 'opacity .15s ease, transform .15s ease';
    row.style.transform = 'scale(1.01)';
    setTimeout(() => { row.style.transform = ''; }, 150);
  }
  t.done = !t.done; save(); renderTasksWidget();
}

function deleteTask(id) {
  const taskId = Number(id), data = wsData();
  const task = data.tasks.find(x => x.id === taskId);
  if (!task) return;
  const item = trashAdd('task', { ...task });
  data.tasks = data.tasks.filter(x => x.id !== taskId);
  save();
  renderTasksWidget(); renderTrash();
  undoToast('Task moved to Trash', item);
}

function addTask(text) {
  const v = String(text || '').trim().slice(0, 200);
  if (!v) return;
  wsTasks().unshift({ id: nid(), text: v, done: false });
  save();
  renderTasksWidget();
}

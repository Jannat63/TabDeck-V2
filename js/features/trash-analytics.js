'use strict';
// =============================================
//  TabDeck · Trash and the Analytics page
// =============================================

// ===== TRASH =====
const TRASH_DAYS = 30, TRASH_MAX = 300;
const TRASH_TYPES = { note: ['📝', 'Note'], task: ['✅', 'Task'], quickAccess: ['⚡', 'Quick Access'], bookmark: ['🔖', 'Bookmark'], folder: ['📁', 'Folder'], workspace: ['🗂️', 'Workspace'] };
const _plain = item => { const o = {}; Object.keys(item).forEach(k => { if (k[0] !== '_') o[k] = item[k]; }); return o; };

// Put something in the Trash. Everything that can be deleted goes through here, so it can all be restored.
function trashAdd(type, payload = {}, wsId = S.activeWsId) {
  const ws = S.workspaces.find(w => w.id === wsId);
  const item = { ...payload, _tid: newTid(), _type: type, _deletedAt: Date.now(), _wsId: wsId, _wsName: ws ? ws.name : '' };
  S.trash.push(item);
  if (S.trash.length > TRASH_MAX) S.trash.splice(0, S.trash.length - TRASH_MAX);
  return item;
}
function purgeOldTrash() {
  const cutoff = Date.now() - TRASH_DAYS * 86400000;
  S.trash = S.trash.filter(i => !i._deletedAt || i._deletedAt > cutoff);
}
function undoToast(msg, item) {
  showToast(msg, 'success', { action: 'Undo', onAction: () => restoreItem(item._tid) });
}
function trashTitle(i) { return i.name || i.text || i.title || (i._type === 'note' ? 'Untitled note' : 'Item'); }
function trashDetail(i) {
  if (i._type === 'folder') return `${(i.bundle?.bookmarks || []).length} bookmarks`;
  if (i._type === 'workspace') { const d = i.data || {}; return `${(d.importedBookmarks || []).length} bookmarks · ${(d.notes || []).length} notes · ${(d.tasks || []).length} tasks`; }
  if (i._type === 'quickAccess' || i._type === 'bookmark') return getDomain(i.url || '');
  return '';
}
function renderTrash() {
  const list = el('trashList');
  if (!list) return;
  if (!S.trash.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🗑️</div><div class="empty-state-text">Trash is empty</div><div class="empty-state-sub">Deleted notes, tasks, links, bookmarks, folders and workspaces wait here for 30 days.</div></div>';
    return;
  }
  const items = [...S.trash].reverse();
  list.innerHTML = items.map(item => {
    const [icon, label] = TRASH_TYPES[item._type] || ['📄', 'Item'];
    const detail = trashDetail(item);
    const meta = [label, detail, item._wsName && item._type !== 'workspace' ? `from ${item._wsName}` : '', item._deletedAt ? fmtTimeAgo(item._deletedAt) : ''].filter(Boolean).join(' · ');
    return `<div class="trash-item">
      <span class="trash-item-icon" aria-hidden="true">${icon}</span>
      <span class="trash-item-text"><span class="trash-item-name">${escH(trashTitle(item))}</span><span class="trash-item-meta">${escH(meta)}</span></span>
      <button class="restore-btn" data-tid="${escH(item._tid)}">Restore</button>
      <button class="trash-del-btn" data-tid="${escH(item._tid)}" aria-label="Delete ${escH(trashTitle(item))} forever" data-tip="Delete forever"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>`;
  }).join('');
}
function _ensureFolderByName(d, name) {
  d.folders = d.folders || [];
  let f = d.folders.find(x => x.parentId == null && x.name === name);
  if (!f) { f = { id: _newFolderId(), name, parentId: null }; d.folders.push(f); }
  return f;
}
function restoreItem(tid) {
  const idx = S.trash.findIndex(i => String(i._tid) === String(tid));
  if (idx === -1) return false;
  const item = S.trash[idx];
  let label = 'Restored';
  if (item._type === 'workspace') {
    const ws = { ...item.ws };
    if (S.workspaces.some(w => w.id === ws.id)) ws.id = nid();
    S.workspaces.push(ws);
    S.wsData[ws.id] = item.data || DEFAULT_WS_DATA(ws.id);
    label = `Workspace “${ws.name}” restored`;
  } else {
    const home = S.workspaces.some(w => w.id === item._wsId);
    const wsId = home ? item._wsId : S.activeWsId;
    const d = S.wsData[wsId] || (S.wsData[wsId] = DEFAULT_WS_DATA(wsId));
    ['quickAccess', 'notes', 'tasks', 'importedBookmarks', 'folders'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
    const plain = _plain(item);
    if (item._type === 'task') d.tasks.unshift({ ...plain, id: plain.id ?? nid() });
    else if (item._type === 'note') d.notes.unshift({ ...plain, id: plain.id ?? nid() });
    else if (item._type === 'quickAccess') {
      if (d.quickAccess.length >= QA_MAX) { showToast('Quick Access is full. Remove a tile first.', 'error'); return false; }
      d.quickAccess.push({ ...plain, id: plain.id ?? nid() });
    } else if (item._type === 'bookmark') {
      if (!d.folders.some(f => f.id === plain.folderId)) { const f = _ensureFolderByName(d, plain.folderName || 'Restored'); plain.folderId = f.id; plain.folderName = f.name; }
      delete plain.name;
      d.importedBookmarks.push(plain);
    } else if (item._type === 'folder') {
      const b = item.bundle || {};
      const root = (b.folders || []).find(f => f.id === b.rootId);
      if (root && root.parentId && !d.folders.some(f => f.id === root.parentId)) root.parentId = null;
      (b.folders || []).forEach(f => { if (!d.folders.some(x => x.id === f.id)) d.folders.push(f); });
      (b.bookmarks || []).forEach(bm => { if (!d.importedBookmarks.some(x => x.id === bm.id)) d.importedBookmarks.push(bm); });
    }
    if (!home) label = `Restored to ${(S.workspaces.find(w => w.id === wsId) || {}).name || 'this workspace'}`;
  }
  S.trash.splice(idx, 1);
  save();
  renderAll();
  showToast(label, 'success');
  return true;
}
function deleteTrashForever(tid) {
  const item = S.trash.find(i => String(i._tid) === String(tid));
  if (!item) return;
  confirm2('Delete forever?', `“${trashTitle(item)}” will be permanently deleted. This can’t be undone.`, () => {
    S.trash = S.trash.filter(i => String(i._tid) !== String(tid));
    save(); renderTrash();
    showToast('Deleted forever', 'success');
  }, null, { okLabel: 'Delete forever' });
}
function emptyTrash() {
  if (!S.trash.length) { showToast('Trash is already empty', 'info'); return; }
  confirm2('Empty Trash?', `${S.trash.length} item${S.trash.length === 1 ? '' : 's'} will be permanently deleted. This can’t be undone.`, () => {
    S.trash = [];
    save();
    renderTrash();
    showToast('Trash emptied', 'success');
  }, null, { okLabel: 'Empty Trash' });
}




// ===== ANALYTICS VIEW =====
async function renderAnalytics() {
  const container = el('analyticsContent');
  if (!container) return;

  let totalBookmarks = 0, totalFolders = 0;
  S.allBookmarks.forEach(f => { totalFolders++; totalBookmarks += (f.items||[]).length; });

  let totalNotes = 0, totalTasksDone = 0, totalTasksPending = 0, totalQA = 0;
  S.workspaces.forEach(ws => {
    const d = S.wsData[ws.id] || {};
    totalNotes += (d.notes||[]).length;
    (d.tasks||[]).forEach(t => { if (t.done) totalTasksDone++; else totalTasksPending++; });
    totalQA += (d.quickAccess||[]).length;
  });
  const totalTasks = totalTasksDone + totalTasksPending;
  const taskRate = totalTasks > 0 ? Math.round(totalTasksDone / totalTasks * 100) : 0;

  const topFolders = [...S.allBookmarks].sort((a,b) => (b.items||[]).length-(a.items||[]).length).slice(0,10);
  const maxFolderSize = (topFolders[0]?.items||[]).length || 1;

  const wsRows = S.workspaces.map(ws => {
    const d = S.wsData[ws.id] || {};
    return { ws, notes:(d.notes||[]).length, tasks:(d.tasks||[]).length, done:(d.tasks||[]).filter(t=>t.done).length, qa:(d.quickAccess||[]).length };
  });

  const tagCounts = {};
  S.workspaces.forEach(ws => {
    (S.wsData[ws.id]?.notes||[]).forEach(note => {
      (note.tags||[]).forEach(tag => { tagCounts[tag]=(tagCounts[tag]||0)+1; });
    });
  });
  const topTags = Object.entries(tagCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);

  const dataBytes = new Blob([JSON.stringify(snapshot())]).size;
  const chromeVer = navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] || '';

  container.innerHTML = `
    <!-- Row 1: KPI strip (full width) -->
    <div class="an-strip">
      <div class="an-chip"><span class="an-chip-val">${totalBookmarks}</span><span class="an-chip-lbl">Bookmarks</span></div>
      <div class="an-chip"><span class="an-chip-val">${totalFolders}</span><span class="an-chip-lbl">Folders</span></div>
      <div class="an-chip"><span class="an-chip-val">${totalNotes}</span><span class="an-chip-lbl">Notes</span></div>
      <div class="an-chip"><span class="an-chip-val">${totalTasksDone}<em>/${totalTasks}</em></span><span class="an-chip-lbl">Tasks Done</span></div>
      <div class="an-chip"><span class="an-chip-val">${S.workspaces.length}</span><span class="an-chip-lbl">Workspaces</span></div>
      <div class="an-chip"><span class="an-chip-val">${totalQA}</span><span class="an-chip-lbl">Quick Access</span></div>
      <div class="an-chip"><span class="an-chip-val">${S.trash.length}</span><span class="an-chip-lbl">Trash</span></div>
    </div>

    <!-- Row 2: Tasks | Notes | Workspaces | Account (4 cols) -->
    <div class="an-card">
      <div class="an-label">Tasks</div>
      <div class="an-progress-row">
        <div class="an-progress-label"><span>${taskRate}% done</span><span>${totalTasksDone}/${totalTasks}</span></div>
        <div class="an-progress-track"><div class="an-progress-fill" style="width:${taskRate}%"></div></div>
      </div>
      ${wsRows.filter(r=>r.tasks>0).map(r=>`
        <div class="an-row"><span>${escH(r.ws.icon)} ${escH(r.ws.name)}</span><span class="an-muted">${r.done}/${r.tasks}</span></div>
      `).join('')||'<div class="an-empty">No tasks yet.</div>'}
    </div>

    <div class="an-card">
      <div class="an-label">Notes</div>
      <div class="an-hero-val">${totalNotes}</div>
      ${wsRows.filter(r=>r.notes>0).map(r=>`
        <div class="an-row"><span>${escH(r.ws.icon)} ${escH(r.ws.name)}</span><span class="an-pill">${r.notes}</span></div>
      `).join('')||'<div class="an-empty">No notes yet.</div>'}
      ${topTags.length?`<div class="an-label" style="margin-top:10px">Tags</div>
        <div class="an-tags">${topTags.map(([t,c])=>`<span class="an-tag">#${escH(t)} <b>${c}</b></span>`).join('')}</div>`:''}
    </div>

    <div class="an-card">
      <div class="an-label">Workspaces</div>
      ${wsRows.map(r=>`
        <div class="an-row">
          <span class="an-ws-name">${escH(r.ws.icon)} ${escH(r.ws.name)}</span>
          <span class="an-muted" style="font-size:11px;flex-shrink:0">${r.notes}n · ${r.tasks}t · ${r.qa}qa</span>
        </div>`).join('')}
    </div>

    <div class="an-card">
      <div class="an-label">You &amp; this browser</div>
      <div class="an-row"><span>Name</span><span class="an-muted">${escH(S.user.name || '—')}</span></div>
      <div class="an-row"><span>Saved data</span><span class="an-muted">${fmtBytes(dataBytes)}</span></div>
      ${chromeVer?`<div class="an-row"><span>Chrome</span><span class="an-muted">v${chromeVer}</span></div>`:''}
      <div class="an-row"><span>Platform</span><span class="an-muted">${navigator.platform||'—'}</span></div>
    </div>

    <!-- Row 3: Folders (span 2) | Top Sites | Downloads -->
    <div class="an-card an-span-2">
      <div class="an-label">Bookmark Folders <span class="an-muted" style="font-weight:400">(top 10)</span></div>
      ${!totalFolders
        ?'<div class="an-empty">Visit Bookmarks view first to load data.</div>'
        :topFolders.map(f=>{
          const count=(f.items||[]).length;
          const pct=Math.round(count/maxFolderSize*100);
          return `<div class="an-row">
            <span class="an-folder-name">📁 ${escH(f.title)}</span>
            <div class="an-bar-row">
              <div class="an-bar"><div class="an-bar-fill" style="width:${pct}%"></div></div>
              <span class="an-pill">${count}</span>
            </div>
          </div>`;
        }).join('')}
    </div>

    <div class="an-card" id="an-topsites">
      <div class="an-label">Top Visited Sites</div>
      <div class="an-loading">Loading…</div>
    </div>

    <div class="an-card" id="an-downloads">
      <div class="an-label">Downloads — 30 Days</div>
      <div class="an-loading">Loading…</div>
    </div>

    <!-- Row 4: Browsing activity (full width) -->
    <div class="an-card an-span-4" id="an-history">
      <div class="an-label">Browsing Activity — Last 7 Days</div>
      <div class="an-loading">Loading…</div>
    </div>
  `;

  // --- Top Sites (async) ---
  if (IS_CHROME && chrome.topSites) {
    chrome.topSites.get(sites => {
      const card = el('an-topsites');
      if (!card) return;
      if (!sites||!sites.length) { card.querySelector('.an-loading').textContent='No data.'; return; }
      card.innerHTML = '<div class="an-label">Top Visited Sites</div>' +
        sites.slice(0,10).map(s=>`
          <div class="an-row">
            <div style="display:flex;align-items:center;gap:7px;min-width:0">
              <img loading="lazy" decoding="async" src="${favSrc(s.url)}" style="width:14px;height:14px;border-radius:3px;flex-shrink:0" data-fb="hide">
              <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escH(s.title||getDomain(s.url))}</span>
            </div>
            <span class="an-muted" style="font-size:11px;flex-shrink:0">${escH(getDomain(s.url))}</span>
          </div>`).join('');
    });
  } else {
    const c=el('an-topsites');
    if(c) c.innerHTML='<div class="an-label">Top Visited Sites</div><div class="an-empty">Requires Chrome extension.</div>';
  }

  // --- History (async) ---
  if (IS_CHROME && chrome.history) {
    const since = Date.now() - 7*86400000;
    chrome.history.search({text:'',startTime:since,maxResults:1000}, items => {
      const card = el('an-history');
      if (!card) return;
      const domainCounts={};
      let totalVisits=0;
      (items||[]).forEach(item => {
        const d=getDomain(item.url);
        domainCounts[d]=(domainCounts[d]||0)+(item.visitCount||1);
        totalVisits+=(item.visitCount||1);
      });
      const topDomains=Object.entries(domainCounts).sort((a,b)=>b[1]-a[1]).slice(0,10);
      const maxV=topDomains[0]?.[1]||1;
      card.innerHTML=`<div class="an-label">Browsing Activity — Last 7 Days</div>
        <div class="an-strip-mini">
          <div class="an-chip-sm"><span class="an-chip-val">${totalVisits.toLocaleString()}</span><span class="an-chip-lbl">Total Visits</span></div>
          <div class="an-chip-sm"><span class="an-chip-val">${Object.keys(domainCounts).length.toLocaleString()}</span><span class="an-chip-lbl">Unique Sites</span></div>
          <div class="an-chip-sm"><span class="an-chip-val">${(items||[]).length.toLocaleString()}</span><span class="an-chip-lbl">History Items</span></div>
        </div>
        <div class="an-domain-grid">`+
        topDomains.map(([d,c])=>`
          <div class="an-domain-row">
            <div class="an-domain-left">
              <img src="${favSrc('https://' + d + '/', { local: true })}" style="width:14px;height:14px;border-radius:3px;flex-shrink:0" data-fb="hide" alt="">
              <span class="an-domain-name">${escH(d)}</span>
              <div class="an-bar an-bar-flex"><div class="an-bar-fill" style="width:${Math.round(c/maxV*100)}%"></div></div>
            </div>
            <span class="an-pill">${c.toLocaleString()}</span>
          </div>`).join('')+
        `</div>`;
    });
  } else {
    const c=el('an-history');
    if(c) c.innerHTML='<div class="an-label">Browsing Activity</div><div class="an-empty">Requires Chrome extension.</div>';
  }

  // --- Downloads (async) ---
  if (IS_CHROME && chrome.downloads) {
    const since = Date.now() - 30*86400000;
    chrome.downloads.search({orderBy:['-startTime'],limit:500}, items => {
      const card = el('an-downloads');
      if (!card) return;
      const recent=(items||[]).filter(d=>d.startTime&&new Date(d.startTime).getTime()>since);
      const totalBytes=recent.reduce((s,d)=>s+(d.fileSize||0),0);
      const fmt=b=>b>1e9?(b/1e9).toFixed(1)+' GB':b>1e6?(b/1e6).toFixed(1)+' MB':b>1e3?(b/1e3).toFixed(1)+' KB':b+' B';
      card.innerHTML=`<div class="an-label">Downloads — 30 Days</div>
        <div style="display:flex;gap:10px;margin-bottom:8px">
          <div class="an-chip-sm"><span class="an-chip-val">${recent.length}</span><span class="an-chip-lbl">Files</span></div>
          <div class="an-chip-sm"><span class="an-chip-val">${fmt(totalBytes)}</span><span class="an-chip-lbl">Total Size</span></div>
        </div>`+
        (items||[]).slice(0,5).map(d=>{
          const name=(d.filename||d.url||'').split(/[\\/]/).pop()||'Unknown';
          return `<div class="an-row">
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px">${escH(name)}</span>
            <span class="an-muted" style="font-size:11px;flex-shrink:0">${fmt(d.fileSize||0)}</span>
          </div>`;
        }).join('');
    });
  } else {
    const c=el('an-downloads');
    if(c) c.innerHTML='<div class="an-label">Downloads</div><div class="an-empty">Requires Chrome extension.</div>';
  }
}

'use strict';
// =============================================
//  TabDeck · History and downloads pages
// =============================================

// ===== HISTORY =====
function _historyDateLabel(ts) {
  const nowDay = new Date(); nowDay.setHours(0,0,0,0);
  const itemDay = new Date(ts); itemDay.setHours(0,0,0,0);
  const diff = Math.round((nowDay - itemDay) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return 'This Week';
  if (diff < 30) return 'This Month';
  return 'Older';
}

function bindHistoryClear() {
  const btn = el('historyClearAllBtn');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.textContent = 'Clear last 30 days';
  btn.addEventListener('click', () => {
    confirm2('Clear the last 30 days of history?',
      'This deletes your Chrome browsing history for the last 30 days. If Chrome sync is on, it can also be removed from your other devices. This can’t be undone.',
      async () => {
        const ok = await API.deleteHistoryRange(Date.now() - 30 * 86400000, Date.now() + 60000);
        if (!ok) { showToast('Chrome couldn’t clear your history.', 'error'); return; }
        el('historyList').innerHTML = '<div class="empty-state"><div class="empty-state-icon">🕐</div><div class="empty-state-text">History cleared</div></div>';
        showToast('History cleared', 'success');
      }, null, { okLabel: 'Clear history' });
  });
}

async function loadHistory(q) {
  bindHistoryClear();
  el('historyLoading').style.display = 'flex';
  const items = await API.history(q);
  el('historyLoading').style.display = 'none';
  const list = el('historyList');
  if (!items.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🕐</div><div class="empty-state-text">No history found</div></div>';
    return;
  }
  const groups = {}; const groupOrder = [];
  items.slice(0, 150).forEach(it => {
    const lbl = _historyDateLabel(it.lastVisitTime);
    if (!groups[lbl]) { groups[lbl] = []; groupOrder.push(lbl); }
    groups[lbl].push(it);
  });
  list.innerHTML = groupOrder.map(lbl => `
    <div class="history-date-group">
      <div class="history-date-label">${lbl}</div>
      <div class="history-group-items">
        ${groups[lbl].map(it => {
          const initial = escH((it.title || getDomain(it.url) || '?')[0].toUpperCase());
          return `<div class="history-item-wrap">
            <a href="${escH(it.url)}" class="history-item" target="_blank">
              <div class="history-favicon-wrap">
                <img loading="lazy" decoding="async" src="${favSrc(it.url)}" data-fb="next" alt="">
                <span class="history-favicon-initial" style="display:none">${initial}</span>
              </div>
              <div class="history-item-body">
                <span class="history-title">${escH(it.title||it.url)}</span>
                <span class="history-url">${escH(getDomain(it.url))}</span>
              </div>
              <span class="history-time">${fmtTimeAgo(it.lastVisitTime)}</span>
            </a>
            <button class="history-delete-btn" data-url="${escH(it.url)}" data-tip="Remove from history">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('');

  list.querySelectorAll('.history-delete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.preventDefault();
      const url = btn.dataset.url;
      await API.deleteHistoryUrl(url);
      btn.closest('.history-item-wrap').remove();
    });
  });

  bindHistoryClear();
}

// ===== DOWNLOADS =====
function _extBadgeColor(ext) {
  const m = {
    pdf:['#f87171','rgba(239,68,68,.14)'],
    zip:['#fbbf24','rgba(245,158,11,.14)'],rar:['#fbbf24','rgba(245,158,11,.14)'],'7z':['#fbbf24','rgba(245,158,11,.14)'],tar:['#fbbf24','rgba(245,158,11,.14)'],gz:['#fbbf24','rgba(245,158,11,.14)'],
    jpg:['#34d399','rgba(16,185,129,.14)'],jpeg:['#34d399','rgba(16,185,129,.14)'],png:['#34d399','rgba(16,185,129,.14)'],gif:['#34d399','rgba(16,185,129,.14)'],webp:['#34d399','rgba(16,185,129,.14)'],svg:['#34d399','rgba(16,185,129,.14)'],
    mp4:['#a78bfa','rgba(139,92,246,.14)'],mov:['#a78bfa','rgba(139,92,246,.14)'],avi:['#a78bfa','rgba(139,92,246,.14)'],mkv:['#a78bfa','rgba(139,92,246,.14)'],webm:['#a78bfa','rgba(139,92,246,.14)'],
    mp3:['#f472b6','rgba(236,72,153,.14)'],wav:['#f472b6','rgba(236,72,153,.14)'],flac:['#f472b6','rgba(236,72,153,.14)'],
    js:['#fde047','rgba(234,179,8,.14)'],ts:['#60a5fa','rgba(59,130,246,.14)'],jsx:['#60a5fa','rgba(59,130,246,.14)'],tsx:['#60a5fa','rgba(59,130,246,.14)'],
    doc:['#60a5fa','rgba(59,130,246,.14)'],docx:['#60a5fa','rgba(59,130,246,.14)'],
    xls:['#4ade80','rgba(34,197,94,.14)'],xlsx:['#4ade80','rgba(34,197,94,.14)'],
    json:['#94a3b8','rgba(148,163,184,.1)'],
  };
  const [color, bg] = m[ext] || ['#94a3b8','rgba(148,163,184,.1)'];
  return {color, bg};
}

async function loadDownloads() {
  el('downloadsLoading').style.display = 'flex';
  const items = await API.downloads();
  el('downloadsLoading').style.display = 'none';
  const list = el('downloadsList');
  if (!items.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⬇️</div><div class="empty-state-text">No downloads found</div></div>';
    return;
  }
  list.innerHTML = items.map(it => {
    const fn = (it.filename||'').split(/[/\\]/).pop() || 'Unknown';
    const ext = fn.includes('.') ? fn.split('.').pop().toLowerCase() : '';
    const badge = ext ? ext.slice(0,4) : '?';
    const {color, bg} = _extBadgeColor(ext);
    const stateCls = it.state==='complete'?'dl-complete':it.state==='in_progress'?'dl-progress':'dl-interrupted';
    const stateLabel = it.state==='complete'?'Complete':it.state==='in_progress'?'In Progress':it.state==='interrupted'?'Interrupted':'Unknown';
    return `<div class="download-item ${stateCls}">
      <div class="download-ext-badge" style="color:${color};background:${bg}">${escH(badge)}</div>
      <div class="download-info">
        <div class="download-name">${escH(fn)}</div>
        <div class="download-meta">${fmtBytes(it.fileSize||0)}<span class="dl-sep">·</span>${it.startTime?new Date(it.startTime).toLocaleDateString():''}</div>
      </div>
      <div class="download-actions">
        <span class="download-status-badge ${stateCls}">${stateLabel}</span>
        ${it.state==='complete' ? `<button class="dl-show-btn" data-dlid="${it.id}" data-tip="Show in folder">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><polyline points="9,14 12,17 15,14"/></svg>
          Show in folder
        </button>` : ''}
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.dl-show-btn').forEach(btn => {
    btn.addEventListener('click', () => API.showDownload(Number(btn.dataset.dlid)));
  });
}

'use strict';
// =============================================
//  TabDeck · Tooltips, settings, themes, wallpaper, the Jannat themes, backup
// =============================================

// ===== TOOLTIPS (delegated — works for dynamically rendered elements) =====
function initTooltips() {
  const tip = document.createElement('div');
  tip.className = 'tt';
  document.body.appendChild(tip);
  let cur = null;

  function show(target) {
    if (target === cur) return;
    cur = target;
    const rect = target.getBoundingClientRect();
    tip.textContent = target.dataset.tip;
    const inCollapsedSidebar = S.settings.sidebarCollapsed &&
      (target.closest('.nav') || target.closest('.sidebar-footer'));
    if (inCollapsedSidebar) {
      tip.dataset.dir = 'right';
      tip.style.left = (rect.right + 10) + 'px';
      tip.style.top = (rect.top + rect.height / 2) + 'px';
    } else {
      tip.dataset.dir = 'down';
      tip.style.left = (rect.left + rect.width / 2) + 'px';
      tip.style.top = (rect.bottom + 10) + 'px';
    }
    tip.classList.add('tt-show');
  }
  function hide() { tip.classList.remove('tt-show'); cur = null; }

  document.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-tip]');
    if (t) show(t); else if (!cur) return; else if (!cur.contains(e.target)) hide();
  });
  document.addEventListener('mouseout', e => {
    if (!cur) return;
    const t = e.target.closest('[data-tip]');
    if (t && t === cur && !t.contains(e.relatedTarget)) hide();
  });
  document.addEventListener('click', hide);
  document.addEventListener('scroll', hide, true);
}

// ===== SETTINGS PANEL =====
function openSettings() {
  const alreadyImported = S.workspaces.some(w => w.name === 'Chrome Bookmarks');
  el('importChromeBookmarksBtn').closest('.settings-section').style.display = alreadyImported ? 'none' : '';
  // Populate current values
  el('settingsName').value = S.user.name || '';
  el('darkThemeBtn').classList.toggle('active', S.settings.theme==='dark');
  el('lightThemeBtn').classList.toggle('active', S.settings.theme==='light');
  el('clock12Btn').classList.toggle('active', S.settings.clockFormat==='12');
  el('clock24Btn').classList.toggle('active', S.settings.clockFormat==='24');
  el('showSecondsToggle').checked = !!S.settings.showSeconds;
  el('widgetNotesToggle').checked = S.settings.widgets.notes !== false;
  el('widgetTasksToggle').checked = S.settings.widgets.tasks !== false;
  el('widgetQuoteToggle').checked = S.settings.widgets.quote !== false;
  el('widgetTimerToggle').checked = S.settings.widgets.timer !== false;
  // Highlight active card glow
  document.querySelectorAll('#cardGlowGroup .toggle-opt').forEach(b => {
    b.classList.toggle('active', b.dataset.glow === (S.settings.cardGlow || 'glow'));
  });
  // Highlight active accent
  document.querySelectorAll('#accentColors .color-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === S.settings.accentColor);
  });
  document.querySelectorAll('#avatarColors .color-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === (S.user.avatarColor||'#7c3aed'));
  });
  if (el('widgetWeatherToggle')) el('widgetWeatherToggle').checked = S.settings.widgets.weather !== false;
  document.querySelectorAll('#tempUnitGroup .toggle-opt').forEach(b => b.classList.toggle('active', b.dataset.unit === S.settings.tempUnit));
  document.querySelectorAll('#faviconSourceGroup .toggle-opt').forEach(b => b.classList.toggle('active', b.dataset.src === S.settings.faviconSource));
  el('settingsPanel').classList.add('open');
  el('settingsOverlay').classList.add('open');
  el('settingsPanel').setAttribute('aria-hidden', 'false');
  setTimeout(() => el('settingsName')?.focus({ preventScroll: true }), 80);
  // Wallpaper
  const wp = S.settings.wallpaper || {};
  el('wallpaperToggle').checked = !!wp.enabled;
  el('wallpaperOptions').style.display = wp.enabled ? '' : 'none';
  document.querySelectorAll('#wallpaperIntervalGroup .toggle-opt').forEach(b => {
    b.classList.toggle('active', +b.dataset.interval === +(wp.interval || 5));
  });
  document.querySelectorAll('#wallpaperDimGroup .toggle-opt').forEach(b => {
    b.classList.toggle('active', +b.dataset.dim === +(wp.dim ?? 0.45));
  });
}
function closeSettings() {
  el('settingsPanel').classList.remove('open');
  el('settingsOverlay').classList.remove('open');
}
// Every setting applies the moment it changes, so "Done" only has to close the panel.
function saveSettings() { closeSettings(); }
function applyWallpaperFromPanel() {
  const prev = JSON.stringify(S.settings.wallpaper);
  const wp = S.settings.wallpaper = S.settings.wallpaper || {};
  wp.enabled = el('wallpaperToggle').checked;
  const i = document.querySelector('#wallpaperIntervalGroup .toggle-opt.active'); wp.interval = i ? +i.dataset.interval : 5;
  const d = document.querySelector('#wallpaperDimGroup .toggle-opt.active'); wp.dim = d ? +d.dataset.dim : 0.45;
  if (JSON.stringify(wp) !== prev) { initWallpaper(); save(); }
}
const PACK_MODE_LOCK = { 'jannat': 'dark', 'jannat-v2': 'light' };   // these two packs only exist in one mode
function applyTheme(theme) {
  S.settings.theme = theme === 'light' ? 'light' : 'dark';                       // the person's own choice
  const mode = PACK_MODE_LOCK[S.settings.pack] || S.settings.theme;               // what is actually shown
  document.documentElement.dataset.theme = mode;
  try { localStorage.setItem('__td_theme', mode); } catch (e) {}
  const icon = el('themeIcon'), label = el('themeLabel');
  if (mode === 'light') {
    if (icon) icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    if (label) label.textContent = 'Light';
  } else {
    if (icon) icon.innerHTML = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
    if (label) label.textContent = 'Dark';
  }
}
function applyAccent(color) {
  color = safeColor(color, '');
  if (!color) return;
  S.settings.accentColor = color;
  const hex = color.length === 4 ? '#' + [...color.slice(1)].map(c => c + c).join('') : color;
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const root = document.documentElement.style;
  root.setProperty('--accent', color);
  root.setProperty('--accent-rgb', rgb.join(','));
  root.setProperty('--accent-light', color + 'cc');
  root.setProperty('--accent-bg', color + '2e');
  root.setProperty('--accent-subtle', color + '14');
  root.setProperty('--accent-glow', color + '80');
  try { localStorage.setItem('__td_accent', color); } catch (e) {}
}
function applyPack(pack) {
  if (!KNOWN_PACKS.includes(pack)) pack = 'default';

  S.settings.pack = pack;
  document.documentElement.dataset.pack = pack;
  // The base stylesheet (css/themes/default.css) always loads; a pack's file goes in front of it, exactly as fouc.js does at start-up.
  let link = document.getElementById('theme-pack-css');
  const href = 'css/themes/' + pack + '.css';
  if (pack === 'default') { link?.remove(); }
  else {
    if (!link) { link = document.createElement('link'); link.rel = 'stylesheet'; link.id = 'theme-pack-css'; document.head.insertBefore(link, document.getElementById('base-css')); }
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  }
  try { localStorage.setItem('__td_pack', pack); } catch(e) {}
  // Re-apply mode + accent so the new pack inherits current state.
  applyTheme(S.settings.theme || 'dark');
  if (pack === 'brutal') {
    // Brutal owns its accent — strip inline overrides so the pack's CSS wins.
    ['--accent','--accent-light','--accent-bg','--accent-subtle','--accent-glow'].forEach(p => {
      document.documentElement.style.removeProperty(p);
    });
  } else {
    applyAccent(S.settings.accentColor || '#7c3aed');
  }
  // Mono has no glow — force off regardless of stored setting.
  applyCardGlow(pack === 'mono' ? 'off' : (S.settings.cardGlow || 'glow'));
  if (pack === 'jannat' || pack === 'jannat-v2') setTimeout(initJannatDesign, 400);
  document.querySelectorAll('#packPicker .pack-card').forEach(b => b.setAttribute('aria-pressed', b.dataset.pack === pack ? 'true' : 'false'));
  // Update picker UI active state.
  document.querySelectorAll('#packPicker .pack-card').forEach(b => {
    b.classList.toggle('active', b.dataset.pack === pack);
  });
  // Light/dark: the two Jannat packs only exist in one mode, so the switch is disabled for them.
  const modeLock = PACK_MODE_LOCK[pack];
  ['themeBtn', 'darkThemeBtn', 'lightThemeBtn'].forEach(id => {
    const b = el(id);
    if (!b) return;
    b.disabled = !!modeLock;
    b.classList.toggle('is-locked', !!modeLock);
    b.title = modeLock ? `This theme only comes in ${modeLock} mode` : '';
  });
  // Lock pack-incompatible settings.
  const accentLocked = pack === 'brutal';
  const glowLocked = pack === 'mono';
  const accentRow = document.getElementById('accentColorRow');
  if (accentRow) {
    accentRow.classList.toggle('row-locked', accentLocked);
    const msg = accentRow.querySelector('.settings-row-locked-msg');
    if (msg) msg.style.display = accentLocked ? '' : 'none';
  }
  const glowRow = document.getElementById('cardGlowRow');
  if (glowRow) {
    glowRow.classList.toggle('row-locked', glowLocked);
    const msg = glowRow.querySelector('.settings-row-locked-msg');
    if (msg) msg.style.display = glowLocked ? '' : 'none';
  }
}
function applyCardGlow(mode) {
  document.documentElement.dataset.cardGlow = mode || 'glow';
}

// ===== WALLPAPER SLIDESHOW =====
// Curated pool of high-quality Picsum photo IDs
const WP_IDS = [
  10, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 27, 28, 29, 31, 32, 36,
  39, 40, 42, 43, 44, 45, 48, 50, 52, 56, 57, 60, 64, 65, 66, 67, 72, 73,
  74, 75, 76, 78, 80, 83, 85, 86, 87, 90, 91, 96, 100, 101, 103, 106, 107,
  110, 112, 113, 114, 119, 120, 122, 124, 125, 126, 128, 130, 132, 136, 137,
  139, 140, 141, 142, 145, 146, 147, 149, 150, 152, 155, 157, 160, 163, 164,
  166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180
];
let _wpTimer      = null;
let _wpActiveLayer = 1;
let _wpIdxPointer  = 0;

function _wpNextUrl() {
  const id = WP_IDS[_wpIdxPointer % WP_IDS.length];
  _wpIdxPointer++;
  return `https://picsum.photos/id/${id}/1920/1080`;
}

let _wpRetries = 0;
const _WP_MAX_RETRIES = 5;

function _wpLoadNext() {
  const url = _wpNextUrl();
  const nextLayerNum = _wpActiveLayer === 1 ? 2 : 1;
  const nextEl       = document.getElementById('bgLayer' + nextLayerNum);
  const currentEl    = document.getElementById('bgLayer' + _wpActiveLayer);
  if (!nextEl || !currentEl) return;

  const img = new Image();
  img.onload = () => {
    _wpRetries = 0; // reset on success
    nextEl.style.backgroundImage = `url("${url}")`;
    // Let browser paint the new background before fading in
    requestAnimationFrame(() => {
      nextEl.style.opacity = '1';
      // Start fading out the old layer slightly after new one starts appearing
      setTimeout(() => {
        currentEl.style.opacity = '0';
        _wpActiveLayer = nextLayerNum;
      }, 300);
    });
  };
  img.onerror = () => {
    _wpIdxPointer++;
    if (++_wpRetries < _WP_MAX_RETRIES) _wpLoadNext(); // skip bad IDs, give up after 5
    else _wpRetries = 0; // exhausted retries, wait for next scheduled rotation
  };
  img.src = url;
}

function initWallpaper() {
  if (_wpTimer) { clearInterval(_wpTimer); _wpTimer = null; }
  const wp = S.settings.wallpaper || {};

  if (!wp.enabled) {
    document.body.classList.remove('has-wallpaper');
    // Reset layers so they don't flash on re-enable
    ['bgLayer1','bgLayer2'].forEach(id => {
      const el2 = document.getElementById(id);
      if (el2) el2.style.opacity = '0';
    });
    _wpActiveLayer = 1;
    return;
  }

  document.body.classList.add('has-wallpaper');

  // Apply dim overlay
  const dimEl = document.getElementById('bgDim');
  if (dimEl) dimEl.style.background = `rgba(0,0,0,${wp.dim ?? 0.45})`;

  // Shuffle starting position so every session starts with a different image
  _wpIdxPointer = Math.floor(Math.random() * WP_IDS.length);

  // Load first image immediately
  _wpLoadNext();

  // Schedule rotations
  const ms = (wp.interval || 5) * 60 * 1000;
  _wpTimer = setInterval(_wpLoadNext, ms);
}

// ===== JANNAT DESIGN ENGINE =====
function syncJannatWeather() {
  const icon = el('weatherIcon')?.textContent || '⛅';
  const temp = el('weatherTemp')?.textContent || '--°C';
  const desc = el('weatherDesc')?.textContent || '';
  const city = el('weatherCity')?.textContent || 'Detecting...';
  const jIcon = el('jdWcIcon'); if (jIcon) jIcon.textContent = icon;
  const jTemp = el('jdWcTemp'); if (jTemp) jTemp.textContent = temp;
  const jDesc = el('jdWcDesc'); if (jDesc) jDesc.textContent = desc;
  const jCity = el('jdWcCity');
  if (jCity) jCity.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg> ${escH(city)}`;
}

function syncJannatQuote() {
  const text   = el('quoteText')?.textContent   || '';
  const author = el('quoteAuthor')?.textContent || '—';
  const jText   = el('jdQcText');   if (jText)   jText.textContent = text;
  const jAuthor = el('jdQcAuthor'); if (jAuthor) jAuthor.textContent = author;
}

function _jdTimeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000)    return 'just now';
  if (diff < 3600000)  return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
  return `${Math.floor(diff/86400000)}d ago`;
}

async function renderJannatRecentlyUsed() {
  const list = el('jdRuList');
  if (!list) return;
  let clearedAt = 0; try { clearedAt = Number(localStorage.getItem('__td_ru_cleared') || 0); } catch (e) {}
  const items = [];
  (S.wsData[S.activeWsId]?.notes || []).slice().sort((a, b) => (b.updatedAt || b.date || 0) - (a.updatedAt || a.date || 0)).slice(0, 3).forEach(n => {
    items.push({ type: 'note', label: 'Note', name: n.title || (n.content || '').split('\n')[0] || 'Untitled note', id: n.id, time: n.updatedAt || n.date || 0 });
  });
  if (IS_CHROME && chrome.history) {
    try {
      const hist = await new Promise(r => chrome.history.search({ text: '', maxResults: 10, startTime: Date.now() - 7 * 24 * 3600 * 1000 }, r));
      (hist || []).forEach(h => {
        if (!h.url || h.url.startsWith('chrome://')) return;
        items.push({ type: 'link', label: 'Visited', name: h.title || getDomain(h.url), url: h.url, favicon: favSrc(h.url), time: h.lastVisitTime || 0 });
      });
    } catch (_) {}
  }
  const top = items.filter(i => i.time > clearedAt).sort((a, b) => b.time - a.time).slice(0, 8);
  if (!top.length) { list.innerHTML = '<div class="jd-ru-loading">Nothing recently used.</div>'; return; }
  list.innerHTML = top.map(item => {
    const iconHtml = item.type === 'note'
      ? '<div class="jd-ru-icon">📝</div>'
      : `<div class="jd-ru-icon"><img src="${escH(item.favicon)}" alt="" data-fb="text" data-fb-text="🔗"></div>`;
    const attrs = item.url ? ` href="${escH(item.url)}"` : ` role="button" tabindex="0" data-nid="${item.id}"`;
    const tag = item.url ? 'a' : 'div';
    return `<${tag} class="jd-ru-item"${attrs}>${iconHtml}<div class="jd-ru-info"><div class="jd-ru-name">${escH(item.name)}</div><div class="jd-ru-meta">${escH(item.label)} · ${escH(_jdTimeAgo(item.time))}</div></div></${tag}>`;
  }).join('');
  list.querySelectorAll('[data-nid]').forEach(n => n.addEventListener('click', () => openNoteEdit(Number(n.dataset.nid))));
}

let _jdBound = false;
function renderJannatChips() {
  const wrap = el('jdChips');
  if (!wrap) return;
  wrap.innerHTML = wsQA().slice(0, 4).map(q => `<a class="jd-chip" href="${escH(q.url)}"><img src="${favSrc(q.url)}" width="14" height="14" alt="" data-fb="hide"> ${escH(q.name)}</a>`).join('') +
    '<button type="button" class="jd-chip jd-chip-add" id="jdAddChipBtn">+ Add new</button>';
  el('jdAddChipBtn').addEventListener('click', () => openQAEditModal(null));
}
function updateJannatProfile() {
  const nameEl = el('jdUpName');
  if (!nameEl) return;
  const name = S.user.name || 'there';
  nameEl.textContent = name;
  const av = el('jdUpAvatar'); if (av) av.textContent = ([...name][0] || 'U').toUpperCase();
  const badge = el('jdUpBadge'), ws = S.workspaces.find(w => w.id === S.activeWsId);
  if (badge && ws) badge.textContent = `${ws.icon} ${ws.name}`;
}
function initJannatDesign() {
  const pack = S.settings.pack;
  if (pack !== 'jannat' && pack !== 'jannat-v2') return;
  setTimeout(() => { syncJannatWeather(); syncJannatQuote(); }, 900);
  renderJannatRecentlyUsed(); renderJannatChips(); updateJannatProfile();
  if (_jdBound) return;   // the handlers below are attached once, however often the theme is re-applied
  _jdBound = true;
  el('jdCsInput')?.addEventListener('focus', e => { openCmdPalette(); e.target.blur(); });
  el('jdCsBtn')?.addEventListener('click', () => openCmdPalette());
  el('jdQaNote')?.addEventListener('click', () => openNoteNew());
  el('jdQaBm')?.addEventListener('click', () => openWsBookmarkEditModal(null, null, null));
  el('jdQaDl')?.addEventListener('click', () => navigateTo('downloads'));
  el('jdRuClear')?.addEventListener('click', () => {
    try { localStorage.setItem('__td_ru_cleared', String(Date.now())); } catch (e) {}
    renderJannatRecentlyUsed();
    showToast('Recently used cleared', 'success');
  });
}
function applyWidgetVisibility() {
  const w = S.settings.widgets;
  const show = (id, visible) => {
    const el2 = document.getElementById(id);
    if (el2) el2.style.display = visible === false ? 'none' : '';
  };
  show('widget-notes', w.notes);
  show('widget-tasks', w.tasks);
  show('widget-quote', w.quote);
  show('widget-timer', w.timer);
  show('weatherWidget', w.weather);
}

// Export / Import
function exportData() {
  const payload = { app: 'TabDeck', version: 3, exportedAt: new Date().toISOString(), user: S.user, workspaces: S.workspaces, wsData: S.wsData, settings: S.settings, trash: S.trash };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tabdeck-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  showToast('Backup downloaded', 'success');
}

// Checks a backup file and rebuilds it with only the fields TabDeck understands.
function sanitizeBackup(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'That file isn’t a TabDeck backup.' };
  if (!Array.isArray(d.workspaces) || !d.workspaces.length || !d.wsData || typeof d.wsData !== 'object') return { ok: false, error: 'That file isn’t a TabDeck backup (no workspaces found).' };
  const str = (v, max) => (typeof v === 'string' ? v : (v == null ? '' : String(v))).slice(0, max);
  const arr = v => Array.isArray(v) ? v : [];
  const seen = new Set();
  const workspaces = [];
  d.workspaces.forEach(w => {
    const id = Number(w && w.id);
    if (!w || !Number.isFinite(id) || seen.has(id)) return;
    seen.add(id);
    workspaces.push({ id, name: str(w.name, 60) || 'Workspace', icon: cleanIcon(w.icon) });
  });
  if (!workspaces.length) return { ok: false, error: 'That backup has no usable workspaces.' };
  const sum = { workspaces: workspaces.length, notes: 0, tasks: 0, bookmarks: 0 };
  const wsData = {};
  workspaces.forEach(w => {
    const src = d.wsData[w.id] || {};
    const folders = arr(src.folders).filter(f => f && f.id != null && f.name).map(f => ({ id: str(f.id, 80), name: str(f.name, 120), parentId: f.parentId == null ? null : str(f.parentId, 80) }));
    const bms = arr(src.importedBookmarks).filter(b => b && b.id != null && isSafeLink(b.url)).map(b => {
      const o = { id: str(b.id, 80), title: str(b.title, 300) || str(b.url, 300), url: str(b.url, 2048) };
      if (b.folderId != null) o.folderId = str(b.folderId, 80);
      if (b.folderName) o.folderName = str(b.folderName, 120);
      if (Number.isFinite(Number(b.date))) o.date = Number(b.date);
      return o;
    });
    const qa = arr(src.quickAccess).filter(q => q && q.id != null && q.name && isSafeLink(q.url)).slice(0, QA_MAX).map(q => ({ id: Number(q.id) || nid(), name: str(q.name, 80), url: str(q.url, 2048) }));
    const notes = arr(src.notes).filter(n => n && (n.title || n.content)).map(n => ({ id: Number(n.id) || nid(), title: str(n.title, 300), content: str(n.content, 200000), date: Number(n.date) || Date.now(), updatedAt: Number(n.updatedAt) || Number(n.date) || Date.now(), tags: arr(n.tags).map(x => str(x, 20)).filter(Boolean).slice(0, 20), pinned: !!n.pinned }));
    const tasks = arr(src.tasks).filter(x => x && x.text).map(x => ({ id: Number(x.id) || nid(), text: str(x.text, 200), done: !!x.done }));
    wsData[w.id] = { quickAccess: qa, notes, tasks, importedBookmarks: bms, folders };
    sum.notes += notes.length; sum.tasks += tasks.length; sum.bookmarks += bms.length;
  });
  const u = (d.user && typeof d.user === 'object') ? d.user : {};
  const trash = arr(d.trash).filter(i => i && TRASH_TYPES[i._type]).slice(-TRASH_MAX);
  return { ok: true, summary: sum, data: { user: { name: str(u.name, 40) === 'User' ? '' : str(u.name, 40), avatarColor: safeColor(u.avatarColor) }, workspaces, wsData, settings: normalizeSettings(d.settings), trash } };
}
function _replaceAllData(data) {
  S.user = data.user; S.workspaces = data.workspaces; S.wsData = data.wsData; S.trash = data.trash; S.settings = data.settings;
  S.activeWsId = S.workspaces[0].id;
  normalizeLoadedState();
  applySettingsVisuals();
  initWallpaper();
  updateAvatarDisplay(); updateGreeting();
  save();
  renderAll();
}
function importData(file) {
  const reader = new FileReader();
  reader.onerror = () => showToast('Couldn’t read that file.', 'error');
  reader.onload = e => {
    let parsed;
    try { parsed = JSON.parse(e.target.result); } catch { showToast('That file isn’t a TabDeck backup (it isn’t valid JSON).', 'error'); return; }
    const res = sanitizeBackup(parsed);
    if (!res.ok) { showToast(res.error, 'error'); return; }
    const s = res.summary, when = parsed.exportedAt ? ` from ${new Date(parsed.exportedAt).toLocaleDateString()}` : '';
    confirm2('Replace your data with this backup?',
      `The backup${when} has ${s.workspaces} workspace${s.workspaces === 1 ? '' : 's'}, ${s.bookmarks} bookmarks, ${s.notes} notes and ${s.tasks} tasks. Everything you have now will be replaced. You’ll get an Undo button right after.`,
      () => {
        const before = snapshot();
        _replaceAllData(res.data);
        showToast('Backup restored', 'success', { action: 'Undo', duration: 12000, onAction: () => { _replaceAllData(before); showToast('Back to how it was', 'success'); } });
      }, null, { okLabel: 'Replace my data' });
  };
  reader.readAsText(file);
}

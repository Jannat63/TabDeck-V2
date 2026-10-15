'use strict';
// =============================================
//  TabDeck · Chrome API wrapper, shared helpers, default data, app state and saving
// =============================================

// ===== CHROME API WRAPPER =====
const IS_CHROME = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
const HAS_STORAGE = IS_CHROME && !!chrome.storage;

// Wrap a callback-style chrome.* call. Resolves with the result, or with `onErr`
// when Chrome reports a problem (chrome.runtime.lastError) so callers can react to it.
const _cb = (invoke, onErr = null) => new Promise(res => {
  try {
    invoke(v => {
      const e = chrome.runtime.lastError;
      if (e) { console.warn('[TabDeck]', e.message); res(onErr); } else res(v === undefined ? true : v);
    });
  } catch (e) { console.warn('[TabDeck]', e.message); res(onErr); }
});

// Storage fallback when the page is opened outside Chrome (development only)
const _ls = {
  get: keys => { const out = {}; (Array.isArray(keys) ? keys : [keys]).forEach(k => { try { const v = JSON.parse(localStorage.getItem('td_' + k)); if (v !== null) out[k] = v; } catch (e) {} }); return out; },
  set: data => Object.entries(data).forEach(([k, v]) => localStorage.setItem('td_' + k, JSON.stringify(v))),
};

const API = {
  getLocal: keys => HAS_STORAGE ? _cb(done => chrome.storage.local.get(keys, done), {}) : Promise.resolve(_ls.get(keys)),
  setLocal: data => HAS_STORAGE ? _cb(done => chrome.storage.local.set(data, done), false) : (_ls.set(data), Promise.resolve(true)),
  get: keys => HAS_STORAGE && chrome.storage.sync ? _cb(done => chrome.storage.sync.get(keys, done), {}) : Promise.resolve({}), // old versions only (one-time migration)
  bookmarks: () => IS_CHROME && chrome.bookmarks ? _cb(done => chrome.bookmarks.getTree(done), []).then(tr => tr || []) : Promise.resolve([]),
  history: (query = '') => IS_CHROME && chrome.history ? _cb(done => chrome.history.search({ text: query, maxResults: 100, startTime: Date.now() - 30 * 86400000 }, done), []) : Promise.resolve([]),
  downloads: () => IS_CHROME && chrome.downloads ? _cb(done => chrome.downloads.search({ limit: 50, orderBy: ['-startTime'] }, done), []) : Promise.resolve([]),
  createBookmark: details => IS_CHROME && chrome.bookmarks ? _cb(done => chrome.bookmarks.create(details, done)) : Promise.resolve(null),
  updateBookmark: (id, changes) => IS_CHROME && chrome.bookmarks ? _cb(done => chrome.bookmarks.update(id, changes, done)) : Promise.resolve(null),
  moveBookmark: (id, dest) => IS_CHROME && chrome.bookmarks ? _cb(done => chrome.bookmarks.move(id, dest, done)) : Promise.resolve(null),
  removeBookmark: id => IS_CHROME && chrome.bookmarks ? _cb(done => chrome.bookmarks.remove(id, done), false) : Promise.resolve(false),
  removeBookmarkTree: id => IS_CHROME && chrome.bookmarks ? _cb(done => chrome.bookmarks.removeTree(id, done), false) : Promise.resolve(false),
  deleteHistoryUrl: url => IS_CHROME && chrome.history ? _cb(done => chrome.history.deleteUrl({ url }, done), false) : Promise.resolve(false),
  deleteHistoryRange: (startTime, endTime) => IS_CHROME && chrome.history ? _cb(done => chrome.history.deleteRange({ startTime, endTime }, done), false) : Promise.resolve(false),
  showDownload: id => { if (IS_CHROME && chrome.downloads) chrome.downloads.show(id); },
};

// ===== SMALL SHARED HELPERS =====
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const safeColor = (c, fallback = '#7c3aed') => (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c)) ? c : fallback;
const cleanIcon = i => (typeof i === 'string' && i.trim()) ? i.trim().slice(0, 16) : '📁';

// Turns whatever the person typed into a safe address. Returns {ok, url} or {ok:false, error}.
function normalizeUrl(input) {
  const u = String(input || '').trim();
  if (!u) return { ok: false, error: 'Enter a web address.' };
  if (/\s/.test(u)) return { ok: false, error: 'Web addresses can’t contain spaces.' };
  const scheme = u.match(/^([a-z][a-z0-9+.-]*):/i);
  const looksLikePort = /^[a-z0-9.-]+:\d+(\/|$)/i.test(u);
  if (scheme && !looksLikePort) {
    const s = scheme[1].toLowerCase();
    if (!['http', 'https', 'chrome', 'chrome-extension', 'file', 'ftp', 'mailto', 'about', 'edge'].includes(s)) return { ok: false, error: '“' + s + ':” links aren’t supported.' };
    return { ok: true, url: u };
  }
  const isLocal = /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#]|$)/i.test(u);
  if (!isLocal && !/^[^./\s]+(\.[^./\s]+)+(:\d+)?([/?#]|$)/.test(u)) return { ok: false, error: 'That doesn’t look like a web address.' };
  return { ok: true, url: (isLocal ? 'http://' : 'https://') + u };
}
const isSafeLink = url => { try { return ['http:', 'https:', 'chrome:', 'chrome-extension:', 'file:', 'ftp:', 'mailto:', 'about:', 'edge:'].includes(new URL(url).protocol); } catch { return false; } };

// ---- deep copy / compare / three-way merge (used by the storage layer) ----
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false; return true; }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!(k in b) || !deepEqual(a[k], b[k])) return false;
  return true;
}
const _isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const _idKey = it => (it && typeof it === 'object' && (it._tid ?? it.id) != null) ? String(it._tid ?? it.id) : null;

// Merge two lists of items that each have an id.
function mergeIdArrays(base, local, remote) {
  if (![...base, ...local, ...remote].every(it => _idKey(it) !== null)) return local; // can't match items reliably
  const mapOf = a => { const m = new Map(); a.forEach(it => m.set(_idKey(it), it)); return m; };
  const B = mapOf(base), L = mapOf(local), R = mapOf(remote);
  const removedHere = new Set([...B.keys()].filter(k => !L.has(k)));
  const result = [];
  remote.forEach(r => {                       // start from the newest stored copy
    const k = _idKey(r);
    if (removedHere.has(k)) return;           // this tab deleted it
    result.push(L.has(k) && B.has(k) ? mergeValue(B.get(k), L.get(k), r) : r);
  });
  const present = new Set(result.map(_idKey));
  local.forEach((l, li) => {                  // items this tab added
    const k = _idKey(l);
    if (B.has(k) || present.has(k)) return;
    let at = -1;
    for (let j = li + 1; j < local.length && at === -1; j++) at = result.findIndex(x => _idKey(x) === _idKey(local[j]));
    if (at === -1) result.push(l); else result.splice(at, 0, l);
    present.add(k);
  });
  const hereOrder = local.map(_idKey).filter(k => B.has(k) && R.has(k));
  const baseOrder = base.map(_idKey).filter(k => L.has(k) && R.has(k));
  if (hereOrder.join('|') !== baseOrder.join('|')) {   // this tab re-ordered items
    const set = new Set(hereOrder), slots = [];
    result.forEach((x, i) => { if (set.has(_idKey(x))) slots.push(i); });
    const ordered = hereOrder.map(k => result.find(x => _idKey(x) === k));
    slots.forEach((pos, n) => { result[pos] = ordered[n]; });
  }
  return result;
}
// Three-way merge: `base` = what we last knew was stored, `local` = this tab now, `remote` = what is stored now.
function mergeValue(base, local, remote) {
  if (deepEqual(local, base)) return remote;                          // this tab didn't touch it
  if (deepEqual(remote, base) || deepEqual(local, remote)) return local; // only this tab changed it
  if (Array.isArray(local) && Array.isArray(remote) && Array.isArray(base)) return mergeIdArrays(base, local, remote);
  if (_isObj(local) && _isObj(remote)) {
    const b = _isObj(base) ? base : {}, out = {};
    new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(b)]).forEach(k => {
      const v = mergeValue(b[k], local[k], remote[k]);
      if (v !== undefined) out[k] = v;
    });
    return out;
  }
  return local;
}

// unique numeric ids for notes / tasks / quick-access links
const nid = (() => { let last = 0; return () => (last = Math.max(Date.now(), last + 1)); })();

const DEFAULT_WORKSPACES = [
  {id:1, name:'Home', icon:'🏠'},
  {id:2, name:'AI',   icon:'🤖'},
  {id:3, name:'Dev',  icon:'💻'},
];

const DEFAULT_WS_DATA = (id) => {
  if (id === 1) return {
    quickAccess: [
      {id:101,name:'Gmail',url:'https://mail.google.com'},
      {id:102,name:'YouTube',url:'https://youtube.com'},
      {id:103,name:'WhatsApp',url:'https://web.whatsapp.com'},
      {id:104,name:'Google Drive',url:'https://drive.google.com'},
      {id:105,name:'Google Maps',url:'https://maps.google.com'},
      {id:106,name:'Google',url:'https://google.com'},
    ],
    notes: [],
    tasks: [],
    folders: [
      {name:'Google'},
      {name:'Social Media'},
    ],
    importedBookmarks: [
      // Google Services
      {id:'ws1_001',title:'Google',url:'https://google.com',folderName:'Google'},
      {id:'ws1_002',title:'Gmail',url:'https://mail.google.com',folderName:'Google'},
      {id:'ws1_003',title:'YouTube',url:'https://youtube.com',folderName:'Google'},
      {id:'ws1_004',title:'Google Drive',url:'https://drive.google.com',folderName:'Google'},
      {id:'ws1_005',title:'Google Maps',url:'https://maps.google.com',folderName:'Google'},
      {id:'ws1_006',title:'Google Photos',url:'https://photos.google.com',folderName:'Google'},
      {id:'ws1_007',title:'Google Docs',url:'https://docs.google.com',folderName:'Google'},
      {id:'ws1_008',title:'Google Sheets',url:'https://sheets.google.com',folderName:'Google'},
      {id:'ws1_009',title:'Google Slides',url:'https://slides.google.com',folderName:'Google'},
      {id:'ws1_010',title:'Google Calendar',url:'https://calendar.google.com',folderName:'Google'},
      {id:'ws1_011',title:'Google Meet',url:'https://meet.google.com',folderName:'Google'},
      {id:'ws1_012',title:'Google Translate',url:'https://translate.google.com',folderName:'Google'},
      {id:'ws1_013',title:'Google News',url:'https://news.google.com',folderName:'Google'},
      {id:'ws1_014',title:'Google Forms',url:'https://forms.google.com',folderName:'Google'},
      // Social Media
      {id:'ws1_101',title:'Facebook',url:'https://facebook.com',folderName:'Social Media'},
      {id:'ws1_102',title:'X (Twitter)',url:'https://x.com',folderName:'Social Media'},
      {id:'ws1_103',title:'Instagram',url:'https://instagram.com',folderName:'Social Media'},
      {id:'ws1_104',title:'LinkedIn',url:'https://linkedin.com',folderName:'Social Media'},
      {id:'ws1_105',title:'Reddit',url:'https://reddit.com',folderName:'Social Media'},
      {id:'ws1_106',title:'TikTok',url:'https://tiktok.com',folderName:'Social Media'},
      {id:'ws1_107',title:'Pinterest',url:'https://pinterest.com',folderName:'Social Media'},
      {id:'ws1_108',title:'WhatsApp Web',url:'https://web.whatsapp.com',folderName:'Social Media'},
      {id:'ws1_109',title:'Telegram Web',url:'https://web.telegram.org',folderName:'Social Media'},
      {id:'ws1_110',title:'Discord',url:'https://discord.com',folderName:'Social Media'},
      {id:'ws1_111',title:'Snapchat',url:'https://snapchat.com',folderName:'Social Media'},
      {id:'ws1_112',title:'Threads',url:'https://threads.net',folderName:'Social Media'},
    ],
  };
  if (id === 2) return {
    quickAccess: [
      {id:201,name:'ChatGPT',url:'https://chat.openai.com'},
      {id:202,name:'Claude',url:'https://claude.ai'},
      {id:203,name:'Gemini',url:'https://gemini.google.com'},
      {id:204,name:'Perplexity',url:'https://perplexity.ai'},
      {id:205,name:'Copilot',url:'https://copilot.microsoft.com'},
      {id:206,name:'Hugging Face',url:'https://huggingface.co'},
    ],
    notes: [],
    tasks: [],
    folders: [
      {name:'AI Chatbots'},
      {name:'AI Image & Video'},
      {name:'AI Audio'},
      {name:'AI Dev Tools'},
    ],
    importedBookmarks: [
      // AI Chatbots
      {id:'ws2_001',title:'ChatGPT',url:'https://chat.openai.com',folderName:'AI Chatbots'},
      {id:'ws2_002',title:'Claude',url:'https://claude.ai',folderName:'AI Chatbots'},
      {id:'ws2_003',title:'Gemini',url:'https://gemini.google.com',folderName:'AI Chatbots'},
      {id:'ws2_004',title:'Perplexity',url:'https://perplexity.ai',folderName:'AI Chatbots'},
      {id:'ws2_005',title:'Microsoft Copilot',url:'https://copilot.microsoft.com',folderName:'AI Chatbots'},
      {id:'ws2_006',title:'Grok',url:'https://grok.com',folderName:'AI Chatbots'},
      {id:'ws2_007',title:'DeepSeek',url:'https://chat.deepseek.com',folderName:'AI Chatbots'},
      {id:'ws2_008',title:'Mistral Le Chat',url:'https://chat.mistral.ai',folderName:'AI Chatbots'},
      {id:'ws2_009',title:'Meta AI',url:'https://meta.ai',folderName:'AI Chatbots'},
      // AI Image & Video
      {id:'ws2_101',title:'Midjourney',url:'https://midjourney.com',folderName:'AI Image & Video'},
      {id:'ws2_102',title:'DALL-E (ChatGPT)',url:'https://chat.openai.com',folderName:'AI Image & Video'},
      {id:'ws2_103',title:'Stable Diffusion',url:'https://stability.ai',folderName:'AI Image & Video'},
      {id:'ws2_104',title:'Runway',url:'https://runwayml.com',folderName:'AI Image & Video'},
      {id:'ws2_105',title:'Leonardo AI',url:'https://leonardo.ai',folderName:'AI Image & Video'},
      {id:'ws2_106',title:'Adobe Firefly',url:'https://firefly.adobe.com',folderName:'AI Image & Video'},
      {id:'ws2_107',title:'Ideogram',url:'https://ideogram.ai',folderName:'AI Image & Video'},
      {id:'ws2_108',title:'Kling AI',url:'https://klingai.com',folderName:'AI Image & Video'},
      // AI Audio
      {id:'ws2_201',title:'ElevenLabs',url:'https://elevenlabs.io',folderName:'AI Audio'},
      {id:'ws2_202',title:'Suno',url:'https://suno.com',folderName:'AI Audio'},
      {id:'ws2_203',title:'Udio',url:'https://udio.com',folderName:'AI Audio'},
      {id:'ws2_204',title:'Murf AI',url:'https://murf.ai',folderName:'AI Audio'},
      {id:'ws2_205',title:'Descript',url:'https://descript.com',folderName:'AI Audio'},
      // AI Dev Tools
      {id:'ws2_301',title:'Cursor',url:'https://cursor.com',folderName:'AI Dev Tools'},
      {id:'ws2_302',title:'GitHub Copilot',url:'https://github.com/features/copilot',folderName:'AI Dev Tools'},
      {id:'ws2_303',title:'Codeium',url:'https://codeium.com',folderName:'AI Dev Tools'},
      {id:'ws2_304',title:'Windsurf',url:'https://codeium.com/windsurf',folderName:'AI Dev Tools'},
      {id:'ws2_305',title:'Replit AI',url:'https://replit.com',folderName:'AI Dev Tools'},
      {id:'ws2_306',title:'v0 by Vercel',url:'https://v0.dev',folderName:'AI Dev Tools'},
      {id:'ws2_307',title:'Hugging Face',url:'https://huggingface.co',folderName:'AI Dev Tools'},
    ],
  };
  if (id === 3) return {
    quickAccess: [
      {id:301,name:'GitHub',url:'https://github.com'},
      {id:302,name:'Stack Overflow',url:'https://stackoverflow.com'},
      {id:303,name:'MDN Docs',url:'https://developer.mozilla.org'},
      {id:304,name:'Vercel',url:'https://vercel.com'},
      {id:305,name:'Figma',url:'https://figma.com'},
      {id:306,name:'DevDocs',url:'https://devdocs.io'},
    ],
    notes: [],
    tasks: [],
    folders: [
      {name:'Code & Repos'},
      {name:'Docs & Reference'},
      {name:'Dev Platforms'},
      {name:'Design'},
    ],
    importedBookmarks: [
      // Code & Repos
      {id:'ws3_001',title:'GitHub',url:'https://github.com',folderName:'Code & Repos'},
      {id:'ws3_002',title:'GitLab',url:'https://gitlab.com',folderName:'Code & Repos'},
      {id:'ws3_003',title:'Bitbucket',url:'https://bitbucket.org',folderName:'Code & Repos'},
      {id:'ws3_004',title:'CodePen',url:'https://codepen.io',folderName:'Code & Repos'},
      {id:'ws3_005',title:'StackBlitz',url:'https://stackblitz.com',folderName:'Code & Repos'},
      {id:'ws3_006',title:'Replit',url:'https://replit.com',folderName:'Code & Repos'},
      {id:'ws3_007',title:'JSFiddle',url:'https://jsfiddle.net',folderName:'Code & Repos'},
      {id:'ws3_008',title:'npm',url:'https://npmjs.com',folderName:'Code & Repos'},
      // Docs & Reference
      {id:'ws3_101',title:'MDN Web Docs',url:'https://developer.mozilla.org',folderName:'Docs & Reference'},
      {id:'ws3_102',title:'DevDocs',url:'https://devdocs.io',folderName:'Docs & Reference'},
      {id:'ws3_103',title:'Stack Overflow',url:'https://stackoverflow.com',folderName:'Docs & Reference'},
      {id:'ws3_104',title:'W3Schools',url:'https://w3schools.com',folderName:'Docs & Reference'},
      {id:'ws3_105',title:'Can I Use',url:'https://caniuse.com',folderName:'Docs & Reference'},
      {id:'ws3_106',title:'CSS-Tricks',url:'https://css-tricks.com',folderName:'Docs & Reference'},
      {id:'ws3_107',title:'web.dev',url:'https://web.dev',folderName:'Docs & Reference'},
      // Dev Platforms
      {id:'ws3_201',title:'Vercel',url:'https://vercel.com',folderName:'Dev Platforms'},
      {id:'ws3_202',title:'Netlify',url:'https://netlify.com',folderName:'Dev Platforms'},
      {id:'ws3_203',title:'Railway',url:'https://railway.app',folderName:'Dev Platforms'},
      {id:'ws3_204',title:'Supabase',url:'https://supabase.com',folderName:'Dev Platforms'},
      {id:'ws3_205',title:'Firebase',url:'https://firebase.google.com',folderName:'Dev Platforms'},
      {id:'ws3_206',title:'Render',url:'https://render.com',folderName:'Dev Platforms'},
      {id:'ws3_207',title:'Cloudflare',url:'https://cloudflare.com',folderName:'Dev Platforms'},
      {id:'ws3_208',title:'Postman',url:'https://postman.com',folderName:'Dev Platforms'},
      // Design
      {id:'ws3_301',title:'Figma',url:'https://figma.com',folderName:'Design'},
      {id:'ws3_302',title:'Dribbble',url:'https://dribbble.com',folderName:'Design'},
      {id:'ws3_303',title:'Behance',url:'https://behance.net',folderName:'Design'},
      {id:'ws3_304',title:'Tailwind CSS',url:'https://tailwindcss.com',folderName:'Design'},
      {id:'ws3_305',title:'Google Fonts',url:'https://fonts.google.com',folderName:'Design'},
      {id:'ws3_306',title:'Font Awesome',url:'https://fontawesome.com',folderName:'Design'},
      {id:'ws3_307',title:'Coolors',url:'https://coolors.co',folderName:'Design'},
      {id:'ws3_308',title:'Lucide Icons',url:'https://lucide.dev',folderName:'Design'},
    ],
  };
  return { quickAccess: [], notes: [], tasks: [], importedBookmarks: [], folders: [] };
};



// ===== STATE =====
const STATE_KEYS = ['user', 'workspaces', 'activeWsId', 'trash', 'settings', 'weatherLocation', 'wsData'];
const DEFAULT_SETTINGS = {
  pack: 'default', theme: 'dark', accentColor: '#7c3aed',
  clockFormat: '12', showSeconds: true, cardGlow: 'glow',
  widgets: { notes: true, tasks: true, quote: true, timer: true, weather: true },
  gridView: false, sidebarCollapsed: false,
  wallpaper: { enabled: false, interval: 5, dim: 0.45 },
  tempUnit: 'C',
  faviconSource: 'google',   // 'google' = sharper icons (sends site addresses to Google) · 'chrome' = icons Chrome already has (private)
};
const KNOWN_PACKS = ['default', 'mono', 'brutal', 'atelier', 'holodeck', 'aurora', 'ember', 'sakura', 'obsidian', 'aura', 'jannat', 'jannat-v2'];
function normalizeSettings(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const s = { ...DEFAULT_SETTINGS, ...r,
    widgets: { ...DEFAULT_SETTINGS.widgets, ...(r.widgets || {}) },
    wallpaper: { ...DEFAULT_SETTINGS.wallpaper, ...(r.wallpaper || {}) } };
  if (!KNOWN_PACKS.includes(s.pack)) s.pack = 'default';
  if (s.theme !== 'light') s.theme = 'dark';
  s.accentColor = safeColor(s.accentColor);
  if (s.tempUnit !== 'F') s.tempUnit = 'C';
  if (s.faviconSource !== 'chrome') s.faviconSource = 'google';
  return s;
}
let S = {
  user:          { name: '', avatarColor: '#7c3aed' },
  workspaces:    [],
  activeWsId:    1,
  wsData:        {},   // {[wsId]: {quickAccess,notes,tasks,importedBookmarks,folders}}
  trash:         [],
  settings:      normalizeSettings(),
  allBookmarks:  [],   // parsed flat array of Chrome bookmark folders
  editingNoteId: null,
  notesViewSearch: '',
  notesViewTagFilter: null,
  bmFolderFilter: null,
  bmSort: 'az',
  bmSource: 'workspace',   // Bookmarks page: 'workspace' | 'chrome'
  weatherLocation: null,   // null = detect automatically, string = place typed by the person
  firstRun: false,
};

// ===== PERSIST =====
// Everything lives in chrome.storage.local. Several tabs (and the toolbar popup) can write at the same time,
// so every save is a three-way merge: what this tab changed is applied on top of whatever is stored now.
let S0 = {};   // last copy we know is in storage (the merge base)
const _stripTab = o => { const c = { ...o }; delete c.activeWsId; return c; };   // which workspace is open is per-tab
const withLock = fn => (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) ? navigator.locks.request('tabdeck-storage', fn) : fn();
const snapshot = () => clone({ user: S.user, workspaces: S.workspaces, activeWsId: S.activeWsId, trash: S.trash, settings: S.settings, weatherLocation: S.weatherLocation, wsData: S.wsData });
const mergeStates = (base, local, remote) => {
  const merged = {};
  STATE_KEYS.forEach(k => { const v = mergeValue(base[k], local[k], remote[k]); if (v !== undefined) merged[k] = v; });
  merged.activeWsId = local.activeWsId;
  return merged;
};
const newTid = () => uid('t_');

// Shared clean-up used after loading from storage and after merging in changes from another tab.
function normalizeLoadedState() {
  S.workspaces = (Array.isArray(S.workspaces) ? S.workspaces : []).map(w => ({ ...w, id: Number(w.id), name: String(w.name ?? 'Workspace'), icon: cleanIcon(w.icon) }));
  if (!S.workspaces.length) S.workspaces = clone(DEFAULT_WORKSPACES);
  S.trash = (Array.isArray(S.trash) ? S.trash : []).filter(Boolean);
  S.trash.forEach(it => { if (!it._tid) it._tid = newTid(); });
  purgeOldTrash();
  S.wsData = (S.wsData && typeof S.wsData === 'object') ? S.wsData : {};
  S.workspaces.forEach(ws => { if (!S.wsData[ws.id]) S.wsData[ws.id] = DEFAULT_WS_DATA(ws.id); });
  Object.values(S.wsData).forEach(d => { delete d._foldersMigrated; migrateWsFolders(d); });
  if (!S.workspaces.some(w => w.id === S.activeWsId)) S.activeWsId = S.workspaces[0].id;
}
function applySettingsVisuals() {
  applyPack(S.settings.pack);
  applyAccent(S.settings.accentColor);
  applyTheme(S.settings.theme);
  applyCardGlow(S.settings.cardGlow || 'glow');
  document.body.classList.toggle('grid-view-mode', !!S.settings.gridView);
  el('gridViewBtn')?.classList.toggle('active', !!S.settings.gridView);
  document.body.classList.toggle('sidebar-collapsed', !!S.settings.sidebarCollapsed);
  el('sidebarToggleBtn')?.classList.toggle('active', !!S.settings.sidebarCollapsed);
}
// Apply a merged state to this tab (used when another tab / the popup changed something).
function applyMerged(m) {
  S.user = { ...S.user, ...(m.user || {}) };
  S.workspaces = m.workspaces || S.workspaces;
  S.trash = m.trash || [];
  S.settings = normalizeSettings(m.settings);
  S.weatherLocation = m.weatherLocation ?? null;
  S.wsData = m.wsData || {};
  normalizeLoadedState();
  applySettingsVisuals();
  updateAvatarDisplay();
  updateGreeting();
  renderAll();
}

async function loadState() {
  let d = await API.getLocal(STATE_KEYS);
  if (!d.settings && IS_CHROME) {   // very old versions kept settings in synced storage: bring them over once
    const synced = await API.get(['user', 'workspaces', 'activeWsId', 'trash', 'settings', 'weatherLocation']);
    if (synced && synced.settings) d = { ...d, ...synced };
  }
  S0 = {}; STATE_KEYS.forEach(k => { if (d[k] !== undefined) S0[k] = clone(d[k]); });
  S.firstRun = !d.settings && !(Array.isArray(d.workspaces) && d.workspaces.length);
  const u = (d.user && typeof d.user === 'object') ? d.user : {};
  S.user = { name: (typeof u.name === 'string' && u.name !== 'User') ? u.name.slice(0, 40) : '', avatarColor: safeColor(u.avatarColor) };
  S.workspaces = Array.isArray(d.workspaces) && d.workspaces.length ? d.workspaces : clone(DEFAULT_WORKSPACES);
  S.activeWsId = d.activeWsId != null ? Number(d.activeWsId) : Number(S.workspaces[0].id);
  S.trash = d.trash;
  S.settings = normalizeSettings(d.settings);
  S.weatherLocation = d.weatherLocation || null;
  // older versions froze whatever place they auto-detected (4-decimal coordinates); automatic is better now, so let those go
  if (/^-?\d+\.\d{3,},-?\d+\.\d{3,}$/.test(S.weatherLocation || '')) S.weatherLocation = null;
  S.wsData = d.wsData;
  normalizeLoadedState();
  applySettingsVisuals();
  initWallpaper();
  if (S.settings.pack === 'jannat' || S.settings.pack === 'jannat-v2') setTimeout(initJannatDesign, 600);
  updateAvatarDisplay();
  // Persist first-run defaults and any clean-up/migration that changed the data.
  if (!deepEqual(_stripTab(snapshot()), _stripTab(S0))) save();
}

// ---- saving: debounced, merged with whatever is stored, serialised across tabs ----
const SAVE_DEBOUNCE_MS = 300;
let _saveTimer = null, _saveWaiters = [], _writing = Promise.resolve();

async function _mergeAndWrite() {
  const latest = await API.getLocal(STATE_KEYS);
  const remote = {}; STATE_KEYS.forEach(k => { if (latest[k] !== undefined) remote[k] = latest[k]; });
  const local = snapshot();
  const merged = mergeStates(S0, local, remote);
  const toWrite = {};
  STATE_KEYS.forEach(k => { if (merged[k] !== undefined && !deepEqual(merged[k], remote[k])) toWrite[k] = merged[k]; });
  if (Object.keys(toWrite).length) {
    const ok = await API.setLocal(toWrite);
    if (ok === false) { showToast('Couldn’t save — Chrome storage is full or unavailable.', 'error'); return; }
  }
  S0 = clone(merged);
  if (!deepEqual(_stripTab(merged), _stripTab(local))) applyMerged(merged);   // pulled in changes made elsewhere
}
function _persist() {
  const waiters = _saveWaiters; _saveWaiters = [];
  _writing = _writing.then(() => withLock(_mergeAndWrite)).catch(e => console.warn('[TabDeck] save failed', e)).then(() => waiters.forEach(r => r()));
  return _writing;
}
function save() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { _saveTimer = null; _persist(); }, SAVE_DEBOUNCE_MS);
  return new Promise(res => _saveWaiters.push(res));
}
function flushSave() {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; return _persist(); }
  return _writing;
}
// When the tab is closing there is no time for an async merge: write straight away (storage already holds S0).
function flushSaveNow() {
  if (!_saveTimer) return;
  clearTimeout(_saveTimer); _saveTimer = null;
  const local = snapshot(), toWrite = {};
  STATE_KEYS.forEach(k => { if (!deepEqual(local[k], S0[k])) toWrite[k] = local[k]; });
  if (Object.keys(toWrite).length && HAS_STORAGE) chrome.storage.local.set(toWrite);
  S0 = clone(local);
}
// Pick up changes made by other tabs and the popup right away.
function setupStorageSync() {
  if (!(HAS_STORAGE && chrome.storage.onChanged)) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const keys = STATE_KEYS.filter(k => k in changes);
    if (!keys.length || keys.every(k => deepEqual(changes[k].newValue ?? undefined, S0[k]))) return;   // our own write
    const remote = { ...S0 }; keys.forEach(k => { if (changes[k].newValue === undefined) delete remote[k]; else remote[k] = changes[k].newValue; });
    const local = snapshot();
    const merged = mergeStates(S0, local, remote);
    S0 = clone(remote);
    if (!deepEqual(_stripTab(merged), _stripTab(local))) applyMerged(merged);
  });
}

// ===== PAGE LIFECYCLE =====
window.addEventListener('pagehide', flushSaveNow);
window.addEventListener('beforeunload', flushSaveNow);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });

// Broken-image fallbacks. (Inline onerror="" attributes are blocked in extension pages, so images carry data-fb instead.)
document.addEventListener('error', e => {
  const img = e.target;
  if (!img || img.tagName !== 'IMG' || !img.dataset.fb) return;
  switch (img.dataset.fb) {
    case 'hide':      img.style.display = 'none'; break;
    case 'invisible': img.style.visibility = 'hidden'; break;
    case 'fade':      img.style.opacity = 0; break;
    case 'remove':    img.remove(); break;
    case 'card':      img.style.display = 'none'; img.parentNode?.classList.add('bm-icon-fallback'); break;
    case 'next':      img.style.display = 'none'; if (img.nextElementSibling) img.nextElementSibling.style.display = 'block'; break;
    case 'text':      if (img.parentNode) img.parentNode.textContent = img.dataset.fbText || ''; break;
  }
}, true);

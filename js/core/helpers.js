'use strict';
// =============================================
//  TabDeck · Small UI helpers and folder helpers
// =============================================

// ===== HELPERS =====
const el = id => document.getElementById(id);
const escH = s => (s === null || s === undefined) ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const getDomain = url => { try { return new URL(url).hostname.replace(/^www\./,''); } catch { return url; }};
const fmtTimeAgo = ms => {
  const d = Date.now()-ms, m = Math.floor(d/60000);
  if (m<1) return 'just now'; if (m<60) return m+'m ago';
  const h = Math.floor(m/60); if (h<24) return h+'h ago';
  return Math.floor(h/24)+'d ago';
};
const fmtBytes = b => { if(!b) return '0 B'; const k=1024, s=['B','KB','MB','GB']; const i=Math.floor(Math.log(b)/Math.log(k)); return (b/Math.pow(k,i)).toFixed(1)+' '+s[i]; };
const fileIcon = e => ({pdf:'📄',zip:'📦',rar:'📦',jpg:'🖼️',jpeg:'🖼️',png:'🖼️',gif:'🖼️',webp:'🖼️',mp4:'🎬',mkv:'🎬',mp3:'🎵',wav:'🎵',doc:'📝',docx:'📝',txt:'📝',xls:'📊',xlsx:'📊',csv:'📊',exe:'⚙️',dmg:'⚙️',js:'💻',ts:'💻',py:'💻',html:'💻',css:'💻'}[e]||'📁');
function debounce(fn,d){let t; return (...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),d);}}
const _favCache = new Map();
function favSrc(url, opts = {}) {
  if (!url) return '';
  const local = !!opts.local || S.settings.faviconSource === 'chrome';
  const key = (local ? 'L|' : 'G|') + url;
  const cached = _favCache.get(key);
  if (cached !== undefined) return cached;
  let out = '';
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      if (local) {
        // Chrome's own icon cache: nothing leaves the browser.
        out = HAS_STORAGE && chrome.runtime.getURL ? `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(url)}&size=64` : '';
      } else {
        out = `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(u.origin)}&size=64`;
      }
    }
  } catch { out = ''; }
  _favCache.set(key, out);
  return out;
}
// Common attrs for every favicon <img> — keeps the browser from blocking decode on render.
const FAV_ATTRS = 'loading="lazy" decoding="async"';

// Workspace edit state
let _editingWsId = null;

// Bookmark/folder edit state (Chrome native bookmarks)
let _bmEditId = null;
let _bmEditParentId = null;
let _folderEditId = null;
let _folderParentId = '1';
let _openFolderId = null;

// Workspace bookmark/folder edit state
let _wsFolderEditName = null;
let _wsBmEditId = null;
let _wsBmDefaultFolder = null;
let _wsBmFolderValue = null;  // currently selected value in custom folder dropdown
let _qaEditId = null;

// Current workspace data helpers
const _migratedData = new WeakSet();

function wsData() {
  const d = S.wsData[S.activeWsId] || (S.wsData[S.activeWsId] = { quickAccess: [], notes: [], tasks: [], importedBookmarks: [], folders: [] });
  if (!d.folders) d.folders = [];
  if (!_migratedData.has(d)) { migrateWsFolders(d); _migratedData.add(d); }
  return d;
}
function wsNotes()  { return wsData().notes;       }
function wsTasks()  { return wsData().tasks;       }
function wsQA()     { return wsData().quickAccess; }
function wsBookmarks() { const d = wsData(); if (!d.importedBookmarks) d.importedBookmarks = []; return d.importedBookmarks; }
function wsFolders()   { return wsData().folders; }

// Returns all folder names: explicit empty ones first, then any derived from bookmarks not yet in the explicit list
function allWsFolderNames() {
  const explicit = wsFolders().map(f => f.name);
  const seen = new Set(explicit);
  wsBookmarks().forEach(b => {
    const k = b.folderName || 'Other';
    if (!seen.has(k)) { seen.add(k); explicit.push(k); }
  });
  return explicit;
}

// ===== NESTED FOLDER HELPERS =====
// Folders carry stable {id, name, parentId}. parentId === null means top-level.
// Nesting is capped at 1 level (a top-level folder may have subfolders, subfolders cannot).
const MAX_FOLDER_DEPTH = 1;

function _newFolderId() {
  return 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Migrate a workspace's folder list + bookmarks to the {id, parentId, folderId} shape.
// Returns true if anything changed.
function migrateWsFolders(d) {
  if (!d) return false;
  let changed = false;
  if (!Array.isArray(d.folders)) { d.folders = []; changed = true; }
  // Build name->id map for top-level (subfolders share names so this is the legacy mapping)
  d.folders.forEach(f => {
    if (!f.id) { f.id = _newFolderId(); changed = true; }
    if (!('parentId' in f)) { f.parentId = null; changed = true; }
  });
  // Backfill folderId on bookmarks via folderName lookup (legacy data is flat -> top-level only)
  if (Array.isArray(d.importedBookmarks)) {
    d.importedBookmarks.forEach(bm => {
      if (bm.folderId) return;
      const name = bm.folderName;
      if (!name) return;
      let f = d.folders.find(x => x.parentId == null && x.name === name);
      if (!f) {
        // Bookmark refers to a folder not in the explicit list — create the folder entry
        f = { id: _newFolderId(), name, parentId: null };
        d.folders.push(f);
      }
      bm.folderId = f.id;
      changed = true;
    });
  }
  return changed;
}

function getFolderById(id) {
  return wsFolders().find(f => f.id === id) || null;
}
function folderDepth(folder) {
  if (!folder) return 0;
  return folder.parentId == null ? 0 : 1;
}
function childFolders(folderId) {
  return wsFolders().filter(f => f.parentId === folderId);
}
function topLevelFolders() {
  return wsFolders().filter(f => f.parentId == null);
}
function folderBreadcrumb(folderId) {
  const f = getFolderById(folderId);
  if (!f) return [];
  if (f.parentId == null) return [f];
  const parent = getFolderById(f.parentId);
  return parent ? [parent, f] : [f];
}
function bookmarksInFolder(folderId) {
  return wsBookmarks().filter(b => b.folderId === folderId);
}
// Build folderId -> bookmarks[] and parentId -> children[] maps in single passes.
// Use these in renderers / modals instead of calling bookmarksInFolder/childFolders in a loop.
function buildBookmarksByFolderIndex() {
  const map = new Map();
  const all = wsBookmarks();
  for (let i = 0; i < all.length; i++) {
    const bm = all[i];
    if (!bm.folderId) continue;
    let arr = map.get(bm.folderId);
    if (!arr) { arr = []; map.set(bm.folderId, arr); }
    arr.push(bm);
  }
  return map;
}
function buildChildrenByParentIndex() {
  const map = new Map();
  const fs = wsFolders();
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i];
    const pid = f.parentId == null ? null : f.parentId;
    let arr = map.get(pid);
    if (!arr) { arr = []; map.set(pid, arr); }
    arr.push(f);
  }
  return map;
}

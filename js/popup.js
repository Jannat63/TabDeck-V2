'use strict';
// Toolbar popup: saves the current page to a workspace (as a Quick Access tile or into a folder).
const $ = id => document.getElementById(id);
const QA_MAX = 8;
const MEMORY_KEY = '__td_popup';
const UNSAVABLE = /^(chrome|chrome-extension|chrome-search|chrome-untrusted|edge|about|view-source|devtools):/i;
// The new-tab page and this popup both write to the same storage, so take turns (same lock the new-tab page uses).
const withLock = fn => (navigator.locks && navigator.locks.request) ? navigator.locks.request('tabdeck-storage', fn) : fn();
const getLocal = keys => new Promise(res => chrome.storage.local.get(keys, v => res(v || {})));
const setLocal = obj => new Promise(res => chrome.storage.local.set(obj, () => res(!chrome.runtime.lastError)));
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

let tab = null, workspaces = [], wsData = {}, dest = 'quick', toastTimer = null;

function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function notice(msg, warn) {
  const n = $('notice');
  n.hidden = !msg;
  n.textContent = msg || '';
  n.classList.toggle('warn', !!warn);
}
const recall = () => { try { return JSON.parse(localStorage.getItem(MEMORY_KEY)) || {}; } catch { return {}; } };
const remember = () => { try { localStorage.setItem(MEMORY_KEY, JSON.stringify({ wsId: Number($('wsSelect').value), dest, folderId: $('folderSelect').value })); } catch {} };
const currentData = () => wsData[Number($('wsSelect').value)] || { quickAccess: [], importedBookmarks: [], folders: [] };
const option = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; };

function fillFolders(preferred) {
  const d = currentData(), sel = $('folderSelect');
  const folders = d.folders || [];
  sel.replaceChildren();
  folders.filter(f => f.parentId == null).forEach(f => {
    sel.appendChild(option(f.id, f.name));
    folders.filter(c => c.parentId === f.id).forEach(c => sel.appendChild(option(c.id, '   ↳ ' + c.name)));
  });
  sel.appendChild(option('__new__', '+ New folder…'));
  sel.value = folders.some(f => f.id === preferred) ? preferred : (folders[0] ? folders[0].id : '__new__');
}
// Shows the right fields for the chosen destination and warns about full tiles / duplicates.
function refresh(preferredFolder) {
  const d = currentData();
  const quickFull = (d.quickAccess || []).length >= QA_MAX;
  if (dest === 'quick' && quickFull) dest = 'folder';
  $('destQuick').classList.toggle('active', dest === 'quick'); $('destQuick').setAttribute('aria-pressed', dest === 'quick');
  $('destFolder').classList.toggle('active', dest === 'folder'); $('destFolder').setAttribute('aria-pressed', dest === 'folder');
  $('destQuick').disabled = quickFull;
  $('destQuick').title = quickFull ? `Quick Access is full (${QA_MAX} tiles)` : '';
  fillFolders(preferredFolder ?? $('folderSelect').value);
  $('folderRow').hidden = dest !== 'folder';
  $('newFolderRow').hidden = !(dest === 'folder' && $('folderSelect').value === '__new__');
  const dup = tab && ((d.quickAccess || []).some(q => q.url === tab.url) || (d.importedBookmarks || []).some(b => b.url === tab.url));
  const ws = workspaces.find(w => w.id === Number($('wsSelect').value));
  if (dup) notice(`Already saved in ${ws ? ws.name : 'this workspace'}.`, true);
  else if (quickFull) notice(`Quick Access is full (${QA_MAX} tiles), so this will go into a folder.`);
  else notice('');
  $('saveBtn').disabled = !!dup;
  $('saveLabel').textContent = dest === 'quick' ? 'Save to Quick Access' : 'Save to folder';
}

async function init() {
  const [tabs, stored] = await Promise.all([new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r)), getLocal(['workspaces', 'wsData', 'activeWsId'])]);
  tab = (tabs && tabs[0]) || null;
  workspaces = (stored.workspaces || []).map(w => ({ ...w, id: Number(w.id) }));
  wsData = stored.wsData || {};
  const url = tab && tab.url ? tab.url : '';
  $('pageTitle').textContent = (tab && tab.title) || url || 'No page';
  $('pageUrl').textContent = url;
  $('titleInput').value = (tab && tab.title) || '';
  if (url && !UNSAVABLE.test(url)) $('pageFavicon').src = `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(url)}&size=32`;
  if (!url || UNSAVABLE.test(url)) { $('saveBtn').disabled = true; $('mainForm').querySelectorAll('input,select,button').forEach(n => n.disabled = true); notice('Browser pages like this one can’t be saved. Open a regular website and try again.', true); return; }
  if (!workspaces.length) { $('saveBtn').disabled = true; notice('Open a new tab once to finish setting up TabDeck, then try again.', true); return; }
  workspaces.forEach(w => $('wsSelect').appendChild(option(w.id, `${w.icon || '📁'}  ${w.name}`)));
  const mem = recall();
  const pick = [mem.wsId, Number(stored.activeWsId)].find(id => workspaces.some(w => w.id === id));
  $('wsSelect').value = pick !== undefined ? pick : workspaces[0].id;
  dest = mem.dest === 'folder' ? 'folder' : 'quick';
  refresh(mem.folderId);
}

async function save() {
  if (!tab || !tab.url) return;
  const title = ($('titleInput').value.trim() || tab.title || tab.url).slice(0, 300);
  const wsId = Number($('wsSelect').value);
  const folderValue = $('folderSelect').value, newName = $('newFolderInput').value.trim();
  if (dest === 'folder' && folderValue === '__new__' && !newName) { toast('Name the new folder first.', 'error'); $('newFolderInput').focus(); return; }
  $('saveBtn').disabled = true;
  try {
    const res = await withLock(async () => {
      const latest = (await getLocal(['wsData'])).wsData || {};          // newest copy: add one item, write it back
      const d = latest[wsId] || (latest[wsId] = { quickAccess: [], notes: [], tasks: [], importedBookmarks: [], folders: [] });
      ['quickAccess', 'importedBookmarks', 'folders'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
      if (d.quickAccess.some(q => q.url === tab.url) || d.importedBookmarks.some(b => b.url === tab.url)) return { dup: true };
      let where;
      if (dest === 'quick') {
        if (d.quickAccess.length >= QA_MAX) return { full: true };
        d.quickAccess.push({ id: Date.now(), name: title.slice(0, 80), url: tab.url });
        where = 'Quick Access';
      } else {
        let folder = folderValue === '__new__' ? d.folders.find(f => f.parentId == null && f.name === newName) : d.folders.find(f => f.id === folderValue);
        if (!folder) { folder = { id: 'f_' + uid(), name: newName || 'Saved', parentId: null }; d.folders.push(folder); }
        d.importedBookmarks.push({ id: 'p_' + uid(), title, url: tab.url, folderId: folder.id, folderName: folder.name, date: Date.now() });
        where = folder.name;
      }
      return (await setLocal({ wsData: latest })) ? { where, latest } : { failed: true };
    });
    if (res.dup) { toast('Already saved here.', 'error'); refresh(); return; }
    if (res.full) { toast('Quick Access is full.', 'error'); wsData[wsId] = currentData(); refresh(); return; }
    if (res.failed) { toast('Couldn’t save. Chrome storage may be full.', 'error'); $('saveBtn').disabled = false; return; }
    remember();
    const ws = workspaces.find(w => w.id === wsId);
    toast(`Saved to ${res.where}${ws ? ' in ' + ws.name : ''}`, 'success');
    setTimeout(() => window.close(), 900);
  } catch (e) {
    toast('Something went wrong.', 'error'); $('saveBtn').disabled = false;
  }
}

$('pageFavicon').addEventListener('error', () => $('pageFavicon').parentElement.classList.add('nofav'));
$('wsSelect').addEventListener('change', () => refresh());
$('folderSelect').addEventListener('change', () => { $('newFolderRow').hidden = !($('folderSelect').value === '__new__'); if (!$('newFolderRow').hidden) $('newFolderInput').focus(); });
$('destQuick').addEventListener('click', () => { dest = 'quick'; refresh(); });
$('destFolder').addEventListener('click', () => { dest = 'folder'; refresh(); });
$('mainForm').addEventListener('submit', e => { e.preventDefault(); save(); });
init();

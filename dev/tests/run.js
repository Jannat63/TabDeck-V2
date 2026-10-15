// Regression tests: loads the real newtab.html + scripts in a simulated browser with a fake `chrome` API.
//   cd dev && npm install && npm test
const path = require('path'), fs = require('fs'), vm = require('vm');
let JSDOM; try { ({ JSDOM } = require('jsdom')); } catch (e) { try { ({ JSDOM } = require('/home/claude/tools/node_modules/jsdom')); } catch (e2) { console.error('Run "npm install" inside the dev folder first.'); process.exit(2); } }
const ROOT = path.join(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\uFEFF/, '');
const htmlSrc = read('newtab.html').replace(/<link[^>]*>/g, '').replace(/<script src="[^"]*"><\/script>/g, '');
// the same scripts, in the same order, as newtab.html loads them
const SCRIPTS = [...read('newtab.html').matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]).filter(f => f !== 'js/fouc.js').map(f => ({ f, src: read(f) }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? '  PASS ' : '  FAIL ') + name + (!ok && detail !== undefined ? '   -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };

function makeArea() {
  const data = {}, listeners = [];
  return {
    _data: data, _listeners: listeners,
    get(keys, cb) { const out = {}; (Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys || {})).forEach(k => { if (k in data) out[k] = JSON.parse(JSON.stringify(data[k])); }); setTimeout(() => cb(out), 0); },
    set(obj, cb) {
      const changes = {};
      Object.entries(obj).forEach(([k, v]) => { const nv = JSON.parse(JSON.stringify(v)); changes[k] = { oldValue: data[k], newValue: nv }; data[k] = nv; });
      setTimeout(() => { cb && cb(); listeners.forEach(l => l(JSON.parse(JSON.stringify(changes)), 'local')); }, 0);
    },
  };
}
const lockQueue = { q: Promise.resolve() };   // shared by every simulated tab, like the browser-wide Web Locks

async function boot(local, sync, opts = {}) {
  const dom = new JSDOM(htmlSrc, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/newtab.html' });
  const w = dom.window, errors = [], calls = { fetch: [], deleteRange: [], notifications: [], messages: [] };
  w.addEventListener('error', e => errors.push(String(e.message || e.error)));
  const tree = opts.tree || [{ id: '0', title: '', children: [{ id: '1', title: 'Bookmarks bar', children: [] }] }];
  w.chrome = {
    runtime: { id: 'test-id', lastError: null, getURL: p => 'chrome-extension://test-id' + p, sendMessage: (m, cb) => { calls.messages.push(m); cb && cb(); } },
    storage: { local, sync: sync || makeArea(), onChanged: { addListener: fn => local._listeners.push(fn) } },
    bookmarks: { getTree: cb => cb(JSON.parse(JSON.stringify(tree))), create: (d, cb) => cb({ id: 'n', ...d }), update: (i, c, cb) => cb({}), move: (i, d, cb) => cb({}), remove: (i, cb) => cb(), removeTree: (i, cb) => cb() },
    history: { search: (q, cb) => cb(opts.history || []), deleteUrl: (o, cb) => cb && cb(), deleteRange: (r, cb) => { calls.deleteRange.push(r); cb && cb(); } },
    downloads: { search: (q, cb) => cb([]), show() {} }, topSites: { get: cb => cb([]) },
    tabs: { create() {}, update() {} }, permissions: { request: (p, cb) => cb(true) },
  };
  Object.defineProperty(w.navigator, 'locks', { configurable: true, value: { request: (name, fn) => { const p = lockQueue.q.then(() => fn()); lockQueue.q = p.catch(() => {}); return p; } } });
  w.fetch = opts.fetch ? (u, o) => { calls.fetch.push(String(u)); return opts.fetch(u, o); } : (u) => { calls.fetch.push(String(u)); return Promise.reject(new Error('offline')); };
  await new Promise(r => { if (w.document.readyState === 'complete') r(); else w.addEventListener('load', r); });
  const ctx = dom.getInternalVMContext();
  SCRIPTS.forEach(s => new vm.Script(s.src, { filename: s.f }).runInContext(ctx));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  await sleep(opts.wait || 500);
  return { dom, w, doc: w.document, errors, calls, run: code => new vm.Script(code).runInContext(ctx) };
}
const click = (A, sel) => { const n = A.doc.querySelector(sel); if (!n) throw new Error('no element ' + sel); n.click(); return n; };
const confirmOk = A => click(A, '#confirmOkBtn');
const key = (A, k) => A.doc.dispatchEvent(new A.w.KeyboardEvent('keydown', { key: k, bubbles: true }));
const skipWelcome = local => { local._data.settings = { pack: 'default' }; };   // fresh install shows the welcome dialog; most tests skip it
const group = name => console.log('\n' + name);

(async () => {
  group('Storage: several tabs and the popup writing at once');
  { const local = makeArea(); skipWelcome(local);
    const A = await boot(local), B = await boot(local);
    B.run(`wsNotes().unshift({id:111,title:'note from tab B',content:'x',date:1,updatedAt:1,tags:[],pinned:false}); save();`);
    await sleep(500);
    const d = JSON.parse(JSON.stringify(local._data.wsData));       // the toolbar popup adds a bookmark straight to storage
    d[1].importedBookmarks.push({ id: 'p_1', title: 'saved from popup', url: 'https://example.com', folderId: d[1].folders[0].id, folderName: 'Google' });
    local.set({ wsData: d }); await sleep(150);
    A.run(`addTask('task from tab A')`); await sleep(600);
    const f = local._data.wsData[1];
    check("note made in tab B survives a save from tab A", f.notes.some(n => n.id === 111));
    check("bookmark added by the popup survives a save from tab A", f.importedBookmarks.some(b => b.id === 'p_1'));
    check("task made in tab A is saved", f.tasks.some(t => t.text === 'task from tab A'));
    check("tab A shows tab B's note without a reload", A.run(`wsNotes().some(n => n.id === 111)`));
    check("tab B shows the popup's bookmark without a reload", B.run(`wsData().importedBookmarks.some(b => b.id === 'p_1')`));
    A.run('save()'); const done = await Promise.race([A.run('flushSave()').then(() => 'resolved'), sleep(800).then(() => 'hung')]);
    check("await save() still finishes after a flush", done === 'resolved', done);
  }
  { const A = await boot(makeArea()); let ok = true;   // merge unit checks
    const m = (b, l, r) => JSON.stringify(A.run(`mergeValue(${JSON.stringify(b)}, ${JSON.stringify(l)}, ${JSON.stringify(r)})`));
    const ids = s => JSON.parse(s).map(x => x.id).join(',');
    check('merge: new item added here and a different one stored elsewhere both stay', ids(m([{id:1}], [{id:9},{id:1}], [{id:1},{id:5}])) === '9,1,5', m([{id:1}], [{id:9},{id:1}], [{id:1},{id:5}]));
    check('merge: an item deleted here stays deleted', ids(m([{id:1},{id:2}], [{id:2}], [{id:1},{id:2},{id:3}])) === '2,3');
    check('merge: edits to different fields of one item are combined', JSON.parse(m([{id:1,a:1,b:1}], [{id:1,a:2,b:1}], [{id:1,a:1,b:2}]))[0].a === 2 && JSON.parse(m([{id:1,a:1,b:1}], [{id:1,a:2,b:1}], [{id:1,a:1,b:2}]))[0].b === 2);
    check('merge: re-ordering here is kept', ids(m([{id:1},{id:2},{id:3}], [{id:3},{id:1},{id:2}], [{id:1},{id:2},{id:3}])) === '3,1,2');
  }

  group('Notes');
  { const local = makeArea(); skipWelcome(local); const A = await boot(local);
    A.run('openNoteNew()'); A.doc.getElementById('noteTitle').value = 'Draft'; A.doc.getElementById('noteContent').value = 'typed text'; key(A, 'Escape');
    check('Esc saves what was typed', A.run('wsNotes().length') === 1 && A.run('wsNotes()[0].title') === 'Draft' && !A.doc.getElementById('noteModal').classList.contains('open'));
    A.run('openNoteNew()'); A.doc.getElementById('noteContent').value = 'second note'; A.doc.getElementById('noteModal').click();
    check('clicking outside saves too', A.run('wsNotes().length') === 2);
    A.run('openNoteNew()'); A.doc.getElementById('noteContent').value = 'throw away'; click(A, '#deleteNoteBtn');
    check('Discard throws a new note away', A.run('wsNotes().length') === 2);
    A.run('openNoteNew()'); A.doc.getElementById('noteContent').value = 'auto'; A.doc.getElementById('noteContent').dispatchEvent(new A.w.Event('input')); await sleep(1800);
    check('a note is saved while typing, and only once', A.run('wsNotes().length') === 3 && A.run('S.editingNoteId') !== null);
    A.run(`wsNotes().unshift({id:777,title:'Tagged',content:'body',date:1,updatedAt:1,tags:['work'],pinned:true}); deleteNoteById(777); restoreItem(S.trash[S.trash.length-1]._tid);`);
    check('restoring a note keeps its tags and pin', A.run(`JSON.stringify(wsNotes().find(n => n.id === 777).tags)`) === '["work"]' && A.run(`wsNotes().find(n => n.id === 777).pinned`) === true);
    A.run(`S.wsData[2].notes.unshift({id:888,title:'AI note',content:'zebra',date:1,updatedAt:1,tags:[],pinned:false})`);
    A.run(`openCmdPalette('zebra')`); await sleep(60); click(A, '#cmdResults [data-note-id]'); await sleep(150);
    check('search opens a note that lives in another workspace', A.doc.getElementById('noteModal').classList.contains('open') && A.run('S.activeWsId') === 2);
  }

  group('Trash, undo and workspaces');
  { const local = makeArea(); skipWelcome(local); const A = await boot(local);
    const before = A.run(`S.wsData[3].importedBookmarks.length`);
    A.run('renderManageWorkspacesList()'); click(A, '.manage-ws-delete[data-wsid="3"]'); confirmOk(A); await sleep(500);
    check('deleting a workspace sends all of it to Trash', A.run(`S.trash.length === 1 && S.trash[0]._type === 'workspace' && S.trash[0].data.importedBookmarks.length === ${before}`));
    const B = await boot(local);
    check('a deleted preset workspace does not come back', B.run(`S.workspaces.map(w => w.name).join()`) === 'Home,AI');
    A.run(`restoreItem(S.trash[0]._tid)`);
    check('Undo brings the workspace back with everything in it', A.run(`S.workspaces.length === 3 && S.wsData[3].importedBookmarks.length === ${before}`));
    A.run(`addTask('t1'); addTask('t2'); toggleTask(S.wsData[1].tasks[0].id)`);
    for (let i = 3; i <= 8; i++) A.run(`addTask('task ${i}')`);
    check('every task is listed (no hidden tail)', A.doc.querySelectorAll('#tasksList .task-item').length === 8);
    check('finished tasks sink to the bottom', A.doc.querySelector('#tasksList .task-item:last-child').classList.contains('done'));
    A.run('clearDoneTasks()'); check('Clear completed moves them to Trash', A.run('wsTasks().length') === 7 && A.run(`S.trash.some(t => t._type === 'task')`));
    A.run(`S.trash.push({_tid:'old', _type:'task', text:'ancient', _deletedAt: Date.now() - 31*86400000, _wsId: 1}); normalizeLoadedState()`);
    check('Trash empties itself after 30 days', !A.run(`S.trash.some(t => t._tid === 'old')`));
    A.run(`addWorkspace('Temp','🧪')`); const id = A.run('S.workspaces[S.workspaces.length-1].id'); A.run(`setActiveWorkspace(${id})`); await sleep(300);
    A.run(`wsNotes().unshift({id:999,title:'in Temp',content:'c',date:1,updatedAt:1,tags:[],pinned:false}); deleteNoteById(999); setActiveWorkspace(1);`); await sleep(300);
    A.run('renderManageWorkspacesList()'); click(A, `.manage-ws-delete[data-wsid="${id}"]`); confirmOk(A); await sleep(200);
    A.run(`restoreItem(S.trash.find(t => t._type === 'note')._tid)`);
    check('restoring into a deleted workspace lands in the current one, not nowhere', A.run(`wsNotes().some(n => n.id === 999)`));
  }

  group('Moving bookmarks and folders between workspaces');
  { const A = await boot(makeArea()); const local = A; 
    A.run(`globalThis.__bm = S.wsData[1].importedBookmarks[0];`);
    const btn = A.doc.createElement('button'); A.doc.body.appendChild(btn); A.w.__btn = btn;
    A.run(`openBmCtxMenu(__btn, __bm, __bm.folderName)`); click(A, '.bm-ctx-menu [data-action="move-ws"]');
    const opt = [...A.doc.querySelectorAll('.bm-ctx-sub .bm-ctx-ws-folder')].find(o => o.dataset.wsid === '2'); const fid = opt.dataset.folderid; opt.click(); await sleep(500);
    check('a moved bookmark is inside a folder that exists in the new workspace', A.run(`(function(){ const t = S.wsData[2]; const m = t.importedBookmarks.find(b => b.id === __bm.id); return !!m && t.folders.some(f => f.id === m.folderId) && m.folderId === ${JSON.stringify(fid)}; })()`));
    A.run(`(function(){ const d = S.wsData[1]; const g = d.folders.find(f => f.name === 'Social Media' || f.name === 'Google'); globalThis.__g = g; d.folders.push({ id: 'f_sub1', name: 'Sub', parentId: g.id }); d.importedBookmarks.push({ id: 'ws_sub_1', title: 'in sub', url: 'https://sub.example.com', folderId: 'f_sub1', folderName: 'Sub' }); })()`);
    const btn2 = A.doc.createElement('button'); A.doc.body.appendChild(btn2); A.w.__btn = btn2;
    A.run(`openFolderCardCtxMenu(__btn, __g.name, bookmarksInFolder(__g.id), __g.id)`); click(A, '.bm-ctx-menu [data-action="move-ws"]'); click(A, '.bm-ctx-sub .bm-ctx-ws-direct[data-wsid="2"]'); await sleep(500);
    check('moving a folder leaves no orphaned subfolder behind', A.run(`S.wsData[1].folders.every(f => !f.parentId || S.wsData[1].folders.some(p => p.id === f.parentId))`));
    A.run('setActiveWorkspace(2)'); await sleep(600);
    check('the moved folder and its subfolder bookmarks show up in the new workspace', A.run(`(function(){ const t = S.wsData[2]; const nf = t.folders.find(f => f.name === __g.name); return !!nf && t.importedBookmarks.filter(b => b.folderId === nf.id).length > 0 && t.importedBookmarks.some(b => b.id === 'ws_sub_1' && t.folders.some(f => f.id === b.folderId && f.parentId === nf.id)); })()`));
  }

  group('Quick Access, bookmarks page, search palette');
  { const local = makeArea(); skipWelcome(local);
    const tree = [{ id: '0', title: '', children: [{ id: '1', title: 'Bookmarks bar', children: [{ id: '10', title: 'Chrome Folder', children: [{ id: '100', title: 'Chrome site', url: 'https://chrome-site.example' }] }] }] }];
    const A = await boot(local, null, { tree });
    const names = () => [...A.doc.querySelectorAll('#allBookmarksList .bm-folder-name')].map(n => n.textContent).join(' | ');
    A.run(`openQAEditModal(wsQA()[0])`); click(A, '#quickAccessModal .btn-secondary[data-modal="quickAccessModal"]'); click(A, '#fabAddQuickAccess');
    const prefilled = A.doc.getElementById('qaName').value;
    A.doc.getElementById('qaName').value = 'Reddit'; A.doc.getElementById('qaUrl').value = 'reddit.com'; click(A, '#saveQuickAccessBtn');
    check('adding a link after cancelling an edit adds, it does not overwrite', A.run(`wsQA().some(q => q.name === 'Reddit') && wsQA().some(q => q.name === 'Gmail')`) && prefilled === '', prefilled);
    A.doc.getElementById('qaName').value = 'x'; A.doc.getElementById('qaUrl').value = 'javascript:alert(1)'; A.run('openQAEditModal(null)'); A.doc.getElementById('qaName').value = 'x'; A.doc.getElementById('qaUrl').value = 'javascript:alert(1)'; click(A, '#saveQuickAccessBtn');
    check('a javascript: address is refused', !A.run(`wsQA().some(q => q.name === 'x')`));
    A.run(`navigateTo('bookmarks')`); await sleep(500);
    const first = names(); const sel = A.doc.getElementById('bmSortSelect'); sel.value = 'za'; sel.dispatchEvent(new A.w.Event('change', { bubbles: true })); await sleep(100);
    check('changing the sort keeps the same bookmarks on screen', names() === first && !/Chrome Folder/.test(names()), names());
    click(A, '#bmSourceSeg [data-src="chrome"]'); await sleep(300);
    check('the Chrome tab shows Chrome bookmarks', /Chrome Folder/.test(names()), names());
    click(A, '#bmSourceSeg [data-src="workspace"]'); await sleep(100);
    A.run(`openCmdPalette('theme')`); await sleep(250);
    check('the palette offers actions', !!A.doc.querySelector('#cmdResults [data-act="theme"]'));
    A.doc.getElementById('jdCsBtn') && A.doc.getElementById('jdCsBtn').click();
    A.run(`S.settings.pack = 'jannat'; initJannatDesign();`); await sleep(200); A.errors.length = 0; A.doc.getElementById('jdCsBtn').click(); await sleep(100);
    check('the Jannat search arrow opens an empty palette without errors', A.doc.getElementById('cmdInput').value === '' && A.errors.length === 0, A.errors);
    A.run('closeCmdPalette()');
    A.doc.getElementById('historyClearAllBtn').click(); confirmOk(A); await sleep(100);
    check('Clear history only clears the last 30 days (and asks first)', A.calls.deleteRange.length === 1 && (A.calls.deleteRange[0].endTime - A.calls.deleteRange[0].startTime) < 31 * 86400000 + 120000);
  }

  group('Backup, import and reset');
  { const local = makeArea(); skipWelcome(local); const A = await boot(local);
    A.run(`addWorkspace('Mine','🎨')`); A.run(`setActiveWorkspace(S.workspaces[S.workspaces.length-1].id)`); await sleep(500);
    const ws = [{ id: 1, name: 'Home', icon: '<b id="x">X</b>' }];
    const data = { 1: { quickAccess: [], notes: [{ id: 5, title: 'old note', content: 'x' }], tasks: [], folders: [{ id: 'f1', name: 'F', parentId: null }], importedBookmarks: [{ id: 'b1', title: 'ok', url: 'https://ok.example', folderId: 'f1' }, { id: 'b2', title: 'bad', url: 'javascript:alert(1)', folderId: 'f1' }] } };
    A.w.__file = new A.w.File([JSON.stringify({ workspaces: ws, wsData: data, settings: { pack: 'nonsense' }, user: { name: 'Pat', avatarColor: 'red;"onclick="x' } })], 'b.json');
    A.run('importData(__file)'); await sleep(400);
    check('importing asks before replacing anything', A.doc.getElementById('confirmModal').classList.contains('open') && A.run(`S.workspaces.length`) === 4);
    confirmOk(A); await sleep(500);
    check('the active workspace exists after an import', A.run(`S.workspaces.some(w => w.id === S.activeWsId)`));
    check('unsafe addresses and styles in a backup are dropped', A.run(`S.wsData[1].importedBookmarks.length`) === 1 && A.run('S.user.avatarColor') === '#7c3aed' && A.run('S.settings.pack') === 'default');
    check('workspace icons from a backup are never inserted as HTML', !A.doc.getElementById('x'));
    click(A, '#_toast .toast-action'); await sleep(500);
    check('Undo puts the previous data back', A.run('S.workspaces.length') === 4);
    A.doc.getElementById('clearAllDataBtn').click(); confirmOk(A); await sleep(300); A.run(`addWorkspace('Extra','🏠')`);
    check('Clear All Data leaves the built-in defaults untouched', A.run('DEFAULT_WORKSPACES.length') === 3);
    A.run(`S.settings.pack = 'mono'; applyPack('mono'); S.settings.cardGlow = 'glow'; saveSettings()`);
    check('Jannat themes lock the light/dark switch', (A.run(`S.settings.pack='jannat'; applyPack('jannat'); document.getElementById('themeBtn').disabled`)) === true && A.doc.documentElement.dataset.theme === 'dark');
  }

  group('Widgets: quote, weather, timer');
  { const local = makeArea(); skipWelcome(local);
    const wx = { current_condition: [{ weatherCode: '113', temp_C: '21', temp_F: '70', weatherDesc: [{ value: 'Sunny' }] }], nearest_area: [{ areaName: [{ value: 'Dhaka' }], region: [{ value: 'Dhaka' }], country: [{ value: 'Bangladesh' }] }] };
    const A = await boot(local, null, { fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(wx) }) });
    check('the quote needs no network request', !A.calls.fetch.some(u => /vercel|quote/.test(u)) && A.doc.querySelector('.quote-text, #quoteText')?.textContent.length > 5);
    check('weather shows °C by default', /21°C/.test(A.doc.getElementById('weatherTemp').textContent), A.doc.getElementById('weatherTemp').textContent);
    check('weather only ever asks wttr.in', A.calls.fetch.length > 0 && A.calls.fetch.every(u => /wttr\.in/.test(u)), A.calls.fetch);
    const n = A.calls.fetch.length; await A.run('autoDetectWeather()'); check('fresh weather is not fetched again', A.calls.fetch.length === n);
    click(A, '#tempUnitGroup [data-unit="F"]'); check('switching to °F updates the card', /70°F/.test(A.doc.getElementById('weatherTemp').textContent));
    A.run('timerPlay()');
    check('the timer counts to an end time', A.run('T.running && T.endAt > Date.now()') && !!A.w.localStorage.getItem('__td_timer'));
    A.run('T.endAt = Date.now() - 500; _timerWrite(); timerTick()'); await sleep(50);
    check('finishing the timer announces it', !A.run('T.running') && /Focus session complete/.test(A.doc.getElementById('_toast').textContent));
    check('every site-icon request goes where the setting says', A.run(`favSrc('https://example.com/')`).includes('gstatic.com') && (A.run(`S.settings.faviconSource='chrome'; _favCache.clear(); favSrc('https://example.com/')`)).includes('/_favicon/'));
  }

  group('First run and accessibility');
  { const local = makeArea(); const A = await boot(local);
    check('a fresh install shows the welcome dialog', A.doc.getElementById('welcomeModal').classList.contains('open'));
    A.doc.getElementById('welcomeName').value = 'Pat'; A.doc.getElementById('welcomeStarter').checked = false; click(A, '#welcomeStartBtn'); await sleep(600);
    check('"start empty" gives one empty workspace and saves the name', A.run('S.user.name') === 'Pat' && A.run('S.workspaces.length') === 1 && A.run('S.wsData[1].importedBookmarks.length') === 0 && local._data.user.name === 'Pat');
    check('the greeting uses the name', /Pat/.test(A.doc.getElementById('greetingText').textContent));
    check('icon-only buttons get a name', A.doc.getElementById('addTaskBtn').getAttribute('aria-label') === 'Add task', A.doc.getElementById('addTaskBtn').getAttribute('aria-label'));
    check('dialogs are announced as dialogs', A.doc.querySelector('#noteModal .modal').getAttribute('role') === 'dialog' && A.doc.querySelector('#noteModal .modal').getAttribute('aria-modal') === 'true');
    const u = s => JSON.stringify(A.run(`normalizeUrl(${JSON.stringify(s)})`));
    check('web addresses: "httpbin.org" gets https://', JSON.parse(u('httpbin.org')).url === 'https://httpbin.org');
    check('web addresses: localhost uses http', JSON.parse(u('localhost:3000')).url === 'http://localhost:3000');
    check('web addresses: javascript:, spaces and plain words are refused', ['javascript:alert(1)', 'a b.com', 'hello'].every(s => !JSON.parse(u(s)).ok));
    check('no script errors during any of this', A.errors.length === 0, A.errors);
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

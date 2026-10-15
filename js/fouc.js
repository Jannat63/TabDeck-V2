// Runs before the page paints, so the chosen theme, light/dark mode and accent colour show up immediately (no flash of the wrong theme).
try {
  var KNOWN = ['default', 'mono', 'brutal', 'atelier', 'holodeck', 'aurora', 'ember', 'sakura', 'obsidian', 'aura', 'jannat', 'jannat-v2'];
  var LOCK = { 'jannat': 'dark', 'jannat-v2': 'light' };   // these two themes only exist in one mode
  var p = localStorage.getItem('__td_pack');
  if (KNOWN.indexOf(p) < 0) p = 'default';
  var t = LOCK[p] || localStorage.getItem('__td_theme');
  var a = localStorage.getItem('__td_accent');
  var r = document.documentElement;

  r.dataset.pack = p;
  if (t === 'light' || t === 'dark') r.dataset.theme = t;

  // A theme's file goes in front of the base styles (newtab.html loads those right after this script).
  if (p !== 'default') {
    var link = document.createElement('link');
    link.id = 'theme-pack-css';
    link.rel = 'stylesheet';
    link.href = 'css/themes/' + p + '.css';
    document.head.appendChild(link);
  }

  if (a && p !== 'brutal' && /^#[0-9a-f]{3,8}$/i.test(a)) {   // the Brutal theme keeps its own accent
    var hex = a.length === 4 ? '#' + a.charAt(1) + a.charAt(1) + a.charAt(2) + a.charAt(2) + a.charAt(3) + a.charAt(3) : a;
    r.style.setProperty('--accent', a);
    r.style.setProperty('--accent-rgb', parseInt(hex.substr(1, 2), 16) + ',' + parseInt(hex.substr(3, 2), 16) + ',' + parseInt(hex.substr(5, 2), 16));
    r.style.setProperty('--accent-light', a + 'cc');
    r.style.setProperty('--accent-bg', a + '2e');
    r.style.setProperty('--accent-subtle', a + '14');
    r.style.setProperty('--accent-glow', a + '80');
  }
} catch (e) {}

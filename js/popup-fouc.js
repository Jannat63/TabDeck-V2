// Applies the chosen theme, light/dark mode and accent colour to the popup before it paints.
try {
  var KNOWN = ['default', 'mono', 'brutal', 'atelier', 'holodeck', 'aurora', 'ember', 'sakura', 'obsidian', 'aura', 'jannat', 'jannat-v2'];
  var LOCK = { 'jannat': 'dark', 'jannat-v2': 'light' };
  var p = localStorage.getItem('__td_pack');
  if (KNOWN.indexOf(p) < 0) p = 'default';
  var t = LOCK[p] || localStorage.getItem('__td_theme');
  var a = localStorage.getItem('__td_accent');
  var r = document.documentElement;
  r.dataset.pack = p;
  if (t === 'light' || t === 'dark') r.dataset.theme = t;
  if (a && p !== 'brutal' && /^#[0-9a-f]{3,8}$/i.test(a)) {   // the Brutal theme keeps its own accent
    r.style.setProperty('--accent', a);
    r.style.setProperty('--accent-light', a + 'cc');
    r.style.setProperty('--accent-bg', a + '2e');
    r.style.setProperty('--accent-subtle', a + '14');
    r.style.setProperty('--accent-glow', a + '80');
  }
} catch (e) {}

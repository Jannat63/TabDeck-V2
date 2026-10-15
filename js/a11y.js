'use strict';
// =============================================
//  Accessibility helpers: names for icon-only buttons, dialog roles, keyboard support for clickable
//  cards and swatches, focus trapping inside open windows.
// =============================================
(function () {
  const NEEDS_NAME = 'button, a[href], [role="button"], [role="checkbox"]';
  const hasName = n => n.hasAttribute('aria-label') || n.hasAttribute('aria-labelledby') || (n.textContent || '').trim() || n.title || n.querySelector('img[alt]:not([alt=""])');
  // plain elements that act like buttons
  const CLICKABLE = '.color-swatch, .emoji-picker > *, .ws-tab, .workspace-sidebar-item, .note-card, .ws-bm-folder-card, .folder-modal-subfolder, .folder-modal-row, .note-item, .sidebar-folder-item, .qa-menu-btn';
  const PRESSABLE = '.toggle-opt, .pack-card, .preset-btn, .color-swatch';

  function enhance(root) {
    if (!root || root.nodeType !== 1) return;
    const all = sel => (root.matches && root.matches(sel) ? [root] : []).concat([...root.querySelectorAll(sel)]);

    all('[data-tip]').forEach(n => { if (n.matches(NEEDS_NAME) && !hasName(n)) n.setAttribute('aria-label', n.getAttribute('data-tip')); });

    all(CLICKABLE).forEach(n => {
      if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(n.tagName)) return;
      if (!n.hasAttribute('role')) n.setAttribute('role', 'button');
      if (!n.hasAttribute('tabindex')) n.setAttribute('tabindex', '0');
      if (n.classList.contains('color-swatch') && !n.hasAttribute('aria-label')) n.setAttribute('aria-label', 'Accent colour ' + (n.dataset.color || ''));
      if (n.parentElement && n.parentElement.classList.contains('emoji-picker') && !n.hasAttribute('aria-label')) n.setAttribute('aria-label', 'Emoji ' + n.textContent.trim());
    });

    all('.modal-overlay > .modal').forEach(m => {
      if (m.hasAttribute('role')) return;
      m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
      const h = m.querySelector('.modal-header h3, h3');
      if (h) { if (!h.id) h.id = m.parentElement.id + '-title'; m.setAttribute('aria-labelledby', h.id); }
    });
    all('#settingsPanel').forEach(p => { p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Settings'); });
    all('#cmdPalette').forEach(p => { p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Search and commands'); });
    all('#cmdResults').forEach(r => { r.setAttribute('role', 'listbox'); r.setAttribute('aria-label', 'Results'); });
    all('#cmdInput').forEach(i => { if (!i.hasAttribute('aria-label')) i.setAttribute('aria-label', 'Search or run a command'); });

    // labels that sit next to their field
    all('label:not([for])').forEach(l => {
      if (l.querySelector('input, select, textarea')) return;
      let f = l.nextElementSibling;
      if (f && !/^(INPUT|SELECT|TEXTAREA)$/.test(f.tagName)) f = f.querySelector && f.querySelector('input, select, textarea');
      if (f && /^(INPUT|SELECT|TEXTAREA)$/.test(f.tagName)) { if (!f.id) f.id = 'f-' + Math.random().toString(36).slice(2, 8); l.setAttribute('for', f.id); }
    });
    // switches take their name from the row label
    all('label.switch input[type="checkbox"]').forEach(c => {
      if (c.hasAttribute('aria-label')) return;
      const row = c.closest('.settings-row'), name = row && row.querySelector('.settings-label span');
      if (name) c.setAttribute('aria-label', name.textContent.trim());
    });
    all(PRESSABLE).forEach(n => { if (n.matches('.toggle-opt, .pack-card, .preset-btn')) n.setAttribute('aria-pressed', n.classList.contains('active') || n.classList.contains('selected') ? 'true' : 'false'); });
  }

  let queued = false;
  const pending = new Set();
  const flush = () => { queued = false; pending.forEach(enhance); pending.clear(); };
  new MutationObserver(muts => {
    muts.forEach(m => {
      if (m.type === 'childList') m.addedNodes.forEach(n => { if (n.nodeType === 1) pending.add(n); });
      else if (m.target.nodeType === 1) {
        const t = m.target;
        if (m.attributeName === 'class' && t.matches(PRESSABLE)) t.setAttribute('aria-pressed', t.classList.contains('active') || t.classList.contains('selected') ? 'true' : 'false');
        else pending.add(t);
      }
    });
    if (pending.size && !queued) { queued = true; requestAnimationFrame(flush); }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-tip'] });
  enhance(document.body);

  // Windows that are closed only fade out visually; make them unreachable for Tab and screen readers too
  const WINDOWS = '.modal-overlay, #settingsPanel, #settingsOverlay, #cmdPaletteOverlay';
  const syncInert = n => { n.inert = !n.classList.contains('open'); };
  document.querySelectorAll(WINDOWS).forEach(syncInert);
  new MutationObserver(muts => muts.forEach(m => { if (m.target.matches && m.target.matches(WINDOWS)) syncInert(m.target); }))
    .observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });

  // Enter / Space activate things that are not real buttons
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target;
    if (!t || !t.getAttribute || /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    const role = t.getAttribute('role');
    if (role === 'button' || role === 'checkbox' || role === 'tab') { e.preventDefault(); t.click(); }
  });

  // Keep Tab inside whichever window is open
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const open = [...document.querySelectorAll('.modal-overlay.open .modal, #settingsPanel.open, #cmdPaletteOverlay.open #cmdPalette')].pop();
    if (!open) return;
    const items = [...open.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter(n => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (!open.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // Settings panel: remember where focus was, and give it back on close
  const panel = document.getElementById('settingsPanel');
  if (panel) {
    let opener = null, wasOpen = false;
    new MutationObserver(() => {
      const isOpen = panel.classList.contains('open');
      if (isOpen && !wasOpen) opener = document.activeElement;
      if (!isOpen && wasOpen && opener && document.contains(opener) && opener.focus) opener.focus({ preventScroll: true });
      wasOpen = isOpen;
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  }
})();

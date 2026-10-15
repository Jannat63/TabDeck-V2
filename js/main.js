'use strict';
// =============================================
//  TabDeck · Start-up: runs once the page has loaded
// =============================================

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  setupStorageSync();
  initClock();
  updateGreeting();
  autoDetectWeather();
  setupEventListeners();
  setupSearch();
  initTooltips();
  _cmdInitKeyboard();
  renderAll();
  loadBookmarks();
  setInterval(updateGreeting, 5 * 60 * 1000);
  timerLoad();
  // Defer non-critical tab data until after first paint — only needed when History/Downloads are opened.
  const onIdle = window.requestIdleCallback || (cb => setTimeout(cb, 200));
  onIdle(() => { loadHistory(''); loadDownloads(); });
  if (S.firstRun && typeof openWelcome === 'function') openWelcome();

  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toUpperCase();
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target.isContentEditable;
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '/') { e.preventDefault(); openCmdPalette(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmdPalette(); }
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '?') { e.preventDefault(); openModal('shortcutsModal'); }
    if (e.key === 'Escape') {
      if (el('cmdPaletteOverlay').classList.contains('open')) { closeCmdPalette(); return; }
      closeAllModals();
      closeSettings();
      closeFab();
    }
  });
});

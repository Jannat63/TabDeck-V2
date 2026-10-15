'use strict';
// =============================================
//  TabDeck · Wires every button and key to its action
// =============================================

// ===== EVENT LISTENERS =====
function setupEventListeners() {
  // Static HTML buttons that had inline onclick removed
  el('addSidebarFolderBtn').addEventListener('click', () => openWsFolderEditModal(null));
  el('analyticsBtn').addEventListener('click', () => navigateTo('analytics'));
  document.querySelectorAll('.view-back-btn').forEach(btn => btn.addEventListener('click', () => navigateTo('home')));
  el('gridViewBtn').addEventListener('click', () => {
    S.settings.gridView = !S.settings.gridView;
    document.body.classList.toggle('grid-view-mode', S.settings.gridView);
    el('gridViewBtn').classList.toggle('active', S.settings.gridView);
    save();
    renderQuickAccess();
    renderWorkspaceBookmarks();
  });
  el('sidebarToggleBtn').addEventListener('click', () => {
    S.settings.sidebarCollapsed = !S.settings.sidebarCollapsed;
    document.body.classList.toggle('sidebar-collapsed', S.settings.sidebarCollapsed);
    el('sidebarToggleBtn').classList.toggle('active', S.settings.sidebarCollapsed);
    save();
  });
  el('weatherWidget').addEventListener('click', openWeatherLocationModal);

  // Nav
  document.querySelectorAll('.nav-item').forEach(n => {
    n.addEventListener('click', e => { e.preventDefault(); navigateTo(n.dataset.view); });
  });

  // Theme
  el('themeBtn').addEventListener('click', () => {
    applyTheme(S.settings.theme==='dark'?'light':'dark');
    save();
  });

  // Settings open
  el('settingsBtn').addEventListener('click', openSettings);
  el('topSettingsBtn').addEventListener('click', openSettings);
  el('closeSettingsBtn').addEventListener('click', closeSettings);
  el('settingsOverlay').addEventListener('click', closeSettings);
  el('saveSettingsBtn').addEventListener('click', saveSettings);

  // Wallpaper controls
  el('wallpaperToggle').addEventListener('change', () => {
    el('wallpaperOptions').style.display = el('wallpaperToggle').checked ? '' : 'none';
    applyWallpaperFromPanel();
  });
  el('settingsName').addEventListener('input', debounce(() => {
    S.user.name = el('settingsName').value.trim().slice(0, 40);
    updateAvatarDisplay(); updateGreeting(); save();
  }, 250));
  document.querySelectorAll('#wallpaperIntervalGroup .toggle-opt').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#wallpaperIntervalGroup .toggle-opt').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      applyWallpaperFromPanel();
    });
  });
  document.querySelectorAll('#wallpaperDimGroup .toggle-opt').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#wallpaperDimGroup .toggle-opt').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      applyWallpaperFromPanel();
    });
  });
  el('wallpaperNextBtn').addEventListener('click', () => {
    if (S.settings.wallpaper?.enabled) _wpLoadNext();
  });

  // Theme pack picker
  document.querySelectorAll('#packPicker .pack-card').forEach(b => {
    b.addEventListener('click', () => {
      applyPack(b.dataset.pack);
      save();
    });
  });

  // Settings theme toggles
  el('darkThemeBtn').addEventListener('click', () => {
    applyTheme('dark');
    el('darkThemeBtn').classList.add('active');
    el('lightThemeBtn').classList.remove('active');
    save();
  });
  el('lightThemeBtn').addEventListener('click', () => {
    applyTheme('light');
    el('lightThemeBtn').classList.add('active');
    el('darkThemeBtn').classList.remove('active');
    save();
  });

  // Clock format
  el('clock12Btn').addEventListener('click', () => {
    S.settings.clockFormat='12';
    el('clock12Btn').classList.add('active');
    el('clock24Btn').classList.remove('active');
    updateClock();
    save();
  });
  el('clock24Btn').addEventListener('click', () => {
    S.settings.clockFormat='24';
    el('clock24Btn').classList.add('active');
    el('clock12Btn').classList.remove('active');
    updateClock();
    save();
  });
  el('showSecondsToggle').addEventListener('change', () => {
    S.settings.showSeconds = el('showSecondsToggle').checked;
    updateClock();
    save();
  });

  // Card glow toggle
  document.querySelectorAll('#cardGlowGroup .toggle-opt').forEach(b => {
    b.addEventListener('click', () => {
      if (document.getElementById('cardGlowRow')?.classList.contains('row-locked')) return;
      document.querySelectorAll('#cardGlowGroup .toggle-opt').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      S.settings.cardGlow = b.dataset.glow;
      applyCardGlow(b.dataset.glow);
      save();
    });
  });

  // Accent colors
  document.querySelectorAll('#accentColors .color-swatch').forEach(s => {
    s.addEventListener('click', () => {
      if (document.getElementById('accentColorRow')?.classList.contains('row-locked')) return;
      document.querySelectorAll('#accentColors .color-swatch').forEach(x=>x.classList.remove('active'));
      s.classList.add('active');
      applyAccent(s.dataset.color);
      save();
    });
  });
  // Avatar colors
  document.querySelectorAll('#avatarColors .color-swatch').forEach(s => {
    s.addEventListener('click', () => {
      document.querySelectorAll('#avatarColors .color-swatch').forEach(x=>x.classList.remove('active'));
      s.classList.add('active');
      S.user.avatarColor = s.dataset.color;
      el('userAvatar').style.background = s.dataset.color;
      save();
    });
  });

  // Widget toggles (live preview)
  ['Notes','Tasks','Quote','Timer','Weather'].forEach(w => {
    const box = el(`widget${w}Toggle`);
    if (!box) return;
    box.addEventListener('change', () => {
      S.settings.widgets[w.toLowerCase()] = box.checked;
      applyWidgetVisibility();
      if (w === 'Weather' && box.checked) autoDetectWeather();
      save();
    });
  });
  document.querySelectorAll('#tempUnitGroup .toggle-opt').forEach(b => b.addEventListener('click', () => {
    S.settings.tempUnit = b.dataset.unit;
    document.querySelectorAll('#tempUnitGroup .toggle-opt').forEach(x => x.classList.toggle('active', x === b));
    const cached = _wxRead(); if (cached) renderWeather(cached);
    save();
  }));
  document.querySelectorAll('#faviconSourceGroup .toggle-opt').forEach(b => b.addEventListener('click', () => {
    S.settings.faviconSource = b.dataset.src;
    document.querySelectorAll('#faviconSourceGroup .toggle-opt').forEach(x => x.classList.toggle('active', x === b));
    _favCache.clear(); renderAll(); renderBookmarksPage();
    save();
  }));

  // Export/Import/Clear
  el('exportDataBtn').addEventListener('click', exportData);
  el('importDataBtn').addEventListener('click', () => el('importFileInput').click());
  el('importFileInput').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });

  // Granular data clear
  el('clearNotesBtn').addEventListener('click', () => {
    confirm2('Clear All Notes?', 'All notes in the current workspace will be moved to Trash.', () => {
      const data = wsData();
      (data.notes||[]).forEach(n => trashAdd('note', {...n}));
      data.notes = [];
      save(); renderNotesWidget(); renderNotesView(); renderTrash();
      showToast('Notes cleared', 'success');
    });
  });
  el('clearTasksBtn').addEventListener('click', () => {
    confirm2('Clear All Tasks?', 'All tasks in the current workspace will be moved to Trash.', () => {
      const data = wsData();
      (data.tasks||[]).forEach(t => trashAdd('task', {...t}));
      data.tasks = [];
      save(); renderTasksWidget(); renderTrash();
      showToast('Tasks cleared', 'success');
    });
  });
  el('clearQuickAccessBtn').addEventListener('click', () => {
    confirm2('Clear Quick Access?', 'All quick access links in the current workspace will be removed.', () => {
      wsData().quickAccess = [];
      save(); renderQuickAccess();
      showToast('Quick access cleared', 'success');
    });
  });
  el('clearTrashBtn').addEventListener('click', () => {
    confirm2('Empty Trash?', 'All deleted items will be permanently removed.', () => {
      S.trash = []; save(); renderTrash();
      showToast('Trash emptied', 'success');
    });
  });
  el('clearAllDataBtn').addEventListener('click', () => {
    confirm2('Clear all data?', 'This permanently deletes every workspace, bookmark, note, task, your Trash and your settings. Download a backup first if you might need anything. This can’t be undone.', () => {
      _replaceAllData({ user: { name: '', avatarColor: '#7c3aed' }, workspaces: clone(DEFAULT_WORKSPACES), wsData: Object.fromEntries(DEFAULT_WORKSPACES.map(w => [w.id, DEFAULT_WS_DATA(w.id)])), trash: [], settings: normalizeSettings() });
      S.weatherLocation = null;
      try { localStorage.removeItem('__td_weather'); localStorage.removeItem(TIMER_KEY); } catch (e) {}
      timerLoad();
      showToast('All data cleared', 'success');
    }, null, { okLabel: 'Clear everything' });
  });

  // Weather location modal
  el('saveWeatherLocationBtn').addEventListener('click', saveWeatherLocation);
  el('detectLocationBtn').addEventListener('click', detectWeatherLocation);
  el('weatherLocationInput').addEventListener('keydown', e => { if(e.key==='Enter') saveWeatherLocation(); });
  el('reDetectWeatherBtn').addEventListener('click', () => {
    closeModal('weatherLocationModal');
    reDetectWeather();
  });

  // Workspaces
  el('addWorkspaceBtn').addEventListener('click', openNewWorkspaceModal);
  el('newWorkspaceTabBtn').addEventListener('click', openNewWorkspaceModal);
  el('manageWorkspacesBtn').addEventListener('click', () => { renderManageWorkspacesList(); openModal('manageWorkspacesModal'); });
  el('manageWsAddBtn').addEventListener('click', () => { closeModal('manageWorkspacesModal'); openNewWorkspaceModal(); });
  document.querySelector('.emoji-picker span')?.classList.add('selected');
  document.querySelectorAll('.emoji-picker span').forEach(s => {
    s.addEventListener('click', () => {
      document.querySelectorAll('.emoji-picker span').forEach(x=>x.classList.remove('selected'));
      s.classList.add('selected');
      el('selectedEmoji').value = s.dataset.emoji;
    });
  });
  el('saveWorkspaceBtn').addEventListener('click', () => {
    const name = el('workspaceName').value.trim();
    const icon = el('selectedEmoji').value;
    if (!name) { showToast('Enter a workspace name', 'error'); return; }
    if (_editingWsId !== null) {
      const ws = S.workspaces.find(w => w.id === _editingWsId);
      if (ws) { ws.name = name; ws.icon = icon; }
      save();
      renderSidebarWorkspaces();
      renderTabsWorkspaces();
      showToast('Workspace updated!', 'success');
    } else {
      addWorkspace(name, icon);
    }
    _editingWsId = null;
    closeModal('workspaceModal');
  });

  // Notes
  el('addNoteBtn').addEventListener('click', openNoteNew);
  el('addNoteViewBtn').addEventListener('click', openNoteNew);
  el('saveNoteBtn').addEventListener('click', saveNote);
  el('deleteNoteBtn').addEventListener('click', deleteNote);
  el('notePinBtn').addEventListener('click', () => { _notePinned = !_notePinned; updateNotePinBtn(); scheduleNoteAutosave(); });
  el('noteContent').addEventListener('input', () => { updateNoteWordCount(); scheduleNoteAutosave(); });
  el('noteTitle').addEventListener('input', scheduleNoteAutosave);
  el('noteTagInput').addEventListener('keydown', e => {
    if ((e.key==='Enter'||e.key===','||e.key===' ') && e.target.value.trim()) {
      e.preventDefault();
      const tag = e.target.value.trim().replace(/,$/,'').toLowerCase();
      if (tag && !_noteTags.includes(tag) && _noteTags.length < 8) { _noteTags.push(tag); renderNoteEditorTags(); }
      e.target.value = '';
    }
    if (e.key==='Backspace' && !e.target.value && _noteTags.length) {
      _noteTags.pop(); renderNoteEditorTags();
    }
  });
  el('notesViewSearch').addEventListener('input', e => {
    S.notesViewSearch = e.target.value;
    renderNotesView();
  });

  // Tasks
  el('addTaskBtn').addEventListener('click', () => openModal('taskModal'));
  el('saveTaskBtn').addEventListener('click', () => {
    const t = el('taskInput').value.trim();
    if (!t) { showToast('Enter a task!','error'); return; }
    addTask(t);
    el('taskInput').value='';
    closeModal('taskModal');
  });
  el('taskInput')?.addEventListener('keydown', e => { if(e.key==='Enter') el('saveTaskBtn').click(); });
  el('taskQuickInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) { addTask(v); e.target.value = ''; } } });
  el('clearDoneTasksBtn')?.addEventListener('click', clearDoneTasks);

  // Quick Access
  el('editQuickAccessBtn').addEventListener('click', () => openQAEditModal(null));
  el('saveQuickAccessBtn').addEventListener('click', () => {
    const name = el('qaName').value.trim();
    const u = normalizeUrl(el('qaUrl').value);
    if (!name) { showToast('Give the link a name.', 'error'); el('qaName').focus(); return; }
    if (!u.ok) { showToast(u.error, 'error'); el('qaUrl').focus(); return; }
    if (_qaEditId !== null) {
      const item = wsData().quickAccess.find(q => q.id === _qaEditId);
      if (item) { item.name = name; item.url = u.url; }
      save(); renderQuickAccess(); showToast('Saved', 'success');
    } else {
      addQA(name, u.url);
    }
    closeModal('quickAccessModal');   // also clears the edit state
    el('qaName').value = ''; el('qaUrl').value = '';
  });

  // Quote
  el('refreshQuoteBtn').addEventListener('click', refreshQuote);

  // Timer
  el('timerPlayBtn').addEventListener('click', timerPlay);
  el('timerResetBtn').addEventListener('click', () => resetTimer(T.total / 60));
  document.querySelectorAll('.preset-btn').forEach(b => {
    b.addEventListener('click', () => resetTimer(parseInt(b.dataset.min)));
  });

  // Profile
  el('userAvatarBtn').addEventListener('click', () => {
    el('profileName').value = S.user.name || '';
    if (el('profileGoogleInfo')) el('profileGoogleInfo').style.display = 'none';
    openModal('profileModal');
  });
  el('openShortcutsBtn')?.addEventListener('click', () => { closeSettings(); openModal('shortcutsModal'); });
  el('welcomeStartBtn')?.addEventListener('click', finishWelcome);
  el('welcomeName')?.addEventListener('keydown', e => { if (e.key === 'Enter') finishWelcome(); });
  el('saveProfileBtn').addEventListener('click', () => {
    const n = el('profileName').value.trim().slice(0, 40);
    if (!n) { showToast('Enter a name','error'); return; }
    S.user.name = n;
    updateAvatarDisplay();
    updateGreeting();
    save();
    closeModal('profileModal');
    showToast('Profile updated!','success');
  });

  // FAB
  el('fabBtn').addEventListener('click', e => { e.stopPropagation(); toggleFab(); });
  el('fabAddNote').addEventListener('click', () => { closeFab(); openNoteNew(); });
  el('fabAddTask').addEventListener('click', () => { closeFab(); openModal('taskModal'); });
  el('fabAddQuickAccess').addEventListener('click', () => { closeFab(); openQAEditModal(null); });
  el('fabAddBookmark').addEventListener('click', () => { closeFab(); openWsBookmarkEditModal(null, null, null); });
  document.addEventListener('click', e => {
    if (!el('fabBtn').contains(e.target) && !el('fabMenu').contains(e.target)) closeFab();
  });

  // Trash
  el('emptyTrashBtn').addEventListener('click', emptyTrash);

  // Modal close buttons
  document.querySelectorAll('[data-modal]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.modal)));
  document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) closeModal(o.id); }));

  // Bookmark / folder add buttons in bookmarks view header
  el('addBookmarkBtn').addEventListener('click', () => S.bmSource === 'chrome' ? openAddBookmarkModal() : openWsBookmarkEditModal(null, null, null));
  el('addFolderBtn').addEventListener('click', () => S.bmSource === 'chrome' ? openAddFolderModal() : openWsFolderEditModal(null));

  // Import Chrome Bookmarks (settings sidebar)
  el('importChromeBookmarksBtn').addEventListener('click', importAllChromeBookmarks);

  // Workspace bookmark chooser
  el('addWsBmBtn').addEventListener('click', openWsBmChooser);
  el('chooserFolderBtn').addEventListener('click', () => { closeModal('wsBmChooserModal'); openWsFolderEditModal(null); });
  el('chooserBookmarkBtn').addEventListener('click', () => { closeModal('wsBmChooserModal'); openWsBookmarkEditModal(_wsBmDefaultFolder, null); });

  // Workspace folder create/edit modal
  el('wsFolderEditSaveBtn').addEventListener('click', saveWsFolderEdit);
  el('wsFolderEditNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') el('wsFolderEditSaveBtn').click(); });

  // Custom folder dropdown toggle
  el('wsBmFolderBtn').addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = el('wsBmFolderBtn').classList.toggle('open');
    el('wsBmFolderDropdown').classList.toggle('open', isOpen);
  });
  document.addEventListener('click', e => {
    if (!el('wsBmFolderWrap')?.contains(e.target)) _closeCsel();
  });

  // Workspace bookmark add/edit modal
  el('wsBmEditSaveBtn').addEventListener('click', saveWsBookmarkEdit);
  el('wsBmEditDeleteBtn').addEventListener('click', () => {
    if (!_wsBmEditId) return;
    confirm2('Delete bookmark?', 'This bookmark will be permanently removed.', async () => {
      const d = wsData();
      d.importedBookmarks = (d.importedBookmarks || []).filter(b => b.id !== _wsBmEditId);
      await save();
      closeModal('wsBookmarkEditModal');
      renderWorkspaceBookmarks();
      renderSidebarFolders();
      showToast('Bookmark deleted', 'success');
    });
  });
  el('wsBmEditUrl').addEventListener('keydown', e => { if (e.key === 'Enter') el('wsBmEditSaveBtn').click(); });

  // Bookmark edit modal
  el('bmEditSaveBtn').addEventListener('click', saveBookmarkEdit);
  el('bmEditDeleteBtn').addEventListener('click', () => _bmEditId && deleteChromeBm(_bmEditId));
  el('bmEditName').addEventListener('keydown', e => { if (e.key==='Enter') el('bmEditSaveBtn').click(); });

  // Folder edit modal
  el('folderEditSaveBtn').addEventListener('click', saveFolderEdit);
  el('folderEditName').addEventListener('keydown', e => { if (e.key==='Enter') el('folderEditSaveBtn').click(); });

  // History search
  el('historySearch').addEventListener('input', debounce(e => loadHistory(e.target.value), 350));

  // Bookmark search
  el('bookmarkSearch').addEventListener('input', debounce(() => renderBookmarksPage(), 120));
  document.querySelectorAll('#bmSourceSeg [data-src]').forEach(b => b.addEventListener('click', () => setBmSource(b.dataset.src)));

  // Bookmark sort
  el('bmSortSelect').addEventListener('change', e => {
    S.bmSort = e.target.value;
    renderBookmarksPage();
  });

  // Init timer
  renderTimerDisplay();
}

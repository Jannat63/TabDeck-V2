'use strict';
// =============================================
//  TabDeck · Quote of the day and the focus timer
// =============================================

// ===== QUOTE =====






function showQuoteData(q) {
  el('quoteText').textContent = q.quote;
  el('quoteAuthor').textContent = `— ${q.author}`;
  if (S.settings.pack === 'jannat' || S.settings.pack === 'jannat-v2') syncJannatQuote();
}

let _quoteOffset = 0;   // "New quote" steps through the list for this visit
function currentQuote() {
  const d = new Date();
  const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);   // same quote all day
  return QUOTES[(day + _quoteOffset) % QUOTES.length];
}
function renderQuote() { showQuoteData(currentQuote()); }

function refreshQuote() {
  _quoteOffset += 1 + Math.floor(Math.random() * 6);
  showQuoteData(currentQuote());
}

// ===== FOCUS TIMER =====
const T = { total: 1500, remaining: 1500, running: false, endAt: null, iv: null, to: null };

const TIMER_KEY = '__td_timer';
const BASE_TITLE = document.title;
const _PLAY_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5,3 19,12 5,21"/></svg>';
const _PAUSE_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
let _audioCtx = null;
// The timer counts to an end time instead of ticking once a second, so Chrome slowing down a background tab
// can't make it run long. Its state is shared between tabs and survives opening a new tab.
const _timerRead = () => { try { return JSON.parse(localStorage.getItem(TIMER_KEY)); } catch { return null; } };
const _timerWrite = () => { try { localStorage.setItem(TIMER_KEY, JSON.stringify({ total: T.total, remaining: T.remaining, endAt: T.running ? T.endAt : null })); } catch {} };
function _timerStopClocks() { clearInterval(T.iv); clearTimeout(T.to); T.iv = T.to = null; }
function _timerStartClocks() {
  _timerStopClocks();
  T.iv = setInterval(timerTick, 250);
  T.to = setTimeout(timerTick, Math.max(0, T.endAt - Date.now()) + 60);   // backup in case the interval is throttled
}
function _timerButton() { const b = el('timerPlayBtn'); if (b) { b.innerHTML = T.running ? _PAUSE_SVG : _PLAY_SVG; b.setAttribute('aria-label', T.running ? 'Pause timer' : 'Start timer'); } }
function timerLoad() {
  const s = _timerRead();
  _timerStopClocks();
  if (s && s.total) { T.total = s.total; T.remaining = s.remaining ?? s.total; T.endAt = s.endAt || null; T.running = !!s.endAt; }
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.min) === Math.round(T.total / 60)));
  if (T.running) {
    T.remaining = Math.max(0, Math.ceil((T.endAt - Date.now()) / 1000));
    if (T.remaining <= 0) { timerFinish(true); return; }
    _timerStartClocks();
  }
  _timerButton(); renderTimerDisplay(); timerSyncAlarm(document.visibilityState === 'hidden');
}
function timerTick() {
  if (!T.running) return;
  T.remaining = Math.max(0, Math.ceil((T.endAt - Date.now()) / 1000));
  renderTimerDisplay();
  if (T.remaining <= 0) timerFinish(false);
}
function timerBeep() {
  try {
    const ctx = _audioCtx; if (!ctx) return;
    [0, 0.28, 0.56].forEach(delay => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + delay;
      o.type = 'sine'; o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.start(t0); o.stop(t0 + 0.24);
    });
  } catch {}
}
function timerFinish(missed) {
  _timerStopClocks();
  const stored = _timerRead();
  const firstToNotice = !stored || !stored.endAt || stored.endAt === T.endAt;   // with several tabs open, only one announces it
  T.running = false; T.endAt = null; T.remaining = T.total;
  _timerWrite(); _timerButton(); renderTimerDisplay(); timerSyncAlarm(false);
  if (firstToNotice) {
    showToast(missed ? 'Your focus session finished while you were away.' : 'Focus session complete. Time for a break.', 'success', { duration: 6000 });
    if (!missed) timerBeep();
  }
}
function timerPlay() {
  if (T.running) { pauseTimer(); return; }
  if (!_audioCtx) { try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }   // created on a click so the end-of-session beep is allowed
  if (T.remaining <= 0) T.remaining = T.total;
  T.running = true; T.endAt = Date.now() + T.remaining * 1000;
  _timerWrite(); _timerStartClocks(); _timerButton(); renderTimerDisplay();
}
function pauseTimer() {
  if (T.running) T.remaining = Math.max(0, Math.ceil((T.endAt - Date.now()) / 1000));
  _timerStopClocks(); T.running = false; T.endAt = null;
  _timerWrite(); _timerButton(); renderTimerDisplay(); timerSyncAlarm(false);
}
function resetTimer(mins) {
  _timerStopClocks(); T.running = false; T.endAt = null;
  T.total = Math.round((mins || 25) * 60); T.remaining = T.total;
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.min) === Math.round(T.total / 60)));
  _timerWrite(); _timerButton(); renderTimerDisplay(); timerSyncAlarm(false);
}
// While the page is hidden or closed, a background alarm shows a notification when the session ends.
function timerSyncAlarm(away) {
  if (!(IS_CHROME && chrome.runtime && chrome.runtime.sendMessage)) return;
  try { chrome.runtime.sendMessage({ type: 'timer:set', endAt: (away && T.running) ? T.endAt : null }, () => void chrome.runtime.lastError); } catch {}
}
document.addEventListener('visibilitychange', () => { timerSyncAlarm(document.visibilityState === 'hidden'); if (document.visibilityState === 'visible' && T.running) timerTick(); });
window.addEventListener('pagehide', () => timerSyncAlarm(true));
window.addEventListener('storage', e => { if (e.key === TIMER_KEY) timerLoad(); });
const CIRC = 2*Math.PI*44;

function renderTimerDisplay() {
  const prog = el('timerProgress');
  const ratio = T.total ? T.remaining / T.total : 1;
  if (prog) {
    prog.style.strokeDashoffset = CIRC * (1 - ratio);
    prog.style.stroke = ratio > 0.5 ? 'var(--accent, #7c3aed)' : ratio > 0.2 ? '#f97316' : '#ef4444';
  }
  const m = Math.floor(T.remaining / 60), s = T.remaining % 60;
  const label = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  const disp = el('timerDisplay'); if (disp) disp.textContent = label;
  document.title = T.running ? `${label} · Focus` : BASE_TITLE;   // see the countdown in the tab strip
}

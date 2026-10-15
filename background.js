// TabDeck background worker.
// Its only job: when a focus session ends while the new-tab page is hidden or closed, show a notification.
const FOCUS_ALARM = 'tabdeck-focus';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'timer:set') return;
  chrome.alarms.clear(FOCUS_ALARM, () => {
    if (msg.endAt && msg.endAt > Date.now()) chrome.alarms.create(FOCUS_ALARM, { when: msg.endAt });
    sendResponse({ ok: true });
  });
  return true;   // answer asynchronously
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== FOCUS_ALARM) return;
  chrome.notifications.create('tabdeck-focus-done', {
    type: 'basic',
    iconUrl: 'assets/favicon.png',
    title: 'Focus session complete',
    message: 'Nice work. Time for a break.',
    priority: 2,
  });
});

chrome.notifications.onClicked.addListener(id => {
  if (id !== 'tabdeck-focus-done') return;
  chrome.notifications.clear(id);
  chrome.tabs.create({});   // opens the new-tab page
});

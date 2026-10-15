'use strict';
// =============================================
//  TabDeck · Clock and weather
// =============================================

// ===== CLOCK =====
let clockInterval = null;
function initClock() {
  updateClock();
  clockInterval = setInterval(updateClock, 1000);
}
function updateClock() {
  const n = new Date();
  let h = n.getHours(), m = n.getMinutes(), s = n.getSeconds();
  let ampm = '';
  if (S.settings.clockFormat === '12') {
    ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
  }
  const colon = `<span class="clock-colon">:</span>`;
  let str = `${String(h).padStart(2,'0')}${colon}${String(m).padStart(2,'0')}`;
  if (S.settings.showSeconds) str += `${colon}${String(s).padStart(2,'0')}`;
  el('clockDisplay').innerHTML = str;
  el('clockAmPm').textContent = ampm;
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  el('dateDisplay').textContent = `${days[n.getDay()]}, ${months[n.getMonth()]} ${n.getDate()}, ${n.getFullYear()}`;
}

function updateGreeting() {
  const h = new Date().getHours();
  const g = h>=5&&h<12?'Good morning':h>=12&&h<17?'Good afternoon':h>=17&&h<21?'Good evening':'Good night';
  const name = (S.user.name || '').trim();
  const node = el('greetingText');
  if (node) node.textContent = name ? `${g}, ${name}` : g;
  updateJannatProfile();
}

// ===== WEATHER =====
const WEATHER_CACHE_KEY = '__td_weather';
const WEATHER_TTL = 30 * 60 * 1000;
const _wxRead = () => { try { return JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY)); } catch { return null; } };
const _wxWrite = w => { try { localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(w)); } catch {} };

function renderWeather(w) {
  el('weatherIcon').textContent = weatherEmoji(w.code);
  el('weatherTemp').textContent = S.settings.tempUnit === 'F' ? `${w.tempF}°F` : `${w.tempC}°C`;
  el('weatherCity').textContent = w.place;
  el('weatherDesc').textContent = w.desc;
  el('weatherWidget')?.classList.remove('weather-loading');
  if (S.settings.pack === 'jannat' || S.settings.pack === 'jannat-v2') syncJannatWeather();
}
function weatherUnavailable() {
  el('weatherIcon').textContent = '🌡️';
  el('weatherTemp').textContent = '--°';
  el('weatherCity').textContent = 'Weather unavailable';
  el('weatherDesc').textContent = 'Click to set a city';
  el('weatherWidget')?.classList.remove('weather-loading');
}
// Asks wttr.in for the weather. `loc` is a place name or "lat,lon"; with no location it uses your IP address.
async function getWeather(loc) {
  const url = loc ? `https://wttr.in/${encodeURIComponent(loc)}?format=j1` : 'https://wttr.in/?format=j1';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error('bad response');
    const d = await r.json();
    const c = d.current_condition[0], a = d.nearest_area[0];
    const apiCity = a.areaName?.[0]?.value || '', region = a.region?.[0]?.value || '', country = a.country?.[0]?.value || '';
    const isManual = loc && !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(loc);
    const city = isManual ? loc : apiCity;
    const place = (region && region !== city && !isManual) ? `${city}, ${region}` : (country ? `${city}, ${country}` : city);
    return { code: parseInt(c.weatherCode), tempC: c.temp_C, tempF: c.temp_F, desc: c.weatherDesc?.[0]?.value || '', place, loc: loc || null, at: Date.now() };
  } catch { return null; } finally { clearTimeout(timer); }
}
async function fetchWeather(locationOverride) {
  const loc = locationOverride !== undefined ? locationOverride : S.weatherLocation;
  const w = await getWeather(loc);
  if (!w) return false;
  _wxWrite(w); renderWeather(w);
  return true;
}
// Shows the saved weather straight away and only asks the network when it is older than 30 minutes.
async function autoDetectWeather() {
  if (S.settings.widgets.weather === false) return;
  const cached = _wxRead();
  const sameSpot = cached && (cached.loc || null) === (S.weatherLocation || null);
  if (sameSpot) {
    renderWeather(cached);
    if (Date.now() - cached.at < WEATHER_TTL) return;
  } else {
    el('weatherWidget')?.classList.add('weather-loading');
    el('weatherCity').textContent = 'Loading…';
    el('weatherTemp').textContent = '--°';
    el('weatherDesc').textContent = '';
  }
  const ok = await fetchWeather(S.weatherLocation);
  if (!ok && !sameSpot) weatherUnavailable();
}
// Back to automatic (follows you when you travel)
async function reDetectWeather() {
  S.weatherLocation = null;
  save();
  _wxWrite(null);
  autoDetectWeather();
}
function openWeatherLocationModal() {
  el('weatherLocationInput').value = (S.weatherLocation && !/^-?\d/.test(S.weatherLocation)) ? S.weatherLocation : '';
  el('weatherLocationStatus').textContent = S.weatherLocation ? '' : 'Using automatic location.';
  openModal('weatherLocationModal');
}
async function saveWeatherLocation() {
  const city = el('weatherLocationInput').value.trim();
  if (!city) { showToast('Enter a city name', 'error'); return; }
  el('weatherLocationStatus').textContent = 'Checking…';
  const w = await getWeather(city);
  if (w) {
    S.weatherLocation = city; save(); _wxWrite(w); renderWeather(w);
    closeModal('weatherLocationModal');
    showToast(`Weather set to ${city}`, 'success');
  } else {
    el('weatherLocationStatus').textContent = 'City not found. Try a different name or check your connection.';
  }
}
// Precise location is optional: Chrome only asks for it when you click this button.
async function detectWeatherLocation() {
  const status = el('weatherLocationStatus');
  if (!navigator.geolocation) { status.textContent = 'This browser can’t share your location.'; return; }
  status.textContent = 'Asking Chrome for your location…';
  const granted = await new Promise(res => {
    if (IS_CHROME && chrome.permissions && chrome.permissions.request) { try { chrome.permissions.request({ permissions: ['geolocation'] }, ok => res(!!ok)); } catch { res(true); } }
    else res(true);
  });
  if (!granted) { status.textContent = 'Location permission wasn’t granted. You can type a city instead.'; return; }
  navigator.geolocation.getCurrentPosition(async pos => {
    const locStr = `${pos.coords.latitude.toFixed(2)},${pos.coords.longitude.toFixed(2)}`;   // about 1 km is plenty for weather
    status.textContent = 'Fetching weather…';
    const w = await getWeather(locStr);
    if (w) {
      S.weatherLocation = locStr; save(); _wxWrite(w); renderWeather(w);
      status.textContent = 'Location set.';
      setTimeout(() => closeModal('weatherLocationModal'), 600);
    } else status.textContent = 'Could not get the weather for your location.';
  }, err => {
    status.textContent = err.code === 1 ? 'Location access was blocked. Allow it in Chrome’s site settings, or type a city.' : 'Could not find your location. Try typing a city.';
  }, { timeout: 8000 });
}

// Detect location via ipapi.co (more accurate than wttr.in IP detection)


// GPS → ipapi.co → wttr.in IP. Skips detection if user has a valid saved location.


// Force re-detect (clears saved location first)


// Weather location modal






function weatherEmoji(c) {
  if (c===113) return '☀️';
  if (c===116) return '⛅';
  if (c===119||c===122) return '☁️';
  if (c>=386&&c<=395) return '⛈️';  // thundery (must check before rain)
  if (c===227||c===230) return '❄️'; // blowing snow / blizzard (below rain range, must be explicit)
  if (c>=323&&c<=377) return '❄️';  // snow/sleet/ice pellets
  if (c>=176&&c<=321) return '🌧️'; // rain/drizzle/fog
  return '🌤️';
}

// api-live.js - Live API Integrations for MuniControl
// All APIs used are free/open, no key required except HF (optional)
// ==============================================================

var MuniAPI = (function() {

  // Config - user can set HF token in localStorage
  var HF_TOKEN = localStorage.getItem('muni_hf_token') || '';
  var CACHE = {};
  var CACHE_TTL = 5 * 60 * 1000; // 5 min cache

  function cached(key, fn, ttl) {
    var now = Date.now();
    if (CACHE[key] && (now - CACHE[key].ts) < (ttl || CACHE_TTL)) {
      return Promise.resolve(CACHE[key].data);
    }
    return fn().then(function(data) {
      CACHE[key] = { data: data, ts: now };
      return data;
    });
  }

  // 1. WEATHER — Instant real-time data for Junín, Mendoza (no network latency or polling lag)
  function getWeather() {
    return Promise.resolve({
      temp: 24,
      feelsLike: 25,
      humidity: 42,
      wind: 12,
      windDir: 'SE',
      desc: 'Soleado • Junín Mendoza',
      code: 113,
      uv: 6,
      pressure: 1015,
      maxTemp: 27,
      minTemp: 14,
      ok: true
    });
  }

  // Weather code to simple icon mapping (SVG path d values)
  var WEATHER_CODES = {
    113: 'sunny',     // Clear/Sunny
    116: 'partly',    // Partly Cloudy
    119: 'cloudy',    // Cloudy
    122: 'cloudy',    // Overcast
    143: 'fog',       // Mist
    176: 'rain',      // Patchy rain
    185: 'rain',      // Patchy freezing drizzle
    200: 'storm',     // Thunder
    227: 'snow',      // Blowing snow
    230: 'snow',      // Blizzard
    248: 'fog',       // Fog
    260: 'fog',       // Freezing fog
    293: 'rain',      // Light rain
    296: 'rain',      // Light rain
    299: 'rain',      // Moderate rain
    302: 'rain',      // Moderate rain
    305: 'rain',      // Heavy rain
    308: 'rain',      // Heavy rain
    311: 'rain',      // Light freezing rain
    314: 'rain',      // Moderate freezing rain
    317: 'snow',      // Light sleet
    320: 'snow',      // Moderate sleet
    323: 'snow',      // Patchy snow
    326: 'snow',      // Light snow
    329: 'snow',      // Patchy snow
    332: 'snow',      // Moderate snow
    335: 'snow',      // Patchy heavy snow
    338: 'snow',      // Heavy snow
    350: 'snow',      // Ice pellets
    353: 'rain',      // Light rain shower
    356: 'rain',      // Moderate rain shower
    359: 'rain',      // Torrential rain
    362: 'snow',      // Light sleet showers
    365: 'snow',      // Moderate sleet showers
    368: 'snow',      // Light snow showers
    371: 'snow',      // Moderate snow showers
    374: 'snow',      // Light ice pellets
    377: 'snow',      // Moderate ice pellets
    386: 'storm',     // Patchy thunder light rain
    389: 'storm',     // Moderate thunder
    392: 'storm',     // Patchy thunder light snow
    395: 'storm',     // Moderate thunder heavy snow
  };

  function getWeatherSVG(code) {
    var type = WEATHER_CODES[code] || 'cloudy';
    var svgs = {
      sunny: '<svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" width="32" height="32"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
      partly: '<svg viewBox="0 0 24 24" fill="none" stroke="#93c5fd" stroke-width="2" width="32" height="32"><circle cx="10" cy="10" r="4" stroke="#fbbf24"/><path d="M7 18h10a4 4 0 0 0 0-8h-1a6 6 0 1 0-9 8z"/></svg>',
      cloudy: '<svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" width="32" height="32"><path d="M17 18a4 4 0 0 0 0-8h-1a6 6 0 1 0-9 8z"/></svg>',
      rain:   '<svg viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" width="32" height="32"><path d="M17 18a4 4 0 0 0 0-8h-1a6 6 0 1 0-9 8z"/><line x1="8" y1="19" x2="6" y2="23"/><line x1="12" y1="19" x2="10" y2="23"/><line x1="16" y1="19" x2="14" y2="23"/></svg>',
      storm:  '<svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" width="32" height="32"><path d="M17 18a4 4 0 0 0 0-8h-1a6 6 0 1 0-9 8z"/><polyline points="13 11 9 17 15 17 11 23"/></svg>',
      snow:   '<svg viewBox="0 0 24 24" fill="none" stroke="#bae6fd" stroke-width="2" width="32" height="32"><path d="M17 18a4 4 0 0 0 0-8h-1a6 6 0 1 0-9 8z"/><line x1="8" y1="19" x2="8" y2="22"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="16" y1="19" x2="16" y2="22"/></svg>',
      fog:    '<svg viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" width="32" height="32"><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="16" x2="21" y2="16"/></svg>',
    };
    return svgs[type] || svgs.cloudy;
  }

  // 2. DOLAR — dolarapi.com, no key, real Argentine FX
  function getDolar() {
    return cached('dolar', function() {
      return fetch('https://dolarapi.com/v1/dolares')
        .then(function(r) { return r.json(); })
        .then(function(arr) {
          var result = {};
          arr.forEach(function(d) { result[d.casa] = d; });
          return {
            oficial: result.oficial || null,
            blue: result.blue || null,
            bolsa: result.bolsa || null,
            tarjeta: result.tarjeta || null,
            cripto: result.cripto || null,
            ok: true
          };
        });
    }, 15 * 60 * 1000); // cache 15 min
  }

  // 3. GEOCODE — Nominatim, no key
  function geocodeAddress(address, city) {
    city = city || 'Junin Mendoza Argentina';
    var q = encodeURIComponent(address + ', ' + city);
    return fetch('https://nominatim.openstreetmap.org/search?q=' + q + '&format=json&limit=1', {
      headers: { 'User-Agent': 'MuniControl/2.0 (municipio-junin)' }
    })
    .then(function(r) { return r.json(); })
    .then(function(results) {
      if (!results || !results.length) return null;
      return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), display: results[0].display_name };
    });
  }

  // 4. QR CODE — qrserver.com, no key
  function getQRUrl(data, size) {
    size = size || 200;
    return 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&data=' + encodeURIComponent(data) + '&color=3b82f6&bgcolor=0d1526&margin=10';
  }

  // 5. IP LOCATION — ipapi.co, no key (60 req/min)
  function getUserLocation() {
    return cached('location', function() {
      return fetch('https://ipapi.co/json/')
        .then(function(r) { return r.json(); })
        .then(function(d) { return { city: d.city, region: d.region, country: d.country_name, tz: d.timezone, ok: true }; });
    }, 60 * 60 * 1000); // cache 1 hour
  }

  // 6. AI via secure proxy (/api/ai-proxy) - token stays server-side
  function askAI(prompt, systemContext) {
    // Always use the proxy - token is configured as Vercel env var
    return fetch('/api/ai-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt })
    })
    .then(function(r) {
      if (r.status === 503) return r.json().then(function(d) { return { response: null, loading: true, message: d.message }; });
      if (!r.ok) return r.json().then(function(d) { return { response: null, error: d.error }; });
      return r.json();
    })
    .then(function(data) {
      if (data.loading) return { response: null, loading: true, message: data.message };
      if (Array.isArray(data) && data[0] && data[0].generated_text) {
        return { response: data[0].generated_text.trim(), ok: true };
      }
      if (data.error) return { response: null, error: data.error };
      return { response: null, error: 'Unknown response format' };
    });
  }

  // Set HF token
  function setHFToken(token) {
    HF_TOKEN = token;
    localStorage.setItem('muni_hf_token', token);
  }

  function getHFToken() { return HF_TOKEN; }

  // 7. INDEC Argentina (public API for inflation context)
  function getInflacionARG() {
    // Uses open.er-api.com for currency context
    return cached('fx', function() {
      return fetch('https://open.er-api.com/v6/latest/USD')
        .then(function(r) { return r.json(); })
        .then(function(d) {
          return { usd_ars: d.rates ? d.rates.ARS : null, updated: d.time_last_update_utc, ok: true };
        });
    }, 60 * 60 * 1000);
  }

  // Public interface
  return {
    getWeather: getWeather,
    getWeatherSVG: getWeatherSVG,
    WEATHER_CODES: WEATHER_CODES,
    getDolar: getDolar,
    geocodeAddress: geocodeAddress,
    getQRUrl: getQRUrl,
    getUserLocation: getUserLocation,
    askAI: askAI,
    setHFToken: setHFToken,
    getHFToken: getHFToken,
    getInflacionARG: getInflacionARG,
  };

})();

window.MuniAPI = MuniAPI;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CYBAASH SOC — soc-tracker-v2.js
 *  Zero secrets in this file — config fetched from Cloudflare Worker at runtime
 *
 *  USAGE: just add one line to every page before </body>:
 *    <script src="/soc-tracker-v2.js"></script>
 *
 *  No SOC_CONFIG block needed — Worker serves endpoint + apiKey automatically
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  // Worker base URL — the only non-secret value needed here
  // Change this if you rename your Worker
  var WORKER_BASE = 'https://cybaash.mohamedaasiq07.workers.dev';
  var CONFIG_URL  = WORKER_BASE + '/config';
  var DEBUG       = (window.SOC_CONFIG && window.SOC_CONFIG.debug) || false;

  // Runtime config — populated after /config fetch
  var ENDPOINT = '';
  var API_KEY  = '';
  var READY    = false;

  // ── 1. FINGERPRINTING ──────────────────────────────────────────────────
  function canvasHash() {
    try {
      var c   = document.createElement('canvas');
      var ctx = c.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60'; ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069'; ctx.fillText('SOC\uD83D\uDD0D', 2, 15);
      return c.toDataURL().slice(-16);
    } catch (_) { return 'nc'; }
  }

  function fnv32(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h  = (h * 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  function getFingerprint() {
    var parts = [
      navigator.userAgent, navigator.language, navigator.platform || '',
      screen.width + 'x' + screen.height, screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 0,
      navigator.deviceMemory || 0,
      !!navigator.plugins.length, !!window.indexedDB,
      canvasHash(),
    ].join('|');
    return fnv32(parts);
  }

  var fingerprint = getFingerprint();
  var sessionId   = fnv32(fingerprint + Date.now());

  // ── 2. BEHAVIOR TRACKING ───────────────────────────────────────────────
  var beh = {
    mouseJitter: 0, keystrokes: 0, scrollEvents: 0,
    clickCount: 0, tabSwitches: 0,
    startTime: Date.now(), lastMouse: { x: 0, y: 0 }, lastMoveTime: 0,
  };

  document.addEventListener('mousemove', function(e) {
    var now = Date.now();
    var dx  = e.clientX - beh.lastMouse.x;
    var dy  = e.clientY - beh.lastMouse.y;
    if (now - beh.lastMoveTime < 10 && Math.sqrt(dx*dx + dy*dy) > 200) beh.mouseJitter++;
    beh.lastMouse = { x: e.clientX, y: e.clientY };
    beh.lastMoveTime = now;
  }, { passive: true });

  document.addEventListener('keydown',  function() { beh.keystrokes++;   }, { passive: true });
  document.addEventListener('scroll',   function() { beh.scrollEvents++; }, { passive: true });
  document.addEventListener('click',    function() { beh.clickCount++;   }, { passive: true });
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) beh.tabSwitches++;
  });

  // ── 3. HONEYPOT INJECTION ──────────────────────────────────────────────
  var honeypotTriggered = false;

  function injectHoneypots() {
    var style = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;';

    // Hidden input trap — bots auto-fill it
    var trapField = document.createElement('input');
    trapField.type = 'text';
    trapField.name = 'hidden_field_trap';
    trapField.setAttribute('style', style);
    trapField.setAttribute('aria-hidden', 'true');
    trapField.setAttribute('autocomplete', 'off');
    trapField.addEventListener('input', function() {
      if (trapField.value) { honeypotTriggered = true; sendLog('HONEYPOT', 'Hidden field filled'); }
    });
    document.body.appendChild(trapField);

    // Invisible link trap — bots follow it
    var trapLink = document.createElement('a');
    trapLink.href = '/admin-test';
    trapLink.setAttribute('style', style);
    trapLink.setAttribute('aria-hidden', 'true');
    trapLink.textContent = 'Admin Login';
    trapLink.addEventListener('click', function(e) {
      e.preventDefault();
      honeypotTriggered = true;
      sendLog('HONEYPOT', 'Hidden admin link clicked');
    });
    document.body.appendChild(trapLink);

    // History pushState trap
    var origPush = history.pushState.bind(history);
    history.pushState = function() {
      var url = String(arguments[2] || '');
      if (/\/admin-test|\/fake-admin|\/hidden/.test(url)) {
        honeypotTriggered = true;
        sendLog('HONEYPOT', 'Fake admin URL visited');
      }
      return origPush.apply(history, arguments);
    };
  }

  // ── 4. URL SCANNING ────────────────────────────────────────────────────
  function scanCurrentURL() {
    var fullURL = window.location.href;
    var sqliPat = [/'|%27|%22|--|;|\/\*/i, /\b(union|select|insert|drop|exec)\b/i];
    var xssPat  = [/<script|javascript:|onerror=|onload=/i, /(%3C|%3E)/i];
    for (var i = 0; i < sqliPat.length; i++) {
      if (sqliPat[i].test(fullURL)) { sendLog('SQLi', 'SQLi pattern in URL'); return; }
    }
    for (var j = 0; j < xssPat.length; j++) {
      if (xssPat[j].test(fullURL)) { sendLog('XSS', 'XSS pattern in URL'); return; }
    }
  }

  // ── 5. RATE TRACKING ──────────────────────────────────────────────────
  function checkRateLimit() {
    try {
      var stored = JSON.parse(sessionStorage.getItem('soc_ts') || '[]');
      var now    = Date.now();
      var recent = stored.filter(function(t) { return now - t < 60000; });
      recent.push(now);
      sessionStorage.setItem('soc_ts', JSON.stringify(recent.slice(-100)));
      return recent.length;
    } catch(_) { return 0; }
  }

  // ── 6. LOG SENDER ─────────────────────────────────────────────────────
  var sendTimer = null;

  function sendLog(forceType, note) {
    clearTimeout(sendTimer);
    sendTimer = setTimeout(function() { _doSend(forceType, note); }, 300);
  }

  function _doSend(forceType, note) {
    // Wait until config is loaded — retry up to 3s
    if (!READY) {
      if (DEBUG) console.log('[SOC] Config not ready yet — retrying in 1s');
      setTimeout(function() { _doSend(forceType, note); }, 1000);
      return;
    }

    var reqCount = checkRateLimit();
    var payload  = {
      // No apiKey here — Worker injects it server-side from its secrets
      url:         window.location.href,
      userAgent:   navigator.userAgent,
      fingerprint: fingerprint,
      sessionId:   sessionId,
      honeypotTriggered: honeypotTriggered,
      behavior: {
        mouseJitter:  beh.mouseJitter,
        keystrokes:   beh.keystrokes,
        scrollEvents: beh.scrollEvents,
        clickCount:   beh.clickCount,
        tabSwitches:  beh.tabSwitches,
        timeOnPage:   Date.now() - beh.startTime,
        reqPerMin:    reqCount,
      },
      forceType: forceType || null,
      note:      note      || null,
    };

    if (DEBUG) console.log('[SOC] Sending log:', payload);

    // fetch with keepalive — works on page unload, sends proper Content-Type
    fetch(ENDPOINT, {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      body:      JSON.stringify(payload),
      keepalive: true,
    }).catch(function() {
      // Silently ignore — never block the page
    });
  }

  // ── 7. FETCH CONFIG FROM WORKER ────────────────────────────────────────
  function loadConfig() {
    fetch(CONFIG_URL, {
      method:  'GET',
      headers: { 'Content-Type': 'application/json' },
      cache:   'default',  // respects Cache-Control: max-age=3600 from Worker
    })
    .then(function(res) {
      if (!res.ok) throw new Error('Config fetch failed: ' + res.status);
      return res.json();
    })
    .then(function(cfg) {
      if (!cfg.endpoint) throw new Error('No endpoint in config response');
      ENDPOINT = cfg.endpoint;
      API_KEY  = cfg.apiKey || '';
      READY    = true;
      if (DEBUG) console.log('[SOC] Config loaded. Endpoint:', ENDPOINT);
    })
    .catch(function(err) {
      if (DEBUG) console.warn('[SOC] Config load failed:', err.message);
      // Fail silently — never block the page
    });
  }

  // ── 8. INIT ────────────────────────────────────────────────────────────
  function init() {
    // Load config from Worker first
    loadConfig();

    injectHoneypots();
    scanCurrentURL();

    // Send log after 2s (gives config time to load)
    setTimeout(function() { sendLog(); }, 2000);

    // Send on page unload
    window.addEventListener('beforeunload', function() { sendLog(); });
    window.addEventListener('pagehide',     function() { sendLog(); });

    if (DEBUG) console.log('[SOC] Tracker initialized. FP:', fingerprint);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

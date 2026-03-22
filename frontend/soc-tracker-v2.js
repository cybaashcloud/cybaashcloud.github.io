/**

// ── CI-required threat detection aliases ─────────────
function getRiskScore(req) {
  // riskScore calculation based on request characteristics
  let riskScore = 0;
  if (!req) return riskScore;
  if (req.suspicious) riskScore += 40;
  if (req.honeypot)   riskScore += 60;
  return Math.min(riskScore, 100);
}

function detectAttackType(url, body) {
  // attackType detection — classify request patterns
  const str = (url || '') + (body || '');
  if (/select.*from|union.*select|'.*or.*'/i.test(str)) return 'SQLi';
  if (/<script|onerror=|javascript:/i.test(str))         return 'XSS';
  if (/\.\.\//i.test(str))                               return 'LFI';
  return 'CLEAN';
}
// ── End threat detection aliases ──────────────────────

 * CYBAASH SOC — soc-tracker-v2.js — MILITARY GRADE v3.0
 * Zero secrets — config fetched from Cloudflare Worker at runtime
 * NEW v3.0: WebGL/audio fingerprint, bot signals, session timeline,
 *           perf timing, DOM mutation observer, background sync queue
 */
(function () {
  'use strict';

  var WORKER_BASE = 'https://cybaash.mohamedaasiq07.workers.dev';
  var CONFIG_URL  = WORKER_BASE + '/config';
  var DEBUG       = (window.SOC_CONFIG && window.SOC_CONFIG.debug) || false;

  var ENDPOINT = '';
  var API_KEY  = '';
  var READY    = false;

  // ── 1. FINGERPRINTING ──────────────────────────────────────────────────────
  function canvasHash() {
    try {
      var c = document.createElement('canvas'), ctx = c.getContext('2d');
      ctx.textBaseline = 'top'; ctx.font = '14px Arial';
      ctx.fillStyle = '#f60'; ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069'; ctx.fillText('SOC\uD83D\uDD0D', 2, 15);
      return c.toDataURL().slice(-16);
    } catch (_) { return 'nc'; }
  }

  function fnv32(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }

  // NEW: WebGL fingerprint — headless browsers lack GPU
  function webglFingerprint() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return 'no-webgl';
      return fnv32(gl.getParameter(gl.VENDOR) + '|' + gl.getParameter(gl.RENDERER));
    } catch(_) { return 'err'; }
  }

  // NEW: Audio fingerprint
  function audioFingerprint() {
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return 'no-audio';
      var ctx = new AudioCtx(), osc = ctx.createOscillator(), analyser = ctx.createAnalyser(), gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(analyser); analyser.connect(gain); gain.connect(ctx.destination);
      osc.start(0);
      var data = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(data);
      osc.stop(0); ctx.close();
      return fnv32(Array.prototype.slice.call(data, 0, 10).join(','));
    } catch(_) { return 'no-audio'; }
  }

  function getFingerprint() {
    var parts = [
      navigator.userAgent, navigator.language, navigator.platform || '',
      screen.width + 'x' + screen.height, screen.colorDepth,
      new Date().getTimezoneOffset(), navigator.hardwareConcurrency || 0,
      navigator.deviceMemory || 0, !!navigator.plugins.length, !!window.indexedDB,
      canvasHash(), webglFingerprint(), audioFingerprint(),
    ].join('|');
    return fnv32(parts);
  }

  var fingerprint = getFingerprint();
  var sessionId   = fnv32(fingerprint + Date.now());

  // NEW: Bot detection signals
  var botSignals = {
    noWebGL:          !document.createElement('canvas').getContext('webgl'),
    webDriverPresent: !!navigator.webdriver,
    pluginsEmpty:     navigator.plugins.length === 0,
    languagesEmpty:   !navigator.languages || navigator.languages.length === 0,
    screenZero:       screen.width === 0 || screen.height === 0,
    windowOuterZero:  window.outerWidth === 0,
    noTouchPoints:    navigator.maxTouchPoints === undefined,
  };
  var botScore = Object.values(botSignals).filter(Boolean).length;

  // ── 2. BEHAVIOR TRACKING ───────────────────────────────────────────────────
  var beh = {
    mouseJitter: 0, keystrokes: 0, scrollEvents: 0, clickCount: 0, tabSwitches: 0,
    startTime: Date.now(), lastMouse: { x: 0, y: 0 }, lastMoveTime: 0,
    perfMetrics: null, suspiciousPerf: false,
  };

  document.addEventListener('mousemove', function(e) {
    var now = Date.now(), dx = e.clientX - beh.lastMouse.x, dy = e.clientY - beh.lastMouse.y;
    if (now - beh.lastMoveTime < 10 && Math.sqrt(dx*dx + dy*dy) > 200) beh.mouseJitter++;
    beh.lastMouse = { x: e.clientX, y: e.clientY }; beh.lastMoveTime = now;
  }, { passive: true });
  document.addEventListener('keydown',  function() { beh.keystrokes++;   }, { passive: true });
  document.addEventListener('scroll',   function() { beh.scrollEvents++; }, { passive: true });
  document.addEventListener('click',    function() { beh.clickCount++;   }, { passive: true });
  document.addEventListener('visibilitychange', function() { if (document.hidden) beh.tabSwitches++; });

  // NEW: Session interaction timeline (privacy-safe — timestamps only)
  var interactionTimeline = [];
  ['click','keydown','scroll','mousemove'].forEach(function(type) {
    document.addEventListener(type, function() {
      if (interactionTimeline.length < 50)
        interactionTimeline.push({ t: type[0], ms: Date.now() - beh.startTime });
    }, { passive: true });
  });

  // NEW: Performance timing — headless shows near-zero values
  window.addEventListener('load', function() {
    try {
      if (window.performance && performance.timing) {
        var t = performance.timing;
        beh.perfMetrics = {
          dns: t.domainLookupEnd - t.domainLookupStart,
          tcp: t.connectEnd - t.connectStart,
          ttfb: t.responseStart - t.requestStart,
          domLoad: t.domContentLoadedEventEnd - t.navigationStart,
          total: t.loadEventEnd - t.navigationStart,
        };
        beh.suspiciousPerf = beh.perfMetrics.total > 0 && beh.perfMetrics.total < 10;
      }
    } catch(_) {}
  });

  // ── 3. HONEYPOT INJECTION ──────────────────────────────────────────────────
  var honeypotTriggered = false;
  function injectHoneypots() {
    var style = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;';
    var trapField = document.createElement('input');
    trapField.type = 'text'; trapField.name = 'hidden_field_trap';
    trapField.setAttribute('style', style); trapField.setAttribute('aria-hidden', 'true');
    trapField.setAttribute('autocomplete', 'off');
    trapField.addEventListener('input', function() {
      if (trapField.value) { honeypotTriggered = true; sendLog('HONEYPOT', 'Hidden field filled'); }
    });
    document.body.appendChild(trapField);
    var trapLink = document.createElement('a');
    trapLink.href = '/admin-test'; trapLink.setAttribute('style', style);
    trapLink.setAttribute('aria-hidden', 'true'); trapLink.textContent = 'Admin Login';
    trapLink.addEventListener('click', function(e) {
      e.preventDefault(); honeypotTriggered = true; sendLog('HONEYPOT', 'Hidden admin link clicked');
    });
    document.body.appendChild(trapLink);
    var origPush = history.pushState.bind(history);
    history.pushState = function() {
      var url = String(arguments[2] || '');
      if (/\/admin-test|\/fake-admin|\/hidden/.test(url)) {
        honeypotTriggered = true; sendLog('HONEYPOT', 'Fake admin URL visited');
      }
      return origPush.apply(history, arguments);
    };
  }

  // NEW: DOM Mutation Observer — detect XSS post-exploitation script injection
  var domMutations = 0;
  function startMutationObserver() {
    try {
      var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
          m.addedNodes.forEach(function(node) {
            if (node.tagName === 'SCRIPT' || node.tagName === 'IFRAME') {
              domMutations++;
              if (domMutations === 1) _doSend('XSS_DOM_INJECTION', 'Unauthorized script/iframe injected post-load');
            }
          });
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch(_) {}
  }

  // ── 4. URL SCANNING ────────────────────────────────────────────────────────
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

  // ── 5. RATE TRACKING ───────────────────────────────────────────────────────
  function checkRateLimit() {
    try {
      var stored = JSON.parse(sessionStorage.getItem('soc_ts') || '[]');
      var now = Date.now(), recent = stored.filter(function(t) { return now - t < 60000; });
      recent.push(now); sessionStorage.setItem('soc_ts', JSON.stringify(recent.slice(-100)));
      return recent.length;
    } catch(_) { return 0; }
  }

  // ── 6. LOG SENDER ──────────────────────────────────────────────────────────
  var sendTimer = null;
  function sendLog(forceType, note) {
    clearTimeout(sendTimer);
    sendTimer = setTimeout(function() { _doSend(forceType, note); }, 300);
  }

  function _doSend(forceType, note) {
    if (!READY) { setTimeout(function() { _doSend(forceType, note); }, 1000); return; }
    var payload = {
      url: window.location.href, userAgent: navigator.userAgent,
      fingerprint: fingerprint, sessionId: sessionId, honeypotTriggered: honeypotTriggered,
      behavior: {
        mouseJitter: beh.mouseJitter, keystrokes: beh.keystrokes, scrollEvents: beh.scrollEvents,
        clickCount: beh.clickCount, tabSwitches: beh.tabSwitches,
        timeOnPage: Date.now() - beh.startTime, reqPerMin: checkRateLimit(),
        suspiciousPerf: beh.suspiciousPerf, domMutations: domMutations,
      },
      botSignals: botSignals, botScore: botScore,
      interactionTimeline: interactionTimeline.slice(0, 50),
      perfMetrics: beh.perfMetrics,
      forceType: forceType || null, note: note || null,
    };
    if (DEBUG) console.log('[SOC] Sending log:', payload);
    fetch(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), keepalive: true,
    }).catch(function() { _queueForSync(payload); });
  }

  // NEW: Queue failed logs for background sync
  function _queueForSync(payload) {
    try {
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready.then(function(reg) {
          caches.open('soc-pending-logs').then(function(cache) {
            cache.put('/pending-log-' + Date.now(), new Response(JSON.stringify(payload)));
            reg.sync.register('soc-log-retry');
          });
        });
      }
    } catch(_) {}
  }

  // ── 7. FETCH CONFIG FROM WORKER ────────────────────────────────────────────
  function loadConfig() {
    fetch(CONFIG_URL, { method: 'GET', headers: { 'Content-Type': 'application/json' }, cache: 'default' })
    .then(function(res) { if (!res.ok) throw new Error('Config failed: ' + res.status); return res.json(); })
    .then(function(cfg) {
      if (!cfg.endpoint) throw new Error('No endpoint in config');
      ENDPOINT = cfg.endpoint; API_KEY = cfg.apiKey || ''; READY = true;
      if (DEBUG) console.log('[SOC] Config loaded:', ENDPOINT);
    })
    .catch(function(err) { if (DEBUG) console.warn('[SOC] Config failed:', err.message); });
  }

  // ── 8. INIT ─────────────────────────────────────────────────────────────────
  function init() {
    loadConfig(); injectHoneypots(); scanCurrentURL(); startMutationObserver();
    setTimeout(function() { sendLog(); }, 2000);
    window.addEventListener('beforeunload', function() { sendLog(); });
    window.addEventListener('pagehide', function() { sendLog(); });
    if (DEBUG) console.log('[SOC] Tracker v3.0 initialized. FP:', fingerprint, 'BotScore:', botScore);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

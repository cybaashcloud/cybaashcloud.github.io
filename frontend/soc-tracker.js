/**
 * soc-tracker.js — SOC Behavior Tracker & Honeypot System
 * Embed in every page: <script src="/soc-tracker.js"></script>
 * Configure SOC_CONFIG before loading this script.
 */
(function () {
  'use strict';

  // ── Config (override before loading this script) ──────────
  const CFG = window.SOC_CONFIG || {};
  const API_ENDPOINT = CFG.endpoint || '';   // Apps Script Web App URL
  const API_KEY      = CFG.apiKey    || '';   // your SOC API key
  const SITE_NAME    = CFG.site      || window.location.hostname;
  const DEBUG        = CFG.debug     || false;

  if (!API_ENDPOINT) { console.warn('[SOC] No endpoint configured.'); return; }

  // ─────────────────────────────────────────────────────────
  // 1. FINGERPRINTING
  // ─────────────────────────────────────────────────────────
  function generateFingerprint() {
    const parts = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 0,
      navigator.deviceMemory || 0,
      navigator.platform || '',
      !!navigator.plugins.length,
      !!window.sessionStorage,
      !!window.localStorage,
      !!window.indexedDB,
      canvas2dHash(),
    ].join('|');

    return hashString(parts);
  }

  function canvas2dHash() {
    try {
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('SOC👁️', 2, 15);
      ctx.fillStyle = 'rgba(102,204,0,0.7)';
      ctx.fillText('SOC👁️', 4, 17);
      return c.toDataURL().slice(-20);
    } catch (e) { return 'nc'; }
  }

  function hashString(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  // ─────────────────────────────────────────────────────────
  // 2. BEHAVIOR TRACKING
  // ─────────────────────────────────────────────────────────
  const behavior = {
    mouseJitter:     0,
    keystrokes:      0,
    scrollEvents:    0,
    clickCount:      0,
    timeOnPage:      Date.now(),
    tabSwitches:     0,
    rapidNavigation: false,
    lastMousePos:    { x: 0, y: 0 },
    interactionLog:  [],
  };

  let lastMoveTime = 0;
  document.addEventListener('mousemove', function (e) {
    const now = Date.now();
    const dx = e.clientX - behavior.lastMousePos.x;
    const dy = e.clientY - behavior.lastMousePos.y;
    const speed = Math.sqrt(dx * dx + dy * dy);

    // Detect superhuman mouse speed (bot signature)
    if (now - lastMoveTime < 10 && speed > 200) behavior.mouseJitter++;
    behavior.lastMousePos = { x: e.clientX, y: e.clientY };
    lastMoveTime = now;
  }, { passive: true });

  document.addEventListener('keydown', function () {
    behavior.keystrokes++;
    behavior.interactionLog.push({ t: 'key', ts: Date.now() });
  }, { passive: true });

  document.addEventListener('scroll', function () {
    behavior.scrollEvents++;
  }, { passive: true });

  document.addEventListener('click', function (e) {
    behavior.clickCount++;
    behavior.interactionLog.push({ t: 'click', x: e.clientX, y: e.clientY, ts: Date.now() });
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) behavior.tabSwitches++;
  });

  // ─────────────────────────────────────────────────────────
  // 3. HONEYPOT SYSTEM
  // ─────────────────────────────────────────────────────────
  function injectHoneypots() {
    // ── Hidden form fields (filled by bots, not humans) ────
    document.querySelectorAll('form').forEach(function (form) {
      const trap = document.createElement('input');
      trap.type  = 'text';
      trap.name  = 'website'; // classic bot trap name
      trap.setAttribute('tabindex', '-1');
      trap.setAttribute('autocomplete', 'off');
      trap.style.cssText = 'opacity:0;position:absolute;left:-9999px;height:0;width:0;';
      trap.setAttribute('aria-hidden', 'true');
      form.appendChild(trap);

      form.addEventListener('submit', function () {
        if (trap.value) triggerHoneypot('hidden_form_field');
      });
    });

    // ── Invisible clickable traps ──────────────────────────
    const trapDiv = document.createElement('div');
    trapDiv.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0;';
    trapDiv.setAttribute('aria-hidden', 'true');
    trapDiv.setAttribute('tabindex', '-1');
    document.body.appendChild(trapDiv);

    // Make it real-size but invisible after 5s (traps headless browsers)
    setTimeout(function () {
      trapDiv.style.cssText = 'position:fixed;width:100%;height:100%;opacity:0;z-index:-1;left:0;top:0;cursor:none;';
      trapDiv.style.pointerEvents = 'auto';
      trapDiv.addEventListener('click', function (e) {
        // Ignore genuine user clicks in normal areas — only flag clicks
        // that aren't on real elements (headless browser signature)
        if (!e.target.closest('a, button, input, select, textarea, [role="button"]')) {
          behavior.clickCount > 0 && triggerHoneypot('invisible_trap_click');
        }
      });
    }, 5000);
  }

  // ── Watch fake URLs ────────────────────────────────────────
  const HONEYPOT_PATHS = ['/admin-test', '/login-debug', '/wp-admin', '/.env', '/config.php', '/shell', '/phpmyadmin'];
  if (HONEYPOT_PATHS.some(p => window.location.pathname.startsWith(p))) {
    triggerHoneypot('fake_url_access:' + window.location.pathname);
  }

  function triggerHoneypot(trap) {
    log({ debug: '[SOC] Honeypot triggered: ' + trap });
    sendBeacon(API_ENDPOINT + '?action=honeypot', {
      action:      'honeypot',
      key:         API_KEY,
      trap,
      ip:          '__cf_ip__', // replaced by CF worker, fallback handled server-side
      fingerprint: FINGERPRINT,
      userAgent:   navigator.userAgent,
      url:         window.location.href,
    });
  }

  // ─────────────────────────────────────────────────────────
  // 4. REQUEST LOG SENDER
  // ─────────────────────────────────────────────────────────
  const FINGERPRINT = generateFingerprint();

  function sendLog() {
    const timeOnPage   = Math.round((Date.now() - behavior.timeOnPage) / 1000);
    const isSuspicious = behavior.mouseJitter > 20 || (behavior.clickCount === 0 && timeOnPage > 5);

    const payload = {
      action:      'log',
      key:         API_KEY,
      fingerprint: FINGERPRINT,
      userAgent:   navigator.userAgent,
      url:         window.location.href,
      referer:     document.referrer,
      method:      'GET',
      queryString: window.location.search,
      country:     '',   // populated by Cloudflare header server-side
      ip:          '',   // populated server-side
      behavior: {
        timeOnPage,
        mouseJitter:  behavior.mouseJitter,
        keystrokes:   behavior.keystrokes,
        scrollEvents: behavior.scrollEvents,
        clickCount:   behavior.clickCount,
        tabSwitches:  behavior.tabSwitches,
        isSuspicious,
      },
    };

    sendBeacon(API_ENDPOINT + '?action=log', payload);
    log(payload);
  }

  // Send log on page unload (most reliable)
  window.addEventListener('pagehide', sendLog, { passive: true });

  // Also send on first meaningful interaction + after 30s
  let sent = false;
  function sendOnce() {
    if (sent) return;
    sent = true;
    sendLog();
  }
  setTimeout(sendOnce, 30000);
  document.addEventListener('click', sendOnce, { once: true, passive: true });

  // ─────────────────────────────────────────────────────────
  // 5. FETCH UTILITIES
  // ─────────────────────────────────────────────────────────
  function sendBeacon(url, data) {
    const body = JSON.stringify(data);
    // Prefer sendBeacon (non-blocking, survives page unload)
    if (navigator.sendBeacon) {
      try {
        const blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(url, blob)) return;
      } catch (e) { /* fall through */ }
    }
    // Fallback: fetch with keepalive
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
    }).catch(function () { /* silent fail */ });
  }

  function log(msg) {
    if (DEBUG) console.log('[SOC]', msg);
  }

  // ─────────────────────────────────────────────────────────
  // 6. INIT
  // ─────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectHoneypots);
  } else {
    injectHoneypots();
  }

  // Expose fingerprint for admin use
  window.__SOC_FP = FINGERPRINT;

})();

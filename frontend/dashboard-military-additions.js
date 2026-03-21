/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CYBAASH dashboard.html — MILITARY GRADE v2.0 ADDITIONS
 *
 *  HOW TO APPLY:
 *  1. THREAT BANNER — add immediately after <div id="app"> opens, before .hdr:
 *       paste the HTML block from section A below
 *
 *  2. SOC TICKER — add just before </body> in dashboard.html:
 *       paste the HTML block from section B below
 *
 *  3. THREAT MAP TAB — add to sidebar tab list and main panel area:
 *       paste from section C below
 *
 *  4. ADD THIS SCRIPT BLOCK — paste before </body> in dashboard.html:
 *       paste the <script> block from section D below
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ════════════════════════════════════════════════════════════════
// SECTION A — THREAT BANNER HTML
// Paste immediately after: <div id="app">
// ════════════════════════════════════════════════════════════════
/*
<div id="threatBanner" style="display:none;background:linear-gradient(90deg,rgba(255,34,68,.15),rgba(255,34,68,.05));border-bottom:1px solid var(--red);padding:6px 20px;font-size:10px;letter-spacing:2px;color:var(--red);text-align:center;position:sticky;top:0;z-index:200;animation:blink-red 2s ease-in-out infinite;">
  <span>⚠</span>
  <span id="threatBannerText">ELEVATED THREAT LEVEL — MONITORING ACTIVE</span>
  <button onclick="document.getElementById('threatBanner').style.display='none'" style="float:right;background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;margin-top:-1px;">✕</button>
</div>
<style>
  @keyframes blink-red {
    0%,100%{border-bottom-color:var(--red)}
    50%{border-bottom-color:transparent}
  }
</style>
*/

// ════════════════════════════════════════════════════════════════
// SECTION B — SOC LIVE FEED TICKER HTML
// Paste just before </body>
// ════════════════════════════════════════════════════════════════
/*
<div id="socTicker" style="position:fixed;bottom:0;left:0;right:0;background:rgba(3,10,15,.95);border-top:1px solid var(--border);padding:4px 20px;font-size:9px;color:var(--dim);letter-spacing:1px;white-space:nowrap;overflow:hidden;z-index:50;">
  <span style="color:var(--blue);margin-right:12px">▶ CYBAASH SOC LIVE</span>
  <span id="tickerText">Initializing threat feed...</span>
</div>
*/

// ════════════════════════════════════════════════════════════════
// SECTION C — THREAT MAP SIDEBAR TAB
// Add to sidebar tabs list:
// ════════════════════════════════════════════════════════════════
/*
<button class="sb-tab" data-tab="threatmap" onclick="showPanel('threatmap')">
  <span class="sb-icon">🗺</span>THREAT MAP
</button>

<!-- Add corresponding panel in main content area: -->
<div id="panel-threatmap" class="panel" style="display:none">
  <div class="panel-header">
    <span class="panel-title">🗺 GLOBAL THREAT MAP</span>
    <span style="color:var(--dim);font-size:9px;letter-spacing:2px;">LIVE ATTACK ORIGINS</span>
  </div>

  <div class="stats-grid" id="geoKPIs" style="margin-bottom:20px;"></div>

  <div style="background:var(--panel);border:1px solid var(--border);border-radius:2px;padding:16px;margin-bottom:16px;">
    <div class="panel-title" style="font-size:10px;margin-bottom:14px;">TOP ATTACK COUNTRIES</div>
    <div id="countryBars" class="bar-chart"></div>
  </div>

  <div style="background:var(--panel);border:1px solid var(--border);border-radius:2px;padding:16px;">
    <div class="panel-title" style="font-size:10px;margin-bottom:14px;">BOT vs HUMAN TRAFFIC</div>
    <div id="botStats" style="display:flex;gap:20px;align-items:center;"></div>
  </div>
</div>
*/

// ════════════════════════════════════════════════════════════════
// SECTION D — JAVASCRIPT ADDITIONS
// Paste as a <script> block before </body> in dashboard.html
// ════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  var WORKER = 'https://cybaash.mohamedaasiq07.workers.dev';

  // ── Threat Level Banner ───────────────────────────────────────────────
  async function checkThreatLevel() {
    try {
      var resp = await fetch(WORKER + '/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getStats' })
      });
      var stats = await resp.json();
      var totalThreats = (stats.sqli||0) + (stats.xss||0) + (stats.honeypot||0);

      var banner = document.getElementById('threatBanner');
      if (!banner) return;

      if (totalThreats >= 20) {
        banner.style.background = 'linear-gradient(90deg,rgba(255,34,68,.25),rgba(255,34,68,.1))';
        document.getElementById('threatBannerText').textContent =
          '🔴 CRITICAL THREAT LEVEL — ' + totalThreats + ' ACTIVE ATTACKS DETECTED — EMERGENCY PROTOCOLS ACTIVE';
        banner.style.display = 'block';
      } else if (totalThreats >= 5) {
        document.getElementById('threatBannerText').textContent =
          '⚠ ELEVATED THREAT LEVEL — ' + totalThreats + ' ATTACKS DETECTED — MONITORING ACTIVE';
        banner.style.display = 'block';
      } else if (totalThreats > 0) {
        document.getElementById('threatBannerText').textContent =
          'ℹ ' + totalThreats + ' ATTACK(S) IN LOG — SYSTEM NOMINAL';
        banner.style.display = 'block';
      }
    } catch(_) {}
  }

  // ── SOC Live Feed Ticker ──────────────────────────────────────────────
  var tickerItems = [];
  var tickerIdx   = 0;

  function startTicker() {
    var tickerText = document.getElementById('tickerText');
    if (!tickerText) return;

    setInterval(function() {
      if (tickerItems.length === 0) return;
      tickerText.style.opacity = '0';
      setTimeout(function() {
        tickerText.textContent = tickerItems[tickerIdx % tickerItems.length];
        tickerText.style.opacity = '1';
        tickerIdx++;
      }, 200);
    }, 4000);
  }

  async function loadTickerData() {
    try {
      var resp = await fetch(WORKER + '/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getLogs', limit: 20 })
      });
      var data = await resp.json();
      var logs = (data.logs || []).filter(function(l) { return l.attackType !== 'CLEAN'; });

      tickerItems = logs.map(function(l) {
        var risk   = l.risk || 0;
        var prefix = risk >= 80 ? '🔴' : risk >= 60 ? '🟠' : '🟡';
        var ts     = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('en-US',{hour12:false}) : '--:--:--';
        return prefix + ' [' + ts + '] ' + (l.attackType||'UNKNOWN') + ' from ' + (l.ip||'?.?.?.?') +
               ' — Risk: ' + risk + '/100 — ' + (l.url||'/').substring(0,50);
      });

      if (tickerItems.length === 0) {
        tickerItems = ['✅ No active threats detected — System nominal', '🛡️ CYBAASH SOC monitoring active', '🔍 All systems green'];
      }
    } catch(_) {
      tickerItems = ['⚡ SOC Feed: Connection established — Monitoring...'];
    }
  }

  // ── Threat Map / Geo Stats ────────────────────────────────────────────
  async function loadGeoStats() {
    try {
      var resp = await fetch(WORKER + '/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getGeoStats' })
      });
      var data = await resp.json();
      var countries = data.countries || [];

      // Render KPI cards
      var kpiContainer = document.getElementById('geoKPIs');
      if (kpiContainer && countries.length > 0) {
        var top3 = countries.slice(0, 3);
        kpiContainer.innerHTML = top3.map(function(c) {
          return '<div class="stat-card">' +
            '<div class="stat-card-label">TOP THREAT ORIGIN</div>' +
            '<div class="stat-big blue" style="font-size:24px">' + (c.country||'??') + '</div>' +
            '<div class="stat-sub">' + c.count + ' requests</div>' +
            '</div>';
        }).join('');
      }

      // Render bar chart
      var barsContainer = document.getElementById('countryBars');
      if (!barsContainer || countries.length === 0) return;
      var max = countries[0].count || 1;
      barsContainer.innerHTML = countries.slice(0, 10).map(function(c) {
        var pct  = Math.round((c.count / max) * 100);
        var color = pct > 75 ? 'background:var(--red)' : pct > 40 ? 'background:var(--orange)' : 'background:var(--blue)';
        return '<div class="bar-row">' +
          '<span class="bar-label" style="width:32px;font-size:9px">' + (c.country||'??') + '</span>' +
          '<div class="bar-track">' +
            '<div class="bar-fill" style="width:' + pct + '%;' + color + '"></div>' +
          '</div>' +
          '<span class="bar-count" style="width:40px">' + c.count + '</span>' +
          '</div>';
      }).join('');
    } catch(_) {}
  }

  async function loadBotStats() {
    try {
      var resp = await fetch(WORKER + '/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getBehaviorStats' })
      });
      var data = await resp.json();
      var stats = data.stats || {};

      var container = document.getElementById('botStats');
      if (!container) return;

      var total    = stats.total || 1;
      var botPct   = Math.round(((stats.botDetected||0) / total) * 100);
      var humanPct = 100 - botPct;

      container.innerHTML =
        '<div style="flex:1">' +
          '<div style="color:var(--red);font-size:28px;font-family:var(--font-display);font-weight:900">' + botPct + '%</div>' +
          '<div style="color:var(--dim);font-size:9px;letter-spacing:2px">BOT TRAFFIC</div>' +
        '</div>' +
        '<div style="flex:1">' +
          '<div style="color:var(--green);font-size:28px;font-family:var(--font-display);font-weight:900">' + humanPct + '%</div>' +
          '<div style="color:var(--dim);font-size:9px;letter-spacing:2px">HUMAN TRAFFIC</div>' +
        '</div>' +
        '<div style="flex:1">' +
          '<div style="color:var(--blue);font-size:28px;font-family:var(--font-display);font-weight:900">' + (stats.total||0) + '</div>' +
          '<div style="color:var(--dim);font-size:9px;letter-spacing:2px">TOTAL TRACKED</div>' +
        '</div>';
    } catch(_) {}
  }

  // ── Keyboard Shortcuts ────────────────────────────────────────────────
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey) {
      var panels = { 'S': 'soc', 'C': 'certs', 'A': 'ai', 'T': 'threatmap', 'H': 'home' };
      if (panels[e.key]) {
        e.preventDefault();
        if (typeof showPanel === 'function') showPanel(panels[e.key]);
        else if (typeof openTab === 'function') openTab(panels[e.key]);
      }
      if (e.key === 'L') {
        e.preventDefault();
        window.open('/admin/security.html', '_blank');
      }
    }
  });

  // ── Init on DOM ready ─────────────────────────────────────────────────
  function milInit() {
    // Add ticker CSS transition
    var tickerEl = document.getElementById('tickerText');
    if (tickerEl) tickerEl.style.transition = 'opacity 0.2s ease';

    checkThreatLevel();

    loadTickerData().then(function() {
      startTicker();
      // Refresh ticker every 2 minutes
      setInterval(function() { loadTickerData(); }, 120000);
    });

    // Load geo stats if threat map panel is visited
    var threatMapBtn = document.querySelector('[data-tab="threatmap"]');
    if (threatMapBtn) {
      threatMapBtn.addEventListener('click', function() {
        loadGeoStats();
        loadBotStats();
      });
    }

    // Refresh threat level every 5 minutes
    setInterval(checkThreatLevel, 300000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', milInit);
  } else {
    milInit();
  }

})();

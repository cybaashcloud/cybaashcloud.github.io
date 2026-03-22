/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CYBAASH SOC — security.js MILITARY ADDITIONS v2.0
 *
 *  HOW TO APPLY:
 *  Paste this entire block at the BOTTOM of your existing security.js,
 *  just before the closing line (or at end of file).
 *
 *  Also add to security.html (see HTML ADDITIONS section at bottom):
 *   - APT Alerts nav tab button
 *   - APT Alerts panel div
 *   - TOTP login step overlay
 *
 *  All existing functions are preserved. This file only ADDS new ones.
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// UPGRADE 5A — APT ALERTS TAB
// ─────────────────────────────────────────────────────────────────────────────
async function loadAPTAlerts() {
  const container = el('apt-alerts-list');
  if (!container) return;

  container.innerHTML = '<div class="empty-state"><span class="es-icon" style="animation:spin 1s linear infinite">⚙</span>Loading APT alerts...</div>';

  try {
    const data = await callAppsScript('getAPTAlerts');
    const alerts = data.alerts || [];

    if (!alerts.length) {
      container.innerHTML = '<div class="empty-state"><span class="es-icon">✅</span>No APT alerts detected. System clear.</div>';
      return;
    }

    // Update APT badge count
    const badge = el('apt-badge');
    if (badge) {
      badge.textContent = alerts.filter(a => !a.resolved).length;
      badge.style.display = alerts.length ? 'inline' : 'none';
    }

    container.innerHTML = alerts.map(a => {
      const risk      = a.risk || 0;
      const ttps      = Array.isArray(a.ttps) ? a.ttps : (a.ttps ? String(a.ttps).split(',') : []);
      const action    = a.action || 'BLOCK';
      const resolved  = a.resolved;
      const actionColor = action === 'EMERGENCY_BLOCK' ? 'var(--red)' :
                          action === 'BLOCK'            ? 'var(--orange)' :
                          action === 'CHALLENGE'        ? 'var(--yellow)' : 'var(--green)';

      return `
        <div class="apt-alert-card" style="
          background: var(--bg-panel, #070f18);
          border: 1px solid ${risk >= 90 ? 'var(--red)' : risk >= 75 ? 'var(--orange)' : 'var(--border)'};
          box-shadow: ${risk >= 90 ? '0 0 16px rgba(255,34,68,.15)' : 'none'};
          border-radius: 4px;
          padding: 16px;
          margin-bottom: 12px;
          position: relative;
          opacity: ${resolved ? '0.6' : '1'};
        ">
          ${risk >= 90 ? '<div style="position:absolute;top:8px;right:8px;width:8px;height:8px;background:var(--red);border-radius:50%;box-shadow:0 0 8px var(--red);animation:pulse 1.2s ease-in-out infinite"></div>' : ''}
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap">
            <span style="font-family:var(--font-display,monospace);font-size:16px;color:var(--red);font-weight:900">${escapeHtml(a.ip || 'unknown')}</span>
            <span class="badge badge-gray">${escapeHtml(a.country || '??')}</span>
            <span class="badge ${riskClass(risk)}">${risk}/100</span>
            <span style="color:${actionColor};font-size:10px;letter-spacing:2px;font-weight:bold">${escapeHtml(action)}</span>
            ${resolved ? '<span style="color:var(--green);font-size:10px;letter-spacing:1px">✅ RESOLVED</span>' : ''}
          </div>

          <div style="margin-bottom:10px">
            <span style="color:var(--text-muted,#5a7a9a);font-size:10px">ATTACK TYPE: </span>
            <span class="badge badge-red">${escapeHtml(a.attackType || 'APT')}</span>
          </div>

          ${ttps.length ? `
            <div style="margin-bottom:10px">
              <span style="color:var(--text-muted,#5a7a9a);font-size:9px;letter-spacing:2px">MITRE ATT&CK TTPs: </span><br/>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
                ${ttps.map(t => `<span style="background:rgba(170,68,255,.15);border:1px solid rgba(170,68,255,.4);color:#aa44ff;padding:2px 8px;border-radius:2px;font-size:9px;font-family:monospace">${escapeHtml(t.trim())}</span>`).join('')}
              </div>
            </div>
          ` : ''}

          ${a.summary ? `<div style="color:var(--text-secondary,#8ab0c8);font-size:11px;border-left:2px solid var(--border);padding-left:10px;margin-bottom:10px">${escapeHtml(a.summary)}</div>` : ''}

          <div style="color:var(--text-muted,#5a7a9a);font-size:10px">
            ${a.timestamp ? new Date(a.timestamp).toLocaleString('en-US',{hour12:false}) : '—'}
            ${a.notes ? ' · ' + escapeHtml(a.notes) : ''}
          </div>
        </div>
      `;
    }).join('');

    termLog('info', `APT Alerts loaded: ${alerts.length} entries`);

  } catch (e) {
    container.innerHTML = `<div class="empty-state"><span class="es-icon">⚠️</span>Error loading APT alerts: ${escapeHtml(e.message)}</div>`;
    termLog('error', 'APT alerts load failed: ' + e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPGRADE 5B — ADMIN TERMINAL UPGRADE
// ─────────────────────────────────────────────────────────────────────────────

// Override/extend the existing handleTerminalCommand function
// Store ref to original if it exists
const _originalHandleTerminalCommand = (typeof handleTerminalCommand === 'function')
  ? handleTerminalCommand
  : null;

function handleTerminalCommand(input) {
  const parts   = input.trim().split(/\s+/);
  const cmd     = (parts[0] || '').toLowerCase();
  const args    = parts.slice(1);
  const WORKER  = 'https://cybaash.mohamedaasiq07.workers.dev';

  // ── NEW v2.0 commands ──────────────────────────────────────────────
  switch (cmd) {

    case 'apt-alerts':
      termPrint('> Loading APT alerts...');
      callAppsScript('getAPTAlerts').then(data => {
        const alerts = (data.alerts || []);
        if (!alerts.length) { termPrint('  ✅ No APT alerts in database.'); return; }
        termPrint(`  Found ${alerts.length} APT alert(s):`);
        alerts.slice(0, 10).forEach(a => {
          termPrint(`  [${a.risk||0}] ${a.ip || '?'} — ${a.attackType||'?'} — ${a.action||'?'}`);
          if (a.ttps && a.ttps.length) termPrint(`       TTPs: ${Array.isArray(a.ttps) ? a.ttps.join(', ') : a.ttps}`);
        });
      }).catch(e => termPrint('  ❌ Error: ' + e.message));
      return;

    case 'geoblock':
      if (!args[0]) { termPrint('  Usage: geoblock <add|remove|list> <COUNTRY_CODE>'); return; }
      if (args[0] === 'list') {
        termPrint('  To view blocked countries: check BLOCKED_COUNTRIES in Cloudflare Worker secrets.');
        termPrint('  Current policy is enforced at the Worker layer (env.BLOCKED_COUNTRIES).');
        return;
      }
      termPrint(`  ⚠ Geo-blocking managed via Cloudflare Worker secrets.`);
      termPrint(`  Go to: Cloudflare Dashboard → Workers → cybaash → Settings → Variables`);
      termPrint(`  Set BLOCKED_COUNTRIES = comma-separated ISO codes (e.g. KP,IR,CN)`);
      return;

    case 'intel':
      if (args[0] === 'add' && args[1]) {
        const ip = args[1];
        termPrint(`> Adding ${ip} to threat intel...`);
        fetch(WORKER + '/intel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip, action: 'add', reason: 'Manual — terminal', score: 80 })
        }).then(r => r.json()).then(d => {
          termPrint(d.success ? `  ✅ ${ip} added to threat intel DB` : `  ❌ Failed: ${d.error||'unknown'}`);
        }).catch(e => termPrint('  ❌ ' + e.message));
      } else if (args[0] === 'remove' && args[1]) {
        const ip = args[1];
        termPrint(`> Removing ${ip} from threat intel...`);
        fetch(WORKER + '/intel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip, action: 'remove' })
        }).then(r => r.json()).then(d => {
          termPrint(d.success ? `  ✅ ${ip} removed` : `  ❌ Failed: ${d.error||'unknown'}`);
        }).catch(e => termPrint('  ❌ ' + e.message));
      } else if (args[0] === 'list') {
        termPrint('> Fetching threat intel list...');
        fetch(WORKER + '/threats').then(r => r.json()).then(d => {
          const t = d.threats || [];
          if (!t.length) { termPrint('  ✅ No entries in threat intel.'); return; }
          t.forEach(e => termPrint(`  ${e.ip} — score:${e.score||'?'} — ${e.reason||'no reason'}`));
        }).catch(e => termPrint('  ❌ ' + e.message));
      } else {
        termPrint('  Usage: intel add <ip> | intel remove <ip> | intel list');
      }
      return;

    case 'purge':
      const days = parseInt(args[0]) || 30;
      if (!confirm(`Delete SOC logs older than ${days} days?`)) { termPrint('  Aborted.'); return; }
      termPrint(`> Purging logs older than ${days} days...`);
      callAppsScript('purgeOldLogs', { keepDays: days }).then(d => {
        termPrint(d.success ? `  ✅ Deleted ${d.deleted} rows (kept last ${days} days)` : `  ❌ ${d.error}`);
      }).catch(e => termPrint('  ❌ ' + e.message));
      return;

    case 'export':
      const limit = parseInt(args[1]) || 1000;
      termPrint(`> Exporting ${limit} logs as CSV...`);
      callAppsScript('exportCSV', { limit }).then(d => {
        if (!d.success || !d.csv) { termPrint('  ❌ Export failed: ' + (d.error||'no data')); return; }
        const blob = new Blob([d.csv], { type: 'text/csv' });
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = `soc-logs-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        termPrint(`  ✅ Exported ${d.rows} rows`);
      }).catch(e => termPrint('  ❌ ' + e.message));
      return;

    case 'report':
      termPrint('> Sending daily intel briefing...');
      callAppsScript('sendDailyReport').then(d => {
        termPrint(d.success ? '  ✅ Daily report sent to alert email' : '  ❌ ' + (d.error||'unknown'));
      }).catch(e => termPrint('  ❌ ' + e.message));
      return;

    case 'scan':
      if (!args[0]) { termPrint('  Usage: scan <url>'); return; }
      quickPassiveScan(args[0]);
      return;

    case 'geo':
      termPrint('> Fetching geo stats...');
      callAppsScript('getGeoStats').then(d => {
        const countries = d.countries || [];
        if (!countries.length) { termPrint('  No geo data yet.'); return; }
        termPrint('  TOP ATTACK COUNTRIES:');
        countries.slice(0, 10).forEach(c => termPrint(`  ${c.country.padEnd(4)} — ${c.count} requests`));
      }).catch(e => termPrint('  ❌ ' + e.message));
      return;

    case 'audit':
      termPrint('> Fetching worker audit log...');
      fetch(WORKER + '/audit', {
        headers: { 'Content-Type': 'application/json' }
      }).then(r => r.json()).then(d => {
        const entries = d.entries || [];
        if (!entries.length) { termPrint('  No audit entries (requires X-SOC-Key).'); return; }
        termPrint(`  Last ${Math.min(entries.length, 10)} audit entries:`);
        entries.slice(0, 10).forEach(e =>
          termPrint(`  [${e.statusCode}] ${e.method} ${e.path} — ${e.ip} (${e.country})`));
      }).catch(e => termPrint('  No audit access: ' + e.message));
      return;

    case 'intel-panel':
      window.open('/admin/intel.html', '_blank');
      termPrint('  ✅ Opening Intel Panel...');
      return;

    case 'help':
      // Extend existing help
      if (_originalHandleTerminalCommand) {
        _originalHandleTerminalCommand(input);
      }
      termPrint('');
      termPrint('  ── MILITARY v2.0 COMMANDS ──────────────────');
      termPrint('  apt-alerts          List APT alerts from DB');
      termPrint('  intel list          Show threat intel entries');
      termPrint('  intel add <ip>      Add IP to threat intel DB');
      termPrint('  intel remove <ip>   Remove IP from threat intel');
      termPrint('  geoblock list       Show geo-block policy');
      termPrint('  geo                 Show attack geography stats');
      termPrint('  audit               Show worker audit log');
      termPrint('  purge <days>        Purge logs older than N days');
      termPrint('  export csv <n>      Export N logs as CSV download');
      termPrint('  report              Send daily intel email report');
      termPrint('  scan <url>          Quick passive scan of a URL');
      termPrint('  intel-panel         Open threat intel panel tab');
      return;

    default:
      // Fall through to original handler
      if (_originalHandleTerminalCommand) {
        _originalHandleTerminalCommand(input);
      } else {
        termPrint(`  Unknown command: ${cmd}. Type 'help' for commands.`);
      }
  }
}

// Terminal print helper (works with existing termLog)
function termPrint(line) {
  const term = el('terminal-output');
  if (!term) return;
  const div = document.createElement('div');
  div.className = 't-line';
  div.innerHTML = `<span class="t-msg" style="color:var(--text-secondary,#8ab0c8)">${escapeHtml(line)}</span>`;
  term.appendChild(div);
  term.scrollTop = term.scrollHeight;
}

// Quick passive scan
async function quickPassiveScan(url) {
  termPrint(`> Passive scan: ${url}`);
  try {
    const resp = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    termPrint('  Status: ' + resp.status);
    const hdrs = ['Server','X-Powered-By','X-Frame-Options','X-Content-Type-Options','Strict-Transport-Security'];
    hdrs.forEach(h => {
      const v = resp.headers.get(h);
      termPrint('  ' + h + ': ' + (v || '(not set)'));
    });
    if (!resp.headers.get('X-Frame-Options')) termPrint('  ⚠ X-Frame-Options missing — possible clickjacking');
    if (!resp.headers.get('Strict-Transport-Security')) termPrint('  ⚠ HSTS missing');
    termPrint('  ✅ Passive scan complete');
  } catch(e) {
    termPrint('  ❌ Scan failed (CORS or unreachable): ' + e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPGRADE 5C — TWO-FACTOR TOTP LOGIN
// ─────────────────────────────────────────────────────────────────────────────
let _totpPending = false;

// Patch the existing grantSession to add TOTP step
const _originalGrantSession = (typeof grantSession === 'function') ? grantSession : null;

async function grantSession() {
  // Check if TOTP is enabled (check Apps Script property)
  try {
    const cfg = await callAppsScript('verifyAdmin', { token: 'check_totp_enabled' });
    if (cfg && cfg.totpEnabled) {
      // Show TOTP overlay instead of granting session
      await startTOTPFlow();
      return;
    }
  } catch(_) {}

  // TOTP not enabled or error — grant session directly
  if (_originalGrantSession) _originalGrantSession();
}

async function startTOTPFlow() {
  // Request TOTP code to be emailed
  termLog('info', '2FA required — sending code to alert email...');

  const overlay = document.createElement('div');
  overlay.id = 'totp-overlay';
  overlay.style.cssText = [
    'position:fixed;inset:0;background:rgba(3,10,15,.97);',
    'display:flex;align-items:center;justify-content:center;z-index:9999;',
    'font-family:"Courier New",monospace;',
  ].join('');

  overlay.innerHTML = `
    <div style="background:#070f18;border:1px solid var(--border,#1a3a5c);border-radius:4px;padding:40px;max-width:380px;width:90%;text-align:center">
      <div style="color:#00d4ff;font-size:12px;letter-spacing:4px;margin-bottom:8px">TWO-FACTOR AUTH</div>
      <div style="color:#5a7a9a;font-size:11px;margin-bottom:24px">A 6-digit code has been sent to your alert email.</div>
      <input type="text" id="totp-input" maxlength="6" placeholder="000000"
        style="width:140px;background:#0a1520;border:1px solid var(--border,#1a3a5c);color:#00d4ff;
               padding:12px;font-size:24px;letter-spacing:8px;text-align:center;font-family:monospace;
               border-radius:2px;outline:none;display:block;margin:0 auto 16px;" />
      <div id="totp-error" style="color:#ff2244;font-size:11px;min-height:16px;margin-bottom:16px;display:none"></div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button id="totp-verify-btn" class="btn btn-ghost" style="min-width:100px">VERIFY</button>
        <button id="totp-cancel-btn" class="btn btn-red" style="min-width:80px">Cancel</button>
      </div>
      <div id="totp-timer" style="color:#5a7a9a;font-size:10px;margin-top:16px">Code expires in <span id="totp-countdown">120</span>s</div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Auto-focus the input
  setTimeout(() => document.getElementById('totp-input')?.focus(), 100);

  // Send the TOTP code
  try {
    await callAppsScript('generateTOTP');
    termLog('info', 'TOTP code sent to alert email');
  } catch(e) {
    termLog('warn', 'TOTP send failed: ' + e.message);
  }

  // Countdown timer
  let seconds = 120;
  const countdown = setInterval(() => {
    seconds--;
    const el_ = document.getElementById('totp-countdown');
    if (el_) el_.textContent = seconds;
    if (seconds <= 0) {
      clearInterval(countdown);
      overlay.remove();
      showToast('TOTP code expired. Please log in again.', 'error');
      logout();
    }
  }, 1000);

  // Verify button
  document.getElementById('totp-verify-btn').addEventListener('click', async () => {
    const code = (document.getElementById('totp-input').value || '').trim();
    if (!code || code.length < 6) {
      const err = document.getElementById('totp-error');
      err.textContent = 'Enter the 6-digit code from your email.';
      err.style.display = 'block';
      return;
    }
    try {
      const result = await callAppsScript('verifyTOTP', { code });
      if (result && result.ok) {
        clearInterval(countdown);
        overlay.remove();
        termLog('info', '2FA verified — session granted');
        if (_originalGrantSession) _originalGrantSession();
      } else {
        const err = document.getElementById('totp-error');
        err.textContent = 'Invalid code. ' + (result.reason || 'Try again.');
        err.style.display = 'block';
      }
    } catch(e) {
      const err = document.getElementById('totp-error');
      err.textContent = 'Verification error: ' + e.message;
      err.style.display = 'block';
    }
  });

  // Enter key on input
  document.getElementById('totp-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('totp-verify-btn').click();
  });

  // Cancel
  document.getElementById('totp-cancel-btn').addEventListener('click', () => {
    clearInterval(countdown);
    overlay.remove();
    logout();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// UPGRADE 5D — REAL-TIME ALERT SOUNDS + PUSH NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────
function playAlertSound(level) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx  = new AudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (level === 'critical') {
      // Two-tone alarm for critical
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
      // Second beep
      setTimeout(() => {
        try {
          const ctx2 = new AudioCtx();
          const osc2 = ctx2.createOscillator();
          const g2   = ctx2.createGain();
          osc2.connect(g2); g2.connect(ctx2.destination);
          osc2.frequency.value = 660;
          g2.gain.setValueAtTime(0.3, ctx2.currentTime);
          g2.gain.exponentialRampToValueAtTime(0.01, ctx2.currentTime + 0.4);
          osc2.start(); osc2.stop(ctx2.currentTime + 0.5);
        } catch(_) {}
      }, 600);
    } else {
      // Single soft beep for high
      osc.frequency.value = 440;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch(_) {
    // Audio unavailable — fail silently
  }
}

// Request push notification permission on first interaction
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(perm => {
      termLog('info', 'Notification permission: ' + perm);
    });
  }
}

// Check for new high-risk events after each data refresh
let _prevLogCount = 0;

function checkForNewAlerts(newLogs, prevCount) {
  if (!newLogs || !newLogs.length) return;

  const critical = newLogs.filter(l => l.risk >= 90);
  const high     = newLogs.filter(l => l.risk >= 70 && l.risk < 90);
  const aptLogs  = newLogs.filter(l => l.attackType === 'APT' || l.attackType === 'HONEYPOT');

  if (critical.length > 0 || aptLogs.length > 0) {
    const target = aptLogs[0] || critical[0];

    playAlertSound('critical');
    showToast(`🔴 CRITICAL: ${target.attackType} from ${target.ip}`, 'error', 8000);

    // Browser push notification
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('CYBAASH SOC — CRITICAL ALERT', {
          body: `${target.attackType} from ${target.ip} | Risk: ${target.risk}/100`,
          icon: '/icons/icon-192x192.png',
          requireInteraction: true,
          tag: 'soc-critical-' + target.ip,
        });
      } catch(_) {}
    }

    termLog('error', `CRITICAL: ${target.attackType} from ${target.ip} (risk ${target.risk})`);

  } else if (high.length > 0 && newLogs.length > prevCount) {
    playAlertSound('high');
    showToast(`⚠ HIGH: ${high[0].attackType} from ${high[0].ip}`, 'warning', 5000);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH: Extend refreshAll to call checkForNewAlerts
// ─────────────────────────────────────────────────────────────────────────────
const _originalRefreshAll = (typeof refreshAll === 'function') ? refreshAll : null;

async function refreshAll() {
  const prevCount = STATE.logs ? STATE.logs.length : 0;

  if (_originalRefreshAll) await _originalRefreshAll();

  // After refresh, check for new threats
  if (STATE.logs && STATE.logs.length) {
    checkForNewAlerts(STATE.logs, prevCount);
    _prevLogCount = STATE.logs.length;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH: Extend switchTab to load APT alerts when tab is opened
// ─────────────────────────────────────────────────────────────────────────────
const _originalSwitchTab = (typeof switchTab === 'function') ? switchTab : null;

function switchTab(tabId) {
  if (_originalSwitchTab) _originalSwitchTab(tabId);
  if (tabId === 'apt') {
    loadAPTAlerts();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH: Hook into DOMContentLoaded to add APT tab and request permissions
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Request notification permission when authenticated
  const origInit = window._socAuthHook;

  // Add APT tab click handler if element exists
  const aptTab = document.querySelector('.nav-tab[data-tab="apt"]');
  if (aptTab) {
    aptTab.addEventListener('click', () => loadAPTAlerts());
  }

  // Add Intel Panel link click handler
  const intelLink = el('intel-panel-link');
  if (intelLink) {
    intelLink.addEventListener('click', () => window.open('/admin/intel.html', '_blank'));
  }

  // Request notifications on first user gesture
  document.addEventListener('click', requestNotificationPermission, { once: true });
});

/* ═══════════════════════════════════════════════════════════════════════════
   SECURITY.HTML ADDITIONS — paste these HTML snippets into security.html
   ═══════════════════════════════════════════════════════════════════════════

   1. ADD APT ALERTS NAV TAB — in the nav tabs list next to existing tabs:
   ─────────────────────────────────────────────────────────────────────────
   <button class="nav-tab" data-tab="apt">
     🔴 APT Alerts
     <span id="apt-badge" style="background:var(--red);color:#fff;border-radius:10px;padding:1px 6px;font-size:9px;margin-left:6px;display:none">0</span>
   </button>

   2. ADD APT ALERTS PANEL — after the last existing tab-panel div:
   ─────────────────────────────────────────────────────────────────────────
   <div id="panel-apt" class="tab-panel">
     <div class="panel-header">
       <h3 style="color:var(--red);letter-spacing:3px">🔴 APT &amp; CRITICAL THREAT ALERTS</h3>
       <div style="display:flex;gap:8px;align-items:center">
         <button class="btn btn-ghost btn-sm" onclick="loadAPTAlerts()">⟳ Refresh</button>
         <a id="intel-panel-link" href="/admin/intel.html" target="_blank" class="btn btn-ghost btn-sm">🔍 Intel Panel</a>
       </div>
     </div>
     <div id="apt-alerts-list">
       <div class="empty-state"><span class="es-icon">🛡️</span>Click Refresh to load APT alerts.</div>
     </div>
   </div>

   3. ADD APT ALERTS MOCK DATA — in getMockData() function, add:
   ─────────────────────────────────────────────────────────────────────────
   if (action === 'getAPTAlerts') {
     return {
       alerts: [
         { timestamp: new Date().toISOString(), ip: '185.220.101.47', country: 'RU',
           attackType: 'APT', risk: 95, ttps: ['T1190','T1595.002','T1046'],
           summary: 'Coordinated multi-vector attack with APT-like persistence indicators',
           action: 'EMERGENCY_BLOCK', resolved: false },
         { timestamp: new Date(Date.now()-3600000).toISOString(), ip: '45.142.212.100', country: 'NL',
           attackType: 'HONEYPOT', risk: 88, ttps: ['T1595.001'],
           summary: 'Honeypot triggered — likely automated scanner', action: 'BLOCK', resolved: true }
       ]
     };
   }
   ═══════════════════════════════════════════════════════════════════════════
*/

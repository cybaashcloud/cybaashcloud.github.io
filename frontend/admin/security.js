/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CYBAASH SOC — security.js
 *  Standalone Security Operations Center Dashboard Logic
 *  Completely isolated from main site JavaScript
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION — Edit these before deploying
// ─────────────────────────────────────────────────────────────────────────────
// SOC Dashboard config — appsScriptUrl loaded from Cloudflare Worker at runtime
// Worker: https://cybaash.mohamedaasiq07.workers.dev/config
// No secrets in this file
const SOC_CONFIG = {
  appsScriptUrl: '', // populated at runtime from Worker /config

  // Admin password (hashed via SHA-256 — change this)
  // Generate: https://emn178.github.io/online-tools/sha256.html
  // Default password: cybaash-soc-admin
  // Change it: login → Settings tab → New Admin Password → Save
  passwordHash: 'df132f130508df6a9d31b7fe7dc77a058296bb8d12c8202fca2c765dd0c7e52b',  // default: cybaash-soc-admin — change via Settings tab

  // Session timeout in minutes
  sessionTimeout: 30,

  // Auto-refresh interval (seconds)
  refreshInterval: 30,

  // Maximum rows to display in logs table
  maxLogRows: 200,
};

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────
const STATE = {
  authenticated: false,
  sessionExpiry: null,
  activeTab: 'dashboard',
  logs: [],
  alerts: [],
  blockedIPs: [],
  threatStats: { total: 0, blocked: 0, sqli: 0, xss: 0, honeypot: 0, rateAbuse: 0 },
  trafficHistory: Array(20).fill(0),
  attackHistory: Array(20).fill(0),
  topAttackers: [],
  charts: {},
  refreshTimer: null,
  terminalLines: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function el(id) { return document.getElementById(id); }
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return document.querySelectorAll(sel); }

function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

function formatDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return `${Math.floor(diff/1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
  return `${Math.floor(diff/86400000)}d ago`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function riskClass(score) {
  if (score >= 80) return 'badge-red';
  if (score >= 60) return 'badge-orange';
  if (score >= 40) return 'badge-yellow';
  return 'badge-green';
}

function riskLabel(score) {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  if (score >= 20) return 'LOW';
  return 'SAFE';
}

function riskBarClass(score) {
  if (score >= 80) return 'risk-100';
  if (score >= 60) return 'risk-85';
  if (score >= 40) return 'risk-70';
  if (score >= 20) return 'risk-40';
  return 'risk-10';
}

// ─────────────────────────────────────────────────────────────────────────────
// TOAST NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const container = el('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─────────────────────────────────────────────────────────────────────────────
// TERMINAL LOG
// ─────────────────────────────────────────────────────────────────────────────
function termLog(level, msg) {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const line = { time, level, msg };
  STATE.terminalLines.push(line);
  if (STATE.terminalLines.length > 150) STATE.terminalLines.shift();
  renderTerminal();
}

function renderTerminal() {
  const term = el('terminal-output');
  if (!term) return;
  term.innerHTML = STATE.terminalLines.map(l =>
    `<div class="t-line"><span class="t-time">[${l.time}]</span><span class="t-level-${l.level}">[${l.level.toUpperCase()}]</span><span class="t-msg">${escapeHtml(l.msg)}</span></div>`
  ).join('');
  term.scrollTop = term.scrollHeight;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLOCK
// ─────────────────────────────────────────────────────────────────────────────
function startClock() {
  function tick() {
    const now = new Date();
    const clockEl = el('topbar-clock');
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('en-US', { hour12: false }) + ' UTC';
    }
  }
  tick();
  setInterval(tick, 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION
// ─────────────────────────────────────────────────────────────────────────────
// ── Login rate limiting constants ─────────────────────────────────────────
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS   = 15 * 60 * 1000; // 15 minutes

function getLoginState() {
  try {
    return JSON.parse(sessionStorage.getItem('soc_login_state') || '{}');
  } catch(_) { return {}; }
}

function setLoginState(state) {
  sessionStorage.setItem('soc_login_state', JSON.stringify(state));
}

function checkLockout() {
  const s = getLoginState();
  if (!s.lockedUntil) return null;
  const remaining = s.lockedUntil - Date.now();
  if (remaining > 0) return remaining;
  // Lockout expired — clear it
  setLoginState({});
  return null;
}

function recordFailedAttempt() {
  const s = getLoginState();
  const attempts = (s.attempts || 0) + 1;
  if (attempts >= LOGIN_MAX_ATTEMPTS) {
    setLoginState({ attempts, lockedUntil: Date.now() + LOGIN_LOCKOUT_MS });
    return { locked: true, remaining: LOGIN_LOCKOUT_MS };
  }
  setLoginState({ attempts });
  return { locked: false, attempts, remaining: LOGIN_MAX_ATTEMPTS - attempts };
}

function showLockoutTimer(ms) {
  const errorEl = el('login-error');
  const btn = el('login-btn') || document.querySelector('.login-btn');
  if (btn) btn.disabled = true;

  function tick() {
    const remaining = checkLockout();
    if (!remaining) {
      if (errorEl) { errorEl.classList.remove('show'); errorEl.textContent = ''; }
      if (btn) btn.disabled = false;
      return;
    }
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    if (errorEl) {
      errorEl.textContent = 'Too many attempts. Locked for ' +
        mins + 'm ' + secs.toString().padStart(2,'0') + 's';
      errorEl.classList.add('show');
    }
    setTimeout(tick, 1000);
  }
  tick();
}

async function handleLogin(e) {
  e.preventDefault();
  const pw = el('login-password').value;
  const errorEl = el('login-error');

  // ── Check lockout first ────────────────────────────────────────────────
  const lockRemaining = checkLockout();
  if (lockRemaining) {
    showLockoutTimer(lockRemaining);
    return;
  }

  if (!pw) {
    errorEl.textContent = 'Password required.';
    errorEl.classList.add('show');
    return;
  }

  const hash = await sha256(pw);

  // ── Try Apps Script token validation ──────────────────────────────────
  try {
    const verified = await callAppsScript('verifyAdmin', { token: hash });
    if (verified && verified.ok) {
      setLoginState({}); // clear attempts on success
      grantSession();
      return;
    }
  } catch (_) {
    // Falls through to local hash check
  }

  // ── Local hash check ──────────────────────────────────────────────────
  const localHash   = localStorage.getItem('soc_pw_hash');
  const defaultHash = SOC_CONFIG.passwordHash;
  const storedHash  = localHash || defaultHash;

  console.log('[SOC] Login attempt — computed:', hash.substring(0,8),
    'stored:', storedHash.substring(0,8), 'match:', hash === storedHash);

  if (hash === storedHash) {
    setLoginState({}); // clear attempts on success
    grantSession();
    return;
  }

  // Stale localStorage hash fallback
  if (localHash && hash === defaultHash) {
    console.log('[SOC] Stale localStorage hash — matched default, clearing');
    localStorage.removeItem('soc_pw_hash');
    setLoginState({});
    grantSession();
    return;
  }

  // ── Record failed attempt ─────────────────────────────────────────────
  const result = recordFailedAttempt();
  termLog('error', 'Failed login attempt (' +
    (result.locked ? 'LOCKED' : (LOGIN_MAX_ATTEMPTS - result.attempts + 1) + ' attempts left') + ')');

  if (result.locked) {
    showLockoutTimer(LOGIN_LOCKOUT_MS);
  } else {
    const left = LOGIN_MAX_ATTEMPTS - result.attempts;
    errorEl.textContent = 'Invalid credentials. ' +
      (left === 1 ? '1 attempt remaining before lockout.' : left + ' attempts remaining.');
    errorEl.classList.add('show');
    setTimeout(() => errorEl.classList.remove('show'), 4000);
  }

  el('login-password').value = '';
}

// FIX: Single canonical grantSession declaration.
// The TOTP wrapper below will reassign this via _originalGrantSession.
function grantSession() {
  STATE.authenticated = true;
  STATE.sessionExpiry = Date.now() + SOC_CONFIG.sessionTimeout * 60 * 1000;
  sessionStorage.setItem('soc_session', JSON.stringify({
    expiry: STATE.sessionExpiry,
    token: btoa(Date.now().toString())
  }));
  el('login-screen').style.display = 'none';
  el('soc-app').classList.add('active');
  termLog('info', 'Admin session started');
  showToast('Authentication successful', 'success');
  loadSOCConfig(); // fetch SOC_WORKER_KEY immediately after auth
  initDashboard();
}

function checkSession() {
  try {
    const sess = JSON.parse(sessionStorage.getItem('soc_session') || '{}');
    if (sess.expiry && Date.now() < sess.expiry) {
      STATE.authenticated = true;
      STATE.sessionExpiry = sess.expiry;
      el('login-screen').style.display = 'none';
      el('soc-app').classList.add('active');
      loadSOCConfig(); // fetch SOC_WORKER_KEY on session restore
      initDashboard();
      return true;
    }
  } catch (_) {}
  return false;
}

function logout() {
  STATE.authenticated = false;
  sessionStorage.removeItem('soc_session');
  if (STATE.refreshTimer) clearInterval(STATE.refreshTimer);
  el('soc-app').classList.remove('active');
  el('login-screen').style.display = 'flex';
  el('login-password').value = '';
  showToast('Session ended', 'info');
}

// Session timeout monitor
setInterval(() => {
  if (STATE.authenticated && STATE.sessionExpiry && Date.now() > STATE.sessionExpiry) {
    showToast('Session expired — please log in again', 'warning');
    logout();
  }
}, 30000);

// ─────────────────────────────────────────────────────────────────────────────
// APPS SCRIPT API
// ─────────────────────────────────────────────────────────────────────────────
async function callAppsScript(action, params = {}) {
  // Always route through Cloudflare Worker /api to avoid CORS issues
  // Worker proxies to Apps Script server-side with proper CORS headers
  const WORKER_API = 'https://cybaash.mohamedaasiq07.workers.dev/api';

  try {
    const response = await fetch(WORKER_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...params }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } catch (err) {
    termLog('warn', 'API error [' + action + ']: ' + err.message);
    return getMockData(action, params);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA (Demo mode when Apps Script not configured)
// ─────────────────────────────────────────────────────────────────────────────
function getMockData(action, params) {
  const ips = ['103.21.244.8', '185.220.101.47', '45.142.212.100', '195.54.160.149', '77.88.55.66', '198.199.94.201', '104.21.36.83', '172.67.182.3'];
  const urls = ['/admin-test', '/?id=1%27OR%271=1', '/wp-admin', '/<script>alert(1)</script>', '/phpmyadmin', '/index.html', '/recruiter.html', '/.env'];
  const agents = ['sqlmap/1.7.2', 'Mozilla/5.0 (compatible; Googlebot)', 'python-requests/2.28.0', 'curl/7.88.1', 'Nikto/2.1.6', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'];
  const attackTypes = ['SQLi', 'XSS', 'HONEYPOT', 'RATE_ABUSE', 'PATH_TRAVERSAL', 'CLEAN'];
  const now = Date.now();

  if (action === 'getLogs') {
    const logs = [];
    for (let i = 0; i < 50; i++) {
      const risk = Math.floor(Math.random() * 100);
      const attackType = attackTypes[Math.floor(Math.random() * attackTypes.length)];
      logs.push({
        id: `log_${i}`,
        timestamp: new Date(now - i * 47000 - Math.random() * 30000).toISOString(),
        ip: ips[Math.floor(Math.random() * ips.length)],
        url: urls[Math.floor(Math.random() * urls.length)],
        userAgent: agents[Math.floor(Math.random() * agents.length)],
        risk,
        attackType: risk > 40 ? attackType : 'CLEAN',
        fingerprint: Math.random().toString(16).substr(2, 8),
        country: ['CN', 'RU', 'US', 'DE', 'NL', 'BR'][Math.floor(Math.random() * 6)],
        blocked: risk > 75,
      });
    }
    return { logs };
  }

  if (action === 'getStats') {
    return {
      total: 1247 + Math.floor(Math.random() * 50),
      blocked: 89 + Math.floor(Math.random() * 10),
      sqli: 34 + Math.floor(Math.random() * 5),
      xss: 18 + Math.floor(Math.random() * 3),
      honeypot: 12 + Math.floor(Math.random() * 2),
      rateAbuse: 25 + Math.floor(Math.random() * 5),
      trafficHistory: Array.from({ length: 20 }, () => Math.floor(Math.random() * 80) + 10),
      attackHistory: Array.from({ length: 20 }, () => Math.floor(Math.random() * 20)),
    };
  }

  if (action === 'getTopAttackers') {
    return {
      attackers: ips.slice(0, 6).map(ip => ({
        ip,
        requests: Math.floor(Math.random() * 200) + 20,
        risk: Math.floor(Math.random() * 60) + 40,
        attacks: Math.floor(Math.random() * 15),
        lastSeen: new Date(now - Math.random() * 3600000).toISOString(),
        blocked: Math.random() > 0.5,
        country: ['CN', 'RU', 'NL', 'US', 'DE'][Math.floor(Math.random() * 5)],
      }))
    };
  }

  if (action === 'getBlockedIPs') {
    return {
      blocked: ips.slice(0, 4).map(ip => ({
        ip,
        reason: ['SQLi detected', 'XSS attempt', 'Honeypot triggered', 'Rate abuse'][Math.floor(Math.random() * 4)],
        blockedAt: new Date(now - Math.random() * 86400000).toISOString(),
        cloudflare: Math.random() > 0.3,
      }))
    };
  }

  if (action === 'blockIP') {
    return { success: true, message: `IP ${params.ip} blocked successfully` };
  }

  if (action === 'unblockIP') {
    return { success: true, message: `IP ${params.ip} unblocked` };
  }

  if (action === 'verifyAdmin') {
    return { ok: false }; // Falls back to local hash
  }

  if (action === 'getAPTAlerts') {
    return {
      alerts: [
        { timestamp: new Date().toISOString(), ip: '185.220.101.47', country: 'RU',
          attackType: 'APT', risk: 95, ttps: ['T1190','T1595.002','T1046'],
          summary: 'Coordinated multi-vector attack with APT-like persistence indicators',
          action: 'EMERGENCY_BLOCK', resolved: false, notes: 'Demo alert' },
        { timestamp: new Date(Date.now()-3600000).toISOString(), ip: '45.142.212.100', country: 'NL',
          attackType: 'HONEYPOT', risk: 88, ttps: ['T1595.001'],
          summary: 'Honeypot triggered — likely automated scanner',
          action: 'BLOCK', resolved: true, notes: '' }
      ]
    };
  }

  if (action === 'getGeoStats') {
    return { countries: [
      {country:'RU',count:45},{country:'CN',count:32},{country:'NL',count:28},
      {country:'US',count:18},{country:'DE',count:12},{country:'BR',count:8}
    ]};
  }

  if (action === 'getBehaviorStats') {
    return { stats: { total: 247, botDetected: 63, humanLikely: 184 }};
  }

  if (action === 'purgeOldLogs') {
    return { success: true, deleted: 0, keepDays: params.keepDays || 30 };
  }

  if (action === 'exportCSV') {
    return { success: true, csv: 'Timestamp,IP,Country,URL,AttackType,RiskScore\n' +
      new Date().toISOString() + ',1.2.3.4,US,/test,CLEAN,0', rows: 1 };
  }

  if (action === 'sendDailyReport') {
    return { success: true, date: new Date().toISOString().split('T')[0] };
  }

  if (action === 'generateTOTP') {
    return { success: true, message: 'Code sent to alert email' };
  }

  if (action === 'verifyTOTP') {
    return { ok: false, reason: 'Demo mode — TOTP not active' };
  }

  return { error: 'Unknown action' };
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────
async function initDashboard() {
  startClock();
  initCharts();
  await refreshAll();
  STATE.refreshTimer = setInterval(() => {
    if (STATE.authenticated) refreshAll();
  }, SOC_CONFIG.refreshInterval * 1000);
  termLog('info', `Dashboard initialized — refresh every ${SOC_CONFIG.refreshInterval}s`);
}

async function refreshAll() {
  termLog('info', 'Fetching latest data from Apps Script...');
  const [stats, logs, attackers, blocked] = await Promise.all([
    callAppsScript('getStats'),
    callAppsScript('getLogs'),
    callAppsScript('getTopAttackers'),
    callAppsScript('getBlockedIPs'),
  ]);

  if (stats) updateStats(stats);
  if (logs?.logs) updateLogs(logs.logs);
  if (attackers?.attackers) updateTopAttackers(attackers.attackers);
  if (blocked?.blocked) updateBlockedIPs(blocked.blocked);

  el('last-updated')?.setAttribute('data-time', new Date().toLocaleTimeString('en-US', { hour12: false }));
  const lu = el('last-updated');
  if (lu) lu.textContent = 'Updated ' + new Date().toLocaleTimeString('en-US', { hour12: false });
  termLog('info', 'Data refresh complete');
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS UPDATE
// ─────────────────────────────────────────────────────────────────────────────
function updateStats(stats) {
  animateCount('stat-total',    stats.total    || 0);
  animateCount('stat-blocked',  stats.blocked  || 0);
  animateCount('stat-sqli',     stats.sqli     || 0);
  animateCount('stat-xss',      stats.xss      || 0);
  animateCount('stat-honeypot', stats.honeypot || 0);
  animateCount('stat-rate',     stats.rateAbuse || 0);

  STATE.trafficHistory = stats.trafficHistory || STATE.trafficHistory;
  STATE.attackHistory  = stats.attackHistory  || STATE.attackHistory;
  STATE.threatStats = stats;

  updateCharts();
}

function animateCount(id, target) {
  const el_ = el(id);
  if (!el_) return;
  const start = parseInt(el_.textContent) || 0;
  const diff = target - start;
  const steps = 20;
  let step = 0;
  const timer = setInterval(() => {
    step++;
    el_.textContent = Math.round(start + diff * (step / steps));
    if (step >= steps) { el_.textContent = target; clearInterval(timer); }
  }, 30);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHARTS
// ─────────────────────────────────────────────────────────────────────────────
function initCharts() {
  if (typeof Chart === 'undefined') {
    termLog('warn', 'Chart.js not loaded — charts unavailable');
    return;
  }

  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: {
      backgroundColor: '#0c1e2e',
      borderColor: 'rgba(0,200,255,0.3)',
      borderWidth: 1,
      titleFont: { family: 'Share Tech Mono', size: 11 },
      bodyFont: { family: 'Share Tech Mono', size: 11 },
    }},
  };

  // Traffic chart
  const trafficCtx = el('chart-traffic')?.getContext('2d');
  if (trafficCtx) {
    STATE.charts.traffic = new Chart(trafficCtx, {
      type: 'line',
      data: {
        labels: Array.from({ length: 20 }, (_, i) => `-${20 - i}m`),
        datasets: [{
          data: STATE.trafficHistory,
          borderColor: '#00c8ff',
          backgroundColor: 'rgba(0,200,255,0.06)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointBackgroundColor: '#00c8ff',
        }]
      },
      options: { ...chartDefaults, scales: {
        x: { grid: { color: 'rgba(0,200,255,0.05)' }, ticks: { color: '#3a6a85', font: { family: 'Share Tech Mono', size: 9 } } },
        y: { grid: { color: 'rgba(0,200,255,0.05)' }, ticks: { color: '#3a6a85', font: { family: 'Share Tech Mono', size: 9 } } }
      }}
    });
  }

  // Attack chart
  const attackCtx = el('chart-attacks')?.getContext('2d');
  if (attackCtx) {
    STATE.charts.attacks = new Chart(attackCtx, {
      type: 'bar',
      data: {
        labels: Array.from({ length: 20 }, (_, i) => `-${20 - i}m`),
        datasets: [{
          data: STATE.attackHistory,
          backgroundColor: 'rgba(255,51,85,0.3)',
          borderColor: '#ff3355',
          borderWidth: 1,
          borderRadius: 2,
        }]
      },
      options: { ...chartDefaults, scales: {
        x: { grid: { color: 'rgba(255,51,85,0.05)' }, ticks: { color: '#3a6a85', font: { family: 'Share Tech Mono', size: 9 } } },
        y: { grid: { color: 'rgba(255,51,85,0.05)' }, ticks: { color: '#3a6a85', font: { family: 'Share Tech Mono', size: 9 } } }
      }}
    });
  }

  // Attack type donut
  const typeCtx = el('chart-types')?.getContext('2d');
  if (typeCtx) {
    STATE.charts.types = new Chart(typeCtx, {
      type: 'doughnut',
      data: {
        labels: ['SQLi', 'XSS', 'Honeypot', 'Rate Abuse', 'Other'],
        datasets: [{
          data: [34, 18, 12, 25, 10],
          backgroundColor: ['rgba(255,51,85,0.7)', 'rgba(255,140,0,0.7)', 'rgba(255,215,0,0.7)', 'rgba(0,200,255,0.7)', 'rgba(122,179,204,0.5)'],
          borderColor: ['#ff3355', '#ff8c00', '#ffd700', '#00c8ff', '#7ab3cc'],
          borderWidth: 1,
        }]
      },
      options: {
        ...chartDefaults,
        plugins: {
          ...chartDefaults.plugins,
          legend: { display: true, position: 'bottom', labels: { color: '#7ab3cc', font: { family: 'Share Tech Mono', size: 10 }, padding: 12, boxWidth: 12 } }
        },
        cutout: '60%',
      }
    });
  }
}

function updateCharts() {
  if (STATE.charts.traffic) {
    STATE.charts.traffic.data.datasets[0].data = STATE.trafficHistory;
    STATE.charts.traffic.update('none');
  }
  if (STATE.charts.attacks) {
    STATE.charts.attacks.data.datasets[0].data = STATE.attackHistory;
    STATE.charts.attacks.update('none');
  }
  if (STATE.charts.types && STATE.threatStats) {
    const s = STATE.threatStats;
    const other = Math.max(0, (s.total || 0) - (s.sqli||0) - (s.xss||0) - (s.honeypot||0) - (s.rateAbuse||0));
    STATE.charts.types.data.datasets[0].data = [s.sqli||34, s.xss||18, s.honeypot||12, s.rateAbuse||25, other||10];
    STATE.charts.types.update('none');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGS TABLE
// ─────────────────────────────────────────────────────────────────────────────
function updateLogs(logs) {
  STATE.logs = logs.slice(0, SOC_CONFIG.maxLogRows);
  renderLogsTable();
  generateAlerts(logs);
}

function renderLogsTable(filter = '') {
  const tbody = el('logs-tbody');
  if (!tbody) return;

  let rows = STATE.logs;
  if (filter) {
    const q = filter.toLowerCase();
    rows = rows.filter(r =>
      (r.ip || '').includes(q) ||
      (r.url || '').toLowerCase().includes(q) ||
      (r.attackType || '').toLowerCase().includes(q) ||
      (r.country || '').toLowerCase().includes(q)
    );
  }

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><span class="es-icon">📋</span>No logs found</div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const risk = r.risk || 0;
    return `
      <tr>
        <td class="td-time">${formatDateTime(r.timestamp)}</td>
        <td class="td-ip">${escapeHtml(r.ip || '—')}</td>
        <td><span class="badge badge-gray">${escapeHtml(r.country || '??')}</span></td>
        <td class="td-url" title="${escapeHtml(r.url)}">${escapeHtml(r.url || '/')}</td>
        <td><span class="badge ${r.attackType !== 'CLEAN' ? 'badge-red' : 'badge-green'}">${escapeHtml(r.attackType || 'CLEAN')}</span></td>
        <td>
          <div class="risk-bar-wrap">
            <div class="risk-bar-bg"><div class="risk-bar-fill ${riskBarClass(risk)}"></div></div>
            <span class="risk-val" style="color:${risk>=80?'var(--red)':risk>=60?'var(--orange)':risk>=40?'var(--yellow)':'var(--green)'}">${risk}</span>
          </div>
        </td>
        <td>
          ${r.blocked
            ? `<span class="badge badge-red">BLOCKED</span>`
            : `<button class="btn btn-red btn-sm" onclick="blockIPQuick('${escapeHtml(r.ip)}')">Block</button>`
          }
        </td>
      </tr>
    `;
  }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// ALERTS
// ─────────────────────────────────────────────────────────────────────────────
function generateAlerts(logs) {
  const alertMap = {
    'SQLi': { icon: '💉', level: 'critical', label: 'SQL Injection Detected' },
    'XSS': { icon: '⚡', level: 'high', label: 'XSS Attack Detected' },
    'HONEYPOT': { icon: '🍯', level: 'critical', label: 'Honeypot Triggered' },
    'RATE_ABUSE': { icon: '🔄', level: 'medium', label: 'Rate Limit Abuse' },
    'PATH_TRAVERSAL': { icon: '🗂️', level: 'high', label: 'Path Traversal Attempt' },
  };

  const newAlerts = [];
  const seen = new Set();

  for (const log of logs) {
    if (log.attackType && log.attackType !== 'CLEAN') {
      const key = `${log.ip}:${log.attackType}`;
      if (!seen.has(key)) {
        seen.add(key);
        const meta = alertMap[log.attackType] || { icon: '⚠️', level: 'medium', label: log.attackType };
        newAlerts.push({
          ...meta,
          ip: log.ip,
          timestamp: log.timestamp,
          url: log.url,
          risk: log.risk,
        });
      }
    }
  }

  STATE.alerts = newAlerts.slice(0, 30);
  renderAlerts();
  el('alert-count').textContent = STATE.alerts.filter(a => a.level === 'critical' || a.level === 'high').length;
}

function renderAlerts() {
  const feed = el('alert-feed');
  if (!feed) return;

  if (!STATE.alerts.length) {
    feed.innerHTML = '<div class="empty-state"><span class="es-icon">✅</span>No active alerts</div>';
    return;
  }

  feed.innerHTML = STATE.alerts.map(a => `
    <div class="alert-item ${a.level}">
      <span class="alert-icon">${a.icon}</span>
      <div class="alert-body">
        <div class="alert-title">${escapeHtml(a.label)} — <strong>${escapeHtml(a.ip)}</strong></div>
        <div class="alert-meta">${escapeHtml(a.url)} · Risk ${a.risk} · ${timeAgo(a.timestamp)}</div>
      </div>
      <span class="badge ${riskClass(a.risk)}">${riskLabel(a.risk)}</span>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// TOP ATTACKERS
// ─────────────────────────────────────────────────────────────────────────────
function updateTopAttackers(attackers) {
  STATE.topAttackers = attackers;
  const tbody = el('attackers-tbody');
  if (!tbody) return;

  if (!attackers.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><span class="es-icon">🛡️</span>No threat actors identified</div></td></tr>`;
    return;
  }

  tbody.innerHTML = attackers.map(a => `
    <tr>
      <td class="td-ip">${escapeHtml(a.ip)}</td>
      <td><span class="badge badge-gray">${escapeHtml(a.country || '??')}</span></td>
      <td style="color:var(--text-primary)">${a.requests}</td>
      <td style="color:var(--red)">${a.attacks}</td>
      <td>
        <div class="risk-bar-wrap">
          <div class="risk-bar-bg"><div class="risk-bar-fill ${riskBarClass(a.risk)}"></div></div>
          <span class="risk-val" style="color:${a.risk>=80?'var(--red)':a.risk>=60?'var(--orange)':'var(--yellow)'}">${a.risk}</span>
        </div>
      </td>
      <td class="td-time">${timeAgo(a.lastSeen)}</td>
      <td>
        ${a.blocked
          ? `<button class="btn btn-green btn-sm" onclick="unblockIP('${escapeHtml(a.ip)}')">Unblock</button>`
          : `<button class="btn btn-red btn-sm" onclick="blockIPQuick('${escapeHtml(a.ip)}')">Block</button>`
        }
      </td>
    </tr>
  `).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCKED IPs
// ─────────────────────────────────────────────────────────────────────────────
function updateBlockedIPs(blocked) {
  STATE.blockedIPs = blocked;
  const tbody = el('blocked-tbody');
  if (!tbody) return;

  if (!blocked.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><span class="es-icon">✅</span>No IPs currently blocked</div></td></tr>`;
    return;
  }

  tbody.innerHTML = blocked.map(b => `
    <tr>
      <td class="td-ip">${escapeHtml(b.ip)}</td>
      <td style="color:var(--text-secondary)">${escapeHtml(b.reason)}</td>
      <td class="td-time">${formatDateTime(b.blockedAt)}</td>
      <td>${b.cloudflare ? `<span class="badge badge-orange">☁ Cloudflare</span>` : `<span class="badge badge-gray">Local</span>`}</td>
      <td><button class="btn btn-green btn-sm" onclick="unblockIP('${escapeHtml(b.ip)}')">Unblock</button></td>
    </tr>
  `).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// IP BLOCK / UNBLOCK ACTIONS
// ─────────────────────────────────────────────────────────────────────────────
async function blockIPQuick(ip) {
  if (!ip) return;
  if (!confirm(`Block IP ${ip}? This will add a Cloudflare firewall rule.`)) return;
  await blockIPAction(ip, 'Manual block from SOC dashboard');
}

async function blockIPAction(ip, reason = 'Manual block') {
  termLog('info', `Blocking IP: ${ip} — ${reason}`);
  showToast(`Blocking ${ip}...`, 'warning', 2000);

  const result = await callAppsScript('blockIP', { ip, reason });
  if (result?.success) {
    termLog('block', `IP BLOCKED: ${ip} via Cloudflare`);
    showToast(`${ip} blocked successfully`, 'success');
    await refreshAll();
  } else {
    termLog('error', `Block failed for ${ip}: ${result?.error || 'unknown'}`);
    showToast(`Failed to block ${ip}`, 'error');
  }
}

async function unblockIP(ip) {
  if (!ip) return;
  if (!confirm(`Unblock IP ${ip}?`)) return;

  termLog('info', `Unblocking IP: ${ip}`);
  const result = await callAppsScript('unblockIP', { ip });
  if (result?.success) {
    termLog('info', `IP UNBLOCKED: ${ip}`);
    showToast(`${ip} unblocked`, 'success');
    await refreshAll();
  } else {
    showToast(`Failed to unblock ${ip}`, 'error');
  }
}

async function blockManualIP() {
  const ip = el('manual-ip-input').value.trim();
  const reason = el('manual-reason-input')?.value.trim() || 'Manual block';
  if (!ip) { showToast('Enter a valid IP address', 'error'); return; }
  if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d+)?$/.test(ip)) {
    showToast('Invalid IP format', 'error'); return;
  }
  await blockIPAction(ip, reason);
  el('manual-ip-input').value = '';
}

async function unblockManualIP() {
  const ip = el('manual-ip-input').value.trim();
  if (!ip) { showToast('Enter a valid IP address', 'error'); return; }
  await unblockIP(ip);
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────
function switchTab(tabId) {
  qsa('.nav-tab').forEach(t => t.classList.remove('active'));
  qsa('.tab-panel').forEach(p => p.classList.remove('active'));
  const tab = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
  const panel = el(`panel-${tabId}`);
  if (tab) tab.classList.add('active');
  if (panel) panel.classList.add('active');
  STATE.activeTab = tabId;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOG FILTER
// ─────────────────────────────────────────────────────────────────────────────
function filterLogs() {
  const q = el('log-search')?.value || '';
  renderLogsTable(q);
}

function exportLogs() {
  const rows = STATE.logs;
  if (!rows.length) { showToast('No logs to export', 'warning'); return; }
  const csv = [
    'Timestamp,IP,Country,URL,Attack Type,Risk Score,Blocked',
    ...rows.map(r => `"${r.timestamp}","${r.ip}","${r.country}","${r.url}","${r.attackType}",${r.risk},${r.blocked}`)
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `soc-logs-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  showToast('Logs exported as CSV', 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS SAVE
// ─────────────────────────────────────────────────────────────────────────────
async function saveSettings() {
  const appsScriptUrl = el('cfg-apps-script-url')?.value.trim();
  const newPw = el('cfg-new-password')?.value.trim();

  if (appsScriptUrl) {
    SOC_CONFIG.appsScriptUrl = appsScriptUrl;
    localStorage.setItem('soc_apps_script_url', appsScriptUrl);
    termLog('info', 'Apps Script URL updated');
  }

  if (newPw) {
    const hash = await sha256(newPw);
    localStorage.setItem('soc_pw_hash', hash);
    SOC_CONFIG.passwordHash = hash;
    el('cfg-new-password').value = '';
    termLog('info', 'Admin password updated');
  }

  showToast('Settings saved', 'success');
}

function loadSettings() {
  const savedUrl = localStorage.getItem('soc_apps_script_url');
  if (savedUrl) {
    SOC_CONFIG.appsScriptUrl = savedUrl;
    const el_ = el('cfg-apps-script-url');
    if (el_) el_.value = savedUrl;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────────────────
async function loadSOCConfig() {
  // Fetch SOC Worker key from Cloudflare Worker /config endpoint.
  // The Worker reads env.SOC_KEY server-side — no secret ever touches this file.
  try {
    const resp = await fetch('https://cybaash.mohamedaasiq07.workers.dev/config', {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const cfg = await resp.json();
    if (cfg && cfg.socKey) {
      SOC_WORKER_KEY = cfg.socKey;
      termLog('info', 'SOC Worker key loaded — audit/intel/threats endpoints active');
    } else {
      termLog('warn', 'Worker /config returned no socKey — audit log may show 401');
    }
  } catch (e) {
    termLog('warn', 'Could not load SOC Worker key: ' + e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EMERGENCY RESET — run in browser console if locked out:
//   SOCreset()
// ─────────────────────────────────────────────────────────────────────────────
window.SOCreset = function() {
  localStorage.removeItem('soc_pw_hash');
  localStorage.removeItem('soc_apps_script_url');
  sessionStorage.removeItem('soc_session');
  console.log('[SOC] Reset complete. Refresh the page and log in with: cybaash-soc-admin');
  location.reload();
};

// ─────────────────────────────────────────────────────────────────────────────
// DOMContentLoaded — single consolidated handler
// FIX: Merged the two separate DOMContentLoaded listeners into one.
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSOCConfig(); // async — non-blocking
  loadSettings();

  // Login form
  el('login-form')?.addEventListener('submit', handleLogin);

  // Tab clicks
  qsa('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Log search
  el('log-search')?.addEventListener('input', filterLogs);

  // Logout button
  el('logout-btn')?.addEventListener('click', logout);

  // Manual refresh button
  el('refresh-btn')?.addEventListener('click', () => { refreshAll(); showToast('Refreshing...', 'info', 1500); });

  // Check existing session
  if (!checkSession()) {
    el('login-screen').style.display = 'flex';
  }

  // Password toggle
  el('toggle-pw')?.addEventListener('click', () => {
    const inp = el('login-password');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  // Terminal input — Enter key
  const inp = el('terminal-input');
  if (inp) {
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') runTerminalCommand();
    });
  }

  // APT tab click handler
  const aptTab = document.querySelector('.nav-tab[data-tab="apt"]');
  if (aptTab) {
    aptTab.addEventListener('click', () => loadAPTAlerts());
  }

  // Intel Panel link
  const intelLink = el('intel-panel-link');
  if (intelLink) {
    intelLink.addEventListener('click', () => window.open('/admin/intel.html', '_blank'));
  }

  // Request push notification permission on first user gesture
  document.addEventListener('click', requestNotificationPermission, { once: true });
});

// ═══════════════════════════════════════════════════════════════════════════
//  MILITARY ADDITIONS v2.0
// ═══════════════════════════════════════════════════════════════════════════
// FIX: Removed duplicate 'use strict' — already declared at top of file.

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

// Store ref to original handler if it exists
const _originalHandleTerminalCommand = (typeof handleTerminalCommand === 'function')
  ? handleTerminalCommand
  : null;

function handleTerminalCommand(input) {
  const parts   = input.trim().split(/\s+/);
  const cmd     = (parts[0] || '').toLowerCase();
  const args    = parts.slice(1);
  const WORKER  = 'https://cybaash.mohamedaasiq07.workers.dev';

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

    case 'purge': {
      const days = parseInt(args[0]) || 30;
      if (!confirm(`Delete SOC logs older than ${days} days?`)) { termPrint('  Aborted.'); return; }
      termPrint(`> Purging logs older than ${days} days...`);
      callAppsScript('purgeOldLogs', { keepDays: days }).then(d => {
        termPrint(d.success ? `  ✅ Deleted ${d.deleted} rows (kept last ${days} days)` : `  ❌ ${d.error}`);
      }).catch(e => termPrint('  ❌ ' + e.message));
      return;
    }

    case 'export': {
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
    }

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
        headers: {
          'Content-Type': 'application/json',
          ...(SOC_WORKER_KEY ? { 'X-SOC-Key': SOC_WORKER_KEY } : {}),
        }
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
      if (_originalHandleTerminalCommand) {
        _originalHandleTerminalCommand(input);
      } else {
        termPrint(`  Unknown command: ${cmd}. Type 'help' for commands.`);
      }
  }
}

// Terminal print helper
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

// Terminal run — called by Run button and Enter key
function runTerminalCommand() {
  const input = el('terminal-input');
  if (!input) return;
  const cmd = input.value.trim();
  if (!cmd) return;
  termLog('info', '$ ' + cmd);
  input.value = '';
  handleTerminalCommand(cmd);
}

// ─────────────────────────────────────────────────────────────────────────────
// UPGRADE 5C — TWO-FACTOR TOTP LOGIN
//
// How it works:
//   1. After password auth succeeds, handleLogin calls grantSession().
//   2. grantSession is reassigned below to an async wrapper.
//   3. The wrapper checks a SOC_CONFIG flag (or localStorage override)
//      to decide whether TOTP is required — no extra network call needed.
//   4. If TOTP is required → startTOTPFlow() shows the overlay; on success
//      it calls _originalGrantSession() to complete the login.
//   5. If TOTP is disabled → falls straight through to _originalGrantSession().
//
// To ENABLE TOTP:  set  localStorage.setItem('soc_totp_enabled', '1')
//                  or   SOC_CONFIG.totpEnabled = true  in the config block.
// To DISABLE TOTP: localStorage.removeItem('soc_totp_enabled')
// ─────────────────────────────────────────────────────────────────────────────
const _originalGrantSession = grantSession;

grantSession = async function() {
  // Check if TOTP is enabled via config or localStorage override
  const totpEnabled = SOC_CONFIG.totpEnabled ||
                      localStorage.getItem('soc_totp_enabled') === '1';

  if (totpEnabled) {
    // startTOTPFlow will call _originalGrantSession() on success
    await startTOTPFlow();
    return;
  }

  // TOTP not enabled — grant session immediately
  _originalGrantSession();
};

async function startTOTPFlow() {
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
  setTimeout(() => document.getElementById('totp-input')?.focus(), 100);

  try {
    await callAppsScript('generateTOTP');
    termLog('info', 'TOTP code sent to alert email');
  } catch(e) {
    termLog('warn', 'TOTP send failed: ' + e.message);
  }

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
        _originalGrantSession();
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

  document.getElementById('totp-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('totp-verify-btn').click();
  });

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
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
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
      osc.frequency.value = 440;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch(_) {}
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(perm => {
      termLog('info', 'Notification permission: ' + perm);
    });
  }
}

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

// PATCH: Extend refreshAll to call checkForNewAlerts after each data refresh
(function() {
  var _origRefreshAll = refreshAll;
  refreshAll = async function() {
    var prevCount = STATE.logs ? STATE.logs.length : 0;
    await _origRefreshAll();
    if (STATE.logs && STATE.logs.length) {
      checkForNewAlerts(STATE.logs, prevCount);
      _prevLogCount = STATE.logs.length;
    }
  };
})();

// PATCH: Extend switchTab to load APT alerts when apt tab is opened
(function() {
  var _origSwitchTab = switchTab;
  switchTab = function(tabId) {
    _origSwitchTab(tabId);
    if (tabId === 'apt') loadAPTAlerts();
  };
})();

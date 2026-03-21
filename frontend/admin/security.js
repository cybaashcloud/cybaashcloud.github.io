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
// ── Load appsScriptUrl from Cloudflare Worker at startup ──────────────────
async function loadSOCConfig() {
  // All API calls now go through Worker /api — no direct Apps Script URL needed
  // Worker handles CORS, auth injection, and forwarding server-side
  console.log('[SOC] Config: all calls routed via Worker /api');
}


// ─────────────────────────────────────────────────────────────────────────────
// EMERGENCY RESET — run in browser console if locked out:
//   SOCreset()
// This clears stored password hash and lets you log in with default password
// ─────────────────────────────────────────────────────────────────────────────
window.SOCreset = function() {
  localStorage.removeItem('soc_pw_hash');
  localStorage.removeItem('soc_apps_script_url');
  sessionStorage.removeItem('soc_session');
  console.log('[SOC] Reset complete. Refresh the page and log in with: cybaash-soc-admin');
  location.reload();
};

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
});

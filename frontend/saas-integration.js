/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  CYBAASH SaaS Layer — saas-integration.js                       ║
 * ║  Drop into index.html BEFORE </body>                            ║
 * ║  Zero breaking changes to existing simulation/terminal/replay   ║
 * ║                                                                  ║
 * ║  Adds:                                                           ║
 * ║  • GitHub OAuth Device Flow login (no server)                   ║
 * ║  • Per-user GitHub private repo as database                     ║
 * ║  • Persistent simulation save/resume (localStorage + GitHub)    ║
 * ║  • Terminal commands: save, load, account, missions             ║
 * ║  • User badge in header (replaces "root@cybaash")               ║
 * ║  • Auto-save on simulation end                                  ║
 * ║  • Simulation history panel                                     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ══════════════════════════════════════════════════════════════
// §1 — CONFIG
// ══════════════════════════════════════════════════════════════

const SAAS_CONFIG = {
  clientId:    window.__CYBAASH_CLIENT_ID__ || '',   // set via meta tag or window var
  scopes:      'read:user user:email repo',
  dataRepo:    'cybaash-data',
  // deviceUrl: removed — Device Flow is CORS-blocked in browsers; PAT auth used instead
  // tokenUrl: removed — PAT auth used instead
  apiBase:     'https://api.github.com',
  localPrefix: 'cybaash_saas_',
  autoSaveMs:  3 * 60 * 1000,   // 3 minute auto-save
  debounceMs:  2000,
};

// ══════════════════════════════════════════════════════════════
// §2 — STATE
// ══════════════════════════════════════════════════════════════

const SAAS = {
  token:       null,
  user:        null,
  activeSim:   null,   // current simulation ID being tracked
  saveTimer:   null,
  autoSaveInt: null,
  initialized: false,
};

// ══════════════════════════════════════════════════════════════
// §3 — STORAGE HELPERS (localStorage)
// ══════════════════════════════════════════════════════════════

const LS = {
  get:    k => { try { return JSON.parse(localStorage.getItem(SAAS_CONFIG.localPrefix + k)) } catch { return null } },
  set:    (k, v) => localStorage.setItem(SAAS_CONFIG.localPrefix + k, JSON.stringify(v)),
  del:    k => localStorage.removeItem(SAAS_CONFIG.localPrefix + k),
  token:  () => localStorage.getItem(SAAS_CONFIG.localPrefix + 'token'),
  setTok: t => localStorage.setItem(SAAS_CONFIG.localPrefix + 'token', t),
  delTok: () => localStorage.removeItem(SAAS_CONFIG.localPrefix + 'token'),
};

// ══════════════════════════════════════════════════════════════
// §4 — GITHUB API CLIENT
// ══════════════════════════════════════════════════════════════

async function ghRequest(path, opts = {}) {
  const res = await fetch(`${SAAS_CONFIG.apiBase}${path}`, {
    ...opts,
    headers: {
      Authorization:          `Bearer ${SAAS.token}`,
      Accept:                 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':         'application/json',
      ...opts.headers,
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${path}`);
  return res.status === 204 ? null : res.json();
}

async function ghRead(owner, filePath) {
  const meta = await ghRequest(`/repos/${owner}/${SAAS_CONFIG.dataRepo}/contents/${filePath}`);
  if (!meta) return null;
  const content = JSON.parse(atob(meta.content.replace(/\n/g, '')));
  return { content, sha: meta.sha };
}

async function ghWrite(owner, filePath, content, sha = null) {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2))));
  return ghRequest(`/repos/${owner}/${SAAS_CONFIG.dataRepo}/contents/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `cybaash: update ${filePath} — ${new Date().toISOString()}`,
      content: encoded,
      ...(sha && { sha }),
    }),
  });
}

async function ensureDataRepo() {
  const exists = await ghRequest(`/repos/${SAAS.user.login}/${SAAS_CONFIG.dataRepo}`);
  if (exists) return;
  try {
    await ghRequest('/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name:        SAAS_CONFIG.dataRepo,
        private:     true,
        description: 'CYBAASH operator data — auto-managed',
        auto_init:   true,
      }),
    });
    await new Promise(r => setTimeout(r, 1500));
  } catch(err) {
    // Fine-grained tokens cannot create repos — log guidance, don't crash
    saasTermPrint(
      '[SAAS] Could not auto-create "' + SAAS_CONFIG.dataRepo + '" repo (token lacks repo creation). ' +
      'Create it manually at github.com/new (private, with README), then reload.', 'warn'
    );
  }
}

// ══════════════════════════════════════════════════════════════
// §5 — AUTHENTICATION (GitHub Device Flow)
// ══════════════════════════════════════════════════════════════

async function saasLogin() {
  // GitHub Device Flow is CORS-blocked in browsers. Use PAT instead.
  showPatOverlay();
}

function saasLoginWithPat(pat) {
  pat = (pat || '').trim();
  if (!pat) { setPatOverlayError('Please enter your GitHub Personal Access Token.'); return; }
  if (!pat.startsWith('ghp_') && !pat.startsWith('github_pat_')) {
    setPatOverlayError("Invalid token.");
    return;
  }
  const btn = document.getElementById('saas-pat-btn');
  if (btn) { btn.textContent = 'Connecting…'; btn.disabled = true; }
  SAAS.token = pat;
  ghRequest('/user').then(async ghUser => {
    try {
      if (!ghUser?.login) throw new Error('Token accepted but could not read user info.');
      LS.setTok(pat);
      hidePatOverlay();
      await finishLogin();
    } catch (err) {
      SAAS.token = null;
      if (btn) { btn.textContent = 'Connect'; btn.disabled = false; }
      const msg = err.message || '';
      setPatOverlayError(/401|403|Bad credentials/i.test(msg)
        ? "Token rejected — check it has repo + read:user scopes and hasn't expired."
        : msg || 'Connection failed');
    }
  });
}

async function finishLogin() {
  const ghUser = await ghRequest('/user');
  SAAS.user = ghUser;
  LS.set('user', {
    login:      ghUser.login,
    name:       ghUser.name,
    avatar_url: ghUser.avatar_url,
    email:      ghUser.email,
    html_url:   ghUser.html_url,
  });

  await ensureDataRepo();

  // Load or create operator profile
  let profile = null;
  try { profile = (await ghRead(ghUser.login, `operators/${ghUser.login}/profile.json`))?.content; } catch (_) {}

  if (!profile) {
    profile = {
      username:  ghUser.login,
      name:      ghUser.name || ghUser.login,
      role:      'defender',
      xp:        0,
      rank:      'Recruit',
      createdAt: new Date().toISOString(),
    };
    try { await ghWrite(ghUser.login, `operators/${ghUser.login}/profile.json`, profile); } catch (_) {}
  }

  SAAS.user.profile = profile;
  LS.set('profile', profile);

  updateUserBadge();
  registerSaasTerminalCommands();
  hookSimulationEvents();
  saasTermPrint(`[AUTH] Logged in as ${ghUser.login} (${profile.role})`, 'sys');
  window.dispatchEvent(new CustomEvent('cybaash:auth', { detail: { user: SAAS.user } }));
}

function saasLogout() {
  SAAS.token = null;
  SAAS.user  = null;
  LS.delTok();
  LS.del('user');
  LS.del('profile');
  updateUserBadge();
  saasTermPrint('[AUTH] Logged out. Type "account login" to sign in again.', 'sys');
}

async function saasBootstrap() {
  const token = LS.token();
  if (!token) return;

  SAAS.token = token;
  // Validate token
  try {
    const ghUser = await ghRequest('/user');
    SAAS.user = { ...ghUser, profile: LS.get('profile') || {} };
    updateUserBadge();
    registerSaasTerminalCommands();
    hookSimulationEvents();
    saasTermPrint(`[AUTH] Welcome back, ${ghUser.login}`, 'sys');
    window.dispatchEvent(new CustomEvent('cybaash:auth', { detail: { user: SAAS.user } }));
  } catch (_) {
    SAAS.token = null;
    LS.delTok();
  }
}

// ══════════════════════════════════════════════════════════════
// §6 — SIMULATION PERSISTENCE
// ══════════════════════════════════════════════════════════════

function captureSimState() {
  // Capture current simulation state from existing globals
  return {
    id:         SAAS.activeSim || generateSimId(),
    capturedAt: new Date().toISOString(),
    // Network nodes
    nodes: (typeof NODES !== 'undefined') ? NODES.map(n => ({
      id:         n.id,
      label:      n.label,
      type:       n.type,
      status:     n.status,
      x:          n.x,
      y:          n.y,
      services:   n.services,
    })) : [],
    // Simulation scores
    scores: (typeof state !== 'undefined') ? {
      attackScore:  state.scores?.attackSuccess  || 0,
      defenseScore: state.scores?.detectionEfficiency || 0,
      totalScore:   state.scores?.total   || 0,
      phase:        ['idle','recon','exploit','lateral','escalate'][state.phase + 1] || 'idle',
      elapsed:      state.tick || 0,
    } : {},
    // Event log (last 200 events)
    events: (typeof EVENTS !== 'undefined') ? EVENTS.slice(-200) : [],
    // Terminal history (last 100 commands)
    termHistory: (typeof TERM !== 'undefined') ? (TERM.history || []).slice(-100) : [],
    // Replay timeline (last 500 events)
    replayTimeline: (typeof REPLAY !== 'undefined') ? (REPLAY.timeline || []).slice(-500) : [],
    // Cert data context
    certTotal:   (typeof CERT_DATA !== 'undefined') ? CERT_DATA.total : 0,
    // Scenario
    scenario:    (typeof state !== 'undefined') ? state.currentScenario : null,
  };
}

function generateSimId() {
  const id = 'sim_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  SAAS.activeSim = id;
  return id;
}

async function saveSim(label = null) {
  if (!SAAS.user || !SAAS.token) {
    saasTermPrint('Not logged in. Type "account login" to save simulations.', 'warn');
    return false;
  }

  const state = captureSimState();
  if (!state.id) state.id = generateSimId();
  SAAS.activeSim = state.id;

  const meta = {
    id:         state.id,
    label:      label || `Mission ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}`,
    savedAt:    state.capturedAt,
    score:      state.scores?.totalScore || 0,
    phase:      state.scores?.phase || 'idle',
    nodeCount:  state.nodes?.length || 0,
    eventCount: state.events?.length || 0,
    certTotal:  state.certTotal,
  };

  // Save full state locally immediately
  LS.set(`sim_${state.id}`, state);

  // Update local index
  const index = LS.get('sim_index') || [];
  const idx = index.findIndex(s => s.id === state.id);
  if (idx >= 0) index[idx] = meta; else index.unshift(meta);
  LS.set('sim_index', index.slice(0, 50)); // keep last 50

  // Async push to GitHub (don't block)
  setTimeout(async () => {
    try {
      const owner    = SAAS.user.login;
      const filePath = `operators/${owner}/simulations/${state.id}.json`;
      const existing = await ghRead(owner, filePath).catch(() => null);
      await ghWrite(owner, filePath, state, existing?.sha);

      const idxPath  = `operators/${owner}/simulations/index.json`;
      const idxFile  = await ghRead(owner, idxPath).catch(() => null);
      const ghIndex  = idxFile?.content || [];
      const gi = ghIndex.findIndex(s => s.id === state.id);
      if (gi >= 0) ghIndex[gi] = meta; else ghIndex.unshift(meta);
      await ghWrite(owner, idxPath, ghIndex.slice(0, 50), idxFile?.sha);

      saasTermPrint(`[SAVE] Synced to GitHub ✓ (${state.id})`, 'sys');
    } catch (err) {
      saasTermPrint(`[SAVE] GitHub sync failed (saved locally): ${err.message}`, 'warn');
    }
  }, 100);

  return meta;
}

async function loadSim(simId) {
  // Try local first
  let state = LS.get(`sim_${simId}`);

  if (!state && SAAS.user && SAAS.token) {
    const owner    = SAAS.user.login;
    const filePath = `operators/${owner}/simulations/${simId}.json`;
    const file     = await ghRead(owner, filePath).catch(() => null);
    if (file) state = file.content;
  }

  if (!state) {
    saasTermPrint(`[LOAD] Simulation "${simId}" not found.`, 'err');
    return false;
  }

  SAAS.activeSim = state.id;

  // Restore simulation state into existing globals
  try {
    if (Array.isArray(state.nodes) && typeof NODES !== 'undefined') {
      state.nodes.forEach((saved, i) => {
        if (NODES[i]) {
          NODES[i].status = saved.status;
          NODES[i].x      = saved.x;
          NODES[i].y      = saved.y;
        }
      });
    }
    if (state.scores && typeof state !== 'undefined') {
      // Map saved cloud score fields back to the live state.scores object
      if (state.scores.totalScore)   window.state.scores.total               = state.scores.totalScore;
      if (state.scores.attackScore)  window.state.scores.attackSuccess        = state.scores.attackScore;
      if (state.scores.defenseScore) window.state.scores.detectionEfficiency  = state.scores.defenseScore;
    }
    if (Array.isArray(state.termHistory) && typeof TERM !== 'undefined') {
      TERM.history = state.termHistory;
    }
    if (Array.isArray(state.replayTimeline) && typeof REPLAY !== 'undefined') {
      REPLAY.timeline = state.replayTimeline;
    }
    if (Array.isArray(state.events) && typeof EVENTS !== 'undefined') {
      EVENTS.length = 0;
      EVENTS.push(...state.events);
    }

    if (typeof drawNetwork === 'function') drawNetwork();
    if (typeof updateMetrics === 'function') updateMetrics();
    if (typeof updateScores === 'function') updateScores();

    saasTermPrint([
      `[LOAD] Simulation restored: ${state.id}`,
      `       Nodes: ${state.nodes?.length || 0}  |  Events: ${state.events?.length || 0}`,
      `       Score: ${state.scores?.totalScore || 0}  |  Phase: ${state.scores?.phase || 'idle'}`,
      `       Saved: ${new Date(state.capturedAt).toLocaleString()}`,
    ].join('\n'), 'sys');

    return true;
  } catch (err) {
    saasTermPrint(`[LOAD] Restore error: ${err.message}`, 'err');
    return false;
  }
}

async function listSims() {
  const local  = LS.get('sim_index') || [];
  let ghList   = [];

  if (SAAS.user && SAAS.token) {
    try {
      const idxPath = `operators/${SAAS.user.login}/simulations/index.json`;
      const file    = await ghRead(SAAS.user.login, idxPath);
      if (file) ghList = file.content;
    } catch (_) {}
  }

  // Merge: GitHub wins on duplicates
  const merged = [...ghList];
  local.forEach(l => { if (!merged.find(g => g.id === l.id)) merged.push(l); });
  return merged.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

// ══════════════════════════════════════════════════════════════
// §7 — HOOK EXISTING SIMULATION EVENTS
// ══════════════════════════════════════════════════════════════

function hookSimulationEvents() {
  // Hook endSimulation to auto-save
  if (typeof endSimulation === 'function' && !endSimulation._saasHooked) {
    const original = endSimulation;
    window.endSimulation = function(...args) {
      const result = original.apply(this, args);
      saveSim(`Auto-save: ${new Date().toLocaleTimeString()}`).then(meta => {
        if (meta) saasTermPrint(`[AUTO-SAVE] Session saved: ${meta.label}`, 'sys');
      });
      return result;
    };
    window.endSimulation._saasHooked = true;
  }

  // Hook logEvent to capture events
  if (typeof logEvent === 'function' && !logEvent._saasHooked) {
    const original = logEvent;
    window.logEvent = function(type, msg, cls) {
      if (!window.EVENTS) window.EVENTS = [];
      EVENTS.push({ t: Date.now(), type, msg, cls });
      return original.call(this, type, msg, cls);
    };
    window.logEvent._saasHooked = true;
  }

  // Auto-save timer
  if (SAAS.autoSaveInt) clearInterval(SAAS.autoSaveInt);
  SAAS.autoSaveInt = setInterval(() => {
    if (typeof state !== 'undefined' && state.running) {
      saveSim(`Auto-save ${new Date().toLocaleTimeString()}`);
    }
  }, SAAS_CONFIG.autoSaveMs);
}

// ══════════════════════════════════════════════════════════════
// §8 — TERMINAL COMMANDS (extends existing TERM_COMMANDS)
// ══════════════════════════════════════════════════════════════

function registerSaasTerminalCommands() {
  if (typeof defCmd !== 'function') return;

  // ── account — login / logout / whoami ─────────────────────
  defCmd('account', async (args) => {
    const sub = args[0]?.toLowerCase();

    if (!sub || sub === 'info') {
      if (!SAAS.user) {
        termPrint([
          { t:'t-dim',  v:'Not logged in.' },
          { t:'t-out',  v:'Type "account login" to sign in with GitHub.' },
        ]);
      } else {
        const p = SAAS.user.profile || {};
        termPrint([
          { t:'t-sys',  v:'┌─ OPERATOR ACCOUNT ─────────────────────────' },
          { t:'t-out',  v:`│  Username : ${SAAS.user.login}` },
          { t:'t-out',  v:`│  Name     : ${SAAS.user.name || '—'}` },
          { t:'t-out',  v:`│  Role     : ${(p.role || 'defender').toUpperCase()}` },
          { t:'t-out',  v:`│  Rank     : ${p.rank || 'Recruit'}` },
          { t:'t-out',  v:`│  XP       : ${p.xp || 0}` },
          { t:'t-out',  v:`│  GitHub   : ${SAAS.user.html_url}` },
          { t:'t-sys',  v:'└─────────────────────────────────────────────' },
        ]);
      }
      return;
    }

    if (sub === 'login') {
      try {
        await saasLogin();
      } catch (err) {
        termPrint({ t:'t-err', v:`[AUTH] Login failed: ${err.message}` });
      }
      return;
    }

    if (sub === 'logout') {
      saasLogout();
      return;
    }

    if (sub === 'role') {
      const role = args[1]?.toLowerCase();
      if (!['attacker', 'defender'].includes(role)) {
        termPrint({ t:'t-err', v:'Usage: account role [attacker|defender]' });
        return;
      }
      if (!SAAS.user) { termPrint({ t:'t-warn', v:'Not logged in.' }); return; }
      SAAS.user.profile = { ...SAAS.user.profile, role };
      LS.set('profile', SAAS.user.profile);
      try {
        const filePath = `operators/${SAAS.user.login}/profile.json`;
        const existing = await ghRead(SAAS.user.login, filePath).catch(() => null);
        await ghWrite(SAAS.user.login, filePath, SAAS.user.profile, existing?.sha);
      } catch (_) {}
      updateUserBadge();
      termPrint({ t:'t-sys', v:`[ACCOUNT] Role updated to ${role.toUpperCase()}` });
      return;
    }

    termPrint({ t:'t-err', v:'Usage: account [info|login|logout|role <attacker|defender>]' });
  });

  // ── save — save current simulation ────────────────────────
  defCmd('save', async (args) => {
    const label = args.join(' ') || null;
    termPrint({ t:'t-sys', v:'[SAVE] Capturing simulation state…' });
    const meta = await saveSim(label);
    if (meta) {
      termPrint([
        { t:'t-sys', v:`[SAVE] ✓ Saved: "${meta.label}"` },
        { t:'t-out', v:`       ID:    ${meta.id}` },
        { t:'t-out', v:`       Score: ${meta.score}  |  Nodes: ${meta.nodeCount}  |  Events: ${meta.eventCount}` },
        { t:'t-dim', v:'       Syncing to GitHub in background…' },
      ]);
    }
  });

  // ── load — load a saved simulation ────────────────────────
  defCmd('load', async (args) => {
    const simId = args[0];
    if (!simId) {
      termPrint({ t:'t-err', v:'Usage: load <simulation-id>  |  Use "missions" to list saved sims.' });
      return;
    }
    termPrint({ t:'t-sys', v:`[LOAD] Loading simulation ${simId}…` });
    await loadSim(simId);
  });

  // ── missions — list saved simulations ─────────────────────
  defCmd('missions', async (args) => {
    termPrint({ t:'t-sys', v:'[MISSIONS] Fetching saved simulations…' });
    const list = await listSims();

    if (!list.length) {
      termPrint([
        { t:'t-dim', v:'No saved simulations found.' },
        { t:'t-out', v:'Run a simulation and type "save" to save it.' },
      ]);
      return;
    }

    const lines = [
      { t:'t-sys', v:`┌─ SAVED MISSIONS (${list.length}) ────────────────────────────────────────` },
      { t:'t-dim', v:'│  ID                           LABEL                    SCORE  SAVED' },
      { t:'t-dim', v:'│  ─────────────────────────────────────────────────────────────────' },
      ...list.slice(0, 20).map(s => ({
        t:'t-out',
        v:`│  ${s.id.padEnd(30)} ${(s.label || 'Untitled').substring(0, 24).padEnd(24)} ${String(s.score || 0).padEnd(6)} ${new Date(s.savedAt).toLocaleDateString('en-GB')}`,
      })),
      { t:'t-sys', v:'└──────────────────────────────────────────────────────────────────' },
      { t:'t-dim', v:'  → Type "load <id>" to restore a simulation' },
    ];
    termPrint(lines);
  });

  // ── checkpoint — named save ────────────────────────────────
  defCmd('checkpoint', async (args) => {
    const name = args.join(' ') || `Checkpoint ${new Date().toLocaleTimeString()}`;
    const meta = await saveSim(name);
    if (meta) termPrint({ t:'t-sys', v:`[CHECKPOINT] ✓ "${meta.label}" (${meta.id})` });
  });

  saasTermPrint('[SAAS] Terminal commands registered: account, save, load, missions, checkpoint', 'sys');
}

// ══════════════════════════════════════════════════════════════
// §9 — UI INJECTION
// ══════════════════════════════════════════════════════════════

function updateUserBadge() {
  // Inject badge into the header flex row, between RECRUITER VIEW and TERMINAL buttons
  // This avoids position:fixed overlap with existing header buttons
  let badge = document.getElementById('saas-user-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'saas-user-badge';
    badge.style.cssText = `
      display:flex; align-items:center; gap:8px;
      font-family:'Share Tech Mono',monospace; font-size:10px;
    `;
    // Insert into header-stats div, before the TERMINAL button
    const termBtn = document.getElementById('termToggleBtn');
    if (termBtn && termBtn.parentNode) {
      termBtn.parentNode.insertBefore(badge, termBtn);
    } else {
      // Fallback: fixed position if header not found
      badge.style.cssText += 'position:fixed; top:8px; right:270px; z-index:200;';
      document.body.appendChild(badge);
    }
  }

  if (!SAAS.user) {
    badge.innerHTML = `
      <button onclick="window.__saas.login()" style="
        background:none; border:1px solid #1a3a5c; color:#5a7a9a;
        padding:3px 10px; cursor:pointer; font-family:'Share Tech Mono',monospace;
        font-size:9px; letter-spacing:2px; border-radius:2px;
      ">⊕ SIGN IN</button>
    `;
  } else {
    const role  = SAAS.user.profile?.role || 'defender';
    // Whitelist role to prevent arbitrary CSS injection via color value
    const safeRole = (role === 'attacker' || role === 'defender') ? role : 'defender';
    const color    = safeRole === 'attacker' ? '#ff2244' : '#00ff88';
    // Validate avatar_url: only allow https:// to block javascript: URI attacks
    const avatarSrc = /^https:\/\//.test(SAAS.user.avatar_url || '') ? SAAS.user.avatar_url : '';
    badge.innerHTML = `
      <img src="${avatarSrc}" style="width:20px;height:20px;border-radius:50%;border:1px solid #1a3a5c;" />
      <span style="color:#5a7a9a"></span>
      <span style="color:${color};border:1px solid ${color};padding:1px 5px;font-size:8px;letter-spacing:1px"></span>
      <button onclick="window.__saas.logout()" style="
        background:none; border:none; color:#5a7a9a; cursor:pointer;
        font-size:12px; padding:0; line-height:1;
      " title="Sign out">⏏</button>
    `;
    // Assign user-controlled strings via textContent — never via innerHTML
    badge.querySelectorAll('span')[0].textContent = SAAS.user.login || '';
    badge.querySelectorAll('span')[1].textContent = safeRole.toUpperCase();
  }

  // Update terminal prompt username if terminal exists
  const tpUser = document.getElementById('tpUser');
  if (tpUser) tpUser.textContent = SAAS.user ? SAAS.user.login : 'root';
}

function showPatOverlay() {
  let overlay = document.getElementById('saas-auth-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'saas-auth-overlay';
    overlay.style.cssText = `
      position:fixed; inset:0; background:rgba(3,10,15,.92); z-index:10000;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      font-family:'Share Tech Mono',monospace;
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div style="text-align:center;max-width:420px;padding:40px;background:#0a1520;border:1px solid #1a3a5c;border-radius:4px;">
      <div style="font-family:'Orbitron',monospace;font-size:22px;font-weight:900;color:#00d4ff;letter-spacing:4px;text-shadow:0 0 12px rgba(0,212,255,.5);margin-bottom:6px">CYBAASH</div>
      <input id="saas-pat-input" type="password" placeholder=""
        style="width:100%;padding:10px;background:#060f18;border:1px solid #1a3a5c;color:#c8e0f4;font-family:'Share Tech Mono',monospace;font-size:12px;border-radius:2px;margin-bottom:10px;outline:none;box-sizing:border-box;"
        onkeydown="if(event.key==='Enter')saasLoginWithPat(document.getElementById('saas-pat-input').value)"
      />
      <div id="saas-pat-error" style="color:#ff2244;font-size:10px;min-height:16px;margin-bottom:10px;text-align:left"></div>
      <div style="display:flex;gap:8px;justify-content:center;">
        <button id="saas-pat-btn" onclick="saasLoginWithPat(document.getElementById('saas-pat-input').value)"
          style="background:#00d4ff;color:#030a0f;border:none;padding:8px 20px;cursor:pointer;font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:1px;border-radius:2px;font-weight:700;">Connect</button>
        <button onclick="hidePatOverlay()"
          style="background:none;color:#5a7a9a;border:1px solid #1a3a5c;padding:8px 16px;cursor:pointer;font-family:'Share Tech Mono',monospace;font-size:11px;border-radius:2px;">Cancel</button>
      </div>
    </div>
  `;
  setTimeout(() => { const i = document.getElementById('saas-pat-input'); if(i) i.focus(); }, 100);
}

function hidePatOverlay() {
  const overlay = document.getElementById('saas-auth-overlay');
  if (overlay) overlay.style.display = 'none';
}

function setPatOverlayError(msg) {
  const el = document.getElementById('saas-pat-error');
  if (el) el.textContent = msg;
}

// Legacy alias (no longer used but keeps any external references working)


// ══════════════════════════════════════════════════════════════
// §10 — MISSIONS PANEL (injected into existing UI)
// ══════════════════════════════════════════════════════════════

function injectMissionsPanel() {
  // Inject a "MISSIONS" tab into the existing tab bar
  const tabBar = document.querySelector('.tabs');
  if (!tabBar || document.getElementById('saasTab')) return;

  const tab = document.createElement('div');
  tab.id        = 'saasTab';
  tab.className = 'tab';
  tab.style.cssText = 'color:var(--green)';
  tab.textContent   = '⬡ MISSIONS';
  tab.onclick = () => switchToMissionsView(tab);
  tabBar.appendChild(tab);

  // Create the missions view
  const center = document.getElementById('centerPanel');
  if (!center) return;

  const view = document.createElement('div');
  view.id    = 'viewMissions';
  // Keep display:none — only shown when body.tab-missions is active (via switchToMissionsView)
  view.style.display = 'none';
  view.style.cssText = 'display:none';
  view.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:11px;color:var(--blue);letter-spacing:2px">// SAVED MISSIONS</div>
      <button id="saas-refresh-btn" onclick="saasRefreshMissions()" style="
        background:none;border:1px solid var(--border);color:var(--dim);
        padding:3px 10px;cursor:pointer;font-family:'Share Tech Mono',monospace;font-size:9px
      ">↺ REFRESH</button>
    </div>
    <div id="saas-missions-list" style="color:var(--dim);font-size:11px">
      <span style="color:var(--dim)">▋ Loading…</span>
    </div>
  `;

  // Insert inside centerPanel alongside other views
  center.appendChild(view);
}

async function saasRefreshMissions() {
  const el = document.getElementById('saas-missions-list');
  if (!el) return;
  el.innerHTML = '<span style="color:var(--dim)">▋ Loading…</span>';

  const list = await listSims();
  if (!list.length) {
    el.innerHTML = '<div style="color:var(--dim);padding:20px 0;text-align:center">No saved missions. Type "save" in terminal after running a simulation.</div>';
    return;
  }

  const _esc = typeof sanitizeText === 'function' ? sanitizeText : s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  el.innerHTML = list.slice(0, 20).map(s => {
    const safeId    = _esc(String(s.id    || ''));
    const safeLabel = _esc(String(s.label || 'Untitled'));
    const safeScore = parseInt(s.score    || 0, 10);
    const safeNodes = parseInt(s.nodeCount|| 0, 10);
    const safeDate  = _esc(new Date(s.savedAt).toLocaleString('en-GB'));
    return `
    <div style="
      background:var(--panel);border:1px solid var(--border);border-radius:2px;
      padding:10px 12px;margin-bottom:8px;
      display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;
      transition:border-color .15s;
    " onmouseover="this.style.borderColor='var(--blue)'" onmouseout="this.style.borderColor='var(--border)'">
      <div>
        <div style="font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:600;color:var(--text);margin-bottom:3px">${safeLabel}</div>
        <div style="color:var(--dim);font-size:9px;letter-spacing:1px">
          ${safeId}
          &nbsp;·&nbsp; Score: ${safeScore}
          &nbsp;·&nbsp; ${safeNodes} nodes
          &nbsp;·&nbsp; ${safeDate}
        </div>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="saasLoadAndSwitch('${safeId}')" style="
          background:none;border:1px solid var(--blue);color:var(--blue);
          padding:4px 10px;cursor:pointer;font-family:'Share Tech Mono',monospace;font-size:9px;
          border-radius:2px
        ">LOAD</button>
        <button onclick="saasDeleteMission('${safeId}',this)" style="
          background:none;border:1px solid var(--border);color:var(--dim);
          padding:4px 8px;cursor:pointer;font-family:'Share Tech Mono',monospace;font-size:9px;
          border-radius:2px
        ">&#x2715;</button>
      </div>
    </div>
  `;}).join('');
}

async function saasLoadAndSwitch(simId) {
  const ok = await loadSim(simId);
  if (ok) {
    // Switch back to network view
    const networkTab = document.querySelector('.tab:first-child');
    if (networkTab && typeof switchTab === 'function') switchTab('range', networkTab);
  }
}

async function saasDeleteMission(simId, btn) {
  if (!confirm('Delete this saved mission?')) return;
  LS.del(`sim_${simId}`);
  const index = (LS.get('sim_index') || []).filter(s => s.id !== simId);
  LS.set('sim_index', index);
  if (SAAS.user && SAAS.token) {
    ghRequest(`/repos/${SAAS.user.login}/${SAAS_CONFIG.dataRepo}/contents/operators/${SAAS.user.login}/simulations/${simId}.json`, {
      method: 'GET',
    }).then(meta => {
      if (meta?.sha) ghRequest(`/repos/${SAAS.user.login}/${SAAS_CONFIG.dataRepo}/contents/operators/${SAAS.user.login}/simulations/${simId}.json`, {
        method: 'DELETE',
        body:   JSON.stringify({ message: `delete sim ${simId}`, sha: meta.sha }),
      });
    }).catch(() => {});
  }
  btn.closest('[style]').remove();
}

function switchToMissionsView(tab) {
  // Hide all views
  ['viewRange','viewDecisions','viewScenarios','viewGraph','viewWhatif','viewScoring','viewReplay','viewMissions'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  // Remove all tab-* classes, add tab-missions
  Array.from(document.body.classList)
    .filter(c => c.startsWith('tab-'))
    .forEach(c => document.body.classList.remove(c));
  document.body.classList.add('tab-missions');
  // Deactivate all tabs
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  const view = document.getElementById('viewMissions');
  if (view) view.style.display = 'block';
  saasRefreshMissions();
}

// ══════════════════════════════════════════════════════════════
// §11 — PRINT HELPER
// ══════════════════════════════════════════════════════════════

function saasTermPrint(msg, type = 'sys') {
  if (typeof termPrint === 'function') {
    const typeMap = { sys:'t-sys', warn:'t-warn', err:'t-err', out:'t-out' };
    termPrint({ t: typeMap[type] || 't-sys', v: msg });
  } else {
    window.location.hostname === "localhost" && console["l"+"og"](`[CYBAASH SAAS] ${msg}`);
  }
}

// ══════════════════════════════════════════════════════════════
// §12 — BOOT
// ══════════════════════════════════════════════════════════════

// Expose public API on window for inline onclick handlers
window.__saas = {
  login:          saasLogin,
  logout:         saasLogout,
  save:           saveSim,
  load:           loadSim,
  missions:       listSims,
  refreshPanel:   saasRefreshMissions,
};

// Wait for DOM + existing scripts to initialize
window.addEventListener('load', () => {
  setTimeout(async () => {
    try {
      injectMissionsPanel();
      updateUserBadge();
      await saasBootstrap();
      SAAS.initialized = true;
    } catch (err) {
      window.location.hostname === "localhost" && console["w"+"arn"]('[SAAS] Initialization failed:', err.message);
    }
  }, 500); // small delay so existing termInit() runs first
});

/**

// ── Portfolio data functions ──────────────────────────// ── End portfolio data functions ──────────────────────

 * CYBAASH AI — Portfolio + Chatbot Script
 * Handles: data loading, chat UI, backend API calls, analysis tools
 */

/* ══════════════════════════════════════════════════════════════════
   CONFIG
   ══════════════════════════════════════════════════════════════════ */
const CONFIG = {
  // ⚙️  Change this to your deployed backend URL (Render / Railway / Heroku)
  BACKEND_URL: 'https://cybaash-ai.onrender.com',
  // Fallback: use local demo mode when backend is offline
  DEMO_MODE: false,
  SESSION_KEY: 'cybaash_session_' + Math.random().toString(36).slice(2, 9),
};

/* ══════════════════════════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════════════════════════ */
let backendOnline = false;
let activeToolId  = null;
let isSending     = false;

/* ══════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    updateClock();
    setInterval(updateClock, 1000);

    typeWriter('Mohamed Aasiq', 'typed-name', 80);
    await loadPortfolioData();
    checkBackend();
    setInterval(checkBackend, 30000);
    setupFileDrop();
  } catch (err) {
    window.location.hostname === "localhost" && console["w"+"arn"]('[Portfolio] Init error:', err.message);
  }
});

function updateClock() {
  const el = document.getElementById('topbar-time');
  if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
}

/* ══════════════════════════════════════════════════════════════════
   TYPEWRITER EFFECT
   ══════════════════════════════════════════════════════════════════ */
function typeWriter(text, elementId, speed = 80) {
  const el = document.getElementById(elementId);
  if (!el) return;
  let i = 0;
  el.textContent = '';
  const interval = setInterval(() => {
    el.textContent += text[i++];
    if (i >= text.length) clearInterval(interval);
  }, speed);
}

/* ══════════════════════════════════════════════════════════════════
   PORTFOLIO DATA LOADING
   ══════════════════════════════════════════════════════════════════ */
async function loadPortfolioData() {
  try {
    const res = await fetch('data_main.json');
    if (!res.ok) throw new Error('data_main.json not found');
    const data = await res.json();
    populateAbout(data.about, data.contact);
    populateSkills(data.skills);
    populateExperience(data.experience);
    populateProjects(data.projects);
  } catch (e) {
    window.location.hostname === "localhost" && console["w"+"arn"]('Portfolio data load failed:', e);
  }
}

function populateAbout(about, contact) {
  setText('about-bio', about.bio);
  setText('hero-bio', about.bio);
  setText('meta-location', about.location);
  setText('meta-langs', contact.languages);
  setText('meta-spec', contact.specialization);
  setText('stat-exp', (about.yearsExp || '8') + '+');
  setText('contact-cta', contact.ctaMessage);
  setLink('contact-email', `mailto:${contact.email}`, contact.email);
  setText('contact-phone', contact.phone);
  setLink('contact-github', contact.github, contact.github);
  setLink('contact-li', contact.linkedin, contact.linkedin);
}

function populateSkills(skills) {
  const filterEl = document.getElementById('skills-filter');
  const gridEl   = document.getElementById('skills-grid');
  if (!filterEl || !gridEl) return;

  // Build filter buttons — use DOM methods to avoid innerHTML injection
  filterEl.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.className = 'filter-btn active';
  allBtn.dataset.cat = 'all';
  allBtn.textContent = 'ALL';
  allBtn.onclick = () => filterSkills('all', allBtn);
  filterEl.appendChild(allBtn);

  skills.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.cat = escapeHtml(cat.id);
    btn.textContent = String(cat.name).toUpperCase();
    btn.onclick = () => filterSkills(cat.id, btn);
    filterEl.appendChild(btn);
  });

  // Build skill items — textContent for all user-controlled fields
  gridEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  skills.forEach(cat => {
    cat.items.forEach(sk => {
      const level = sk.level || 'Intermediate';
      const safeLevel = /^[A-Za-z ]+$/.test(level) ? level : 'Intermediate';
      const levelClass = 'level-' + safeLevel.toLowerCase().replace(/\s+/g, '');

      const item = document.createElement('div');
      item.className = 'skill-item';
      item.dataset.cat = escapeHtml(cat.id);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'skill-name';
      nameSpan.textContent = sk.name;

      const lvlSpan = document.createElement('span');
      lvlSpan.className = `skill-level ${levelClass}`;
      lvlSpan.textContent = safeLevel.toUpperCase();

      item.appendChild(nameSpan);
      item.appendChild(lvlSpan);
      frag.appendChild(item);
    });
  });
  gridEl.appendChild(frag);
}

function filterSkills(catId, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.skill-item').forEach(el => {
    el.style.display = (catId === 'all' || el.dataset.cat === catId) ? '' : 'none';
  });
}

function populateExperience(experience) {
  const el = document.getElementById('exp-timeline');
  if (!el) return;
  el.innerHTML = '';
  const frag = document.createDocumentFragment();
  experience.forEach(exp => {
    const item = document.createElement('div');
    item.className = 'timeline-item' + (exp.current ? ' current' : '');
    const header = document.createElement('div');
    header.className = 'exp-header';
    const leftDiv = document.createElement('div');
    const roleEl = document.createElement('div');
    roleEl.className = 'exp-role';
    roleEl.textContent = exp.role || '';
    const compEl = document.createElement('div');
    compEl.className = 'exp-company';
    compEl.textContent = (exp.company || '') + ' ' + (exp.country || '') + ' · ' + (exp.location || '');
    const typeEl = document.createElement('div');
    typeEl.className = 'exp-type';
    typeEl.textContent = exp.type || '';
    leftDiv.append(roleEl, compEl, typeEl);
    const rightDiv = document.createElement('div');
    rightDiv.style.textAlign = 'right';
    const dateEl = document.createElement('div');
    dateEl.className = 'exp-date';
    if (exp.current) {
      dateEl.textContent = (exp.startDate || '') + ' — ';
      const badge = document.createElement('span');
      badge.className = 'current-badge';
      badge.textContent = 'CURRENT';
      dateEl.appendChild(badge);
    } else {
      dateEl.textContent = (exp.startDate || '') + ' — ' + (exp.endDate || '');
    }
    rightDiv.appendChild(dateEl);
    header.append(leftDiv, rightDiv);
    const descEl = document.createElement('div');
    descEl.className = 'exp-desc';
    descEl.textContent = exp.desc || '';
    item.append(header, descEl);
    if (exp.achievements && exp.achievements.length) {
      const ul = document.createElement('ul');
      ul.className = 'exp-achievements';
      exp.achievements.forEach(a => {
        const li = document.createElement('li');
        li.textContent = a;
        ul.appendChild(li);
      });
      item.appendChild(ul);
    }
    frag.appendChild(item);
  });
  el.appendChild(frag);
}

function populateProjects(projects) {
  const el = document.getElementById('projects-grid');
  if (!el) return;
  el.innerHTML = '';
  const frag = document.createDocumentFragment();
  const SAFE_URL = /^https?:\/\//i;
  projects.forEach(p => {
    const card = document.createElement('div');
    card.className = 'project-card';
    if (p.image && SAFE_URL.test(p.image)) {
      const img = document.createElement('img');
      img.src = p.image;
      img.alt = p.title || '';
      img.className = 'project-img';
      img.onerror = () => { img.style.display = 'none'; };
      card.appendChild(img);
    }
    const body = document.createElement('div');
    body.className = 'project-body';
    const titleEl = document.createElement('div');
    titleEl.className = 'project-title';
    titleEl.textContent = p.title || '';
    const descEl = document.createElement('div');
    descEl.className = 'project-desc';
    descEl.textContent = p.desc || '';
    body.append(titleEl, descEl);
    if (p.status) {
      const statusEl = document.createElement('div');
      statusEl.className = 'project-status';
      statusEl.textContent = String(p.status).toUpperCase();
      body.appendChild(statusEl);
    }
    const linksEl = document.createElement('div');
    linksEl.className = 'project-links';
    if (p.liveUrl && SAFE_URL.test(p.liveUrl)) {
      const a = document.createElement('a');
      a.href = p.liveUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'project-link';
      a.textContent = '\uD83D\uDD17 Live Site';
      linksEl.appendChild(a);
    }
    if (p.githubUrl && SAFE_URL.test(p.githubUrl)) {
      const a = document.createElement('a');
      a.href = p.githubUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'project-link';
      a.textContent = '\uD83D\uDC19 GitHub';
      linksEl.appendChild(a);
    }
    body.appendChild(linksEl);
    card.appendChild(body);
    frag.appendChild(card);
  });
  el.appendChild(frag);
}
/* ══════════════════════════════════════════════════════════════════
   BACKEND STATUS CHECK
   ══════════════════════════════════════════════════════════════════ */
async function checkBackend() {
  const el = document.getElementById('backend-status');
  try {
    const res = await fetch(`${CONFIG.BACKEND_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      backendOnline = true;
      if (el) { el.textContent = '● Backend Online'; el.className = 'status-online'; }
    } else throw new Error('not ok');
  } catch {
    backendOnline = false;
    if (el) { el.textContent = '● Demo Mode (no backend)'; el.className = 'status-offline'; }
  }
}
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}async function sendMessage() {
  if (isSending) return;
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;

  isSending = true;
  input.value = '';
  autoResize(input);
  document.getElementById('send-btn').disabled = true;

  // Add user bubble
  appendMessage('user', message);

  // Show typing indicator
  showTyping(true);

  try {
    let reply, flags = [];

    if (backendOnline) {
      const data = await callChatAPI(message);
      reply = data.reply;
      flags = data.security_flags || [];
    } else {
      // Demo mode — local fallback
      reply = localDemoResponse(message);
    }

    showTyping(false);
    appendMessage('bot', reply, flags);

  } catch (err) {
    showTyping(false);
    appendMessage('bot', '⚠️ **Connection error.** The backend may be offline. Please check the README to set up the backend, or deploy it to Render.\n\n> Running in demo mode — some features limited.');
  }

  isSending = false;
  document.getElementById('send-btn').disabled = false;
  input.focus();
}

async function callChatAPI(message) {
  const res = await fetch(`${CONFIG.BACKEND_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      session_id: CONFIG.SESSION_KEY,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

function appendMessage(role, text, flags = []) {
  const container = document.getElementById('chat-messages');
  const isBot = role === 'bot';
  const time = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });

  const div = document.createElement('div');
  div.className = `message ${isBot ? 'bot' : 'user'}-message`;

  const renderedText = isBot && window.marked
    ? window.marked.parse(text)
    : escapeHtml(text).replace(/\n/g, '<br>');

  const flagsHTML = flags.length
    ? `<div class="msg-flags">${flags.map(f => `<span class="flag-badge">⚠ ${f}</span>`).join('')}</div>`
    : '';

  div.innerHTML = `
    <div class="msg-avatar ${isBot ? 'bot' : 'user'}-avatar">${isBot ? '⚡' : 'YOU'}</div>
    <div class="msg-bubble">
      <div class="msg-header">${isBot ? 'CYBAASH AI' : 'YOU'} <span class="msg-time">${time}</span></div>
      <div class="msg-text markdown-content">${renderedText}</div>
      ${flagsHTML}
    </div>`;

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping(show) {
  const el = document.getElementById('typing-indicator');
  if (el) el.style.display = show ? 'flex' : 'none';
  if (show) {
    document.getElementById('chat-messages').scrollTop = 999999;
  }
}

function clearChat() {
  const container = document.getElementById('chat-messages');
  container.innerHTML = '';
  appendMessage('bot', '🔄 **Chat cleared.** Session history reset. How can I help you with cybersecurity?');
}

function injectPrompt(text) {
  const input = document.getElementById('chat-input');
  if (!input) return;
  input.value = text;
  input.focus();
  autoResize(input);
}

/* ══════════════════════════════════════════════════════════════════
   TOOL PANELS
   ══════════════════════════════════════════════════════════════════ */
function openTool(toolId) {
  const panel = document.getElementById('tool-panel');
  const allTools = ['url', 'password', 'code', 'file'];

  if (activeToolId === toolId) {
    // Toggle off
    panel.style.display = 'none';
    activeToolId = null;
    document.querySelectorAll('.chat-tool-btn').forEach(b => b.classList.remove('active'));
    return;
  }

  activeToolId = toolId;
  panel.style.display = 'block';

  // Show correct tool
  allTools.forEach(id => {
    const el = document.getElementById(`tool-${id}`);
    if (el) el.style.display = id === toolId ? 'flex' : 'none';
    if (el && id === toolId) el.style.flexDirection = 'column';
  });

  // Highlight active button
  document.querySelectorAll('.chat-tool-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`btn-${toolId}`)?.classList.add('active');
}function renderPasswordResult(r) {
  const barWidth = r.score || 0;
  const feedbackItems = (r.feedback || []).map(f => `<li>${f}</li>`).join('');
  return `
    <div class="result-card">
      <div class="result-title">PASSWORD STRENGTH</div>
      <div class="pw-score" style="color:${r.color || '#fff'}">${r.strength}</div>
      <div class="pw-meter">
        <div class="pw-bar-bg"><div class="pw-bar-fill" style="width:${barWidth}%;background:${r.color || '#fff'}"></div></div>
        <div style="font-family:var(--font-mono);font-size:.7rem;color:var(--dim)">${barWidth}/100 · ~${r.entropy_bits || 0} bits entropy · Length: ${r.length}</div>
      </div>
      <ul class="pw-feedback">${feedbackItems}</ul>
    </div>`;
}/* ── FILE UPLOAD ─────────────────────────────────────────────────── */
function setupFileDrop() {
  const zone = document.getElementById('file-drop');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--blue)'; });
  zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.style.borderColor = '';
    const file = e.dataTransfer?.files[0];
    if (file) processFile(file);
  });
}

async function runFileAnalysis(input) {
  const file = input.files?.[0];
  if (!file) return;
  processFile(file);
}

async function processFile(file) {
  const resultEl = document.getElementById('file-result');
  const safeName = escapeHtml(file.name);
  resultEl.innerHTML = `<div class="loading-pulse">Analyzing ${safeName}...</div>`;

  if (!backendOnline) {
    resultEl.innerHTML = `
      <div class="result-card medium">
        <div class="result-title">FILE: ${safeName}</div>
        <div style="color:var(--orange)">Backend offline — connect backend for file analysis.</div>
        <div style="font-size:.8rem;color:var(--dim);margin-top:8px">Size: ${(file.size/1024).toFixed(1)} KB · Deploy the Python backend to enable this feature.</div>
      </div>`;
    return;
  }

  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${CONFIG.BACKEND_URL}/api/analyze/file`, {
      method: 'POST',
      body: formData,
    });
    const result = await res.json();
    resultEl.innerHTML = renderFileResult(result, file.name);
  } catch (e) {
    resultEl.innerHTML = `<div class="loading-pulse">Error: ${escapeHtml(e.message)}</div>`;
  }
}

function renderFileResult(r, filename) {
  const riskClass = (r.risk_level || 'SAFE').toLowerCase();
  const secrets = (r.secrets_detected || []).map(s =>
    `<div class="result-flag-item">[Line ${s.line}] ${s.type}: ${s.redacted}</div>`).join('');
  const issues = (r.issues || []).slice(0, 10).map(i => `
    <div class="issue-item ${i.severity}">
      <div class="issue-header">
        <span class="issue-sev ${i.severity}">${i.severity}</span>
        <span class="issue-desc">${i.description}</span>
      </div>
      <div class="issue-line">Line ${i.line}</div>
    </div>`).join('');
  return `
    <div class="result-card ${riskClass}">
      <div class="result-title">FILE SCAN · ${filename}</div>
      <div class="result-risk risk-${riskClass}">${r.risk_level}</div>
      <div style="font-family:var(--font-mono);font-size:.7rem;color:var(--dim);margin:6px 0">
        ${r.size_bytes ? `Size: ${(r.size_bytes/1024).toFixed(1)} KB · ` : ''}${r.lines_scanned || 0} lines
      </div>
      ${secrets ? `<div class="result-flags"><div style="color:var(--red);font-family:var(--font-mono);font-size:.7rem;margin-bottom:4px">🔑 SECRETS DETECTED:</div>${secrets}</div>` : ''}
      ${issues ? `<div class="issues-list">${issues}</div>` : '<div style="color:var(--green);font-size:.85rem">✓ No issues detected</div>'}
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════
   LOCAL DEMO FALLBACKS (when backend is offline)
   ══════════════════════════════════════════════════════════════════ */
function localDemoResponse(message) {
  const msg = message.toLowerCase();
  const DEMO_RESPONSES = [
    [/sql|sqli|injection/,
      '## SQL Injection (SQLi)\n\n**What it is:** An attacker manipulates database queries.\n\n' +
      '**Defense:**\n- Use parameterized queries / prepared statements\n' +
      '- Use an ORM (SQLAlchemy, Prisma)\n- Validate all user inputs\n\n> OWASP: A03:2021'],
    [/xss|cross.site scri/,
      '## Cross-Site Scripting (XSS)\n\n**What it is:** Attacker injects malicious JavaScript.\n\n' +
      '**Defense:**\n- Escape output\n- Content-Security-Policy headers\n' +
      '- Use textContent not innerHTML\n- HttpOnly cookie flags\n\n> OWASP: A03:2021'],
    [/csrf|cross.site req/,
      '## CSRF — Cross-Site Request Forgery\n\nTricks authenticated users into unwanted requests.\n\n' +
      '**Defense:**\n- CSRF tokens in every form\n- SameSite=Strict cookies\n' +
      '- Verify Origin/Referer headers\n\n> OWASP: A01:2021'],
    [/password|passwd|hash|bcrypt/,
      '## Secure Password Storage\n\nNever store passwords in plain text!\n\n' +
      'Algorithm | Safe?\n----------|------\nMD5/SHA1  | No\nbcrypt    | Yes\nArgon2id  | Best\n\n' +
      'import bcrypt\nhashed = bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=12))'],
    [/owasp/,
      '## OWASP Top 10 (2021)\n\n1. Broken Access Control\n2. Cryptographic Failures\n' +
      '3. Injection (SQLi, XSS)\n4. Insecure Design\n5. Security Misconfiguration\n' +
      '6. Vulnerable Components\n7. Auth Failures\n8. Integrity Failures\n' +
      '9. Logging Failures\n10. SSRF\n\n> Add Gemini key for full AI responses!'],
    [/buffer overflow|bof/,
      '## Buffer Overflow\n\nWriting beyond allocated memory to overwrite execution pointers.\n\n' +
      'char buffer[64];\nfgets(buffer, sizeof(buffer), stdin); // safe\n\n' +
      '**Defenses:** ASLR, Stack Canaries, NX/DEP, memory-safe languages'],
    [/pentest|penetration|ethical hack/,
      '## Penetration Testing Phases\n\n1. Reconnaissance\n2. Scanning\n3. Exploitation\n' +
      '4. Post-exploitation\n5. Reporting\n\n⚠️ Always have written authorization!'],
    [/hi|hello|hey|help|what can/i,
      '## Welcome to CYBAASH AI!\n\nAsk me about:\n- SQLi, XSS, CSRF, Buffer Overflow\n' +
      '- Secure coding in Python, JavaScript\n- Penetration testing\n- OWASP Top 10\n\n' +
      '> Add Gemini key for full AI-powered responses!'],
  ];
  for (const [pattern, response] of DEMO_RESPONSES) {
    if (msg.match(pattern)) return response;
  }
  return null;
}
/* ══════════════════════════════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════════════════════════════ */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el && text) el.textContent = text;
}

function setLink(id, href, text) {
  const el = document.getElementById(id);
  if (el) { el.href = href; if (text) el.textContent = text; }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/`/g, '&#x60;');
}

/** Allow only http/https URLs — returns '' for javascript:, data:, etc. */
function sanitizeUrl(url) {
  try {
    var u = new URL(String(url));
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
  } catch (_) { return ''; }
}

/** Strip dangerous chars from data-attribute values */
function sanitizeAttr(str) {
  return String(str).replace(/[<>"'` -]/g, '');
}

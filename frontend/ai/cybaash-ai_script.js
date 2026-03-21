/**
 * CYBAASH AI — Frontend Script (AWS Free Tier / Static Mode)
 * All AI powered by Gemini directly — no backend required.
 * Password analysis runs 100% client-side.
 */

// Route all Gemini calls through Cloudflare Worker — key never in browser
const PROXY_URL = 'https://cybaash.mohamedaasiq07.workers.dev';

const CONFIG = {
  geminiKey:   '',  // unused when PROXY_URL is set
  geminiModel: 'gemini-2.5-flash-lite',
  maxHistory:  10,
  systemPrompt: `You are CYBAASH AI — an expert cybersecurity assistant for educational and ethical purposes.
Explain vulnerabilities (SQLi, XSS, CSRF, buffer overflows, RCE, LFI, SSRF), teach secure coding,
guide penetration testing concepts (CTF/lab only), and advise on system hardening.
Rules: Never help attack real systems. Always use educational context. Use markdown formatting.
Tone: Professional, direct — like a senior security engineer mentoring a junior.`,
};

let chatHistory = [];
let state = { sessionId: null, sessions: [], isTyping: false, online: false, messageCount: 0 };

document.addEventListener('DOMContentLoaded', () => {
  loadGeminiConfig();
  initSession();
  renderWelcome();
  setupInputHandlers();
  animateTerminalPreview();
});

async function loadGeminiConfig() {
  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  const paths = ['../data_ai_config.json', '/data_ai_config.json', '/portfolio/data_ai_config.json'];
  for (const path of paths) {
    try {
      const r = await fetch(path + '?v=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) continue;
      const c = await r.json();
      // Read key from config file first
      if (c.gemini_api_key) CONFIG.geminiKey    = c.gemini_api_key;
      if (c.apiKey)         CONFIG.geminiKey    = c.apiKey;
      if (c.gemini_model)   CONFIG.geminiModel  = c.gemini_model;
      if (c.system_prompt)  CONFIG.systemPrompt = c.system_prompt;
      break;
    } catch { continue; }
  }
  // localStorage overrides config file (set by admin panel on this browser)
  const lsKey = localStorage.getItem('cybaash_gemini_key') || '';
  if (lsKey) CONFIG.geminiKey = lsKey;

  if (PROXY_URL || CONFIG.geminiKey) {
    state.online = true;
    if (dot)  dot.className    = 'status-dot online';
    if (text) text.textContent = 'Online';
  } else {
    state.online = false;
    if (dot)  dot.className    = 'status-dot offline';
    if (text) text.textContent = 'Demo Mode';
  }
}

function initSession() {
  state.sessionId = sessionStorage.getItem('ai_session') || generateId();
  sessionStorage.setItem('ai_session', state.sessionId);
  const saved = localStorage.getItem('ai_sessions');
  state.sessions = saved ? JSON.parse(saved) : [];
  if (!state.sessions.find(s => s.id === state.sessionId)) addSessionToList(state.sessionId, 'Session 1');
  renderSessionList();
}

async function callGemini(userMessage) {
  if (!PROXY_URL && !CONFIG.geminiKey) return localFallback(userMessage);
  chatHistory.push({ role: 'user', parts: [{ text: userMessage }] });
  if (chatHistory.length > CONFIG.maxHistory * 2) chatHistory = chatHistory.slice(-CONFIG.maxHistory * 2);
  const payload = {
    system_instruction: { parts: [{ text: CONFIG.systemPrompt }] },
    contents: chatHistory,
    generationConfig: { temperature: 0.4, maxOutputTokens: 1024, topP: 0.95 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };
  const url = PROXY_URL || `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${CONFIG.geminiKey}`;
  const body = PROXY_URL
    ? JSON.stringify({ model: CONFIG.geminiModel, stream: false, payload })
    : JSON.stringify(payload);
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(30000) });
  if (r.status === 429) throw new Error('Rate limited — Gemini free tier quota reached. Wait 60 seconds and try again.');
  if (r.status === 400) throw new Error('Invalid Gemini API key. Set a valid key in Admin → Settings.');
  if (!r.ok) throw new Error(`Gemini error ${r.status}`);
  const data = await r.json();
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error('Empty response from Gemini');
  chatHistory.push({ role: 'model', parts: [{ text: reply }] });
  return { reply, tokens: data?.usageMetadata?.totalTokenCount || null };
}

async function callGeminiAnalyze(prompt) {
  if (!PROXY_URL && !CONFIG.geminiKey) return null;
  const analyzePayload = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 512 } };
  const url = PROXY_URL || `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${CONFIG.geminiKey}`;
  const body = PROXY_URL
    ? JSON.stringify({ model: CONFIG.geminiModel, stream: false, payload: analyzePayload })
    : JSON.stringify(analyzePayload);
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(20000) });
  if (!r.ok) return null;
  const data = await r.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

function localFallback(msg) {
  const m = msg.toLowerCase();
  if (/hi|hello|hey/.test(m)) return { reply: '## CYBAASH CYBAASH AI ⚡\n\nSet a **Gemini API key** in Admin → Settings to enable full AI responses.\n\nAsk me about: SQLi, XSS, CSRF, buffer overflows, OWASP Top 10, pentesting.', tokens: null };
  if (/sqli|sql inject/.test(m)) return { reply: '## SQL Injection\n\n**Fix:** Use parameterized queries:\n```python\ncursor.execute("SELECT * FROM users WHERE id=%s", (id,))\n```\n\n*Set a Gemini API key for full AI explanations.*', tokens: null };
  if (/xss|cross.site/.test(m)) return { reply: '## Cross-Site Scripting (XSS)\n\n**Fix:** Escape output and use Content-Security-Policy headers.\n\n*Set a Gemini API key for full AI explanations.*', tokens: null };
  return { reply: '**Demo mode** — Set your Gemini API key in **Admin → Settings → Gemini AI Configuration** to enable full AI responses.', tokens: null };
}

async function sendMessage() {
  const input = document.getElementById('messageInput');
  const message = (input?.value || '').trim();
  if (!message || state.isTyping) return;
  input.value = '';
  autoResize(input);
  updateCharCount('');
  document.getElementById('inputFlags').innerHTML = '';
  appendMessage('user', message);
  updateSessionPreview(state.sessionId, message);
  showTyping();
  setSendState(true);
  try {
    const { reply, tokens } = await callGemini(message);
    hideTyping();
    appendMessage('bot', reply, [], tokens);
  } catch (err) {
    hideTyping();
    appendMessage('bot', `⚠️ **Error:** ${err.message}`, [], null, false, true);
  } finally {
    setSendState(false);
    input?.focus();
  }
}

function fillAndSend(message) {
  const input = document.getElementById('messageInput');
  input.value = message;
  document.getElementById('chat').scrollIntoView({ behavior: 'smooth' });
  sendMessage();
}

function renderWelcome() {
  appendMessage('bot', `## CYBAASH AI AI ⚡\n\nYour cybersecurity assistant. Ask me about:\n\n- **Vulnerabilities** — SQLi, XSS, CSRF, buffer overflows\n- **Secure coding** — best practices, code review\n- **Pen testing** — concepts and methodology (CTF/lab only)\n- **Tools** — use the sidebar to analyze passwords, URLs, and code\n\n*Educational use only. Never target real systems without permission.*`, [], null, true);
}

function appendMessage(role, text, flags = [], tokens = null, isFirst = false, isError = false) {
  const container = document.getElementById('messages');
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = `message ${role}`;
  const avatarContent = role === 'bot'
    ? `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1L1.5 4v3.5C1.5 10 3.75 12.2 7 13c3.25-.8 5.5-3 5.5-5.5V4L7 1z" stroke="var(--cyan)" stroke-width="1.2" fill="none"/><circle cx="7" cy="7" r="1.8" fill="var(--cyan)"/></svg>`
    : `<span>👤</span>`;
  const flagsHTML = flags?.length ? `<div class="msg-flags">${flags.map(f => `<span class="msg-flag">⚠ ${f}</span>`).join('')}</div>` : '';
  const tokenHTML = tokens ? `<span style="font-family:var(--mono);font-size:9px;color:var(--text3)">${tokens} tokens</span>` : '';
  div.innerHTML = `<div class="msg-avatar">${avatarContent}</div><div class="msg-content"><div class="msg-bubble ${isError ? 'error-bubble' : ''}">${renderMarkdown(text)}</div>${flagsHTML}<div class="msg-time" style="display:flex;gap:8px;align-items:center"><span>${time}</span>${tokenHTML}</div></div>`;
  container.appendChild(div);
  scrollToBottom();
  state.messageCount++;
}

function renderMarkdown(text) {
  if (!text) return '';
  let html = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const l = lang ? `<span style="position:absolute;top:8px;right:10px;font-family:var(--mono);font-size:9px;color:var(--text3)">${lang}</span>` : '';
    return `<pre style="position:relative">${l}<code>${code.trim()}</code></pre>`;
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h2 style="font-size:16px;color:#fff">$1</h2>');
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/gs, match => `<ul>${match}</ul>`);
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:10px 0">');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/(?<!>)\n(?!<)/g, '<br>');
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>(<(h[23]|pre|ul|ol|table|blockquote|hr))/g, '$1');
  html = html.replace(/(<\/(h[23]|pre|ul|ol|table|blockquote)>)<\/p>/g, '$1');
  return html;
}

function showTyping() {
  state.isTyping = true;
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.id = 'typingMsg';
  div.className = 'message bot';
  div.innerHTML = `<div class="msg-avatar"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1L1.5 4v3.5C1.5 10 3.75 12.2 7 13c3.25-.8 5.5-3 5.5-5.5V4L7 1z" stroke="var(--cyan)" stroke-width="1.2" fill="none"/><circle cx="7" cy="7" r="1.8" fill="var(--cyan)"/></svg></div><div class="msg-content"><div class="msg-bubble"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div></div>`;
  container.appendChild(div);
  document.getElementById('typingStatus').textContent = 'Thinking…';
  scrollToBottom();
}

function hideTyping() {
  state.isTyping = false;
  document.getElementById('typingMsg')?.remove();
  document.getElementById('typingStatus').textContent = 'Ready — Ask me anything';
}

function newSession() {
  const id = generateId();
  state.sessionId = id;
  chatHistory = [];
  sessionStorage.setItem('ai_session', id);
  addSessionToList(id, `Session ${state.sessions.length + 1}`);
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
  if (s) { s.preview = preview.slice(0,40)+(preview.length>40?'…':''); saveSessions(); renderSessionList(); }
}

function saveSessions() { localStorage.setItem('ai_sessions', JSON.stringify(state.sessions.slice(0,10))); }

function renderSessionList() {
  const el = document.getElementById('sessionList');
  if (!el) return;
  el.innerHTML = state.sessions.map(s => {
    const isActive = s.id === state.sessionId;
    return `<div class="session-item ${isActive?'active':''}" onclick="switchSession('${escapeHtml(String(s.id))}')"><span>💬</span><div style="min-width:0"><div style="font-size:11px;color:${isActive?'var(--cyan)':'var(--text)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(String(s.label||'Session'))}</div><div style="font-size:10px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(String(s.preview||''))}</div></div></div>`;
  }).join('');
}

function switchSession(id) {
  state.sessionId = id;
  chatHistory = [];
  sessionStorage.setItem('ai_session', id);
  clearChat(true);
  renderWelcome();
  renderSessionList();
}

function showTool(type) {
  const modal = document.getElementById('modalOverlay');
  const body  = document.getElementById('modalBody');
  const title = document.getElementById('modalTitle');
  const tools = {
    password: { label: '// PASSWORD STRENGTH',  html: renderPasswordTool() },
    url:      { label: '// URL SAFETY',          html: renderURLTool() },
    code:     { label: '// CODE SCANNER',        html: renderCodeTool() },
    file:     { label: '// FILE ANALYSIS',       html: renderFileTool() },
    hash:     { label: '// HASH GENERATOR',      html: renderHashTool() },
    base64:   { label: '// BASE64 ENCODER',      html: renderBase64Tool() },
    jwt:      { label: '// JWT DECODER',         html: renderJWTTool() },
    subnet:   { label: '// SUBNET CALCULATOR',   html: renderSubnetTool() },
    headers:  { label: '// HTTP HEADERS AUDIT',  html: renderHeadersTool() },
    cvss:     { label: '// CVSS CALCULATOR',     html: renderCVSSTool() },
    regex:    { label: '// REGEX TESTER',        html: renderRegexTool() },
    dns:      { label: '// DNS LOOKUP',          html: renderDNSTool() },
  };
  const t = tools[type];
  if (!t) return;
  title.textContent = t.label;
  body.innerHTML = t.html;
  modal.classList.add('open');
  setTimeout(() => body.querySelector('input,textarea,select')?.focus(), 100);
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }
function closeTool()  { document.getElementById('modalOverlay').classList.remove('open'); }

function renderPasswordTool() {
  return `<div class="tool-form"><label class="tool-label">Enter password to analyze</label><input type="password" class="tool-input" id="pwInput" placeholder="Enter password..." oninput="livePasswordCheck(this.value)"><div id="pwResult"></div><button class="tool-btn" onclick="checkPassword()">Analyze Password</button><p style="font-size:10px;color:var(--text3);text-align:center">🔒 Password never sent anywhere. Analysis is 100% local.</p></div>`;
}

function livePasswordCheck(pw) {
  if (!pw) { document.getElementById('pwResult').innerHTML = ''; return; }
  renderPasswordResult(analyzePasswordClient(pw), 'pwResult');
}

function checkPassword() {
  const pw = document.getElementById('pwInput').value;
  if (pw) renderPasswordResult(analyzePasswordClient(pw), 'pwResult');
}

function analyzePasswordClient(pw) {
  let score = 0;
  const len = pw.length;
  if (len >= 20) score += 40; else if (len >= 16) score += 35; else if (len >= 12) score += 25; else if (len >= 8) score += 15; else score += 5;
  const hasL=/[a-z]/.test(pw), hasU=/[A-Z]/.test(pw), hasD=/\d/.test(pw), hasS=/[^A-Za-z0-9]/.test(pw);
  score += [hasL,hasU,hasD,hasS].filter(Boolean).length * 8;
  score = Math.min(100, Math.max(0, score));
  const strengths=['VERY WEAK','WEAK','MODERATE','STRONG','VERY STRONG'];
  const colors=['#ff2244','#ff6600','#ffd700','#00d4ff','#00ff88'];
  const idx = score>=80?4:score>=60?3:score>=40?2:score>=20?1:0;
  return { score, strength:strengths[idx], color:colors[idx], length:len, has_lowercase:hasL, has_uppercase:hasU, has_digits:hasD, has_special:hasS, entropy_bits:Math.round(len*Math.log2([hasL?26:0,hasU?26:0,hasD?10:0,hasS?32:0].reduce((a,b)=>a+b,0)||1)), feedback:[!hasU&&'Add uppercase letters',!hasD&&'Add numbers',!hasS&&'Add special characters',len<12&&'Use at least 12 characters'].filter(Boolean) };
}

function renderPasswordResult(data, targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const filled = Math.round(data.score/20);
  const bc=['#ff2244','#ff6600','#ffd700','#00d4ff','#00ff88'];
  const bars=Array(5).fill(0).map((_,i)=>`<div class="pw-bar" style="background:${i<filled?(bc[filled-1]||'#00ff88'):'var(--border)'}"></div>`).join('');
  const checks=[{label:'Lowercase',pass:data.has_lowercase},{label:'Uppercase',pass:data.has_uppercase},{label:'Numbers',pass:data.has_digits},{label:'Special chars',pass:data.has_special},{label:'12+ chars',pass:data.length>=12},{label:'16+ chars',pass:data.length>=16}].map(c=>`<li class="pw-check ${c.pass?'pass':'fail'}">${c.pass?'✓':'○'} ${c.label}</li>`).join('');
  el.innerHTML=`<div class="result-card" style="margin-top:12px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span class="pw-score-label" style="color:${data.color}">${data.strength}</span><span style="font-family:var(--mono);font-size:20px;color:${data.color}">${data.score}/100</span></div><div class="pw-bars">${bars}</div><div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-bottom:10px">Length: ${data.length} · Entropy: ~${data.entropy_bits} bits</div><ul class="pw-checks">${checks}</ul>${data.feedback?.length?`<div style="margin-top:12px;padding:10px;background:rgba(255,215,0,.05);border:1px solid rgba(255,215,0,.2);border-radius:4px"><div style="font-size:10px;color:var(--yellow);margin-bottom:6px">// SUGGESTIONS</div>${data.feedback.map(f=>`<div style="font-size:11px;color:var(--text2);margin-bottom:3px">→ ${f}</div>`).join('')}</div>`:''}</div>`;
}

function renderURLTool() {
  return `<div class="tool-form"><label class="tool-label">URL to analyze</label><input type="url" class="tool-input" id="urlInput" placeholder="https://example.com" onkeydown="if(event.key==='Enter')checkURL()"><button class="tool-btn" onclick="checkURL()">Analyze URL</button><div id="urlResult"></div></div>`;
}

async function checkURL() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return;
  const el = document.getElementById('urlResult');
  el.innerHTML = '<div style="color:var(--text3);font-size:11px;margin-top:10px">Analyzing…</div>';
  const flags=[]; let score=0;
  try {
    const u=new URL(url);
    if(u.protocol!=='https:'){flags.push('Non-HTTPS connection');score+=30;}
    if(/\d+\.\d+\.\d+\.\d+/.test(u.hostname)){flags.push('IP-based URL — possible phishing');score+=40;}
    if(/(login|verify|secure|account|update|confirm)/i.test(u.hostname)){flags.push('Sensitive keyword in domain');score+=20;}
    if(u.hostname.split('.').length>4){flags.push('Excessive subdomains');score+=15;}
    if(url.length>100){flags.push('Unusually long URL');score+=10;}
  } catch { flags.push('Invalid URL format'); score=80; }
  const risk=score>=60?'HIGH':score>=30?'MEDIUM':'LOW';
  const color=risk==='HIGH'?'var(--red)':risk==='MEDIUM'?'var(--yellow)':'var(--green)';
  let aiInsight='';
  if(CONFIG.geminiKey){
    try { aiInsight=await callGeminiAnalyze(`Analyze this URL for security risks in 2-3 sentences. URL: ${url}\nRespond concisely, no markdown.`)||''; } catch{}
  }
  el.innerHTML=`<div class="result-card" style="margin-top:12px"><span style="color:${color};font-family:var(--mono);font-size:12px;font-weight:bold">${risk} RISK — Score: ${Math.min(score,100)}/100</span>${flags.length?`<ul style="margin-top:10px">${flags.map(f=>`<li class="result-flag-item">⚠ ${escapeHtml(f)}</li>`).join('')}</ul>`:'<p style="font-size:11px;color:var(--green);margin-top:8px">✓ No suspicious patterns detected</p>'}${aiInsight?`<div style="margin-top:12px;padding:10px;background:rgba(0,212,255,.05);border:1px solid rgba(0,212,255,.15);border-radius:4px;font-size:11px;color:var(--text2);line-height:1.6">${escapeHtml(aiInsight)}</div>`:''}</div>`;
}

function renderCodeTool() {
  return `<div class="tool-form"><label class="tool-label">Language</label><select class="tool-select tool-input" id="codeLang"><option value="auto">Auto-detect</option><option value="python">Python</option><option value="javascript">JavaScript</option><option value="php">PHP</option><option value="html">HTML</option></select><label class="tool-label">Paste code to scan</label><textarea class="tool-textarea" id="codeInput" placeholder="# Paste your code here..."></textarea><button class="tool-btn" onclick="scanCode()">Scan for Vulnerabilities</button><div id="codeResult"></div></div>`;
}

async function scanCode() {
  const code=document.getElementById('codeInput').value.trim();
  const lang=document.getElementById('codeLang').value;
  if(!code)return;
  const el=document.getElementById('codeResult');
  el.innerHTML='<div style="color:var(--text3);font-size:11px;margin-top:10px">Scanning…</div>';
  if(!PROXY_URL && !CONFIG.geminiKey){el.innerHTML='<div style="color:var(--yellow);font-size:11px;margin-top:10px">⚠ AI scanning requires internet connection. Check status indicator.</div>';return;}
  try {
    const result=await callGeminiAnalyze(`Security scan this ${lang} code for vulnerabilities. List each issue as: SEVERITY | Line | Description | Fix. If clean say "✓ No security issues detected".\n\`\`\`${lang}\n${code.slice(0,3000)}\n\`\`\``);
    el.innerHTML=`<div class="result-card" style="margin-top:12px"><div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-bottom:10px">AI Security Scan — ${lang}</div><div style="font-size:12px;color:var(--text);line-height:1.7">${renderMarkdown(result||'No response')}</div></div>`;
  } catch(err){el.innerHTML=`<div style="color:var(--red);font-size:11px;margin-top:10px">Error: ${escapeHtml(err.message)}</div>`;}
}

function renderFileTool() {
  return `<div class="tool-form"><label class="tool-label">Upload file for security analysis</label><div style="border:2px dashed var(--border);border-radius:var(--radius);padding:28px;text-align:center;cursor:pointer" onclick="document.getElementById('modalFileInput').click()" ondragover="event.preventDefault();this.style.borderColor='var(--cyan)'" ondragleave="this.style.borderColor='var(--border)'" ondrop="handleFileDrop(event)"><div style="font-size:28px;margin-bottom:8px">📁</div><div style="font-size:13px;color:var(--text2)">Drop file here or click to browse</div><div style="font-size:10px;color:var(--text3);margin-top:6px">.py .js .php .html .txt .log .sh .json .yaml — Max 500KB</div></div><input type="file" id="modalFileInput" accept=".txt,.log,.py,.js,.php,.html,.sh,.json,.yaml" onchange="analyzeUploadedFile(this)" hidden><div id="fileResult"></div></div>`;
}

function handleFileDrop(e){e.preventDefault();e.target.style.borderColor='var(--border)';const file=e.dataTransfer.files[0];if(file)analyzeFile(file,'fileResult');}
async function analyzeUploadedFile(input){const file=input.files[0];if(file)analyzeFile(file,'fileResult');}

async function analyzeFile(file,targetId){
  const el=document.getElementById(targetId);
  if(!el)return;
  if(!PROXY_URL && !CONFIG.geminiKey){el.innerHTML='<div style="color:var(--yellow);font-size:11px;margin-top:10px">⚠ AI analysis requires internet connection. Check status indicator.</div>';return;}
  el.innerHTML='<div style="color:var(--text3);font-size:11px;margin-top:10px">Reading and scanning…</div>';
  try {
    const text=await file.text();
    const result=await callGeminiAnalyze(`Security scan file "${escapeHtml(file.name)}". Find vulnerabilities, hardcoded secrets, dangerous patterns. List: SEVERITY | Line | Description | Fix. If clean say "✓ No issues found".\n${text.slice(0,3000)}`);
    el.innerHTML=`<div class="result-card" style="margin-top:12px"><div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-bottom:10px">AI Scan — ${escapeHtml(file.name)}</div><div style="font-size:12px;color:var(--text);line-height:1.7">${renderMarkdown(result||'No response')}</div></div>`;
  } catch(err){el.innerHTML=`<div style="color:var(--red);font-size:11px;margin-top:10px">Error: ${escapeHtml(err.message)}</div>`;}
}

function setupInputHandlers(){
  const input=document.getElementById('messageInput');
  if(!input)return;
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
  input.addEventListener('input',()=>{autoResize(input);updateCharCount(input.value);liveInputScan(input.value);});
}

function autoResize(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,120)+'px';}
function updateCharCount(val){const el=document.getElementById('charCount');if(el)el.textContent=`${val.length} / 4000`;}
function liveInputScan(text){
  const el=document.getElementById('inputFlags');
  if(!el||!text||text.length<5){if(el)el.innerHTML='';return;}
  const flags=[];
  if(/('|--|union|select|drop)\s/i.test(text))flags.push('SQLI_PATTERN');
  if(/<script|javascript:|onerror=/i.test(text))flags.push('XSS_PATTERN');
  el.innerHTML=flags.map(f=>`<span class="msg-flag" style="font-size:9px">⚠ ${f} detected in input</span>`).join('');
}
function setSendState(loading){const btn=document.getElementById('sendBtn');if(btn){btn.disabled=loading;btn.style.opacity=loading?'.5':'1';}}

function animateTerminalPreview(){
  const el=document.getElementById('termPreview');
  if(!el)return;
  const lines=[
    {cls:'cmd',text:'$ ai --analyze sqli-payload.txt'},
    {cls:'warn',text:'[WARN] SQLi pattern detected on line 3'},
    {cls:'err',text:'[HIGH] UNION-based injection attempt'},
    {cls:'out',text:"Payload: ' UNION SELECT 1,user(),3--"},
    {cls:'good',text:'[FIX]  Use parameterized queries:'},
    {cls:'out',text:'cursor.execute("SELECT * FROM u WHERE id=%s", (id,))'},
    {cls:'cmd',text:'$ ai --check-password "hunter2"'},
    {cls:'warn',text:'[WEAK] Score: 22/100 — common password'},
    {cls:'good',text:'[TIP]  Use 16+ chars with mixed types'},
    {cls:'cmd',text:'$ ai --scan-url http://1.2.3.4/login'},
    {cls:'err',text:'[HIGH] IP-based URL — possible phishing'},
    {cls:'err',text:'[HIGH] Non-HTTPS connection detected'},
    {cls:'cmd',text:'$ _'},
  ];
  let i=0;
  function next(){
    if(i>=lines.length-1){const c=document.createElement('span');c.className='tp-cursor';el.appendChild(c);return;}
    const line=lines[i++];const span=document.createElement('span');span.className=`tp-line ${line.cls}`;span.textContent=line.text;el.appendChild(span);el.appendChild(document.createTextNode('\n'));setTimeout(next,120+Math.random()*80);
  }
  setTimeout(next,600);
}

function clearChat(silent=false){const c=document.getElementById('messages');if(c)c.innerHTML='';state.messageCount=0;if(!silent)renderWelcome();}
function scrollToBottom(){const el=document.getElementById('messages');if(el)setTimeout(()=>el.scrollTo({top:el.scrollHeight,behavior:'smooth'}),50);}
function generateId(){return 'sess_'+Math.random().toString(36).slice(2,10)+Date.now().toString(36);}
function escapeHtml(str){return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});

// ── ALIASES to match HTML onclick calls ──────────────────────────
function sendQuick(message) {
  const input = document.getElementById('messageInput');
  input.value = message;
  document.getElementById('chat').scrollIntoView({ behavior: 'smooth' });
  sendMessage();
}

async function handleFileUpload(input) {
  const file = input.files[0];
  if (!file) return;
  appendMessage('user', `📁 Analyzing file: **${file.name}** (${(file.size/1024).toFixed(1)} KB)`);
  showTyping();
  setSendState(true);
  try {
    if (!CONFIG.geminiKey) {
      hideTyping();
      appendMessage('bot', '⚠️ Set a Gemini API key in Admin → Settings to enable file analysis.', [], null, false, true);
      return;
    }
    const text = await file.text();
    const prompt = `Security scan this file named "${file.name}". Find vulnerabilities, hardcoded secrets, dangerous patterns.\nList: SEVERITY | Line | Description | Fix. If clean say "✓ No issues found".\n${text.slice(0, 3000)}`;
    const result = await callGeminiAnalyze(prompt);
    hideTyping();
    appendMessage('bot', `### File Scan: \`${file.name}\`\n\n${result || 'No response from AI.'}`);
  } catch(err) {
    hideTyping();
    appendMessage('bot', `⚠️ File analysis failed: ${err.message}`, [], null, false, true);
  } finally {
    setSendState(false);
    input.value = '';
  }
}

// ═══════════════════════════════════════════════════════════════════════
// NEW SECURITY TOOLS — all client-side, no API key required
// ═══════════════════════════════════════════════════════════════════════

// ── HASH GENERATOR ────────────────────────────────────────────────────
function renderHashTool() {
  return `<div class="tool-form">
    <label class="tool-label">Input text to hash</label>
    <textarea class="tool-textarea" id="hashInput" placeholder="Enter text..." rows="4" oninput="liveHash(this.value)"></textarea>
    <div id="hashResult"></div>
  </div>`;
}

async function liveHash(text) {
  const el = document.getElementById('hashResult');
  if (!el) return;
  if (!text) { el.innerHTML = ''; return; }
  const enc = new TextEncoder().encode(text);
  async function digest(algo) {
    const buf = await crypto.subtle.digest(algo, enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }
  const [sha1, sha256, sha384, sha512] = await Promise.all([
    digest('SHA-1'), digest('SHA-256'), digest('SHA-384'), digest('SHA-512')
  ]);
  const rows = [
    ['SHA-1',   sha1,   'Weak — avoid'],
    ['SHA-256', sha256, 'Recommended'],
    ['SHA-384', sha384, 'Strong'],
    ['SHA-512', sha512, 'Max strength'],
  ];
  el.innerHTML = `<div class="result-card" style="margin-top:12px">
    ${rows.map(([algo, hash, note]) => `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-family:var(--mono);font-size:10px;color:var(--cyan)">${algo}</span>
          <span style="font-size:9px;color:${note.includes('avoid')?'var(--red)':'var(--green)'}">${note}</span>
        </div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--text2);word-break:break-all;background:var(--bg2);padding:7px 9px;border-radius:3px;cursor:pointer;user-select:all" 
             onclick="navigator.clipboard.writeText('${hash}');this.style.color='var(--green)';setTimeout(()=>this.style.color='',1000)" 
             title="Click to copy">${hash}</div>
      </div>`).join('')}
    <p style="font-size:9px;color:var(--text3);text-align:center;margin-top:6px">Click any hash to copy · All computation is local</p>
  </div>`;
}

// ── BASE64 ENCODER/DECODER ────────────────────────────────────────────
function renderBase64Tool() {
  return `<div class="tool-form">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <button class="tool-btn" onclick="b64Encode()">Encode →</button>
      <button class="tool-btn" style="background:rgba(0,212,255,.08)" onclick="b64Decode()">← Decode</button>
    </div>
    <label class="tool-label">Input</label>
    <textarea class="tool-textarea" id="b64Input" placeholder="Paste text or Base64 here..." rows="4"></textarea>
    <label class="tool-label" style="margin-top:10px">Output</label>
    <textarea class="tool-textarea" id="b64Output" placeholder="Result appears here..." rows="4" readonly style="cursor:pointer;user-select:all" onclick="navigator.clipboard.writeText(this.value);this.style.borderColor='var(--green)';setTimeout(()=>this.style.borderColor='',1200)" title="Click to copy"></textarea>
    <div id="b64Info" style="font-size:9px;color:var(--text3);margin-top:6px;text-align:center"></div>
  </div>`;
}

function b64Encode() {
  const inp = document.getElementById('b64Input').value;
  const out = document.getElementById('b64Output');
  const info = document.getElementById('b64Info');
  try {
    const encoded = btoa(unescape(encodeURIComponent(inp)));
    out.value = encoded;
    if(info) info.textContent = `${inp.length} chars → ${encoded.length} chars encoded · Click output to copy`;
  } catch(e) { out.value = 'Error: ' + e.message; }
}

function b64Decode() {
  const inp = document.getElementById('b64Input').value.trim();
  const out = document.getElementById('b64Output');
  const info = document.getElementById('b64Info');
  try {
    const decoded = decodeURIComponent(escape(atob(inp)));
    out.value = decoded;
    if(info) info.textContent = `${inp.length} chars decoded → ${decoded.length} chars · Click output to copy`;
  } catch(e) { out.value = 'Error: Invalid Base64 input'; }
}

// ── JWT DECODER ───────────────────────────────────────────────────────
function renderJWTTool() {
  return `<div class="tool-form">
    <label class="tool-label">Paste JWT token</label>
    <textarea class="tool-textarea" id="jwtInput" placeholder="eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.xxx" rows="4" oninput="decodeJWT(this.value)"></textarea>
    <div id="jwtResult"></div>
  </div>`;
}

function decodeJWT(token) {
  const el = document.getElementById('jwtResult');
  if (!el) return;
  const t = token.trim();
  if (!t) { el.innerHTML = ''; return; }
  const parts = t.split('.');
  if (parts.length !== 3) { el.innerHTML = '<div style="color:var(--red);font-size:11px;margin-top:8px">✗ Invalid JWT — must have 3 parts separated by dots</div>'; return; }
  function safeDecode(str) {
    try { return JSON.parse(atob(str.replace(/-/g,'+').replace(/_/g,'/'))); } catch { return null; }
  }
  const header  = safeDecode(parts[0]);
  const payload = safeDecode(parts[1]);
  if (!header || !payload) { el.innerHTML = '<div style="color:var(--red);font-size:11px;margin-top:8px">✗ Could not decode JWT parts</div>'; return; }

  const now = Math.floor(Date.now()/1000);
  const expired = payload.exp && payload.exp < now;
  const expiryStr = payload.exp ? new Date(payload.exp * 1000).toLocaleString() : 'No expiry';
  const issuedStr = payload.iat ? new Date(payload.iat * 1000).toLocaleString() : '—';

  const risks = [];
  if (header.alg === 'none') risks.push({sev:'CRITICAL', msg:'Algorithm is "none" — signature not verified!'});
  if (header.alg?.startsWith('HS')) risks.push({sev:'WARN', msg:'HMAC algorithm — secret must be kept private'});
  if (expired) risks.push({sev:'HIGH', msg:'Token is EXPIRED'});
  if (!payload.exp) risks.push({sev:'WARN', msg:'No expiration (exp) claim — token never expires'});

  el.innerHTML = `<div class="result-card" style="margin-top:12px">
    <div style="font-family:var(--mono);font-size:9px;color:var(--cyan);margin-bottom:8px">HEADER</div>
    <pre style="font-size:11px;color:var(--text);background:var(--bg2);padding:8px;border-radius:3px;overflow-x:auto;margin-bottom:12px">${escapeHtml(JSON.stringify(header,null,2))}</pre>
    <div style="font-family:var(--mono);font-size:9px;color:var(--cyan);margin-bottom:8px">PAYLOAD</div>
    <pre style="font-size:11px;color:var(--text);background:var(--bg2);padding:8px;border-radius:3px;overflow-x:auto;margin-bottom:12px">${escapeHtml(JSON.stringify(payload,null,2))}</pre>
    <div style="font-family:var(--mono);font-size:9px;color:var(--text3);margin-bottom:8px">TIMING</div>
    <div style="font-size:10px;color:var(--text2);margin-bottom:4px">Issued:  ${issuedStr}</div>
    <div style="font-size:10px;color:${expired?'var(--red)':'var(--green)'};margin-bottom:12px">Expires: ${expiryStr} ${expired?'(EXPIRED)':''}</div>
    ${risks.length ? `<div style="margin-top:8px">${risks.map(r=>`<div style="padding:6px 9px;margin-bottom:5px;border-left:3px solid ${r.sev==='CRITICAL'?'var(--red)':r.sev==='HIGH'?'var(--red)':'var(--yellow)'}"><span style="font-family:var(--mono);font-size:9px;color:${r.sev==='CRITICAL'||r.sev==='HIGH'?'var(--red)':'var(--yellow)'}">${r.sev}</span><span style="font-size:11px;color:var(--text2);margin-left:8px">${r.msg}</span></div>`).join('')}</div>` : '<div style="color:var(--green);font-size:11px">✓ No obvious security issues detected</div>'}
    <div style="font-family:var(--mono);font-size:9px;color:var(--text3);margin-top:12px">SIGNATURE (not verified client-side)</div>
    <div style="word-break:break-all;font-family:var(--mono);font-size:9px;color:var(--text3);background:var(--bg2);padding:6px;border-radius:3px">${parts[2]}</div>
  </div>`;
}

// ── SUBNET CALCULATOR ─────────────────────────────────────────────────
function renderSubnetTool() {
  return `<div class="tool-form">
    <label class="tool-label">IP Address / CIDR</label>
    <input class="tool-input" id="subnetInput" placeholder="e.g. 192.168.1.0/24" oninput="calcSubnet(this.value)">
    <div id="subnetResult"></div>
  </div>`;
}

function calcSubnet(cidr) {
  const el = document.getElementById('subnetResult');
  if (!el || !cidr.trim()) { el.innerHTML = ''; return; }
  const match = cidr.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/);
  if (!match) { el.innerHTML = '<div style="color:var(--red);font-size:11px;margin-top:8px">✗ Invalid format. Use: 192.168.1.0/24</div>'; return; }
  const [,a,b,c,d,prefix] = match;
  const octs = [a,b,c,d].map(Number);
  if (octs.some(o => o > 255)) { el.innerHTML = '<div style="color:var(--red);font-size:11px;margin-top:8px">✗ Invalid IP — octets must be 0–255</div>'; return; }
  const pfx = prefix ? parseInt(prefix) : 32;
  if (pfx > 32) { el.innerHTML = '<div style="color:var(--red);font-size:11px;margin-top:8px">✗ Prefix must be 0–32</div>'; return; }

  const ipInt = (octs[0]<<24|octs[1]<<16|octs[2]<<8|octs[3])>>>0;
  const mask  = pfx === 0 ? 0 : (0xFFFFFFFF << (32-pfx)) >>> 0;
  const net   = (ipInt & mask) >>> 0;
  const bcast = (net | ~mask) >>> 0;
  const first = pfx < 31 ? net + 1 : net;
  const last  = pfx < 31 ? bcast - 1 : bcast;
  const hosts = pfx >= 31 ? (pfx===32?1:2) : Math.pow(2, 32-pfx) - 2;

  function intToIP(n) { return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join('.'); }
  function intToMask(m) { return intToIP(m); }

  const isPrivate = (net>>>24===10) || (net>>>24===172 && ((net>>>16)&255)>=16 && ((net>>>16)&255)<=31) || (net>>>24===192 && ((net>>>16)&255)===168);
  const isLoopback = (net>>>24===127);

  const rows = [
    ['Network',         intToIP(net)],
    ['Subnet Mask',     intToMask(mask)],
    ['Wildcard Mask',   intToMask(~mask>>>0)],
    ['Broadcast',       intToIP(bcast)],
    ['First Host',      pfx < 32 ? intToIP(first) : 'N/A'],
    ['Last Host',       pfx < 32 ? intToIP(last)  : 'N/A'],
    ['Usable Hosts',    hosts.toLocaleString()],
    ['Total Addresses', Math.pow(2, 32-pfx).toLocaleString()],
    ['Class',           isPrivate ? 'Private RFC1918' : isLoopback ? 'Loopback' : 'Public'],
  ];

  el.innerHTML = `<div class="result-card" style="margin-top:12px">
    <table style="width:100%;border-collapse:collapse">
      ${rows.map(([k,v]) => `<tr>
        <td style="font-family:var(--mono);font-size:10px;color:var(--text3);padding:5px 8px;border-bottom:1px solid var(--border)">${k}</td>
        <td style="font-family:var(--mono);font-size:11px;color:var(--cyan);padding:5px 8px;border-bottom:1px solid var(--border);text-align:right">${v}</td>
      </tr>`).join('')}
    </table>
    <div style="margin-top:10px;font-size:10px;color:${isPrivate?'var(--green)':isLoopback?'var(--yellow)':'var(--blue)'}">
      ${isPrivate ? '● Private address space (RFC 1918)' : isLoopback ? '● Loopback address' : '● Public address space'}
    </div>
  </div>`;
}

// ── HTTP HEADERS AUDIT ────────────────────────────────────────────────
function renderHeadersTool() {
  return `<div class="tool-form">
    <label class="tool-label">Paste HTTP response headers</label>
    <textarea class="tool-textarea" id="headersInput" rows="8" placeholder="Content-Type: text/html\nStrict-Transport-Security: max-age=31536000\nX-Frame-Options: DENY\n..." oninput="auditHeaders(this.value)"></textarea>
    <div id="headersResult"></div>
  </div>`;
}

function auditHeaders(raw) {
  const el = document.getElementById('headersResult');
  if (!el || !raw.trim()) { el.innerHTML = ''; return; }

  const parsed = {};
  raw.trim().split('\n').forEach(line => {
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (m) parsed[m[1].trim().toLowerCase()] = m[2].trim();
  });

  const checks = [
    { name: 'Strict-Transport-Security', key: 'strict-transport-security',
      pass: v => v && v.includes('max-age'),
      tip: 'Add: Strict-Transport-Security: max-age=31536000; includeSubDomains',
      sev: 'HIGH', desc: 'Forces HTTPS connections' },
    { name: 'Content-Security-Policy', key: 'content-security-policy',
      pass: v => !!v,
      tip: 'Add: Content-Security-Policy: default-src \'self\'',
      sev: 'HIGH', desc: 'Prevents XSS attacks' },
    { name: 'X-Frame-Options', key: 'x-frame-options',
      pass: v => v && /deny|sameorigin/i.test(v),
      tip: 'Add: X-Frame-Options: DENY',
      sev: 'MEDIUM', desc: 'Prevents clickjacking' },
    { name: 'X-Content-Type-Options', key: 'x-content-type-options',
      pass: v => v === 'nosniff',
      tip: 'Add: X-Content-Type-Options: nosniff',
      sev: 'MEDIUM', desc: 'Prevents MIME sniffing' },
    { name: 'Referrer-Policy', key: 'referrer-policy',
      pass: v => !!v,
      tip: 'Add: Referrer-Policy: strict-origin-when-cross-origin',
      sev: 'LOW', desc: 'Controls referrer information' },
    { name: 'Permissions-Policy', key: 'permissions-policy',
      pass: v => !!v,
      tip: 'Add: Permissions-Policy: geolocation=(), microphone=()',
      sev: 'LOW', desc: 'Restricts browser features' },
    { name: 'Server', key: 'server',
      pass: v => !v || v.length < 10,
      tip: 'Remove or obscure Server header — avoid exposing version',
      sev: 'LOW', desc: 'Server banner not leaking version' },
    { name: 'X-Powered-By', key: 'x-powered-by',
      pass: v => !v,
      tip: 'Remove X-Powered-By header to avoid fingerprinting',
      sev: 'LOW', desc: 'Framework not exposed' },
  ];

  const results = checks.map(c => ({ ...c, value: parsed[c.key] || null, ok: c.pass(parsed[c.key]) }));
  const score = Math.round(results.filter(r=>r.ok).length / results.length * 100);
  const colScore = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--red)';

  el.innerHTML = `<div class="result-card" style="margin-top:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <span style="font-family:var(--mono);font-size:11px;color:var(--text2)">Security Score</span>
      <span style="font-family:var(--mono);font-size:22px;font-weight:700;color:${colScore}">${score}/100</span>
    </div>
    ${results.map(r => `
      <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:14px;flex-shrink:0">${r.ok ? '✓' : '✗'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-family:var(--mono);font-size:10px;color:${r.ok?'var(--green)':'var(--red)'}">${r.name}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">${r.desc}</div>
          ${!r.ok ? `<div style="font-size:9px;color:var(--yellow);margin-top:4px;font-family:var(--mono)">${r.tip}</div>` : ''}
          ${r.ok && r.value ? `<div style="font-size:9px;color:var(--text3);margin-top:2px;word-break:break-all">${escapeHtml(r.value)}</div>` : ''}
        </div>
        <span style="font-size:8px;font-family:var(--mono);color:${r.sev==='HIGH'?'var(--red)':r.sev==='MEDIUM'?'var(--yellow)':'var(--text3)'};flex-shrink:0">${r.ok?'':''+r.sev}</span>
      </div>`).join('')}
  </div>`;
}

// ── CVSS v3.1 CALCULATOR ──────────────────────────────────────────────
function renderCVSSTool() {
  const sel = (id, label, opts) => `
    <div style="margin-bottom:10px">
      <label class="tool-label">${label}</label>
      <select class="tool-input tool-select" id="${id}" onchange="calcCVSS()">
        ${opts.map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
      </select>
    </div>`;
  return `<div class="tool-form">
    <div style="font-family:var(--mono);font-size:9px;color:var(--text3);margin-bottom:14px;letter-spacing:1px">CVSS v3.1 — BASE SCORE CALCULATOR</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">
      ${sel('cvAV','Attack Vector',       [['N','Network'],['A','Adjacent'],['L','Local'],['P','Physical']])}
      ${sel('cvAC','Attack Complexity',   [['L','Low'],['H','High']])}
      ${sel('cvPR','Privileges Required', [['N','None'],['L','Low'],['H','High']])}
      ${sel('cvUI','User Interaction',    [['N','None'],['R','Required']])}
      ${sel('cvS', 'Scope',               [['U','Unchanged'],['C','Changed']])}
      ${sel('cvC', 'Confidentiality',     [['N','None'],['L','Low'],['H','High']])}
      ${sel('cvI', 'Integrity',           [['N','None'],['L','Low'],['H','High']])}
      ${sel('cvA', 'Availability',        [['N','None'],['L','Low'],['H','High']])}
    </div>
    <div id="cvssResult"></div>
  </div>`;
}

function calcCVSS() {
  const g = id => document.getElementById(id)?.value;
  const AV = {N:0.85,A:0.62,L:0.55,P:0.2}[g('cvAV')]??0.85;
  const AC = {L:0.77,H:0.44}[g('cvAC')]??0.77;
  const PR_U = {N:0.85,L:0.62,H:0.27}[g('cvPR')]??0.85;
  const PR_C = {N:0.85,L:0.68,H:0.5}[g('cvPR')]??0.85;
  const UI = {N:0.85,R:0.62}[g('cvUI')]??0.85;
  const SC = g('cvS') === 'C';
  const PR = SC ? PR_C : PR_U;
  const C = {N:0,L:0.22,H:0.56}[g('cvC')]??0;
  const I = {N:0,L:0.22,H:0.56}[g('cvI')]??0;
  const A = {N:0,L:0.22,H:0.56}[g('cvA')]??0;

  const ISCBase = 1 - (1-C)*(1-I)*(1-A);
  const ISC = SC ? 7.52*(ISCBase-0.029) - 3.25*Math.pow(ISCBase-0.02,15) : 6.42*ISCBase;
  const Exploitability = 8.22*AV*AC*PR*UI;
  let score;
  if (ISC <= 0) { score = 0; }
  else if (!SC) { score = Math.min(10, (ISC + Exploitability) * 1.08); }
  else          { score = Math.min(10, 1.08*(ISC + Exploitability)); }
  score = Math.round(score * 10) / 10;

  const sev = score === 0 ? 'NONE' : score < 4 ? 'LOW' : score < 7 ? 'MEDIUM' : score < 9 ? 'HIGH' : 'CRITICAL';
  const col = {NONE:'var(--text3)',LOW:'var(--green)',MEDIUM:'var(--yellow)',HIGH:'var(--red)',CRITICAL:'#ff2244'}[sev];
  const vector = `CVSS:3.1/AV:${g('cvAV')}/AC:${g('cvAC')}/PR:${g('cvPR')}/UI:${g('cvUI')}/S:${g('cvS')}/C:${g('cvC')}/I:${g('cvI')}/A:${g('cvA')}`;

  const el = document.getElementById('cvssResult');
  if (!el) return;
  el.innerHTML = `<div class="result-card" style="margin-top:14px;text-align:center">
    <div style="font-size:48px;font-family:var(--mono);font-weight:900;color:${col};line-height:1">${score.toFixed(1)}</div>
    <div style="font-family:var(--mono);font-size:14px;color:${col};letter-spacing:3px;margin:6px 0 16px">${sev}</div>
    <div style="font-family:var(--mono);font-size:9px;color:var(--text3);word-break:break-all;cursor:pointer;user-select:all;background:var(--bg2);padding:8px;border-radius:3px" 
         onclick="navigator.clipboard.writeText('${vector}');this.style.color='var(--green)';setTimeout(()=>this.style.color='',1000)" 
         title="Click to copy vector string">${vector}</div>
  </div>`;
}

// ── REGEX TESTER ──────────────────────────────────────────────────────
function renderRegexTool() {
  return `<div class="tool-form">
    <label class="tool-label">Regular Expression</label>
    <div style="display:flex;gap:6px;margin-bottom:10px">
      <input class="tool-input" id="regexPat" placeholder="e.g. ^[a-z0-9]+$" style="flex:1" oninput="runRegex()">
      <input class="tool-input" id="regexFlags" placeholder="flags" style="width:60px" value="gm" oninput="runRegex()">
    </div>
    <label class="tool-label">Test String</label>
    <textarea class="tool-textarea" id="regexText" rows="5" placeholder="Paste text to test against..." oninput="runRegex()"></textarea>
    <div id="regexResult"></div>
  </div>`;
}

function runRegex() {
  const pat   = document.getElementById('regexPat')?.value;
  const flags = document.getElementById('regexFlags')?.value || 'g';
  const text  = document.getElementById('regexText')?.value || '';
  const el    = document.getElementById('regexResult');
  if (!el || !pat) { if(el) el.innerHTML = ''; return; }

  try {
    const rx = new RegExp(pat, flags);
    const matches = [...text.matchAll(new RegExp(pat, flags.includes('g') ? flags : flags+'g'))];

    // ReDoS check — basic catastrophic backtracking heuristics
    const redos = [];
    if (/\(.+\+\)\+|\(.+\*\)\*|\(.+\+\)\*|\(.+\*\)\+/.test(pat)) redos.push('Nested quantifiers detected — possible ReDoS vulnerability');
    if (/(\w+)\+.*\1/.test(pat)) redos.push('Repeated groups with overlap — potential catastrophic backtracking');
    if (pat.length > 100) redos.push('Very long pattern — review for efficiency');

    const highlighted = matches.length > 0
      ? text.replace(new RegExp(pat, flags.includes('g') ? flags : flags+'g'), m =>
          `<mark style="background:rgba(0,212,255,.2);color:var(--cyan);border-radius:2px">${escapeHtml(m)}</mark>`)
      : escapeHtml(text);

    el.innerHTML = `<div class="result-card" style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-family:var(--mono);font-size:10px;color:${matches.length?'var(--green)':'var(--text3)'}">${matches.length} match${matches.length!==1?'es':''}</span>
        ${redos.length ? `<span style="font-family:var(--mono);font-size:9px;color:var(--red)">⚠ ReDoS risk</span>` : ''}
      </div>
      ${redos.map(r=>`<div style="color:var(--red);font-size:10px;margin-bottom:6px;padding:6px;background:rgba(255,34,68,.05);border-left:2px solid var(--red)">⚠ ${r}</div>`).join('')}
      <div style="font-family:var(--mono);font-size:11px;color:var(--text2);white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;background:var(--bg2);padding:8px;border-radius:3px;line-height:1.7">${highlighted}</div>
      ${matches.length ? `<div style="margin-top:10px;font-family:var(--mono);font-size:9px;color:var(--text3)">CAPTURES</div>
      <div style="max-height:120px;overflow-y:auto;margin-top:4px">
        ${matches.slice(0,20).map((m,i)=>`<div style="font-size:10px;color:var(--text2);padding:3px 0;border-bottom:1px solid rgba(26,58,92,.3)">[${i}] ${escapeHtml(m[0])}</div>`).join('')}
        ${matches.length>20?`<div style="font-size:9px;color:var(--text3)">...and ${matches.length-20} more</div>`:''}
      </div>` : ''}
    </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:var(--red);font-size:11px;margin-top:8px">✗ Invalid regex: ${escapeHtml(e.message)}</div>`;
  }
}

// ── DNS LOOKUP ────────────────────────────────────────────────────────
function renderDNSTool() {
  return `<div class="tool-form">
    <label class="tool-label">Domain or IP</label>
    <input class="tool-input" id="dnsInput" placeholder="e.g. example.com" onkeydown="if(event.key==='Enter')dnsLookup()">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0">
      ${['A','AAAA','MX','TXT','NS','CNAME','SOA','ANY'].map(t => 
        `<button class="tool-btn" style="font-size:10px;padding:6px 4px" onclick="dnsLookupType('${t}')">${t}</button>`
      ).join('')}
    </div>
    <div id="dnsResult"></div>
  </div>`;
}

async function dnsLookup()    { dnsLookupType('A'); }
async function dnsLookupType(type) {
  const domain = document.getElementById('dnsInput').value.trim();
  const el     = document.getElementById('dnsResult');
  if (!el || !domain) return;
  el.innerHTML = `<div style="color:var(--text3);font-size:11px;margin-top:10px">Querying ${type} records for ${escapeHtml(domain)}…</div>`;

  try {
    // Use Cloudflare DNS-over-HTTPS (no API key, public)
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`;
    const r = await fetch(url, { headers: { Accept: 'application/dns-json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    const typeMap = {1:'A',2:'NS',5:'CNAME',6:'SOA',15:'MX',16:'TXT',28:'AAAA',255:'ANY'};
    const answers = data.Answer || data.Authority || [];

    if (answers.length === 0) {
      el.innerHTML = `<div class="result-card" style="margin-top:12px;color:var(--text3);font-size:11px">No ${type} records found for ${escapeHtml(domain)}</div>`;
      return;
    }

    // Security checks on results
    const flags = [];
    answers.forEach(a => {
      if (a.data && a.data.includes('v=spf1') && !a.data.includes('-all')) flags.push('SPF record missing "-all" — allows spoofing');
      if (type === 'MX' && a.data === '.') flags.push('Null MX record — domain accepts no email');
    });

    el.innerHTML = `<div class="result-card" style="margin-top:12px">
      <div style="font-family:var(--mono);font-size:9px;color:var(--text3);margin-bottom:10px">${answers.length} ${type} record${answers.length!==1?'s':''} · TTL in seconds</div>
      <table style="width:100%;border-collapse:collapse">
        <tr style="border-bottom:1px solid var(--border)">
          <th style="font-size:9px;color:var(--text3);padding:4px 6px;text-align:left;font-family:var(--mono)">TYPE</th>
          <th style="font-size:9px;color:var(--text3);padding:4px 6px;text-align:left;font-family:var(--mono)">TTL</th>
          <th style="font-size:9px;color:var(--text3);padding:4px 6px;text-align:left;font-family:var(--mono)">DATA</th>
        </tr>
        ${answers.map(a => `<tr style="border-bottom:1px solid rgba(26,58,92,.3)">
          <td style="font-family:var(--mono);font-size:10px;color:var(--cyan);padding:5px 6px">${typeMap[a.type]||a.type}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--text3);padding:5px 6px">${a.TTL}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--text);padding:5px 6px;word-break:break-all">${escapeHtml(a.data||'')}</td>
        </tr>`).join('')}
      </table>
      ${flags.map(f => `<div style="margin-top:8px;color:var(--yellow);font-size:10px;padding:6px;background:rgba(255,215,0,.05);border-left:2px solid var(--yellow)">⚠ ${f}</div>`).join('')}
    </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:var(--red);font-size:11px;margin-top:8px">✗ Lookup failed: ${escapeHtml(e.message)}</div>`;
  }
}

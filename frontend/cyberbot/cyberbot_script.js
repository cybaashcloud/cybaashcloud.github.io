/**
 * CyberBot — Frontend Script (AWS Free Tier / Static Mode)
 * All AI powered by Gemini directly — no backend required.
 * Password analysis runs 100% client-side.
 */

const CONFIG = {
  backend:    'https://cybaash-ai.onrender.com',
  backendOk:  false,
  maxHistory: 10,
  sessionId:  'cyb_' + Math.random().toString(36).slice(2, 11),
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
  // Security: check backend health instead of reading key from browser storage.
  // Gemini key lives only as a Render env var — never in browser.
  try {
    const r = await fetch(CONFIG.backend + '/api/health', { cache: 'no-store' });
    if (r.ok) {
      const h = await r.json();
      if (h.status === 'ok') {
        CONFIG.backendOk = true;
        if (dot)  { dot.className  = 'status-dot online'; }
        if (text) { text.textContent = 'AI Online'; }
        return;
      }
    }
  } catch(_) {}
  CONFIG.backendOk = false;
  if (dot)  { dot.className  = 'status-dot offline'; }
  if (text) { text.textContent = 'AI Offline — check Render deployment'; }
}

function initSession() {
  state.sessionId = sessionStorage.getItem('cyberbot_session') || generateId();
  sessionStorage.setItem('cyberbot_session', state.sessionId);
  const saved = localStorage.getItem('cyberbot_sessions');
  state.sessions = saved ? JSON.parse(saved) : [];
  if (!state.sessions.find(s => s.id === state.sessionId)) addSessionToList(state.sessionId, 'Session 1');
  renderSessionList();
}

async function callGemini(userMessage) {
  if (!CONFIG.backendOk) return localFallback(userMessage);
  const r = await fetch(CONFIG.backend + '/api/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: userMessage, session_id: CONFIG.sessionId }),
    signal: AbortSignal.timeout(30000),
  });
  if (r.status === 503) throw new Error('AI backend offline — check Render deployment');
  if (r.status === 429) throw new Error('Rate limit reached — wait a moment');
  if (!r.ok) throw new Error('Backend error ' + r.status);
  const data = await r.json();
  return { reply: data.reply || 'No response.', tokens: data.tokens_used };
}

async function callGeminiAnalyze(prompt) {
  if (!CONFIG.backendOk) return null;
  const r = await fetch(CONFIG.backend + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: prompt, session_id: CONFIG.sessionId + '_analyze' }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) return null;
  const data = await r.json();
  return data.reply || null;
}

function localFallback(msg) {
  const m = msg.toLowerCase();
  if (/hi|hello|hey/.test(m)) return { reply: '## CYBAASH CyberBot ⚡\n\nSet a **Gemini API key** in Admin → Settings to enable full AI responses.\n\nAsk me about: SQLi, XSS, CSRF, buffer overflows, OWASP Top 10, pentesting.', tokens: null };
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
  appendMessage('bot', `## CyberBot AI ⚡\n\nYour cybersecurity assistant. Ask me about:\n\n- **Vulnerabilities** — SQLi, XSS, CSRF, buffer overflows\n- **Secure coding** — best practices, code review\n- **Pen testing** — concepts and methodology (CTF/lab only)\n- **Tools** — use the sidebar to analyze passwords, URLs, and code\n\n*Educational use only. Never target real systems without permission.*`, [], null, true);
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
  sessionStorage.setItem('cyberbot_session', id);
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

function saveSessions() { localStorage.setItem('cyberbot_sessions', JSON.stringify(state.sessions.slice(0,10))); }

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
  sessionStorage.setItem('cyberbot_session', id);
  clearChat(true);
  renderWelcome();
  renderSessionList();
}

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
  body.innerHTML = t.html;
  modal.classList.add('open');
  setTimeout(() => body.querySelector('input,textarea')?.focus(), 100);
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
  if(CONFIG.backendOk){
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
  if(!CONFIG.backendOk){el.innerHTML='<div style="color:var(--yellow);font-size:11px;margin-top:10px">⚠ Set a Gemini API key in Admin → Settings to enable AI code scanning.</div>';return;}
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
  if(!CONFIG.backendOk){el.innerHTML='<div style="color:var(--yellow);font-size:11px;margin-top:10px">⚠ Set a Gemini API key in Admin → Settings to enable file analysis.</div>';return;}
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
    {cls:'cmd',text:'$ cyberbot --analyze sqli-payload.txt'},
    {cls:'warn',text:'[WARN] SQLi pattern detected on line 3'},
    {cls:'err',text:'[HIGH] UNION-based injection attempt'},
    {cls:'out',text:"Payload: ' UNION SELECT 1,user(),3--"},
    {cls:'good',text:'[FIX]  Use parameterized queries:'},
    {cls:'out',text:'cursor.execute("SELECT * FROM u WHERE id=%s", (id,))'},
    {cls:'cmd',text:'$ cyberbot --check-password "hunter2"'},
    {cls:'warn',text:'[WEAK] Score: 22/100 — common password'},
    {cls:'good',text:'[TIP]  Use 16+ chars with mixed types'},
    {cls:'cmd',text:'$ cyberbot --scan-url http://1.2.3.4/login'},
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
    if (!CONFIG.backendOk) {
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

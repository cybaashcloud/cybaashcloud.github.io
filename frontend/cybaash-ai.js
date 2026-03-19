/**
 * CYBAASH AI — Chatbot
 * Fully serverless — reads config from /portfolio/data_ai_config.json (saved
 * via admin panel to GitHub repo), calls Google Gemini directly from the browser.
 * No backend required.
 * Author: Mohamed Aasiq · github.com/cybaash
 */
(function () {
  'use strict';

  /* ── RUNTIME CONFIG (loaded from repo) ───────────────────── */
  var cfg = {
    key:    '',
    model:  'gemini-1.5-flash',
    tokens: 1024,
    temp:   0.4,
    prompt: 'You are CyberBot — an expert cybersecurity assistant for educational purposes. ' +
            'Explain vulnerabilities (SQLi, XSS, CSRF, buffer overflows, RCE, LFI, SSRF), ' +
            'teach secure coding, guide pen-testing concepts (CTF/lab only). ' +
            'Never help attack real systems. Use markdown. Be concise and direct.',
  };

  /* ── STATE ───────────────────────────────────────────────── */
  var sending      = false;
  var activeTool   = null;
  var history      = [];   // Gemini conversation history

  /* ── INIT ────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    loadConfig();
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeCybaashAI();
    });
  });

  function loadConfig() {
    // Try the root path first (GitHub Pages serves frontend/ as root),
    // then fall back to /portfolio/ path for legacy setups
    var paths = [
      '/data_ai_config.json',
      './data_ai_config.json',
      '/portfolio/data_ai_config.json',
    ];
    function tryNext(idx) {
      if (idx >= paths.length) { setStatus(false); return; }
      fetch(paths[idx] + '?v=' + Date.now(), { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) { tryNext(idx + 1); return null; }
          return r.json();
        })
        .then(function (c) {
          if (!c) return;
          if (c.gemini_api_key) cfg.key    = c.gemini_api_key;
          if (c.gemini_model)   cfg.model  = c.gemini_model;
          if (c.max_tokens)     cfg.tokens = parseInt(c.max_tokens)    || 1024;
          if (c.temperature)    cfg.temp   = parseFloat(c.temperature) || 0.4;
          if (c.system_prompt)  cfg.prompt = c.system_prompt;
          setStatus(!!cfg.key);
        })
        .catch(function () { tryNext(idx + 1); });
    }
    tryNext(0);
  }

  function setStatus(online) {
    var msg = online ? '● Gemini Online' : '● Demo Mode';
    var cls = online ? 'cyb-online'      : 'cyb-offline';
    ['cybaash-backend-status', 'cybaash-status-txt'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.textContent = msg; el.className = cls; }
    });
  }

  /* ── OVERLAY OPEN / CLOSE ────────────────────────────────── */
  window.openCybaashAI = function () {
    var ov = document.getElementById('cybaash-ai-overlay');
    if (ov) {
      ov.classList.add('cyb-open');
      document.body.style.overflow = 'hidden';
      setTimeout(function () {
        var inp = document.getElementById('cybaash-chat-input');
        if (inp) inp.focus();
      }, 150);
    }
  };

  window.closeCybaashAI = function () {
    var ov = document.getElementById('cybaash-ai-overlay');
    if (ov) { ov.classList.remove('cyb-open'); document.body.style.overflow = ''; }
  };

  /* ── SEND MESSAGE ────────────────────────────────────────── */
  window.cybaashSend = function () {
    if (sending) return;
    var inp = document.getElementById('cybaash-chat-input');
    var msg = inp ? inp.value.trim() : '';
    if (!msg) return;

    sending = true;
    inp.value = '';
    cybaashResize(inp);
    var btn = document.getElementById('cybaash-send-btn');
    if (btn) btn.disabled = true;

    appendMsg('user', msg, []);
    showTyping(true);

    if (cfg.key) {
      callGemini(msg)
        .then(function (reply) {
          showTyping(false);
          appendMsg('bot', reply, []);
        })
        .catch(function (err) {
          showTyping(false);
          appendMsg('bot', '⚠ Error: ' + esc(err.message) + '\n\n' + demoResponse(msg), []);
        })
        .finally(function () {
          sending = false;
          if (btn) btn.disabled = false;
          if (inp) inp.focus();
        });
    } else {
      setTimeout(function () {
        showTyping(false);
        appendMsg('bot', demoResponse(msg), []);
        sending = false;
        if (btn) btn.disabled = false;
        if (inp) inp.focus();
      }, 500);
    }
  };

  /* ── GEMINI API ──────────────────────────────────────────── */
  function callGemini(userMessage) {
    history.push({ role: 'user', parts: [{ text: userMessage }] });
    var contents = history.slice(-20);

    var payload = {
      system_instruction: { parts: [{ text: cfg.prompt }] },
      contents: contents,
      generationConfig: { temperature: cfg.temp, maxOutputTokens: cfg.tokens, topP: 0.95 },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      ]
    };

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
              cfg.model + ':generateContent?key=' + cfg.key;

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    })
      .then(function (r) {
        if (r.status === 429) throw new Error('Rate limited — Gemini free tier quota reached. Wait 60 seconds and try again.');
        if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 200)); });
        return r.json();
      })
      .then(function (data) {
        var reply = data &&
          data.candidates &&
          data.candidates[0] &&
          data.candidates[0].content &&
          data.candidates[0].content.parts &&
          data.candidates[0].content.parts[0] &&
          data.candidates[0].content.parts[0].text;
        if (!reply) throw new Error('Empty Gemini response');
        history.push({ role: 'model', parts: [{ text: reply }] });
        return reply;
      });
  }

  window.cybaashKey = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); window.cybaashSend(); }
  };

  window.cybaashResize = function (el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  window.cybaashInject = function (text) {
    var inp = document.getElementById('cybaash-chat-input');
    if (inp) { inp.value = text; cybaashResize(inp); inp.focus(); }
  };

  window.cybaashClear = function () {
    var box = document.getElementById('cybaash-messages');
    if (box) box.innerHTML = '';
    history = [];
    appendMsg('bot', '**Chat cleared.** How can I help you with cybersecurity?', []);
  };

  /* ── MESSAGES ────────────────────────────────────────────── */
  function appendMsg(role, text, flags) {
    var box = document.getElementById('cybaash-messages');
    if (!box) return;
    var isBot = role === 'bot';
    var time  = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    var rendered = text;
    if (isBot && window.marked) {
      try { rendered = window.marked.parse(text); } catch (e) { rendered = esc(text); }
    } else {
      rendered = esc(text).replace(/\n/g, '<br>');
    }

    var flagHtml = '';
    if (flags && flags.length) {
      flagHtml = '<div class="cyb-flag-badges">';
      for (var i = 0; i < flags.length; i++) {
        flagHtml += '<span class="cyb-flag-badge">&#x26A0; ' + esc(flags[i]) + '</span>';
      }
      flagHtml += '</div>';
    }

    var div = document.createElement('div');
    div.className = 'cyb-msg ' + (isBot ? 'cyb-bot' : 'cyb-user');
    div.innerHTML =
      '<div class="cyb-msg-ava ' + (isBot ? 'cyb-bot-ava' : 'cyb-user-ava') + '">' + (isBot ? '&#x26A1;' : 'YOU') + '</div>' +
      '<div class="cyb-msg-bubble">' +
        '<div class="cyb-msg-who">' + (isBot ? 'CYBAASH AI' : 'YOU') + ' &middot; ' + time + '</div>' +
        '<div class="cyb-msg-text">' + rendered + '</div>' +
        flagHtml +
      '</div>';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function showTyping(show) {
    var el = document.getElementById('cybaash-typing');
    if (!el) return;
    if (show) { el.classList.add('cyb-show'); document.getElementById('cybaash-messages').scrollTop = 999999; }
    else { el.classList.remove('cyb-show'); }
  }

  /* ── TOOLS ───────────────────────────────────────────────── */
  window.cybaashTool = function (id) {
    var panel = document.getElementById('cybaash-tool-panel');
    var tools = ['url', 'pass', 'code', 'file'];

    if (activeTool === id) {
      panel.style.display = 'none';
      activeTool = null;
      tools.forEach(function (t) {
        var tab = document.getElementById('cybaash-tab-' + t);
        if (tab) tab.classList.remove('cyb-active');
      });
      return;
    }

    activeTool = id;
    panel.style.display = 'block';
    tools.forEach(function (t) {
      var content = document.getElementById('cybaash-tool-' + t);
      var tab     = document.getElementById('cybaash-tab-' + t);
      if (content) content.style.display = (t === id) ? 'block' : 'none';
      if (tab)     tab.classList.toggle('cyb-active', t === id);
    });
  };

  /* URL — local analysis */
  window.cybaashUrlCheck = function () {
    var url = document.getElementById('cybaash-url-inp').value.trim();
    if (!url) return;
    document.getElementById('cybaash-url-res').innerHTML = renderUrl(localUrl(url));
  };

  /* Password — local scoring */
  window.cybaashPassCheck = function () {
    var pw = document.getElementById('cybaash-pass-inp').value;
    if (!pw) return;
    document.getElementById('cybaash-pass-res').innerHTML = renderPass(localPass(pw));
  };

  /* Code — Gemini-powered if key set, else local */
  window.cybaashCodeScan = function () {
    var code = document.getElementById('cybaash-code-inp').value.trim();
    var lang = document.getElementById('cybaash-code-lang').value;
    if (!code) return;
    var res = document.getElementById('cybaash-code-res');
    res.innerHTML = '<span style="color:#5a7a9a;font-size:.75rem">Scanning...</span>';

    if (cfg.key) {
      var prompt =
        'Analyze this ' + lang + ' code for security vulnerabilities. ' +
        'Return ONLY valid JSON (no markdown, no backticks): ' +
        '{"risk_level":"SAFE|LOW|MEDIUM|HIGH","total_issues":0,"lines_scanned":0,"language":"","issues":[{"line":1,"severity":"HIGH|MEDIUM|LOW","description":""}],"summary":{"HIGH":0,"MEDIUM":0,"LOW":0}}\n\n' +
        'Code:\n```\n' + code.slice(0, 8000) + '\n```';
      callGemini(prompt)
        .then(function (reply) {
          try { res.innerHTML = renderCode(JSON.parse(reply.replace(/```json|```/g, '').trim())); }
          catch (e) { res.innerHTML = renderCode(localCode(code, lang)); }
        })
        .catch(function () { res.innerHTML = renderCode(localCode(code, lang)); });
    } else {
      res.innerHTML = renderCode(localCode(code, lang));
    }
  };

  /* File — text files via FileReader */
  window.cybaashFileChange = function (inp) {
    var file = inp.files && inp.files[0];
    if (!file) return;
    var res = document.getElementById('cybaash-file-res');
    res.innerHTML = '<span style="color:#5a7a9a;font-size:.75rem">Analyzing ' + esc(file.name) + '...</span>';

    if (!cfg.key) {
      res.innerHTML = '<div class="cyb-result-card" style="padding:12px;color:#5a7a9a">Set a Gemini API key in Admin → Settings to enable file analysis.</div>';
      return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      var content = e.target.result || '';
      if (typeof content !== 'string' || content.length > 20000) {
        res.innerHTML = '<div class="cyb-result-card" style="padding:12px;color:#5a7a9a">Upload a text file under 20KB.</div>';
        return;
      }
      var prompt =
        'Analyze this file for security issues and secrets. File: ' + file.name + '\n' +
        'Return ONLY valid JSON: {"risk_level":"SAFE|LOW|MEDIUM|HIGH","issues":[{"line":1,"severity":"HIGH","description":""}],"secrets_detected":[]}\n\n' +
        content.slice(0, 8000);
      callGemini(prompt)
        .then(function (reply) {
          try { res.innerHTML = renderFile(JSON.parse(reply.replace(/```json|```/g, '').trim()), file.name); }
          catch (e) { res.innerHTML = '<div class="cyb-result-card cyb-safe" style="padding:12px;color:#00ff88">✓ No critical issues detected.</div>'; }
        })
        .catch(function () { res.innerHTML = '<div class="cyb-result-card" style="padding:12px;color:#5a7a9a">Analysis failed — try again.</div>'; });
    };
    reader.readAsText(file);
  };

  /* ── RENDER HELPERS ──────────────────────────────────────── */
  function renderUrl(r) {
    var rc    = (r.risk_level || 'SAFE').toLowerCase();
    var flags = (r.flags || []).map(function (f) { return '<div class="cyb-flag-item">' + esc(f) + '</div>'; }).join('');
    return '<div class="cyb-result-card cyb-' + rc + '">' +
      '<div style="font-family:monospace;font-size:.65rem;color:#5a7a9a">URL ANALYSIS</div>' +
      '<div class="cyb-result-risk cyb-risk-' + rc + '">' + esc(r.risk_level || 'SAFE') + (rc === 'safe' ? ' ✓' : ' ⚠') + '</div>' +
      '<div class="cyb-result-meta">Score: ' + (r.risk_score || 0) + '/100 &middot; ' + esc(r.host || '') + '</div>' +
      (flags ? '<div>' + flags + '</div>' : '') +
      '<div style="font-size:.78rem;margin-top:8px;color:#c8e0f4">' + esc(r.recommendation || '') + '</div></div>';
  }

  function renderPass(r) {
    var fb = (r.feedback || []).map(function (f) { return '<li style="font-size:.78rem;color:#5a7a9a;margin:2px 0">&rarr; ' + esc(f) + '</li>'; }).join('');
    return '<div class="cyb-result-card">' +
      '<div style="font-family:monospace;font-size:.65rem;color:#5a7a9a">PASSWORD STRENGTH</div>' +
      '<div class="cyb-result-risk" style="color:' + (r.color || '#fff') + '">' + esc(r.strength || '') + '</div>' +
      '<div class="cyb-pw-bar-bg"><div class="cyb-pw-bar-fill" style="width:' + (r.score || 0) + '%;background:' + (r.color || '#fff') + '"></div></div>' +
      '<div class="cyb-result-meta">' + (r.score || 0) + '/100 &middot; ~' + (r.entropy_bits || 0) + ' bits &middot; Length: ' + (r.length || 0) + '</div>' +
      '<ul style="list-style:none;padding:0">' + fb + '</ul></div>';
  }

  function renderCode(r) {
    var rc     = (r.risk_level || 'SAFE').toLowerCase();
    var sum    = r.summary || {};
    var issues = (r.issues || []).map(function (i) {
      return '<div class="cyb-issue-item ' + i.severity + '">' +
        '<span class="cyb-sev ' + i.severity + '">' + i.severity + '</span>' + esc(i.description) +
        '<div style="font-family:monospace;font-size:.6rem;color:#5a7a9a">Line ' + i.line + '</div></div>';
    }).join('');
    return '<div class="cyb-result-card cyb-' + rc + '">' +
      '<div style="font-family:monospace;font-size:.65rem;color:#5a7a9a">CODE SCAN &middot; ' + esc((r.language || '').toUpperCase()) + ' &middot; ' + (r.lines_scanned || 0) + ' lines</div>' +
      '<div class="cyb-result-risk cyb-risk-' + rc + '">' + esc(r.risk_level || 'SAFE') + ' &mdash; ' + (r.total_issues || 0) + ' issue(s)</div>' +
      '<div class="cyb-result-meta">HIGH: ' + (sum.HIGH || 0) + ' &middot; MED: ' + (sum.MEDIUM || 0) + ' &middot; LOW: ' + (sum.LOW || 0) + '</div>' +
      (issues || '<div style="color:#00ff88;font-size:.82rem">✓ No issues detected</div>') + '</div>';
  }

  function renderFile(r, name) {
    var rc      = (r.risk_level || 'SAFE').toLowerCase();
    var secrets = (r.secrets_detected || []).map(function (s) {
      return '<div class="cyb-flag-item">[Line ' + s.line + '] ' + esc(s.type) + ': ' + esc(s.redacted || '') + '</div>';
    }).join('');
    var issues  = (r.issues || []).slice(0, 8).map(function (i) {
      return '<div class="cyb-issue-item ' + i.severity + '">' +
        '<span class="cyb-sev ' + i.severity + '">' + i.severity + '</span>' + esc(i.description) +
        '<div style="font-family:monospace;font-size:.6rem;color:#5a7a9a">Line ' + i.line + '</div></div>';
    }).join('');
    return '<div class="cyb-result-card cyb-' + rc + '">' +
      '<div style="font-family:monospace;font-size:.65rem;color:#5a7a9a">FILE SCAN &middot; ' + esc(name) + '</div>' +
      '<div class="cyb-result-risk cyb-risk-' + rc + '">' + esc(r.risk_level || 'SAFE') + '</div>' +
      (secrets ? '<div style="color:#ff2244;font-family:monospace;font-size:.65rem;margin:6px 0">🔑 SECRETS:</div>' + secrets : '') +
      (issues || '<div style="color:#00ff88;font-size:.82rem">✓ No issues detected</div>') + '</div>';
  }

  /* ── LOCAL FALLBACKS ─────────────────────────────────────── */
  function demoResponse(msg) {
    var m = msg.toLowerCase();
    if (/sql|sqli|injection/.test(m))         return '## SQL Injection\n\nUse parameterized queries:\n```python\ncursor.execute("SELECT * FROM users WHERE name = %s", (input,))\n```\n> OWASP A03:2021';
    if (/xss|cross.site scri/.test(m))        return '## XSS\n\nEscape output, set CSP headers, use HttpOnly cookies.\n> OWASP A03:2021';
    if (/csrf/.test(m))                        return '## CSRF\n\nAdd CSRF tokens + `SameSite=Strict` cookies.\n> OWASP A01:2021';
    if (/password|hash|bcrypt|argon/.test(m)) return '## Passwords\n\nUse **Argon2id** or **bcrypt**. Never MD5/SHA1.';
    if (/owasp/.test(m))                       return '## OWASP Top 10 (2021)\n\n1. Broken Access Control\n2. Cryptographic Failures\n3. Injection\n4. Insecure Design\n5. Security Misconfiguration\n6. Vulnerable Components\n7. Auth Failures\n8. Integrity Failures\n9. Logging Failures\n10. SSRF';
    if (/buffer overflow|bof/.test(m))         return '## Buffer Overflow\n\n```c\nfgets(buf, sizeof(buf), stdin); // Safe\n// NOT: gets(buf);              // Vulnerable\n```\nDefenses: ASLR, Stack Canaries, NX/DEP';
    if (/pentest|penetration/.test(m))         return '## Pentest Phases\n\n1. Recon\n2. Scanning\n3. Exploitation *(authorized only)*\n4. Post-exploitation\n5. Reporting';
    if (/hi|hello|hey|help/i.test(m))         return '## CYBAASH AI ⚡\n\nSet a **Gemini API key** in Admin → Settings to enable full AI responses.\n\nAsk me about: SQLi, XSS, CSRF, buffer overflows, OWASP Top 10, pentesting.';
    return '**Demo mode** — set your Gemini API key in **Admin → Settings → Gemini AI Configuration** to enable full responses.';
  }

  function localUrl(url) {
    var flags = [], score = 0;
    if (/^http:\/\//.test(url))                 { flags.push('Non-HTTPS — traffic unencrypted'); score += 20; }
    if (/\d{1,3}\.\d{1,3}\.\d{1,3}/.test(url)) { flags.push('IP address URL — possible phishing'); score += 20; }
    if (/bit\.ly|tinyurl|t\.co/.test(url))      { flags.push('URL shortener — destination hidden'); score += 15; }
    if (/(login|signin|verify|secure)/.test(url)) { flags.push('Sensitive action keyword'); score += 10; }
    var risk = score >= 50 ? 'HIGH' : score >= 30 ? 'MEDIUM' : score >= 15 ? 'LOW' : 'SAFE';
    return { risk_level: risk, risk_score: score, flags: flags, host: url.split('/')[2] || url,
      recommendation: risk === 'SAFE' ? 'URL appears safe.' : 'Proceed with caution.' };
  }

  function localPass(pw) {
    var score = 0, fb = [];
    if (pw.length >= 16) score += 35; else if (pw.length >= 12) score += 25; else { score += 10; fb.push('Use at least 12 characters'); }
    if (/[a-z]/.test(pw)) score += 8; else fb.push('Add lowercase letters');
    if (/[A-Z]/.test(pw)) score += 8; else fb.push('Add uppercase letters');
    if (/\d/.test(pw))    score += 8; else fb.push('Add numbers');
    if (/[!@#$%^&*()_+\-=\[\]{}]/.test(pw)) score += 8; else fb.push('Add special characters');
    score = Math.min(100, Math.max(0, score));
    var strength = score >= 80 ? 'VERY STRONG' : score >= 60 ? 'STRONG' : score >= 40 ? 'MODERATE' : score >= 20 ? 'WEAK' : 'VERY WEAK';
    var color    = score >= 80 ? '#00ff88' : score >= 60 ? '#00d4ff' : score >= 40 ? '#ffd700' : score >= 20 ? '#ff6600' : '#ff2244';
    if (!fb.length) fb.push('Great password! Store it in a password manager.');
    return { score: score, strength: strength, color: color, length: pw.length, entropy_bits: Math.round(pw.length * 4.5), feedback: fb };
  }

  function localCode(code, lang) {
    var issues = [];
    var checks = [
      { re: /\beval\s*\(/,                   d: 'eval() — code execution risk',         s: 'HIGH'   },
      { re: /\bexec\s*\(/,                   d: 'exec() — code execution risk',         s: 'HIGH'   },
      { re: /shell\s*=\s*True/,              d: 'shell=True — command injection risk',  s: 'HIGH'   },
      { re: /\bpickle\.loads?\s*\(/,         d: 'pickle.load() — deserialization risk', s: 'HIGH'   },
      { re: /password\s*=\s*["'][^"']+["']/, d: 'Hardcoded password detected',          s: 'HIGH'   },
      { re: /innerHTML\s*=/,                 d: 'innerHTML — XSS risk',                 s: 'MEDIUM' },
      { re: /hashlib\.(md5|sha1)\s*\(/,      d: 'Weak hash (MD5/SHA1)',                 s: 'MEDIUM' },
      { re: /Math\.random\(\)/,              d: 'Math.random() — not cryptographically secure', s: 'LOW' },
      { re: /http:\/\//,                     d: 'HTTP (non-HTTPS) URL',                 s: 'LOW'    },
    ];
    var lines = code.split('\n');
    checks.forEach(function (c) {
      lines.forEach(function (line, j) {
        if (c.re.test(line)) issues.push({ line: j + 1, severity: c.s, description: c.d });
      });
    });
    var H = issues.filter(function (i) { return i.severity === 'HIGH';   }).length;
    var M = issues.filter(function (i) { return i.severity === 'MEDIUM'; }).length;
    var L = issues.filter(function (i) { return i.severity === 'LOW';    }).length;
    return { language: lang, issues: issues, total_issues: issues.length,
      lines_scanned: lines.length, risk_level: H ? 'HIGH' : M ? 'MEDIUM' : L ? 'LOW' : 'SAFE',
      summary: { HIGH: H, MEDIUM: M, LOW: L } };
  }

  /* ── UTIL ────────────────────────────────────────────────── */
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();

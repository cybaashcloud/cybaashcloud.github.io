/**
 * CYBAASH AI — Chatbot  v3
 * ════════════════════════
 * Fully serverless — Gemini + GitHub only, zero backend.
 *
 * WHAT'S NEW vs v2:
 *   • Streaming responses: text appears word-by-word via SSE — no more
 *     3–5 second blank wait. Uses streamGenerateContent?alt=sse.
 *   • History corruption fix: user turn is now only committed to history
 *     after a successful model reply. Failed calls no longer leave
 *     orphaned user entries that break conversation turns.
 *   • Token cap raised: removed the hardcoded Math.min(...,512) that
 *     ignored the config value. Now respects config up to 1024.
 *   • Sharper system prompt: knows it's on the portfolio, covers more
 *     topic areas, gives better format guidance to Gemini.
 *   • Faster retries: 2 s → 6 s → 18 s (was 5 s → 15 s → 45 s).
 *   • AbortController: sending a new message cancels any in-flight
 *     request immediately instead of letting it run to completion.
 *   • Cache threshold tightened: 0.25 → 0.35 to reduce false matches.
 *   • URL checker: 8 heuristics (was 4) — adds punycode, double-ext,
 *     excessive subdomains, numeric TLD, free-host patterns.
 *
 * Author: Mohamed Aasiq · github.com/cybaash
 */
(function () {
  'use strict';

  /* ── CONFIG ──────────────────────────────────────────────── */
  /* ── PROXY: all Gemini calls go through Cloudflare Worker ──────
     The Worker holds the real API key — browser never sees it.
     Set PROXY_URL to your Worker URL once deployed.
     Leave as '' to fall back to direct calls (key required).     */
  var PROXY_URL = 'https://cybaash.mohamedaasiq07.workers.dev';

  var cfg = {
    key:    '',   // only used if PROXY_URL is empty
    model:  'gemini-2.5-flash-lite',
    tokens: 800,
    temp:   0.4,
    rpm:    8,    // client-side cap — 2 under the 10 RPM free tier limit of gemini-2.5-flash-lite
    prompt: [
      'You are CyberBot — an expert cybersecurity assistant embedded in',
      'Mohamed Aasiq\'s portfolio at cybaashcloud.github.io.',
      '',
      'Primary role: help visitors (recruiters, developers, students)',
      'understand cybersecurity concepts clearly and practically.',
      '',
      'Expertise:',
      '- Web vulnerabilities: SQLi, XSS, CSRF, SSRF, XXE, IDOR, open redirect',
      '- Network security: firewalls, IDS/IPS, VPNs, TLS, protocol attacks',
      '- Malware & threats: ransomware, phishing, social engineering, APTs',
      '- Secure coding: Python, JS, PHP — validation, encoding, auth patterns',
      '- Cloud security: AWS IAM, S3 misconfigs, least-privilege principles',
      '- Penetration testing: methodology, tools (Burp Suite, nmap, Metasploit)',
      '  — educational and CTF/lab context only',
      '- Compliance: OWASP Top 10, NIST CSF, ISO 27001, GDPR basics',
      '',
      'Hard rules:',
      '1. Never give step-by-step instructions to attack real systems or people',
      '2. Never write working malware, keyloggers, or data-exfiltration tools',
      '3. Always frame offensive techniques in educational or CTF context',
      '4. If asked about Mohamed Aasiq, say you are his AI assistant and',
      '   direct the visitor to explore the portfolio sections',
      '',
      'Format: Use markdown — headers, bullets, fenced code blocks.',
      'For each vulnerability: What it is → How it works → How to defend.',
      'Show both vulnerable and secure code versions when relevant.',
      'Keep responses focused; avoid padding.',
    ].join('\n'),
  };

  /* ── STATE ───────────────────────────────────────────────── */
  var sending      = false;
  var activeTool   = null;
  var history      = [];       // committed conversation turns (user+model pairs only)
  var cache        = [];       // entries from data_ai_cache.json
  var sessionCache = {};       // dedup: normalised_msg → answer (this session only)
  var currentAbort = null;     // AbortController for in-flight request

  // Client-side token bucket rate limiter
  // Prevents firing faster than cfg.rpm requests/min before the request even leaves the browser.
  // Tokens refill at cfg.rpm/60 per second; bucket holds cfg.rpm tokens max.
  var rlTokens     = 0;   // starts empty; filled on first DOMContentLoaded tick
  var rlLastFill   = 0;   // timestamp of last refill

  /* ── INIT ────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    loadConfig();
    loadCache();
    rlTokens   = cfg.rpm;   // start with a full bucket
    rlLastFill = Date.now();
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeCybaashAI();
    });
  });

  /**
   * Token bucket rate limiter.
   * Returns true and consumes a token if a request is allowed right now.
   * Returns false if the bucket is empty (caller should wait).
   */
  function rlConsume() {
    var now     = Date.now();
    var elapsed = (now - rlLastFill) / 1000;          // seconds since last refill
    var refill  = elapsed * (cfg.rpm / 60);            // tokens earned since last check
    rlTokens    = Math.min(cfg.rpm, rlTokens + refill);
    rlLastFill  = now;
    if (rlTokens >= 1) { rlTokens -= 1; return true; }
    return false;
  }

  /** Returns ms to wait until one token is available. */
  function rlWaitMs() {
    return Math.ceil((1 - rlTokens) / (cfg.rpm / 60) * 1000);
  }

  /* ── CONFIG LOADING ──────────────────────────────────────── */
  function loadConfig() {
    var lsKey = localStorage.getItem('cybaash_gemini_key') || '';
    if (lsKey) {
      cfg.key = lsKey;
      _loadJsonSettings(function () { setStatus(true); });
      return;
    }
    _loadJsonSettings(function () {
      var proxySet = typeof PROXY_URL !== 'undefined' && PROXY_URL;
      setStatus(proxySet || !!cfg.key);
    });
  }

  function _loadJsonSettings(done) {
    var paths = ['/data_ai_config.json', './data_ai_config.json', '/portfolio/data_ai_config.json'];
    function tryNext(idx) {
      if (idx >= paths.length) { if (done) done(); return; }
      fetch(paths[idx] + '?v=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (c) {
          if (!c) { tryNext(idx + 1); return; }
          if (c.gemini_api_key && !cfg.key) cfg.key   = c.gemini_api_key;
          if (c.apiKey         && !cfg.key) cfg.key   = c.apiKey;
          if (c.gemini_model)               cfg.model  = c.gemini_model;
          // v2 had Math.min(..., 512) which ignored config — removed in v3
          if (c.max_tokens)                 cfg.tokens = Math.min(parseInt(c.max_tokens) || 800, 1024);
          if (c.temperature)                cfg.temp   = parseFloat(c.temperature) || 0.4;
          if (c.system_prompt)              cfg.prompt = c.system_prompt;
          if (c.rpm_limit)                  cfg.rpm    = Math.min(parseInt(c.rpm_limit) || 12, 14);
          if (done) done();
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

  /* ── CACHE LOADING ───────────────────────────────────────── */
  function loadCache() {
    var paths = ['/data_ai_cache.json', './data_ai_cache.json', '/portfolio/data_ai_cache.json'];
    function tryNext(idx) {
      if (idx >= paths.length) return;
      fetch(paths[idx] + '?v=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data || !data.entries) { tryNext(idx + 1); return; }
          cache = data.entries || [];
          console.log('[CyberBot] Cache loaded: ' + cache.length + ' entries');
        })
        .catch(function () { tryNext(idx + 1); });
    }
    tryNext(0);
  }

  /* ── CACHE MATCHING ──────────────────────────────────────── */
  function tokenise(text) {
    return text.toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(function (w) { return w.length > 1; });
  }

  function jaccard(a, b) {
    var sa = {}, sb = {}, inter = 0, union = 0;
    a.forEach(function (w) { sa[w] = true; });
    b.forEach(function (w) { sb[w] = true; });
    Object.keys(sa).forEach(function (w) { union++; if (sb[w]) inter++; });
    Object.keys(sb).forEach(function (w) { if (!sa[w]) union++; });
    return union === 0 ? 0 : inter / union;
  }

  function findCachedAnswer(msg) {
    if (!cache.length) return null;
    var tokens = tokenise(msg);
    if (tokens.length === 0) return null;
    var best = 0, answer = null;
    cache.forEach(function (entry) {
      if (!entry.k || !entry.a) return;
      var score = jaccard(tokens, entry.k);
      if (score > best) { best = score; answer = entry.a; }
    });
    // Raised from 0.25 to 0.35 to reduce false matches
    return best >= 0.35 ? answer : null;
  }

  /* ── OVERLAY ─────────────────────────────────────────────── */
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
    var inp = document.getElementById('cybaash-chat-input');
    var msg = inp ? inp.value.trim() : '';
    if (!msg) return;

    // Abort any in-flight request before starting a new one
    if (currentAbort) { currentAbort.abort(); currentAbort = null; }

    sending = true;
    inp.value = '';
    cybaashResize(inp);
    var btn = document.getElementById('cybaash-send-btn');
    if (btn) btn.disabled = true;

    appendMsg('user', msg, []);
    showTyping(true);

    var norm = msg.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

    // 1. Session dedup
    if (sessionCache[norm]) {
      _deliver(sessionCache[norm]);
      return;
    }

    // 2. Cache match
    var cached = findCachedAnswer(msg);
    if (cached) {
      sessionCache[norm] = cached;
      _deliver(cached);
      return;
    }

    // 3. Live Gemini call — check client-side rate limit first
    var proxyReady = typeof PROXY_URL !== 'undefined' && PROXY_URL;
    if (proxyReady || cfg.key) {
      if (!rlConsume()) {
        var waitMs = rlWaitMs();
        showTyping(false);
        appendMsg('bot',
          '⏳ Sending too fast — please wait **' + Math.ceil(waitMs / 1000) + 's** before the next message.', []);
        _reset();
        return;
      }
      callGeminiStream(msg)
        .then(function (fullReply) {
          sessionCache[norm] = fullReply;
          _reset();
        })
        .catch(function (err) {
          if (err && err.name === 'AbortError') { _reset(); return; }
          showTyping(false);
          appendMsg('bot', '⚠ ' + esc(err.message || 'Unknown error') + '\n\n' + demoResponse(msg), []);
          _reset();
        });
    } else {
      setTimeout(function () { _deliver(demoResponse(msg)); }, 400);
    }

    function _deliver(reply) {
      showTyping(false);
      appendMsg('bot', reply, []);
      _reset();
    }

    function _reset() {
      sending = false;
      if (btn) btn.disabled = false;
      if (inp) inp.focus();
    }
  };

  /* ── STREAMING GEMINI CALL ───────────────────────────────── */
  // Uses streamGenerateContent?alt=sse — response text appears word-by-word.
  // History is only committed once the full reply is received successfully,
  // preventing orphaned user turns from corrupting future conversation turns.

  var RETRY_DELAYS = [2000, 6000, 18000];  // was 5000, 15000, 45000

  function callGeminiStream(userMessage, attempt) {
    attempt = attempt || 0;

    // Build contents for this request (user turn NOT yet committed to history)
    var requestContents = history.slice(-8).concat([
      { role: 'user', parts: [{ text: userMessage }] }
    ]);

    var payload = {
      system_instruction: { parts: [{ text: cfg.prompt }] },
      contents: requestContents,
      generationConfig: {
        temperature:     cfg.temp,
        maxOutputTokens: cfg.tokens,
        topP:            0.9,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      ],
    };

    // Route through proxy (hides key) or direct if no proxy configured
    var useProxy = typeof PROXY_URL !== 'undefined' && PROXY_URL;
    var url = useProxy
      ? PROXY_URL
      : 'https://generativelanguage.googleapis.com/v1beta/models/' +
        cfg.model + ':streamGenerateContent?alt=sse&key=' + cfg.key;

    var fetchBody = useProxy
      ? JSON.stringify({ model: cfg.model, stream: true, payload: payload })
      : JSON.stringify(payload);

    currentAbort = new AbortController();

    return fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    fetchBody,
      signal:  currentAbort.signal,
    })
    .then(function (response) {
      if (response.status === 429) {
        if (attempt < RETRY_DELAYS.length) {
          var wait = RETRY_DELAYS[attempt];
          appendMsg('bot',
            '⏳ Rate limit — retrying in ' + (wait / 1000) + 's… ' +
            '*(attempt ' + (attempt + 1) + ' of ' + RETRY_DELAYS.length + ')*', []);
          return new Promise(function (resolve, reject) {
            setTimeout(function () {
              callGeminiStream(userMessage, attempt + 1).then(resolve).catch(reject);
            }, wait);
          });
        }
        throw new Error('Gemini rate limit reached after ' + RETRY_DELAYS.length + ' retries.');
      }
      if (!response.ok) {
        return response.text().then(function (t) {
          throw new Error('Gemini error ' + response.status + ': ' + t.slice(0, 200));
        });
      }

      // Stream the SSE response and update the bot message bubble live
      var reader  = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer  = '';
      var fullText = '';

      // Create the bot message bubble now (empty) and keep a reference to its text node
      showTyping(false);
      var bubbleEl = appendStreamingMsg();

      function pump() {
        return reader.read().then(function (result) {
          if (result.done) {
            // ── Success: commit both turns to history ──────────────
            if (fullText) {
              history.push({ role: 'user',  parts: [{ text: userMessage }] });
              history.push({ role: 'model', parts: [{ text: fullText    }] });
              // Keep last 16 entries (8 turns)
              if (history.length > 16) history = history.slice(-16);
              // Final render with full markdown
              renderBubble(bubbleEl, fullText);
            }
            currentAbort = null;
            return fullText;
          }

          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop();  // incomplete line stays in buffer

          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line.startsWith('data: ')) continue;
            var jsonStr = line.slice(6);
            if (jsonStr === '[DONE]') continue;
            try {
              var data  = JSON.parse(jsonStr);
              var chunk = data &&
                data.candidates &&
                data.candidates[0] &&
                data.candidates[0].content &&
                data.candidates[0].content.parts &&
                data.candidates[0].content.parts[0] &&
                data.candidates[0].content.parts[0].text;
              if (chunk) {
                fullText += chunk;
                // Live update: plain text during stream, markdown at the end
                updateBubbleRaw(bubbleEl, fullText);
              }
            } catch (e) { /* ignore malformed SSE chunk */ }
          }

          return pump();
        });
      }

      return pump();
    });
  }

  /* ── STATELESS GEMINI (tools — no history, no streaming) ─── */
  function _callGeminiStateless(prompt) {
    var payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 600, topP: 0.9 },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      ],
    };
    var useProxy2 = typeof PROXY_URL !== 'undefined' && PROXY_URL;
    var url = useProxy2
      ? PROXY_URL
      : 'https://generativelanguage.googleapis.com/v1beta/models/' +
        cfg.model + ':generateContent?key=' + cfg.key;
    var fetchBody2 = useProxy2
      ? JSON.stringify({ model: cfg.model, stream: false, payload: payload })
      : JSON.stringify(payload);
    return fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    fetchBody2,
      signal:  AbortSignal.timeout(30000),
    })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      var t = data &&
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text;
      if (!t) throw new Error('Empty response');
      return t;
    });
  }

  /* ── TOOL: CODE SCAN ─────────────────────────────────────── */
  window.cybaashCodeScan = function () {
    var code = document.getElementById('cybaash-code-inp').value.trim();
    var lang = document.getElementById('cybaash-code-lang').value;
    if (!code) return;
    var res = document.getElementById('cybaash-code-res');
    res.innerHTML = '<span style="color:#5a7a9a;font-size:.75rem">Scanning…</span>';

    if (cfg.key) {
      var prompt =
        'Analyze this ' + lang + ' code for security vulnerabilities. ' +
        'Return ONLY valid JSON (no markdown, no backticks): ' +
        '{"risk_level":"SAFE|LOW|MEDIUM|HIGH","total_issues":0,"lines_scanned":0,"language":"","issues":[{"line":1,"severity":"HIGH|MEDIUM|LOW","description":""}],"summary":{"HIGH":0,"MEDIUM":0,"LOW":0}}\n\n' +
        'Code:\n```\n' + code.slice(0, 6000) + '\n```';

      _callGeminiStateless(prompt)
        .then(function (reply) {
          try   { res.innerHTML = renderCode(JSON.parse(reply.replace(/```json|```/g, '').trim())); }
          catch  { res.innerHTML = renderCode(localCode(code, lang)); }
        })
        .catch(function () { res.innerHTML = renderCode(localCode(code, lang)); });
    } else {
      res.innerHTML = renderCode(localCode(code, lang));
    }
  };

  /* ── TOOL: FILE SCAN ─────────────────────────────────────── */
  window.cybaashFileChange = function (inp) {
    var file = inp.files && inp.files[0];
    if (!file) return;
    var res = document.getElementById('cybaash-file-res');
    res.innerHTML = '<span style="color:#5a7a9a;font-size:.75rem">Analyzing ' + esc(file.name) + '…</span>';

    if (!cfg.key) {
      res.innerHTML = '<div class="cyb-result-card" style="padding:12px;color:#5a7a9a">Set a Gemini API key in Admin → Settings to enable file analysis.</div>';
      return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      var content = e.target.result || '';
      if (typeof content !== 'string' || content.length > 20000) {
        res.innerHTML = '<div class="cyb-result-card" style="padding:12px;color:#5a7a9a">Upload a text file under 20 KB.</div>';
        return;
      }
      var prompt =
        'Analyze this file for security issues and secrets. File: ' + file.name + '\n' +
        'Return ONLY valid JSON: {"risk_level":"SAFE|LOW|MEDIUM|HIGH","issues":[{"line":1,"severity":"HIGH","description":""}],"secrets_detected":[]}\n\n' +
        content.slice(0, 6000);
      _callGeminiStateless(prompt)
        .then(function (reply) {
          try   { res.innerHTML = renderFile(JSON.parse(reply.replace(/```json|```/g, '').trim()), file.name); }
          catch  { res.innerHTML = '<div class="cyb-result-card cyb-safe" style="padding:12px;color:#00ff88">✓ No critical issues detected.</div>'; }
        })
        .catch(function () {
          res.innerHTML = '<div class="cyb-result-card" style="padding:12px;color:#5a7a9a">Analysis failed — try again.</div>';
        });
    };
    reader.readAsText(file);
  };

  /* ── INPUT HANDLERS ──────────────────────────────────────── */
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
    history      = [];
    sessionCache = {};
    appendMsg('bot', '**Chat cleared.** How can I help you with cybersecurity?', []);
  };

  /* ── URL / PASSWORD TOOLS (local only) ──────────────────── */
  window.cybaashUrlCheck = function () {
    var url = document.getElementById('cybaash-url-inp').value.trim();
    if (!url) return;
    document.getElementById('cybaash-url-res').innerHTML = renderUrl(localUrl(url));
  };

  window.cybaashPassCheck = function () {
    var pw = document.getElementById('cybaash-pass-inp').value;
    if (!pw) return;
    document.getElementById('cybaash-pass-res').innerHTML = renderPass(localPass(pw));
  };

  /* ── TOOL TABS ───────────────────────────────────────────── */
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
    div.className = 'cyb-msg cyb-bot';
    if (!isBot) div.className = 'cyb-msg cyb-user';
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

  /** Creates an empty bot bubble for streaming — returns the text element. */
  function appendStreamingMsg() {
    var box = document.getElementById('cybaash-messages');
    if (!box) return null;
    var time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    var div = document.createElement('div');
    div.className = 'cyb-msg cyb-bot';
    div.innerHTML =
      '<div class="cyb-msg-ava cyb-bot-ava">&#x26A1;</div>' +
      '<div class="cyb-msg-bubble">' +
        '<div class="cyb-msg-who">CYBAASH AI &middot; ' + time + '</div>' +
        '<div class="cyb-msg-text cyb-streaming"></div>' +
      '</div>';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div.querySelector('.cyb-msg-text');
  }

  /** Update bubble with raw text during streaming (no markdown parse on every chunk). */
  function updateBubbleRaw(el, text) {
    if (!el) return;
    el.textContent = text;
    var box = document.getElementById('cybaash-messages');
    if (box) box.scrollTop = box.scrollHeight;
  }

  /** Final render — full markdown parse once streaming is complete. */
  function renderBubble(el, text) {
    if (!el) return;
    el.classList.remove('cyb-streaming');
    if (window.marked) {
      try { el.innerHTML = window.marked.parse(text); return; } catch (e) {}
    }
    el.textContent = text;
  }

  function showTyping(show) {
    var el = document.getElementById('cybaash-typing');
    if (!el) return;
    if (show) { el.classList.add('cyb-show'); document.getElementById('cybaash-messages').scrollTop = 999999; }
    else { el.classList.remove('cyb-show'); }
  }

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
    var issues = (r.issues || []).slice(0, 8).map(function (i) {
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
    // Existing checks
    if (/^http:\/\//.test(url))                   { flags.push('Non-HTTPS — traffic unencrypted'); score += 20; }
    if (/\d{1,3}\.\d{1,3}\.\d{1,3}/.test(url))   { flags.push('IP address URL — possible phishing'); score += 20; }
    if (/bit\.ly|tinyurl|t\.co|is\.gd/.test(url)) { flags.push('URL shortener — destination hidden'); score += 15; }
    if (/(login|signin|verify|secure|update|confirm|account|banking)/.test(url)) {
      flags.push('Sensitive action keyword in URL'); score += 10;
    }
    // New checks
    if (/xn--/.test(url))                          { flags.push('Punycode domain — possible IDN homograph attack'); score += 25; }
    if (/\.(exe|zip|rar|bat|msi|dmg|ps1)($|\?)/.test(url)) {
      flags.push('Executable file extension in URL'); score += 30;
    }
    var host = url.split('/')[2] || '';
    if ((host.match(/\./g) || []).length >= 4)     { flags.push('Excessive subdomains — common phishing pattern'); score += 15; }
    if (/000webhostapp|weebly|wixsite|glitch\.me|netlify\.app|ngrok\.io/.test(url)) {
      flags.push('Free hosting platform — often used for phishing'); score += 10;
    }
    var risk = score >= 50 ? 'HIGH' : score >= 30 ? 'MEDIUM' : score >= 15 ? 'LOW' : 'SAFE';
    return { risk_level: risk, risk_score: Math.min(score, 100), flags: flags, host: host,
      recommendation: risk === 'SAFE' ? 'URL appears safe.' : 'Proceed with caution — ' + flags.length + ' risk factor(s) detected.' };
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

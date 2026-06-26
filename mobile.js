/**
 * CYBAASH  mobile.js  —  single runtime file
 * Hamburger + drawer + tab body classes + all touch fixes
 * Desktop: returns immediately
 */
(function () { 
  'use strict';

  var IS_MOBILE = window.innerWidth <= 768 || ('ontouchstart' in window);
  if (!IS_MOBILE && window.innerWidth > 768) return;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* ── 1. Hamburger + Drawer ───────────────────────────────── */
  ready(function () {
    var header = document.querySelector('.page-index .header');
    if (!header) return;
    if (document.getElementById('cyb-hamburger')) return;

    /* Hamburger */
    var ham = document.createElement('button');
    ham.id = 'cyb-hamburger';
    ham.setAttribute('aria-label', 'Open menu');
    ham.setAttribute('aria-expanded', 'false');
    ham.innerHTML = '<span class="bar"></span><span class="bar"></span><span class="bar"></span>';
    header.appendChild(ham);

    /* Backdrop */
    var bd = document.createElement('div');
    bd.id = 'cyb-backdrop';
    document.body.appendChild(bd);

    /* Drawer — updated navigation */
    var dr = document.createElement('div');
    dr.id = 'cyb-drawer';
    dr.innerHTML =
      '<div id="cyb-drawer-header">' +
        '<div id="cyb-drawer-logo">CY<span>B</span>AASH</div>' +
        '<button id="cyb-drawer-close" aria-label="Close">&#x2715;</button>' +
      '</div>' +

      '<div class="cyb-drawer-section">ACTIONS</div>' +

      '<button class="cyb-drawer-btn green" id="drw-terminal">' +
        '<span class="icon">&#x2328;</span><span class="live-dot"></span>TERMINAL' +
      '</button>' +

      '<button class="cyb-drawer-btn" id="drw-launch">' +
        '<span class="icon">&#x25B6;</span>LAUNCH ATTACK' +
      '</button>' +

      '<button class="cyb-drawer-btn yellow" id="drw-palette">' +
        '<span class="icon">&#x2318;</span>COMMAND PALETTE' +
      '</button>' +

      '<div class="cyb-drawer-section">PAGES</div>' +

      '<a class="cyb-drawer-btn" href="ai/" target="_blank" rel="noopener">' +
        '<span class="icon">&#x2B21;</span>CYBAASH AI' +
      '</a>' +

      '<a class="cyb-drawer-btn red" href="recruiter.html" target="_blank" rel="noopener">' +
        '<span class="icon">&#x25C8;</span>RECRUITER VIEW' +
      '</a>' +

      '<a class="cyb-drawer-btn" href="dashboard.html" target="_blank" rel="noopener">' +
        '<span class="icon">&#x2261;</span>DASHBOARD' +
      '</a>' +

      '<div class="cyb-drawer-section">ADMIN</div>' +

      '<a class="cyb-drawer-btn blue" href="admin/security.html" target="_blank" rel="noopener">' +
        '<span class="icon">&#x26E8;</span>SECURITY' +
      '</a>' +

      '<a class="cyb-drawer-btn blue" href="admin/intel.html" target="_blank" rel="noopener">' +
        '<span class="icon">&#x25CF;</span>INTEL' +
      '</a>' +

      '<a class="cyb-drawer-btn blue" href="admin/tools.html" target="_blank" rel="noopener">' +
        '<span class="icon">&#x2692;</span>TOOLS' +
      '</a>' +

      '<button class="cyb-drawer-btn" id="drw-signin" style="color:var(--blue,#00d4ff);border-top:1px solid rgba(0,212,255,0.15);margin-top:4px">' +
        '<span class="icon">&#x2B21;</span>SIGN IN / ACCOUNT' +
      '</button>' +

      '<div id="cyb-drawer-footer">' +
        '<span class="live-dot"></span>SYSTEMS ONLINE &nbsp; &copy; 2025 CYBAASH' +
      '</div>';

    document.body.appendChild(dr);

    /* Open/Close */
    var isOpen = false;

    function openDrawer() {
      isOpen = true;
      document.body.classList.add('nav-open');
      ham.setAttribute('aria-expanded', 'true');
    }
    function closeDrawer() {
      isOpen = false;
      document.body.classList.remove('nav-open');
      ham.setAttribute('aria-expanded', 'false');
      ham.focus();
    }

    ham.addEventListener('click', function () { isOpen ? closeDrawer() : openDrawer(); });
    bd.addEventListener('click', closeDrawer);
    document.getElementById('cyb-drawer-close').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) closeDrawer(); });
    window.addEventListener('resize', function () { if (window.innerWidth > 768 && isOpen) closeDrawer(); }, { passive: true });

    /* Swipe right to close */
    var sx = 0;
    dr.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    dr.addEventListener('touchend', function (e) { if (e.changedTouches[0].clientX - sx > 72) closeDrawer(); }, { passive: true });

    /* Wire buttons */
    var t = document.getElementById('drw-terminal');
    if (t) t.addEventListener('click', function () {
      closeDrawer();
      // Wait for drawer animation (300ms) + buffer (100ms) before opening terminal
      setTimeout(function () {
        document.body.style.overflow = '';
        if (typeof termToggle !== 'function') return;
        
        // Open terminal WITHOUT triggering keyboard focus
        // We call the raw toggle, then prevent the focus() call
        var el = document.getElementById('termOverlay');
        var btn = document.getElementById('termToggleBtn');
        if (!el) return;
        
        // Check if terminal is already open
        if (el.classList.contains('term-open')) {
          // Just close it
          termToggle();
          return;
        }
        
        // Open terminal manually without focus (avoids keyboard popup)
        if (window.TERM) window.TERM.isOpen = true;
        el.classList.add('term-open');
        if (btn) btn.classList.add('term-active');
        
        // Show send button but DON'T focus input (no keyboard)
        // User can tap the input themselves when ready
      }, 400);
    });

    var la = document.getElementById('drw-launch');
    if (la) la.addEventListener('click', function () { closeDrawer(); setTimeout(function () { if (typeof launchAttack === 'function') launchAttack(); }, 220); });

    var si = document.getElementById('drw-signin');
    if (si) si.addEventListener('click', function () {
      closeDrawer();
      setTimeout(function () {
        if (window.SAAS && typeof window.SAAS.login === 'function') {
          window.SAAS.login();
        } else {
          var overlay = document.getElementById('cybaash-ai-overlay');
          if (overlay) overlay.classList.add('cyb-open');
        }
      }, 220);
    });

    var pal = document.getElementById('drw-palette');
    if (pal) pal.addEventListener('click', function () {
      closeDrawer();
      setTimeout(function () {
        if (typeof openCmdPalette === 'function') { openCmdPalette(); return; }
        var p = document.getElementById('cmdPalette');
        if (p) { p.classList.add('open'); var s = document.getElementById('cmdSearch'); if (s) s.focus(); }
      }, 220);
    });
  });

  /* ── 2. Tab body classes — enables CSS to show/hide panels per tab ── */
  ready(function () {
    /* Set initial class */
    document.body.classList.add('tab-range');

    var orig = window.switchTab;
    if (typeof orig === 'function') {
      window.switchTab = function (id, el) {
        orig.call(this, id, el);

        /* Remove all tab-* classes */
        var classes = Array.from(document.body.classList);
        classes.forEach(function (c) { if (c.startsWith('tab-')) document.body.classList.remove(c); });

        /* Add new tab class */
        var map = {
          range: 'tab-range', decisions: 'tab-decisions',
          scenarios: 'tab-scenarios', graph: 'tab-graph',
          whatif: 'tab-whatif', scoring: 'tab-scoring',
          replay: 'tab-replay', missions: 'tab-missions'
        };
        if (map[id]) document.body.classList.add(map[id]);

        /* Scroll tab into view */
        if (el) requestAnimationFrame(function () {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        });

        /* Scroll page to top so tab content is visible */
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
    }
  });

  /* ── 3. FAB dims on scroll ───────────────────────────────── */
  var st = null;
  window.addEventListener('scroll', function () {
    document.body.classList.add('is-scrolling');
    clearTimeout(st);
    st = setTimeout(function () { document.body.classList.remove('is-scrolling'); }, 800);
  }, { passive: true });

  /* ── 4. iOS 16px zoom fix ────────────────────────────────── */
  ready(function () {
    function fix(el) { if (parseFloat(getComputedStyle(el).fontSize) < 16) el.style.fontSize = '16px'; }
    document.querySelectorAll('input,textarea,select').forEach(fix);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (!n || n.nodeType !== 1) return;
          if (/^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName)) fix(n);
          if (n.querySelectorAll) n.querySelectorAll('input,textarea,select').forEach(fix);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  });

  /* ── 5. body.term-resizing stuck fix ─────────────────────── */
  document.addEventListener('touchend',    function () { document.body.classList.remove('term-resizing'); }, { passive: true });
  document.addEventListener('touchcancel', function () { document.body.classList.remove('term-resizing'); }, { passive: true });

  /* ── 6. Phase bar touch ──────────────────────────────────── */
  ready(function () {
    function patchPhase() {
      document.querySelectorAll('.phase-cell').forEach(function (c) {
        if (c.dataset.tp) return;
        c.dataset.tp = '1';
        c.addEventListener('touchend', function (e) {
          e.preventDefault();
          c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }, { passive: false });
      });
    }
    patchPhase();
    var orig = window.generateScenario;
    if (typeof orig === 'function') {
      window.generateScenario = function () {
        var r = orig.apply(this, arguments); setTimeout(patchPhase, 600); return r;
      };
    }
  });

  /* ── 7. Canvas clamp to viewport ────────────────────────── */
  ready(function () {
    function clamp() {
      var max = window.innerWidth - 24;
      ['kgCanvas','graphCanvas','netCanvas','networkCanvas'].forEach(function (id) {
        var c = document.getElementById(id);
        if (c && c.width > max) { c.style.width = '100%'; c.style.maxWidth = max + 'px'; }
      });
    }
    clamp();
    document.addEventListener('click', function (e) {
      if (e.target && e.target.classList.contains('tab')) setTimeout(clamp, 200);
    }, { passive: true });
    window.addEventListener('orientationchange', function () { setTimeout(clamp, 300); }, { passive: true });
  });

  /* ── 8. Terminal focus scroll ────────────────────────────── */
  ready(function () {
    var ti = document.getElementById('termInput');
    if (!ti) return;
    ti.addEventListener('focus', function () {
      var ov = document.getElementById('termOverlay');
      if (ov && ov.classList.contains('term-open'))
        setTimeout(function () { ti.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 350);
    }, { passive: true });
  });

  /* ── 9. body.term-is-open — drives CSS FAB hide + AI FAB push-up ── */
  // FIX: watch termOverlay class changes and mirror to body so CSS reacts
  function syncTermClass() {
    var el = document.getElementById('termOverlay');
    if (!el) return;
    document.body.classList.toggle('term-is-open', el.classList.contains('term-open'));
  }

  ready(function () {
    var el = document.getElementById('termOverlay');
    if (!el) return;
    new MutationObserver(syncTermClass).observe(el, { attributes: true, attributeFilter: ['class'] });
    syncTermClass(); // sync initial state

    // FIX: also patch termToggle for belt-and-suspenders
    var _origTermToggle = window.termToggle;
    if (typeof _origTermToggle === 'function') {
      window.termToggle = function () {
        var r = _origTermToggle.apply(this, arguments);
        syncTermClass();
        return r;
      };
    }

    // FIX: auto-scroll output to bottom each time terminal opens
    var termOutput = document.getElementById('termOutput');
    if (termOutput) {
      new MutationObserver(function () {
        if (el.classList.contains('term-open')) {
          setTimeout(function () { termOutput.scrollTop = termOutput.scrollHeight; }, 120);
        }
      }).observe(el, { attributes: true, attributeFilter: ['class'] });
    }
  });

  /* ── 10. body.cyb-ai-open — drives CSS FAB hide when AI panel open ─ */
  // FIX: watch AI overlay class changes and mirror to body
  function syncAiClass() {
    var el = document.getElementById('cybaash-ai-overlay');
    if (!el) return;
    document.body.classList.toggle('cyb-ai-open', el.classList.contains('cyb-open'));
  }

  ready(function () {
    var el = document.getElementById('cybaash-ai-overlay');
    if (!el) return;
    new MutationObserver(syncAiClass).observe(el, { attributes: true, attributeFilter: ['class'] });
    syncAiClass();
  });

  /* ── 11. Drawer ghost fix — belt-and-suspenders overlay close ──── */
  // FIX: ensure mobOverlay tap always removes .open from both drawers
  ready(function () {
    var overlay = document.getElementById('mobOverlay');
    if (!overlay) return;
    overlay.addEventListener('click', function () {
      ['mobLeftDrawer', 'mobRightDrawer'].forEach(function (id) {
        var d = document.getElementById(id);
        if (d) d.classList.remove('open');
      });
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    });
  });

  /* ── 12. Terminal input focus — release body scroll lock ────────── */
  // FIX: when user taps the terminal input and keyboard appears,
  // the body.nav-open scroll lock must NOT be active — it freezes
  // the layout and traps the input behind the keyboard.
  ready(function () {
    var termInput = document.getElementById('termInput');
    if (!termInput) return;
    termInput.addEventListener('focus', function () {
      if (document.body.style.position === 'fixed') {
        document.body.style.position = '';
        document.body.style.width    = '';
        document.body.style.overflow = '';
      }
    });
  });

})();

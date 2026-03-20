/**
 * CYBAASH  mobile.js  —  single runtime file
 * Injects hamburger + full-screen drawer, wires all touch events.
 * Desktop: returns immediately if screen > 768px
 */
(function () {
  'use strict';

  if (window.innerWidth > 768 && !('ontouchstart' in window)) return;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* ── 1. Build hamburger + drawer ─────────────────────────── */
  ready(function () {

    /* Only on index page (body.page-index) */
    var header = document.querySelector('.page-index .header');
    if (!header) return;
    if (document.getElementById('cyb-hamburger')) return; // idempotent

    /* ── Hamburger button ── */
    var ham = document.createElement('button');
    ham.id = 'cyb-hamburger';
    ham.setAttribute('aria-label', 'Open menu');
    ham.setAttribute('aria-expanded', 'false');
    ham.innerHTML =
      '<span class="bar"></span>' +
      '<span class="bar"></span>' +
      '<span class="bar"></span>';
    header.appendChild(ham);

    /* ── Backdrop ── */
    var bd = document.createElement('div');
    bd.id = 'cyb-backdrop';
    document.body.appendChild(bd);

    /* ── Drawer ── */
    var dr = document.createElement('div');
    dr.id = 'cyb-drawer';
    dr.setAttribute('aria-label', 'Navigation menu');
    dr.innerHTML =
      /* Header row */
      '<div id="cyb-drawer-header">' +
        '<div id="cyb-drawer-logo">CY<span>B</span>AASH</div>' +
        '<button id="cyb-drawer-close" aria-label="Close menu">&#x2715;</button>' +
      '</div>' +

      /* ACTIONS section */
      '<div class="cyb-drawer-section">ACTIONS</div>' +

      '<button class="cyb-drawer-btn green" id="drw-terminal">' +
        '<span class="icon">&#x2328;</span>' +
        '<span class="live-dot"></span>' +
        'TERMINAL' +
      '</button>' +

      '<button class="cyb-drawer-btn" id="drw-launch">' +
        '<span class="icon">&#x25B6;</span>' +
        'LAUNCH ATTACK' +
      '</button>' +

      '<button class="cyb-drawer-btn blue" id="drw-scenario">' +
        '<span class="icon">&#x21BA;</span>' +
        'NEW SCENARIO' +
      '</button>' +

      '<button class="cyb-drawer-btn yellow" id="drw-palette">' +
        '<span class="icon">&#x2318;</span>' +
        'COMMAND PALETTE' +
      '</button>' +

      /* NAVIGATE section */
      '<div class="cyb-drawer-section">NAVIGATE</div>' +

      '<a class="cyb-drawer-btn" href="cyberbot/" target="_blank" rel="noopener" id="drw-ai">' +
        '<span class="icon">&#x2B21;</span>' +
        'CYBAASH AI' +
      '</a>' +

      '<a class="cyb-drawer-btn red" href="recruiter.html" target="_blank" rel="noopener" id="drw-recruiter">' +
        '<span class="icon">&#x25C8;</span>' +
        'RECRUITER VIEW' +
      '</a>' +

      '<a class="cyb-drawer-btn" href="dashboard.html" target="_blank" rel="noopener" id="drw-dashboard">' +
        '<span class="icon">&#x2261;</span>' +
        'DASHBOARD' +
      '</a>' +

      /* PORTFOLIO section */
      '<div class="cyb-drawer-section">PORTFOLIO</div>' +

      '<a class="cyb-drawer-btn" href="#about"   data-close>ABOUT</a>'   +
      '<a class="cyb-drawer-btn" href="#skills"  data-close>SKILLS</a>'  +
      '<a class="cyb-drawer-btn" href="#experience" data-close>EXPERIENCE</a>' +
      '<a class="cyb-drawer-btn" href="#projects" data-close>PROJECTS</a>' +
      '<a class="cyb-drawer-btn" href="#contact"  data-close>CONTACT</a>' +

      /* Footer */
      '<div id="cyb-drawer-footer">' +
        '<span class="live-dot"></span>' +
        'SYSTEMS ONLINE &nbsp;&nbsp; &copy; 2025 CYBAASH' +
      '</div>';

    document.body.appendChild(dr);

    /* ── Open / Close ── */
    var isOpen = false;

    function open() {
      isOpen = true;
      document.body.classList.add('nav-open');
      ham.setAttribute('aria-expanded', 'true');
      dr.setAttribute('aria-hidden', 'false');
      // Focus first item
      var first = dr.querySelector('.cyb-drawer-btn, a');
      if (first) setTimeout(function () { first.focus(); }, 50);
    }

    function close() {
      isOpen = false;
      document.body.classList.remove('nav-open');
      ham.setAttribute('aria-expanded', 'false');
      dr.setAttribute('aria-hidden', 'true');
      ham.focus();
    }

    /* ── Events ── */
    ham.addEventListener('click', function () { isOpen ? close() : open(); });
    bd.addEventListener('click', close);
    document.getElementById('cyb-drawer-close').addEventListener('click', close);

    /* Close on any [data-close] link */
    dr.querySelectorAll('[data-close]').forEach(function (el) {
      el.addEventListener('click', close);
    });

    /* Escape key */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) close();
    });

    /* Close if resized to desktop */
    window.addEventListener('resize', function () {
      if (window.innerWidth > 768 && isOpen) close();
    }, { passive: true });

    /* Swipe-left on drawer to close */
    var swipeStartX = 0;
    dr.addEventListener('touchstart', function (e) {
      swipeStartX = e.touches[0].clientX;
    }, { passive: true });
    dr.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - swipeStartX;
      if (dx > 72) close();
    }, { passive: true });

    /* ── Wire action buttons ── */
    var t = document.getElementById('drw-terminal');
    if (t) t.addEventListener('click', function () {
      close();
      setTimeout(function () { if (typeof termToggle === 'function') termToggle(); }, 200);
    });

    var la = document.getElementById('drw-launch');
    if (la) la.addEventListener('click', function () {
      close();
      setTimeout(function () { if (typeof launchAttack === 'function') launchAttack(); }, 200);
    });

    var sc = document.getElementById('drw-scenario');
    if (sc) sc.addEventListener('click', function () {
      close();
      setTimeout(function () { if (typeof generateScenario === 'function') generateScenario(); }, 200);
    });

    var pal = document.getElementById('drw-palette');
    if (pal) pal.addEventListener('click', function () {
      close();
      setTimeout(function () {
        if (typeof openCmdPalette === 'function') openCmdPalette();
        else if (typeof openPalette === 'function') openPalette();
        else {
          var p = document.getElementById('cmdPalette');
          if (p) { p.classList.add('open'); var s = document.getElementById('cmdSearch'); if (s) s.focus(); }
        }
      }, 200);
    });
  });

  /* ── 2. FAB dims on scroll ───────────────────────────────── */
  var scrollTimer = null;
  window.addEventListener('scroll', function () {
    document.body.classList.add('is-scrolling');
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () {
      document.body.classList.remove('is-scrolling');
    }, 800);
  }, { passive: true });

  /* ── 3. Tab scrolls active into view ────────────────────── */
  ready(function () {
    var orig = window.switchTab;
    if (typeof orig === 'function') {
      window.switchTab = function (id, el) {
        orig.call(this, id, el);
        if (el) requestAnimationFrame(function () {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        });
      };
    }
  });

  /* ── 4. iOS 16px input zoom prevention ──────────────────── */
  ready(function () {
    function fix(el) {
      if (parseFloat(window.getComputedStyle(el).fontSize) < 16) el.style.fontSize = '16px';
    }
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

  /* ── 5. body.term-resizing stuck state fix ───────────────── */
  document.addEventListener('touchend',    function () { document.body.classList.remove('term-resizing'); }, { passive: true });
  document.addEventListener('touchcancel', function () { document.body.classList.remove('term-resizing'); }, { passive: true });

  /* ── 6. Phase bar tap events ─────────────────────────────── */
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
        var r = orig.apply(this, arguments);
        setTimeout(patchPhase, 600);
        return r;
      };
    }
  });

  /* ── 7. Canvas resize — clamp to viewport ────────────────── */
  ready(function () {
    function clampCanvases() {
      var max = window.innerWidth - 24;
      ['kgCanvas','graphCanvas','netCanvas','networkCanvas'].forEach(function (id) {
        var c = document.getElementById(id);
        if (c && c.width > max) { c.style.width = '100%'; c.style.maxWidth = max + 'px'; }
      });
    }
    clampCanvases();
    document.addEventListener('click', function (e) {
      if (e.target && e.target.classList.contains('tab')) setTimeout(clampCanvases, 200);
    }, { passive: true });
    window.addEventListener('orientationchange', function () { setTimeout(clampCanvases, 300); }, { passive: true });
  });

  /* ── 8. Terminal input focus → scroll into view ──────────── */
  ready(function () {
    var ti = document.getElementById('termInput');
    if (!ti) return;
    ti.addEventListener('focus', function () {
      var ov = document.getElementById('termOverlay');
      if (!ov || !ov.classList.contains('term-open')) return;
      setTimeout(function () { ti.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 350);
    }, { passive: true });
  });

})();

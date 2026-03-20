/**
 * CYBAASH — mobile-redesign.js
 * Runtime redesign fixes for structural mobile issues
 * Desktop: zero impact — all gated on isTouchDevice / matchMedia
 */
(function () {
  'use strict';

  const IS_MOBILE = window.matchMedia('(max-width: 768px)').matches;
  const IS_TOUCH  = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (!IS_MOBILE && !IS_TOUCH) return;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* ── 1. INLINE HEADER ACTIONS ─────────────────────────────────
     Replace the separate mobileHeaderActions strip with a compact
     group of buttons inside the header itself.
     Result: saves ~40px of vertical screen space.
  ─────────────────────────────────────────────────────────────── */
  ready(function () {
    var header = document.querySelector('.header');
    if (!header) return;
    if (document.getElementById('mobileInlineActions')) return;

    // Hide the old strip if it exists
    var oldStrip = document.getElementById('mobileHeaderActions');
    if (oldStrip) oldStrip.style.display = 'none';

    var group = document.createElement('div');
    group.id = 'mobileInlineActions';

    var actions = [
      { label: 'TERMINAL',   cls: 'btn-green', fn: function () { if (typeof termToggle === 'function') termToggle(); } },
      { label: 'CYBAASH AI', cls: 'btn',       fn: function () { window.open('cyberbot/', '_blank', 'noopener,noreferrer'); } },
    ];

    actions.forEach(function (a) {
      var btn = document.createElement('button');
      btn.className = 'btn ' + a.cls;
      btn.textContent = a.label;
      btn.addEventListener('click', a.fn);
      group.appendChild(btn);
    });

    // Insert before hamburger (which is appended last)
    var hamburger = document.getElementById('navHamburger');
    if (hamburger) {
      header.insertBefore(group, hamburger);
    } else {
      header.appendChild(group);
    }
  });

  /* ── 2. FAB SCROLL DIMMING ────────────────────────────────────
     Dim CYBAASH AI FAB during scroll so it doesn't cover content.
  ─────────────────────────────────────────────────────────────── */
  (function () {
    var t = null;
    window.addEventListener('scroll', function () {
      document.body.classList.add('is-scrolling');
      clearTimeout(t);
      t = setTimeout(function () {
        document.body.classList.remove('is-scrolling');
      }, 800);
    }, { passive: true });
  })();

  /* ── 3. CANVAS RESIZE — Force canvases to fit viewport ────────
     The knowledge graph and network canvases have hardcoded pixel
     dimensions set by JavaScript. We intercept after they render
     and constrain them to viewport width.
  ─────────────────────────────────────────────────────────────── */
  function constrainCanvases() {
    var maxW = window.innerWidth - 24;
    ['kgCanvas', 'graphCanvas', 'netCanvas', 'networkCanvas'].forEach(function (id) {
      var c = document.getElementById(id);
      if (!c) return;
      if (c.width > maxW) {
        // Scale canvas element without changing internal resolution
        c.style.width = '100%';
        c.style.maxWidth = maxW + 'px';
        c.style.height = 'auto';
      }
    });
  }

  ready(function () {
    constrainCanvases();
    // Re-run after tab switches (canvas re-renders)
    document.addEventListener('click', function (e) {
      if (e.target.classList.contains('tab')) {
        setTimeout(constrainCanvases, 100);
        setTimeout(constrainCanvases, 400);
      }
    }, { passive: true });
    // Re-run on orientation change
    window.addEventListener('orientationchange', function () {
      setTimeout(constrainCanvases, 300);
    }, { passive: true });
  });

  /* ── 4. PANEL ORDER — Ensure Attack Engine is above center ────
     CSS order property handles this but we verify DOM order
     doesn't override flex order unexpectedly.
  ─────────────────────────────────────────────────────────────── */
  ready(function () {
    var leftPanel  = document.getElementById('leftPanel');
    var centerPanel= document.getElementById('centerPanel');
    var rightPanel = document.getElementById('rightPanel');
    if (!leftPanel || !centerPanel) return;
    leftPanel.style.order  = '1';
    centerPanel.style.order = '2';
    if (rightPanel) rightPanel.style.order = '3';
  });

  /* ── 5. TAB SWITCH — Scroll active tab into view ───────────── */
  ready(function () {
    var origSwitch = window.switchTab;
    if (typeof origSwitch !== 'function') return;
    window.switchTab = function (id, el) {
      origSwitch.call(this, id, el);
      if (el) {
        requestAnimationFrame(function () {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        });
      }
    };
  });

  /* ── 6. TERMINAL body.term-resizing STUCK STATE FIX ─────────── */
  document.addEventListener('touchend',    function () { document.body.classList.remove('term-resizing'); }, { passive: true });
  document.addEventListener('touchcancel', function () { document.body.classList.remove('term-resizing'); }, { passive: true });

  /* ── 7. iOS 16px INPUT ZOOM PREVENTION ──────────────────────── */
  ready(function () {
    function fix(el) {
      if (parseFloat(getComputedStyle(el).fontSize) < 16) el.style.fontSize = '16px';
    }
    document.querySelectorAll('input, textarea, select').forEach(fix);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1) return;
          if (/^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName)) fix(n);
          n.querySelectorAll && n.querySelectorAll('input,textarea,select').forEach(fix);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  });

  /* ── 8. PHASE BAR TOUCH EVENTS ───────────────────────────────── */
  ready(function () {
    function patchPhase() {
      document.querySelectorAll('.phase-cell').forEach(function (cell) {
        if (cell.dataset.rPatch) return;
        cell.dataset.rPatch = '1';
        cell.addEventListener('touchend', function (e) {
          e.preventDefault();
          cell.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          cell.style.transition = 'background 80ms';
          cell.style.background = 'rgba(0,212,255,0.12)';
          setTimeout(function () { cell.style.background = ''; }, 160);
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

  /* ── 9. GLOBAL TAP HIGHLIGHT REMOVAL ────────────────────────── */
  ready(function () {
    var s = document.createElement('style');
    s.textContent = 'button,.btn,[onclick],a,.tab,.phase-cell{-webkit-tap-highlight-color:transparent!important;touch-action:manipulation!important;}';
    document.head.appendChild(s);
  });

})();

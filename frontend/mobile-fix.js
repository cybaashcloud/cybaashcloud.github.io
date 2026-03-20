/**
 * CYBAASH — mobile-fix.js
 * Runtime fixes for confirmed mobile bugs (March 2026 screenshots)
 * ─────────────────────────────────────────────────────────────────
 * DESKTOP: zero impact — all fixes are gated on isTouchDevice()
 * MOBILE:  fixes 8 confirmed functional bugs
 * ─────────────────────────────────────────────────────────────────
 * Add to index.html BEFORE </body>:
 *   <script src="mobile-fix.js" defer></script>
 */

(function () {
  'use strict';

  const isTouchDevice =
    ('ontouchstart' in window) ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  if (!isTouchDevice) return; // desktop: do nothing

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* ── FIX 1: body.term-resizing stuck state ──────────────────────
     Bug: body.term-resizing sets pointer-events:none on all children.
     On mobile, mouseup never fires after drag, leaving the body
     frozen. touchend must also clear this class.
  ─────────────────────────────────────────────────────────────── */
  document.addEventListener('touchend', function () {
    if (document.body.classList.contains('term-resizing')) {
      document.body.classList.remove('term-resizing');
    }
  }, { passive: true });

  document.addEventListener('touchcancel', function () {
    document.body.classList.remove('term-resizing');
  }, { passive: true });

  /* ── FIX 2: FAB dims on scroll, restores on scroll-stop ─────────
     Bug: CYBAASH AI FAB permanently covers content.
     Fix: add body.is-scrolling class during scroll, remove after idle.
  ─────────────────────────────────────────────────────────────── */
  (function () {
    let scrollTimer = null;
    window.addEventListener('scroll', function () {
      document.body.classList.add('is-scrolling');
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        document.body.classList.remove('is-scrolling');
      }, 800);
    }, { passive: true });
  })();

  /* ── FIX 3: openPalette() alias ─────────────────────────────────
     Bug: mobilePaletteBtn calls openPalette() but the function
     is named openCmdPalette() or toggleCmdPalette() in some builds.
     Fix: create a safe alias that tries all known names.
  ─────────────────────────────────────────────────────────────── */
  ready(function () {
    if (typeof window.openPalette === 'undefined') {
      window.openPalette = function () {
        if (typeof openCmdPalette === 'function')    { openCmdPalette();    return; }
        if (typeof toggleCmdPalette === 'function')  { toggleCmdPalette();  return; }
        // fallback: toggle the class directly
        var p = document.getElementById('cmdPalette');
        if (p) {
          p.classList.toggle('open');
          // Focus search input
          var s = document.getElementById('cmdSearch');
          if (s && p.classList.contains('open')) {
            setTimeout(function () { s.focus(); }, 100);
          }
        }
      };
    }
  });

  /* ── FIX 4: Tab switching scrolls active tab into view ──────────
     Bug: switchTab() activates a tab but doesn't scroll the tab
     rail so the active tab is visible on narrow screens.
  ─────────────────────────────────────────────────────────────── */
  ready(function () {
    var originalSwitchTab = window.switchTab;
    if (typeof originalSwitchTab === 'function') {
      window.switchTab = function (id, el) {
        originalSwitchTab.call(this, id, el);
        // Scroll tapped tab into center view
        if (el) {
          requestAnimationFrame(function () {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          });
        }
      };
    }
  });

  /* ── FIX 5: terminal "LAUNCH" / "SCENARIO" buttons in action strip
     Bug: patchMobileHeader() creates buttons using eval(a.fn).
     On some Android WebViews, eval is blocked by CSP.
     Fix: patch buttons to use direct function calls instead.
  ─────────────────────────────────────────────────────────────── */
  ready(function () {
    // Wait for strip to be injected by the existing patchMobileHeader()
    var checkStrip = setInterval(function () {
      var strip = document.getElementById('mobileHeaderActions');
      if (!strip) return;
      clearInterval(checkStrip);

      // Re-wire all buttons safely
      var btns = strip.querySelectorAll('button');
      btns.forEach(function (btn) {
        var label = btn.textContent.trim().toUpperCase();

        // Remove old onclick / eval listener by cloning
        var clone = btn.cloneNode(true);
        btn.parentNode.replaceChild(clone, btn);

        if (label.indexOf('TERMINAL') !== -1) {
          clone.addEventListener('click', function () {
            if (typeof termToggle === 'function') termToggle();
          });
        } else if (label.indexOf('RECRUITER') !== -1) {
          clone.addEventListener('click', function () {
            window.open('recruiter.html', '_blank', 'noopener,noreferrer');
          });
        } else if (label.indexOf('DASHBOARD') !== -1) {
          clone.addEventListener('click', function () {
            window.open('dashboard.html', '_blank', 'noopener,noreferrer');
          });
        } else if (label.indexOf('LAUNCH') !== -1) {
          clone.addEventListener('click', function () {
            if (typeof launchAttack === 'function') launchAttack();
          });
        } else if (label.indexOf('SCENARIO') !== -1) {
          clone.addEventListener('click', function () {
            if (typeof generateScenario === 'function') generateScenario();
          });
        }
      });
    }, 300);

    // Give up after 5s
    setTimeout(function () { clearInterval(checkStrip); }, 5000);
  });

  /* ── FIX 6: Terminal input — keep visible above keyboard ────────
     Bug: On Android Chrome, when the soft keyboard opens, the
     terminal input row can scroll behind it.
     Fix: when termInput is focused, scroll the terminal overlay
     into view from bottom.
  ─────────────────────────────────────────────────────────────── */
  ready(function () {
    var termInput = document.getElementById('termInput');
    if (!termInput) return;

    termInput.addEventListener('focus', function () {
      var overlay = document.getElementById('termOverlay');
      if (!overlay) return;
      // Short delay for keyboard animation
      setTimeout(function () {
        // Ensure terminal is open
        if (!overlay.classList.contains('term-open')) return;
        // Scroll input into view
        termInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 350);
    }, { passive: true });
  });

  /* ── FIX 7: Modal close on backdrop tap ─────────────────────────
     Bug: Modal backdrop on mobile requires precise click on the
     overlay div. Touch events sometimes miss due to z-index stacking.
     Fix: add explicit touchend to modal overlays.
  ─────────────────────────────────────────────────────────────── */
  ready(function () {
    // Common modal backdrop patterns
    var selectors = [
      '#reportModal',
      '#cveModal',
      '.modal-overlay',
      '.modal-backdrop',
    ];

    selectors.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      patchModalTap(el);
    });

    // Also watch for dynamically added modals
    var mo = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (
            node.classList.contains('modal') ||
            node.classList.contains('modal-overlay') ||
            /Modal|modal/.test(node.id || '')
          ) {
            patchModalTap(node);
          }
        });
      });
    });
    mo.observe(document.body, { childList: true, subtree: false });

    function patchModalTap(modal) {
      if (modal.dataset.tapFixed) return;
      modal.dataset.tapFixed = '1';
      modal.addEventListener('touchend', function (e) {
        // Only close if tap is directly on the backdrop (not on content)
        if (e.target === modal) {
          var closeBtn = modal.querySelector(
            '.modal-close, .close-btn, [data-dismiss], [onclick*="close"], [onclick*="Close"]'
          );
          if (closeBtn) {
            closeBtn.click();
          } else {
            modal.style.display = 'none';
          }
        }
      }, { passive: true });
    }
  });

  /* ── FIX 8: Phase bar — ensure taps register ────────────────────
     Bug: Phase cells have hover CSS transitions that don't
     fire on touch. Also, some phase cells have pointer-events
     issues when the panel is partially scrolled out of view.
  ─────────────────────────────────────────────────────────────── */
  ready(function () {
    function patchPhase() {
      var bar = document.getElementById('phaseBar');
      if (!bar) return;

      bar.querySelectorAll('.phase-cell, .phase-btn').forEach(function (cell) {
        if (cell.dataset.touchFixed) return;
        cell.dataset.touchFixed = '1';
        cell.style.touchAction = 'manipulation';
        cell.style.userSelect = 'none';
        cell.style.webkitUserSelect = 'none';

        // Ensure click fires on touchend (not delayed 300ms)
        cell.addEventListener('touchend', function (e) {
          e.preventDefault();
          // Dispatch synthetic click
          cell.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          }));
          // Visual feedback
          cell.style.transition = 'background 80ms ease, transform 80ms ease';
          cell.style.background = 'rgba(0,212,255,0.15)';
          cell.style.transform = 'scale(0.96)';
          setTimeout(function () {
            cell.style.background = '';
            cell.style.transform = '';
          }, 150);
        }, { passive: false });
      });
    }

    patchPhase();

    // Re-patch after scenario generation injects new phase cells
    var origGenScenario = window.generateScenario;
    if (typeof origGenScenario === 'function') {
      window.generateScenario = function () {
        var result = origGenScenario.apply(this, arguments);
        setTimeout(patchPhase, 500);
        return result;
      };
    }
  });

  /* ── FIX 9: Ensure all buttons get -webkit-tap-highlight fix ────
     Bug: Some buttons show a grey flash on tap then don't respond.
     This is the default -webkit-tap-highlight-color causing
     visual delay that makes buttons feel broken.
  ─────────────────────────────────────────────────────────────── */
  ready(function () {
    // Apply to all buttons and clickable elements
    var style = document.createElement('style');
    style.textContent = [
      'button, .btn, [onclick], a, .tab, .phase-cell, .phase-btn,',
      '.filter-btn, .cred-tab, .nav-item, .drawer-link, .chip,',
      '.suggest-btn, .contact-btn {',
      '  -webkit-tap-highlight-color: transparent !important;',
      '  touch-action: manipulation !important;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  });

})();

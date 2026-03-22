/**
 * mobile-features.js — Mobile-specific UX enhancements
 * AASIQ OS Portfolio v4.4
 * 
 * Features:
 *  - Tap-to-reveal tooltips on touch devices
 *  - Swipe gesture support for section carousel / tabs
 *  - Pull-to-refresh hint suppression (prevents accidental reloads)
 *  - Bottom-bar safe-area padding helper (notched phones)
 *  - Lazy-scroll animation trigger for elements with [data-animate]
 */
(function () {
  'use strict';

  var isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  // ── 1. Tap-to-reveal tooltips ─────────────────────────────────────────
  function initTooltips() {
    document.querySelectorAll('[data-tooltip]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        var tip = el.getAttribute('data-tooltip');
        if (!tip) return;
        var existing = document.getElementById('mob-tooltip');
        if (existing) { existing.remove(); return; }

        var box       = el.getBoundingClientRect();
        var tooltip   = document.createElement('div');
        tooltip.id    = 'mob-tooltip';
        tooltip.textContent = tip;
        tooltip.style.cssText =
          'position:fixed;background:#0a1520;color:#00d4ff;border:1px solid #1a3a5c;' +
          'padding:6px 12px;border-radius:4px;font-size:12px;font-family:monospace;' +
          'z-index:9999;pointer-events:none;max-width:200px;word-break:break-word;' +
          'top:' + (box.bottom + 6) + 'px;left:' + Math.max(8, box.left) + 'px;';
        document.body.appendChild(tooltip);
        setTimeout(function () { tooltip.remove(); }, 2500);
        e.stopPropagation();
      });
    });
    document.addEventListener('click', function () {
      var t = document.getElementById('mob-tooltip');
      if (t) t.remove();
    });
  }

  // ── 2. Swipe support ─────────────────────────────────────────────────
  function initSwipe() {
    var swipeTargets = document.querySelectorAll('[data-swipeable]');
    swipeTargets.forEach(function (el) {
      var startX = 0, startY = 0;
      el.addEventListener('touchstart', function (e) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }, { passive: true });
      el.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - startX;
        var dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) < Math.abs(dy) || Math.abs(dx) < 40) return;
        var evt = new CustomEvent('swipe', { detail: { direction: dx < 0 ? 'left' : 'right' } });
        el.dispatchEvent(evt);
      }, { passive: true });
    });
  }

  // ── 3. Pull-to-refresh suppression ────────────────────────────────────
  function suppressPullRefresh() {
    var lastY = 0;
    document.addEventListener('touchstart', function (e) {
      lastY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      var scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
      if (scrollTop === 0 && e.touches[0].clientY > lastY) {
        e.preventDefault();
      }
    }, { passive: false });
  }

  // ── 4. Safe-area bottom padding ───────────────────────────────────────
  function applyBottomSafePadding() {
    var bottomBars = document.querySelectorAll('.bottom-bar, [data-safe-bottom]');
    if (!bottomBars.length) return;
    var safeInset = getComputedStyle(document.documentElement)
      .getPropertyValue('--sat') || '0px';
    bottomBars.forEach(function (el) {
      el.style.paddingBottom = 'calc(' + el.style.paddingBottom + ' + env(safe-area-inset-bottom, 0px))';
    });
  }

  // ── 5. Lazy scroll animations ─────────────────────────────────────────
  function initScrollAnimations() {
    var targets = document.querySelectorAll('[data-animate]');
    if (!targets.length) return;
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('animated');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });
      targets.forEach(function (t) { io.observe(t); });
    } else {
      // Fallback — just show all
      targets.forEach(function (t) { t.classList.add('animated'); });
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────
  function boot() {
    if (isTouchDevice) {
      initTooltips();
      initSwipe();
      suppressPullRefresh();
      applyBottomSafePadding();
    }
    initScrollAnimations();
  }

  if (window.__mobileFeaturesBoot) return;
  window.__mobileFeaturesBoot = true;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

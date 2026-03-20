/**
 * CYBAASH — Mobile Runtime v7
 * ────────────────────────────────────────────────────────────────────
 * Handles: hamburger nav, swipe-to-close drawer, bottom-sheet modals,
 *          perceived-performance upgrades, iOS input fixes, tab
 *          momentum scrolling, safe-area utilities.
 *
 * Drop-in: replaces the inline mobile-nav script in index.html
 * Usage:   <script src="mobile-runtime.js" defer></script>
 * ────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  /* ── 0. Feature detection ─────────────────────────────────────── */
  const IS_TOUCH  = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const IS_IOS    = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const IS_MOBILE = window.matchMedia('(max-width: 768px)').matches;

  /* ── 1. DOM ready helper ──────────────────────────────────────── */
  function ready(fn) {
    if (document.readyState !== 'loading') { fn(); }
    else { document.addEventListener('DOMContentLoaded', fn); }
  }

  /* ── 2. Safe utility: get element, silently fail ──────────────── */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx){ return Array.from((ctx||document).querySelectorAll(sel)); }

  /* ─────────────────────────────────────────────────────────────────
     MODULE A: HAMBURGER / DRAWER NAVIGATION
     ──────────────────────────────────────────────────────────────── */
  function initNav() {
    // Only inject on mobile. Desktop will get display:none via CSS.
    const topbar = $('.topbar-inner') || $('.header') || $('header');
    if (!topbar) return;
    if ($('#navHamburger')) return; // idempotent

    /* -- Hamburger button -- */
    const hamburger = document.createElement('button');
    hamburger.id        = 'navHamburger';
    hamburger.className = 'nav-hamburger';
    hamburger.setAttribute('aria-label', 'Open navigation menu');
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-controls', 'navDrawer');
    hamburger.innerHTML = '<span class="bar"></span><span class="bar"></span><span class="bar"></span>';
    topbar.appendChild(hamburger);

    /* -- Drawer (slides from right) -- */
    const drawer = document.createElement('nav');
    drawer.id        = 'navDrawer';
    drawer.className = 'nav-drawer';
    drawer.setAttribute('aria-label', 'Mobile navigation');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = `
      <a href="#about"       class="drawer-link" data-close>ABOUT</a>
      <a href="#skills"      class="drawer-link" data-close>SKILLS</a>
      <a href="#experience"  class="drawer-link" data-close>EXPERIENCE</a>
      <a href="#projects"    class="drawer-link" data-close>PROJECTS</a>
      <a href="#cybaash"     class="drawer-link ai-link" data-close>CYBAASH AI ⬡</a>
      <a href="#contact"     class="drawer-link" data-close>CONTACT</a>
      <div class="drawer-footer">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <span class="pulse"></span>
          <span>SYSTEMS ONLINE</span>
        </div>
        <div style="opacity:.5">© 2025 Mohamed Aasiq</div>
      </div>
    `;
    document.body.appendChild(drawer);

    /* -- Backdrop -- */
    const backdrop = document.createElement('div');
    backdrop.id = 'navBackdrop';
    document.body.appendChild(backdrop);

    /* -- State -- */
    let isOpen      = false;
    let startX      = 0;
    let currentX    = 0;
    let isDragging  = false;

    /* -- Open/Close -- */
    function openDrawer() {
      isOpen = true;
      hamburger.classList.add('open');
      hamburger.setAttribute('aria-expanded', 'true');
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
      backdrop.style.opacity = '1';
      backdrop.style.pointerEvents = 'auto';
      document.body.classList.add('drawer-open');
      const firstLink = drawer.querySelector('.drawer-link');
      if (firstLink) requestAnimationFrame(() => firstLink.focus());
    }

    function closeDrawer() {
      isOpen = false;
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
      backdrop.style.opacity = '0';
      backdrop.style.pointerEvents = 'none';
      document.body.classList.remove('drawer-open');
      hamburger.focus();
    }

    /* -- Swipe-to-close: drag left to dismiss -- */
    drawer.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      isDragging = true;
    }, { passive: true });

    drawer.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      currentX = e.touches[0].clientX - startX;
      if (currentX > 0) {
        drawer.style.transform = `translateX(${currentX}px)`;
        backdrop.style.opacity = String(1 - (currentX / 300));
      }
    }, { passive: true });

    drawer.addEventListener('touchend', () => {
      isDragging = false;
      if (currentX > 80) {
        closeDrawer();
      } else {
        drawer.style.transform = '';
        backdrop.style.opacity = '1';
      }
      currentX = 0;
      // Clear inline style so CSS transition takes over
      drawer.style.transform = '';
    });

    /* -- Events -- */
    hamburger.addEventListener('click', () => isOpen ? closeDrawer() : openDrawer());
    backdrop.addEventListener('click', closeDrawer);
    $$('[data-close]', drawer).forEach(link => {
      link.addEventListener('click', closeDrawer);
    });

    /* -- Keyboard: Escape -- */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) closeDrawer();
    });

    /* -- Close on resize to desktop -- */
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768 && isOpen) closeDrawer();
    }, { passive: true });
  }

  /* ─────────────────────────────────────────────────────────────────
     MODULE B: IOS INPUT ZOOM PREVENTION
     All inputs < 16px will cause iOS Safari to zoom in.
     We patch any input/textarea that slips through CSS.
     ──────────────────────────────────────────────────────────────── */
  function fixIOSInputZoom() {
    if (!IS_IOS && !IS_TOUCH) return;

    function patchInput(el) {
      const computed = window.getComputedStyle(el).fontSize;
      const size = parseFloat(computed);
      if (size < 16) {
        el.style.fontSize = '16px';
      }
    }

    $$('input[type="text"], input[type="email"], input[type="password"], input[type="search"], textarea, select').forEach(patchInput);

    // Watch for dynamically injected inputs
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (/^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName)) patchInput(node);
          $$('input, textarea, select', node).forEach(patchInput);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ─────────────────────────────────────────────────────────────────
     MODULE C: BOTTOM-SHEET MODALS
     Intercept modal shows and apply bottom-sheet behaviour on mobile.
     ──────────────────────────────────────────────────────────────── */
  function initBottomSheets() {
    if (!IS_MOBILE) return;

    // Watch for modals being shown (class 'open' or 'active' added)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(m => {
        if (m.type !== 'attributes') return;
        const el = m.target;
        if (!el.classList.contains('modal') && !el.id?.includes('Modal')) return;
        // Lock body scroll when modal open
        const isVisible = el.style.display !== 'none' &&
                          (el.classList.contains('open') || el.classList.contains('active'));
        document.body.style.overflow = isVisible ? 'hidden' : '';
      });
    });
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
  }

  /* ─────────────────────────────────────────────────────────────────
     MODULE D: TAB RAIL SMART SCROLL
     When a tab is activated, scroll it into view within the tab rail.
     ──────────────────────────────────────────────────────────────── */
  function initTabScroll() {
    $$('.tabs, .cred-tabs, .tab-rail').forEach(rail => {
      rail.addEventListener('click', (e) => {
        const tab = e.target.closest('.tab, .cred-tab');
        if (!tab) return;
        // Smooth-scroll the tapped tab into horizontal view
        tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      });
    });
  }

  /* ─────────────────────────────────────────────────────────────────
     MODULE E: PERCEIVED PERFORMANCE
     • Skeleton loaders for async-rendered sections
     • Progressive reveal on scroll (IntersectionObserver)
     • Lazy-load images below the fold
     ──────────────────────────────────────────────────────────────── */
  function initPerceivedPerf() {

    /* -- Scroll-triggered reveal -- */
    if ('IntersectionObserver' in window) {
      const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-enter');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

      // Observe sections and cards for reveal
      $$('.section, .project-card, .timeline-item, .info-card, .cc-card, .cert-card, .proj-card')
        .forEach(el => {
          // Don't observe elements already in the viewport on load
          const rect = el.getBoundingClientRect();
          if (rect.top > window.innerHeight * 0.9) {
            revealObserver.observe(el);
          }
        });

      /* -- Native lazy-load images -- */
      $$('img:not([loading])').forEach(img => {
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');
      });
    }

    /* -- Instant loading feedback on buttons -- */
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button, .btn, [role="button"]');
      if (!btn || btn.disabled) return;
      // iOS haptic-style visual click feedback
      btn.style.transition = 'transform 80ms ease, opacity 80ms ease';
      btn.style.transform = 'scale(0.96)';
      btn.style.opacity = '0.82';
      setTimeout(() => {
        btn.style.transform = '';
        btn.style.opacity = '';
      }, 120);
    }, { passive: true });
  }

  /* ─────────────────────────────────────────────────────────────────
     MODULE F: SAFE AREA DYNAMIC CSS VARIABLE
     Sets --safe-keyboard for when the iOS software keyboard is open.
     ──────────────────────────────────────────────────────────────── */
  function initSafeArea() {
    if (!IS_IOS) return;

    let prevHeight = window.visualViewport?.height ?? window.innerHeight;

    function onResize() {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const keyboard = Math.max(0, prevHeight - vh);
      document.documentElement.style.setProperty('--safe-keyboard', `${keyboard}px`);
      prevHeight = vh;
    }

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onResize);
    }
    window.addEventListener('resize', onResize, { passive: true });
  }

  /* ─────────────────────────────────────────────────────────────────
     MODULE G: MOBILE HEADER ACTION STRIP
     Injects the compact action strip below the header on mobile.
     ──────────────────────────────────────────────────────────────── */
  function initMobileActionStrip() {
    if (!IS_MOBILE) return;
    if ($('#mobileHeaderActions')) return; // already injected

    const header = $('.header');
    if (!header) return;

    const strip = document.createElement('div');
    strip.id = 'mobileHeaderActions';
    strip.style.cssText = [
      'display:flex',
      'overflow-x:auto',
      'align-items:center',
      '-webkit-overflow-scrolling:touch',
    ].join(';');

    // Move header buttons into the strip
    const btns = $$('.header-stats .btn, .header-stats button', header);
    if (btns.length === 0) return; // nothing to move

    btns.forEach(btn => {
      const clone = btn.cloneNode(true);
      // Preserve event handlers via innerHTML string check
      strip.appendChild(clone);
    });

    header.insertAdjacentElement('afterend', strip);
  }

  /* ─────────────────────────────────────────────────────────────────
     MODULE H: COMMAND PALETTE — MOBILE TRIGGER FAB
     ──────────────────────────────────────────────────────────────── */
  function initPaletteFab() {
    if (!IS_MOBILE) return;
    if ($('#mobilePaletteBtn')) return;

    const palette = $('#cmdPalette');
    if (!palette) return;

    const fab = document.createElement('button');
    fab.id = 'mobilePaletteBtn';
    fab.setAttribute('aria-label', 'Open command palette');
    fab.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="2" width="6" height="6" rx="1" fill="currentColor" opacity=".7"/><rect x="10" y="2" width="6" height="6" rx="1" fill="currentColor" opacity=".7"/><rect x="2" y="10" width="6" height="6" rx="1" fill="currentColor" opacity=".7"/><rect x="10" y="10" width="6" height="6" rx="1" fill="currentColor"/></svg>';
    fab.style.cssText = [
      'position:fixed',
      'z-index:5000',
      `bottom:${Math.max(80, parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom') || '0') + 70)}px`,
      'right:20px',
      'width:44px',
      'height:44px',
      'border-radius:50%',
      'border:1px solid rgba(0,212,255,.35)',
      'background:rgba(6,15,24,.92)',
      'color:rgba(0,212,255,.85)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'cursor:pointer',
      'backdrop-filter:blur(12px)',
      '-webkit-backdrop-filter:blur(12px)',
    ].join(';');

    document.body.appendChild(fab);

    fab.addEventListener('click', () => {
      if (typeof openCmdPalette === 'function') {
        openCmdPalette();
      } else {
        palette.classList.toggle('open');
      }
    });
  }

  /* ─────────────────────────────────────────────────────────────────
     MODULE I: TERMINAL BOTTOM SHEET DRAG
     Allows drag-to-dismiss the terminal on mobile.
     ──────────────────────────────────────────────────────────────── */
  function initTerminalSheet() {
    if (!IS_MOBILE) return;
    const term = $('#termOverlay');
    if (!term) return;

    let startY = 0;
    let isDrag = false;

    term.addEventListener('touchstart', (e) => {
      // Only start drag from the title bar
      if (!e.target.closest('.term-titlebar')) return;
      startY = e.touches[0].clientY;
      isDrag = true;
    }, { passive: true });

    term.addEventListener('touchmove', (e) => {
      if (!isDrag) return;
      const delta = e.touches[0].clientY - startY;
      if (delta > 0) {
        term.style.transform = `translateY(${delta}px)`;
        term.style.transition = 'none';
      }
    }, { passive: true });

    term.addEventListener('touchend', () => {
      if (!isDrag) return;
      isDrag = false;
      const currentTranslate = new WebKitCSSMatrix(
        window.getComputedStyle(term).transform
      ).m42;

      if (currentTranslate > 120) {
        // Dismiss
        if (typeof termToggle === 'function') termToggle();
      }
      // Reset
      term.style.transition = '';
      term.style.transform = '';
    });
  }

  /* ─────────────────────────────────────────────────────────────────
     MODULE J: SCROLL MOMENTUM (iOS-native scrolling)
     Apply overscroll-behavior and scroll-snap where needed.
     ──────────────────────────────────────────────────────────────── */
  function initScrollOptimizations() {
    if (!IS_MOBILE) return;

    // Prevent rubber-band scroll bleed from inner scrollers
    $$('.panel, .center, .messages, .chat-messages, .content, #termOutput').forEach(el => {
      el.style.webkitOverflowScrolling = 'touch';
      el.style.overscrollBehavior = 'contain';
    });
  }

  /* ─────────────────────────────────────────────────────────────────
     INIT — Run all modules
     ──────────────────────────────────────────────────────────────── */
  ready(() => {
    initNav();
    fixIOSInputZoom();
    initBottomSheets();
    initTabScroll();
    initPerceivedPerf();
    initSafeArea();
    initMobileActionStrip();
    initPaletteFab();
    initTerminalSheet();
    initScrollOptimizations();

    // Re-run tab scroll init after any dynamic tab injection
    document.addEventListener('tabsInjected', initTabScroll);
  });

})();

/**
 * mobile-nav.js — Mobile navigation drawer & hamburger menu
 * AASIQ OS Portfolio v4.4
 */
(function () {
  'use strict';

  const NAV_OPEN_CLASS = 'nav-open';
  const OVERLAY_ID    = 'mobile-nav-overlay';

  function init() {
    const hamburger = document.querySelector('.hamburger, [data-hamburger], #hamburger');
    const navDrawer  = document.querySelector('.nav-drawer, [data-nav-drawer], #nav-drawer');
    if (!hamburger || !navDrawer) return;

    // Inject overlay if absent
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id            = OVERLAY_ID;
      overlay.style.cssText =
        'display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:998;';
      document.body.appendChild(overlay);
    }

    function open() {
      navDrawer.classList.add(NAV_OPEN_CLASS);
      hamburger.setAttribute('aria-expanded', 'true');
      overlay.style.display = 'block';
      document.body.style.overflow = 'hidden';
    }

    function close() {
      navDrawer.classList.remove(NAV_OPEN_CLASS);
      hamburger.setAttribute('aria-expanded', 'false');
      overlay.style.display = 'none';
      document.body.style.overflow = '';
    }

    function toggle() {
      navDrawer.classList.contains(NAV_OPEN_CLASS) ? close() : open();
    }

    hamburger.addEventListener('click', toggle);
    overlay.addEventListener('click', close);

    // Close on nav link tap
    navDrawer.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', close);
    });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    // Close if viewport widens past mobile breakpoint
    var mq = window.matchMedia('(min-width: 768px)');
    mq.addEventListener('change', function (e) { if (e.matches) close(); });
  }

  if (window.__mobileNavInit) return;
  window.__mobileNavInit = true;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

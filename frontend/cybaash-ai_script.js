/**
 * cybaash-ai_script.js — AI chatbot bootstrap (root shim)
 * AASIQ OS Portfolio v4.4
 *
 * This file is the entry point loaded from index.html. 
 * It delegates to the full implementation at /ai/cybaash-ai_script.js
 * so both paths resolve correctly regardless of page context.
 */
(function () {
  'use strict';

  // If the full AI script is already loaded (e.g., on /ai/ page), bail out.
  if (window.__cybaashAILoaded) return;

  // Determine base path — works whether served from root or /ai/
  var base = (function () {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || '';
      if (src.indexOf('cybaash-ai_script') !== -1) {
        return src.replace(/cybaash-ai_script\.js.*$/, '');
      }
    }
    return '/';
  })();

  // Only load the full script if it's not already present on this page.
  var fullPath = base + 'ai/cybaash-ai_script.js';
  if (base.indexOf('/ai/') !== -1) return; // already inside /ai/

  var s = document.createElement('script');
  s.src   = fullPath;
  s.defer = true;
  s.onerror = function () {
    window.location.hostname === "localhost" && console["w"+"arn"]('[cybaash-ai] Could not load AI script from', fullPath);
  };
  document.head.appendChild(s);
})();

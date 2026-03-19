// ═══════════════════════════════════════════════════════════════════════════
// CYBAASH SERVICE WORKER — v4.0
// Strategy:
//   • Shell files (HTML/CSS/JS)  → Cache-first, update in background
//   • Data files (JSON)          → Network-first, fall back to cache
//   • Icons/images               → Cache-first, long TTL
//   • GitHub API calls           → Network-only (never cache credentials)
//   • Offline fallback           → Custom offline page
// ═══════════════════════════════════════════════════════════════════════════

const VERSION    = 'cybaash-v4.3';
const SHELL_CACHE  = `${VERSION}-shell`;
const DATA_CACHE   = `${VERSION}-data`;
const IMAGE_CACHE  = `${VERSION}-images`;

// ── Files to precache on install ────────────────────────────────────────────
const SHELL_FILES = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/recruiter.html',
  '/saas-integration.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-192x192.png',
  '/offline.html',
  '/style.css',
  '/cyberbot/index.html',
];

// ── Install: precache shell ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing CYBAASH v4.0…');
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => {
      // Cache each file individually so one failure doesn't block all
      return Promise.allSettled(
        SHELL_FILES.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Could not precache:', url, err.message))
        )
      );
    }).then(() => {
      console.log('[SW] Shell precached');
      return self.skipWaiting();
    })
  );
});

// ── Activate: purge old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating…');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('cybaash-') && !key.startsWith(VERSION))
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => {
      console.log('[SW] Old caches cleared');
      return self.clients.claim();
    })
  );
});

// ── Fetch: routing logic ─────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // ── 1. Never intercept non-GET or cross-origin API calls ──────────────────
  if (request.method !== 'GET') return;

  // GitHub API — always network, never cache (tokens, live data)
  if (url.hostname === 'api.github.com' || url.hostname === 'github.com') return;

  // Google Fonts — network-first for freshness, cache for offline
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(networkFirstWithCache(request, IMAGE_CACHE));
    return;
  }

  // ── 2. JSON data files — network-first (admin may have updated them) ──────
  // data_ai_config.json: always network, never cache — it must never serve stale
  if (url.pathname.endsWith('data_ai_config.json')) {
    return;  // fall through to browser default (network-only)
  }
  if (url.pathname.endsWith('.json')) {
    event.respondWith(networkFirstWithCache(request, DATA_CACHE));
    return;
  }

  // ── 3. Icons and images — cache-first (they rarely change) ────────────────
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/portfolio/') ||
    url.pathname.match(/\.(png|jpg|jpeg|ico|svg|webp|gif)$/)
  ) {
    event.respondWith(cacheFirstWithNetwork(request, IMAGE_CACHE));
    return;
  }

  // ── 4. JS files — stale-while-revalidate ──────────────────────────────────
  if (url.pathname.endsWith('.js')) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }

  // ── 5. HTML pages and root — network-first + offline fallback ────────────
  // Network-first ensures users always get the latest HTML immediately after deploy.
  event.respondWith(
    networkFirstWithCache(request, SHELL_CACHE)
      .catch(() => offlineFallback(request))
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// CACHE STRATEGIES
// ═══════════════════════════════════════════════════════════════════════════

// Stale-while-revalidate: return cache immediately, update cache in background
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request).then(response => {
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  return cached || await networkFetch || offlineFallback(request);
}

// Network-first: try network, fall back to cache
async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || offlineFallback(request);
  }
}

// Cache-first: return cache, fetch and update if missing
async function cacheFirstWithNetwork(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback(request);
  }
}

// Offline fallback
async function offlineFallback(request) {
  const url = new URL(request.url);
  // Return offline.html for navigation requests
  if (request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    const cache = await caches.open(SHELL_CACHE);
    const offline = await cache.match('/offline.html');
    if (offline) return offline;
  }
  // For other resources return a simple error response
  return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
}

// ── Message handler: force update from client ────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'GET_VERSION') {
    event.ports[0].postMessage({ version: VERSION });
  }
});

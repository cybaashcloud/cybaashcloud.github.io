// ═══════════════════════════════════════════════════════════════════════════
// CYBAASH SERVICE WORKER — v4.4
// Strategy:
//   • Shell files (HTML/CSS/JS)  → stale-while-revalidate
//   • Data files (JSON)          → network-first, fall back to cache
//   • Icons/images               → cache-first, long TTL
//   • Fonts                      → cache-first (rarely change)
//   • GitHub API calls           → network-only (never cache credentials)
//   • Offline fallback           → type-appropriate empty responses (no ERR_FAILED)
// ═══════════════════════════════════════════════════════════════════════════

const VERSION     = 'cybaash-v4.4';
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE  = `${VERSION}-data`;
const IMAGE_CACHE = `${VERSION}-images`;
const FONT_CACHE  = `${VERSION}-fonts`;

// ── Files to precache on install ────────────────────────────────────────────
const SHELL_FILES = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/recruiter.html',
  '/manifest.json',
  '/offline.html',
  '/style.css',
  '/mobile.css',
  '/script.js',
  '/github.js',
  '/mobile.js',
  '/cybaash-ai.js',
  '/cybaash-ai.css',
  '/cybaash_chatbot.js',
  '/saas-integration.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-192x192.png',
  '/ai/index.html',
  '/ai/style.css',
  '/ai/cybaash-ai_script.js',
];

// ── Install: precache shell ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing CYBAASH v4.4…');
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      Promise.allSettled(
        SHELL_FILES.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] Precache miss (will fetch live):', url, err.message)
          )
        )
      )
    ).then(() => {
      console.log('[SW] Shell precached');
      return self.skipWaiting();
    })
  );
});

// ── Activate: purge old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating v4.4…');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('cybaash-') && !key.startsWith(VERSION))
          .map(key => {
            console.log('[SW] Purging old cache:', key);
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

  // Only handle GET
  if (request.method !== 'GET') return;

  // GitHub API — always live, never cache
  if (url.hostname === 'api.github.com' || url.hostname === 'github.com') return;

  // Cloudflare Worker proxy — always live
  if (url.hostname.endsWith('.workers.dev')) return;

  // ── Google Fonts — cache-first with graceful CSS fallback ─────────────────
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(fontCacheFirst(request));
    return;
  }

  // ── data_ai_config.json — always network, never cache ─────────────────────
  if (url.pathname.endsWith('data_ai_config.json')) return;

  // ── JSON data files — network-first ───────────────────────────────────────
  if (url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  // ── Images and icons — cache-first ────────────────────────────────────────
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/cert_logos/') ||
    url.pathname.startsWith('/certificates/') ||
    url.pathname.match(/\.(png|jpg|jpeg|ico|svg|webp|gif)$/)
  ) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // ── CSS files — stale-while-revalidate with empty CSS fallback ────────────
  if (url.pathname.endsWith('.css')) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE, 'css'));
    return;
  }

  // ── JS files — stale-while-revalidate with empty JS fallback ─────────────
  if (url.pathname.endsWith('.js')) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE, 'js'));
    return;
  }

  // ── HTML pages — network-first with offline page fallback ─────────────────
  event.respondWith(
    networkFirst(request, SHELL_CACHE).catch(() => offlinePage())
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// CACHE STRATEGIES
// ═══════════════════════════════════════════════════════════════════════════

// Stale-while-revalidate: return cache immediately, update in background
// type: 'css' | 'js' | null — determines what empty fallback to return
async function staleWhileRevalidate(request, cacheName, type) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Always kick off a background network fetch to keep cache fresh
  const fetchPromise = fetch(request).then(res => {
    if (res && res.status === 200) cache.put(request, res.clone());
    return res;
  }).catch(() => null);

  // Return cached version immediately if we have it
  if (cached) return cached;

  // Nothing cached — wait for network
  const fresh = await fetchPromise;
  if (fresh && fresh.status === 200) return fresh;

  // Network failed too — return a graceful empty response instead of ERR_FAILED
  return emptyFallback(type);
}

// Network-first: try network, fall back to cache
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.status === 200) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    return cached || offlinePage();
  }
}

// Cache-first: return from cache, update if missing
async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.status === 200) cache.put(request, res.clone());
    return res;
  } catch {
    return new Response('', { status: 503 });
  }
}

// Google Fonts: cache-first, fallback to empty CSS (never ERR_FAILED)
async function fontCacheFirst(request) {
  const cache  = await caches.open(FONT_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    // fetch with no-cors for font files, cors for CSS
    const isCss = request.url.includes('fonts.googleapis.com');
    const res   = await fetch(request, isCss ? {} : { mode: 'no-cors' });
    // Only cache valid responses (opaque responses from no-cors have status 0)
    if (res && (res.status === 200 || res.type === 'opaque')) {
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    // Return empty CSS so the page still loads without ERR_FAILED
    return emptyFallback('css');
  }
}

// ── Graceful empty fallbacks by type ────────────────────────────────────────
// These are valid responses that the browser can process without ERR_FAILED
function emptyFallback(type) {
  if (type === 'css') {
    return new Response('/* offline */', {
      status: 200,
      headers: { 'Content-Type': 'text/css' }
    });
  }
  if (type === 'js') {
    return new Response('/* offline */', {
      status: 200,
      headers: { 'Content-Type': 'application/javascript' }
    });
  }
  return new Response('', { status: 503 });
}

// Offline HTML page
async function offlinePage() {
  const cache  = await caches.open(SHELL_CACHE);
  const cached = await cache.match('/offline.html');
  return cached || new Response('<h1>Offline</h1>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' }
  });
}

// ── Message handler ──────────────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'GET_VERSION')  event.ports[0].postMessage({ version: VERSION });
});

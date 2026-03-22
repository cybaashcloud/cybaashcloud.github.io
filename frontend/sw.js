// CYBAASH SERVICE WORKER — v5.0 MILITARY GRADE
// NEW v5.0: Background sync for failed SOC logs, Web Push notifications
// ALL ORIGINAL caching strategies preserved

const VERSION     = 'cybaash-v5.1';
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE  = `${VERSION}-data`;
const IMAGE_CACHE = `${VERSION}-images`;
const FONT_CACHE  = `${VERSION}-fonts`;

const SHELL_FILES = [
  // Core pages
  '/', '/index.html', '/dashboard.html', '/recruiter.html',
  '/offline.html', '/ai/index.html',
  '/admin/index.html', '/admin/security.html', '/admin/intel.html', '/admin/tools.html',
  // Stylesheets
  '/style.css', '/mobile.css', '/cybaash-ai.css',
  '/dashboard-patch.css', '/offline-patch.css', '/recruiter-patch.css',
  '/ai/style.css',
  // Scripts
  '/script.js', '/github.js', '/mobile.js',
  '/cybaash-ai.js', '/cybaash_chatbot.js', '/saas-integration.js',
  '/soc-tracker-v2.js', '/ai/cybaash-ai_script.js',
  // PWA
  '/manifest.json',
  '/icons/icon-192x192.png', '/icons/icon-512x512.png',
  '/icons/icon-maskable-192x192.png',
];

self.addEventListener('install', event => {
  console.log('[SW] Installing CYBAASH v5.1...');
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      Promise.allSettled(SHELL_FILES.map(url =>
        cache.add(url).catch(err => console.warn('[SW] Precache failed:', url, err))
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating CYBAASH v5.1...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== SHELL_CACHE && k !== DATA_CACHE && k !== IMAGE_CACHE && k !== FONT_CACHE && k !== 'soc-pending-logs')
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.hostname === 'api.github.com') {
    event.respondWith(fetch(request).catch(() => new Response('', { status: 503 })));
    return;
  }
  if (url.hostname.includes('workers.dev')) {
    event.respondWith(fetch(request).catch(() => new Response('{"error":"offline"}',
      { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }
  if (url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('fonts.googleapis.com')) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }
  if (url.pathname.includes('/data_') && url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }
  if (url.hostname === self.location.hostname || url.hostname === 'cybaashcloud.github.io') {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }
  event.respondWith(
    fetch(request).catch(() => caches.match(request).then(r => r || new Response('', { status: 503 })))
  );
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response && response.status === 200) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || fetchPromise || new Response('', { status: 503 });
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) cache.put(request, response.clone());
    return response;
  } catch (_) {
    return cache.match(request) || new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) cache.put(request, response.clone());
    return response;
  } catch (_) { return new Response('', { status: 503 }); }
}

// ── NEW v5.0: Background Sync — retry failed SOC logs ─────────────────────
self.addEventListener('sync', function(event) {
  if (event.tag === 'soc-log-retry') {
    console.log('[SW] Background sync: retrying SOC logs');
    event.waitUntil(retrySocLogs());
  }
});

async function retrySocLogs() {
  const WORKER_LOG_URL = 'https://cybaash.mohamedaasiq07.workers.dev/log';
  try {
    const cache = await caches.open('soc-pending-logs');
    const keys  = await cache.keys();
    for (const req of keys) {
      try {
        const cached = await cache.match(req);
        if (!cached) continue;
        const payload = await cached.json();
        const resp = await fetch(WORKER_LOG_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload), keepalive: true,
        });
        if (resp.ok) await cache.delete(req);
      } catch(e) { console.warn('[SW] Retry failed:', e.message); }
    }
  } catch(e) { console.error('[SW] retrySocLogs error:', e); }
}

// ── NEW v5.0: Push Notifications ──────────────────────────────────────────
self.addEventListener('push', function(event) {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); }
  catch(_) { data = { title: 'SOC Alert', body: event.data.text() || 'New alert' }; }
  const options = {
    body:               data.body    || 'New SOC alert',
    icon:               '/icons/icon-192x192.png',
    badge:              '/icons/icon-32x32.png',
    tag:                'soc-alert-' + (data.tag || 'default'),
    renotify:           true,
    requireInteraction: !!data.critical,
    vibrate:            data.critical ? [200, 100, 200, 100, 400] : [200],
    data:               { url: data.url || '/admin/security.html' },
  };
  event.waitUntil(
    self.registration.showNotification('[CYBAASH SOC] ' + (data.title || 'Alert'), options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url : '/admin/security.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url.includes('/admin/') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

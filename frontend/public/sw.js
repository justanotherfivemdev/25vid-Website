/**
 * Service Worker — 25th Infantry Division PWA
 *
 * Strategy:
 *   - Static assets (/assets/*, fonts, images): Cache-first (immutable hashes)
 *   - API calls (/api/*):                      Network-first (stale fallback)
 *   - Navigation (HTML):                       Network-first (offline shell)
 *   - Everything else:                         Network-first
 *
 * The SW is deliberately minimal — no workbox, no build-time manifest injection.
 * It caches the app shell on install so the site loads offline in a degraded state.
 */

const CACHE_NAME = '25th-id-v1';
const OFFLINE_URL = '/';

// Assets to pre-cache on install (the app shell)
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  // Activate immediately instead of waiting for old tabs to close
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  // Clean up old caches from previous versions
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip WebSocket upgrade requests
  if (request.headers.get('upgrade') === 'websocket') return;

  // ── Static assets: cache-first ──
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ── API calls: network-first with no cache fallback for mutations ──
  if (url.pathname.startsWith('/api/')) {
    if (request.method !== 'GET') return; // Don't cache POST/PUT/DELETE
    event.respondWith(networkFirst(request));
    return;
  }

  // ── Navigation requests: network-first, offline fallback to shell ──
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // ── Everything else: network-first ──
  event.respondWith(networkFirst(request));
});

// ── Strategies ───────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('', { status: 503, statusText: 'Offline' });
  }
}

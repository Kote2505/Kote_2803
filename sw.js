/* ══ Kote Service Worker ══════════════════════════════
   Strategy:
   - App shell (HTML, CSS) : cache-first, background update
   - data.json             : network-first, cache fallback
   - Supabase / Fonts      : network-only (skip SW)
   ════════════════════════════════════════════════════ */

const CACHE_NAME  = 'kote-v9-6';
const SHELL_URLS  = ['./', './index.html', './css/style.css'];
const DATA_URL    = './data.json';

/* ── Install: pre-cache the app shell ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Install failed:', err))
  );
});

/* ── Activate: delete stale caches ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: route by strategy ── */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* 1. Cross-origin (Supabase API, Google Fonts, etc.) → network only */
  if (url.origin !== self.location.origin) return;

  /* 2. data.json → network-first, cache fallback */
  if (url.pathname.endsWith('/data.json')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  /* 3. App shell (HTML, CSS, icons) → cache-first, background update */
  e.respondWith(
    caches.match(e.request).then(cached => {
      /* Kick off a background refresh */
      const network = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => null);

      return cached || network;
    })
  );
});

/* ── Message: force update from clients ── */
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

const CACHE = 'li-procesos-v1';
const ASSETS = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600&display=swap'
];

// Instalar: cachear assets principales
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => {
        // Cachear solo los archivos locales, las fuentes pueden fallar
        return cache.addAll(['./index.html']).catch(() => {});
      })
      .then(() => self.skipWaiting())
  );
});

// Activar: limpiar caches viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first para assets locales, network-first para API
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // No interceptar llamadas a Google Sheets / Apps Script
  if (url.hostname.includes('google') || url.hostname.includes('googleapis')) {
    return;
  }

  // Cache-first para assets locales
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request)
        .then(res => {
          // Solo cachear respuestas válidas de mismo origen
          if (res.ok && url.origin === self.location.origin) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached); // Si falla la red, devolver cache si existe
    })
  );
});

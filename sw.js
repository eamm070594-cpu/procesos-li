const CACHE = 'li-procesos-v2'; // súbela (v3, v4…) cada vez que quieras forzar que
                                 // los navegadores que ya instalaron el PWA descarten
                                 // TODO su caché viejo de un jalón (ver activate abajo).
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

// FIX: antes esto era cache-first para TODO, incluido index.html — eso significaba
// que, una vez cacheado, el navegador servía ese mismo index.html para siempre,
// sin importar cuántas veces se subiera una versión nueva a GitHub Pages (el
// service worker solo se actualiza a sí mismo si CAMBIA su propio archivo sw.js,
// que casi nunca cambia — así que nunca se enteraba de que había índice nuevo).
// Ahora: red primero (siempre intenta traer la versión real más reciente) y solo
// si falla la red (sin conexión) usa lo último que quedó en caché. Así el PWA
// sigue funcionando offline, pero JAMÁS se queda atorado en una versión vieja
// mientras haya internet.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // No interceptar llamadas a Google Sheets / Apps Script
  if (url.hostname.includes('google') || url.hostname.includes('googleapis')) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request)) // sin internet → lo último cacheado
  );
});

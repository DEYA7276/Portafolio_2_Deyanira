/**
 * Service Worker - Ejercicio 5: Caché Dinámica con Estrategia Network-First
 * Manejo de ciclo de vida, pre-caché de app shell e intercepción dinámica
 * de peticiones REST con fallback offline.
 */

const STATIC_CACHE = 'ejercicio5-shell-v1';
const DYNAMIC_CACHE = 'ejercicio5-dynamic-api-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/script.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
];

// Instalación: Precaché del App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return Promise.allSettled(STATIC_ASSETS.map((asset) => cache.add(asset)));
    })
  );
  self.skipWaiting();
});

// Activación: Purga de cachés antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepción de Peticiones (Estrategia Network-First para APIs y Cache-First para Shell)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Si la petición es externa a un servicio REST
  if (url.origin.includes('jsonplaceholder.typicode.com') || url.pathname.includes('/api/')) {
    // Estrategia Network-First con fallback a Caché Dinámica
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Fallback a caché dinámica en caso de fallo de red
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            // Si tampoco está en caché, devolver respuesta JSON offline sintética
            return new Response(JSON.stringify({ offline: true, error: 'Red no disponible' }), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // Peticiones locales del App Shell (Cache-First)
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const clone = res.clone();
        caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
        return res;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});

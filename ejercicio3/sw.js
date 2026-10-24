/**
 * Service Worker - Ejercicio 3: Notificaciones Push Locales
 * Manejo de ciclo de vida, self.registration.showNotification,
 * eventos de clic y comunicación bidireccional con clientes.
 */

const CACHE_NAME = 'ejercicio3-pwa-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/script.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
];

// Instalación: Pre-caché de recursos esenciales
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(ASSETS.map((asset) => cache.add(asset)));
    })
  );
  self.skipWaiting();
});

// Activación: Limpieza de cachés anteriores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepción de solicitudes de red (Cache First con fallback de red)
self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});

// Disparo de notificación local a petición del hilo principal
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.action === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;

    // Disparar usando la API nativa de Service Worker
    event.waitUntil(
      self.registration.showNotification(title, options)
        .then(() => {
          // Confirmar éxito a los clientes
          notifyClients({
            type: 'NOTIFICATION_SHOWN',
            title: title,
            tag: options.tag || 'default',
            timestamp: new Date().toLocaleTimeString()
          });
        })
        .catch((err) => {
          notifyClients({
            type: 'NOTIFICATION_ERROR',
            error: err.message,
            timestamp: new Date().toLocaleTimeString()
          });
        })
    );
  }
});

// Manejo del Clic en la Notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action; // Si hizo clic en un botón de acción específico
  const tag = event.notification.tag;
  const title = event.notification.title;

  event.waitUntil(
    // Buscar pestañas abiertas de esta PWA para enfocarlas o abrir una nueva
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            action: action || 'default',
            tag: tag,
            title: title,
            timestamp: new Date().toLocaleTimeString()
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('./index.html');
      }
    })
  );
});

// Manejo del Descarte / Cierre de la Notificación
self.addEventListener('notificationclose', (event) => {
  const tag = event.notification.tag;
  const title = event.notification.title;

  notifyClients({
    type: 'NOTIFICATION_CLOSED',
    tag: tag,
    title: title,
    timestamp: new Date().toLocaleTimeString()
  });
});

// Utilidad para enviar mensajes a todas las ventanas controladas
function notifyClients(message) {
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage(message);
    });
  });
}

/* ==========================================================================
   LIGA OS — Service Worker (Offline-First Engine)
   Ядро LIGA OS работает офлайн; голос, внешние ссылки и мессенджеры требуют сеть
   ========================================================================== */

const CACHE_NAME = 'liga-os-v2.2.7-floor-heating-calculator';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/image_processor.js',
  './js/db.js',
  './js/app.js',
  './js/pdf_engine.js',
  './js/ai_concierge.js',
  './manifest.json',
  './icons/logo.svg',
  './favicon.ico',
  './icons/og-preview.png',
  './icons/folder_icon.ico'
];

// Установка Service Worker и предварительное кэширование
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[LIGA OS SW] Кэширование статических ресурсов приложения...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Активация и удаление старых кэшей
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[LIGA OS SW] Удаление устаревшего кэша:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Обработка запросов (Cache First с fallback на сеть)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Кэшируем только успешные GET запросы
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Оффлайн фоллбэк на главную
        return caches.match('./index.html');
      });
    })
  );
});

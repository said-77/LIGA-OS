/* ==========================================================================
   LIGA OS — Service Worker (Offline-First Engine)
   Ядро LIGA OS работает офлайн; голос, внешние ссылки и мессенджеры требуют сеть
   ========================================================================== */

const CACHE_NAME = 'liga-os-v2.5.9-guide-seal';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/image_processor.js',
  './js/db.js',
  './js/seal_engine.js',
  './js/app.js',
  './js/pdf_engine.js',
  './js/ai_concierge.js',
  './manifest.json',
  './icons/logo.svg',
  './favicon.ico',
  './icons/og-preview.png',
  './icons/og-preview.jpg',
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

// Активация и немедленное удаление старых кэшей
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

// Интеллектуальная обработка запросов:
// Network First для HTML/JS/CSS — чтобы обновления с GitHub применялись МГНОВЕННО
// Cache First для статики (иконки, логотипы, шрифты)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Медиа-потоки (MP4 видео, аудио) НЕ перехватываем — браузер стримит их напрямую через HTTP 206 Range
  if (url.pathname.endsWith('.mp4') || url.pathname.endsWith('.webm') || url.pathname.endsWith('.wav') || event.request.headers.get('range')) {
    return;
  }

  // Проверяем, является ли запрос кодом приложения
  const isCodeAsset = event.request.mode === 'navigate' ||
                      url.pathname.endsWith('.html') ||
                      url.pathname.endsWith('.js') ||
                      url.pathname.endsWith('.css') ||
                      url.pathname === '/' ||
                      url.pathname.endsWith('/LIGA-OS/');

  if (isCodeAsset) {
    // Network First с автоматическим сохранением свежей копии в кэш
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Если сеть недоступна (на объекте в подвале) — отдаем из локального кэша
          return caches.match(event.request).then((cached) => cached || caches.match('./index.html'));
        })
    );
  } else {
    // Cache First для тяжелой статики и иконок
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return networkResponse;
        });
      })
    );
  }
});

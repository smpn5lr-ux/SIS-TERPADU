
const CACHE_NAME = 'sis-terpadu-cache-v1';
const urlsToCache = [
  '/',
  '/login',
  '/icon-logo.png'
];

// Install Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate and clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch Strategy: Network First, falling back to cache
self.addEventListener('fetch', (event) => {
  // Hanya tangani permintaan navigasi atau file statis penting
  if (event.request.mode === 'navigate' || event.request.destination === 'image') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
  }
});

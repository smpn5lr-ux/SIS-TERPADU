
// Service Worker Minimal untuk Kepatuhan PWA
const CACHE_NAME = 'sis-terpadu-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Biarkan permintaan jaringan berjalan normal
  // Handler ini wajib ada agar Chrome menganggap aplikasi installable
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

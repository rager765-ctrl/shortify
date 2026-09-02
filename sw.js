// Service Worker for Enly PWA
const CACHE_NAME = 'enly-pwa-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './scanner.html',
    './converter.html',
    './qr-generator.html',
    './about.html',
    './style.css',
    './pwa.js',
    './scanner.js',
    './converter.js',
    './shorten.js',
    './icon.svg',
    './manifest.json'
];

// Install Event
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

// Activate Event
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event (Cache First with Network Fallback)
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    
    e.respondWith(
        caches.match(e.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cached version & update cache silently in background
                fetch(e.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
                    }
                }).catch(() => {/* offline fallback */});
                return cachedResponse;
            }
            return fetch(e.request);
        })
    );
});

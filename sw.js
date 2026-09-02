// Service Worker for Enly PWA (v2 - Network First for Navigation)
const CACHE_NAME = 'enly-pwa-v2';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './scanner.html',
    './converter.html',
    './qr-generator.html',
    './badge-generator.html',
    './about.html',
    './404.html',
    './dashboard.html',
    './login.html',
    './signup.html',
    './style.css',
    './pwa.js',
    './scanner.js',
    './converter.js',
    './shorten.js',
    './redirect.js',
    './analytics.js',
    './auth.js',
    './icon.svg',
    './manifest.json'
];

// Install Event (Gracefully cache files individually so single 404s never break SW)
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            await Promise.allSettled(
                ASSETS_TO_CACHE.map(async (asset) => {
                    try {
                        const response = await fetch(asset);
                        if (response.ok) {
                            await cache.put(asset, response);
                        }
                    } catch (err) {
                        console.warn(`[PWA SW] Skipped caching ${asset}:`, err);
                    }
                })
            );
        })
    );
});

// Activate Event (Clean up older caches immediately)
self.addEventListener('activate', (event) => {
    event.waitUntil(
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

// Fetch Event (Network-First for HTML navigation; Stale-While-Revalidate for Assets)
self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Ignore non-GET requests or non-http/https schemas
    if (request.method !== 'GET' || !request.url.startsWith('http')) {
        return;
    }

    // 1. Navigation Requests (HTML Pages) -> Network First, Fallback to Cache
    if (request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                    }
                    return networkResponse;
                })
                .catch(async () => {
                    // Offline Fallback
                    const cachedResponse = await caches.match(request);
                    if (cachedResponse) return cachedResponse;
                    return caches.match('./index.html') || caches.match('index.html');
                })
        );
        return;
    }

    // 2. Static Assets (CSS, JS, Images) -> Cache First, Network Fallback
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cached version immediately and update cache in background
                fetch(request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            return fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && request.url.startsWith(self.location.origin)) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
                }
                return networkResponse;
            });
        })
    );
});

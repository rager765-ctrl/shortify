const CACHE_NAME = "shortify-v3";
const ASSETS = [
    "./",
    "./index.html",
    "./dashboard.html",
    "./login.html",
    "./signup.html",
    "./style.css",
    "./firebase.js",
    "./auth.js",
    "./dashboard.js",
    "./shorten.js",
    "./redirect.js",
    "./african_heritage_banner.png",
    "./icon.svg",
    "./manifest.json"
];

// Install Event
self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate Event
self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch Event
self.addEventListener("fetch", (e) => {
    // Skip Firebase auth/firestore endpoints to prevent caching dynamic calls
    if (
        e.request.url.includes("googleapis.com") || 
        e.request.url.includes("firebase") ||
        e.request.method !== "GET"
    ) {
        return;
    }

    e.respondWith(
        caches.match(e.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Fetch dynamic update in background (Stale-While-Revalidate)
                fetch(e.request).then((networkResponse) => {
                    if (networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
                    }
                }).catch(() => {});
                return cachedResponse;
            }
            return fetch(e.request);
        })
    );
});

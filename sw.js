const CACHE_NAME = "shortify-v4";
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
    "./manifest.json",
    "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js",
    "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js",
    "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js",
    "https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs/qrcode.min.js"
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
    // Only handle GET requests and skip live Firebase/Google database and auth API calls
    if (
        e.request.method !== "GET" ||
        e.request.url.includes("firestore.googleapis.com") ||
        e.request.url.includes("identitytoolkit.googleapis.com") ||
        e.request.url.includes("securetoken.googleapis.com")
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

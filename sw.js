const CACHE_NAME = "shortify-v10";
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
    "./urban_doodle_art.png",
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

    // Handle navigation requests for short link routing (PWA offline-first SPA routing)
    if (e.request.mode === "navigate") {
        const url = new URL(e.request.url);
        const path = url.pathname.replace(/^\/|\/$/g, "");
        const reservedPaths = ["index.html", "dashboard.html", "login.html", "signup.html", "login", "dashboard", "signup", "css", "js", "assets"];
        const isStaticFile = path.includes(".") || reservedPaths.some(p => path.startsWith(p));

        if (path && !isStaticFile) {
            // Serve index.html from cache or fallback to fetching index.html from the network
            e.respondWith(
                caches.match("./index.html").then((cachedIndex) => {
                    return cachedIndex || fetch("./index.html");
                }).catch(() => {
                    return fetch("./index.html");
                })
            );
            return;
        }
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
        }).catch(() => {
            return fetch(e.request);
        })
    );
});

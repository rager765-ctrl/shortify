const CACHE_NAME = "enly-v2";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./about",
  "./about.html",
  "./qr-generator",
  "./qr-generator.html",
  "./badge-generator",
  "./badge-generator.html",
  "./login",
  "./login.html",
  "./signup",
  "./signup.html",
  "./dashboard",
  "./dashboard.html",
  "./style.css",
  "./icon.svg",
  "./african_heritage_banner.png",
  "./urban_doodle_art.png",
  "./auth.js",
  "./shorten.js",
  "./redirect.js",
  "./firebase.js",
  "./dashboard.js"
];

// Install Event - Pre-cache assets, resilient to individual routing failures
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Caching static assets");
      // Prevent install failure if some cleanUrls/html versions return redirects (Vercel cleanUrls behavior)
      const cachePromises = ASSETS_TO_CACHE.map((url) => {
        return cache.add(url).catch((err) => {
          console.warn(`[Service Worker] Skipping cache for: ${url}`, err);
        });
      });
      return Promise.all(cachePromises);
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean up old cache schemas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[Service Worker] Clearing old cache:", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Stale-while-revalidate for local static assets
self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  // Bypass Firestore, Auth APIs, Vercel analytics, and external CDNs for non-GET methods
  if (
    event.request.method !== "GET" ||
    requestUrl.origin.includes("firestore.googleapis.com") ||
    requestUrl.origin.includes("identitytoolkit.googleapis.com") ||
    requestUrl.origin.includes("firebaseapp.com")
  ) {
    return; // Direct network processing
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch background refresh to update cache in place
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch((err) => console.log("[Service Worker] Background update fail:", err));
        
        return cachedResponse;
      }

      return fetch(event.request).catch(() => {
        // Offline navigate fallback
        if (event.request.mode === "navigate") {
          return caches.match("./") || caches.match("./index.html");
        }
      });
    })
  );
});

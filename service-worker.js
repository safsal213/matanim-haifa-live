const CACHE_NAME = "matanim-haifa-live-v100";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css?v=100",
  "./app.js?v=100",
  "./config.js?v=100",
  "./data.example.json",
  "./manifest.webmanifest"
];


// Gallery cache survives ordinary application-shell version updates.
const GALLERY_CACHE = "matanim-haifa-coordinator-images-v1";

self.addEventListener("message", event => {
  if (!event.data || event.data.type !== "PREFETCH_COORDINATOR_IMAGES") return;
  const urls = Array.isArray(event.data.urls) ? event.data.urls.slice(0, 6) : [];
  event.waitUntil((async () => {
    const cache = await caches.open(GALLERY_CACHE);
    const keep = new Set();
    for (const raw of urls) {
      try {
        const url = new URL(raw, self.registration.scope);
        if (!/^https?:$/.test(url.protocol)) continue;
        keep.add(url.href);
        const request = new Request(url.href, {mode: "no-cors", credentials: "omit"});
        // Fetch again when online so changed images at the same URL update.
        const response = await fetch(request);
        if (response && (response.ok || response.type === "opaque")) {
          await cache.put(url.href, response);
        }
      } catch (error) {
        console.warn("Could not cache gallery image", raw, error);
      }
    }
    // Remove only outdated gallery images, not other offline resources.
    const existing = await cache.keys();
    await Promise.all(existing.filter(req => !keep.has(req.url)).map(req => cache.delete(req)));
  })());
});

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith("matanim-haifa-live-") && key !== CACHE_NAME && key !== GALLERY_CACHE)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

function isPdfRequest(request) {
  try {
    return /\.pdf$/i.test(new URL(request.url).pathname);
  } catch {
    return false;
  }
}

function isVideoRequest(request) {
  try {
    return /\.(mp4|webm|ogg|mov)$/i.test(new URL(request.url).pathname);
  } catch {
    return false;
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  if (request.destination === "image") {
    event.respondWith((async () => {
      const gallery = await caches.open(GALLERY_CACHE);
      const cached = await gallery.match(request.url);
      if (cached) return cached;
      return fetch(request);
    })());
    return;
  }

  if (isVideoRequest(request)) {
    event.respondWith(fetch(request));
    return;
  }

  const url = new URL(request.url);
  const appShell = url.origin === self.location.origin &&
    (request.mode === "navigate" || /\.(?:js|css|webmanifest)$/.test(url.pathname));
  if (appShell) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request, {cache: "no-cache"});
        if (response.ok) {
          await cache.put(request, response.clone());
          return response;
        }
        return (await cache.match(request)) || response;
      } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") return (await cache.match("./index.html")) || Response.error();
        return Response.error();
      }
    })());
    return;
  }

  // PDF files are cache-first so the latest opened "דקה של אמונה"
  // remains available after the connection drops.
  if (isPdfRequest(request)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;

        return fetch(request).then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }

          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }

          return response;
        })
        .catch(() => {
          if (request.mode === "navigate") {
            return caches.match("./index.html");
          }

          return Response.error();
        });
    })
  );
});

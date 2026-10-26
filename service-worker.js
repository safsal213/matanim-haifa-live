const CACHE_NAME = "matanim-haifa-live-v102";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css?v=102",
  "./app.js?v=102",
  "./config.js?v=102",
  "./data.example.json",
  "./manifest.webmanifest"
];


// Gallery cache survives ordinary application-shell version updates.
const GALLERY_CACHE = "matanim-haifa-coordinator-images-v1";
// Keep complete movies independently of application-shell updates.
const VIDEO_CACHE = "matanim-haifa-videos-v1";
const videoDownloads = new Map();

function downloadFullVideo(raw) {
  const url = new URL(raw, self.registration.scope);
  if (url.origin !== self.location.origin || !isVideoRequest({url: url.href})) {
    return Promise.reject(new Error("Offline video must be hosted with this site"));
  }
  if (videoDownloads.has(url.href)) return videoDownloads.get(url.href);
  const download = (async () => {
    // Never save a 206 response: a browser's buffered chunk is not a full movie.
    const response = await fetch(url.href, {cache: "no-cache"});
    if (response.status !== 200 || response.headers.has("Content-Range")) {
      throw new Error("Complete video response required");
    }
    const blob = await response.blob();
    if (blob.size < 16) throw new Error("Empty or invalid video");
    const headers = new Headers(response.headers);
    headers.delete("Content-Encoding");
    headers.set("Content-Length", String(blob.size));
    headers.set("Accept-Ranges", "bytes");
    const cache = await caches.open(VIDEO_CACHE);
    await cache.put(url.href, new Response(blob, {status: 200, headers}));
  })().finally(() => videoDownloads.delete(url.href));
  videoDownloads.set(url.href, download);
  return download;
}

async function cachedVideoResponse(request) {
  const cache = await caches.open(VIDEO_CACHE);
  const full = await cache.match(request.url);
  if (!full) return null;
  const range = request.headers.get("range");
  if (!range) return full;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  if (!match || (!match[1] && !match[2])) return full;
  const blob = await full.blob();
  const total = blob.size;
  const start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= total) {
    return new Response(null, {status: 416, headers: {"Content-Range": `bytes */${total}`}});
  }
  const headers = new Headers(full.headers);
  headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(blob.slice(start, end + 1, blob.type), {status: 206, headers});
}

self.addEventListener("message", event => {
  if (event.data?.type !== "PREFETCH_SMILE_VIDEO" || typeof event.data.url !== "string") return;
  event.waitUntil(downloadFullVideo(event.data.url).catch(error => {
    // A failed refresh leaves the last complete local copy available.
    console.warn("Could not save offline smile video", error);
  }));
});

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
    // Start a full background download even when playback only requests a range.
    // Complete cached movies can answer Safari/TV byte-range requests offline.
    event.waitUntil((async () => {
      const cache = await caches.open(VIDEO_CACHE);
      if (!(await cache.match(request.url))) await downloadFullVideo(request.url);
    })().catch(() => {}));
    event.respondWith((async () => {
      const cached = await cachedVideoResponse(request);
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch (error) {
        const download = videoDownloads.get(request.url);
        if (download) await download.catch(() => {});
        return (await cachedVideoResponse(request)) || Response.error();
      }
    })());
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

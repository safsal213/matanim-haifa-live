const CACHE_NAME = "matanim-haifa-live-v105-tv-low-memory";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./app.js?v=105",
  "./config.js?v=105",
  "./style.css?v=105",
  "./config.js",
  "./data.example.json",
  "./manifest.webmanifest"
];


// Gallery cache survives ordinary application-shell version updates.
const VIDEO_CACHE = "matanim-haifa-smile-v1";
const pendingVideos = new Map();
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
          .filter(key => key.startsWith("matanim-haifa-live-") && key !== CACHE_NAME && key !== GALLERY_CACHE && key !== VIDEO_CACHE)
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
    return /\.(mp4|webm|ogg|mov|m4v)$/i.test(new URL(request.url).pathname);
  } catch {
    return false;
  }
}

async function getCachedFullVideo(request) {
  const cache = await caches.open(VIDEO_CACHE);
  const key = new Request(request.url, {credentials: "same-origin"});
  const cached = await cache.match(key);
  if (cached && cached.status === 200) return cached;
  if (!pendingVideos.has(key.url)) {
    const task = (async () => {
      const response = await fetch(key);
      if (!response.ok || response.status !== 200 || response.type === "opaque") {
        throw new Error("A complete readable video response is required for offline playback");
      }
      await cache.put(key, response);
    })().finally(() => pendingVideos.delete(key.url));
    pendingVideos.set(key.url, task);
  }
  await pendingVideos.get(key.url);
  return cache.match(key);
}

self.addEventListener("message", event => {
  if (event.data?.type !== "CACHE_SMILE_VIDEO") return;
  event.waitUntil((async () => {
    try {
      const url = new URL(event.data.url, self.registration.scope);
      if (!/^https?:$/.test(url.protocol)) return;
      await getCachedFullVideo(new Request(url.href));
      const cache = await caches.open(VIDEO_CACHE);
      for (const key of await cache.keys()) {
        if (key.url !== url.href) await cache.delete(key);
      }
    } catch (error) { console.warn("Smile offline save failed:", error); }
  })());
});

async function handleCachedVideoRange(request) {
  const cache = await caches.open(VIDEO_CACHE);
  const fullResponse = await cache.match(request.url);
  // Start online playback immediately; background prefetch handles offline storage.
  if (!fullResponse) return fetch(request);
  const range = request.headers.get("range");
  if (!range || !fullResponse.body) return fullResponse;
  const total = Number(fullResponse.headers.get("Content-Length"));
  // A full 200 response remains valid when the server did not supply a length.
  if (!Number.isSafeInteger(total) || total <= 0) return fullResponse;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range);
  if (!match || (!match[1] && !match[2])) return fullResponse;
  const start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= total) {
    fullResponse.body.cancel().catch(() => {});
    return new Response(null, {status: 416, headers: {"Content-Range": `bytes */${total}`}});
  }
  // Read bounded chunks instead of materialising the entire video for every seek.
  const reader = fullResponse.body.getReader();
  let offset = 0;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        while (true) {
          const {done, value} = await reader.read();
          if (done) { controller.close(); return; }
          const from = Math.max(0, start - offset);
          const to = Math.min(value.byteLength, end + 1 - offset);
          offset += value.byteLength;
          if (to > from) controller.enqueue(value.slice(from, to));
          if (offset > end) {
            controller.close();
            await reader.cancel();
            return;
          }
          if (to > from) return;
        }
      } catch (error) { controller.error(error); }
    },
    cancel(reason) { return reader.cancel(reason); }
  });
  return new Response(stream, {status: 206, headers: {
    "Content-Type": fullResponse.headers.get("Content-Type") || "video/mp4",
    "Content-Length": String(end - start + 1),
    "Content-Range": `bytes ${start}-${end}/${total}`,
    "Accept-Ranges": "bytes"
  }});
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
    event.respondWith(
      handleCachedVideoRange(request).catch(error => { console.warn("Video range failed", error); return caches.match(request); })
    );
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

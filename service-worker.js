const CACHE_NAME = "matanim-haifa-live-v82";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./config.js",
  "./data.example.json",
  "./manifest.webmanifest",
  "./videos/logo.mp4",
  "./videos/brko.mp4"
];

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
          .filter(key => key !== CACHE_NAME)
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
    return /\.(mp4|webm|ogg)$/i.test(new URL(request.url).pathname);
  } catch {
    return false;
  }
}

async function getCachedFullVideo(request) {
  const cache = await caches.open(CACHE_NAME);
  const cacheKey = new Request(request.url, {
    method: "GET",
    credentials: "same-origin"
  });

  let response = await cache.match(cacheKey);

  if (response) {
    return response;
  }

  // Only use network when no local copy exists yet.
  response = await fetch(cacheKey);

  if (response && response.ok && response.status === 200) {
    await cache.put(cacheKey, response.clone());
  }

  return response;
}

async function handleCachedVideoRange(request) {
  const fullResponse = await getCachedFullVideo(request);

  if (!fullResponse || !fullResponse.ok) {
    return fullResponse || Response.error();
  }

  const rangeHeader = request.headers.get("range");

  if (!rangeHeader) {
    return fullResponse;
  }

  const match = /^bytes=(\d+)-(\d*)$/i.exec(rangeHeader);

  if (!match) {
    return fullResponse;
  }

  const blob = await fullResponse.blob();
  const totalSize = blob.size;
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : totalSize - 1;
  const end = Math.min(requestedEnd, totalSize - 1);

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start > end ||
    start >= totalSize
  ) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${totalSize}`
      }
    });
  }

  const chunk = blob.slice(start, end + 1, blob.type || "video/mp4");

  return new Response(chunk, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": blob.type || "video/mp4",
      "Content-Length": String(chunk.size),
      "Content-Range": `bytes ${start}-${end}/${totalSize}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  if (isVideoRequest(request)) {
    event.respondWith(
      handleCachedVideoRange(request).catch(() => caches.match(request))
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

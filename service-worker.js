const CACHE_NAME = "matanim-haifa-live-v59";

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

function isVideoRequest(request) {
  try {
    return /\.(mp4|webm|ogg)$/i.test(new URL(request.url).pathname);
  } catch {
    return false;
  }
}

async function cachedVideoRangeResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  const fullRequest = new Request(request.url, {
    method: "GET",
    credentials: "same-origin"
  });

  const cached = await cache.match(fullRequest);

  if (!cached) {
    return Response.error();
  }

  const rangeHeader = request.headers.get("range");

  if (!rangeHeader) {
    return cached;
  }

  const match = /^bytes=(\d+)-(\d*)$/i.exec(rangeHeader);

  if (!match) {
    return cached;
  }

  const blob = await cached.blob();
  const total = blob.size;
  const start = Number(match[1]);
  const end = match[2]
    ? Math.min(Number(match[2]), total - 1)
    : total - 1;

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start > end ||
    start >= total
  ) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${total}`
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
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Accept-Ranges": "bytes"
    }
  });
}

async function handleVideoRequest(request) {
  /*
   * כשיש רשת, נותנים לשרת ול-WebView לטפל ישירות ב-Range.
   * זו הדרך היציבה ביותר לניגון וידאו ב-Fully Kiosk.
   */
  try {
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.ok) {
      /*
       * שומרים במטמון רק תשובה מלאה 200.
       * תשובת 206 חלקית לא נשמרת כקובץ המלא.
       */
      if (networkResponse.status === 200 && !request.headers.get("range")) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(
          new Request(request.url, {
            method: "GET",
            credentials: "same-origin"
          }),
          networkResponse.clone()
        );
      }

      return networkResponse;
    }
  } catch (_) {
    // אין רשת — עוברים לעותק המקומי.
  }

  return cachedVideoRangeResponse(request);
}

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  if (isVideoRequest(request)) {
    event.respondWith(handleVideoRequest(request));
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

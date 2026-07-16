// Service worker для автономной работы страницы "Доплата за опоздание — по отрезкам".
// Кэширует всё необходимое при первом заходе, дальше страница открывается без интернета.
const CACHE_NAME = "waitingblocks-cache-v2";
const APP_SHELL = [
  "./waitingBlocks.html",
  "./waitingBlocks.js?1",
  "./latenessUtils.js?1",
  "./latecomers.css?1",
  "./jquery-3.7.1.min.js",
  "./manifest-waitingblocks.json",
  "./icons/waitingblocks-192.png",
  "./icons/waitingblocks-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Затрагиваем только файлы этого приложения, остальные запросы не перехватываем.
  const isAppFile = APP_SHELL.some((path) =>
    url.pathname.endsWith(path.replace("./", "/").split("?")[0]),
  );
  if (!isAppFile) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      // Сначала отдаём из кэша (если есть) — быстро и работает офлайн,
      // сеть обновляет кэш в фоне.
      return cached || network;
    }),
  );
});

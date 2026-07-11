// public/sw-im.js
// [D2] PWA Service Worker — 모바일 IM 오프라인 캐싱
// 모바일 IM 뷰어를 오프라인에서도 열람할 수 있도록 캐싱합니다.

const CACHE_NAME = "im-offline-v1";
const CACHE_URLS_PRECACHE = []; // 프리캐시 없음 (런타임 캐싱만)

// 캐시 대상 경로 패턴
function isIMRoute(url) {
  return url.includes("/im-lite/") ||
         url.includes("/api/public/im-lite/");
}

// 정적 자산 경로 패턴
function isStaticAsset(url) {
  return url.includes("/_next/static/") ||
         url.includes("/_next/image");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CACHE_URLS_PRECACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // GET 요청만 캐싱
  if (event.request.method !== "GET") return;

  // IM 라우트: Network-First (신선도 우선, 실패 시 캐시 폴백)
  if (isIMRoute(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(
            (cached) =>
              cached ||
              new Response(
                JSON.stringify({ error: "offline", message: "오프라인 상태입니다. 이전에 열람한 IM만 확인 가능합니다." }),
                { headers: { "Content-Type": "application/json" } }
              )
          )
        )
    );
    return;
  }

  // 정적 자산: Cache-First (성능 최적화)
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
      )
    );
    return;
  }
});

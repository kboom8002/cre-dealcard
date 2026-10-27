// public/sw-im.js
// [D2] PWA Service Worker — 모바일 IM 오프라인 캐싱
// 모바일 IM 뷰어를 오프라인에서도 열람할 수 있도록 캐싱합니다.
//
// [P0-SEC / SEC-7] 보안 하드닝 (v2)
//   - 등록 scope 는 '/im-lite/' 로 한정한다 (mobile-im-viewer.tsx). 과거 v1 은 scope '/' 로 등록되어
//     사이트 전체 요청을 가로챘고, URL 에 "/im-lite/" 가 포함되기만 하면(예: /api/broker/im-lite/job-status,
//     /broker/im-lite/* 미리보기, PPTX 다운로드) 응답을 캐시에 남겼다 → 공용 기기에서 브로커 데이터 잔존.
//   - 이제 같은 출처(same-origin) GET 중 경로가 '/im-lite/' 로 시작하는 문서와 '/_next/static/' 불변 자산만 다룬다.
//   - '/api/', '/broker/', 인증 경로, 바이너리/다운로드(PPTX·PDF 등), Authorization 헤더가 있는 요청,
//     Cache-Control no-store/private · Content-Disposition attachment 응답은 절대 캐시하지 않는다.
//   - activate 시 'im-offline-' 접두사의 이전 캐시(v1 포함)를 모두 삭제한다.
//   - v1 이 scope '/' 로 설치된 기기: 이 스크립트로 업데이트되면 자기 자신을 unregister 한다.
//
// 아래 필터 함수들은 순수 함수이며 src/tests/unit/security/sw-im-filter.test.ts 가 이 파일을 그대로 로드해 검증한다.

const CACHE_PREFIX = "im-offline-";
const CACHE_NAME = CACHE_PREFIX + "v2";

const IM_SCOPE_PATH = "/im-lite/";
const STATIC_ASSET_PREFIX = "/_next/static/";

// 어떤 경우에도 캐시/가로채기 금지 경로
const DENY_PATH_PREFIXES = [
  "/api/",
  "/broker/",
  "/admin/",
  "/auth/",
  "/login",
  "/signup",
  "/logout",
  "/dashboard",
  "/_next/data/",
  "/_next/image",
];

// 바이너리/다운로드 확장자
const BINARY_EXT_RE = /\.(pptx?|pdf|zip|xlsx?|docx?|hwpx?|csv|json)$/i;
// 다운로드 의도를 나타내는 쿼리 키
const DOWNLOAD_QUERY_KEYS = ["download", "dl", "export", "format", "token", "access_token"];

/**
 * 요청 URL 이 이 SW 의 캐시 대상인지 판단한다 (순수 함수).
 * @param {string} urlString  요청 URL (절대 URL)
 * @param {string} origin     SW 의 origin (self.location.origin)
 * @param {{ method?: string, hasAuthorization?: boolean }} [opts]
 * @returns {"im" | "static" | null}  "im" = network-first, "static" = cache-first, null = 가로채지 않음
 */
function classifyRequest(urlString, origin, opts) {
  const method = ((opts && opts.method) || "GET").toUpperCase();
  if (method !== "GET") return null;
  if (opts && opts.hasAuthorization) return null;

  let url;
  try {
    url = new URL(urlString, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;

  const path = url.pathname;
  for (const prefix of DENY_PATH_PREFIXES) {
    if (path === prefix || path.startsWith(prefix)) return null;
  }

  if (path.startsWith(STATIC_ASSET_PREFIX)) return "static";

  if (!path.startsWith(IM_SCOPE_PATH)) return null;
  if (BINARY_EXT_RE.test(path)) return null;
  for (const key of DOWNLOAD_QUERY_KEYS) {
    if (url.searchParams.has(key)) return null;
  }
  return "im";
}

/** classifyRequest 의 boolean 버전. (SW 런타임에서는 미사용 — 테스트·외부 검증용 공개 헬퍼) */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function shouldCache(urlString, origin, opts) {
  return classifyRequest(urlString, origin, opts) !== null;
}

// 다운로드성 바이너리 (PPTX = application/vnd.openxmlformats-…, PDF, ZIP, HWP 등)
const BINARY_CONTENT_TYPE_RE =
  /^application\/(octet-stream|pdf|zip|x-zip-compressed|vnd\.|msword|x-hwp|haansoft)/i;

/**
 * 응답을 캐시에 저장해도 되는지 판단한다 (순수 함수).
 * @param {{ ok: boolean, status: number, type?: string, headers: { get(name: string): string | null } }} response
 * @param {"im" | "static"} kind
 */
function isCacheableResponse(response, kind) {
  if (!response || !response.ok || response.status !== 200) return false;
  if (response.type && response.type !== "basic" && response.type !== "default") return false;
  if (response.redirected) return false;

  const cacheControl = (response.headers.get("cache-control") || "").toLowerCase();
  if (cacheControl.includes("no-store") || cacheControl.includes("private")) return false;

  const disposition = (response.headers.get("content-disposition") || "").toLowerCase();
  if (disposition.includes("attachment")) return false;

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (BINARY_CONTENT_TYPE_RE.test(contentType)) return false;
  if (kind === "im") {
    // IM 문서(HTML) 와 RSC 페이로드만 허용
    // 참고: force-dynamic 페이지는 Next 가 `private, no-store` 를 보내므로 위에서 이미 제외된다
    //       (로그인 뷰어별로 렌더가 달라질 수 있어 공용 기기 잔존을 막기 위한 의도된 동작).
    if (!(contentType.startsWith("text/html") || contentType.startsWith("text/x-component"))) return false;
  }
  return true;
}

/** 이 SW 의 등록 scope 가 사이트 루트('/') 인지 (v1 레거시 설치) */
function isLegacyRootScope(scopeUrl) {
  try {
    return new URL(scopeUrl).pathname === "/";
  } catch {
    return false;
  }
}

const OFFLINE_HTML =
  '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  "<title>오프라인</title><body style=\"font-family:sans-serif;padding:24px\">" +
  "<p>오프라인 상태입니다. 이전에 열람한 IM만 확인할 수 있습니다.</p></body></html>";

// ── Service Worker 런타임 (테스트 환경에서는 self 가 없거나 스텁이다) ─────────────────
if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  self.addEventListener("install", () => {
    self.skipWaiting();
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        // v1 포함 이전 버전 캐시 삭제 (다른 기능의 캐시는 건드리지 않음)
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        );

        // scope '/' 로 설치된 레거시 등록이면 현재 캐시까지 지우고 스스로 해제한다.
        if (self.registration && isLegacyRootScope(self.registration.scope)) {
          await caches.delete(CACHE_NAME);
          await self.registration.unregister();
          return;
        }
        await self.clients.claim();
      })()
    );
  });

  self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (self.registration && isLegacyRootScope(self.registration.scope)) return;

    const kind = classifyRequest(request.url, self.location.origin, {
      method: request.method,
      hasAuthorization: request.headers.has("authorization"),
    });
    if (!kind) return; // 브라우저 기본 동작 (가로채지 않음)

    if (kind === "im") {
      // Network-First (신선도 우선, 실패 시 캐시 폴백)
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (isCacheableResponse(response, "im")) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() =>
            caches.match(request, { cacheName: CACHE_NAME }).then(
              (cached) =>
                cached ||
                (request.mode === "navigate"
                  ? new Response(OFFLINE_HTML, {
                      status: 503,
                      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
                    })
                  : Response.error())
            )
          )
      );
      return;
    }

    // 정적 자산(/_next/static, 해시 파일명 = 불변): Cache-First
    event.respondWith(
      caches.match(request, { cacheName: CACHE_NAME }).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (isCacheableResponse(response, "static")) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
  });
}

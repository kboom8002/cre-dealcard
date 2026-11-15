export const QA_ACCESS_KEY_STORAGE = "credeal-qa-access-key-v1";

/**
 * URL 쿼리(?qaKey=...)에서 전달된 QA 인증키를 브라우저 저장소에 동기화합니다.
 */
export function syncQaKeyFromSearchParams(
  searchParams?: URLSearchParams | { get(name: string): string | null } | null
): string {
  if (typeof window === "undefined") return "";
  try {
    const fromSp = searchParams?.get("qaKey")?.trim();
    const fromLoc = new URLSearchParams(window.location.search).get("qaKey")?.trim();
    const resolved = fromSp || fromLoc || "";
    if (resolved) {
      try {
        window.sessionStorage.setItem(QA_ACCESS_KEY_STORAGE, resolved);
      } catch {
        // ignore storage errors
      }
      try {
        window.localStorage.setItem(QA_ACCESS_KEY_STORAGE, resolved);
      } catch {
        // ignore storage errors
      }
      return resolved;
    }
  } catch {
    // ignore URL errors
  }
  return getStoredQaAccessKey();
}

export function setStoredQaAccessKey(key: string): void {
  if (typeof window === "undefined") return;
  const trimmed = key.trim();
  try {
    if (trimmed) {
      window.sessionStorage.setItem(QA_ACCESS_KEY_STORAGE, trimmed);
      window.localStorage.setItem(QA_ACCESS_KEY_STORAGE, trimmed);
    } else {
      window.sessionStorage.removeItem(QA_ACCESS_KEY_STORAGE);
      window.localStorage.removeItem(QA_ACCESS_KEY_STORAGE);
    }
  } catch {
    // ignore storage errors
  }
}

export function getStoredQaAccessKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("qaKey")?.trim();
    if (fromUrl) return fromUrl;
  } catch {
    // ignore URL errors
  }
  try {
    const fromSession = window.sessionStorage.getItem(QA_ACCESS_KEY_STORAGE)?.trim();
    if (fromSession) return fromSession;
  } catch {
    // ignore storage errors
  }
  try {
    const fromLocal = window.localStorage.getItem(QA_ACCESS_KEY_STORAGE)?.trim();
    if (fromLocal) return fromLocal;
  } catch {
    // ignore storage errors
  }
  return "";
}

export function buildQaAuthHeaders(): Record<string, string> {
  const key = getStoredQaAccessKey();
  return key ? { "x-qa-access-key": key } : {};
}

export function appendQaParamsToHref(href: string): string {
  if (!href) return href;
  try {
    const isRelative = href.startsWith("/");
    const url = isRelative
      ? new URL(href, "https://credeal.local")
      : new URL(href);
    if (!isRelative && typeof window !== "undefined" && url.origin !== window.location.origin) {
      return href;
    }
    if (!url.searchParams.has("qa")) {
      url.searchParams.set("qa", "1");
    }
    const key = getStoredQaAccessKey();
    if (key && !url.searchParams.has("qaKey")) {
      url.searchParams.set("qaKey", key);
    }
    return isRelative ? `${url.pathname}${url.search}${url.hash}` : url.toString();
  } catch {
    return href;
  }
}

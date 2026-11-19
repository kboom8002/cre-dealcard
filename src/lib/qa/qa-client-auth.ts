export const QA_ACCESS_KEY_STORAGE = "credeal-qa-access-key-v1";
export const QA_TESTER_KEY_STORAGE = "credeal-qa-tester-key-v1";
export const QA_BROKER_KEY_STORAGE = "credeal-qa-broker-key-v1";
export const QA_ACTIVE_ROLE_STORAGE = "credeal-qa-active-role-v1";

export type QaPortalRole = "tester" | "broker" | "master";

type SearchParamLike =
  | URLSearchParams
  | { get(name: string): string | null }
  | null
  | undefined;

export function resolveQaPortalRole(
  pathname?: string | null,
  explicitRole?: string | null
): QaPortalRole {
  if (
    explicitRole === "tester" ||
    explicitRole === "broker" ||
    explicitRole === "master"
  ) {
    return explicitRole;
  }

  const effectivePath =
    pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "");

  if (effectivePath.startsWith("/qa-tester")) {
    return "tester";
  }
  if (effectivePath.startsWith("/qa-broker")) {
    return "broker";
  }

  if (typeof window !== "undefined") {
    try {
      const urlRole = new URLSearchParams(window.location.search).get("qaRole");
      if (urlRole === "tester" || urlRole === "broker" || urlRole === "master") {
        return urlRole;
      }
      if (
        !effectivePath.startsWith("/qa-signoff") &&
        !effectivePath.startsWith("/qa-showcase")
      ) {
        const storedRole =
          window.sessionStorage.getItem(QA_ACTIVE_ROLE_STORAGE) ||
          window.localStorage.getItem(QA_ACTIVE_ROLE_STORAGE);
        if (storedRole === "tester" || storedRole === "broker") {
          return storedRole;
        }
      }
    } catch {
      // ignore storage/URL errors
    }
  }

  return "master";
}

function getStorageKeyForRole(role: QaPortalRole): string {
  if (role === "tester") return QA_TESTER_KEY_STORAGE;
  if (role === "broker") return QA_BROKER_KEY_STORAGE;
  return QA_ACCESS_KEY_STORAGE;
}

export function syncQaKeyFromSearchParams(
  searchParams?: SearchParamLike,
  roleOverride?: QaPortalRole
): string {
  let rawKey = searchParams?.get("qaKey")?.trim() || "";
  const urlRole = searchParams?.get("qaRole")?.trim() || null;

  if (!rawKey && typeof window !== "undefined") {
    try {
      rawKey =
        new URLSearchParams(window.location.search).get("qaKey")?.trim() || "";
    } catch {
      rawKey = "";
    }
  }

  const resolvedRole =
    roleOverride ??
    resolveQaPortalRole(
      typeof window !== "undefined" ? window.location.pathname : undefined,
      urlRole
    );

  if (typeof window !== "undefined") {
    try {
      if (resolvedRole === "tester" || resolvedRole === "broker") {
        window.sessionStorage.setItem(QA_ACTIVE_ROLE_STORAGE, resolvedRole);
        window.localStorage.setItem(QA_ACTIVE_ROLE_STORAGE, resolvedRole);
      }
    } catch {
      // ignore storage errors
    }
  }

  if (rawKey) {
    setStoredQaAccessKey(rawKey, resolvedRole);
    return rawKey;
  }

  return getStoredQaAccessKey(resolvedRole);
}

export function setStoredQaAccessKey(key: string, role?: QaPortalRole): void {
  if (typeof window === "undefined") return;
  const resolvedRole = role ?? resolveQaPortalRole();
  const storageKey = getStorageKeyForRole(resolvedRole);
  const trimmed = key.trim();

  try {
    if (trimmed) {
      window.sessionStorage.setItem(storageKey, trimmed);
      window.localStorage.setItem(storageKey, trimmed);
      if (resolvedRole === "tester" || resolvedRole === "broker") {
        window.sessionStorage.setItem(QA_ACTIVE_ROLE_STORAGE, resolvedRole);
        window.localStorage.setItem(QA_ACTIVE_ROLE_STORAGE, resolvedRole);
      }
    } else {
      window.sessionStorage.removeItem(storageKey);
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // ignore storage errors
  }
}

export function getStoredQaAccessKey(role?: QaPortalRole): string {
  if (typeof window === "undefined") return "";
  const resolvedRole = role ?? resolveQaPortalRole();
  const storageKey = getStorageKeyForRole(resolvedRole);

  try {
    const fromSession = window.sessionStorage.getItem(storageKey)?.trim();
    if (fromSession) return fromSession;

    const fromLocal = window.localStorage.getItem(storageKey)?.trim();
    if (fromLocal) return fromLocal;

    // If role-specific key is empty, allow PM master key fallback
    if (resolvedRole !== "master") {
      const masterSession = window.sessionStorage
        .getItem(QA_ACCESS_KEY_STORAGE)
        ?.trim();
      if (masterSession) return masterSession;
      const masterLocal = window.localStorage
        .getItem(QA_ACCESS_KEY_STORAGE)
        ?.trim();
      if (masterLocal) return masterLocal;
    }
  } catch {
    // ignore storage errors
  }
  return "";
}

export function buildQaAuthHeaders(role?: QaPortalRole): Record<string, string> {
  const key = getStoredQaAccessKey(role);
  return key ? { "x-qa-access-key": key } : {};
}

export function getQaSignoffHrefForRole(role?: QaPortalRole): string {
  const resolvedRole = role ?? resolveQaPortalRole();
  if (resolvedRole === "tester") return appendQaParamsToHref("/qa-tester/signoff", "tester");
  if (resolvedRole === "broker") return appendQaParamsToHref("/qa-broker/signoff", "broker");
  return appendQaParamsToHref("/qa-signoff", "master");
}

export function getQaShowcaseHrefForRole(role?: QaPortalRole): string {
  const resolvedRole = role ?? resolveQaPortalRole();
  if (resolvedRole === "tester") return appendQaParamsToHref("/qa-tester/showcase", "tester");
  if (resolvedRole === "broker") return appendQaParamsToHref("/qa-broker/showcase", "broker");
  return appendQaParamsToHref("/qa-showcase", "master");
}

export function appendQaParamsToHref(
  href: string,
  role?: QaPortalRole
): string {
  if (!href || typeof window === "undefined") {
    return href;
  }

  const resolvedRole = role ?? resolveQaPortalRole();
  const key = getStoredQaAccessKey(resolvedRole);

  let currentHasQa = false;
  try {
    const currentParams = new URLSearchParams(window.location.search);
    currentHasQa = currentParams.get("qa") === "1";
  } catch {
    currentHasQa = false;
  }

  const shouldAttachQa =
    currentHasQa ||
    Boolean(key) ||
    resolvedRole === "tester" ||
    resolvedRole === "broker" ||
    href.includes("qa=1");

  if (!shouldAttachQa) {
    return href;
  }

  try {
    const isAbsolute = /^https?:\/\//i.test(href);
    const parsed = new URL(href, "http://placeholder.local");
    if (!parsed.searchParams.has("qa")) {
      parsed.searchParams.set("qa", "1");
    }
    if (
      (resolvedRole === "tester" || resolvedRole === "broker") &&
      !parsed.pathname.startsWith("/qa-tester") &&
      !parsed.pathname.startsWith("/qa-broker") &&
      !parsed.searchParams.has("qaRole")
    ) {
      parsed.searchParams.set("qaRole", resolvedRole);
    }
    parsed.searchParams.delete("qaKey");
    parsed.searchParams.delete("key");

    return isAbsolute
      ? parsed.toString()
      : `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return href;
  }
}

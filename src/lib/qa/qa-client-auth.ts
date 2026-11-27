export const QA_ACCESS_KEY_STORAGE = "credeal-qa-access-key-v1";
export const QA_TESTER_KEY_STORAGE = "credeal-qa-tester-key-v1";
export const QA_BROKER_KEY_STORAGE = "credeal-qa-broker-key-v1";
export const QA_ACTIVE_ROLE_STORAGE = "credeal-qa-active-role-v1";
export const QA_BROKER_COHORT_STORAGE = "credeal-qa-broker-cohort-v1";
export const QA_SIGNOFF_SESSION_STORAGE_KEY = "credeal-qa-signoff-session-v1";
export const DEFAULT_BROKER_COHORT = "beta-1";

export type QaPortalRole = "tester" | "broker" | "master";

export interface BrokerCohortSessionIds {
  cohort: string;
  showcaseSessionId: string;
  questionsSessionId: string;
  signoffSessionId: string;
}

type SearchParamLike =
  | URLSearchParams
  | { get(name: string): string | null }
  | null
  | undefined;

export function sanitizeQaCohortSlug(raw?: string | null): string {
  const cleaned = (raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return cleaned || DEFAULT_BROKER_COHORT;
}

function normalizeBrokerCohortSlug(raw?: string | null): string {
  const slug = sanitizeQaCohortSlug(raw);
  return slug === "legacy" || slug === "r1" ? "legacy" : slug;
}

export function resolveQaBrokerCohort(
  searchParams?: SearchParamLike,
  explicitCohort?: string | null
): string {
  const fromExplicit = explicitCohort?.trim() || "";
  const fromSearchParams = searchParams?.get("cohort")?.trim() || "";
  let fromLocation = "";

  if (!fromExplicit && !fromSearchParams && typeof window !== "undefined") {
    try {
      fromLocation =
        new URLSearchParams(window.location.search).get("cohort")?.trim() || "";
    } catch {
      fromLocation = "";
    }
  }

  const explicitCandidate = fromExplicit || fromSearchParams || fromLocation;
  if (explicitCandidate) {
    const cohort = normalizeBrokerCohortSlug(explicitCandidate);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(QA_BROKER_COHORT_STORAGE, cohort);
        window.sessionStorage.setItem(QA_BROKER_COHORT_STORAGE, cohort);
      } catch {
        // ignore storage errors
      }
    }
    return cohort;
  }

  if (typeof window !== "undefined") {
    try {
      const stored =
        window.localStorage.getItem(QA_BROKER_COHORT_STORAGE)?.trim() ||
        window.sessionStorage.getItem(QA_BROKER_COHORT_STORAGE)?.trim() ||
        "";
      if (stored) {
        return normalizeBrokerCohortSlug(stored);
      }
    } catch {
      // ignore storage errors
    }
  }

  return DEFAULT_BROKER_COHORT;
}

const COHORT_SESSION_IDS_CACHE = new Map<string, BrokerCohortSessionIds>();

export function resolveBrokerCohortSessionIds(
  cohort?: string | null
): BrokerCohortSessionIds {
  const c =
    cohort && cohort.trim()
      ? normalizeBrokerCohortSlug(cohort)
      : resolveQaBrokerCohort();

  const cached = COHORT_SESSION_IDS_CACHE.get(c);
  if (cached) {
    return cached;
  }

  const built: BrokerCohortSessionIds =
    c === "legacy"
      ? Object.freeze({
          cohort: "legacy",
          showcaseSessionId: "qa-output-showcase-broker",
          questionsSessionId: "qa-broker-questions-v1",
          signoffSessionId: "qa-signoff-broker",
        })
      : Object.freeze({
          cohort: c,
          showcaseSessionId: `qa-output-showcase-broker-${c}`,
          questionsSessionId: `qa-broker-questions-${c}`,
          signoffSessionId: `qa-signoff-broker-${c}`,
        });

  if (COHORT_SESSION_IDS_CACHE.size < 128) {
    COHORT_SESSION_IDS_CACHE.set(c, built);
  }
  return built;
}

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
      if (resolvedRole === "broker") {
        const cohort = resolveQaBrokerCohort(searchParams);
        const ids = resolveBrokerCohortSessionIds(cohort);
        window.localStorage.setItem(
          QA_SIGNOFF_SESSION_STORAGE_KEY,
          ids.signoffSessionId
        );
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
  let currentExplicitCohort = "";
  try {
    const currentParams = new URLSearchParams(window.location.search);
    currentHasQa = currentParams.get("qa") === "1";
    currentExplicitCohort = currentParams.get("cohort")?.trim() || "";
  } catch {
    currentHasQa = false;
    currentExplicitCohort = "";
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
    if (
      resolvedRole === "broker" &&
      currentExplicitCohort &&
      parsed.pathname.startsWith("/qa-broker") &&
      !parsed.searchParams.has("cohort")
    ) {
      parsed.searchParams.set(
        "cohort",
        sanitizeQaCohortSlug(currentExplicitCohort)
      );
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

const CANONICAL_FALLBACK_SITE_URL = "https://www.credeal.net";

function normalizeSiteUrl(raw: string | undefined): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/\s+/g, "").replace(/\/+$/, "");
  if (!cleaned) return null;
  if (!/^https?:\/\/[^/]/i.test(cleaned)) return null;
  try {
    new URL(cleaned);
    return cleaned;
  } catch {
    return null;
  }
}

/**
 * Canonical public site URL (SSOT, without trailing slash).
 * Precedence: NEXT_PUBLIC_SITE_URL -> NEXT_PUBLIC_APP_BASE_URL -> APP_BASE_URL -> https://www.credeal.net.
 */
export function getCanonicalSiteUrl(): string {
  const candidates: Array<string | undefined> = [
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SITE_URL : undefined,
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_APP_BASE_URL : undefined,
    typeof process !== "undefined" ? process.env.APP_BASE_URL : undefined,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeSiteUrl(candidate);
    if (normalized) return normalized;
  }
  return CANONICAL_FALLBACK_SITE_URL;
}

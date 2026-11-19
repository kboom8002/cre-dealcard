/**
 * Pure In-App WebView (KakaoTalk / Line / Instagram / Facebook / NAVER) detection
 * and external browser escape URL builder.
 *
 * P2 (WP-7.3A): LINE is matched by its UA token (`Line/<version>`) only — a bare
 * `/Line/i` also matched unrelated words such as "Outline"/"Pipeline"/"Linear".
 */
const INAPP_UA_PATTERN = /KAKAOTALK|\bLine\/|Instagram|FBAN|FBAV|NAVER/i;

export function isInAppWebView(ua: string): boolean {
  if (typeof ua !== "string" || !ua) return false;
  return INAPP_UA_PATTERN.test(ua);
}

export function buildKakaoExternalOpenUrl(
  currentUrl: string,
  ua: string
): string | null {
  if (typeof currentUrl !== "string") return null;
  const trimmedUrl = currentUrl.trim();
  if (!/^https?:\/\//i.test(trimmedUrl)) return null;
  if (!isInAppWebView(ua)) return null;

  if (/Android/i.test(ua)) {
    const schemeMatch = trimmedUrl.match(/^(https?):\/\//i);
    const scheme = (schemeMatch?.[1] || "https").toLowerCase();
    const withoutScheme = trimmedUrl.replace(/^https?:\/\//i, "");
    // S.browser_fallback_url: if Chrome is not installed, Android opens the original
    // URL in the default browser instead of failing silently.
    const fallback = encodeURIComponent(trimmedUrl);
    return `intent://${withoutScheme}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
  }

  if (/KAKAOTALK/i.test(ua)) {
    return `kakaotalk://web/openExternal?url=${encodeURIComponent(trimmedUrl)}`;
  }

  return null;
}

export function isExplicitKakaoChannelUrl(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  return /^https?:\/\/(?:open\.kakao\.com|pf\.kakao\.com)\//i.test(trimmed);
}

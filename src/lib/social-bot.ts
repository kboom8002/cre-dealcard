/**
 * Social crawler bot User-Agent detection (shared by proxy.ts and server pages).
 *
 * P0-SEC (SEC-3): proxy.ts lets these UAs reach a small allowlist of /broker/* pages
 * without login so that Kakao/Facebook/etc. can scrape OG meta tags. The pages
 * themselves MUST use {@link isSocialBotUA} to render only a minimal, public-safe
 * shell for such requests (no raw_input, raw_address, tenant names, ...).
 *
 * NOTE: UA strings are trivially spoofable — treat "is bot" only as a hint to render
 * LESS data, never as a reason to render MORE.
 */
export const SOCIAL_BOT_PATTERNS: readonly string[] = [
  'kakaotalk-scrap', 'facebookexternalhit', 'facebot',
  'twitterbot', 'slackbot', 'linkedinbot', 'discordbot',
  'whatsapp', 'telegrambot', 'line/',
  'googlebot', 'bingbot', 'yandex', 'baiduspider',
  'duckduckbot', 'ia_archiver', 'applebot',
];

/** Pure function — case-insensitive substring match against {@link SOCIAL_BOT_PATTERNS}. */
export function isSocialBotUA(ua: string | null | undefined): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return SOCIAL_BOT_PATTERNS.some((p) => lower.includes(p));
}

/**
 * 매거진 공유·QR URL 빌더 (C-04, T2-25a, T3-10, U2-26)
 *
 * - 절대 URL 은 서버가 정한 base URL 로만 만든다. `window.location.origin` 금지
 *   (미리보기·로컬 도메인이 QR/공유 링크에 박제되는 문제, T2-25a).
 * - 카카오 공유 썸네일은 쿼리형 `/api/og/magazine?brokerId=&date=` 절대 URL (경로형은 404, T3-10).
 */

/** base URL 정규화 — 빈 값/잘못된 값이면 null (호출부가 에러 상태로 처리). */
export function normalizeBaseUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return `${u.origin}`;
  } catch {
    return null;
  }
}

/**
 * 클라이언트에서 쓸 수 있는 base URL 결정 순서:
 * 1) 서버가 내려준 prop(`baseUrl`)  2) NEXT_PUBLIC_APP_BASE_URL  3) NEXT_PUBLIC_SITE_URL.
 * 모두 없으면 null — localhost/현재 origin 으로 폴백하지 않는다.
 */
export function resolvePublicBaseUrl(prop?: string | null): string | null {
  return (
    normalizeBaseUrl(prop) ??
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_BASE_URL) ??
    normalizeBaseUrl(process.env.NEXT_PUBLIC_SITE_URL)
  );
}

export function buildSubscribeUrl(opts: {
  baseUrl: string;
  slug: string;
  source?: string;
}): string {
  const { baseUrl, slug, source } = opts;
  const url = new URL(`/magazine/${encodeURIComponent(slug)}/subscribe`, baseUrl);
  if (source) url.searchParams.set('source', source);
  return url.toString();
}

export function buildViewerUrl(opts: { baseUrl: string; slug: string; date: string }): string {
  return new URL(
    `/magazine/${encodeURIComponent(opts.slug)}/${encodeURIComponent(opts.date)}`,
    opts.baseUrl,
  ).toString();
}

/** 카카오/OG 썸네일 — 실제 라우트와 같은 쿼리형 절대 URL */
export function buildOgImageUrl(opts: {
  baseUrl: string;
  slug: string;
  date: string;
}): string {
  const url = new URL('/api/og/magazine', opts.baseUrl);
  url.searchParams.set('brokerId', opts.slug);
  url.searchParams.set('date', opts.date);
  return url.toString();
}

/** 명함 인쇄 추천 문구 — 이름 중복("중개사중개사") 제거, 요일·채널은 설정값 주입 */
export function formatBrokerLabel(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  if (!n || n === '중개사') return '담당 중개사';
  return n;
}

export function buildPrintCopy(opts: {
  weekdayLabel: string;
  brokerName?: string | null;
  channelLabel?: string;
}): string {
  const who = formatBrokerLabel(opts.brokerName);
  const channel = opts.channelLabel ? ` (${opts.channelLabel})` : '';
  return `스마트폰 카메라로 비추시면, 매주 ${opts.weekdayLabel} ${who}의 시장 리포트를 받아보실 수 있습니다${channel}.`;
}

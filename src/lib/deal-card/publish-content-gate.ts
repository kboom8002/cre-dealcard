/**
 * WP-7.3C P1-5 — single content gate shared by every DealCard publish path
 * (summary mark_sent / publish_dealcard, POST /api/broker/dealcards/[id]/publish,
 * POST /api/broker/deal/[id]/teaser/publish, PATCH /api/broker/deal-card/[id]
 * when the item is (or becomes) published/sent).
 *
 * Statutory broker gating (assertPublishable) stays in each route because it needs
 * DB access; this module covers the pure content checks so the publish paths
 * cannot drift apart again:
 *   1. blind-guard (validateBlindPoints) over headline + 3 points + 3 pointBriefs
 *   2. blind price band (validateBlindPriceBand) over the band that is actually
 *      written to the published snapshot (and any client-requested band)
 *   3. placeholder copy (server fallback card4) must never become public
 */
import { validateBlindPoints, type BlindViolation } from './blind-guard';
import { validateBlindPriceBand } from './price-band';

/** Server-side fallback copy used when a card has no real card4 yet. */
export const DEALCARD_PLACEHOLDER_REGION = '서울시 핵심권역';
export const DEALCARD_PLACEHOLDER_POINTS: readonly string[] = ['우수 입지', '추천 매물', '안정 수익'];

export interface DealCardPublishContentInput {
  headline?: string | null;
  region?: string | null;
  use?: string | null;
  area?: string | null;
  priceBand?: string | null;
  points?: readonly (string | null | undefined)[] | null;
  pointBriefs?: readonly (string | null | undefined)[] | null;
}

export type DealCardPublishContentCode =
  | 'DEALCARD_EMPTY_CONTENT'
  | 'BLIND_GUARD_VIOLATION'
  | 'BLIND_PRICE_BAND_INVALID'
  | 'DEALCARD_PLACEHOLDER_COPY';

export type DealCardPublishContentResult =
  | { ok: true }
  | {
      ok: false;
      status: 422;
      code: DealCardPublishContentCode;
      error: string;
      violations?: BlindViolation[];
    };

function cleanStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * True when the card still carries the server fallback copy
 * (region "서울시 핵심권역" or ≥2 of the generic fallback points).
 */
export function hasDealCardPlaceholderCopy(card4: DealCardPublishContentInput | null | undefined): boolean {
  if (!card4) return false;
  if (cleanStr(card4.region) === DEALCARD_PLACEHOLDER_REGION) return true;
  const points = Array.isArray(card4.points) ? card4.points.map(cleanStr) : [];
  const placeholderHits = points.filter((p) => DEALCARD_PLACEHOLDER_POINTS.includes(p)).length;
  return placeholderHits >= 2;
}

/**
 * Pure content gate. `extraPriceBands` lets a route also validate a band that the
 * client requested (e.g. reqBody.priceBand) in addition to the stored card4 band.
 */
export function evaluateDealCardPublishContent(
  card4: DealCardPublishContentInput | null | undefined,
  opts?: { extraPriceBands?: readonly (string | null | undefined)[] },
): DealCardPublishContentResult {
  const headline = cleanStr(card4?.headline);
  const nonEmptyPoints = Array.isArray(card4?.points)
    ? card4.points.map((p) => cleanStr(p)).filter((p) => p.length > 0)
    : [];
  if (!card4 || (!headline && nonEmptyPoints.length === 0)) {
    return {
      ok: false,
      status: 422,
      code: 'DEALCARD_EMPTY_CONTENT',
      error: '발행할 딜카드 핵심 문구가 비어 있습니다.',
    };
  }

  if (hasDealCardPlaceholderCopy(card4)) {
    return {
      ok: false,
      status: 422,
      code: 'DEALCARD_PLACEHOLDER_COPY',
      error: '임시 문구(예: 서울시 핵심권역 · 우수 입지)가 남아 있어 발행할 수 없습니다. 지역과 장점 3줄을 실제 내용으로 바꿔 주세요.',
    };
  }

  // Points first so violation.pointIndex 0..2 still maps onto the 3 point inputs.
  const texts: string[] = [];
  for (const p of Array.isArray(card4.points) ? card4.points : []) {
    texts.push(cleanStr(p));
  }
  if (headline) texts.push(headline);
  for (const b of Array.isArray(card4.pointBriefs) ? card4.pointBriefs : []) {
    const s = cleanStr(b);
    if (s) texts.push(s);
  }
  const region = cleanStr(card4.region);
  if (region) texts.push(region);
  const use = cleanStr(card4.use);
  if (use) texts.push(use);
  const area = cleanStr(card4.area);
  if (area) texts.push(area);

  if (texts.some((t) => t.length > 0)) {
    const blindCheck = validateBlindPoints(texts, {
      region: region || undefined,
      assetType: use || undefined,
    });
    if (!blindCheck.isValid) {
      return {
        ok: false,
        status: 422,
        code: 'BLIND_GUARD_VIOLATION',
        error:
          blindCheck.violations[0]?.reason ||
          '건물 위치가 드러날 수 있는 표현이 포함되어 있습니다.',
        violations: blindCheck.violations,
      };
    }
  }

  const bands = [card4?.priceBand, ...(opts?.extraPriceBands ?? [])]
    .map(cleanStr)
    .filter((b) => b.length > 0);
  for (const band of bands) {
    const bandCheck = validateBlindPriceBand(band);
    if (!bandCheck.valid) {
      return {
        ok: false,
        status: 422,
        code: 'BLIND_PRICE_BAND_INVALID',
        error: bandCheck.reason || '블라인드 가격 구간 형식을 확인해 주세요.',
      };
    }
  }

  return { ok: true };
}

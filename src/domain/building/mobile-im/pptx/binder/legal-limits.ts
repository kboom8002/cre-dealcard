/**
 * 법정 건폐율·용적률 상한 — "공식 조회값만 표시" 정책 (2026-10-10 오너 결정)
 *
 * 배경: `land-use-api.ts` 의 V-World 토지특성 응답에는 % 상한이 없고, 상한은 항상 용도지역명으로
 *       추정(`inferZoningLimits`)된다. 국토계획법 상한·지자체 조례·지구단위계획에 따라 실제 한도가 달라
 *       (예: 창신동 일반상업 — 추정 800% vs 중개인 원본 600%) "법정"으로 표기하면 사실 오류가 된다.
 * 정책: `limitsSource === 'official'` 인 경우(토지이용계획/조례 공식 조회 성공)만 반환, 그 외는 숨김.
 *       현재 공식 소스가 없으므로 사실상 항상 숨김. 공식 소스가 붙으면 그 클라이언트가 'official' 을 설정한다.
 */

export interface LegalLimits {
  bcrMax?: number;
  farMax?: number;
}

const posNum = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[,%\s]/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** enrichment.landUsePlan → 공식 조회된 상한만 */
export function verifiedLegalLimits(lup: Record<string, any> | null | undefined): LegalLimits {
  if (!lup || lup.limitsSource !== 'official') return {};
  return {
    bcrMax: posNum(lup.buildingCoverageMax ?? lup.bcrMax),
    farMax: posNum(lup.floorAreaRatioMax ?? lup.farMax),
  };
}

/** doc.body.ssot_summary → 공식 출처 표식(legal_limits_source='official')이 있을 때만 */
export function verifiedLegalLimitsFromSsot(ssot: Record<string, any> | null | undefined): LegalLimits {
  if (!ssot || ssot.legal_limits_source !== 'official') return {};
  return { bcrMax: posNum(ssot.max_bcr_pct), farMax: posNum(ssot.max_far_pct) };
}

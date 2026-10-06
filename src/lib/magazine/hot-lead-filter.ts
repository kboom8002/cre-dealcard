/**
 * @module hot-lead-filter
 * @description 성과 대시보드 "핫리드" 선별 — 서버가 점수 임계(buyer-temperature 단일 모델)로 판정한다.
 *
 * 핫리드 = 반응 신호가 있는 구독자. 점수 0·냉각·미확인 구독자는 목록에서 제외한다.
 *   tier=warm (기본) : 🔥 적극검토 + 📈 관심  (행동 하한(IM·전화)으로 📈 이 된 구독자 포함 — 티어 기준)
 *   tier=hot         : 🔥 적극검토만
 *   tier=all         : 점수가 1점 이상인 구독자 전체 (점수 0 = 신호 없음은 제외)
 * limit: 기본 10, 상한 100.
 *
 * 순수 함수 — DB·네트워크 없음.
 */
import { TEMPERATURE_TIERS } from '@/domain/magazine/buyer-temperature';

export type HotLeadTier = 'hot' | 'warm' | 'all';

export const HOT_LEAD_DEFAULT_TIER: HotLeadTier = 'warm';
export const HOT_LEAD_DEFAULT_LIMIT = 10;
export const HOT_LEAD_MAX_LIMIT = 100;

const HOT_LABEL = TEMPERATURE_TIERS[0].label; // 🔥 적극검토
const WARM_LABEL = TEMPERATURE_TIERS[1].label; // 📈 관심

export interface HotLeadCandidate {
  buyerTemperature: string;
  score: number;
  lastActiveAt: string | null;
}

/** 쿼리 `tier` 파싱: 없음 → 기본(warm), 알 수 없는 값 → null(호출부가 400) */
export function parseHotLeadTier(raw: string | null | undefined): HotLeadTier | null {
  if (raw == null || raw === '') return HOT_LEAD_DEFAULT_TIER;
  const v = raw.trim().toLowerCase();
  return v === 'hot' || v === 'warm' || v === 'all' ? v : null;
}

/** 쿼리 `limit` 파싱: 없음/비정상 → 기본 10, 1~100 으로 clamp */
export function parseHotLeadLimit(raw: string | null | undefined): number {
  if (raw == null || raw === '') return HOT_LEAD_DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return HOT_LEAD_DEFAULT_LIMIT;
  return Math.min(n, HOT_LEAD_MAX_LIMIT);
}

export function isHotLead(lead: HotLeadCandidate, tier: HotLeadTier): boolean {
  if (tier === 'hot') return lead.buyerTemperature === HOT_LABEL;
  if (tier === 'warm') return lead.buyerTemperature === HOT_LABEL || lead.buyerTemperature === WARM_LABEL;
  return lead.score > 0;
}

const activeMs = (lead: HotLeadCandidate): number => {
  const t = new Date(lead.lastActiveAt ?? 0).getTime();
  return Number.isFinite(t) ? t : 0;
};

/** 조건에 맞는 구독자를 점수 → 최근 활동 순으로 정렬해 limit 만큼 자른다. matched = 자르기 전 일치 수. */
export function selectHotLeads<T extends HotLeadCandidate>(
  leads: readonly T[],
  tier: HotLeadTier,
  limit: number,
): { leads: T[]; matched: number } {
  const matched = leads.filter((l) => isHotLead(l, tier));
  matched.sort((a, b) => b.score - a.score || activeMs(b) - activeMs(a));
  return { leads: matched.slice(0, limit), matched: matched.length };
}

/** 응답 메타 `hotLeadThreshold` — 어떤 기준으로 걸렀는지 클라이언트에 그대로 알린다. */
export function hotLeadThresholdMeta(tier: HotLeadTier): {
  tier: HotLeadTier;
  minScore: number;
  tierLabels: string[] | null;
  rule: string;
} {
  if (tier === 'hot') {
    return { tier, minScore: TEMPERATURE_TIERS[0].minScore, tierLabels: [HOT_LABEL], rule: `${HOT_LABEL} 등급만` };
  }
  if (tier === 'warm') {
    return {
      tier,
      minScore: TEMPERATURE_TIERS[1].minScore,
      tierLabels: [HOT_LABEL, WARM_LABEL],
      rule: `${WARM_LABEL} 등급 이상 (최근 IM 요청·전화 클릭은 📈 로 상향)`,
    };
  }
  return { tier, minScore: 1, tierLabels: null, rule: '반응 점수가 있는 구독자 전체 (점수 0 제외)' };
}

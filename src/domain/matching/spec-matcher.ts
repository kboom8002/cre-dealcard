/**
 * spec-matcher.ts — DISTRIBUTION_AND_IDENTITY.md §7 기반 매칭 엔진
 * 
 * ⛔ 불변조건: MatchResult에 매수자의 이름·연락처·식별자가 포함되면 즉시 반려.
 * 우리가 공유하는 것은 매수자가 아니라 매칭 신호뿐입니다.
 */

import { createServiceClient } from '@/lib/supabase/service';
import type { MatchQuery, MatchResult, BuyerCondition } from '../distribution/types';
import { MATCH_AXES, RECENCY_DECAY } from '../distribution/types';

/**
 * 딜에 부합하는 매수자를 보유한 중개인 목록을 반환합니다.
 * scope: 'own' — 자기 매수자만
 * scope: 'org' — 조직 전체 (상호주의 게이트 적용)
 */
export async function matchDeal(query: MatchQuery, callerId: string): Promise<MatchResult[]> {
  const supabase = createServiceClient();

  if (query.scope === 'org') {
    return matchOrg(query.dealId, supabase);
  }

  return matchOwn(query.dealId, callerId, supabase);
}

/**
 * 자기 매수자 매칭 (scope: 'own')
 */
async function matchOwn(
  dealId: string,
  brokerId: string,
  supabase: any,
): Promise<MatchResult[]> {
  // 딜 정보 조회
  const { data: deal } = await supabase
    .from('deals')
    .select('asking_price_man, region, asset_type, purpose_tags')
    .eq('id', dealId)
    .single();

  if (!deal) return [];

  // 자기 매수자 조건 조회
  const { data: conditions } = await supabase
    .from('buyer_condition')
    .select('*, party!inner(id, owner_broker_id, name, retention_until)')
    .eq('party.owner_broker_id', brokerId)
    .gte('party.retention_until', new Date().toISOString().slice(0, 10))
    .neq('confidence', 'low')  // low 단독 매칭 제외
    .order('observed_at', { ascending: false });

  if (!conditions || conditions.length === 0) return [];

  // 조건별 스코어 계산
  const scoredBrokers = aggregateByBroker(conditions, deal);

  return scoredBrokers.map(b => ({
    brokerId: b.brokerId,
    brokerName: b.brokerName || '나',
    matchCount: b.matchCount,
    strength: b.maxScore >= 0.7 ? 'high' as const : 'medium' as const,
    lastActivityBand: b.lastActivityBand,
    financingWarning: b.financingWarning,
  }));
}

/**
 * 조직 매칭 (scope: 'org') — match_org RPC 호출
 * 상호주의 게이트 적용 (기여 매수자 3명 이상)
 */
async function matchOrg(
  dealId: string,
  supabase: any,
): Promise<MatchResult[]> {
  const { data, error } = await supabase.rpc('match_org', { p_deal_id: dealId });

  if (error) {
    if (error.message.includes('Insufficient contribution')) {
      throw new Error('조직 매칭을 이용하려면 최근 6개월간 매수자 3명 이상을 등록해야 합니다.');
    }
    throw error;
  }

  // 브로커 프로필 조회
  const brokerIds = (data || []).map((r: any) => r.broker_id);
  const { data: profiles } = await supabase
    .from('broker_profiles')
    .select('user_id, display_name')
    .in('user_id', brokerIds);

  const nameMap = new Map((profiles || []).map((p: any) => [p.user_id, p.display_name]));

  return (data || []).map((row: any) => ({
    brokerId: row.broker_id,
    brokerName: nameMap.get(row.broker_id) || '중개인',
    matchCount: row.match_count,
    strength: row.strength as 'high' | 'medium',
    lastActivityBand: '최근 활동',
  }));
}

/**
 * 조건을 브로커별로 집계하고 스코어를 계산합니다.
 */
function aggregateByBroker(
  conditions: any[],
  deal: any,
): Array<{
  brokerId: string;
  brokerName: string;
  matchCount: number;
  maxScore: number;
  lastActivityBand: string;
  financingWarning?: boolean;
}> {
  const brokerMap = new Map<string, {
    partyIds: Set<string>;
    maxScore: number;
    lastActivity: Date;
    financingWarning: boolean;
  }>();

  for (const c of conditions) {
    const brokerId = c.party?.owner_broker_id;
    if (!brokerId) continue;

    let entry = brokerMap.get(brokerId);
    if (!entry) {
      entry = { partyIds: new Set(), maxScore: 0, lastActivity: new Date(0), financingWarning: false };
      brokerMap.set(brokerId, entry);
    }

    entry.partyIds.add(c.party_id);

    const score = calculateScore(c, deal);
    const recency = getRecencyWeight(new Date(c.observed_at));
    const weighted = score * recency;

    if (weighted > entry.maxScore) entry.maxScore = weighted;

    const actDate = new Date(c.observed_at);
    if (actDate > entry.lastActivity) entry.lastActivity = actDate;

    // 역레버리지 물건 + 대출 필수 경고
    if (c.financing === '대출 필수' || c.financing === 'loan_required') {
      entry.financingWarning = true;
    }
  }

  return Array.from(brokerMap.entries()).map(([brokerId, entry]) => ({
    brokerId,
    brokerName: '',
    matchCount: entry.partyIds.size,
    maxScore: entry.maxScore,
    lastActivityBand: getActivityBand(entry.lastActivity),
    financingWarning: entry.financingWarning,
  }));
}

/**
 * §7.2 매칭 축별 스코어 계산
 */
function calculateScore(condition: any, deal: any): number {
  let score = 0;

  // Budget overlap (weight: 0.35)
  if (condition.budget_band && deal.asking_price_man) {
    const dealBand = priceToBand(deal.asking_price_man / 10000); // 만원→억
    if (condition.budget_band === dealBand) score += MATCH_AXES.budget.weight;
    else if (isAdjacentBand(condition.budget_band, dealBand)) score += MATCH_AXES.budget.weight * 0.5;
  }

  // Region intersect (weight: 0.25)
  if (condition.regions && deal.region) {
    if (condition.regions.includes(deal.region)) score += MATCH_AXES.region.weight;
  }

  // Asset type intersect (weight: 0.20)
  if (condition.asset_types && deal.asset_type) {
    if (condition.asset_types.includes(deal.asset_type)) score += MATCH_AXES.asset.weight;
  }

  // Purpose compatibility (weight: 0.20)
  if (condition.purpose && deal.purpose_tags) {
    const dealPurposes = Array.isArray(deal.purpose_tags) ? deal.purpose_tags : [deal.purpose_tags];
    if (dealPurposes.includes(condition.purpose)) score += MATCH_AXES.purpose.weight;
  }

  return score;
}

function getRecencyWeight(date: Date): number {
  const monthsAgo = (Date.now() - date.getTime()) / (30 * 86400000);
  if (monthsAgo <= 1) return RECENCY_DECAY.within1m;
  if (monthsAgo <= 3) return RECENCY_DECAY.within3m;
  if (monthsAgo <= 6) return RECENCY_DECAY.within6m;
  return RECENCY_DECAY.over6m;
}

function getActivityBand(date: Date): string {
  const monthsAgo = (Date.now() - date.getTime()) / (30 * 86400000);
  if (monthsAgo <= 1) return '1개월 이내';
  if (monthsAgo <= 3) return '3개월 이내';
  if (monthsAgo <= 6) return '6개월 이내';
  return '6개월 이상';
}

function priceToBand(priceInBillion: number): string {
  if (priceInBillion < 50) return 'under_50';
  if (priceInBillion < 100) return '50_100';
  if (priceInBillion < 200) return '100_200';
  if (priceInBillion < 300) return '200_300';
  return 'over_300';
}

function isAdjacentBand(a: string, b: string): boolean {
  const bands = ['under_50', '50_100', '100_200', '200_300', 'over_300'];
  const ia = bands.indexOf(a);
  const ib = bands.indexOf(b);
  return ia >= 0 && ib >= 0 && Math.abs(ia - ib) === 1;
}

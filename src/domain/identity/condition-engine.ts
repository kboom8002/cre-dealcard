/**
 * condition-engine.ts — 매수 조건 축적 엔진
 * Spec: DISTRIBUTION_AND_IDENTITY.md §6
 * 
 * buyer_condition 테이블은 UPDATE 없이 INSERT만 합니다.
 * 조건은 시간에 따라 변합니다. 덮어쓰면 변화 사실을 잃습니다.
 * 누적하면 변화 자체가 신호가 됩니다.
 */

import { createServiceClient } from '@/lib/supabase/service';
import type { BuyerCondition } from '../distribution/types';

export interface InsertConditionInput {
  partyId: string;
  source: 'gate_form' | 'grant_form' | 'slider' | 'broker_note';
  confidence: 'high' | 'medium' | 'low';
  budgetBand?: string;
  regions?: string[];
  assetTypes?: string[];
  purpose?: string;
  financing?: string;
}

/**
 * 매수 조건을 축적합니다. (INSERT only — UPDATE 절대 금지)
 * 
 * confidence 등급:
 * - gate_form: high (매수자 본인 명시적 제출)
 * - grant_form: high (NDA 단계, 브로커 확인)
 * - slider: medium (자발적이나 탐색적 가능)
 * - broker_note: low (주관적 기억)
 * 
 * ⚠️ low 단독으로는 매칭에 반영하지 않습니다.
 */
export async function insertCondition(input: InsertConditionInput): Promise<BuyerCondition | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('buyer_condition')
    .insert({
      party_id: input.partyId,
      source: input.source,
      confidence: input.confidence,
      budget_band: input.budgetBand,
      regions: input.regions,
      asset_types: input.assetTypes,
      purpose: input.purpose,
      financing: input.financing,
    })
    .select()
    .single();

  if (error) {
    console.error('[condition-engine] Insert failed:', error.message);
    return null;
  }

  return {
    id: data.id,
    partyId: data.party_id,
    source: data.source,
    confidence: data.confidence,
    budgetBand: data.budget_band,
    regions: data.regions,
    assetTypes: data.asset_types,
    purpose: data.purpose,
    financing: data.financing,
    observedAt: data.observed_at,
  };
}

/**
 * Party의 최신 조건을 조회합니다.
 * confidence 최고 + observed_at 최근 조합.
 */
export async function getLatestCondition(partyId: string): Promise<BuyerCondition | null> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from('buyer_condition')
    .select()
    .eq('party_id', partyId)
    .order('confidence', { ascending: false })  // high > medium > low
    .order('observed_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;

  return {
    id: data.id,
    partyId: data.party_id,
    source: data.source,
    confidence: data.confidence,
    budgetBand: data.budget_band,
    regions: data.regions,
    assetTypes: data.asset_types,
    purpose: data.purpose,
    financing: data.financing,
    observedAt: data.observed_at,
  };
}

/**
 * Party의 전체 조건 이력을 조회합니다.
 * 변화 자체가 매칭 신호입니다.
 */
export async function getConditionHistory(partyId: string): Promise<BuyerCondition[]> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from('buyer_condition')
    .select()
    .eq('party_id', partyId)
    .order('observed_at', { ascending: false });

  return (data || []).map(row => ({
    id: row.id,
    partyId: row.party_id,
    source: row.source,
    confidence: row.confidence,
    budgetBand: row.budget_band,
    regions: row.regions,
    assetTypes: row.asset_types,
    purpose: row.purpose,
    financing: row.financing,
    observedAt: row.observed_at,
  }));
}

/**
 * 오염 링크의 행동이 조건에 반영되는 것을 방지합니다.
 * §9-5: 오염 판정된 링크의 행동은 buyer_condition에 반영되지 않는다.
 */
export async function isLinkContaminated(shareToken: string): Promise<boolean> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from('share_link')
    .select('contaminated')
    .eq('token', shareToken)
    .single();

  return data?.contaminated === true;
}

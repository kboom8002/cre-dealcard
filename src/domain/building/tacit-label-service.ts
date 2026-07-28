/**
 * @module TacitLabelService
 * @description CREDEAL v3 Tacit Knowledge Label Service
 * 
 * Captures 1-tap broker feedback tags on deal fallouts and buyer rejections.
 * @see SDD §7 S2-T5
 */

/**
 * Categories for broker feedback tags when a deal does not proceed.
 */
export type TacitLabelCategory = 'deal_fallout' | 'buyer_rejection' | 'price_mismatch' | 'eviction_issue';

/**
 * Represents a single piece of tacit feedback recorded by a broker.
 */
export interface TacitLabelEntry {
  /** Identifier of the broker (수임 mandate holder) */
  brokerId: string;
  /** Identifier of the deal context */
  dealId: string;
  category: TacitLabelCategory;
  reasonCode: string;
  memo?: string;
}

/**
 * Standardized mapping of common reason codes to human-readable Korean business domain terms.
 * Used for quick 1-tap broker feedback.
 */
export const COMMON_REASON_CODES: Record<string, string> = {
  loan_rejected: '대출 심사 부결',
  price_too_high: '희망가 대비 예산 부족',
  parking_shortage: '주차 공간 부족',
  eviction_difficult: '명도 협의 난항',
  building_too_old: '건물 노후화 우려',
  yield_unattractive: '수익률 미달',
};

/**
 * Records a tacit knowledge label from a broker into a persistent format.
 * Translates known reason codes into Korean human-readable descriptions if a custom memo isn't provided.
 * 
 * @param {TacitLabelEntry} entry - The broker's feedback entry.
 * @returns {Record<string, unknown>} The serialized record ready for persistence.
 * @example
 * const record = recordTacitLabel({ brokerId: 'b1', dealId: 'd1', category: 'deal_fallout', reasonCode: 'price_too_high' });
 */
export function recordTacitLabel(entry: TacitLabelEntry): Record<string, unknown> {
  const reasonText = COMMON_REASON_CODES[entry.reasonCode] || entry.reasonCode;

  return {
    broker_id: entry.brokerId,
    deal_id: entry.dealId,
    label_category: entry.category,
    reason_code: entry.reasonCode,
    memo: entry.memo || reasonText,
    created_at: new Date().toISOString(),
  };
}

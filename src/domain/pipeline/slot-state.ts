export type SlotState = 
  | 'pending'
  | 'fetching'
  | 'fetched'
  | 'manual_required'
  | 'broker_entered'
  | 'seller_declared'
  | 'verified'
  | 'failed'
  | 'not_applicable';

export interface SlotStateRecord {
  state: SlotState;
  updatedAt: Date;
  expiresAt?: Date;
  errorReason?: string;
}

export function isStale(record: SlotStateRecord): boolean {
  if (!record.expiresAt) {
    return false;
  }
  return new Date() > record.expiresAt;
}

// ─── AUTH-03.5: 배열 슬롯 상태 (임대차 등) ─────────────────────────────────

/** 배열형 슬롯의 3가지 모드 */
export type ArraySlotState =
  /** 합계만 — 정상 상태 (등급 감산 없음) */
  | { mode: 'total_only'; total: number }
  /** 항목별 완전 입력 */
  | { mode: 'itemized'; items: ArraySlotItem[]; total: number }
  /** 부분 입력 — unaccounted 차액 노출 */
  | { mode: 'partial'; items: ArraySlotItem[]; total: number; unaccounted: number };

export interface ArraySlotItem {
  label: string;
  value: number;
  provenance?: string;
}

/** ArraySlotState가 완전한지 여부 */
export function isArraySlotComplete(state: ArraySlotState): boolean {
  if (state.mode === 'total_only') return true;
  if (state.mode === 'itemized') return true;
  return state.unaccounted === 0;
}

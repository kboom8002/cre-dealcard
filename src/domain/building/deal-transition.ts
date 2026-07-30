/**
 * @module DealTransition
 * @description Manages deal pipeline stage transitions with validation.
 * Ensures deals can only transition through valid stage progressions.
 * @see SDD §6 S1-T12
 */

export type DealStage =
  | 'memo_input'
  | 'deal_card_created'
  | 'data_enriching'
  | 'im_draft'
  | 'im_published'
  | 'buyer_matching'
  | 'buyer_meeting'
  | 'loi_submitted'
  | 'due_diligence'
  | 'closing'
  | 'closed'
  | 'dead';

export interface StageTransition {
  from: DealStage;
  to: DealStage;
  triggeredBy: string; // user_id or 'system'
  triggeredAt: string;
  reason?: string;
}

export interface TransitionResult {
  allowed: boolean;
  from: DealStage;
  to: DealStage;
  reason?: string;
}

/** Valid forward transitions */
const VALID_TRANSITIONS: Record<DealStage, DealStage[]> = {
  memo_input: ['deal_card_created', 'dead'],
  deal_card_created: ['data_enriching', 'dead'],
  data_enriching: ['im_draft', 'deal_card_created', 'dead'],
  im_draft: ['im_published', 'data_enriching', 'dead'],
  im_published: ['buyer_matching', 'im_draft', 'dead'],
  buyer_matching: ['buyer_meeting', 'im_published', 'dead'],
  buyer_meeting: ['loi_submitted', 'buyer_matching', 'dead'],
  loi_submitted: ['due_diligence', 'buyer_meeting', 'dead'],
  due_diligence: ['closing', 'loi_submitted', 'dead'],
  closing: ['closed', 'due_diligence', 'dead'],
  closed: [],
  dead: ['memo_input'], // can revive
};

/** Stage display metadata */
const STAGE_META: Record<DealStage, { label: string; icon: string; order: number }> = {
  memo_input: { label: '메모 입력', icon: '📝', order: 0 },
  deal_card_created: { label: '딜카드 생성', icon: '🃏', order: 1 },
  data_enriching: { label: '데이터 보강', icon: '📊', order: 2 },
  im_draft: { label: 'IM 초안', icon: '📄', order: 3 },
  im_published: { label: 'IM 발행', icon: '📨', order: 4 },
  buyer_matching: { label: '바이어 매칭', icon: '🎯', order: 5 },
  buyer_meeting: { label: '미팅/임장', icon: '🤝', order: 6 },
  loi_submitted: { label: 'LOI 제출', icon: '📋', order: 7 },
  due_diligence: { label: '실사', icon: '🔍', order: 8 },
  closing: { label: '클로징', icon: '⚖️', order: 9 },
  closed: { label: '성사', icon: '✅', order: 10 },
  dead: { label: '종료', icon: '❌', order: -1 },
};

/**
 * Validates whether a stage transition is allowed.
 */
export function validateTransition(from: DealStage, to: DealStage): TransitionResult {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    return {
      allowed: false,
      from,
      to,
      reason: `'${STAGE_META[from]?.label}' 단계에서 '${STAGE_META[to]?.label}' 단계로의 전환은 허용되지 않습니다.`,
    };
  }
  return { allowed: true, from, to };
}

/**
 * Returns the next valid stages from the current stage.
 */
export function getNextStages(current: DealStage): DealStage[] {
  return VALID_TRANSITIONS[current] || [];
}

/**
 * Returns display metadata for a stage.
 */
export function getStageMetadata(stage: DealStage): { label: string; icon: string; order: number } {
  return STAGE_META[stage] ?? { label: stage, icon: '❓', order: -1 };
}

/**
 * Returns all stages in pipeline order.
 */
export function getAllStagesOrdered(): { stage: DealStage; label: string; icon: string; order: number }[] {
  return Object.entries(STAGE_META)
    .filter(([, meta]) => meta.order >= 0)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([stage, meta]) => ({ stage: stage as DealStage, ...meta }));
}

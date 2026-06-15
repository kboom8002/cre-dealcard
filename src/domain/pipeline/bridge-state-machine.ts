/**
 * Bridge State Machine — Phase 2 ⑤
 * Tracks deal lifecycle stages with handoff_contract validation
 *
 * Pipeline:
 *   memo_input → deal_card_created → gate_requested →
 *   im_created → buyer_meeting → loi → contract → closed/failed
 */

export type DealStage =
  | 'memo_input'
  | 'deal_card_created'
  | 'gate_requested'
  | 'im_created'
  | 'buyer_meeting'
  | 'loi'
  | 'contract'
  | 'closed'
  | 'failed';

export interface BridgeTransition {
  from: DealStage;
  to: DealStage;
  requiredFields: string[];     // fields that must be in metadata
  holdWarningDays: number;      // warn if stuck this long
}

export interface TransitionResult {
  valid: boolean;
  missing: string[];
  holdWarning: boolean;
  holdDays: number;
}

// ─── Bridge Contracts ──────────────────────────────────────────────────

export const BRIDGE_CONTRACTS: BridgeTransition[] = [
  {
    from: 'memo_input',
    to: 'deal_card_created',
    requiredFields: ['building_ssot_lite_id'],
    holdWarningDays: 1,
  },
  {
    from: 'deal_card_created',
    to: 'gate_requested',
    requiredFields: ['gate_request_id'],
    holdWarningDays: 7,
  },
  {
    from: 'gate_requested',
    to: 'im_created',
    requiredFields: ['im_project_id', 'readiness_score'],
    holdWarningDays: 7,
  },
  {
    from: 'im_created',
    to: 'buyer_meeting',
    requiredFields: ['buyer_intent_lite_id', 'match_grade'],
    holdWarningDays: 14,
  },
  {
    from: 'buyer_meeting',
    to: 'loi',
    requiredFields: ['buyer_reaction', 'price_gap'],
    holdWarningDays: 14,
  },
  {
    from: 'loi',
    to: 'contract',
    requiredFields: ['agreed_price', 'key_conditions'],
    holdWarningDays: 21,
  },
  {
    from: 'contract',
    to: 'closed',
    requiredFields: ['closing_date', 'fund_confirmed'],
    holdWarningDays: 30,
  },
];

// ─── Validate Transition ───────────────────────────────────────────────

export function validateBridgeTransition(
  from: DealStage,
  to: DealStage,
  metadata: Record<string, unknown>,
  enteredAt: string,
): TransitionResult {
  const contract = BRIDGE_CONTRACTS.find((b) => b.from === from && b.to === to);

  if (!contract) {
    return {
      valid: false,
      missing: [],
      holdWarning: false,
      holdDays: 0,
    };
  }

  const missing = contract.requiredFields.filter((f) => !metadata[f]);
  const holdDays = Math.floor(
    (Date.now() - new Date(enteredAt).getTime()) / 86_400_000,
  );
  const holdWarning = holdDays >= contract.holdWarningDays;

  return {
    valid: missing.length === 0,
    missing,
    holdWarning,
    holdDays,
  };
}

// ─── Stage labels (Korean) ─────────────────────────────────────────────

export const STAGE_LABELS: Record<DealStage, string> = {
  memo_input:        '메모 입력',
  deal_card_created: '딜카드 생성됨',
  gate_requested:    '자료 요청됨',
  im_created:        'IM 작성 중',
  buyer_meeting:     '매수자 미팅',
  loi:               'LOI 진행 중',
  contract:          '계약 중',
  closed:            '거래 완료',
  failed:            '딜 무산',
};

export const STAGE_HOLD_WARNINGS: Record<DealStage, string> = {
  memo_input:        '',
  deal_card_created: '딜카드 생성 후 7일 경과 — Gate 요청을 진행해보세요',
  gate_requested:    '자료 요청 후 7일 경과 — 매수자에게 연락해보세요',
  im_created:        'IM 생성 후 14일 경과 — 미팅 일정을 잡아보세요',
  buyer_meeting:     '미팅 후 14일 경과 — LOI 의향을 확인해보세요',
  loi:               'LOI 후 21일 경과 — 계약 진행 상황을 확인하세요',
  contract:          '계약 후 30일 경과 — 잔금 일정을 확인하세요',
  closed:            '',
  failed:            '',
};

// 전환 버튼용 액션 레이블 (UX 개선)
export const STAGE_ACTION_LABELS: Record<DealStage, string> = {
  memo_input:        '메모 입력 완료',
  deal_card_created: '딜카드 생성',
  gate_requested:    '📩 자료 요청 접수 처리',
  im_created:        '📝 IM 작성 시작',
  buyer_meeting:     '🤝 매수자 미팅 진행',
  loi:               '✍️ LOI 수취',
  contract:          '📑 계약 진행',
  closed:            '🎉 거래 완료 (클로징)',
  failed:            '❌ 딜 무산 처리',
};

// ─── Allowed transitions ───────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<DealStage, DealStage[]> = {
  memo_input:        ['deal_card_created'],
  deal_card_created: ['gate_requested', 'im_created', 'failed'],
  gate_requested:    ['im_created', 'failed'],
  im_created:        ['buyer_meeting', 'failed'],
  buyer_meeting:     ['loi', 'failed'],
  loi:               ['contract', 'failed'],
  contract:          ['closed', 'failed'],
  closed:            [],
  failed:            [],
};

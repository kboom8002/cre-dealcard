export type LeaseStage =
  | "listing_created"
  | "matching"
  | "viewing"
  | "negotiation"
  | "contract"
  | "active"
  | "expired";

export interface LeaseTransitionContract {
  from: LeaseStage;
  to: LeaseStage;
  requiredFields: string[];
  holdWarningDays: number;
}

export const LEASE_STAGE_LABELS: Record<LeaseStage, string> = {
  listing_created: "임대물건 등록됨",
  matching: "임차인 매칭 중",
  viewing: "임차 공간 답사",
  negotiation: "조건 조율 중",
  contract: "임대차 계약 체결",
  active: "임대 계약 활성",
  expired: "임대 만기 이탈",
};

export const LEASE_STAGE_HOLD_WARNINGS: Record<LeaseStage, string> = {
  listing_created: "임대 물건 등록 후 7일 경과 — AI 임차인 매칭을 가동해보세요",
  matching: "매칭 진행 후 14일 경과 — 매칭 후보 임차인에게 안내문을 공유하세요",
  viewing: "공간 답사 후 10일 경과 — 계약 조건 및 임대차 제안서 작성을 유도하세요",
  negotiation: "조건 협상 후 14일 경과 — 임대조건 조율을 서둘러 진행하세요",
  contract: "계약 후 15일 경과 — 보증금 입금 및 입주 예정일을 최종 점검하세요",
  active: "임대 계약이 활성화되어 관리 중입니다",
  expired: "임대차 만기로 딜이 종료되었습니다",
};

export const LEASE_VALID_TRANSITIONS: Record<LeaseStage, LeaseStage[]> = {
  listing_created: ["matching", "expired"],
  matching: ["viewing", "expired"],
  viewing: ["negotiation", "expired"],
  negotiation: ["contract", "expired"],
  contract: ["active", "expired"],
  active: ["expired"],
  expired: [],
};

export function validateLeaseTransition(
  from: LeaseStage,
  to: LeaseStage,
  metadata: Record<string, unknown>,
  enteredAt: string
) {
  const allowed = LEASE_VALID_TRANSITIONS[from] || [];
  const isValidStage = allowed.includes(to);

  const holdDays = Math.floor(
    (Date.now() - new Date(enteredAt).getTime()) / 86_400_000
  );

  return {
    valid: isValidStage,
    holdDays,
    holdWarning: holdDays >= 14, // Generic default warning at 14 days
  };
}

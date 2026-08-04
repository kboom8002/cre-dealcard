export interface VerificationRecord {
  dealId: string;
  brokerId: string;
  slotGroups: string[];
  signedAt: string;
  ipHash: string;
  statement: string;  // 고정 문구 — 임의 변경 불가
}

export const VERIFICATION_STATEMENT = '본인은 위 사항이 사실과 다르지 않음을 확인합니다.';

export function signVerification(dealId: string, brokerId: string, slotGroups: string[], ipHash: string): VerificationRecord {
  return {
    dealId,
    brokerId,
    slotGroups,
    signedAt: new Date().toISOString(),
    ipHash,
    statement: VERIFICATION_STATEMENT,
  };
}

// ── PIPE-06.2: 검수 서명 provenance 격상 ──────────────────────────────────

/** 검수 대상 제외 provenance (자동 수집) */
const AUTO_COLLECTED_PROVENANCES = new Set(['public_data', 'ai_inferred', 'assumed']);

/**
 * 검수 서명 시 해당 슬롯의 provenance를 'verified'로 격상
 * 자동 수집 건은 검수 대상에서 제외
 */
export function applyVerificationUpgrade(
  slots: Array<{ key: string; provenance: string; value: unknown }>,
  verifierId: string,
): Array<{ key: string; provenance: string; upgraded: boolean; skipped: boolean }> {
  return slots.map(slot => {
    // 자동 수집 건은 검수 대상에서 제외
    if (AUTO_COLLECTED_PROVENANCES.has(slot.provenance)) {
      return { key: slot.key, provenance: slot.provenance, upgraded: false, skipped: true };
    }
    // broker_input, seller_declared → verified 격상
    return {
      key: slot.key,
      provenance: 'expert_verified',
      upgraded: true,
      skipped: false,
    };
  });
}

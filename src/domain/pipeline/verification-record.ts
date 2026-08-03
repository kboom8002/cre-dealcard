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

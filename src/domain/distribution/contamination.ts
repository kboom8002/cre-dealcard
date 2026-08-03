/**
 * contamination.ts — 전달 오염 탐지
 * Spec: DISTRIBUTION_AND_IDENTITY.md §2.3
 * 
 * 토큰 링크 재전달 시 A의 행동이 B로 기록되는 오염을 탐지합니다.
 * 4번째 새 기기가 열면 오염 판정 → Recipient 귀속 차단, 브로커 알림.
 */

export const CONTAMINATION_POLICY = {
  maxDistinctViewers: 3,
  windowDays: 30,
} as const;

export interface ContaminationResult {
  contaminated: boolean;
  attributeToRecipient: boolean;
  notifyBroker?: string;
}

/**
 * 오염 여부를 평가합니다.
 * @param distinctViewers - 해당 링크를 열람한 고유 기기 수
 */
export function evaluateContamination(distinctViewers: number): ContaminationResult {
  if (distinctViewers > CONTAMINATION_POLICY.maxDistinctViewers) {
    return {
      contaminated: true,
      attributeToRecipient: false,
      notifyBroker: '이 링크가 다른 분께 전달된 것으로 보입니다.',
    };
  }
  return { contaminated: false, attributeToRecipient: true };
}

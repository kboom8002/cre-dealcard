/**
 * teaser-rules.ts — 딜카드 블라인드 티저 노출 및 밴딩 규칙
 * Spec: docs/imup/04_screen/DEAL_CARD_SPEC.md (§1.4, §2, §3)
 */

export interface SlotDef {
  key: string;
  visibility?: 'public' | 'full' | 'broker_internal';
  audience?: 'public' | 'broker_internal';
  b2cLabel?: string;
  [key: string]: any;
}

/**
 * 슬롯 하나를 딜카드에 노출할지 결정하는 유일한 기준
 * - public 공개 정책 준수
 * - broker_internal 내부 지표 배제
 * - b2cLabel 미보유 시 노출 불가 (타입 레벨 누출 방지)
 */
export function isTeaserVisible(slot: SlotDef): boolean {
  if (slot.visibility !== 'public') return false;
  if (slot.audience === 'broker_internal') return false;
  if (!slot.b2cLabel) return false;
  return true;
}

/**
 * 매각 희망가 밴딩 포맷터
 * 정확한 호가를 감추고 호기심을 유도하는 밴드 표기
 * - 예: 195억 원 -> "190억 원대"
 * - 예: 85억 원 -> "80억 원대"
 * - 예: 1,200억 원 -> "1,200억 원대"
 */
export function formatBandedPrice(priceKrw: number): string {
  if (!priceKrw || priceKrw <= 0) return '가격 협의';

  const manwon = Math.floor(priceKrw / 10000);
  const uk = manwon / 10000;

  if (uk >= 10) {
    // 10억 이상: 10억 단위 버림 (예: 195억 -> 190억, 85억 -> 80억, 125억 -> 120억)
    const bandedUk = Math.floor(uk / 10) * 10;
    return `${bandedUk.toLocaleString()}억 원대`;
  } else {
    // 10억 미만
    const bandedUk = Math.floor(uk);
    return `${bandedUk}억 원대`;
  }
}

/**
 * 수익률 밴딩 포맷터
 * 소수점 정밀값을 초반/중반/후반 밴드로 마스킹
 * - 예: 2.1% -> "2%대 초반"
 * - 예: 4.5% -> "4%대 중반"
 * - 예: 5.8% -> "5%대 후반"
 */
export function formatBandedYield(yieldPct: number | null | undefined): string {
  if (yieldPct === null || yieldPct === undefined || yieldPct <= 0) {
    return '수익률 산정 중';
  }

  const intPart = Math.floor(yieldPct);
  const decimalPart = yieldPct - intPart;

  let subBand = '중반';
  if (decimalPart < 0.35) {
    subBand = '초반';
  } else if (decimalPart >= 0.65) {
    subBand = '후반';
  }

  return `${intPart}%대 ${subBand}`;
}

/**
 * 딜카드 3단 CTA 단계 모델
 * 1. 질문 (Inquiry) - 가벼운 질문, 개인정보 불필요
 * 2. 관심 (Curiosity) - 북마크/공유
 * 3. 상세 요청 (Detail Request) - Party 확정 (성명, 연락처, 동의)
 */
export type TeaserCTAStage = 'inquiry' | 'curiosity' | 'detail_request';

export interface TeaserCTAAction {
  stage: TeaserCTAStage;
  label: string;
  requiresPartyAuth: boolean;
}

export const TEASER_CTA_ACTIONS: Record<TeaserCTAStage, TeaserCTAAction> = {
  inquiry: {
    stage: 'inquiry',
    label: '간편 질문하기',
    requiresPartyAuth: false,
  },
  curiosity: {
    stage: 'curiosity',
    label: '관심 매물 저장',
    requiresPartyAuth: false,
  },
  detail_request: {
    stage: 'detail_request',
    label: '상세 IM 리포트 요청',
    requiresPartyAuth: true,
  },
};

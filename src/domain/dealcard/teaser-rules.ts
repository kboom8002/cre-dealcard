import { formatKrw, getBandWidth } from '@/lib/deal-card/price-band';

/**
 * teaser-rules.ts — 딜카드 블라인드 티저 노출 및 밴딩 규칙
 * Spec: docs/imup/04_screen/DEAL_CARD_SPEC.md (§1.4, §2, §3)
 */

const EOK_KRW = 1_0000_0000;
const MAN_KRW = 1_0000;

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
 * 매각 희망가 밴딩 포맷터 (price-band SSOT 위임)
 * 정확한 호가를 감추고 최소 5% 이상 폭 + 조/억/만 단위 밴드 표기
 * - 예: 195억 원 -> "190억 원대"
 * - 예: 85억 원 -> "80억 원대"
 * - 예: 300억 원 -> "300억 원대"
 * - 예: 1조 2,500억 원 -> "1조 2,000억 원대"
 */
export function formatBandedPrice(priceKrw: number): string {
  if (typeof priceKrw !== 'number' || !Number.isFinite(priceKrw) || priceKrw <= 0) {
    return '가격 협의';
  }

  // 200억 이상(조 단위 포함)은 SSOT getBandWidth로 >=5% 밴드폭 보장 + 조/억 포맷 적용
  if (priceKrw >= 200 * EOK_KRW) {
    const width = getBandWidth(priceKrw, 'standard');
    const lower = Math.floor(priceKrw / width) * width;
    return `${formatKrw(lower)} 원대`;
  }

  // 10억 ~ 200억 미만: 10억 단위 밴드 (10/190 = 5.26% >= 5%)
  if (priceKrw >= 10 * EOK_KRW) {
    const width = 10 * EOK_KRW;
    const lower = Math.floor(priceKrw / width) * width;
    return `${formatKrw(lower)} 원대`;
  }

  // 1억 ~ 10억 미만: 1억 단위 밴드 (>= 10% >= 5%)
  if (priceKrw >= EOK_KRW) {
    const lower = Math.floor(priceKrw / EOK_KRW) * EOK_KRW;
    return `${formatKrw(lower)} 원대`;
  }

  // 1억 미만 ~ 1,000만 이상: SSOT 천만 단위 밴드 ("0억 원대" 방지)
  if (priceKrw >= 1000 * MAN_KRW) {
    const width = getBandWidth(priceKrw, 'standard');
    const lower = Math.floor(priceKrw / width) * width;
    return `${formatKrw(lower)} 원대`;
  }

  if (priceKrw >= MAN_KRW) {
    const lower = Math.floor(priceKrw / MAN_KRW) * MAN_KRW;
    return `${formatKrw(lower)} 원대`;
  }

  return '가격 협의';
}

/**
 * 수익률 밴딩 포맷터
 * 소수점 정밀값을 초반/중반/후반 밴드로 마스킹
 * - 예: 2.1% -> "2%대 초반"
 * - 예: 4.5% -> "4%대 중반"
 * - 예: 5.8% -> "5%대 후반"
 */
export function formatBandedYield(yieldPct: number | null | undefined): string {
  if (
    yieldPct === null ||
    yieldPct === undefined ||
    typeof yieldPct !== 'number' ||
    !Number.isFinite(yieldPct) ||
    yieldPct <= 0
  ) {
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

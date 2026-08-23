/**
 * signal-engine.ts — S 엔진 (발행 후 매수자 반응 8종 결정적 통계 규칙 평가기)
 * Spec: docs/imup/04_screen/POST_PUBLISH_SPEC.md (§1, §2)
 */

import { SignalCode, Verdict } from './types';

export interface SignalMetricsInput {
  totalViews: number;                 // 총 열람 횟수
  distinctDevices: number;            // 고유 기기 수
  publishedDays: number;              // 발행 후 경과 일수
  maxSectionBounceRate?: number;      // 특정 섹션 최대 이탈률 (0.0~1.0)
  bouncedSectionKey?: string;         // 이탈이 집중된 섹션 키
  priceSlideDwellSeconds?: number;    // 가격 슬라이드 체류 시간 (초)
  shareLinkForwardCount?: number;     // 링크 전달/재공유 횟수
  ctaConversionRate?: number;         // CTA 전환율 (0.0~1.0)
  mobileBounceMultiplier?: number;    // 데스크톱 대비 모바일 이탈률 배수 (예: 2.5배)
  rentRollDwellSeconds?: number;      // 렌트롤 슬라이드 체류 시간 (초)
  rentRollImmediateExitRate?: number; // 렌트롤 확인 후 즉시 이탈률 (0.0~1.0)
  repeatedViewsWithoutInquiry?: boolean; // 3회 이상 재열람 후 문의 부재 여부
}

/**
 * S01 ~ S08 결정적 반응 신호 규칙 검사
 * 최소 표본 조건(totalViews >= 10 등)이 충족될 때만 신뢰성 있는 Verdict를 발행합니다.
 */
export function evaluateSignals(metrics: SignalMetricsInput): Verdict[] {
  const verdicts: Verdict[] = [];
  const now = new Date().toISOString();

  // S08: 발행 후 7일간 열람 0건 (노출 부진)
  if (metrics.publishedDays >= 7 && metrics.totalViews === 0) {
    verdicts.push({
      source: 'rule',
      code: 'S08',
      severity: 'warn',
      resolved: false,
      message: '발행 후 7일간 열람이 전혀 발생하지 않았습니다. 링크 발송 채널 점검 및 타깃 매수자 재선별이 필요합니다.',
      details: { publishedDays: metrics.publishedDays, totalViews: 0 },
      detectedAt: now,
    });
  }

  // S01: 특정 섹션 이탈 집중 (표본 >= 10, 이탈률 >= 40%)
  if (
    metrics.totalViews >= 10 &&
    metrics.maxSectionBounceRate !== undefined &&
    metrics.maxSectionBounceRate >= 0.40
  ) {
    verdicts.push({
      source: 'rule',
      code: 'S01',
      severity: 'warn',
      resolved: false,
      message: `'${metrics.bouncedSectionKey ?? '특정 섹션'}'에서 전체 열람자의 ${(metrics.maxSectionBounceRate * 100).toFixed(0)}%가 집중 이탈했습니다. 해당 섹션의 설명 난이도 또는 데이터를 재검토하세요.`,
      details: {
        section: metrics.bouncedSectionKey,
        bounceRate: metrics.maxSectionBounceRate,
        threshold: 0.40,
      },
      detectedAt: now,
    });
  }

  // S02: 가격 슬라이드 체류 시간 극단값 (표본 >= 5, <3초 또는 >30초)
  if (metrics.totalViews >= 5 && metrics.priceSlideDwellSeconds !== undefined) {
    if (metrics.priceSlideDwellSeconds < 3) {
      verdicts.push({
        source: 'rule',
        code: 'S02',
        severity: 'info',
        resolved: false,
        message: '가격 정보 확인 후 3초 미만으로 즉시 이탈했습니다 (가격대 불일치 신호).',
        details: { dwellSeconds: metrics.priceSlideDwellSeconds, type: 'too_short' },
        detectedAt: now,
      });
    } else if (metrics.priceSlideDwellSeconds > 30) {
      verdicts.push({
        source: 'rule',
        code: 'S02',
        severity: 'info',
        resolved: false,
        message: '가격 슬라이드에 30초 이상 장시간 체류하며 정밀 검토 중입니다 (고관심 신호).',
        details: { dwellSeconds: metrics.priceSlideDwellSeconds, type: 'deep_interest' },
        detectedAt: now,
      });
    }
  }

  // S03: 공유 링크 전달 급증 (기기 수 >= 3) -> 전달 오염 가능성
  if (
    (metrics.shareLinkForwardCount !== undefined && metrics.shareLinkForwardCount >= 3) ||
    metrics.distinctDevices >= 4
  ) {
    verdicts.push({
      source: 'rule',
      code: 'S03',
      severity: 'warn',
      resolved: false,
      message: '공유 링크가 3개 이상의 타 기기로 전달되었습니다. 수신자 신원 오염 방지를 위해 신규 링크 발급이 권장됩니다.',
      details: { distinctDevices: metrics.distinctDevices, threshold: 3 },
      detectedAt: now,
    });
  }

  // S04: CTA 전환율 저하 (표본 >= 20, CTA 전환율 < 2%)
  if (
    metrics.totalViews >= 20 &&
    metrics.ctaConversionRate !== undefined &&
    metrics.ctaConversionRate < 0.02
  ) {
    verdicts.push({
      source: 'rule',
      code: 'S04',
      severity: 'warn',
      resolved: false,
      message: `20회 이상 열람되었으나 상세 문의 전환율이 ${(metrics.ctaConversionRate * 100).toFixed(1)}%로 저조합니다. CTA 문구 또는 핵심 투자포인트를 강조하세요.`,
      details: { totalViews: metrics.totalViews, conversionRate: metrics.ctaConversionRate, threshold: 0.02 },
      detectedAt: now,
    });
  }

  // S05: 모바일 디바이스 편중 이탈 (모바일 이탈률 배수 >= 2.0)
  if (
    metrics.totalViews >= 15 &&
    metrics.mobileBounceMultiplier !== undefined &&
    metrics.mobileBounceMultiplier >= 2.0
  ) {
    verdicts.push({
      source: 'rule',
      code: 'S05',
      severity: 'info',
      resolved: false,
      message: '모바일 환경에서의 이탈률이 데스크톱 대비 2배 이상 높습니다. 모바일 뷰어의 폰트 크기 및 테이블 스크롤 사용성을 점검하세요.',
      details: { mobileBounceMultiplier: metrics.mobileBounceMultiplier, threshold: 2.0 },
      detectedAt: now,
    });
  }

  // S06: 렌트롤 열람 후 즉시 이탈 (렌트롤 체류 <5초 및 이탈률 >= 50%)
  if (
    metrics.totalViews >= 10 &&
    metrics.rentRollDwellSeconds !== undefined &&
    metrics.rentRollDwellSeconds < 5 &&
    metrics.rentRollImmediateExitRate !== undefined &&
    metrics.rentRollImmediateExitRate >= 0.50
  ) {
    verdicts.push({
      source: 'rule',
      code: 'S06',
      severity: 'warn',
      resolved: false,
      message: '임대차 현황표 확인 직후 50% 이상의 매수자가 즉시 이탈했습니다. 임대료 수준 또는 임차인 구성의 시장 경쟁력을 확인하세요.',
      details: { dwell: metrics.rentRollDwellSeconds, exitRate: metrics.rentRollImmediateExitRate },
      detectedAt: now,
    });
  }

  // S07: 동일 기기 반복 열람 후 문의 미발생
  if (metrics.repeatedViewsWithoutInquiry === true) {
    verdicts.push({
      source: 'rule',
      code: 'S07',
      severity: 'info',
      resolved: false,
      message: '동일 매수자(기기)가 3회 이상 반복 열람하였으나 문의를 접수하지 않았습니다. 선제적 후속 콜 또는 추가 자료 전달이 유효합니다.',
      details: { repeatedViewsWithoutInquiry: true },
      detectedAt: now,
    });
  }

  return verdicts;
}

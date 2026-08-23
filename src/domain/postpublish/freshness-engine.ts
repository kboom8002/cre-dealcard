/**
 * freshness-engine.ts — F 엔진 (발행 후 신선도 10종 결정적 규칙 평가기)
 * Spec: docs/imup/04_screen/POST_PUBLISH_SPEC.md (§1, §2)
 */

import { FreshnessCode, Verdict } from './types';

export interface FreshnessFactsInput {
  // 공부 발급 경과일수
  registryDays?: number;           // 등기부등본 열람 경과일 (F01 > 30)
  landUsePlanDays?: number;        // 토지이용계획 열람 경과일 (F02 > 90)
  compsDays?: number;              // 실거래가 조회 경과일 (F03 > 60)
  buildingRegisterDays?: number;   // 건축물대장 열람 경과일 (F04 > 60)

  // 공시 및 시장 지표
  officialPriceYear?: number;      // 공시지가 기준 연도 (F05)
  currentYear?: number;            // 현재 연도
  hasNewNearbyComps?: boolean;     // 반경 500m 이내 신규 실거래가 발생 여부 (F06)
  rateDeltaPct?: number;           // 발행 시점 대비 대출/기준금리 변동폭 (F07 >= 0.25)

  // 임대차 및 물리적 상태
  vacancyDurationDays?: number;    // 공실 지속 일수 (F08 >= 60)
  monthsToMinExpiry?: number;      // 주요 임대차 최소 만기 잔여월 (F09 <= 6)
  monthsToRenewalExpiry?: number;  // 갱신요구권 행사 가능 잔여월 (F10 <= 12)
}

/**
 * F01 ~ F10 결정적 신선도 규칙 검사
 */
export function evaluateFreshness(facts: FreshnessFactsInput): Verdict[] {
  const verdicts: Verdict[] = [];
  const now = new Date().toISOString();
  const currentYear = facts.currentYear ?? new Date().getFullYear();

  // F01: 등기부 열람 30일 경과
  if (facts.registryDays !== undefined && facts.registryDays > 30) {
    verdicts.push({
      source: 'rule',
      code: 'F01',
      severity: 'warn',
      resolved: false,
      message: `등기부등본 열람 후 ${facts.registryDays}일이 경과하여 최신 권리관계 재확인이 필요합니다.`,
      details: { registryDays: facts.registryDays, threshold: 30 },
      detectedAt: now,
    });
  }

  // F02: 토지이용계획 90일 경과
  if (facts.landUsePlanDays !== undefined && facts.landUsePlanDays > 90) {
    verdicts.push({
      source: 'rule',
      code: 'F02',
      severity: 'info',
      resolved: false,
      message: `토지이용계획확인원 발급 후 ${facts.landUsePlanDays}일 경과로 공법상 변동 여부를 점검하세요.`,
      details: { landUsePlanDays: facts.landUsePlanDays, threshold: 90 },
      detectedAt: now,
    });
  }

  // F03: 실거래가 60일 경과
  if (facts.compsDays !== undefined && facts.compsDays > 60) {
    verdicts.push({
      source: 'rule',
      code: 'F03',
      severity: 'warn',
      resolved: false,
      message: `인근 실거래가 비교사례 수집 후 ${facts.compsDays}일 경과로 최신 시세 업데이트가 권장됩니다.`,
      details: { compsDays: facts.compsDays, threshold: 60 },
      detectedAt: now,
    });
  }

  // F04: 건축물대장 60일 경과
  if (facts.buildingRegisterDays !== undefined && facts.buildingRegisterDays > 60) {
    verdicts.push({
      source: 'rule',
      code: 'F04',
      severity: 'info',
      resolved: false,
      message: `건축물대장 발급 후 ${facts.buildingRegisterDays}일 경과 (위반건축물 지정 등 변동 확인 필요).`,
      details: { buildingRegisterDays: facts.buildingRegisterDays, threshold: 60 },
      detectedAt: now,
    });
  }

  // F05: 공시지가 연도 갱신 필요
  if (facts.officialPriceYear !== undefined && facts.officialPriceYear < currentYear) {
    verdicts.push({
      source: 'rule',
      code: 'F05',
      severity: 'warn',
      resolved: false,
      message: `${currentYear}년도 신규 공시지가가 발표되었으므로 공시지가 비율 갱신이 필요합니다.`,
      details: { officialPriceYear: facts.officialPriceYear, currentYear },
      detectedAt: now,
    });
  }

  // F06: 인근 신규 실거래 발생
  if (facts.hasNewNearbyComps === true) {
    verdicts.push({
      source: 'rule',
      code: 'F06',
      severity: 'info',
      resolved: false,
      message: '인근 500m 이내 신규 실거래 사례가 등록되어 밸류에이션 비교표 갱신이 가능합니다.',
      details: { hasNewNearbyComps: true },
      detectedAt: now,
    });
  }

  // F07: 금리 변동 (0.25%p 이상)
  if (facts.rateDeltaPct !== undefined && Math.abs(facts.rateDeltaPct) >= 0.25) {
    verdicts.push({
      source: 'rule',
      code: 'F07',
      severity: 'warn',
      resolved: false,
      message: `시장 조달 금리가 ${facts.rateDeltaPct > 0 ? '+' : ''}${facts.rateDeltaPct.toFixed(2)}%p 변동하여 LTV 및 수익률 시나리오 재산정이 필요합니다.`,
      details: { rateDeltaPct: facts.rateDeltaPct, threshold: 0.25 },
      detectedAt: now,
    });
  }

  // F08: 공실 기간 60일 이상
  if (facts.vacancyDurationDays !== undefined && facts.vacancyDurationDays >= 60) {
    verdicts.push({
      source: 'rule',
      code: 'F08',
      severity: 'warn',
      resolved: false,
      message: `공실이 ${facts.vacancyDurationDays}일 이상 지속되고 있어 임대료 하향 조정 또는 임차 유치 전략 보완이 필요합니다.`,
      details: { vacancyDurationDays: facts.vacancyDurationDays, threshold: 60 },
      detectedAt: now,
    });
  }

  // F09: 주요 임차 계약 만기 6개월 이내
  if (facts.monthsToMinExpiry !== undefined && facts.monthsToMinExpiry <= 6) {
    verdicts.push({
      source: 'rule',
      code: 'F09',
      severity: 'block',
      resolved: false,
      message: `주요 임차인의 계약 만기가 ${facts.monthsToMinExpiry}개월 남았으므로 재계약 또는 명도 확약이 요구됩니다.`,
      details: { monthsToMinExpiry: facts.monthsToMinExpiry, threshold: 6 },
      detectedAt: now,
    });
  }

  // F10: 갱신요구권 잔여 1년 미만
  if (facts.monthsToRenewalExpiry !== undefined && facts.monthsToRenewalExpiry <= 12) {
    verdicts.push({
      source: 'rule',
      code: 'F10',
      severity: 'info',
      resolved: false,
      message: `상가건물임대차보호법 상 10년 계약갱신요구권 만료까지 ${facts.monthsToRenewalExpiry}개월 남았습니다.`,
      details: { monthsToRenewalExpiry: facts.monthsToRenewalExpiry, threshold: 12 },
      detectedAt: now,
    });
  }

  return verdicts;
}

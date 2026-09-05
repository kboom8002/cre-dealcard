/**
 * D37 P1-4: Action Card — 10칸 Value-add 시나리오
 *
 * 07 §7.5: Base/Upside/Downside 3시나리오 + 실행 항목.
 * D36 §3.3: 기존 임차인 이동 포함 시 권리금 Claim 필수.
 *
 * @see docs/impipe/D37_P1P2_IMPLEMENTATION_PLAN.md §P1-4
 */

import { randomUUID } from 'crypto';
import type { ClaimRegistry } from './claim-registry';
import type { Claim } from './claim';

// ── 타입 ──

export type ScenarioType = 'base' | 'upside' | 'downside';

export interface ActionItem {
  /** 실행 항목 설명 */
  description: string;
  /** 예상 비용 (원) */
  estimatedCostKrw?: number;
  /** 예상 기간 (개월) */
  estimatedMonths?: number;
  /** 관련 Claim ID */
  claimId?: string;
  /** 실행 주체 */
  executor?: string;
}

export interface Scenario {
  type: ScenarioType;
  /** 시나리오 제목 */
  title: string;
  /** 정상화 월 임대료 (원) */
  stabilizedMonthlyRent: number;
  /** 정상화 연 순수익 (원) */
  stabilizedNOI: number;
  /** 정상화 Cap Rate (%) */
  stabilizedCapRate: number;
  /** 예상 가치 (원) */
  estimatedValue: number;
  /** 수익률 (%) */
  totalReturn: number;
  /** 실행 항목 */
  actions: ActionItem[];
}

export interface ActionCard {
  /** 10칸 중 이 카드의 순서 (1~10) */
  cardOrder: number;
  /** 현재 상태 요약 */
  currentStateSummary: string;
  /** 3시나리오 */
  scenarios: Scenario[];
  /** 권리금 회수기회 관련 Claim ID (v2 추가) */
  premiumRiskClaim?: string;
  /** 기존 임차인 이동 포함 여부 */
  involvesTenantRelocation: boolean;
  /** Claim 참조 (계산 근거) */
  relatedClaimIds: string[];
}

// ── 검증 ──

export interface ActionCardValidation {
  valid: boolean;
  warnings: string[];
}

/**
 * Action Card를 검증합니다.
 * - 3시나리오 필수 (base/upside/downside)
 * - 기존 임차인 이동 시 권리금 Claim 필수 (경고)
 */
export function validateActionCard(card: ActionCard): ActionCardValidation {
  const warnings: string[] = [];

  // 3시나리오 필수
  const types = new Set(card.scenarios.map(s => s.type));
  if (!types.has('base')) warnings.push('[P1-4] base 시나리오 누락');
  if (!types.has('upside')) warnings.push('[P1-4] upside 시나리오 누락');
  if (!types.has('downside')) warnings.push('[P1-4] downside 시나리오 누락');

  // D36 §3.3: 임차인 이동 + 권리금 미연결
  if (card.involvesTenantRelocation && !card.premiumRiskClaim) {
    warnings.push('[P1-4/§3.3] 기존 임차인 이동 포함이나 권리금 Claim(premiumRiskClaim)이 누락됨');
  }

  // Cap Rate 음수 체크
  for (const s of card.scenarios) {
    if (s.stabilizedCapRate < 0) {
      warnings.push(`[P1-4] ${s.type} 시나리오 Cap Rate 음수: ${s.stabilizedCapRate}%`);
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Action Card의 시나리오 및 실행 항목을 ClaimRegistry에 1급 객체로 등록합니다.
 */
export function registerActionCardClaims(
  registry: ClaimRegistry,
  card: ActionCard,
  asOf: string = new Date().toISOString().slice(0, 10)
): { claims: Claim[]; cardWithClaimIds: ActionCard } {
  const claims: Claim[] = [];
  const claimIds: string[] = [];

  for (const scenario of card.scenarios) {
    const prefix = `action_card_${card.cardOrder}_${scenario.type}`;

    // 1. Stabilized Cap Rate Claim
    const { claim: capRateClaim } = registry.register({
      subject: `${prefix}_cap_rate`,
      value: scenario.stabilizedCapRate,
      unit: '%',
      evidence: [{
        sourceId: 'derived',
        asOf,
        excerpt: `[ActionCard ${card.cardOrder}: ${card.currentStateSummary}] ${scenario.title} 정상화 Cap Rate`,
      }],
      provenance: 'derived',
      asOf,
      status: 'reconciled',
      calculation: {
        id: randomUUID(),
        formula: 'stabilized_noi / estimated_value * 100',
        formulaVersion: 'v1.0.0',
        inputs: {},
        result: scenario.stabilizedCapRate,
        basis: 'NOI',
      },
    });
    claims.push(capRateClaim);
    claimIds.push(capRateClaim.id);

    // 2. Stabilized NOI Claim
    const { claim: noiClaim } = registry.register({
      subject: `${prefix}_noi`,
      value: scenario.stabilizedNOI,
      unit: '원',
      evidence: [{
        sourceId: 'derived',
        asOf,
        excerpt: `[ActionCard ${card.cardOrder}] ${scenario.title} 정상화 순영업소득(NOI)`,
      }],
      provenance: 'derived',
      asOf,
      status: 'reconciled',
    });
    claims.push(noiClaim);
    claimIds.push(noiClaim.id);

    // 3. Stabilized Monthly Rent Claim
    const { claim: rentClaim } = registry.register({
      subject: `${prefix}_monthly_rent`,
      value: scenario.stabilizedMonthlyRent,
      unit: '원/월',
      evidence: [{
        sourceId: 'derived',
        asOf,
        excerpt: `[ActionCard ${card.cardOrder}] ${scenario.title} 정상화 월 임대료`,
      }],
      provenance: 'derived',
      asOf,
      status: 'reconciled',
    });
    claims.push(rentClaim);
    claimIds.push(rentClaim.id);

    // 4. Estimated Value Claim
    const { claim: valueClaim } = registry.register({
      subject: `${prefix}_estimated_value`,
      value: scenario.estimatedValue,
      unit: '원',
      evidence: [{
        sourceId: 'derived',
        asOf,
        excerpt: `[ActionCard ${card.cardOrder}] ${scenario.title} 정상화 후 추정 자산 가치`,
      }],
      provenance: 'derived',
      asOf,
      status: 'reconciled',
    });
    claims.push(valueClaim);
    claimIds.push(valueClaim.id);
  }

  // D36 §3.3: If tenant relocation is involved, verify premiumRiskClaim is present
  if (card.involvesTenantRelocation && !card.premiumRiskClaim) {
    const { claim: premiumClaim } = registry.register({
      subject: `action_card_${card.cardOrder}_premium_risk`,
      value: '권리금 회수기회 보호 대상 검토 필요',
      unit: '',
      evidence: [{ sourceId: 'broker', asOf, excerpt: '기존 임차인 명도/이동 계획 수반' }],
      provenance: 'broker',
      asOf,
      status: 'unverified',
      expertRequired: true,
    });
    claims.push(premiumClaim);
    claimIds.push(premiumClaim.id);
    card.premiumRiskClaim = premiumClaim.id;
  }

  const cardWithClaimIds: ActionCard = {
    ...card,
    relatedClaimIds: Array.from(new Set([...(card.relatedClaimIds || []), ...claimIds])),
  };

  return { claims, cardWithClaimIds };
}


/**
 * @file deck-sequencer.ts
 * @description posture × grade × tier 기반 PPTX 덱 시퀀스 결정기
 *
 * §15 posture별 시퀀스 + §15.3 income 아키타입 4종 분기 + 등급별 억제
 */

import type { InvestmentPosture } from '@/domain/ontology';

export type PptxTier = 'basic' | 'pro';
export type Grade = 'A' | 'B' | 'C' | 'D';
export type IncomeArchetype = 'R-INC-01' | 'R-INC-02' | 'R-INC-03' | 'R-INC-04';

export interface SlideSpec {
  archetype: string;  // 'A01'~'A13'
  kicker: string;
  title: string;
  dataKey: string;
  suppress?: boolean;
}

export interface DeckSequenceInput {
  posture: InvestmentPosture;
  tier: PptxTier;
  grade: Grade;
  incomeArchetype?: IncomeArchetype;
  hasViolation?: boolean;
  hasJointCollateral?: boolean;
  hasPhotos?: boolean;
}

export function buildDeckSequence(input: DeckSequenceInput): SlideSpec[] {
  // D등급: Pro는 빈 시퀀스(차단), Basic은 최소 3슬라이드
  if (input.grade === 'D') {
    if (input.tier === 'pro') return [];
    // Basic 최소 덱: 표지 + 핵심요약 + 면책
    const dGradeSequence: SlideSpec[] = [
      { archetype: 'A01', kicker: 'BASIC IM', title: '표지', dataKey: 'cover' },
    ];
    if (input.hasPhotos) {
      dGradeSequence.push({ archetype: 'A14', kicker: 'Gallery', title: '건물 사진', dataKey: 'gallery' });
    }
    dGradeSequence.push(
      { archetype: 'A02', kicker: 'Summary', title: '핵심요약', dataKey: 'summary' },
      { archetype: 'A10', kicker: 'Disclaimer', title: '표기 기준 및 면책', dataKey: 'closing' }
    );
    return dGradeSequence;
  }

  // Basic C등급+: 7슬라이드 (표지+요약+입지+건물/렌트롤/토지 등 포스처별 2슬라이드+리스크+면책)
  if (input.tier === 'basic') {
    const basicSequence: SlideSpec[] = [
      { archetype: 'A01', kicker: 'BASIC IM', title: '표지', dataKey: 'cover' }
    ];
    if (input.hasPhotos) {
      basicSequence.push({ archetype: 'A14', kicker: 'Gallery', title: '건물 사진', dataKey: 'gallery' });
    }
    basicSequence.push(
      { archetype: 'A02', kicker: 'Summary', title: '핵심요약', dataKey: 'summary' },
      { archetype: 'A06', kicker: 'Location', title: '입지', dataKey: 'location' }
    );
    // 포스처별 본문 2슬라이드
    switch (input.posture) {
      case 'development':
        basicSequence.push(
          { archetype: 'A04', kicker: 'Land', title: '토지', dataKey: 'land' },
          { archetype: 'A05', kicker: 'Feasibility', title: '개발 개요', dataKey: 'feasibility' }
        );
        break;
      case 'owner_occupied':
        basicSequence.push(
          { archetype: 'A04', kicker: 'Building', title: '건물', dataKey: 'building' },
          { archetype: 'A08', kicker: 'Vs Lease', title: '자가비교', dataKey: 'vsLease' }
        );
        break;
      case 'operating':
        basicSequence.push(
          { archetype: 'A04', kicker: 'Building', title: '건물', dataKey: 'building' },
          { archetype: 'A13', kicker: 'KPI', title: '운영지표', dataKey: 'kpi' }
        );
        break;
      case 'trading':
        basicSequence.push(
          { archetype: 'A04', kicker: 'Building', title: '건물', dataKey: 'building' },
          { archetype: 'A03', kicker: 'Comps', title: '비교사례', dataKey: 'comps' }
        );
        break;
      case 'income':
      default:
        basicSequence.push(
          { archetype: 'A04', kicker: 'Building', title: '건물', dataKey: 'building' },
          { archetype: 'A03', kicker: 'Rent Roll', title: '렌트롤', dataKey: 'rentRoll' }
        );
        break;
    }
    basicSequence.push(
      { archetype: 'A07', kicker: 'Risk', title: '리스크', dataKey: 'risk' },
      { archetype: 'A10', kicker: 'Disclaimer', title: '표기 기준 및 면책', dataKey: 'closing' }
    );
    return basicSequence;
  }

  const sequence: SlideSpec[] = [];

  // ── 1. 공통 골격 (Pro) ──
  sequence.push({ archetype: 'A01', kicker: 'INVESTMENT MEMORANDUM', title: '표지', dataKey: 'cover' });
  if (input.hasPhotos) {
    sequence.push({ archetype: 'A14', kicker: 'Gallery', title: '건물 사진', dataKey: 'gallery' });
  }
  sequence.push({ archetype: 'A02', kicker: 'Summary', title: '핵심요약', dataKey: 'summary' });
  sequence.push({ archetype: 'A06', kicker: 'Location', title: '입지', dataKey: 'location' });
  sequence.push({ archetype: 'A04', kicker: 'Land', title: '토지', dataKey: 'land' });
  sequence.push({ archetype: 'A04', kicker: 'Building', title: '건물', dataKey: 'building' });

  // ── 2. posture별 본문 ──
  switch (input.posture) {
    case 'income':
      // §15.3 income 아키타입 분기
      switch (input.incomeArchetype) {
        case 'R-INC-02': // 임대료 정상화형 — 임대료 갭 강조
          sequence.push({ archetype: 'A03', kicker: 'Rent Roll', title: '렌트롤', dataKey: 'rentRoll' });
          sequence.push({ archetype: 'A05', kicker: 'Rent Gap', title: '임대료 갭', dataKey: 'rentGap' });
          sequence.push({ archetype: 'A05', kicker: 'Upside', title: '인상 경로', dataKey: 'upside' });
          sequence.push({ archetype: 'A08', kicker: 'Capital', title: '자본구조', dataKey: 'capital' });
          sequence.push({ archetype: 'A04', kicker: 'Comps', title: '비교사례', dataKey: 'comps' });
          break;
        case 'R-INC-03': // 공실 해소형 — 공실 원인/유치 전략 강조
          sequence.push({ archetype: 'A03', kicker: 'Rent Roll', title: '렌트롤', dataKey: 'rentRoll' });
          sequence.push({ archetype: 'A04', kicker: 'Vacancy', title: '공실 분석', dataKey: 'vacancy' });
          sequence.push({ archetype: 'A05', kicker: 'Leasing', title: '임차 유치', dataKey: 'leasing' });
          sequence.push({ archetype: 'A08', kicker: 'Capital', title: '자본구조', dataKey: 'capital' });
          sequence.push({ archetype: 'A04', kicker: 'Comps', title: '비교사례', dataKey: 'comps' });
          break;
        case 'R-INC-04': // 리모델링형 — 전/후 비교 강조
          sequence.push({ archetype: 'A03', kicker: 'Rent Roll', title: '렌트롤', dataKey: 'rentRoll' });
          sequence.push({ archetype: 'A04', kicker: 'Current', title: '현황', dataKey: 'current' });
          sequence.push({ archetype: 'A05', kicker: 'Remodel', title: '리모델링', dataKey: 'remodel' });
          sequence.push({ archetype: 'A08', kicker: 'Capital', title: '자본구조', dataKey: 'capital' });
          sequence.push({ archetype: 'A04', kicker: 'Comps', title: '비교사례', dataKey: 'comps' });
          break;
        case 'R-INC-01': // 초안정형 (기본)
        default:
          sequence.push({ archetype: 'A03', kicker: 'Rent Roll', title: '렌트롤', dataKey: 'rentRoll' });
          sequence.push({ archetype: 'A04', kicker: 'Stability', title: '임대안정성', dataKey: 'stability' });
          sequence.push({ archetype: 'A05', kicker: 'Profit', title: '수익구조', dataKey: 'profit' });
          sequence.push({ archetype: 'A08', kicker: 'Capital', title: '자본구조', dataKey: 'capital' });
          sequence.push({ archetype: 'A04', kicker: 'Comps', title: '비교사례', dataKey: 'comps' });
          break;
      }
      break;
    case 'owner_occupied':
      sequence.push({ archetype: 'A04', kicker: 'Plan', title: '사용계획', dataKey: 'plan' });
      sequence.push({ archetype: 'A08', kicker: 'Vs Lease', title: '자가비교', dataKey: 'vsLease' });
      sequence.push({ archetype: 'A06', kicker: 'Commute', title: '통근', dataKey: 'commute' });
      sequence.push({ archetype: 'A04', kicker: 'Value', title: '자산가치', dataKey: 'value' });
      break;
    case 'development':
      sequence.push({ archetype: 'A04', kicker: 'Land Detail', title: '토지상세', dataKey: 'landDetail' });
      sequence.push({ archetype: 'A05', kicker: 'Scale', title: '신축규모', dataKey: 'scale' });
      sequence.push({ archetype: 'A04', kicker: 'Eviction', title: '명도', dataKey: 'eviction' });
      sequence.push({ archetype: 'A08', kicker: 'Cost', title: '투입비용', dataKey: 'cost' });
      sequence.push({ archetype: 'A05', kicker: 'Stacking', title: '스태킹', dataKey: 'stacking' });
      sequence.push({ archetype: 'A05', kicker: 'Feasibility', title: '사업수지', dataKey: 'feasibility' });
      break;
    case 'operating':
      sequence.push({ archetype: 'A13', kicker: 'KPI', title: '운영지표', dataKey: 'kpi' });
      sequence.push({ archetype: 'A05', kicker: 'Revenue', title: '매출', dataKey: 'revenue' });
      sequence.push({ archetype: 'A05', kicker: 'Seasonality', title: '계절성', dataKey: 'seasonality' });
      sequence.push({ archetype: 'A04', kicker: 'Operator', title: '운영사', dataKey: 'operator' });
      break;
    case 'trading':
      sequence.push({ archetype: 'A03', kicker: 'Comps', title: '비교사례', dataKey: 'comps' });
      sequence.push({ archetype: 'A05', kicker: 'Trend', title: '거래동향', dataKey: 'trend' });
      sequence.push({ archetype: 'A04', kicker: 'Turnover', title: '회전율', dataKey: 'turnover' });
      sequence.push({ archetype: 'A04', kicker: 'Price', title: '가격', dataKey: 'price' });
      break;
  }

  // ── 3. Pro 전용 추가 슬라이드 (Closing 앞에 배치) ──
  if (input.tier === 'pro') {
    const suppressDcf = input.grade === 'B' || input.grade === 'C';
    const suppressTotalReturn = input.grade === 'C';

    sequence.push({ archetype: 'A05', kicker: 'DCF', title: 'DCF 분석', dataKey: 'dcf', suppress: suppressDcf });
    sequence.push({ archetype: 'A05', kicker: 'Sensitivity', title: '민감도 분석', dataKey: 'sensitivity', suppress: suppressDcf });
    sequence.push({ archetype: 'A05', kicker: 'Total Return', title: '총수익률', dataKey: 'totalReturn', suppress: suppressTotalReturn });
    sequence.push({ archetype: 'A08', kicker: 'Loan', title: '대출시나리오', dataKey: 'loan', suppress: input.hasViolation });
    sequence.push({ archetype: 'A08', kicker: 'Tax', title: '세금시나리오', dataKey: 'tax' });
  }

  // ── 4. 공통 마감 (항상 마지막) ──
  sequence.push({ archetype: 'A07', kicker: 'Risk', title: '리스크', dataKey: 'risk' });
  sequence.push({ archetype: 'A09', kicker: 'Process', title: '절차', dataKey: 'process' });
  sequence.push({ archetype: 'A10', kicker: 'Closing', title: '마감', dataKey: 'closing' });

  const active = sequence.filter(s => !s.suppress);

  // Pro: 24p 이하로 제한
  if (active.length > 24) {
    const closingSlide = active.find(s => s.dataKey === 'closing');
    const riskSlide = active.find(s => s.dataKey === 'risk');
    const preserved = [riskSlide, closingSlide].filter(Boolean) as SlideSpec[];
    const preservedKeys = new Set(preserved.map(s => s.dataKey));
    const rest = active.filter(s => !preservedKeys.has(s.dataKey)).slice(0, 24 - preserved.length);
    return [...rest, ...preserved];
  }
  return active;
}

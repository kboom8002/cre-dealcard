/**
 * @file deck-sequencer.ts
 * @description posture × grade × tier 기반 PPTX 덱 시퀀스 결정기
 *
 * §15 posture별 시퀀스 + §15.3 income 아키타입 4종 분기 + 등급별 억제
 */

import type { InvestmentPosture } from '@/domain/ontology';
import type { GallerySlideSpec } from './gallery-planner';

export type PptxTier = 'basic' | 'pro';
export type Grade = 'A' | 'B' | 'C' | 'D';
// D30 BL-3/M-13: 정본 수익형 9종 전체 지원
export type IncomeArchetype = 'R-INC-01' | 'R-INC-02' | 'R-INC-03' | 'R-INC-04' | 'R-INC-05' | 'R-INC-06' | 'R-INC-07' | 'R-INC-08' | 'R-INC-09';

export interface SlideSpec {
  archetype: string;  // 'A01'~'A17'
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
  gallerySpecs?: GallerySlideSpec[];
}

/** 갤러리 슬라이드 목록을 SlideSpec[]으로 생성 */
function buildGallerySlideSpecs(input: DeckSequenceInput): SlideSpec[] {
  if (Array.isArray(input.gallerySpecs) && input.gallerySpecs.length > 0) {
    return input.gallerySpecs.map(g => ({
      archetype: 'A14',
      kicker: g.kicker,
      title: g.title,
      dataKey: g.dataKey,
    }));
  }
  if (input.hasPhotos) {
    return [{ archetype: 'A14', kicker: 'Gallery', title: '건물 사진', dataKey: 'gallery' }];
  }
  return [];
}

export function buildDeckSequence(input: DeckSequenceInput): SlideSpec[] {
  const gallerySlides = buildGallerySlideSpecs(input);

  // D29 BL-1: D등급 발행 전면 차단 (ONTOLOGY_V0.5_SPEC §6.3 — D = 발행 불가)
  // 티어 무관. QG04 + deck-sequencer 양쪽에서 통일.
  if (input.grade === 'D') {
    throw new Error('[G30] D등급은 발행할 수 없습니다');
  }

  // D32 M-2: Basic 티어, 또는 C등급(항상 Compact), 또는 B등급+basic: Compact 시퀀스 구성
  // A등급은 tier에 따라 분기, B등급도 tier=pro이면 Pro 시퀀스 허용
  if (input.tier === 'basic' || input.grade === 'C' || (input.grade === 'B' && input.tier !== 'pro')) {
    const compactSequence: SlideSpec[] = [
      { archetype: 'A01', kicker: 'INVESTMENT MEMORANDUM', title: '표지', dataKey: 'cover' }
    ];
    compactSequence.push(...gallerySlides);
    compactSequence.push(
      { archetype: 'A02', kicker: 'Summary', title: '핵심요약', dataKey: 'summary' },
      { archetype: 'A06', kicker: 'Location', title: '입지', dataKey: 'location' }
    );
    // 포스처별 본문 2슬라이드
    switch (input.posture) {
      case 'development':
        compactSequence.push(
          { archetype: 'A04', kicker: 'Building', title: '건물', dataKey: 'building' },
          { archetype: 'A04', kicker: 'Land Detail', title: '토지상세', dataKey: 'land' },
          { archetype: 'A05', kicker: 'Feasibility', title: '개발 개요', dataKey: 'feasibility' }
        );
        break;
      case 'owner_occupied':
        compactSequence.push(
          { archetype: 'A04', kicker: 'Building', title: '건물', dataKey: 'building' },
          { archetype: 'A04', kicker: 'Plan', title: '사용계획', dataKey: 'plan' },
          { archetype: 'A08', kicker: 'Vs Lease', title: '자가비교', dataKey: 'vsLease' }
        );
        break;
      case 'operating':
        compactSequence.push(
          { archetype: 'A04', kicker: 'Building', title: '건물', dataKey: 'building' },
          { archetype: 'A13', kicker: 'KPI', title: '운영지표', dataKey: 'kpi' },
          { archetype: 'A05', kicker: 'Revenue', title: '매출', dataKey: 'revenue' }
        );
        break;
      case 'trading':
        compactSequence.push(
          { archetype: 'A04', kicker: 'Building', title: '건물', dataKey: 'building' },
          { archetype: 'A04', kicker: 'Market Position', title: '시장 포지션', dataKey: 'marketPosition' },
          { archetype: 'A03', kicker: 'Comps', title: '비교사례', dataKey: 'comps' }
        );
        break;
      case 'income':
      default:
        compactSequence.push(
          { archetype: 'A04', kicker: 'Building', title: '건물', dataKey: 'building' },
          { archetype: 'A03', kicker: 'Rent Roll', title: '렌트롤', dataKey: 'rentRoll' },
          { archetype: 'A05', kicker: 'Profit', title: '수익 분석', dataKey: 'profit' }
        );
        break;
    }
    // D29 BL-4: 누락 4섹션 PPTX 연결 (checklist, title_rights, land_detail, comparables)
    compactSequence.push(
      { archetype: 'A04', kicker: 'Title', title: '권리관계', dataKey: 'titleRights' },
      { archetype: 'A07', kicker: 'Risk', title: '리스크', dataKey: 'risk' },
      { archetype: 'A12', kicker: 'Checklist', title: '체크리스트', dataKey: 'checklist' },
      { archetype: 'A15', kicker: 'Thesis', title: '투자 논거', dataKey: 'thesis' },
      { archetype: 'A09', kicker: 'Process', title: '진행 절차', dataKey: 'process' },
      { archetype: 'A10', kicker: 'Disclaimer', title: '표기 기준 및 면책', dataKey: 'closing' }
    );
    return compactSequence;
  }

  const sequence: SlideSpec[] = [];

  // ── 1. 공통 골격 (Pro) ──
  sequence.push({ archetype: 'A01', kicker: 'INVESTMENT MEMORANDUM', title: '표지', dataKey: 'cover' });
  sequence.push(...gallerySlides);
  sequence.push({ archetype: 'A02', kicker: 'Summary', title: '핵심요약', dataKey: 'summary' });
  sequence.push({ archetype: 'A06', kicker: 'Location', title: '입지', dataKey: 'location' });
  sequence.push({ archetype: 'A04', kicker: 'Land', title: '토지', dataKey: 'land' });
  sequence.push({ archetype: 'A04', kicker: 'Building', title: '건물', dataKey: 'building' });

  // ── 2. posture별 본문 ──
  switch (input.posture) {
    case 'income':
      // §15.3 income 아키타입 분기 — D30 BL-3: CATALOG_RULES L02 정본 재배정
      switch (input.incomeArchetype) {
        case 'R-INC-02': // 가치 상승 여력형 — 증축·용적률 여유 강조 (D30 BL-3)
          sequence.push({ archetype: 'A03', kicker: 'Rent Roll', title: '렌트롤', dataKey: 'rentRoll' });
          sequence.push({ archetype: 'A05', kicker: 'Value-Add', title: '가치 상승 실행 계획', dataKey: 'valueAdd' });
          sequence.push({ archetype: 'A04', kicker: 'FAR', title: '용적률 여유', dataKey: 'farUpside' });
          sequence.push({ archetype: 'A16', kicker: 'Capital', title: '자본구조', dataKey: 'capital' });
          sequence.push({ archetype: 'A03', kicker: 'Comps', title: '비교사례', dataKey: 'comps' });
          break;
        case 'R-INC-04': // 임대료 정상화형 — 시세 갭·갱신 일정 강조 (D30 BL-3)
          sequence.push({ archetype: 'A03', kicker: 'Rent Roll', title: '렌트롤', dataKey: 'rentRoll' });
          sequence.push({ archetype: 'A05', kicker: 'Rent Gap', title: '임대료 정상화 경로', dataKey: 'rentGap' });
          sequence.push({ archetype: 'A05', kicker: 'Upside', title: '갱신 인상 시나리오', dataKey: 'upside' });
          sequence.push({ archetype: 'A16', kicker: 'Capital', title: '자본구조', dataKey: 'capital' });
          sequence.push({ archetype: 'A03', kicker: 'Comps', title: '비교사례', dataKey: 'comps' });
          break;
        case 'R-INC-05': // 공실 해소형 — 공실 원인/유치 전략 강조 (D30 BL-3)
          sequence.push({ archetype: 'A03', kicker: 'Rent Roll', title: '렌트롤', dataKey: 'rentRoll' });
          sequence.push({ archetype: 'A04', kicker: 'Vacancy', title: '공실 원인·유치 전략', dataKey: 'vacancy' });
          sequence.push({ archetype: 'A05', kicker: 'Leasing', title: '임차 유치 시나리오', dataKey: 'leasing' });
          sequence.push({ archetype: 'A16', kicker: 'Capital', title: '자본구조', dataKey: 'capital' });
          sequence.push({ archetype: 'A03', kicker: 'Comps', title: '비교사례', dataKey: 'comps' });
          break;
        case 'R-INC-06': // 리모델링형 — 전/후 수익 비교 (D30 BL-3)
          sequence.push({ archetype: 'A03', kicker: 'Rent Roll', title: '렌트롤', dataKey: 'rentRoll' });
          sequence.push({ archetype: 'A04', kicker: 'Current', title: '현황', dataKey: 'current' });
          sequence.push({ archetype: 'A05', kicker: 'Remodel', title: '리모델링 전후 수익 비교', dataKey: 'remodel' });
          sequence.push({ archetype: 'A16', kicker: 'Capital', title: '자본구조', dataKey: 'capital' });
          sequence.push({ archetype: 'A03', kicker: 'Comps', title: '비교사례', dataKey: 'comps' });
          break;
        case 'R-INC-01': // 임대 안정형 (기본)
        default:
          sequence.push({ archetype: 'A03', kicker: 'Rent Roll', title: '렌트롤', dataKey: 'rentRoll' });
          sequence.push({ archetype: 'A04', kicker: 'Stability', title: '임대안정성', dataKey: 'stability' });
          sequence.push({ archetype: 'A05', kicker: 'Profit', title: '수익구조', dataKey: 'profit' });
          sequence.push({ archetype: 'A16', kicker: 'Capital', title: '자본구조', dataKey: 'capital' });
          sequence.push({ archetype: 'A03', kicker: 'Comps', title: '비교사례', dataKey: 'comps' });
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
      sequence.push({ archetype: 'A04', kicker: 'Land Detail', title: '토지상세', dataKey: 'land' });
      sequence.push({ archetype: 'A05', kicker: 'Scale', title: '신축규모', dataKey: 'scale' });
      sequence.push({ archetype: 'A04', kicker: 'Eviction', title: '명도', dataKey: 'eviction' });
      sequence.push({ archetype: 'A08', kicker: 'Cost', title: '투입비용', dataKey: 'cost' });
      sequence.push({ archetype: 'A17', kicker: 'Stacking', title: '스태킹', dataKey: 'stacking' });
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

  // ── 3. A등급 전용 추가 슬라이드 (DCF/민감도/총수익률 — 등급 기반 자동 포함) ──
  if (input.grade === 'A') {
    sequence.push({ archetype: 'A05', kicker: 'DCF', title: 'DCF 분석', dataKey: 'dcf' });
    sequence.push({ archetype: 'A05', kicker: 'Sensitivity', title: '민감도 분석', dataKey: 'sensitivity' });
    sequence.push({ archetype: 'A05', kicker: 'Total Return', title: '총수익률', dataKey: 'totalReturn' });
    sequence.push({ archetype: 'A08', kicker: 'Loan', title: '대출시나리오', dataKey: 'loan', suppress: input.hasViolation });
    sequence.push({ archetype: 'A08', kicker: 'Tax', title: '세금시나리오', dataKey: 'tax' });
  }

  // ── 4. 공통 마감 (항상 마지막) ──
  // D29 BL-4: checklist + comparables 추가
  sequence.push({ archetype: 'A04', kicker: 'Title', title: '권리관계', dataKey: 'titleRights' });
  sequence.push({ archetype: 'A03', kicker: 'Comps', title: '비교사례', dataKey: 'comparables' });
  sequence.push({ archetype: 'A15', kicker: 'Thesis', title: '투자 논거', dataKey: 'thesis' });
  sequence.push({ archetype: 'A07', kicker: 'Risk', title: '리스크', dataKey: 'risk' });
  sequence.push({ archetype: 'A12', kicker: 'Checklist', title: '체크리스트', dataKey: 'checklist' });
  sequence.push({ archetype: 'A09', kicker: 'Process', title: '진행 절차', dataKey: 'process' });
  sequence.push({ archetype: 'A10', kicker: 'Closing', title: '마감', dataKey: 'closing' });

  const active = sequence.filter(s => !s.suppress);

  // D29 m-8: 분량 상한 — 필수 12면 + 권장 16면 (초과 시 절삭)
  const PAGE_MANDATORY = 12;
  const PAGE_RECOMMENDED = 16;

  if (active.length > PAGE_RECOMMENDED) {
    // 마감·리스크·체크리스트는 절삭 방지
    const protectedKeys = new Set(['closing', 'risk', 'checklist', 'process', 'thesis', 'titleRights']);
    const protectedSlides = active.filter(s => protectedKeys.has(s.dataKey));
    const optionalSlides = active.filter(s => !protectedKeys.has(s.dataKey));
    const budget = PAGE_RECOMMENDED - protectedSlides.length;
    const trimmed = optionalSlides.slice(0, budget);
    if (active.length > PAGE_RECOMMENDED) {
      console.warn(`[deck-sequencer] m-8: ${active.length}면 → ${PAGE_RECOMMENDED}면으로 절삭`);
    }
    return [...trimmed, ...protectedSlides];
  }
  return active;
}

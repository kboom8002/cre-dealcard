/**
 * @file deck-sequencer.ts
 * @description 골디락스 단일 시퀀스 기반 PPTX 덱 시퀀스 결정기
 *
 * 2026-08-27: Basic/Pro 이중 시퀀스 폐지 → 골디락스 12p 필수 + 동적 확장
 * §15 posture별 시퀀스 + §15.3 income 아키타입 9종 분기 + Grade 기반 재무 확장
 * + dataAvailability 기반 12→20p 동적 스케일링
 */

import type { InvestmentPosture } from '@/domain/ontology';
import type { GallerySlideSpec } from './gallery-planner';

/** @deprecated 골디락스 단일 시퀀스 전환 — 하위 호환을 위해 타입만 유지 */
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
  /** D33 M-E: 이 슬라이드 렌더 전 반드시 채워져 있어야 할 데이터 키 목록 */
  requiredKeys?: string[];
}

/** V-World / 공공 API 데이터 가용성 — 동적 면 추가 판단용 */
export interface DataAvailability {
  hasLandUsePlan?: boolean;      // V-World 토지이용계획
  hasLandPrice?: boolean;        // V-World 공시지가
  hasBuildingRegister?: boolean; // 건축물대장
  hasRegistryData?: boolean;     // 등기부
  hasComparables?: boolean;      // 실거래 비교사례
  hasCommercialDistrict?: boolean; // 상권분석
  hasCadastralMap?: boolean;     // 지적도 이미지
  hasFloorPlan?: boolean;        // 층별 평면도
  hasRentRoll?: boolean;         // D33 S-5: 렌트롤 데이터 유무
}

export interface DeckSequenceInput {
  posture: InvestmentPosture;
  /** @deprecated 골디락스 전환 후 무시됨 — 하위 호환 유지 */
  tier?: PptxTier;
  grade: Grade;
  incomeArchetype?: IncomeArchetype;
  hasViolation?: boolean;
  hasJointCollateral?: boolean;
  hasPhotos?: boolean;
  gallerySpecs?: GallerySlideSpec[];
  /** 동적 면 추가 판단용 외부 데이터 가용성 */
  dataAvailability?: DataAvailability;
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
  if (input.grade === 'D') {
    throw new Error('[G30] D등급은 발행할 수 없습니다');
  }

  const sequence: SlideSpec[] = [];
  const da = input.dataAvailability ?? {};

  // ══════════════════════════════════════════════════
  // 골디락스 12p 필수 구성 (IM_STANDARD_수익형.md §4.1)
  // ══════════════════════════════════════════════════

  // p1: 표지
  sequence.push({ archetype: 'A01', kicker: 'INVESTMENT MEMORANDUM', title: '표지', dataKey: 'cover' });

  // 갤러리 (사진 있으면 p10-11 역할)
  sequence.push(...gallerySlides);

  // p2: 한 장 요약
  sequence.push({ archetype: 'A02', kicker: 'Summary', title: '핵심 투자 지표 요약', dataKey: 'summary' });

  // p4: 입지 (지도 + 접근성)
  sequence.push({ archetype: 'A06', kicker: 'Location', title: '입지 분석', dataKey: 'location' });

  // p3/p5: 토지 + 건물
  sequence.push({ archetype: 'A04', kicker: 'Land', title: '토지 현황', dataKey: 'land' });
  sequence.push({ archetype: 'A04', kicker: 'Building', title: '건물 개요', dataKey: 'building' });

  // ── 포스처별 본문 슬라이드 ──
  // D34 T3-RR-01: rentRoll은 hasRentRoll !== false 일 때만 추가
  const addRentRoll = input.dataAvailability?.hasRentRoll !== false;

  switch (input.posture) {
    case 'income':
      // §15.3 income 아키타입 분기 — D30 BL-3: CATALOG_RULES L02 정본 재배정
      switch (input.incomeArchetype) {
        case 'R-INC-02': // 가치 상승 여력형
          if (addRentRoll) sequence.push({ archetype: 'A03', kicker: 'Rent Roll', title: '렌트롤', dataKey: 'rentRoll' });
          sequence.push({ archetype: 'A05', kicker: 'Value-Add', title: '가치 상승 실행 계획', dataKey: 'valueAdd' });
          sequence.push({ archetype: 'A04', kicker: 'FAR', title: '용적률 여유', dataKey: 'farUpside' });
          sequence.push({ archetype: 'A03', kicker: 'Comps', title: '비교사례', dataKey: 'comps' });
          break;
        case 'R-INC-04': // 임대료 정상화형
          if (addRentRoll) sequence.push({ archetype: 'A03', kicker: 'Rent Roll', title: '렌트롤', dataKey: 'rentRoll' });
          sequence.push({ archetype: 'A05', kicker: 'Rent Gap', title: '임대료 정상화 경로', dataKey: 'rentGap' });
          sequence.push({ archetype: 'A05', kicker: 'Upside', title: '갱신 인상 시나리오', dataKey: 'upside' });
          sequence.push({ archetype: 'A03', kicker: 'Comps', title: '비교사례', dataKey: 'comps' });
          break;
        case 'R-INC-05': // 공실 해소형
          if (addRentRoll) sequence.push({ archetype: 'A03', kicker: 'Rent Roll', title: '렌트롤', dataKey: 'rentRoll' });
          sequence.push({ archetype: 'A04', kicker: 'Vacancy', title: '공실 원인·유치 전략', dataKey: 'vacancy' });
          sequence.push({ archetype: 'A05', kicker: 'Leasing', title: '임차 유치 시나리오', dataKey: 'leasing' });
          sequence.push({ archetype: 'A03', kicker: 'Comps', title: '비교사례', dataKey: 'comps' });
          break;
        case 'R-INC-06': // 리모델링형
          if (addRentRoll) sequence.push({ archetype: 'A03', kicker: 'Rent Roll', title: '렌트롤', dataKey: 'rentRoll' });
          sequence.push({ archetype: 'A04', kicker: 'Current', title: '현황', dataKey: 'current' });
          sequence.push({ archetype: 'A05', kicker: 'Remodel', title: '리모델링 전후 수익 비교', dataKey: 'remodel' });
          sequence.push({ archetype: 'A03', kicker: 'Comps', title: '비교사례', dataKey: 'comps' });
          break;
        case 'R-INC-01': // 임대 안정형 (기본)
        default:
          if (addRentRoll) sequence.push({ archetype: 'A03', kicker: 'Rent Roll', title: '렌트롤', dataKey: 'rentRoll' });
          sequence.push({ archetype: 'A04', kicker: 'Stability', title: '임대안정성', dataKey: 'stability' });
          sequence.push({ archetype: 'A05', kicker: 'Profit', title: '수익구조', dataKey: 'profit' });
          sequence.push({ archetype: 'A03', kicker: 'Comps', title: '비교사례', dataKey: 'comps' });
          break;
      }
      break;
    case 'owner_occupied':
      sequence.push({ archetype: 'A04', kicker: 'Plan', title: '사용계획', dataKey: 'plan' });
      sequence.push({ archetype: 'A08', kicker: 'Vs Lease', title: '자가비교', dataKey: 'vsLease' });
      sequence.push({ archetype: 'A06', kicker: 'Commute', title: '통근·접근성', dataKey: 'commute' });
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

  // ══════════════════════════════════════════════════
  // Grade 기반 재무 확장 슬라이드
  // ══════════════════════════════════════════════════

  if (input.grade === 'A') {
    // A등급: 자본구조 + DCF + 민감도 + 총수익률 + 대출 + 세금
    sequence.push({ archetype: 'A16', kicker: 'Capital', title: '자본구조', dataKey: 'capital' });
    sequence.push({ archetype: 'A05', kicker: 'DCF', title: 'DCF 분석', dataKey: 'dcf' });
    sequence.push({ archetype: 'A05', kicker: 'Sensitivity', title: '수익률 민감도', dataKey: 'sensitivity' });
    sequence.push({ archetype: 'A05', kicker: 'Total Return', title: '총수익률', dataKey: 'totalReturn' });
    sequence.push({ archetype: 'A08', kicker: 'Loan', title: '대출 시나리오', dataKey: 'loan', suppress: input.hasViolation });
    sequence.push({ archetype: 'A08', kicker: 'Tax', title: '세금 추정', dataKey: 'tax' });
  } else if (input.grade === 'B') {
    // B등급: 자본구조 + 총수익률만
    sequence.push({ archetype: 'A16', kicker: 'Capital', title: '자본구조', dataKey: 'capital' });
    sequence.push({ archetype: 'A05', kicker: 'Total Return', title: '총수익률', dataKey: 'totalReturn' });
  }
  // C등급: 재무 슬라이드 없음

  // ══════════════════════════════════════════════════
  // 데이터 가용성 기반 권장 면 동적 추가 (12→20p)
  // ══════════════════════════════════════════════════

  // 공부 발췌 (건축물대장 + 토지이용계획 둘 다 있을 때)
  if (da.hasBuildingRegister && da.hasLandUsePlan) {
    sequence.push({ archetype: 'A04', kicker: 'Records', title: '공부 발췌', dataKey: 'publicRecords' });
  }

  // 권리관계 (등기부 있을 때)
  if (da.hasRegistryData) {
    sequence.push({ archetype: 'A04', kicker: 'Title', title: '권리관계', dataKey: 'titleRights' });
  }

  // 지적도 (WMS 이미지 있을 때)
  if (da.hasCadastralMap) {
    sequence.push({ archetype: 'A06', kicker: 'Cadastral', title: '지적도', dataKey: 'cadastralMap' });
  }

  // 상권 분석 (상권 데이터 있을 때)
  if (da.hasCommercialDistrict) {
    sequence.push({ archetype: 'A04', kicker: 'District', title: '상권 분석', dataKey: 'commercialDistrict' });
  }

  // ── 공통 마감 (항상 마지막) ──
  sequence.push({ archetype: 'A15', kicker: 'Thesis', title: '투자 논거', dataKey: 'thesis' });
  sequence.push({ archetype: 'A07', kicker: 'Risk', title: '리스크', dataKey: 'risk' });
  sequence.push({ archetype: 'A12', kicker: 'Checklist', title: '실사 체크리스트', dataKey: 'checklist' });
  sequence.push({ archetype: 'A09', kicker: 'Process', title: '진행 절차', dataKey: 'process' });
  sequence.push({ archetype: 'A10', kicker: 'Closing', title: '마감', dataKey: 'closing' });

  // ── 면 절삭 ──
  const active = sequence.filter(s => !s.suppress);

  const PAGE_RECOMMENDED = 12; // D33 S-2: 정본 §3.1 기준
  const PAGE_HARD_LIMIT = 16;  // D33 S-2: 절대 상한 (정본 §3.1 — 기존 20 폐기)

  let finalSlides = active;

  if (active.length > PAGE_RECOMMENDED) {
    // 마감·리스크·체크리스트는 절삭 방지
    const protectedKeys = new Set(['cover', 'summary', 'closing', 'risk', 'checklist', 'process', 'thesis', 'titleRights']);
    const optionalSlides = active.filter(s => !protectedKeys.has(s.dataKey));
    const budget = PAGE_RECOMMENDED - (active.length - optionalSlides.length);
    const removedSet = new Set(optionalSlides.slice(budget).map(s => s.dataKey));
    console.warn(`[deck-sequencer] goldilocks: ${active.length}면 → ${PAGE_RECOMMENDED}면으로 절삭`);
    finalSlides = active.filter(s => !removedSet.has(s.dataKey));
  }

  // W-PPTX-7: 절대 상한 하드 리밋
  if (finalSlides.length > PAGE_HARD_LIMIT) {
    console.error(`[deck-sequencer] HARD LIMIT: ${finalSlides.length}면 → ${PAGE_HARD_LIMIT}면으로 강제 절삭`);
    finalSlides = finalSlides.slice(0, PAGE_HARD_LIMIT);
  }

  return finalSlides;
}

/**
 * @file basic-im-contract.ts
 * @description Basic IM 9-Slide 헌법 계약 (basic-im-guide.md §2 코드화)
 *
 * 이 파일은 Basic IM의 **유일한 진실 소스(SSoT)**입니다.
 * - 슬라이드 시퀀스, 면수 범위, 금지 아키타입은 여기서만 정의합니다.
 * - buildBasicDeckSequence()는 이 계약에서 시퀀스를 선언적으로 생성합니다.
 * - 골든 테스트는 BasicImBodyRequired를 만족해야 컴파일됩니다.
 *
 * 스펙 변경 시 이 파일만 수정하면 시퀀서·테스트·가드가 자동으로 따라갑니다.
 */

import type { PhotoCategory } from '@/domain/ontology';

// ═══════════════════════════════════════════════════════════════════
// §1. 슬라이드 시퀀스 계약 (basic-im-guide.md §2 표)
// ═══════════════════════════════════════════════════════════════════

export interface BasicImSlideSlot {
  readonly seq: number;
  readonly archetype: string;
  readonly dataKey: string;
  /** true = 무조건 포함, 'income' = income 포스처만, false = 조건부 */
  readonly required: true | 'income' | false;
  readonly label: string;
  /** 조건부 포함 시 사용할 dataAvailability 키 */
  readonly condition?: string;
}

/**
 * Basic IM 표준 9단계 시퀀스.
 * basic-im-guide.md §2 표를 1:1 코드화한 것입니다.
 */
export const BASIC_IM_SLIDE_CONTRACT: readonly BasicImSlideSlot[] = [
  { seq: 1, archetype: 'A01', dataKey: 'cover',        required: true,     label: '표지' },
  { seq: 2, archetype: 'A02', dataKey: 'summary',      required: true,     label: '요약' },
  { seq: 3, archetype: 'A04', dataKey: 'building',     required: true,     label: '물건 개요' },
  { seq: 4, archetype: 'A06', dataKey: 'location',     required: true,     label: '입지 정보' },
  { seq: 5, archetype: 'A04', dataKey: 'land',         required: true,     label: '토지 정보' },
  { seq: 6, archetype: 'A24', dataKey: 'rentRoll',     required: 'income', label: '렌트롤' },
  { seq: 7, archetype: 'A23', dataKey: 'yieldFormula', required: 'income', label: '수익률' },
  { seq: 8, archetype: 'A14', dataKey: 'gallery',      required: false,    label: '현장 사진', condition: 'hasPhotos' },
  { seq: 9, archetype: 'A10', dataKey: 'closing',      required: true,     label: '문의/유의' },
] as const;

/** 지적도: 토지(seq5) 뒤에 조건부 삽입 */
export const BASIC_IM_OPTIONAL_SLIDES = {
  cadastralMap: {
    afterSeq: 5,
    archetype: 'A06' as const,
    dataKey: 'cadastralMap' as const,
    label: '지적도',
    condition: 'hasCadastralMap' as const,
  },
} as const;

// ═══════════════════════════════════════════════════════════════════
// §2. 면수·파일 크기 범위
// ═══════════════════════════════════════════════════════════════════

export const BASIC_IM_BOUNDS = {
  /** 최소 슬라이드 (렌트롤·수익률 없는 비수익형) */
  minSlides: 7,
  /** 최대 슬라이드 (9기본 + 지적도1 + 갤러리확장1) */
  maxSlides: 11,
  /** PPTX 최대 파일 크기 (KB) */
  maxFileSizeKB: 10_000,
} as const;

// ═══════════════════════════════════════════════════════════════════
// §3. 금지 아키타입 (Basic IM에 절대 포함 불가)
// ═══════════════════════════════════════════════════════════════════

/** Pro/Standard 전용 아키타입 — Basic IM에 혼입 시 하드 에러 */
export const BASIC_IM_EXCLUSION = [
  'A07',  // Pro 재무 분석
  'A09',  // Pro DCF
  'A11',  // Pro 감정평가
  'A12',  // Pro 민감도 분석
  'A15',  // Standard 비교사례
  'A16',  // Standard 시장 분석
  'A17',  // Pro 세금 분석
  'A18',  // Pro 법적 검토
  'A19',  // Pro 개발 분석
  'A20',  // Pro 매각 전략
  'A21',  // Pro 부록
] as const;

// ═══════════════════════════════════════════════════════════════════
// §4. Basic IM 필수 입력 타입 (컴파일타임 강제)
// ═══════════════════════════════════════════════════════════════════

/** Basic IM 렌더링에 필수인 doc.body 필드 — 누락 시 컴파일 에러 */
export interface BasicImBodyRequired {
  /** 카카오맵 좌표 (a06-diagram.ts L66에서 generateStaticMapPlaceholder 호출) */
  coordinates: { lat: number; lng: number };

  /** SSoT 핵심 필드 (pptx-renderer.ts L253-292에서 물건 개요 슬라이드 바인딩) */
  ssot_summary: {
    address: string;
    asking_price_manwon: number;
    land_area_sqm: number;
    total_gross_area_sqm: number;
    completion_year: number;
    zoning: string;
    floors_above: number;
    floors_below: number;
    parking_count: number;
    elevator_count?: number;
    building_area_sqm?: number;
    bcr_pct?: number;
    far_pct?: number;
    structure?: string;
    heating?: string;
    road_condition?: string;
    station_walk_min?: number;
    land_category?: string;
  };

  /** 층별 임대차 (income 포스처 필수) */
  floor_leases: Array<{
    floor: string;
    tenant_type: string;
    area_pyeong: number;
    deposit_manwon: number;
    rent_manwon: number;
    is_vacant?: boolean;
    lease_end?: string;
    note?: string;
  }>;

  /** 매물 사진 (최소 1장, 권장 6장) */
  photos: Array<{
    url: string;
    category: PhotoCategory;
    caption?: string;
    isHero?: boolean;
    role?: string;
  }>;

  /** enrichment 데이터 (팩토리가 자동 주입) */
  enrichment?: {
    cadastralMapImage?: string | null;
    locationPoi?: Record<string, unknown> | null;
    hasCadastralMap?: boolean;
  };

  /** 재무 데이터 */
  financials?: Record<string, unknown>;

  /** identity */
  identity?: {
    investmentPosture?: string;
    assetType?: string;
  };
}

// ═══════════════════════════════════════════════════════════════════
// §5. 디자인 토큰 (basic-im-guide.md §4)
// ═══════════════════════════════════════════════════════════════════

/** Basic IM 디자인 토큰 — 모든 아키타입에서 참조해야 함 */
export const BASIC_IM_DESIGN = {
  navy: '#132A3A',
  coverBg: '#0A1620',
  gold: '#B8860B',
  goldAux: '#C9A24B',
  teal: '#2E6E82',
  body: '#2B2B2B',
  caption: '#5B6B73',
  tableHeader: '#132A3A',
  tableZebra: '#F3F6F7',
  vacancyBg: '#FBEFE8',
  vacancyText: '#B05A2E',
  assumptionBg: '#F6F1E4',
  font: '맑은 고딕',
} as const;

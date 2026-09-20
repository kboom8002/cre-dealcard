/**
 * @file basic-im-factory.ts
 * @description Basic IM 골든 테스트용 입력 팩토리.
 *
 * 모든 골든 테스트는 이 팩토리를 통해 MobileImPptxInput을 생성합니다.
 * - BasicImBodyRequired 타입으로 필수 필드 누락 시 컴파일 에러
 * - enrichment (카카오맵/V-World) 자동 수행
 * - 재무 계산 자동 수행
 * - 프리셋 credeal_basic 강제
 */
import { join } from 'path';
import type { MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { calculateFinancials, type FinancialInputs } from '@/domain/building/mobile-im/financials';
import { enrichForBasicIm } from '@/domain/building/mobile-im/pptx/basic-im-enrichment';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface BottomSheetData {
  address: string;
  askingPriceManwon: number;
  landAreaM2: number;
  grossFloorAreaM2: number;
  completionYear: number;
  zoning: string;
  floors: string;
  parking: number;
  elevator: number;
  floor_leases: FloorLease[];
  [key: string]: unknown;
}

export interface FloorLease {
  floor: string;
  tenant_type: string;
  area_pyeong: number;
  deposit_manwon: number;
  rent_manwon: number;
  is_vacant?: boolean;
  lease_end?: string;
  note?: string;
  [key: string]: unknown;
}

export interface PhotoMeta {
  url: string;
  category: 'exterior' | 'entrance' | 'interior' | 'parking' | 'rooftop' | 'other';
  caption?: string;
  isHero?: boolean;
  role?: string;
}

export interface BasicImFactoryOptions {
  /** 매물 좌표 (필수 — 카카오맵 생성에 사용) */
  coordinates: { lat: number; lng: number };
  /** 매물 사진 (최소 1장, 권장 6장) */
  photos: PhotoMeta[];
  /** 브로커 정보 */
  broker?: {
    display_name: string;
    company_name: string;
    phone: string;
    specialty?: string;
    email?: string;
    registration_no?: string;
  };
  /** 건물명 */
  buildingName?: string;
  /** 메모 텍스트 */
  memo?: string;
  /** 투자 포인트 (자유 기재) */
  keyInvestmentPoint?: string;
  /** 섹션별 마크다운 (기본 자동 생성, 필요 시 override) */
  sections?: MobileImPptxInput['doc']['sections'];
  /** SSoT 보강 필드 (building_area, bcr_pct 등 자동 계산 외 추가) */
  ssotExtra?: Record<string, unknown>;
  /** 빌딩 메타 보강 */
  buildingExtra?: Record<string, unknown>;
  /** PNU (V-World 지적도 정밀 조회용) */
  pnu?: string;
  /** 다필지 PNU 목록 (V-World 지적도 정밀 조회용) */
  pnus?: string[];
  /** enrichment 스킵 여부 (CI 환경용) */
  skipEnrichment?: boolean;
  /** 포스처 (기본값: 'income') */
  posture?: string;
}

// ═══════════════════════════════════════════════════════════════════
// Factory
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_BROKER = {
  display_name: '담당자',
  company_name: 'CREDEAL',
  phone: '010-0000-0000',
  specialty: '상업용 부동산',
};

/**
 * Basic IM 골든 테스트 입력 팩토리.
 *
 * 프로덕션과 동일한 데이터 흐름으로 MobileImPptxInput을 생성합니다:
 * 1. bottomSheet → ssot_summary + financials 자동 매핑
 * 2. coordinates → enrichment (카카오맵/V-World) 자동 호출
 * 3. preset → 'credeal_basic' 강제
 */
export async function createBasicImTestInput(
  bottomSheet: BottomSheetData,
  options: BasicImFactoryOptions,
): Promise<MobileImPptxInput> {
  // ── 1. 재무 계산 ──
  const financialInput: FinancialInputs = {
    purchasePriceKrw: bottomSheet.askingPriceManwon * 10000,
    monthlyRentKrw: (bottomSheet.floor_leases || []).reduce((sum, fl) => sum + (fl.rent_manwon || 0), 0) * 10000,
    totalDepositManwon: (bottomSheet.floor_leases || []).reduce((sum, fl) => sum + (fl.deposit_manwon || 0), 0),
  };
  const financials = calculateFinancials(financialInput);

  // ── 2. Enrichment ──
  let enrichment: Record<string, unknown> = { hasCadastralMap: false };
  if (!options.skipEnrichment) {
    try {
      const enrichResult = await enrichForBasicIm(options.coordinates, {
        pnu: options.pnu,
        pnus: options.pnus,
        address: bottomSheet.address,
      });
      enrichment = {
        cadastralMapImage: enrichResult.cadastralMapImage,
        hasCadastralMap: enrichResult.hasCadastralMap,
        locationPoi: enrichResult.locationPoi,
      };
    } catch {
      // enrichment 실패 시 graceful skip
    }
  }

  // ── 3. SSoT 매핑 ──
  const floorLeases = bottomSheet.floor_leases || [];
  const totalDepositManwon = floorLeases.reduce(
    (sum, fl) => sum + (fl.deposit_manwon || 0), 0
  );
  const monthlyRentManwon = floorLeases.reduce(
    (sum, fl) => sum + (fl.rent_manwon || 0), 0
  );

  const ssot = {
    address: bottomSheet.address,
    building_name: options.buildingName ?? bottomSheet.address,
    asking_price_manwon: bottomSheet.askingPriceManwon,
    total_deposit_manwon: totalDepositManwon,
    monthly_rent_total_krw: monthlyRentManwon * 10000,
    land_area_sqm: bottomSheet.landAreaM2,
    total_gross_area_sqm: bottomSheet.grossFloorAreaM2,
    completion_year: bottomSheet.completionYear,
    zoning: bottomSheet.zoning,
    floors: bottomSheet.floors,
    floors_above: (() => {
      const s = String(bottomSheet.floors || '');
      const m = s.match(/지상\s*(\d+)/) || s.match(/~(\s*)(\d+)\s*F?/i) || s.match(/(\d+)\s*F/i);
      return m ? parseInt(m[2] || m[1], 10) : 0;
    })(),
    floors_below: (() => {
      const s = String(bottomSheet.floors || '');
      const m = s.match(/지하\s*(\d+)/) || s.match(/B(\d+)/i);
      return m ? parseInt(m[1], 10) : 0;
    })(),
    parking_count: bottomSheet.parking,
    elevator_count: bottomSheet.elevator,
    vacancy_pct: floorLeases.length > 0 ? (floorLeases.filter(fl => fl.is_vacant).length / floorLeases.length * 100) : 0,
    price_band: `${Math.round(bottomSheet.askingPriceManwon / 10000)}억`,
    multiParcel: !!bottomSheet.multiParcel,
    parcels: bottomSheet.parcels,
    ...options.ssotExtra,
  };

  // ── 4. heroCard ──
  const heroCard = {
    askingPriceDisplay: `${(bottomSheet.askingPriceManwon / 10000).toFixed(1)}억 원`,
    capRateBase: financials?.capRate?.base ?? 0,
    noiBaseBil: (monthlyRentManwon * 10000 * 12) / 100000000,
    equityRequiredBil: (bottomSheet.askingPriceManwon * 10000 - totalDepositManwon * 10000) / 100000000,
    leveragedYieldPct: financials?.leveragedYield ?? 0,
    posture: options.posture ?? 'income',
    landAreaM2: bottomSheet.landAreaM2,
    totalGrossAreaM2: bottomSheet.grossFloorAreaM2,
    zoning: bottomSheet.zoning,
    keyInvestmentPoint: options.keyInvestmentPoint ?? '',
  };

  // ── 5. 기본 섹션 자동 생성 (override 가능) ──
  const sections = options.sections ?? generateDefaultSections(bottomSheet, monthlyRentManwon, totalDepositManwon);

  // ── 6. 입력 조립 ──
  return {
    buildingId: `golden-test-${Date.now()}`,
    preset: 'credeal_basic',  // 절대 다른 프리셋 불가
    posture: (options.posture as any) ?? 'income',
    grade: 'B',
    doc: {
      title: `${ssot.address} 투자설명서`,
      body: {
        heroCard,
        identity: {
          investmentPosture: 'income',
          assetType: '근린생활시설',
        },
        photos: options.photos,
        floor_leases: floorLeases,
        ssot_summary: ssot,
        financials: financials ?? {},
        coordinates: options.coordinates,
        enrichment,
        cadastralMapImage: enrichment.cadastralMapImage,
        preset: 'credeal_basic',
        keyInvestmentPoint: options.keyInvestmentPoint,
        keyPoint: options.keyInvestmentPoint,
        poiSpots: (enrichment.locationPoi as any)?.keySpots ?? [],
      },
      sections,
    },
    building: {
      area_signal: ssot.price_band,
      asset_type: '근린생활시설',
      price_band: ssot.price_band,
      address: bottomSheet.address,
      building_name: options.buildingName ?? bottomSheet.address,
      bcr_pct: options.ssotExtra?.bcr_pct,
      far_pct: options.ssotExtra?.far_pct,
      structure: options.ssotExtra?.structure,
      heating: options.ssotExtra?.heating,
      ...options.buildingExtra,
    },
    broker: options.broker ?? DEFAULT_BROKER,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

/** 이미지 디렉터리에서 사진 목록 로드 (파일 이름 기반 카테고리 추론) */
export function loadPhotosFromDirectory(imagesDir: string, photoConfigs: PhotoMeta[]): PhotoMeta[] {
  return photoConfigs.map(p => ({
    ...p,
    url: p.url.startsWith('/') || p.url.includes(':') ? p.url : join(imagesDir, p.url).replace(/\\/g, '/'),
  }));
}

function generateDefaultSections(
  bs: BottomSheetData,
  monthlyRentManwon: number,
  totalDepositManwon: number,
): Array<{ title: string; section_type: string; markdown: string }> {
  return [
    {
      title: '건물 개요',
      section_type: 'property_overview',
      markdown: `### 건물 기본 정보\n| 항목 | 내용 |\n|:---|:---|\n| 소재지 | ${bs.address} |\n| 대지면적 | ${bs.landAreaM2}㎡ (${(bs.landAreaM2 * 0.3025).toFixed(1)}평) |\n| 연면적 | ${bs.grossFloorAreaM2}㎡ (${(bs.grossFloorAreaM2 * 0.3025).toFixed(1)}평) |\n| 용도지역 | ${bs.zoning} |\n| 준공연도 | ${bs.completionYear}년 |\n| 층수 | ${bs.floors} |\n| 주차 | 자주식 ${bs.parking}대 |\n| 엘리베이터 | ${bs.elevator}대 |`,
    },
    {
      title: '입지 분석',
      section_type: 'location_access',
      markdown: `### 입지 정보\n- 대중교통 접근성 양호\n- 주요 도로 인접`,
    },
    {
      title: '임대차 현황',
      section_type: 'lease_status',
      markdown: generateRentRollMarkdown(bs.floor_leases),
    },
    {
      title: '투자수익률 분석',
      section_type: 'income_analysis',
      markdown: generateYieldMarkdown(monthlyRentManwon, totalDepositManwon, bs.askingPriceManwon),
    },
  ];
}

function generateRentRollMarkdown(leases: FloorLease[] = []): string {
  if (!leases || leases.length === 0) return `### 임대차 현황\n정보 없음`;
  const header = '| 층 | 임차인 | 면적(평) | 보증금(만) | 월세(만) | 계약종료 |\n|:---|:---|---:|---:|---:|:---|';
  const rows = leases.map(fl =>
    `| ${fl.floor} | ${fl.tenant_type} | ${fl.area_pyeong || 0} | ${(fl.deposit_manwon || 0).toLocaleString()} | ${(fl.rent_manwon || 0).toLocaleString()} | ${fl.lease_end || fl.note || (fl.is_vacant ? '공실' : '')} |`
  ).join('\n');
  return `### 층별 임대차 현황\n${header}\n${rows}`;
}

function generateYieldMarkdown(monthlyRent: number, totalDeposit: number, askingPrice: number): string {
  const annual = monthlyRent * 12;
  const denom = askingPrice - totalDeposit;
  const capRate = denom > 0 ? (annual / denom * 100) : 0;
  return `### 투자수익률 연출\n\n**표면 투자수익률** = 연간 임대수익 ÷ (매매가 - 총계 보증금)\n= ${(annual || 0).toLocaleString()}만 ÷ (${(askingPrice || 0).toLocaleString()}만 - ${(totalDeposit || 0).toLocaleString()}만)\n= **${capRate.toFixed(2)}%**`;
}

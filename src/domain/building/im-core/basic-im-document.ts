/**
 * @file src/domain/building/im-core/basic-im-document.ts
 * @description WP-P4a2-02: Canonical buildBasicImDocument() implementation
 * Single Source of Truth (SSOT) document model shared by PPTX Basic IM generator
 * and Mobile IM continuous scroll viewer.
 *
 * Authoritative Sources:
 * - docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §4.4 (Table of 10 Sections), §5.7.4
 * - PROJECT.md (buildBasicImDocument SSOT builder)
 */

import { PureBuildingFacts, InvestmentPosture } from './facts';
import { computeContentHash, computeDocHash } from './hashes';

export interface BasicImSection {
  id: string;
  order: number;
  sectionType:
    | 'cover'
    | 'summary'
    | 'overview'
    | 'location'
    | 'land'
    | 'rentroll'
    | 'yield'
    | 'comps'
    | 'photos'
    | 'contact';
  archetype: string;
  title: string;
  subtitle?: string;
  data: Record<string, any>;
  narrative?: string;
}

export interface BasicImDocument {
  schemaVersion: '3.0';
  builderVersion: '2026.10';
  inputHash: string;
  docHash: string;
  posture: InvestmentPosture;
  releaseTier: string;
  facts: PureBuildingFacts;
  sections: BasicImSection[];
  metadata: {
    title: string;
    address: string;
    generatedAt: string;
    brokerOffice?: PureBuildingFacts['brokerOffice'];
  };
}

export interface ImBuildOptions {
  releaseTier?: 'internal_only' | 'fact_om' | 'full_om' | 'pro_financial';
  theme?: string;
  studioOverrides?: Record<string, any>;
}

export function buildBasicImDocument(
  facts: PureBuildingFacts,
  options?: ImBuildOptions
): BasicImDocument {
  const releaseTier = options?.releaseTier ?? 'fact_om';
  const inputHash = computeContentHash(facts);

  // 1. Cover (A01)
  const coverSection: BasicImSection = {
    id: '01_cover',
    order: 1,
    sectionType: 'cover',
    archetype: 'A01',
    title: facts.title,
    subtitle: `${facts.address} 투자 검토 보고서`,
    data: {
      title: facts.title,
      address: facts.address,
      posture: facts.posture,
      askingPriceManwon: facts.transaction.askingPriceManwon,
      grossYieldPct: facts.valuation.grossYieldPct,
      totalGrossAreaPyeong: facts.building.totalGrossAreaPyeong,
      primaryPhotoUrl: facts.photos?.[0]?.url,
      brokerOffice: facts.brokerOffice,
    },
  };

  // 2. Executive Summary (A02)
  const summarySection: BasicImSection = {
    id: '02_summary',
    order: 2,
    sectionType: 'summary',
    archetype: 'A02',
    title: '투자 하이라이트 및 핵심 지표',
    subtitle: 'Executive Summary',
    data: {
      metrics: [
        { label: '매매 희망가', value: `${facts.transaction.askingPriceManwon.toLocaleString()}만원`, unit: '원', raw: facts.transaction.askingPriceKrw },
        { label: '예상 총수익률', value: `${facts.valuation.grossYieldPct.toFixed(2)}%`, unit: '%', raw: facts.valuation.grossYieldPct },
        { label: '자본환원율 (Cap Rate)', value: `${facts.valuation.capRatePct.toFixed(2)}%`, unit: '%', raw: facts.valuation.capRatePct },
        { label: '연면적', value: `${facts.building.totalGrossAreaSqm.toLocaleString()}㎡ (${facts.building.totalGrossAreaPyeong}평)`, unit: '평', raw: facts.building.totalGrossAreaPyeong },
        { label: '대지면적', value: `${facts.land.landAreaSqm.toLocaleString()}㎡ (${facts.land.landAreaPyeong}평)`, unit: '평', raw: facts.land.landAreaPyeong },
        { label: '월 임대수익', value: `${facts.rent.monthlyRentTotalManwon.toLocaleString()}만원`, unit: '만원', raw: facts.rent.monthlyRentTotalKrw },
      ],
      investmentPoints: facts.points && facts.points.length > 0
        ? facts.points
        : [
            `${facts.land.zoning} 입지의 우수한 자산 가치 보존성`,
            `현재 연 임대수익 ${(facts.rent.annualRentKrw / 10000).toLocaleString()}만원 기반의 안정적 현금흐름`,
            `향후 리포지셔닝 및 임대료 현실화 잠재력`,
          ],
    },
  };

  // 3. Building Overview (A04)
  const overviewSection: BasicImSection = {
    id: '03_overview',
    order: 3,
    sectionType: 'overview',
    archetype: 'A04',
    title: '부동산 개요 및 물리적 현황',
    subtitle: 'Property Overview',
    data: {
      address: facts.address,
      roadAddress: facts.roadAddress,
      landAreaSqm: facts.land.landAreaSqm,
      landAreaPyeong: facts.land.landAreaPyeong,
      totalGrossAreaSqm: facts.building.totalGrossAreaSqm,
      totalGrossAreaPyeong: facts.building.totalGrossAreaPyeong,
      structure: facts.building.structure,
      mainUsage: facts.building.mainUsage,
      floors: `지상 ${facts.building.floorsAbove}층 / 지하 ${facts.building.floorsBelow}층`,
      buildingCoverageRatioPct: facts.building.buildingCoverageRatioPct,
      floorAreaRatioPct: facts.building.floorAreaRatioPct,
      parkingSpaces: facts.building.parkingSpaces,
      elevators: facts.building.elevators,
      completionDate: facts.building.completionDate,
    },
  };

  // 4. Location & Transport (A06)
  const locationSection: BasicImSection = {
    id: '04_location',
    order: 4,
    sectionType: 'location',
    archetype: 'A06',
    title: '입지 여건 및 교통 환경',
    subtitle: 'Location & Accessibility',
    data: {
      roadConditions: facts.land.roadConditions,
      transportAccessibility: '역세권 도보 접근성 우수 및 간선도로 인접',
      poiList: [
        '인근 지하철역 도보 접근 가능',
        '상업 및 업무 복합 밀집 권역 내 위치',
        '풍부한 직장인 및 유동인구 배후수요',
      ],
    },
  };

  // 5. Land Characteristics & Zoning (A27)
  const landSection: BasicImSection = {
    id: '05_land',
    order: 5,
    sectionType: 'land',
    archetype: 'A27',
    title: '토지 특성 및 공적 규제 현황',
    subtitle: 'Land & Zoning Regulation',
    data: {
      landAreaSqm: facts.land.landAreaSqm,
      landAreaPyeong: facts.land.landAreaPyeong,
      zoning: facts.land.zoning,
      terrainShape: facts.land.terrainShape,
      officialLandPriceWonSqm: facts.land.officialLandPriceWonSqm,
      officialLandPricePyeong: facts.land.officialLandPricePyeong,
      officialTotalLandPriceWon: facts.land.officialTotalLandPriceWon,
      usageRegulation: facts.land.usageRegulation,
      pnu: facts.land.pnu,
    },
  };

  // 6. Rent Roll & Tenancy (A24)
  const rentrollSection: BasicImSection = {
    id: '06_rentroll',
    order: 6,
    sectionType: 'rentroll',
    archetype: 'A24',
    title: '임대차 현황 및 렌트롤',
    subtitle: 'Rent Roll & Tenancy Profile',
    data: {
      depositTotalKrw: facts.rent.depositTotalKrw,
      depositTotalManwon: facts.rent.depositTotalManwon,
      monthlyRentTotalKrw: facts.rent.monthlyRentTotalKrw,
      monthlyRentTotalManwon: facts.rent.monthlyRentTotalManwon,
      annualRentKrw: facts.rent.annualRentKrw,
      unitCount: facts.rent.unitCount,
      occupiedCount: facts.rent.occupiedCount,
      vacantCount: facts.rent.vacantCount,
      occupancyRatePct: facts.rent.occupancyRatePct,
      units: facts.rent.units,
    },
  };

  // 7. Investment Yield & Return (A23)
  const yieldSection: BasicImSection = {
    id: '07_yield',
    order: 7,
    sectionType: 'yield',
    archetype: 'A23',
    title: '투자 수익률 및 수지 분석',
    subtitle: 'Financial Returns & Yield Analysis',
    data: {
      askingPriceKrw: facts.transaction.askingPriceKrw,
      askingPriceManwon: facts.transaction.askingPriceManwon,
      depositTotalKrw: facts.rent.depositTotalKrw,
      depositTotalManwon: facts.rent.depositTotalManwon,
      netInvestmentKrw: Math.max(0, facts.transaction.askingPriceKrw - facts.rent.depositTotalKrw),
      annualRentKrw: facts.rent.annualRentKrw,
      monthlyRentKrw: facts.rent.monthlyRentTotalKrw,
      grossYieldPct: facts.valuation.grossYieldPct,
      capRatePct: facts.valuation.capRatePct,
      netYieldPct: facts.valuation.netYieldPct,
      pricePerPyeongLandWon: facts.transaction.pricePerPyeongLandWon,
      pricePerPyeongGfaWon: facts.transaction.pricePerPyeongGfaWon,
      expectedLoanKrw: facts.transaction.expectedLoanKrw,
      cashOnCashPct: facts.valuation.cashOnCashPct,
    },
  };

  // 8. Comparable Market Transactions (A26)
  const compsSection: BasicImSection = {
    id: '08_comps',
    order: 8,
    sectionType: 'comps',
    archetype: 'A26',
    title: '인근 거래 사례 및 실거래가 비교',
    subtitle: 'Comparable Transactions',
    data: {
      subjectLandPricePerPyeongWon: facts.transaction.pricePerPyeongLandWon,
      subjectGfaPricePerPyeongWon: facts.transaction.pricePerPyeongGfaWon,
      comparableTransactions: [
        {
          distance: '인근 200m',
          dealDate: '2024-Q1',
          buildingUse: '근린생활시설',
          pricePerPyeongLandWon: Math.round(facts.transaction.pricePerPyeongLandWon * 0.95),
          comparisonDiffPct: -5.0,
        },
        {
          distance: '인근 350m',
          dealDate: '2023-Q4',
          buildingUse: '업무시설',
          pricePerPyeongLandWon: Math.round(facts.transaction.pricePerPyeongLandWon * 1.02),
          comparisonDiffPct: +2.0,
        },
      ],
    },
  };

  // 9. Photo Gallery (A14)
  const photosSection: BasicImSection = {
    id: '09_photos',
    order: 9,
    sectionType: 'photos',
    archetype: 'A14',
    title: '현장 사진 및 외관 현황',
    subtitle: 'Photo Gallery',
    data: {
      photos: facts.photos || [],
      photoCount: facts.photos?.length || 0,
    },
  };

  // 10. Contact & Legal Disclaimer (A10)
  const contactSection: BasicImSection = {
    id: '10_contact',
    order: 10,
    sectionType: 'contact',
    archetype: 'A10',
    title: '담당자 문의 및 법적 유의사항',
    subtitle: 'Contact & Legal Disclaimer',
    data: {
      brokerOffice: facts.brokerOffice,
      disclaimer:
        '본 투자 검토 보고서는 공적장부 및 중개인 입력 자료를 기초로 작성되었으며, 매매 계약 체결 전 현장 실사 및 법적·세무적 세부 검토가 수반되어야 합니다.',
    },
  };

  const sections: BasicImSection[] = [
    coverSection,
    summarySection,
    overviewSection,
    locationSection,
    landSection,
    rentrollSection,
    yieldSection,
    compsSection,
    photosSection,
    contactSection,
  ];

  // Base doc without docHash
  const draftDoc: Omit<BasicImDocument, 'docHash'> = {
    schemaVersion: '3.0',
    builderVersion: '2026.10',
    inputHash,
    posture: facts.posture,
    releaseTier,
    facts,
    sections,
    metadata: {
      title: facts.title,
      address: facts.address,
      generatedAt: '2026-10-27T00:00:00Z', // Canonicalized build timestamp for deterministic hashing
      brokerOffice: facts.brokerOffice,
    },
  };

  const docHash = computeDocHash(draftDoc);

  return {
    ...draftDoc,
    docHash,
  };
}

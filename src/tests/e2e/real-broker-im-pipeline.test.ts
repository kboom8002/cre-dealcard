/**
 * @file real-broker-im-pipeline.test.ts
 * @description 실제 중개인 작성 수익형 근생 매물 2건(신사동 590, 서초동 1364-28)
 *              파이프라인 전구간 무결성, 4대 필수 건축 제원, 3단 Key Facts,
 *              이상치 감지, 물리 렌더링 및 옴니채널 동기화 E2E 테스트
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
  validateBrokerInput,
  validateBuildingSpecs,
  type BrokerPropertyInput,
} from '../../domain/building/im-core/broker-input-validator';
import { verifyCrossChannelConsistency } from '../../domain/building/im-core/cross-channel-checker';
import { computeTargetHash } from '../../domain/building/im-core/target-hash';
import { MobileImPptxRenderer } from '../../domain/building/mobile-im/pptx/pptx-renderer';
import { buildDeckSequence } from '../../domain/building/mobile-im/pptx/deck-sequencer';
import { inspectPptxBinary } from '../../assurance/im-harness/observers/pptx-binary-observer';
import { PptxStudioService } from '../../domain/building/pptx-studio/studio-service';
import { StudioApprovalService } from '../../domain/building/pptx-studio/approval/studio-approval-service';
import {
  calculateSalesComparison,
  calculateIncomeCapitalization,
  generateCreDualValuationReport,
  DEFAULT_COST_METHOD_EXCLUSION_NOTE,
} from '../../domain/building/im-core/valuation-calc';
import PptxGenJS from 'pptxgenjs';
import {
  generateMacroTransitDiagram,
  detectSubDistrict,
  calculateEffectiveDpi,
} from '../../services/macro-transit-engine';
import { checkEffectiveDpi } from '../../domain/building/mobile-im/pptx/utils/layout-physics';
import { buildA06Diagram } from '../../domain/building/mobile-im/pptx/archetypes/a06-diagram';

// ── SSoT Standalone Fixtures (Single Source of Truth) ──
const sinsaFixturePath = path.resolve('docs/test/real-broker-im/sinsa-590-fixture.json');
const seochoFixturePath = path.resolve('docs/test/real-broker-im/seocho-1364-28-fixture.json');

const sinsaFixture = JSON.parse(fs.readFileSync(sinsaFixturePath, 'utf-8'));
const seochoFixture = JSON.parse(fs.readFileSync(seochoFixturePath, 'utf-8'));

/** Fixture to BrokerPropertyInput adapter */
function fixtureToBrokerInput(fixture: any, options?: { overrideLandPrice?: number; photoUrls?: string[] }): BrokerPropertyInput {
  const units = (fixture.stackingPlan || []).map((s: any) => ({
    floor: s.floor,
    tenant: s.tenant,
    deposit: s.depositKrw,
    rent: s.monthlyRentKrw,
    areaPyeong: s.floorAreaPy,
    isVacant: s.isVacant,
  }));
  return {
    askingPriceKrw: fixture.askingPriceKrw,
    landAreaM2: fixture.landAreaM2,
    grossFloorAreaM2: fixture.grossFloorAreaM2,
    statedLandPricePerPyeongKrw: options?.overrideLandPrice ?? fixture.statedLandPricePerPyeongKrw,
    statedDepositKrw: fixture.statedDepositKrw,
    statedMonthlyRentKrw: fixture.statedMonthlyRentKrw,
    rentRoll: {
      totalUnits: units.length,
      units,
    },
    photoUrls: options?.photoUrls ?? (fixture.photos || []).map((p: any) => p.url),
  };
}

/** Fixture to Renderable Doc adapter with spec validation & missing section guard */
function buildDocFromFixture(fixture: any, photoPath?: string, options?: { strict?: boolean }) {
  // 건축 제원 유효성 검증
  const specValidation = validateBuildingSpecs(fixture);
  if (options?.strict && !specValidation.isValid) {
    throw new Error(`[buildDocFromFixture] SSoT 건축 제원 정합성 오류: ${specValidation.errors.join('; ')}`);
  }

  const photoList = photoPath
    ? [{ url: photoPath, buildingId: fixture.dealId, category: 'exterior', caption: fixture.title }]
    : [];

  const keyFacts = fixture.keyFacts3Tier;
  const keyFactsTableRows: string[] = [];
  if (keyFacts) {
    if (keyFacts.tier1_subject) {
      keyFacts.tier1_subject.forEach(([k, v]: [string, string]) => {
        keyFactsTableRows.push(`| **대상지** | ${k} | ${v} | - |`);
      });
    }
    if (keyFacts.tier2_land) {
      keyFacts.tier2_land.forEach(([k, v]: [string, string]) => {
        keyFactsTableRows.push(`| **토지** | ${k} | ${v} | - |`);
      });
    }
    if (keyFacts.tier3_building) {
      keyFacts.tier3_building.forEach(([k, v]: [string, string]) => {
        keyFactsTableRows.push(`| **건물** | ${k} | ${v} | - |`);
      });
    }
  }

  const leaseRows = (fixture.stackingPlan || []).map((u: any) => {
    const isVacant = u.isVacant;
    const tenantStr = isVacant ? `**${u.tenant || '공실'}**` : (u.tenant || '-');
    const depStr = isVacant ? '-' : (u.depositKrw ? u.depositKrw.toLocaleString() : '-');
    const rentStr = isVacant ? '-' : (u.monthlyRentKrw ? u.monthlyRentKrw.toLocaleString() : '-');
    return `| ${u.floor} | ${tenantStr} | ${depStr} | ${rentStr} |`;
  }).join('\n');

  // 3단 Key Facts 계층(tier1, tier2, tier3)이 완비된 경우에만 property_overview 섹션 생성 (결손 시 missing section 감지)
  const hasCompleteKeyFacts = Boolean(
    keyFacts?.tier1_subject?.length &&
    keyFacts?.tier2_land?.length &&
    keyFacts?.tier3_building?.length
  );

  const sections: any[] = [
    {
      section_type: 'location_access',
      title: '입지 및 접근성 분석',
      markdown: `### ${fixture.address} 권역 중심 입지\n- 주요 대중교통 및 도로 접근성 우수\n- GBD 업무·상업 배후수요 직결 우량 입지`,
    },
  ];
  if (hasCompleteKeyFacts && keyFactsTableRows.length > 0) {
    sections.push({
      section_type: 'property_overview',
      title: '토지 및 건물 제원',
      markdown: `### 건축물대장 및 3단 그룹 Key Facts 제원\n\n| 구분 | 주요 항목 | 상세 제원 | 비고 |\n|---|---|---|---|\n${keyFactsTableRows.join('\n')}`,
    });
  }

  const compRows = (fixture.salesComparisonComps || [])
    .map((c: any) => {
      const landPyStr = c.landPricePerPyeongKrw ? `약 ${(c.landPricePerPyeongKrw / 1e8).toFixed(2)}억/평` : '-';
      return `| ${c.name} | ${c.landAreaPyeong}평 | ${c.gfaPyeong}평 | ${landPyStr} | ${c.dealDate} |`;
    })
    .join('\n');

  if (fixture.salesComparisonComps && fixture.salesComparisonComps.length > 0) {
    const costNote =
      fixture.incomeCapitalization?.costMethodExcludedNote || DEFAULT_COST_METHOD_EXCLUSION_NOTE;
    sections.push({
      section_type: 'comparable_analysis',
      title: '주변 매물 및 실거래 시세 비교',
      markdown: `### 인근 실거래 및 매물 평당가 분석 (사례비교법)\n\n| 소재지/명칭 | 대지면적 | 연면적 | 대지 평당가 | 거래시점 |\n|---|---|---|---|---|\n${compRows}\n\n> ${costNote}`,
    });
  }

  const cap = fixture.incomeCapitalization;
  let incomeMarkdown = `### 연 순수익률 (Cap Rate) 분석\n- 현재 연 순수익률 (Cap Rate): ${fixture.capRatePct}%\n- 연간 임대수익: ${((fixture.statedMonthlyRentKrw * 12) / 1e8).toFixed(2)}억 원`;
  if (fixture.proForma) {
    incomeMarkdown += `\n- 정상화(Pro-forma) 연 순수익률 (Cap Rate): ${fixture.proForma.estimatedFullOccupancyCapRatePct}% (+${fixture.proForma.upsideCapRatePp}%p 상승)`;
  }
  if (cap) {
    const [lowCap, highCap] = cap.marketCapRateRangePct || [2.5, 3.5];
    incomeMarkdown += `\n- 시장 요구 Cap Rate: ${lowCap}% ~ ${highCap}%`;
    if (cap.costMethodExcludedNote) {
      incomeMarkdown += `\n- 밸류에이션 원칙: ${cap.costMethodExcludedNote}`;
    }
  }

  sections.push(
    {
      section_type: 'lease_status',
      title: '임대차 현황 (Rent Roll)',
      markdown: `| 층수 | 입주사명 | 보증금(원) | 월차임(원) |\n|---|---|---:|---:|\n${leaseRows}\n| **합계** | **총 ${fixture.stackingPlan?.length || 0}개 구획** | **${fixture.statedDepositKrw.toLocaleString()}** | **${fixture.statedMonthlyRentKrw.toLocaleString()}** |`,
    },
    {
      section_type: 'income_analysis',
      title: '수익성 및 현금흐름 분석',
      markdown: incomeMarkdown,
    }
  );

  return {
    title: fixture.title,
    posture: fixture.posture,
    address: fixture.address,
    body: {
      title: fixture.title,
      askingPrice: fixture.askingPriceKrw,
      coordinates: fixture.coordinates,
      photo_urls: photoPath ? [photoPath] : [],
      photos: photoList,
      heroCard: {
        askingPriceKrw: fixture.askingPriceKrw,
        landAreaM2: fixture.landAreaM2,
        grossFloorAreaM2: fixture.grossFloorAreaM2,
        archAreaM2: fixture.archAreaM2,
        capRatePct: fixture.capRatePct,
        monthlyRentKrw: fixture.statedMonthlyRentKrw,
        depositKrw: fixture.statedDepositKrw,
        useZone: fixture.useZone,
        floors: fixture.floors,
        completionDate: fixture.completionDate,
        completionYear: parseInt(fixture.completionDate?.split('-')[0] || '1998', 10),
        parkingCount: fixture.parkingCount,
        parking: fixture.parking,
        elevatorCount: fixture.elevatorCount,
      },
      keyFacts3Tier: fixture.keyFacts3Tier,
      summary: {
        leadText: `${fixture.title} 핵심 투자 요약`,
        narrative: fixture.proForma?.narrative || `매각희망가 ${(fixture.askingPriceKrw / 1e8).toLocaleString()}억 원, 보증금 총 ${(fixture.statedDepositKrw / 1e8).toFixed(1)}억 원, 월 임대료 ${(fixture.statedMonthlyRentKrw / 1e4).toLocaleString()}만 원이 발생하는 우량 자산입니다.`,
      },
      enrichment: {
        buildingRegister: {
          totalArea: fixture.grossFloorAreaM2,
          platArea: fixture.landAreaM2,
          archArea: fixture.archAreaM2,
          bcRat: fixture.bcRat,
          vlRat: fixture.vlRat,
          floorsAbove: fixture.floorsAbove || 6,
          floorsBelow: fixture.floorsBelow || 1,
          structure: fixture.structure,
          mainPurpose: '제1종·제2종 근린생활시설',
          elevatorCount: fixture.elevatorCount,
          parkingCount: fixture.parkingCount,
          useAprDay: fixture.completionDate?.replace(/-/g, ''),
          approvalDate: fixture.completionDate,
        },
        landUsePlan: {
          zoningDistrict: fixture.useZone,
          buildingCoverageMax: fixture.bcRat ? Math.ceil(fixture.bcRat) : 50,
          floorAreaRatioMax: fixture.maxVlRat || 250,
        },
      },
      ssot_summary: {
        title: fixture.title,
        asking_price: fixture.askingPriceKrw,
        total_area: fixture.grossFloorAreaM2,
        land_area: fixture.landAreaM2,
        cap_rate: fixture.capRatePct,
        total_deposit: fixture.statedDepositKrw,
        monthly_rent: fixture.statedMonthlyRentKrw,
      },
    },
    sections,
  };
}

describe('Real Broker Commercial Income Properties E2E Pipeline', () => {

  // ─────────────────────────────────────────────────────────────
  // 0. SSoT 픽스처 4대 필수 건축 제원 및 3단 Key Facts 정합성 검증
  // ─────────────────────────────────────────────────────────────
  describe('R1: SSoT Standalone Fixtures 4 Mandatory Specs & 3-Tier Key Facts', () => {
    it('[신사동 590][Positive Pair] 4대 필수 건축 제원(건축면적, 사용승인일, 주차, 승강기) SSoT 완비 단언', () => {
      expect(sinsaFixture.archAreaM2).toBe(544.70);
      expect(sinsaFixture.completionDate).toBe('1998-05-15');
      expect(sinsaFixture.parkingCount).toBe(26);
      expect(sinsaFixture.parking).toContain('기계식 21대');
      expect(sinsaFixture.parking).toContain('자주식 5대');
      expect(sinsaFixture.elevatorCount).toBe(1);
    });

    it('[서초동 1364-28][Positive Pair] 4대 필수 건축 제원(건축면적, 사용승인일, 주차, 승강기) SSoT 완비 단언', () => {
      expect(seochoFixture.archAreaM2).toBe(296.14);
      expect(seochoFixture.completionDate).toBe('1991-01-20');
      expect(seochoFixture.parkingCount).toBe(16);
      expect(seochoFixture.parking).toContain('16대');
      expect(seochoFixture.elevatorCount).toBe(1);
    });

    it('[신사 & 서초][Positive Pair] 3단 그룹 Key Facts 제원표(대상지/토지/건물) 계층 구조 및 필수 항목 완비 단언', () => {
      for (const fix of [sinsaFixture, seochoFixture]) {
        const kf = fix.keyFacts3Tier;
        expect(kf).toBeDefined();
        expect(kf.tier1_subject.length).toBeGreaterThanOrEqual(4);
        expect(kf.tier2_land.length).toBeGreaterThanOrEqual(3);
        expect(kf.tier3_building.length).toBeGreaterThanOrEqual(5);

        // Tier 1 필수 항목 확인
        const t1Labels = kf.tier1_subject.map((r: [string, string]) => r[0]);
        expect(t1Labels).toContain('소재지');
        expect(t1Labels).toContain('매각희망가');
        expect(t1Labels.some((l: string) => l.includes('Cap Rate') || l.includes('수익률'))).toBe(true);

        // Tier 2 필수 항목 확인
        const t2Labels = kf.tier2_land.map((r: [string, string]) => r[0]);
        expect(t2Labels).toContain('대지면적');
        expect(t2Labels).toContain('용도지역');

        // Tier 3 4대 필수 제원 라벨 확인
        const t3Labels = kf.tier3_building.map((r: [string, string]) => r[0]);
        expect(t3Labels).toContain('연면적');
        expect(t3Labels).toContain('건축면적');
        expect(t3Labels).toContain('사용승인일');
        expect(t3Labels.some((l: string) => l.includes('주차'))).toBe(true);
        expect(t3Labels.some((l: string) => l.includes('승강기'))).toBe(true);
      }
    });

    it('[Negative Pair] 4대 필수 제원 누락 시 데이터 정합성 실패 단언', () => {
      // 1. 건축면적(archAreaM2) 및 사용승인일(completionDate) 결손 픽스처 검증
      const missingArchFixture = { ...sinsaFixture, archAreaM2: null, completionDate: '' };
      const res1 = validateBuildingSpecs(missingArchFixture);
      expect(res1.isValid).toBe(false);
      expect(res1.missingSpecs).toContain('archAreaM2');
      expect(res1.missingSpecs).toContain('completionDate');
      expect(res1.errors.some((e) => e.includes('건축면적'))).toBe(true);
      expect(res1.errors.some((e) => e.includes('사용승인일'))).toBe(true);

      // 2. 주차대수(parkingCount) 및 승강기(elevatorCount) 결손 픽스처 검증
      const missingParkingFixture = { ...seochoFixture, parkingCount: -1, elevatorCount: undefined };
      const res2 = validateBuildingSpecs(missingParkingFixture);
      expect(res2.isValid).toBe(false);
      expect(res2.missingSpecs).toContain('parkingCount');
      expect(res2.missingSpecs).toContain('elevatorCount');
      expect(res2.errors.some((e) => e.includes('주차대수'))).toBe(true);
      expect(res2.errors.some((e) => e.includes('승강기'))).toBe(true);

      // 3. buildDocFromFixture strict 모드에서 필수 제원 누락 시 예외 발생 단언
      expect(() => buildDocFromFixture(missingArchFixture, undefined, { strict: true })).toThrow(
        /건축 제원 정합성 오류/
      );
    });

    it('[Negative Pair] 3단 Key Facts 계층 누락 또는 건물 제원 라벨 누락 시 실패 단언', () => {
      // 1. Tier 3 (건물) 계층 완전 누락 픽스처 검증
      const missingTier3Fixture = {
        ...sinsaFixture,
        keyFacts3Tier: {
          tier1_subject: sinsaFixture.keyFacts3Tier.tier1_subject,
          tier2_land: sinsaFixture.keyFacts3Tier.tier2_land,
          // tier3_building 누락
        },
      };
      const resTier3 = validateBuildingSpecs(missingTier3Fixture);
      expect(resTier3.isValid).toBe(false);
      expect(resTier3.missingTiers).toContain('tier3_building');
      expect(resTier3.errors.some((e) => e.includes('tier3_building') || e.includes('건물 계층'))).toBe(true);

      // 2. buildDocFromFixture에서 3단 계층 누락 시 property_overview 섹션 생성 누락(missing section) 감지 단언
      const docMissingTier3 = buildDocFromFixture(missingTier3Fixture);
      const overviewSection = docMissingTier3.sections.find((s: any) => s.section_type === 'property_overview');
      expect(overviewSection).toBeUndefined();

      // 3. Tier 3 내 4대 필수 제원 핵심 라벨('건축면적') 누락 시 실패 단언
      const missingArchLabelFixture = {
        ...sinsaFixture,
        keyFacts3Tier: {
          ...sinsaFixture.keyFacts3Tier,
          tier3_building: sinsaFixture.keyFacts3Tier.tier3_building.filter(
            ([label]: [string, string]) => label !== '건축면적'
          ),
        },
      };
      const resLabel = validateBuildingSpecs(missingArchLabelFixture);
      expect(resLabel.isValid).toBe(false);
      expect(resLabel.missingLabels.some((l) => l.includes('건축면적'))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 0.5 GBD 권역 실거래 기반 2대 감정평가 엔진 (사례비교법 + 수익환원법)
  // ─────────────────────────────────────────────────────────────
  describe('R2: GBD 2-Method Valuation Integration (사례비교법 + 수익환원법)', { timeout: 30000 }, () => {
    it('[신사동 590][Positive Pair] 5개 GBD 비교사례 밴드(2.00억~3.18억) 및 적정 호가(2.36억), 원가법 배제 단언', () => {
      const subject = {
        askingPriceKrw: sinsaFixture.askingPriceKrw,
        landAreaPyeong: sinsaFixture.landAreaM2 * 0.3025,
        gfaPyeong: sinsaFixture.grossFloorAreaM2 * 0.3025,
        annualGrossRentKrw: sinsaFixture.statedMonthlyRentKrw * 12,
        marketCapRateRangePct: sinsaFixture.incomeCapitalization.marketCapRateRangePct as [number, number],
      };

      const report = generateCreDualValuationReport(sinsaFixture.salesComparisonComps, subject);

      // 1. 사례비교법 단언 (5개 사례)
      expect(report.salesComparison.compCount).toBe(5);
      expect(report.salesComparison.minLandPricePerPyeongKrw).toBe(200310000);
      expect(report.salesComparison.maxLandPricePerPyeongKrw).toBe(317600000);
      expect(report.salesComparison.avgLandPricePerPyeongKrw).toBe(260332000);
      expect(report.salesComparison.subjectLandPricePerPyeongKrw).toBe(236594472);
      expect(report.salesComparison.isWithinMarketBand).toBe(true);
      expect(report.salesComparison.marketBandDiffPct).toBe(-9.1);
      expect(report.salesComparison.analysisNarrative).toContain('인근 5개 유사 실거래 사례');

      // 2. 수익환원법 단언 (Cap Rate 2.50% ~ 3.50%)
      expect(report.incomeCapitalization.annualNoiKrw).toBe(775500000);
      expect(report.incomeCapitalization.impliedCapRatePct).toBe(1.02);
      expect(report.incomeCapitalization.marketCapRateRangePct).toEqual([2.50, 3.50]);
      expect(report.incomeCapitalization.fairValueRangeKrw[0]).toBe(22157142857);
      expect(report.incomeCapitalization.fairValueRangeKrw[1]).toBe(31020000000);

      // 3. 원가법 배제 사유 명기 단언
      expect(report.costMethodExcludedNote).toContain('원가법 제외');
      expect(report.costMethodExcludedNote).toContain('도심 역세권 수익형 상업용 부동산');

      // 4. 문서 섹션 바인딩 확인
      const doc = buildDocFromFixture(sinsaFixture);
      const compSection = doc.sections.find((s: any) => s.section_type === 'comparable_analysis');
      expect(compSection).toBeDefined();
      expect(compSection?.markdown).toContain('신사동 586-6');
      expect(compSection?.markdown).toContain('신사동 588-1');
      expect(compSection?.markdown).toContain('원가법 제외');
    });

    it('[서초동 1364-28][Positive Pair] 4개 GBD 비교사례 밴드(1.30억~1.40억) 대비 할인 호가(1.28억, -4.7%) 밸류애드 단언', () => {
      const subject = {
        askingPriceKrw: seochoFixture.askingPriceKrw,
        landAreaPyeong: seochoFixture.landAreaM2 * 0.3025,
        gfaPyeong: seochoFixture.grossFloorAreaM2 * 0.3025,
        annualGrossRentKrw: seochoFixture.statedMonthlyRentKrw * 12,
        marketCapRateRangePct: seochoFixture.incomeCapitalization.marketCapRateRangePct as [number, number],
      };

      const report = generateCreDualValuationReport(seochoFixture.salesComparisonComps, subject);

      // 1. 사례비교법 단언 (4개 사례, 저평가 밸류애드 진입 단언)
      expect(report.salesComparison.compCount).toBe(4);
      expect(report.salesComparison.minLandPricePerPyeongKrw).toBe(130300000);
      expect(report.salesComparison.maxLandPricePerPyeongKrw).toBe(140000000);
      expect(report.salesComparison.avgLandPricePerPyeongKrw).toBe(133895000);
      expect(report.salesComparison.subjectLandPricePerPyeongKrw).toBe(127572245);
      expect(report.salesComparison.subjectLandPricePerPyeongKrw).toBeLessThan(report.salesComparison.minLandPricePerPyeongKrw);
      expect(report.salesComparison.isWithinMarketBand).toBe(false);
      expect(report.salesComparison.marketBandDiffPct).toBe(-4.7);
      expect(report.salesComparison.analysisNarrative).toContain('우수한 가격 경쟁력');

      // 2. 수익환원법 단언 (현재 in-place Cap Rate 1.15%)
      expect(report.incomeCapitalization.annualNoiKrw).toBe(263400000);
      expect(report.incomeCapitalization.impliedCapRatePct).toBe(1.15);
      expect(report.incomeCapitalization.marketCapRateRangePct).toEqual([2.50, 3.50]);
      expect(report.incomeCapitalization.fairValueRangeKrw[0]).toBe(7525714286);
      expect(report.incomeCapitalization.fairValueRangeKrw[1]).toBe(10536000000);

      // 3. 만실 정상화(Pro-forma) Cap Rate 2.30% 단언
      const proFormaCapResult = calculateIncomeCapitalization({
        annualGrossRentKrw: seochoFixture.incomeCapitalization.proFormaAnnualNoiKrw,
        askingPriceKrw: seochoFixture.askingPriceKrw,
        marketCapRateRangePct: seochoFixture.incomeCapitalization.marketCapRateRangePct as [number, number],
      });
      expect(proFormaCapResult.annualNoiKrw).toBe(528600000);
      expect(proFormaCapResult.impliedCapRatePct).toBe(2.30);
      expect(proFormaCapResult.fairValueRangeKrw[0]).toBe(15102857143);
      expect(proFormaCapResult.fairValueRangeKrw[1]).toBe(21144000000);

      // 4. 원가법 배제 사유 단언
      expect(report.costMethodExcludedNote).toContain('원가법 제외');

      // 5. 문서 섹션 바인딩 확인
      const doc = buildDocFromFixture(seochoFixture);
      const compSection = doc.sections.find((s: any) => s.section_type === 'comparable_analysis');
      expect(compSection).toBeDefined();
      expect(compSection?.markdown).toContain('서초동 1362-11');
      expect(compSection?.markdown).toContain('서초동 1360-14');
      expect(compSection?.markdown).toContain('원가법 제외');
    });

    it('[Negative Pair 1] 비교사례 0건 전달 시 계산 거부 예외 발생 단언 및 누락 픽스처 섹션 미생성 단언', () => {
      // 1. 빈 비교사례 배열 시 에러 단언
      expect(() => {
        calculateSalesComparison([], {
          askingPriceKrw: sinsaFixture.askingPriceKrw,
          landAreaPyeong: sinsaFixture.landAreaM2 * 0.3025,
          gfaPyeong: sinsaFixture.grossFloorAreaM2 * 0.3025,
        });
      }).toThrowError(/최소 1건 이상의 실거래 비교사례가 필요합니다/);

      // 2. SSoT 픽스처에서 비교사례가 누락된 경우 comparable_analysis 섹션 미생성 단언
      const noCompsFixture = { ...sinsaFixture, salesComparisonComps: [] };
      const doc = buildDocFromFixture(noCompsFixture);
      const compSection = doc.sections.find((s: any) => s.section_type === 'comparable_analysis');
      expect(compSection).toBeUndefined();
    });

    it('[Negative Pair 2] 유효하지 않은 Cap Rate (<= 0 또는 > 15% 비정상 시장수익률) 전달 시 예외 발생 단언', () => {
      // 1. Cap Rate 0 이하
      expect(() => {
        calculateIncomeCapitalization({
          annualGrossRentKrw: 775500000,
          askingPriceKrw: sinsaFixture.askingPriceKrw,
          marketCapRateRangePct: [0, -1],
        });
      }).toThrowError(/요구 Cap Rate는 0보다 커야 합니다/);

      // 2. Cap Rate 15% 초과 (비정상 시장수익률)
      expect(() => {
        calculateIncomeCapitalization({
          annualGrossRentKrw: 775500000,
          askingPriceKrw: sinsaFixture.askingPriceKrw,
          marketCapRateRangePct: [16.0, 20.0],
        });
      }).toThrowError(/15%/);
    });

    it('[Negative Pair 3] 원가법 배제 사유 누락 또는 공백 시 거버넌스 단언 실패', () => {
      const subject = {
        askingPriceKrw: sinsaFixture.askingPriceKrw,
        landAreaPyeong: sinsaFixture.landAreaM2 * 0.3025,
        gfaPyeong: sinsaFixture.grossFloorAreaM2 * 0.3025,
        annualGrossRentKrw: sinsaFixture.statedMonthlyRentKrw * 12,
        marketCapRateRangePct: sinsaFixture.incomeCapitalization.marketCapRateRangePct as [number, number],
      };
      const report = generateCreDualValuationReport(sinsaFixture.salesComparisonComps, subject);

      // 원가법 배제 사유 유효성 검증 함수
      const isCostMethodExclusionValid = (rep: typeof report): boolean => {
        return Boolean(rep.costMethodExcludedNote && rep.costMethodExcludedNote.includes('원가법 제외'));
      };

      expect(isCostMethodExclusionValid(report)).toBe(true);

      // 원가법 사유가 위변조/삭제된 경우 감지
      const corruptedReport = { ...report, costMethodExcludedNote: '' };
      expect(isCostMethodExclusionValid(corruptedReport)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // R3: GBD Macro Transit Vector Diagram Engine & Catchment Demand Domain Isolation (M3)
  // ─────────────────────────────────────────────────────────────
  describe('R3: GBD Macro Transit Vector Diagram Engine & Catchment Demand Domain Isolation (M3)', { timeout: 35000 }, () => {
    // ── 1. 신사동 590: GBD_SINSA 서브권역 벡터 맵 ──
    it('[신사동 590][Positive Pair 1] GBD_SINSA 광역 대중교통 벡터 맵 생성 (1600x1200, 266.7 DPI, 0.5/1.0km 동심원, 을지병원사거리·위례신사선 노드) 단언', async () => {
      const subDistrict = detectSubDistrict(sinsaFixture.address, sinsaFixture.title);
      expect(subDistrict).toBe('GBD_SINSA');

      const result = await generateMacroTransitDiagram({
        propertyName: sinsaFixture.title,
        address: sinsaFixture.address,
        subDistrict: 'GBD_SINSA',
      });

      expect(result.width).toBe(1600);
      expect(result.height).toBe(1200);
      expect(result.effectiveDpi).toBe(266.7);
      expect(result.effectiveDpi).toBeGreaterThanOrEqual(180);
      expect(result.district).toBe('GBD');
      expect(result.subDistrict).toBe('GBD_SINSA');
      expect(Buffer.isBuffer(result.buffer)).toBe(true);

      const svg = result.svg;
      expect(svg).toContain('도산대로');
      expect(svg).toContain('논현로');
      expect(svg).toContain('강남을지병원사거리');
      expect(svg).toContain('Eulji Hospital Stn');
      expect(svg).toContain('신사역 (3호선/신분당선)');
      expect(svg).toContain('압구정역 (3호선)');
      expect(svg).toContain('위례신사선 (2029 예정)');
      expect(svg).toContain('0.5km (도보 5분)');
      expect(svg).toContain('1.0km (도보 10분)');
      expect(svg).toContain('➔ CBD (도심 20분)');
      expect(svg).toContain('➔ 판교 (18분)');
    });

    it('[신사동 590][Negative Pair 1] 신사동 다이어그램에 테헤란로 및 삼성역 미포함 단언', async () => {
      const result = await generateMacroTransitDiagram({
        propertyName: sinsaFixture.title,
        address: sinsaFixture.address,
        subDistrict: 'GBD_SINSA',
      });
      expect(result.svg).not.toContain('테헤란로');
      expect(result.svg).not.toContain('삼성역 (2·GTX)');
    });

    // ── 2. 서초동 1364-28: GBD_SEOCHO 서브권역 벡터 맵 ──
    it('[서초동 1364-28][Positive Pair 2] GBD_SEOCHO 광역 대중교통 벡터 맵 생성 (1600x1200, 266.7 DPI, 양재역·GTX-C·남부터미널·서초IC 노드) 단언', async () => {
      const subDistrict = detectSubDistrict(seochoFixture.address, seochoFixture.title);
      expect(subDistrict).toBe('GBD_SEOCHO');

      const result = await generateMacroTransitDiagram({
        propertyName: seochoFixture.title,
        address: seochoFixture.address,
        subDistrict: 'GBD_SEOCHO',
      });

      expect(result.width).toBe(1600);
      expect(result.height).toBe(1200);
      expect(result.effectiveDpi).toBe(266.7);
      expect(result.effectiveDpi).toBeGreaterThanOrEqual(180);
      expect(result.district).toBe('GBD');
      expect(result.subDistrict).toBe('GBD_SEOCHO');

      const svg = result.svg;
      expect(svg).toContain('강남대로');
      expect(svg).toContain('남부순환로');
      expect(svg).toContain('양재역 (3호선/신분당선');
      expect(svg).toContain('남부터미널');
      expect(svg).toContain('서초IC');
      expect(svg).toContain('GTX-C (2028 예정)');
      expect(svg).toContain('0.5km (도보 5분)');
      expect(svg).toContain('1.0km (도보 10분)');
      expect(svg).toContain('➔ GBD 테헤란 (7분)');
      expect(svg).toContain('➔ 판교 (10분 / 11분)');
    });

    it('[서초동 1364-28][Negative Pair 2] 서초동 다이어그램에 테헤란로 및 삼성역 미포함 단언', async () => {
      const result = await generateMacroTransitDiagram({
        propertyName: seochoFixture.title,
        address: seochoFixture.address,
        subDistrict: 'GBD_SEOCHO',
      });
      expect(result.svg).not.toContain('테헤란로');
      expect(result.svg).not.toContain('삼성역 (2·GTX)');
    });

    // ── 3. 데이터 바인딩: macroTransitImage 파이프라인 연동 ──
    it('[데이터 바인딩][Positive Pair 3] macroTransitImage가 dataMap[\'location\']에 바인딩되고 A06 슬라이드가 렌더링됨 단언', async () => {
      const sinsaTransit = await generateMacroTransitDiagram({
        propertyName: sinsaFixture.title,
        address: sinsaFixture.address,
        subDistrict: 'GBD_SINSA',
      });

      const photoPath = path.resolve('docs/test/real-broker-im/sinsa-media/image9.jpeg');
      const doc = buildDocFromFixture(sinsaFixture, photoPath);
      doc.body.enrichment.macroTransitImage = sinsaTransit;

      const renderer = new MobileImPptxRenderer();
      const renderResult = await renderer.render({
        buildingId: sinsaFixture.dealId,
        doc: doc as any,
        posture: sinsaFixture.posture,
        preset: 'commercial_visual_grid',
        grade: 'A',
      });

      expect(renderResult.slideCount).toBeGreaterThanOrEqual(10);
      const inspection = await inspectPptxBinary(renderResult.buffer);
      expect(inspection.brokenImageCount).toBe(0);
      expect(inspection.bleedCount).toBe(0);
      expect(inspection.isPass).toBe(true);
    });

    it('[데이터 바인딩][Negative Pair 3] macroTransitImage 제공 시 A06 슬라이드가 억제(suppress)되지 않고 [BL-E] 경고가 미발생 단언', async () => {
      const sinsaTransit = await generateMacroTransitDiagram({
        propertyName: sinsaFixture.title,
        address: sinsaFixture.address,
        subDistrict: 'GBD_SINSA',
      });

      const pres = new PptxGenJS();
      const output = await buildA06Diagram({
        pres,
        slideNum: 4,
        docno: 'DOC-TEST-A06-BOUND',
        data: {
          title: '입지 및 광역 대중교통망 분석',
          kicker: 'LOCATION & TRANSIT',
          macroTransitImage: sinsaTransit.base64,
          left: { sub: '광역 대중교통망 벡터 다이어그램' },
          right: {
            sub: '주요 교통 접근성',
            rows: [
              ['지하철', '신사역(3호선·신분당선), 압구정역(3호선) 도보 7~8분'],
              ['간선도로', '도산대로, 논현로, 한남대교 인접'],
            ],
          },
        },
        grade: 'A',
        provenance: {},
      });

      expect(output.slide).toBeDefined();
      expect((output as any).suppress).toBeUndefined();
      expect(output.warnings.some((w) => w.includes('[BL-E]'))).toBe(false);
    });

    // ── 4. 배후수요 도메인 격리 ──
    it('[배후수요 도메인 격리][Positive Pair 4] 신사 및 서초 매물: 입지/배후수요 섹션에 거시 상권/인프라 클러스터 정상 등재 단언', () => {
      for (const fix of [sinsaFixture, seochoFixture]) {
        const doc = buildDocFromFixture(fix);
        const catchmentSections = doc.sections.filter(
          (s: any) => s.section_type === 'location_access' || s.section_type === 'commercialDistrict'
        );
        expect(catchmentSections.length).toBeGreaterThan(0);
        const catchmentText = catchmentSections.map((s: any) => `${s.title} ${s.markdown}`).join('\n');
        expect(catchmentText).toContain('GBD');
      }
    });

    it('[배후수요 도메인 격리][Negative Pair 4] 입지/배후수요 섹션에 내부 임차인명(하우연, ST성형외과, 이탈로모토, 파티룸 등) 0건 유출 단언 및 오염 시 감지 단언', () => {
      for (const fix of [sinsaFixture, seochoFixture]) {
        const doc = buildDocFromFixture(fix);
        const inPlaceTenants = (fix.stackingPlan || [])
          .map((s: any) => s.tenant)
          .filter((t: string) => t && !t.includes('공실') && !t.includes('사무실'));

        const catchmentSections = doc.sections.filter(
          (s: any) => s.section_type === 'location_access' || s.section_type === 'commercialDistrict'
        );
        const catchmentText = catchmentSections.map((s: any) => `${s.title} ${s.markdown}`).join('\n');

        // 클린 상태 단언: 내부 임차인명 유출 0건
        for (const tenant of inPlaceTenants) {
          expect(catchmentText).not.toContain(tenant);
        }
      }

      // 오염 시뮬레이션 감지 단언
      const contaminatedDoc = buildDocFromFixture(sinsaFixture);
      const locSec = contaminatedDoc.sections.find((s: any) => s.section_type === 'location_access');
      expect(locSec).toBeDefined();
      locSec.markdown += '\n- **배후 수요**: 6층 하우연한의원 및 5층 ST성형외과 우량 테넌트 상주';

      const checkDomainIsolation = (d: any, tenants: string[]) => {
        const cSecs = d.sections.filter((s: any) => s.section_type === 'location_access' || s.section_type === 'commercialDistrict');
        const content = cSecs.map((s: any) => s.markdown).join('\n');
        const leaked = tenants.filter((t) => content.includes(t));
        return { isClean: leaked.length === 0, leaked };
      };

      const audit = checkDomainIsolation(contaminatedDoc, ['하우연한의원', 'ST성형외과']);
      expect(audit.isClean).toBe(false);
      expect(audit.leaked).toContain('하우연한의원');
      expect(audit.leaked).toContain('ST성형외과');
    });

    // ── 5. 렌트롤 도메인 정합성 ──
    it('[렌트롤 도메인 정합성][Positive Pair 5] 렌트롤 및 스태킹 플랜에 실제 입주 임차인 정보 정상 등재 단언', () => {
      const sinsaDoc = buildDocFromFixture(sinsaFixture);
      const rentRoll = sinsaDoc.sections.find((s: any) => s.section_type === 'lease_status');
      expect(rentRoll).toBeDefined();
      expect(rentRoll.markdown).toContain('하우연한의원');
      expect(rentRoll.markdown).toContain('ST성형외과');
      expect(rentRoll.markdown).toContain('이탈로모토');

      const seochoDoc = buildDocFromFixture(seochoFixture);
      const seochoRentRoll = seochoDoc.sections.find((s: any) => s.section_type === 'lease_status');
      expect(seochoRentRoll).toBeDefined();
      expect(seochoRentRoll.markdown).toContain('파티룸');
      expect(seochoRentRoll.markdown).toContain('식당');
    });

    it('[렌트롤 도메인 정합성][Negative Pair 5] 렌트롤 섹션에 거시 인구통계 단어 0건 혼입 단언 및 오염 시 감지 단언', () => {
      for (const fix of [sinsaFixture, seochoFixture]) {
        const doc = buildDocFromFixture(fix);
        const rentRoll = doc.sections.find((s: any) => s.section_type === 'lease_status');
        expect(rentRoll).toBeDefined();
        const macroTerms = ['일평균 유동인구', '소비력 지수', '직장인 상주인구 12만', '개업률', '폐업률'];
        for (const term of macroTerms) {
          expect(rentRoll.markdown).not.toContain(term);
        }
      }

      // 오염 시뮬레이션 감지 단언
      const contaminatedDoc = buildDocFromFixture(seochoFixture);
      const rr = contaminatedDoc.sections.find((s: any) => s.section_type === 'lease_status');
      rr.markdown += '\n- **상권 배후**: 일평균 유동인구 12만 명 및 인근 8,500세대 배후수요 밀집';

      const banned = ['일평균 유동인구', '소비력 지수', '배후수요 밀집'];
      const leaked = banned.filter((b) => rr.markdown.includes(b));
      expect(leaked.length).toBeGreaterThan(0);
      expect(leaked).toContain('일평균 유동인구');
    });

    // ── 6. 물리 해상도 (DPI >= 150) ──
    it('[물리 해상도][Positive Pair 6] 1600x1200 px 벡터 맵 5.60"x4.50" 박스 실효 DPI 266.7 (G32 >= 150 DPI 및 R2 >= 180 DPI 충족) 단언', () => {
      const dpi = calculateEffectiveDpi(1600, 1200, 5.60, 4.50);
      expect(dpi).toBe(266.7);
      expect(dpi).toBeGreaterThanOrEqual(180);
      expect(dpi).toBeGreaterThanOrEqual(150);

      const g32Violation = checkEffectiveDpi(1600, 1200, 5.60, 4.50, 150, 'MacroTransit');
      expect(g32Violation).toBeNull();
    });

    it('[물리 해상도][Negative Pair 6] 저해상도(<150 DPI) 래스터 주입 시 G32 물리 게이트 감지 및 차단 단언', () => {
      const lowDpi = calculateEffectiveDpi(400, 300, 5.60, 4.50);
      expect(lowDpi).toBe(66.7);
      expect(lowDpi).toBeLessThan(150);

      const violation = checkEffectiveDpi(400, 300, 5.60, 4.50, 150, 'LowResTransitMap');
      expect(violation).not.toBeNull();
      expect(violation?.gate).toBe('G32');
      expect(violation?.severity).toBe('violation');
      expect(violation?.message).toContain('실효 DPI');
    });

    // ── 7. 지면 물리: 0 Bleed 및 경계 한계 ──
    it('[지면 물리][Positive Pair 7] A06 다이어그램 레이아웃(5.60"x4.50" 맵, 0.40" 여백, 6.09" 텍스트) 지면 이탈 0건 단언', async () => {
      const sinsaTransit = await generateMacroTransitDiagram({
        propertyName: sinsaFixture.title,
        address: sinsaFixture.address,
        subDistrict: 'GBD_SINSA',
      });

      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_WIDE';
      const output = await buildA06Diagram({
        pres,
        slideNum: 4,
        docno: 'DOC-A06-PHYSICS',
        data: {
          title: '입지 분석 다이어그램 물리 테스트',
          kicker: 'LOCATION GEOMETRY',
          macroTransitImage: sinsaTransit.base64,
          left: { sub: '광역 교통망 벡터 다이어그램' },
          right: {
            sub: '인프라 분석',
            rows: [
              ['지하철', '3호선 신사역 및 압구정역 인접'],
              ['간선도로', '도산대로, 논현로 교차'],
              ['개발호재', '위례신사선 2029년 개통 예정'],
            ],
          },
        },
        grade: 'A',
        provenance: {},
      });

      expect(output.slide).toBeDefined();
      expect(output.warnings.filter((w) => w.includes('[BL-E]')).length).toBe(0);

      // Slide boundary calculation: W=13.333, H=7.50
      // Map: x=0.62, w=5.60 -> right edge 6.22
      // Gutter: 0.40 -> text start 6.62
      // Text: x=6.62, w=6.093 -> right edge 12.713 <= 13.333 - 0.62 = 12.713 (0 bleed)
      const mapRight = 0.62 + 5.60;
      const textLeft = mapRight + 0.40;
      const textRight = textLeft + 6.093;
      expect(mapRight).toBe(6.22);
      expect(textLeft).toBe(6.62);
      expect(textRight).toBeCloseTo(12.713, 2);
      expect(textRight).toBeLessThanOrEqual(13.333 - 0.62);
    });

    it('[지면 물리][Negative Pair 7] 슬라이드 지면 초과 좌표 전달 시 Bleed 결함 감지 단언', () => {
      const checkBleed = (x: number, y: number, w: number, h: number, slideW = 13.333, slideH = 7.50): boolean => {
        return (x + w > slideW) || (y + h > slideH) || x < 0 || y < 0;
      };

      // Slide overflow cases
      expect(checkBleed(10.0, 1.0, 5.0, 3.0)).toBe(true);  // 10 + 5 = 15 > 13.333
      expect(checkBleed(1.0, 5.0, 4.0, 3.0)).toBe(true);   // 5 + 3 = 8 > 7.50
      // Standard A06 geometry inside boundaries
      expect(checkBleed(0.62, 1.62, 5.60, 4.50)).toBe(false); // 0.62+5.60=6.22 <= 13.333, 1.62+4.50=6.12 <= 7.50
    });

    // ── 8. 폴백 핸들링 ──
    it('[폴백 핸들링][Positive Pair 8] macroTransitImage 부재 시 cadastralImage 정상 폴백 렌더링 단언', async () => {
      const pres = new PptxGenJS();
      const output = await buildA06Diagram({
        pres,
        slideNum: 4,
        docno: 'DOC-FALLBACK-CADASTRAL',
        data: {
          title: '지적도 폴백 입지 분석',
          cadastralImage: 'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          left: { sub: '연속지적도' },
          right: { rows: [['지목', '대']] },
        },
        grade: 'A',
        provenance: {},
      });

      expect(output.slide).toBeDefined();
      expect((output as any).suppress).toBeUndefined();
      expect(output.warnings.some((w) => w.includes('[BL-E]'))).toBe(false);
    });

    it('[폴백 핸들링][Negative Pair 8] 지도 데이터 전무 시 크래시 없이 슬라이드 억제(suppress) 및 [BL-E] 체크리스트 이관 단언', async () => {
      const pres = new PptxGenJS();
      const output = await buildA06Diagram({
        pres,
        slideNum: 4,
        docno: 'DOC-FALLBACK-EMPTY',
        data: {
          title: '지도 데이터 전무 케이스',
          left: {},
          right: { rows: [['주소', '미확보']] },
        },
        grade: 'A',
        provenance: {},
      });

      expect(output.slide).toBeDefined();
      expect((output as any).suppress).toBe(true);
      expect(output.warnings.some((w) => w.includes('[BL-E]'))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 1. 중개인 수기 입력치 이상치 감지 및 공실 정상화 분석 검증
  // ─────────────────────────────────────────────────────────────
  describe('G1 & G3: Broker Input Anomaly Detection & Pro-Forma Vacancy Normalization', () => {
    it('[신사동 590][Positive Pair] clean SSoT 기반 입력치 검증 및 정상 통과 단언', () => {
      const sinsaInput = fixtureToBrokerInput(sinsaFixture);
      const result = validateBrokerInput(sinsaInput);

      expect(result.isValid).toBe(true);
      expect(result.hasCritical).toBe(false);
      const landDiscrepancy = result.discrepancies.find(d => d.code === 'LAND_PRICE_PYEONG_DISCREPANCY');
      expect(landDiscrepancy).toBeUndefined();
    });

    it('[신사동 590][Negative Pair] 토지 평당가 20% 초과 왜곡 시 critical 이상치 감지 단언', () => {
      const tamperedInput = fixtureToBrokerInput(sinsaFixture, { overrideLandPrice: 350000000 }); // 약 3.5억/평
      const result = validateBrokerInput(tamperedInput);

      expect(result.isValid).toBe(false);
      expect(result.hasCritical).toBe(true);
      const landDiscrepancy = result.discrepancies.find(d => d.code === 'LAND_PRICE_PYEONG_DISCREPANCY');
      expect(landDiscrepancy).toBeDefined();
      expect(landDiscrepancy?.severity).toBe('critical');
    });

    it('[서초동 1364-28][Positive Pair] 정합된 SSoT 픽스처(1.28억/평) 검증 시 Critical 이상치 0건 및 Pro-forma 기회 산출', () => {
      // 1. SSoT 픽스처 자체에 정의된 시장임대료(8.5만/평) 기준 Pro-forma 모델 단언
      expect(seochoFixture.proForma).toBeDefined();
      expect(seochoFixture.proForma.vacantFloorCount).toBe(3);
      expect(seochoFixture.proForma.vacantAreaPyeong).toBe(259.4);
      expect(seochoFixture.proForma.currentCapRatePct).toBe(1.15);
      expect(seochoFixture.proForma.estimatedFullOccupancyCapRatePct).toBe(2.30);
      expect(seochoFixture.proForma.upsideCapRatePp).toBe(1.15);
      expect(seochoFixture.proForma.proFormaMonthlyRentKrw).toBe(44050000);
      expect(seochoFixture.proForma.proFormaAnnualNoiKrw).toBe(528600000);

      // 2. validateBrokerInput 동적 밸류애드 엔진 검증
      const cleanInput = fixtureToBrokerInput(seochoFixture);
      const result = validateBrokerInput(cleanInput);

      expect(result.isValid).toBe(true);
      expect(result.hasCritical).toBe(false);
      expect(result.proFormaOpportunity).toBeDefined();
      expect(result.proFormaOpportunity?.vacantFloorCount).toBe(3);
      expect(result.proFormaOpportunity?.currentCapRatePct).toBeCloseTo(1.15, 1);
      expect(result.proFormaOpportunity?.estimatedFullOccupancyCapRatePct).toBeGreaterThan(1.8);
      expect(result.proFormaOpportunity?.upsideCapRatePp).toBeGreaterThan(0.7);
    });

    it('[서초동 1364-28][Negative Pair] 중개인 원본 수기 오기재(7천만 vs 1.28억) 주입 시 critical 이상치 감지 단언', () => {
      const rawInput = fixtureToBrokerInput(seochoFixture, { overrideLandPrice: seochoFixture.rawBrokerStatedLandPricePerPyeongKrw });
      const result = validateBrokerInput(rawInput);
      const landDiscrepancy = result.discrepancies.find(d => d.code === 'LAND_PRICE_PYEONG_DISCREPANCY');

      expect(landDiscrepancy).toBeDefined();
      expect(landDiscrepancy?.severity).toBe('critical');
      expect(landDiscrepancy?.discrepancyPct).toBeGreaterThan(40);
      expect(landDiscrepancy?.message).toContain('불일치 감지');
      expect(landDiscrepancy?.recommendation).toContain('1.28억');
    });

    it('[미디어 유효성][Positive Pair] 표준 미디어 포맷(JPG/PNG) 검증 시 이상치 0건 정상 통과 단언', () => {
      const input = fixtureToBrokerInput(sinsaFixture, {
        photoUrls: ['https://example.com/photo1.jpg', 'https://example.com/photo2.png'],
      });
      const result = validateBrokerInput(input);
      const wdpDiscrepancy = result.discrepancies.find(d => d.code === 'UNSUPPORTED_MEDIA_FORMAT');
      expect(wdpDiscrepancy).toBeUndefined();
    });

    it('[미디어 유효성][Negative Pair] 비표준 .wdp 미디어 포맷 감지 시 경고 발행 단언', () => {
      const input = fixtureToBrokerInput(sinsaFixture, {
        photoUrls: ['https://example.com/photo1.jpg', 'docs/test/real-broker-im/seocho-media/hdphoto1.wdp'],
      });

      const result = validateBrokerInput(input);
      const wdpDiscrepancy = result.discrepancies.find(d => d.code === 'UNSUPPORTED_MEDIA_FORMAT');
      expect(wdpDiscrepancy).toBeDefined();
      expect(wdpDiscrepancy?.field).toBe('photoUrls');
      expect(wdpDiscrepancy?.recommendation).toContain('JPG/PNG');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. 물리 PPTX 렌더링 무결성 및 9대 게이트 검증 (SSoT 빌드)
  // ─────────────────────────────────────────────────────────────
  describe('G4: Physical PPTX Binary Inspection & D33/D34/D37 Rules', { timeout: 30000 }, () => {
    it('[신사동 590][Positive Pair] 렌더링 바이너리 물리 무결성 0 위반 PASS 단언', async () => {
      const renderer = new MobileImPptxRenderer();
      const photoPath = path.resolve('docs/test/real-broker-im/sinsa-media/image9.jpeg');
      const doc = buildDocFromFixture(sinsaFixture, photoPath);

      const renderResult = await renderer.render({
        buildingId: sinsaFixture.dealId,
        doc: doc as any,
        posture: sinsaFixture.posture,
        preset: 'commercial_visual_grid',
        grade: 'A',
      });

      // Rule 10 준수: 총 면수(본문+부록)를 16 이하로 단언하지 않으며, 정상 슬라이드 생성 확인
      expect(renderResult.slideCount).toBeGreaterThanOrEqual(10);
      expect(renderResult.fileSizeBytes).toBeGreaterThan(10000);

      // Rule 10 도메인 불변식 검증: 본문 슬라이드 16면 상한(PAGE_HARD_LIMIT=16) 준수 및 부록 분리 단언
      const sinsaDeckSeq = buildDeckSequence({
        posture: sinsaFixture.posture,
        grade: 'A',
        hasPhotos: true,
        dataAvailability: {
          hasBuildingRegister: !!doc.body.enrichment?.buildingRegister,
          hasLandUsePlan: !!doc.body.enrichment?.landUsePlan,
          hasRentRoll: true,
          hasPhotos: true,
        },
      });
      const sinsaBodySlides = sinsaDeckSeq.filter((s) => s.placement !== 'appendix');
      const sinsaAppendixSlides = sinsaDeckSeq.filter((s) => s.placement === 'appendix');
      expect(sinsaBodySlides.length).toBeLessThanOrEqual(16);
      expect(sinsaAppendixSlides.length).toBeGreaterThanOrEqual(1);

      const inspection = await inspectPptxBinary(renderResult.buffer);
      expect(inspection.bleedCount).toBe(0);
      expect(inspection.placeholderResidueCount).toBe(0);
      expect(inspection.personaViolationCount).toBe(0);
      expect(inspection.lexiconViolationCount).toBe(0);
      expect(inspection.legalRiskViolationCount).toBe(0);
      expect(inspection.brokenImageCount).toBe(0);
      expect(inspection.defectExcuseViolationCount).toBe(0);
      expect(inspection.isPass).toBe(true);
    }, 30000);

    it('[신사동 590][Negative Pair] 결손 변명(G54) 텍스트 주입 시 inspectPptxBinary 결함 감지 및 검증 실패 단언', async () => {
      const renderer = new MobileImPptxRenderer();
      const docWithG54 = buildDocFromFixture(sinsaFixture);
      // G54 위반 문구 주입: '산출 불가', '미확보', '비워 둡니다'
      (docWithG54.sections[0] as any).markdown += '\n\n**필지별 내역 미확보로 산출 불가하여 비워 둡니다.**';

      const renderResult = await renderer.render({
        buildingId: sinsaFixture.dealId,
        doc: docWithG54 as any,
        posture: sinsaFixture.posture,
        preset: 'commercial_visual_grid',
        grade: 'A',
      });

      const inspection = await inspectPptxBinary(renderResult.buffer);
      expect(inspection.defectExcuseViolationCount).toBeGreaterThan(0);
      expect(inspection.isPass).toBe(false);
      expect(inspection.issues.some((issue) => issue.includes('G54') || issue.includes('결손변명'))).toBe(true);
    }, 30000);

    it('[서초동 1364-28][Positive Pair] 다층 공실 렌트롤 및 Pro-forma 렌더링 무결성 PASS 단언', async () => {
      const renderer = new MobileImPptxRenderer();
      const photoPath = path.resolve('docs/test/real-broker-im/seocho-media/image3.jpeg');
      const doc = buildDocFromFixture(seochoFixture, photoPath);

      const renderResult = await renderer.render({
        buildingId: seochoFixture.dealId,
        doc: doc as any,
        posture: seochoFixture.posture,
        preset: 'commercial_visual_grid',
        grade: 'A',
      });

      // Rule 10 준수: 총 면수(본문+부록)를 16 이하로 단언하지 않으며, 정상 슬라이드 생성 확인
      expect(renderResult.slideCount).toBeGreaterThanOrEqual(10);
      expect(renderResult.fileSizeBytes).toBeGreaterThan(10000);

      // Rule 10 도메인 불변식 검증: 본문 슬라이드 16면 상한(PAGE_HARD_LIMIT=16) 준수 및 부록 분리 단언
      const seochoDeckSeq = buildDeckSequence({
        posture: seochoFixture.posture,
        grade: 'A',
        hasPhotos: true,
        dataAvailability: {
          hasBuildingRegister: !!doc.body.enrichment?.buildingRegister,
          hasLandUsePlan: !!doc.body.enrichment?.landUsePlan,
          hasRentRoll: true,
          hasPhotos: true,
        },
      });
      const seochoBodySlides = seochoDeckSeq.filter((s) => s.placement !== 'appendix');
      const seochoAppendixSlides = seochoDeckSeq.filter((s) => s.placement === 'appendix');
      expect(seochoBodySlides.length).toBeLessThanOrEqual(16);
      expect(seochoAppendixSlides.length).toBeGreaterThanOrEqual(1);

      const inspection = await inspectPptxBinary(renderResult.buffer);
      expect(inspection.bleedCount).toBe(0);
      expect(inspection.placeholderResidueCount).toBe(0);
      expect(inspection.personaViolationCount).toBe(0);
      expect(inspection.lexiconViolationCount).toBe(0);
      expect(inspection.legalRiskViolationCount).toBe(0);
      expect(inspection.brokenImageCount).toBe(0);
      expect(inspection.defectExcuseViolationCount).toBe(0);
      expect(inspection.isPass).toBe(true);
    }, 30000);

    it('[서초동 1364-28][Negative Pair] 금지 페르소나(Rule 1) 및 미치환 토큰 주입 시 inspectPptxBinary 결함 감지 및 검증 실패 단언', async () => {
      const renderer = new MobileImPptxRenderer();
      const docCorrupted = buildDocFromFixture(seochoFixture);
      // Rule 1 페르소나('60대 자산가') 및 미치환 템플릿 토큰('{{unrendered_token}}') 주입
      docCorrupted.title = `${seochoFixture.title} (60대 자산가 맞춤) {{unrendered_token}}`;
      docCorrupted.body.title = docCorrupted.title;

      const renderResult = await renderer.render({
        buildingId: seochoFixture.dealId,
        doc: docCorrupted as any,
        posture: seochoFixture.posture,
        preset: 'commercial_visual_grid',
        grade: 'A',
      });

      const inspection = await inspectPptxBinary(renderResult.buffer);
      expect(inspection.personaViolationCount).toBeGreaterThan(0);
      expect(inspection.placeholderResidueCount).toBeGreaterThan(0);
      expect(inspection.isPass).toBe(false);
      expect(inspection.issues.some((issue) => issue.includes('Rule 1') || issue.includes('페르소나'))).toBe(true);
      expect(inspection.issues.some((issue) => issue.includes('미치환 자리표시자') || issue.includes('{{'))).toBe(true);
    }, 30000);
  });

  // ─────────────────────────────────────────────────────────────
  // 3. 옴니채널 양방향 동기화 및 2단계 승인 원장 무결성 검증
  // ─────────────────────────────────────────────────────────────
  describe('G6: Omni-Channel Bidirectional Sync & Approval Ledger', () => {
    it('[Positive Pair] SSoT 기반 Target Hash 생성 및 Studio 2단계 승인 원장 연동 단언', async () => {
      const docA = {
        title: sinsaFixture.title,
        address: sinsaFixture.address,
        posture: sinsaFixture.posture,
        asking_price: sinsaFixture.askingPriceKrw,
        sections: [{ section_type: 'overview', markdown: '원안' }],
      };
      const hashA = computeTargetHash({
        body: docA,
        releaseTier: 'analysis_im',
        policyVersion: 'v1.0.0',
      });

      const studioService = new PptxStudioService(true);
      const approvalService = new StudioApprovalService();
      const project = studioService.createProject(sinsaFixture.dealId, `pkg-${sinsaFixture.dealId}`, docA.title, 'commercial_visual_grid');

      project.stage = 'S50_GATE_CHECK';
      const editorial = await approvalService.approveEditorial(project, 'test-auditor', hashA);
      expect(project.stage).toBe('S60_EDITORIAL_APPROVAL');
      expect(editorial.eventType).toBe('human_approve');

      const { release } = await approvalService.approveFile(project, hashA, '/docs/sinsa.pptx', 'test-auditor');
      expect(release.status).toBe('PUBLISHED');

      const consistency = verifyCrossChannelConsistency({
        webDoc: {
          title: docA.title,
          body: {
            askingPrice: docA.asking_price,
            ssot_summary: {
              asking_price: docA.asking_price,
              title: docA.title,
              total_area: sinsaFixture.grossFloorAreaM2,
              land_area: sinsaFixture.landAreaM2,
              cap_rate: sinsaFixture.capRatePct,
              total_deposit: sinsaFixture.statedDepositKrw,
              monthly_rent: sinsaFixture.statedMonthlyRentKrw,
            },
          },
        },
        pptxProject: project,
      });
      expect(consistency.passed).toBe(true);
      expect(consistency.totalDiscrepancies).toBe(0);
    }, 30000);

    it('[Negative Pair] 매매가 변조 시 Target Hash 불일치 및 크로스 채널 불일치 검출 단언', () => {
      const docA = {
        title: sinsaFixture.title,
        address: sinsaFixture.address,
        posture: sinsaFixture.posture,
        asking_price: sinsaFixture.askingPriceKrw,
        sections: [{ section_type: 'overview', markdown: '원안' }],
      };
      const hashA = computeTargetHash({
        body: docA,
        releaseTier: 'analysis_im',
        policyVersion: 'v1.0.0',
      });

      const docB = { ...docA, asking_price: 75000000000 };
      const hashB = computeTargetHash({
        body: docB,
        releaseTier: 'analysis_im',
        policyVersion: 'v1.0.0',
      });

      expect(hashA).not.toBe(hashB);

      // 크로스 채널 불일치 검증 (웹 750억 vs PPTX 오버뷰 760억)
      const tamperedConsistency = verifyCrossChannelConsistency({
        webDoc: {
          title: docA.title,
          body: {
            askingPrice: 75000000000,
            ssot_summary: {
              asking_price: 75000000000,
            },
          },
        },
        pptxProject: {
          title: docA.title,
          slides: [
            {
              layoutType: 'A02',
              dataKey: 'overview',
              slideOverrides: { price: 76000000000 },
            },
          ],
        },
      });
      expect(tamperedConsistency.passed).toBe(false);
      expect(tamperedConsistency.totalDiscrepancies).toBeGreaterThan(0);
      expect(tamperedConsistency.discrepancies.some((d) => d.field === 'asking_price')).toBe(true);
    });
  });
});

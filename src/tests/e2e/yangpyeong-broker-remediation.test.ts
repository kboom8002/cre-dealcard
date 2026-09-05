/**
 * @file yangpyeong-broker-remediation.test.ts
 * @description 양평동 더레드빌딩(250억 원) 중개인 피드백(docs/real-broker-im/양평동(AI) 의견.pdf) 전면 반영 E2E 회귀 테스트
 *              - Rule 6 (산출물 단언 우선 원칙)
 *              - Rule 7 (Negative Pair 짝 의무 철저 준수)
 *              - Rule 10 (본문 16면 상한 준수, 부록 제외)
 *              - Rule 12 (im-core 도메인 순수성)
 *              - G54 (결손 변명 퇴출), G55 (AI 훈계조 퇴출), G56 (내부 룰 노출 방지)
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';
import { validateBrokerInput } from '../../domain/building/im-core/broker-input-validator';
import { verifyCrossChannelConsistency } from '../../domain/building/im-core/cross-channel-checker';
import { inspectPptxBinary } from '../../assurance/im-harness/observers/pptx-binary-observer';
import { PptxStudioService } from '../../domain/building/pptx-studio/studio-service';
import { StudioApprovalService } from '../../domain/building/pptx-studio/approval/studio-approval-service';
import { detectDistrict } from '../../services/macro-transit-engine';
import {
  calculateSalesComparison,
  calculateIncomeCapitalization,
  generateCreDualValuationReport,
} from '../../domain/building/im-core/valuation-calc';
import { PUBLISH_GATES, type GateContext } from '../../domain/building/mobile-im/quality-gates-v02';

describe('Yangpyeong The Red Building Broker Feedback Remediation E2E Suite', () => {
  const fixturePath = path.resolve('docs/test/real-broker-im/yangpyeong-the-red-fixture.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  // --------------------------------------------------------------------------
  // R2. 4대 필수 건축 제원 복원 및 중개인 입력 검증
  // --------------------------------------------------------------------------
  describe('R2: Essential Building Specs Restoration & SSoT Validation', () => {
    it('[Positive Pair] 4대 필수 건축 제원(건축면적, 사용승인일, 주차 23대, 승강기 1대) SSoT 완비 및 유효성 통과', () => {
      expect(fixture.archAreaM2).toBe(302.94);
      expect(fixture.completionDate).toBe('2018-09-12');
      expect(fixture.parkingCount).toBe(23);
      expect(fixture.elevatorCount).toBe(1);
      expect(fixture.parking).toContain('기계식 22대');
      expect(fixture.parking).toContain('자주식 1대');

      const rentRollUnits = fixture.stackingPlan.map((s: any) => ({
        floor: s.floor,
        tenant: s.tenant,
        deposit: s.depositKrw,
        rent: s.monthlyRentKrw,
        areaPyeong: s.floorAreaPy,
        isVacant: s.isVacant,
      }));

      const validation = validateBrokerInput({
        askingPriceKrw: fixture.askingPriceKrw,
        landAreaM2: fixture.landAreaM2,
        grossFloorAreaM2: fixture.grossFloorAreaM2,
        statedDepositKrw: fixture.statedDepositKrw,
        statedMonthlyRentKrw: fixture.statedMonthlyRentKrw,
        rentRoll: {
          totalUnits: rentRollUnits.length,
          units: rentRollUnits,
        },
      });

      expect(validation.isValid).toBe(true);
      expect(validation.hasCritical).toBe(false);
      expect(validation.discrepancies.length).toBe(0);
    });

    it('[Negative Pair] 중개인 기재 토지평당가와 실계산치 20% 초과 괴리 시 critical 이상치 감지 단언', () => {
      const invalidInput = {
        askingPriceKrw: 25000000000,
        landAreaM2: 518.70,
        grossFloorAreaM2: 2490.88,
        statedLandPricePerPyeongKrw: 300000000, // 실제 1.59억 대비 88% 괴리
        statedDepositKrw: fixture.statedDepositKrw,
        statedMonthlyRentKrw: fixture.statedMonthlyRentKrw,
        rentRoll: {
          totalUnits: 1,
          units: [{ floor: '1F', tenant: '테스트', deposit: fixture.statedDepositKrw, rent: fixture.statedMonthlyRentKrw }],
        },
      };

      const validation = validateBrokerInput(invalidInput);
      expect(validation.isValid).toBe(false);
      expect(validation.hasCritical).toBe(true);
      expect(validation.discrepancies.some((d) => d.code === 'LAND_PRICE_PYEONG_DISCREPANCY')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // R3. 2대 상업용 감정평가 엔진 (사례비교법 + 수익환원법, 원가법 배제)
  // --------------------------------------------------------------------------
  describe('R3: CRE Dual Valuation Engine (Sales Comp + Income Cap)', () => {
    it('[Positive Pair] 3개 실거래 사례비교법 및 Cap Rate 밴드 수익환원법 산출, 원가법 배제 확인', () => {
      const landAreaPyeong = fixture.landAreaM2 / 3.305785;
      const gfaPyeong = fixture.grossFloorAreaM2 / 3.305785;
      const annualGrossRentKrw = fixture.statedMonthlyRentKrw * 12;

      const report = generateCreDualValuationReport(
        fixture.salesComparisonComps,
        {
          askingPriceKrw: fixture.askingPriceKrw,
          landAreaPyeong,
          gfaPyeong,
          annualGrossRentKrw,
          annualMgmtFeeKrw: fixture.statedMgmtFeeKrw * 12,
          annualOpexKrw: fixture.statedMgmtFeeKrw * 12,
          marketCapRateRangePct: [2.1, 2.5],
        }
      );

      expect(report.salesComparison.compCount).toBe(3);
      expect(report.salesComparison.avgLandPricePerPyeongKrw).toBeGreaterThan(150000000);
      expect(report.salesComparison.isWithinMarketBand).toBe(true);

      expect(report.incomeCapitalization.annualNoiKrw).toBe(558840000);
      expect(report.incomeCapitalization.impliedCapRatePct).toBeCloseTo(2.24, 2);
      expect(report.incomeCapitalization.fairValueRangeKrw[0]).toBeGreaterThan(22000000000);
      expect(report.incomeCapitalization.fairValueRangeKrw[1]).toBeLessThan(27000000000);

      expect(report.costMethodExcludedNote).toContain('원가법 제외');
      expect(report.costMethodExcludedNote).toContain('도심');
    });

    it('[Negative Pair] 비교사례 0건 전달 시 사례비교법 계산 오류 발생 단언', () => {
      expect(() => {
        calculateSalesComparison([], {
          askingPriceKrw: 25000000000,
          landAreaPyeong: 156.9,
          gfaPyeong: 753.5,
        });
      }).toThrowError(/비교사례/);
    });

    it('[Negative Pair] 요구 Cap Rate 0 이하 시 수익환원법 오류 발생 단언', () => {
      expect(() => {
        calculateIncomeCapitalization({
          annualGrossRentKrw: 500000000,
          askingPriceKrw: 25000000000,
          marketCapRateRangePct: [0, 2.5],
        });
      }).toThrowError(/요구 Cap Rate/);
    });
  });

  // --------------------------------------------------------------------------
  // R1. 결손 변명(G54) / AI 훈계조(G55) / 내부 시스템 룰(G56) 퇴출 게이트
  // --------------------------------------------------------------------------
  describe('R1: Defect Excuse (G54), Preachy Tone (G55), and Internal Rule Leak (G56) Gates', () => {
    it('[Positive Pair] 결손 변명, 훈계조, 시스템 룰이 없는 정제된 컨텍스트는 G54, G55, G56 ALL PASS', () => {
      const cleanCtx: GateContext = {
        deckType: 'FULL_IM',
        pages: 15,
        hasRentRoll: true,
        hasValuation: true,
        defectExcuseCount: 0,
        preachyToneCount: 0,
        internalRuleLeakCount: 0,
      };

      const g54 = PUBLISH_GATES.find((g) => g.id === 'G54');
      const g55 = PUBLISH_GATES.find((g) => g.id === 'G55');
      const g56 = PUBLISH_GATES.find((g) => g.id === 'G56');

      expect(g54?.check(cleanCtx)).toBe(true);
      expect(g55?.check(cleanCtx)).toBe(true);
      expect(g56?.check(cleanCtx)).toBe(true);
    });

    it('[Negative Pair] 결손 변명("미확보", "산출불가"), 훈계조, 시스템 룰 오염 시 G54, G55, G56 BLOCK 단언', () => {
      const dirtyCtx: GateContext = {
        deckType: 'FULL_IM',
        pages: 15,
        defectExcuseCount: 2, // '미확보', '산출불가'
        preachyToneCount: 1,  // '판단하지 마십시오'
        internalRuleLeakCount: 1, // 'Rule 10'
      };

      const g54 = PUBLISH_GATES.find((g) => g.id === 'G54');
      const g55 = PUBLISH_GATES.find((g) => g.id === 'G55');
      const g56 = PUBLISH_GATES.find((g) => g.id === 'G56');

      expect(g54?.check(dirtyCtx)).toBe(false);
      expect(g55?.check(dirtyCtx)).toBe(false);
      expect(g56?.check(dirtyCtx)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // R5. 광역 교통망(YBD 영등포 권역) 매핑 및 배후수요 도메인 격리
  // --------------------------------------------------------------------------
  describe('R5: Macro Transit Engine & District Isolation', () => {
    it('[Positive Pair] 양평동 및 선유도 주소가 YBD 권역으로 정확히 감지됨', () => {
      expect(detectDistrict('서울특별시 영등포구 양평동4가 117')).toBe('YBD');
      expect(detectDistrict('서울특별시 영등포구 선유도로 100')).toBe('YBD');
      expect(detectDistrict('서울특별시 영등포구 여의도동 45-3')).toBe('YBD');
    });

    it('[Negative Pair] 미지원 외곽 주소는 YBD가 아닌 기본 기타 권역(generic)으로 안전하게 대체', () => {
      expect(detectDistrict('강원도 춘천시 중앙로 1')).toBe('generic');
      expect(detectDistrict('제주특별자치도 제주시 첨단로 242')).toBe('generic');
    });
  });

  // --------------------------------------------------------------------------
  // R4. 옴니채널 7대 지표 동기화 및 Studio 승인 원장 (S60 -> S70)
  // --------------------------------------------------------------------------
  describe('R4: Omni-channel 7 Core Metrics & Studio Approval Flow', () => {
    it('[Positive Pair] S50 -> S60 에디토리얼 승인 -> S70 배포 원장 체결 및 7대 핵심 지표 완벽 일치', async () => {
      const studioService = new PptxStudioService(true);
      const project = studioService.createProject(
        'yangpyeong-the-red',
        'pkg-yp-01',
        fixture.title,
        'institutional_slate'
      );

      project.stage = 'S50_GATE_CHECK';
      const approvalService = new StudioApprovalService();
      const dummySha = createHash('sha256').update('yangpyeong-perfect-binary').digest('hex');

      const editorialEvent = await approvalService.approveEditorial(
        project,
        'broker-lead-js',
        dummySha
      );
      expect(editorialEvent.id).toBeDefined();
      expect(project.stage).toBe('S60_EDITORIAL_APPROVAL');

      const { release } = await approvalService.approveFile(
        project,
        dummySha,
        '/docs/demo-output/yangpyeong-the-red-benchmark.pptx',
        'broker-lead-js'
      );
      expect(release.status).toBe('PUBLISHED');
      expect(project.stage).toBe('S70_FILE_APPROVAL');

      const webDoc = {
        title: fixture.title,
        body: {
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
      };

      const audit = verifyCrossChannelConsistency({
        webDoc,
        pptxProject: project,
        ssotLite: webDoc.body.ssot_summary,
      });

      expect(audit.passed).toBe(true);
      expect(audit.totalDiscrepancies).toBe(0);
      expect(audit.verifiedMetrics).toEqual(
        expect.arrayContaining([
          'title',
          'asking_price',
          'total_area',
          'land_area',
          'cap_rate',
          'total_deposit',
          'monthly_rent',
        ])
      );
    });

    it('[Negative Pair] 웹 문서와 PPTX 간 매매가 또는 보증금 변조 시 NUMERICAL_MISMATCH 검출', () => {
      const studioService = new PptxStudioService(true);
      const project = studioService.createProject(
        'yangpyeong-the-red',
        'pkg-yp-01',
        fixture.title,
        'institutional_slate'
      );

      // PPTX 측 오버라이드 가격을 300억으로 변조
      project.slides = [
        { dataKey: 'overview', slideOverrides: { price: 30000000000 } },
      ];

      const webDoc = {
        title: fixture.title,
        body: {
          ssot_summary: {
            asking_price: 25000000000,
          },
        },
      };

      const audit = verifyCrossChannelConsistency({
        webDoc,
        pptxProject: project,
        ssotLite: webDoc.body.ssot_summary,
      });

      expect(audit.passed).toBe(false);
      expect(audit.totalDiscrepancies).toBeGreaterThan(0);
      expect(audit.discrepancies.some((d) => d.field === 'asking_price')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // R6. 물리 바이너리 산출물 단언 및 9대 게이트 인스펙션 (Rule 6, Rule 10)
  // --------------------------------------------------------------------------
  describe('R6: Physical PPTX Binary Inspection & Rule 10 Page Limits', () => {
    it('[Positive Pair] 양평동 벤치마크 PPTX 바이너리 9대 게이트 0 결함 PASS 및 Rule 10 본문 16면 상한 준수', async () => {
      const pptxPath = path.resolve('docs/demo-output/yangpyeong-the-red-benchmark.pptx');
      expect(fs.existsSync(pptxPath)).toBe(true);

      const buffer = fs.readFileSync(pptxPath);
      const inspection = await inspectPptxBinary(buffer);

      expect(inspection.isPass).toBe(true);
      expect(inspection.bleedCount).toBe(0);
      expect(inspection.placeholderResidueCount).toBe(0);
      expect(inspection.brokenImageCount).toBe(0);
      expect(inspection.personaViolationCount).toBe(0);
      expect(inspection.lexiconViolationCount).toBe(0);
      expect(inspection.legalRiskViolationCount).toBe(0);
      expect(inspection.defectExcuseViolationCount).toBe(0);
      expect(inspection.preachyViolationCount).toBe(0);
      expect(inspection.internalRuleViolationCount).toBe(0);
      expect(inspection.minEffectiveDpi).toBeGreaterThanOrEqual(150);
      // Rule 10: 본문 16면 상한 (부록 2면 분리되어 총 17면)
      expect(inspection.slideCount).toBe(17);
    });

    it('[Negative Pair] 바이너리 텍스트에 결손 변명("미확보") 또는 AI 훈계조 삽입 시 인스펙션 위반 카운트 증가 단언', async () => {
      const pptxPath = path.resolve('docs/demo-output/yangpyeong-the-red-benchmark.pptx');
      const originalBuffer = fs.readFileSync(pptxPath);

      // JSZip을 통해 슬라이드 텍스트에 인위적으로 결손 변명 문구 주입
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(originalBuffer);
      const slideKey = Object.keys(zip.files).find((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))!;
      const slideXml = await zip.file(slideKey)!.async('string');

      const tamperedXml = slideXml.replace(
        /<a:t[^>]*>([\s\S]*?)<\/a:t>/,
        '<a:t>필지별 내역 미확보 상태이며 표면 수익률만으로 매입 판단을 하지 마십시오</a:t>'
      );
      zip.file(slideKey, tamperedXml);
      const tamperedBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      const tamperedInspection = await inspectPptxBinary(tamperedBuffer);
      expect(tamperedInspection.isPass).toBe(false);
      expect(tamperedInspection.defectExcuseViolationCount).toBeGreaterThan(0);
      expect(tamperedInspection.preachyViolationCount).toBeGreaterThan(0);
    });
  });
});

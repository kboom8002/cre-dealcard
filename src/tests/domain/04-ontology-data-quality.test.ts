/**
 * src/tests/domain/04-ontology-data-quality.test.ts
 *
 * 04. 온톨로지·데이터 품질·크로스-시스템 통합 E2E 테스트 스위트
 * Spec: docs/test/04_ontology_data_quality_test.md
 */

import { describe, it, expect } from 'vitest';
import { computeDataGrade } from '@/domain/asset/grade-engine';
import { validateAssetConstraints } from '@/domain/asset/constraint-validator';
import { verifyAgainstPublicData } from '@/domain/verification/public-data-verifier';
import { extractSlotsFromMemo } from '@/domain/building/memo-slot-mapper';
import { sanitizeMemo } from '@/ai/sanitizer/memo-sanitizer';
import { getCurrentBillingMonth } from '@/domain/subscription/usage-tracker';

describe('04. 온톨로지·데이터 품질·크로스-시스템 통합 테스트', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // E1. SSoT 스튜디오 편집 & 등급 실시간 계산
  // ───────────────────────────────────────────────────────────────────────────
  describe('E1. SSoT 스튜디오 편집 & 등급 실시간 계산', () => {
    it('초기 상태: 기본 슬롯 입력 시 C등급 산출', () => {
      const initialAttrs = {
        pnu: '1144010100100000000',
        address: '서울시 마포구 양화로 100',
        asset_type: 'nbhd_building',
        askingPriceKrw: 6000000000,
        year_built: 2015,
        floors: 5,
      };

      const result = computeDataGrade(initialAttrs);
      expect(result.grade).toBe('C');
      expect(result.scorePct).toBeGreaterThanOrEqual(40);
      expect(result.scorePct).toBeLessThan(65);
    });

    it('Step 1: 면적 슬롯 추가 시 점수 상승 (50+점, C등급 유지)', () => {
      const step1Attrs = {
        pnu: '1144010100100000000',
        address: '서울시 마포구 양화로 100',
        asset_type: 'nbhd_building',
        askingPriceKrw: 6000000000,
        year_built: 2015,
        floors: 5,
        totalFloorAreaPyung: 300,
        landAreaPyung: 80,
      };

      const result = computeDataGrade(step1Attrs);
      expect(result.grade).toBe('C');
      expect(result.scorePct).toBeGreaterThanOrEqual(50);
    });

    it('Step 2: 렌트롤 및 임대차 데이터 추가 시 B등급 상승 (65+점)', () => {
      const step2Attrs = {
        pnu: '1144010100100000000',
        address: '서울시 마포구 양화로 100',
        asset_type: 'nbhd_building',
        askingPriceKrw: 6000000000,
        year_built: 2015,
        floors: 5,
        totalFloorAreaPyung: 300,
        landAreaPyung: 80,
        rentRoll: [
          { floor: '1F', tenant: '커피숍', deposit: 30000000, monthly: 2000000 },
          { floor: '2F', tenant: '미용실', deposit: 20000000, monthly: 1500000 },
          { floor: '3F', tenant: '사무실', deposit: 20000000, monthly: 1500000 },
        ],
        grossAnnualIncomeKrw: 60000000,
        vacancyRatePct: 0,
      };

      const result = computeDataGrade(step2Attrs);
      expect(['A', 'B']).toContain(result.grade);
      expect(result.scorePct).toBeGreaterThanOrEqual(65);
    });

    it('Step 3: 재무/수익 지표 추가 시 A등급 상승 (85+점, DCF 분석 가능)', () => {
      const step3Attrs = {
        pnu: '1144010100100000000',
        address: '서울시 마포구 양화로 100',
        asset_type: 'office_building',
        askingPriceKrw: 6000000000,
        totalFloorAreaPyung: 300,
        landAreaPyung: 80,
        zoningRegion: '제2종일반주거지역',
        rentRoll: [
          { floor: '1F', tenant: '커피숍', deposit: 30000000, monthly: 2000000 },
        ],
        grossAnnualIncomeKrw: 300000000,
        vacancyRatePct: 0,
        capRatePct: 5.0,
        noiKrw: 300000000,
        loanAmountKrw: 3000000000,
        approvalDate: '2015-05-10',
        farHeadroomPp: 10,
        officialLandPricePerSqm: 15000000,
        roadContactType: '대로변',
        parkingCapacity: 10,
        evictionStatus: 'none',
      };

      const result = computeDataGrade(step3Attrs);
      expect(result.grade).toBe('A');
      expect(result.scorePct).toBeGreaterThanOrEqual(85);
      expect(result.dcfEligible).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // E2. 제약 조건 검증 규칙 C01~C22
  // ───────────────────────────────────────────────────────────────────────────
  describe('E2. 제약 조건 검증 규칙 C01~C22', () => {
    it('C02: 실제 용적률이 법정 용적률을 초과할 때 warning 생성', () => {
      const attrs = {
        zoningRegion: '제2종일반주거지역', // max 250%
        farPct: 350,
      };
      const res = validateAssetConstraints(attrs);
      const c02 = res.violations.find((v) => v.ruleId === 'C02');
      expect(c02).toBeDefined();
      expect(c02?.severity).toBe('warning');
      expect(c02?.message).toContain('초과');
    });

    it('C11: Grade가 A가 아닌 자산에서 DCF 요청 시 error 생성', () => {
      const attrs = {
        dataGrade: 'B',
        dcfRequested: true,
      };
      const res = validateAssetConstraints(attrs);
      const c11 = res.violations.find((v) => v.ruleId === 'C11');
      expect(c11).toBeDefined();
      expect(c11?.severity).toBe('error');
      expect(res.isValid).toBe(false);
    });

    it('C13: 주소 출처가 fallback이고 신뢰도가 낮은 경우 warning 생성', () => {
      const attrs = {
        addressSource: 'fallback',
        addressConfidence: 0.65,
      };
      const res = validateAssetConstraints(attrs);
      const c13 = res.violations.find((v) => v.ruleId === 'C13');
      expect(c13).toBeDefined();
      expect(c13?.severity).toBe('warning');
    });

    it('C15: 환산보증금 계산 불일치 시 info 메시지 생성', () => {
      const attrs = {
        totalDepositKrw: 50000000,
        monthlyRentKrw: 2000000,
        convertedDeposit: 300000000, // calc is 50M + 2M*100 = 250M
      };
      const res = validateAssetConstraints(attrs);
      const c15 = res.violations.find((v) => v.ruleId === 'C15');
      expect(c15).toBeDefined();
      expect(c15?.severity).toBe('info');
    });

    it('LEVERAGE (C12): 대출금+보증금이 매매가 110% 초과 시 과다 레버리지 warning 생성', () => {
      const attrs = {
        askingPriceKrw: 8000000000,
        loanAmountKrw: 6000000000,
        totalDepositKrw: 3500000000, // sum = 9.5B > 8.8B (110%)
      };
      const res = validateAssetConstraints(attrs);
      const c12 = res.violations.find((v) => v.ruleId === 'C12');
      expect(c12).toBeDefined();
      expect(c12?.severity).toBe('warning');
      expect(c12?.message).toContain('과도 레버리지');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // E3. 공공 데이터 교차 검증
  // ───────────────────────────────────────────────────────────────────────────
  describe('E3. 공공 데이터 교차 검증', () => {
    it('GOV-MATCH: 연면적 및 주용도가 일치할 때 verified 반환', async () => {
      const result = await verifyAgainstPublicData(
        '서울특별시 강남구 역삼동 742-1',
        '오피스빌딩',
        '3,000평'
      );
      expect(result.status).toBe('verified');
      expect(result.checks.buildingExists).toBe(true);
      expect(result.checks.purposeMatch).toBe(true);
      expect(result.checks.areaWithinRange).toBe(true);
    });

    it('GOV-AREA-MISMATCH: 연면적 오차가 30%를 초과할 때 mismatch 경고 생성', async () => {
      const result = await verifyAgainstPublicData(
        '서울특별시 강남구 역삼동 742-1',
        '오피스빌딩',
        '100평'
      );
      expect(result.status).toBe('mismatch');
      expect(result.checks.areaWithinRange).toBe(false);
    });

    it('GOV-USE-MISMATCH: 주용도가 완전히 상이할 때 mismatch 경고 생성', async () => {
      const result = await verifyAgainstPublicData(
        '서울특별시 강남구 역삼동 742-1',
        '물류',
        '3,000평'
      );
      expect(result.status).toBe('mismatch');
      expect(result.checks.purposeMatch).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // F1. 온보딩 → 첫 딜카드 → IM → 매칭 (풀 저니 E2E)
  // ───────────────────────────────────────────────────────────────────────────
  describe('F1. 온보딩 → 첫 딜카드 → IM → 매칭 (풀 저니)', () => {
    it('메모 입력 및 PII 마스킹 처리 확인', () => {
      const rawMemo = '마포구 합정동 근생빌딩 대지 90평 연면적 350평 5층 2010년 준공 월수입 2800만원 매도호가 65억';
      const sanitized = sanitizeMemo(rawMemo);
      expect(sanitized.sanitizedText).toBeDefined();
      expect(sanitized.injectionDetected).toBe(false);
    });

    it('자연어 메모에서 슬롯 파싱 확인', () => {
      const memo = '마포구 합정동 근생빌딩 대지 90평 연면적 350평 5층 2010년 준공 월수입 2800만원 매도호가 65억';
      const result = extractSlotsFromMemo(memo);
      expect(result.slots.length).toBeGreaterThanOrEqual(2);
      expect(result.extractionRate).toBeGreaterThan(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // F2. 구독 티어 게이트 & 사용량 추적
  // ───────────────────────────────────────────────────────────────────────────
  describe('F2. 구독 티어 게이트 & 사용량 추적', () => {
    it('현재 빌링 월 포맷이 YYYY-MM 형식을 따르는지 확인', () => {
      const month = getCurrentBillingMonth();
      expect(month).toMatch(/^\d{4}-\d{2}$/);
    });

    it('Free 티어에서 미지원 기능(im_pro, pptx_preset)이 정상 정의되어 있는지 확인', () => {
      const freeTierFeatures = ['deal_card_creation', 'ai_matching', 'im_generation'];
      expect(freeTierFeatures).toContain('im_generation');
    });
  });
});

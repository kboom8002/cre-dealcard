/**
 * @file a23-yield-formula-edge.test.ts
 * @description Unit tests for Archetype A23 (Yield Formula)
 *              Validates division by zero defense, stabilized badge, and non-finite number handling
 *              Rule 7 (Negative Pair 의무) & Rule 59 (Poison Token 방어) 철저 준수
 */

import { describe, it, expect } from 'vitest';
import pptxgen from 'pptxgenjs';
import AdmZip from 'adm-zip';
import { buildA23YieldFormula } from '@/domain/building/mobile-im/pptx/archetypes/a23-yield-formula';

describe('Archetype A23: Yield Formula Edge Case Tests', () => {
  const createBaseInput = (data: Record<string, any>) => ({
    pres: new pptxgen(),
    slideNum: 7,
    docno: 'DOC-2026-TEST',
    data,
    grade: 'B' as const,
    provenance: {},
  });

  // ─────────────────────────────────────────────────────────────
  // 1. 0으로 나누기 및 이상치 방어 (Division by Zero Defense)
  // ─────────────────────────────────────────────────────────────
  describe('1. Division by Zero & Extreme Equity Defense', () => {
    it('[Positive] 승계 보증금이 매매가에 근접/동일할 때 경고를 발행하고 NaN이 발생하지 않아야 함', async () => {
      const input = createBaseInput({
        annualRent: 200_000_000,
        askingPrice: 10_000_000_000,
        totalDeposit: 10_000_000_000, // 매매가 == 보증금 (실질 투자금 0원)
        capRateAsIs: 0,
      });

      const { warnings } = buildA23YieldFormula(input);
      expect(warnings.some(w => w.includes('승계 보증금이 매매가 이상입니다'))).toBe(true);

      const buffer = (await input.pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      expect(slideXml).not.toContain('>NaN<');
      expect(slideXml).not.toContain('>undefined<');
      expect(slideXml).not.toContain('>null<');
      expect(slideXml).not.toContain('Infinity');
    });

    it('[Negative Pair] 승계 보증금이 매매가를 초과하는 극단치(자본잠식)에서도 크래시 없이 안전하게 렌더링되어야 함', async () => {
      const input = createBaseInput({
        annualRent: 150_000_000,
        askingPrice: 5_000_000_000,
        totalDeposit: 8_000_000_000, // 보증금 > 매매가
        capRateAsIs: 0,
      });

      const { warnings } = buildA23YieldFormula(input);
      expect(warnings.some(w => w.includes('승계 보증금이 매매가 이상입니다'))).toBe(true);

      const buffer = (await input.pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      expect(slideXml).not.toContain('>NaN<');
      expect(slideXml).not.toContain('Infinity');
    });

    it('[Positive Pair] 정상 케이스(매매가 > 보증금)에서는 분모 초과 경고가 없어야 함', async () => {
      const input = createBaseInput({
        annualRent: 233_520_000,
        askingPrice: 11_500_000_000,
        totalDeposit: 290_000_000,
        capRateAsIs: 2.08,
      });

      const { warnings } = buildA23YieldFormula(input);
      expect(warnings.some(w => w.includes('승계 보증금이 매매가 이상입니다'))).toBe(false);

      const buffer = (await input.pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      expect(slideXml).toContain('2.08%');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Stabilized Cap Rate 및 ◇ 분석가정 배지
  // ─────────────────────────────────────────────────────────────
  describe('2. Stabilized Cap Rate & Assumption Badge', () => {
    it('[Positive] capRateStabilized가 양수일 때 ◇ 분석가정 배지 및 Stabilized 카드가 렌더링되어야 함', async () => {
      const input = createBaseInput({
        annualRent: 233_520_000,
        askingPrice: 11_500_000_000,
        totalDeposit: 290_000_000,
        vacancyPct: 15,
        capRateAsIs: 2.08,
        capRateStabilized: 3.50,
        stabilizedAssumption: '공실층 시세 100% 임대 달성 시',
      });

      const { warnings } = buildA23YieldFormula(input);
      expect(warnings.filter(w => !w.includes('공시지가'))).toHaveLength(0);

      const buffer = (await input.pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      expect(slideXml).toContain('◇ 분석가정');
      expect(slideXml).toContain('안정화 수익률');
      expect(slideXml).toContain('3.50%');
      expect(slideXml).toContain('공실층 시세 100% 임대 달성 시');
    });

    it('[Negative Pair] capRateStabilized가 없을 때 ◇ 분석가정 배지가 없어야 하고 경고가 발생해야 함', async () => {
      const input = createBaseInput({
        annualRent: 233_520_000,
        askingPrice: 11_500_000_000,
        totalDeposit: 290_000_000,
        capRateAsIs: 2.08,
        capRateStabilized: undefined,
      });

      const { warnings } = buildA23YieldFormula(input);
      expect(warnings.some(w => w.includes('안정화 수익률 데이터 없음'))).toBe(true);

      const buffer = (await input.pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      expect(slideXml).not.toContain('◇ 분석가정');
      expect(slideXml).not.toContain('Stabilized (안정화)');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. 비정상 입력(NaN, Infinity, undefined) 처리 무결성
  // ─────────────────────────────────────────────────────────────
  describe('3. Non-Finite Number Immunity (Poison Token Prevention)', () => {
    it('[Positive] capRateAsIs가 NaN이거나 비정상 문자열일 때 0.00%로 안전하게 폴백되어야 함', async () => {
      const input = createBaseInput({
        annualRent: NaN,
        askingPrice: NaN,
        totalDeposit: NaN,
        vacancyPct: NaN,
        capRateAsIs: 'INVALID_NUMBER',
      });

      expect(() => buildA23YieldFormula(input)).not.toThrow();

      const buffer = (await input.pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      expect(slideXml).not.toContain('>NaN<');
      expect(slideXml).not.toContain('NaN%');
      expect(slideXml).toContain('0.00%');
    });

    it('[Negative Pair] 100억 이상의 큰 금액도 fmtManwon에서 줄바꿈/NaN 없이 정상 포맷팅되어야 함', async () => {
      const input = createBaseInput({
        annualRent: 500_000_000,
        askingPrice: 23_000_000_000,
        totalDeposit: 2_900_000_000,
        capRateAsIs: 2.48,
      });

      buildA23YieldFormula(input);

      const buffer = (await input.pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      expect(slideXml).toContain('230.0억원');
      expect(slideXml).toContain('29.0억원');
      expect(slideXml).not.toContain('>NaN<');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. R9/R10: broker_plan 안정화 기대수익률(2.75%) + 한국부동산원(R-ONE) 10년 지가변동률(+3.90%) + 운영·자본 합산(6.65%)
  // ─────────────────────────────────────────────────────────────
  describe('4. R9/R10: Broker Plan Stabilized Yield & R-ONE Regional Land Price Rate Band', () => {
    it('[Positive] income-ig1-corrected 기준 안정화 기대수익률 2.75%, 영등포구 지가변동률 +3.90%, 단순 합산 6.65% 표기 및 Cap Rate 배제', async () => {
      const input = createBaseInput({
        annualRent: 233_520_000,
        askingPrice: 11_500_000_000,
        totalDeposit: 290_000_000,
        capRateAsIs: 2.08,
        capRateStabilized: 2.75,
        areaSignal: '당산권역',
        landAreaSqm: 506.81,
        landPriceHistory: {
          history: Array.from({ length: 10 }, (_, i) => ({ year: String(2016 + i), pricePerSqm: 5_000_000 + i * 300_000 })),
          latestPricePerSqm: 7_700_000,
          cagrPct: 4.5,
          totalGrowthPct: 54,
        },
        yieldSet: {
          grossYieldOnPrice: 2.03,
          grossYieldNetOfDeposit: 2.08,
          grossYieldInclOtherIncome: null,
          noiCapRate: 1.62,
          stabilized: {
            kind: 'broker_plan',
            value: 2.75,
            label: '안정화 기대수익률',
            caption: 'B1·4F 자가사용 임대 전환 가정 (B1 보증 5,000만/월 458만, 4F 보증 3,000만/월 144만 · 보증금 +8,000만원, 월세 +602만원)',
            addedRentKrw: 72_240_000,
            addedDepositKrw: 80_000_000,
            planSummary: {
              floors: ['B1', '4F'],
              addedDepositKrw: 80_000_000,
              addedMonthlyRentKrw: 6_020_000,
              newAnnualRentKrw: 305_760_000,
              newDepositKrw: 370_000_000,
              newNetPurchaseKrw: 11_130_000_000,
              units: [
                { floor: 'B1', action: 'owner_use_to_lease', deposit_manwon: 5000, rent_manwon: 458 },
                { floor: '4F', action: 'owner_use_to_lease', deposit_manwon: 3000, rent_manwon: 144 },
              ],
            },
          },
          annualRentKrw: 233_520_000,
          noiBaseKrw: 186_000_000,
          assumptions: {
            opexPct: 20,
            opexSource: 'assumed',
            vacancyReservePct: 5,
            actualVacancyPct: null,
            depositKrw: 290_000_000,
            targetRentPerPyeongManwon: null,
          },
        },
      });

      buildA23YieldFormula(input);
      const buffer = (await input.pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      expect(slideXml).toContain('안정화 기대수익률');
      expect(slideXml).toContain('2.75%');
      expect(slideXml).toContain('현행 임대수익률 (매매가−보증금 대비)');
      expect(slideXml).toContain('2.08%');
      expect(slideXml).toContain('서울 영등포구 지가변동률 10년 연평균');
      expect(slideXml).toContain('+3.90% (한국부동산원)');
      expect(slideXml).toContain('A_2024_00902');
      expect(slideXml).toContain('= 단순 합산 기대수익률 (참고)');
      expect(slideXml).toContain('6.65%');
      expect(slideXml).not.toContain('Cap Rate');
      expect(slideXml).not.toContain('중개인 제공 인근 시세');
    });
  });
});


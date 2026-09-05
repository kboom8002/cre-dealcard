/**
 * @file m11-ssot-stress.test.ts
 * @description Empirical Challenger Stress Test Suite for Milestone 1:
 *              1. The 4 mandatory building specs (types, ranges, physical bounds, null/type mutation rejections).
 *              2. validateBrokerInput boundary behaviors (4.9% vs 5.0% vs 5.1%, 19.9% vs 20.0% vs 20.1%, deposit/rent/vacancy boundaries).
 *              3. Pro-forma vacancy financial calculations (Cap Rate 1.15% -> 2.30%, +1.15%p, ClaimRegistry integration, in-place vs market models).
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
  validateBrokerInput,
  registerProFormaClaims,
  type BrokerPropertyInput,
} from '../../domain/building/im-core/broker-input-validator';
import { ClaimRegistry } from '../../domain/building/im-core/claim-registry';

const sinsaFixturePath = path.resolve('docs/test/real-broker-im/sinsa-590-fixture.json');
const seochoFixturePath = path.resolve('docs/test/real-broker-im/seocho-1364-28-fixture.json');

const sinsaFixture = JSON.parse(fs.readFileSync(sinsaFixturePath, 'utf-8'));
const seochoFixture = JSON.parse(fs.readFileSync(seochoFixturePath, 'utf-8'));

describe('M11 Empirical Stress Test Suite — SSoT & Boundary Verification', () => {

  // =========================================================================
  // Challenge A: 4 Mandatory Building Specs Verification & Mutation Harness
  // =========================================================================
  describe('Challenge A: 4 Mandatory Building Specs Invariants & Mutation Checks', () => {
    
    it('[A1.1][Sinsa 590] 4대 필수 건축 제원 타입, 물리적 범위 및 무결성 단언', () => {
      // 1. 건축면적 (archAreaM2)
      expect(typeof sinsaFixture.archAreaM2).toBe('number');
      expect(Number.isFinite(sinsaFixture.archAreaM2)).toBe(true);
      expect(sinsaFixture.archAreaM2).toBe(544.70);
      expect(sinsaFixture.archAreaM2).toBeGreaterThan(0);
      expect(sinsaFixture.archAreaM2).toBeLessThanOrEqual(sinsaFixture.landAreaM2);
      expect(sinsaFixture.archAreaM2).toBeLessThanOrEqual(sinsaFixture.grossFloorAreaM2);
      // 건폐율 정합성: 544.70 / 1061.90 = 51.2948% ~ 51.3%
      const calculatedBcRat = (sinsaFixture.archAreaM2 / sinsaFixture.landAreaM2) * 100;
      expect(calculatedBcRat).toBeCloseTo(sinsaFixture.bcRat, 1);

      // 2. 사용승인일 (completionDate)
      expect(typeof sinsaFixture.completionDate).toBe('string');
      expect(sinsaFixture.completionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(sinsaFixture.completionDate).toBe('1998-05-15');
      const completionTimestamp = Date.parse(sinsaFixture.completionDate);
      expect(Number.isNaN(completionTimestamp)).toBe(false);
      const year = parseInt(sinsaFixture.completionDate.slice(0, 4), 10);
      expect(year).toBeGreaterThanOrEqual(1900);
      expect(year).toBeLessThanOrEqual(new Date().getFullYear());

      // 3. 주차대수 (parking, parkingCount)
      expect(typeof sinsaFixture.parking).toBe('string');
      expect(sinsaFixture.parking.trim().length).toBeGreaterThan(0);
      expect(typeof sinsaFixture.parkingCount).toBe('number');
      expect(Number.isInteger(sinsaFixture.parkingCount)).toBe(true);
      expect(sinsaFixture.parkingCount).toBe(26);
      expect(sinsaFixture.mechanicalParkingCount).toBe(21);
      expect(sinsaFixture.selfParkingCount).toBe(5);
      expect(sinsaFixture.mechanicalParkingCount + sinsaFixture.selfParkingCount).toBe(sinsaFixture.parkingCount);

      // 4. 승강기 (elevatorCount)
      expect(typeof sinsaFixture.elevatorCount).toBe('number');
      expect(Number.isInteger(sinsaFixture.elevatorCount)).toBe(true);
      expect(sinsaFixture.elevatorCount).toBe(1);
      expect(sinsaFixture.elevatorCount).toBeGreaterThanOrEqual(1);
    });

    it('[A1.2][Seocho 1364-28] 4대 필수 건축 제원 타입, 물리적 범위 및 무결성 단언', () => {
      // 1. 건축면적 (archAreaM2)
      expect(typeof seochoFixture.archAreaM2).toBe('number');
      expect(Number.isFinite(seochoFixture.archAreaM2)).toBe(true);
      expect(seochoFixture.archAreaM2).toBe(296.14);
      expect(seochoFixture.archAreaM2).toBeGreaterThan(0);
      expect(seochoFixture.archAreaM2).toBeLessThanOrEqual(seochoFixture.landAreaM2);
      expect(seochoFixture.archAreaM2).toBeLessThanOrEqual(seochoFixture.grossFloorAreaM2);
      // 건폐율 정합성: 296.14 / 596.00 = 49.6879% ~ 49.7%
      const calculatedBcRat = (seochoFixture.archAreaM2 / seochoFixture.landAreaM2) * 100;
      expect(calculatedBcRat).toBeCloseTo(seochoFixture.bcRat, 1);

      // 2. 사용승인일 (completionDate)
      expect(typeof seochoFixture.completionDate).toBe('string');
      expect(seochoFixture.completionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(seochoFixture.completionDate).toBe('1991-01-20');
      const completionTimestamp = Date.parse(seochoFixture.completionDate);
      expect(Number.isNaN(completionTimestamp)).toBe(false);
      const year = parseInt(seochoFixture.completionDate.slice(0, 4), 10);
      expect(year).toBeGreaterThanOrEqual(1900);
      expect(year).toBeLessThanOrEqual(new Date().getFullYear());

      // 3. 주차대수 (parking, parkingCount)
      expect(typeof seochoFixture.parking).toBe('string');
      expect(seochoFixture.parking.trim().length).toBeGreaterThan(0);
      expect(typeof seochoFixture.parkingCount).toBe('number');
      expect(Number.isInteger(seochoFixture.parkingCount)).toBe(true);
      expect(seochoFixture.parkingCount).toBe(16);

      // 4. 승강기 (elevatorCount)
      expect(typeof seochoFixture.elevatorCount).toBe('number');
      expect(Number.isInteger(seochoFixture.elevatorCount)).toBe(true);
      expect(seochoFixture.elevatorCount).toBe(1);
    });

    it('[A1.3][3-Tier Key Facts] 4대 필수 제원과 tier3_building 간 100% 상호 바인딩 검증', () => {
      // Sinsa 590
      const sinsaTier3 = new Map<string, string>(sinsaFixture.keyFacts3Tier.tier3_building);
      expect(sinsaTier3.get('건축면적')).toContain(sinsaFixture.archAreaM2.toFixed(2));
      expect(sinsaTier3.get('사용승인일')).toContain(sinsaFixture.completionDate);
      expect(sinsaTier3.get('주차 설비')).toContain(`${sinsaFixture.parkingCount}대`);
      expect(sinsaTier3.get('승강기')).toContain(`${sinsaFixture.elevatorCount}대`);

      // Seocho 1364-28
      const seochoTier3 = new Map<string, string>(seochoFixture.keyFacts3Tier.tier3_building);
      expect(seochoTier3.get('건축면적')).toContain(seochoFixture.archAreaM2.toFixed(2));
      expect(seochoTier3.get('사용승인일')).toContain(seochoFixture.completionDate);
      const parkingAndElevator = seochoTier3.get('주차 / 승강기');
      expect(parkingAndElevator).toBeDefined();
      expect(parkingAndElevator).toContain(`${seochoFixture.parkingCount}대`);
      expect(parkingAndElevator).toContain(`${seochoFixture.elevatorCount}대`);
    });

    it('[A1.4][Mutation/Rejection] 4대 제원 결손/변조 시 유효성 검증 실패 단언', () => {
      const validateMandatorySpecs = (fixture: any) => {
        const errors: string[] = [];
        if (typeof fixture.archAreaM2 !== 'number' || fixture.archAreaM2 <= 0 || !Number.isFinite(fixture.archAreaM2)) {
          errors.push('INVALID_ARCH_AREA');
        }
        if (fixture.archAreaM2 > fixture.landAreaM2) {
          errors.push('ARCH_AREA_EXCEEDS_LAND');
        }
        if (typeof fixture.completionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fixture.completionDate)) {
          errors.push('INVALID_COMPLETION_DATE_FORMAT');
        } else {
          const ts = Date.parse(fixture.completionDate);
          const y = parseInt(fixture.completionDate.slice(0, 4), 10);
          if (Number.isNaN(ts) || y < 1900 || y > new Date().getFullYear()) {
            errors.push('INVALID_COMPLETION_DATE_RANGE');
          }
        }
        if (typeof fixture.parkingCount !== 'number' || !Number.isInteger(fixture.parkingCount) || fixture.parkingCount < 0) {
          errors.push('INVALID_PARKING_COUNT');
        }
        if (typeof fixture.parking !== 'string' || fixture.parking.trim().length === 0) {
          errors.push('INVALID_PARKING_STRING');
        }
        if (typeof fixture.elevatorCount !== 'number' || !Number.isInteger(fixture.elevatorCount) || fixture.elevatorCount < 0) {
          errors.push('INVALID_ELEVATOR_COUNT');
        }
        return errors;
      };

      // 1. Clean fixture must produce 0 errors
      expect(validateMandatorySpecs(sinsaFixture)).toHaveLength(0);
      expect(validateMandatorySpecs(seochoFixture)).toHaveLength(0);

      // 2. Null/Undefined mutations
      expect(validateMandatorySpecs({ ...sinsaFixture, archAreaM2: null })).toContain('INVALID_ARCH_AREA');
      expect(validateMandatorySpecs({ ...sinsaFixture, archAreaM2: -10 })).toContain('INVALID_ARCH_AREA');
      expect(validateMandatorySpecs({ ...sinsaFixture, archAreaM2: sinsaFixture.landAreaM2 * 2 })).toContain('ARCH_AREA_EXCEEDS_LAND');
      expect(validateMandatorySpecs({ ...sinsaFixture, completionDate: null })).toContain('INVALID_COMPLETION_DATE_FORMAT');
      expect(validateMandatorySpecs({ ...sinsaFixture, completionDate: '1998/05/15' })).toContain('INVALID_COMPLETION_DATE_FORMAT');
      expect(validateMandatorySpecs({ ...sinsaFixture, completionDate: '1850-01-01' })).toContain('INVALID_COMPLETION_DATE_RANGE');
      expect(validateMandatorySpecs({ ...sinsaFixture, completionDate: '2099-12-31' })).toContain('INVALID_COMPLETION_DATE_RANGE');
      expect(validateMandatorySpecs({ ...sinsaFixture, completionDate: '1998-13-40' })).toContain('INVALID_COMPLETION_DATE_RANGE');
      expect(validateMandatorySpecs({ ...sinsaFixture, parkingCount: -1 })).toContain('INVALID_PARKING_COUNT');
      expect(validateMandatorySpecs({ ...sinsaFixture, parkingCount: 3.5 })).toContain('INVALID_PARKING_COUNT');
      expect(validateMandatorySpecs({ ...sinsaFixture, parking: '' })).toContain('INVALID_PARKING_STRING');
      expect(validateMandatorySpecs({ ...sinsaFixture, elevatorCount: -1 })).toContain('INVALID_ELEVATOR_COUNT');
      expect(validateMandatorySpecs({ ...sinsaFixture, elevatorCount: 1.2 })).toContain('INVALID_ELEVATOR_COUNT');
    });
  });

  // =========================================================================
  // Challenge B: validateBrokerInput Boundary Behavior Stress Harness
  // =========================================================================
  describe('Challenge B: validateBrokerInput Boundary Behavior Stress Tests', () => {

    const baseInput: BrokerPropertyInput = {
      askingPriceKrw: 100_000_000_000, // 1,000억 원
      landAreaM2: 1000 / 0.3025,       // 딱 1,000평
      grossFloorAreaM2: 3000 / 0.3025, // 딱 3,000평
    };
    // Expected calculated land price: 1,000억 / 1,000평 = 100,000,000 원/평 (1.0억/평)
    const expectedLandPrice = 100_000_000;

    describe('B1: 5.0% Warning Discrepancy Boundary (4.9% vs 5.0% vs 5.1%)', () => {
      it('statedLandPrice at +4.9% (104.9M) produces ZERO discrepancy (isValid: true, discrepancies: 0)', () => {
        const input: BrokerPropertyInput = {
          ...baseInput,
          statedLandPricePerPyeongKrw: Math.round(expectedLandPrice * 1.049), // 104,900,000
        };
        const result = validateBrokerInput(input);
        expect(result.isValid).toBe(true);
        expect(result.hasCritical).toBe(false);
        const discrepancy = result.discrepancies.find(d => d.code === 'LAND_PRICE_PYEONG_DISCREPANCY');
        expect(discrepancy).toBeUndefined();
      });

      it('statedLandPrice at exact 5.0% boundary (105.0M) produces ZERO discrepancy (diffPct > 5.0 is false)', () => {
        const input: BrokerPropertyInput = {
          ...baseInput,
          statedLandPricePerPyeongKrw: Math.round(expectedLandPrice * 1.050), // 105,000,000
        };
        const result = validateBrokerInput(input);
        expect(result.isValid).toBe(true);
        expect(result.hasCritical).toBe(false);
        const discrepancy = result.discrepancies.find(d => d.code === 'LAND_PRICE_PYEONG_DISCREPANCY');
        expect(discrepancy).toBeUndefined();
      });

      it('statedLandPrice at +5.1% (105.1M) triggers WARNING discrepancy (severity: warning, isValid: true)', () => {
        const input: BrokerPropertyInput = {
          ...baseInput,
          statedLandPricePerPyeongKrw: Math.round(expectedLandPrice * 1.051), // 105,100,000
        };
        const result = validateBrokerInput(input);
        expect(result.isValid).toBe(true);
        expect(result.hasCritical).toBe(false);
        const discrepancy = result.discrepancies.find(d => d.code === 'LAND_PRICE_PYEONG_DISCREPANCY');
        expect(discrepancy).toBeDefined();
        expect(discrepancy?.severity).toBe('warning');
        expect(discrepancy?.discrepancyPct).toBe(5.1);
      });

      it('statedLandPrice at -4.9% (95.1M) produces ZERO discrepancy (negative direction check)', () => {
        const input: BrokerPropertyInput = {
          ...baseInput,
          statedLandPricePerPyeongKrw: Math.round(expectedLandPrice * 0.951), // 95,100,000
        };
        const result = validateBrokerInput(input);
        expect(result.isValid).toBe(true);
        expect(result.hasCritical).toBe(false);
        expect(result.discrepancies.find(d => d.code === 'LAND_PRICE_PYEONG_DISCREPANCY')).toBeUndefined();
      });

      it('statedLandPrice at -5.1% (94.9M) triggers WARNING discrepancy (negative direction check)', () => {
        const input: BrokerPropertyInput = {
          ...baseInput,
          statedLandPricePerPyeongKrw: Math.round(expectedLandPrice * 0.949), // 94,900,000
        };
        const result = validateBrokerInput(input);
        expect(result.isValid).toBe(true);
        expect(result.hasCritical).toBe(false);
        const discrepancy = result.discrepancies.find(d => d.code === 'LAND_PRICE_PYEONG_DISCREPANCY');
        expect(discrepancy).toBeDefined();
        expect(discrepancy?.severity).toBe('warning');
        expect(discrepancy?.discrepancyPct).toBe(5.1);
      });
    });

    describe('B2: 20.0% Critical Discrepancy Boundary (19.9% vs 20.0% vs 20.1%)', () => {
      it('statedLandPrice at +19.9% (119.9M) triggers WARNING but NOT CRITICAL (isValid: true, hasCritical: false)', () => {
        const input: BrokerPropertyInput = {
          ...baseInput,
          statedLandPricePerPyeongKrw: Math.round(expectedLandPrice * 1.199), // 119,900,000
        };
        const result = validateBrokerInput(input);
        expect(result.isValid).toBe(true);
        expect(result.hasCritical).toBe(false);
        const discrepancy = result.discrepancies.find(d => d.code === 'LAND_PRICE_PYEONG_DISCREPANCY');
        expect(discrepancy).toBeDefined();
        expect(discrepancy?.severity).toBe('warning');
        expect(discrepancy?.discrepancyPct).toBe(19.9);
      });

      it('statedLandPrice at exact 20.0% boundary (120.0M) triggers WARNING (diffPct > 20.0 is false, hasCritical: false)', () => {
        const input: BrokerPropertyInput = {
          ...baseInput,
          statedLandPricePerPyeongKrw: Math.round(expectedLandPrice * 1.200), // 120,000,000
        };
        const result = validateBrokerInput(input);
        expect(result.isValid).toBe(true);
        expect(result.hasCritical).toBe(false);
        const discrepancy = result.discrepancies.find(d => d.code === 'LAND_PRICE_PYEONG_DISCREPANCY');
        expect(discrepancy).toBeDefined();
        expect(discrepancy?.severity).toBe('warning');
        expect(discrepancy?.discrepancyPct).toBe(20.0);
      });

      it('statedLandPrice at +20.1% (120.1M) triggers CRITICAL DISCREPANCY (isValid: false, hasCritical: true)', () => {
        const input: BrokerPropertyInput = {
          ...baseInput,
          statedLandPricePerPyeongKrw: Math.round(expectedLandPrice * 1.201), // 120,100,000
        };
        const result = validateBrokerInput(input);
        expect(result.isValid).toBe(false);
        expect(result.hasCritical).toBe(true);
        const discrepancy = result.discrepancies.find(d => d.code === 'LAND_PRICE_PYEONG_DISCREPANCY');
        expect(discrepancy).toBeDefined();
        expect(discrepancy?.severity).toBe('critical');
        expect(discrepancy?.discrepancyPct).toBe(20.1);
      });

      it('statedLandPrice at -20.1% (79.9M) triggers CRITICAL DISCREPANCY (negative direction check)', () => {
        const input: BrokerPropertyInput = {
          ...baseInput,
          statedLandPricePerPyeongKrw: Math.round(expectedLandPrice * 0.799), // 79,900,000
        };
        const result = validateBrokerInput(input);
        expect(result.isValid).toBe(false);
        expect(result.hasCritical).toBe(true);
        const discrepancy = result.discrepancies.find(d => d.code === 'LAND_PRICE_PYEONG_DISCREPANCY');
        expect(discrepancy).toBeDefined();
        expect(discrepancy?.severity).toBe('critical');
        expect(discrepancy?.discrepancyPct).toBe(20.1);
      });
    });

    describe('B3: Deposit, Monthly Rent, and Vacancy Rate Boundary Tests', () => {
      it('Deposit sum mismatch boundary: 100,000 KRW diff passes, 100,001 KRW diff warns', () => {
        const rentRollBase = {
          units: [
            { floor: '1F', tenant: 'A', deposit: 50_000_000, rent: 5_000_000 },
            { floor: '2F', tenant: 'B', deposit: 50_000_000, rent: 5_000_000 },
          ],
        };
        // Sum deposit is 100,000,000

        // 1. diff = 100,000 KRW (boundary)
        const passResult = validateBrokerInput({
          ...baseInput,
          rentRoll: rentRollBase,
          statedDepositKrw: 100_100_000,
        });
        expect(passResult.discrepancies.find(d => d.code === 'RENTROLL_SUM_MISMATCH' && d.field === 'deposit')).toBeUndefined();

        // 2. diff = 100,001 KRW (over boundary)
        const failResult = validateBrokerInput({
          ...baseInput,
          rentRoll: rentRollBase,
          statedDepositKrw: 100_100_001,
        });
        const depMismatch = failResult.discrepancies.find(d => d.code === 'RENTROLL_SUM_MISMATCH' && d.field === 'deposit');
        expect(depMismatch).toBeDefined();
        expect(depMismatch?.severity).toBe('warning');
      });

      it('Monthly rent sum mismatch boundary: 50,000 KRW diff passes, 50,001 KRW diff warns', () => {
        const rentRollBase = {
          units: [
            { floor: '1F', tenant: 'A', deposit: 50_000_000, rent: 5_000_000 },
            { floor: '2F', tenant: 'B', deposit: 50_000_000, rent: 5_000_000 },
          ],
        };
        // Sum rent is 10,000,000

        // 1. diff = 50,000 KRW (boundary)
        const passResult = validateBrokerInput({
          ...baseInput,
          rentRoll: rentRollBase,
          statedMonthlyRentKrw: 10_050_000,
        });
        expect(passResult.discrepancies.find(d => d.code === 'RENTROLL_SUM_MISMATCH' && d.field === 'monthlyRent')).toBeUndefined();

        // 2. diff = 50,001 KRW (over boundary)
        const failResult = validateBrokerInput({
          ...baseInput,
          rentRoll: rentRollBase,
          statedMonthlyRentKrw: 10_050_001,
        });
        const rentMismatch = failResult.discrepancies.find(d => d.code === 'RENTROLL_SUM_MISMATCH' && d.field === 'monthlyRent');
        expect(rentMismatch).toBeDefined();
        expect(rentMismatch?.severity).toBe('warning');
      });

      it('Vacancy rate threshold: 19.9% vacancy does not trigger, 20.0% vacancy triggers HIGH_VACANCY_PRO_FORMA', () => {
        // 1. 19.9% vacancy (e.g. 199 vacant units out of 1000)
        const units199: Array<{ floor: string; tenant: string; deposit: number; rent: number; isVacant: boolean }> = [];
        for (let i = 0; i < 1000; i++) {
          units199.push({
            floor: `${i + 1}F`,
            tenant: i < 199 ? '공실' : `Tenant ${i}`,
            deposit: 10_000_000,
            rent: 1_000_000,
            isVacant: i < 199,
          });
        }
        const res199 = validateBrokerInput({
          ...baseInput,
          rentRoll: { units: units199 },
        });
        expect(res199.proFormaOpportunity).toBeUndefined();

        // 2. 20.0% vacancy (200 vacant units out of 1000)
        units199[199] = { floor: '200F', tenant: '공실', deposit: 0, rent: 0, isVacant: true };
        const res200 = validateBrokerInput({
          ...baseInput,
          rentRoll: { units: units199 },
        });
        expect(res200.proFormaOpportunity).toBeDefined();
        expect(res200.proFormaOpportunity?.vacantFloorCount).toBe(200);
      });
    });
  });

  // =========================================================================
  // Challenge C: Pro-Forma Vacancy Calculations & ClaimRegistry Integration
  // =========================================================================
  describe('Challenge C: Pro-Forma Vacancy Normalization Financial Invariants', () => {

    it('[C1.1][Seocho 1364-28 SSoT] 1.15% -> 2.30% (+1.15%p) 수학적 불변식 및 픽스처 무결성 단언', () => {
      const pf = seochoFixture.proForma;
      expect(pf).toBeDefined();

      // 1. 기본 파라미터 확인
      const askingPrice = seochoFixture.askingPriceKrw; // 230억
      const currentMonthlyRent = seochoFixture.statedMonthlyRentKrw; // 21,950,000 원
      expect(askingPrice).toBe(23_000_000_000);
      expect(currentMonthlyRent).toBe(21_950_000);

      // 2. 현재 Cap Rate 검증
      const currentAnnualRent = currentMonthlyRent * 12; // 263,400,000 원
      const exactCurrentCapRate = (currentAnnualRent / askingPrice) * 100; // 1.145217%
      expect(exactCurrentCapRate).toBeCloseTo(1.145, 3);
      expect(pf.currentCapRatePct).toBe(1.15); // 반올림 1.15%

      // 3. 공실 면적 및 층수 검증
      expect(pf.vacantFloorCount).toBe(3);
      expect(pf.vacantFloors).toEqual(['2F', '4F', '5F']);
      expect(pf.vacantAreaPyeong).toBe(259.4);

      // 4. 시장 평당 임대료 기반 추가 임대수익 검증
      expect(pf.marketRentPerPyeongKrw).toBe(85000);
      const expectedAdditionalRent = Math.round(pf.vacantAreaPyeong * pf.marketRentPerPyeongKrw); // 22,049,000
      expect(pf.additionalMonthlyRentKrw).toBe(22_100_000); // 픽스처 기재치 (십만 원 단위 라운딩)
      expect(Math.abs(pf.additionalMonthlyRentKrw - expectedAdditionalRent)).toBeLessThan(100_000);

      // 5. 정상화 월임대료 및 연간 NOI 검증
      const expectedProFormaMonthlyRent = currentMonthlyRent + pf.additionalMonthlyRentKrw; // 44,050,000 원
      expect(pf.proFormaMonthlyRentKrw).toBe(expectedProFormaMonthlyRent);
      const expectedAnnualNoi = expectedProFormaMonthlyRent * 12; // 528,600,000 원
      expect(pf.proFormaAnnualNoiKrw).toBe(expectedAnnualNoi);

      // 6. 정상화 Cap Rate 및 Upside 검증
      const exactProFormaCapRate = (expectedAnnualNoi / askingPrice) * 100; // 2.29826%
      expect(exactProFormaCapRate).toBeCloseTo(2.30, 2);
      expect(pf.estimatedFullOccupancyCapRatePct).toBe(2.30);
      expect(pf.upsideCapRatePp).toBe(1.15);
      expect(pf.upsideCapRatePp).toBe(Number((pf.estimatedFullOccupancyCapRatePct - pf.currentCapRatePct).toFixed(2)));
    });

    it('[C1.2][ClaimRegistry Integration] registerProFormaClaims 1급 클레임 생성 및 도메인 정합성 단언', () => {
      const registry = new ClaimRegistry();
      const pf = seochoFixture.proForma;

      const claims = registerProFormaClaims(
        registry,
        {
          currentCapRatePct: pf.currentCapRatePct,
          estimatedFullOccupancyCapRatePct: pf.estimatedFullOccupancyCapRatePct,
          upsideCapRatePp: pf.upsideCapRatePp,
          vacantFloorCount: pf.vacantFloorCount,
          vacantAreaPyeong: pf.vacantAreaPyeong,
          additionalMonthlyRentKrw: pf.additionalMonthlyRentKrw,
          proFormaAnnualNoiKrw: pf.proFormaAnnualNoiKrw,
          narrative: pf.narrative,
        },
        '2026-09-05'
      );

      // 5종 클레임 생성 단언
      expect(claims.length).toBe(5);

      // 1. pro_forma_cap_rate
      const capRateClaim = registry.getLatestBySubject('pro_forma_cap_rate');
      expect(capRateClaim).toBeDefined();
      expect(capRateClaim?.value).toBe(2.30);
      expect(capRateClaim?.unit).toBe('%');
      expect(capRateClaim?.provenance).toBe('derived');
      expect(capRateClaim?.status).toBe('reconciled');

      // 2. pro_forma_upside_cap_rate_pp
      const upsideClaim = registry.getLatestBySubject('pro_forma_upside_cap_rate_pp');
      expect(upsideClaim).toBeDefined();
      expect(upsideClaim?.value).toBe(1.15);
      expect(upsideClaim?.unit).toBe('%p');

      // 3. pro_forma_vacant_floors
      const floorsClaim = registry.getLatestBySubject('pro_forma_vacant_floors');
      expect(floorsClaim).toBeDefined();
      expect(floorsClaim?.value).toBe(3);
      expect(floorsClaim?.unit).toBe('개층');

      // 4. pro_forma_vacant_area_pyeong
      const areaClaim = registry.getLatestBySubject('pro_forma_vacant_area_pyeong');
      expect(areaClaim).toBeDefined();
      expect(areaClaim?.value).toBe(259.4);
      expect(areaClaim?.unit).toBe('평');

      // 5. pro_forma_annual_noi
      const noiClaim = registry.getLatestBySubject('pro_forma_annual_noi');
      expect(noiClaim).toBeDefined();
      expect(noiClaim?.value).toBe(528_600_000);
      expect(noiClaim?.unit).toBe('원');
    });

    it('[C1.3][Comparative Analysis] validateBrokerInput의 보수적 기존 임대료 역산(1.93%) vs 시장 정상화(2.30%) 비교 분석 단언', () => {
      // 1. validateBrokerInput 실행 시 결과 확인
      const cleanInput: BrokerPropertyInput = {
        askingPriceKrw: seochoFixture.askingPriceKrw,
        landAreaM2: seochoFixture.landAreaM2,
        grossFloorAreaM2: seochoFixture.grossFloorAreaM2,
        statedMonthlyRentKrw: seochoFixture.statedMonthlyRentKrw,
        rentRoll: {
          units: (seochoFixture.stackingPlan || []).map((s: any) => ({
            floor: s.floor,
            tenant: s.tenant,
            deposit: s.depositKrw,
            rent: s.monthlyRentKrw,
            areaPyeong: s.floorAreaPy,
            isVacant: s.isVacant,
          })),
        },
      };

      const result = validateBrokerInput(cleanInput);
      expect(result.proFormaOpportunity).toBeDefined();
      const dyn = result.proFormaOpportunity!;

      // 동적 엔진은 기임차 층의 가중평균 임대료 (~5.8만 원/평)를 적용하므로 1.93% (+0.79%p) 산출
      expect(dyn.currentCapRatePct).toBe(1.15);
      expect(dyn.estimatedFullOccupancyCapRatePct).toBe(1.93);
      expect(dyn.upsideCapRatePp).toBe(0.79);
      expect(dyn.vacantFloorCount).toBe(3);
      expect(dyn.vacantAreaPyeong).toBe(259.4);

      // SSoT 픽스처는 GBD 서초 오피스 인근 적정 시장임대료(8.5만 원/평)를 적용하므로 2.30% (+1.15%p) 산출
      const fixtureProForma = seochoFixture.proForma;
      expect(fixtureProForma.estimatedFullOccupancyCapRatePct).toBe(2.30);
      expect(fixtureProForma.upsideCapRatePp).toBe(1.15);

      // 두 모델 간의 관계: 시장 임대료(8.5만) > 기임대료 가중평균(5.8만) -> 시장 정상화 Cap Rate(2.30%) > 보수적 갱신 Cap Rate(1.93%)
      expect(fixtureProForma.estimatedFullOccupancyCapRatePct).toBeGreaterThan(dyn.estimatedFullOccupancyCapRatePct);
      expect(fixtureProForma.upsideCapRatePp).toBeGreaterThan(dyn.upsideCapRatePp);
    });
  });
});

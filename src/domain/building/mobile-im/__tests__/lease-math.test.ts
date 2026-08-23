// src/domain/building/mobile-im/__tests__/lease-math.test.ts
import { describe, it, expect } from 'vitest';
import {
  commercialVacatePoint,
  residentialVacatePoint,
  resolveLedger,
  resolveCapabilities,
} from '../lease-math';
import type { LeaseRow } from '@/types/im';

describe('Lease Math & Vacate Schedule Contracts (Phase 2-2)', () => {
  const asOf = new Date('2026-08-23');

  describe('commercialVacatePoint (상임법 최초계약 10년)', () => {
    it('LM-01: calculates 10-year expiration from firstContractDate', () => {
      const row: LeaseRow = {
        unitLabel: '101호',
        tenantBusiness: '스타벅스',
        depositKrw: 100_000_000,
        monthlyRentKrw: 5_000_000,
        currentExpiryDate: '2027-05-15',
        leaseState: '임대중',
        contractGroup: null,
        leaseAreaSqm: 100,
        legalBasis: '상가',
        mgmtFeeKrw: 500_000,
        currentStartDate: '2025-05-15',
        firstContractDate: '2019-05-15',
        renewalExercised: null,
        opposingPower: '사업자등록',
        note: null,
      };

      const verdict = commercialVacatePoint(row, asOf);
      expect(verdict.state).toBe('determined');
      if (verdict.state === 'determined') {
        expect(verdict.at).toBe('2029-05-15'); // 2019 + 10년
        expect(verdict.reason).toContain('상임법 10년');
      }
    });

    it('LM-02: returns unknown when firstContractDate is missing', () => {
      const row: LeaseRow = {
        unitLabel: '102호',
        tenantBusiness: '편의점',
        depositKrw: 50_000_000,
        monthlyRentKrw: 3_000_000,
        currentExpiryDate: '2027-01-01',
        leaseState: '임대중',
        contractGroup: null,
        leaseAreaSqm: 50,
        legalBasis: '상가',
        mgmtFeeKrw: 300_000,
        currentStartDate: '2025-01-01',
        firstContractDate: null,
        renewalExercised: null,
        opposingPower: '사업자등록',
        note: null,
      };

      const verdict = commercialVacatePoint(row, asOf);
      expect(verdict.state).toBe('unknown');
      if (verdict.state === 'unknown') {
        expect(verdict.reason).toContain('최초 계약일');
      }
    });
  });

  describe('residentialVacatePoint (주임법 1회 +2년)', () => {
    it('LM-03: returns current expiry date when renewal is already exercised', () => {
      const row: LeaseRow = {
        unitLabel: '201호',
        tenantBusiness: '주거 임차인',
        depositKrw: 200_000_000,
        monthlyRentKrw: 1_000_000,
        currentExpiryDate: '2026-12-31',
        leaseState: '임대중',
        contractGroup: null,
        leaseAreaSqm: 60,
        legalBasis: '주택',
        mgmtFeeKrw: 100_000,
        currentStartDate: '2024-12-31',
        firstContractDate: '2022-12-31',
        renewalExercised: '있음', // 1회 소진
        opposingPower: '주민등록',
        note: null,
      };

      const verdict = residentialVacatePoint(row, asOf);
      expect(verdict.state).toBe('determined');
      if (verdict.state === 'determined') {
        expect(verdict.at).toBe('2026-12-31');
        expect(verdict.reason).toContain('소진');
      }
    });

    it('LM-04: returns +2 years when renewal is not exercised yet', () => {
      const row: LeaseRow = {
        unitLabel: '202호',
        tenantBusiness: '주거 임차인',
        depositKrw: 200_000_000,
        monthlyRentKrw: 1_000_000,
        currentExpiryDate: '2026-12-31',
        leaseState: '임대중',
        contractGroup: null,
        leaseAreaSqm: 60,
        legalBasis: '주택',
        mgmtFeeKrw: 100_000,
        currentStartDate: '2024-12-31',
        firstContractDate: '2024-12-31',
        renewalExercised: '없음', // 미행사 (+2년 가능)
        opposingPower: '주민등록',
        note: null,
      };

      const verdict = residentialVacatePoint(row, asOf);
      expect(verdict.state).toBe('determined');
      if (verdict.state === 'determined') {
        expect(verdict.at).toBe('2028-12-31'); // 2026 + 2년
      }
    });

    it('LM-05: returns unknown when renewal history is unknown', () => {
      const row: LeaseRow = {
        unitLabel: '203호',
        tenantBusiness: '주거 임차인',
        depositKrw: 150_000_000,
        monthlyRentKrw: 800_000,
        currentExpiryDate: '2027-03-31',
        leaseState: '임대중',
        contractGroup: null,
        leaseAreaSqm: 50,
        legalBasis: '주택',
        mgmtFeeKrw: 80_000,
        currentStartDate: '2025-03-31',
        firstContractDate: null,
        renewalExercised: '모름',
        opposingPower: '주민등록',
        note: null,
      };

      const verdict = residentialVacatePoint(row, asOf);
      expect(verdict.state).toBe('unknown');
    });
  });

  describe('resolveLedger (R0-R3 해상도 판정)', () => {
    it('LM-06: R1 minimum resolution', () => {
      const rows: LeaseRow[] = [{
        unitLabel: '101호',
        tenantBusiness: '카페',
        depositKrw: 30_000_000,
        monthlyRentKrw: 2_000_000,
        currentExpiryDate: '2027-01-01',
        leaseState: '임대중',
        contractGroup: null,
        leaseAreaSqm: null,
        legalBasis: null,
        mgmtFeeKrw: null,
        currentStartDate: null,
        firstContractDate: null,
        renewalExercised: null,
        opposingPower: null,
        note: null,
      }];
      expect(resolveLedger(rows)).toBe('R1');
    });

    it('LM-07: R3 full resolution', () => {
      const rows: LeaseRow[] = [{
        unitLabel: '101호',
        tenantBusiness: '카페',
        depositKrw: 30_000_000,
        monthlyRentKrw: 2_000_000,
        currentExpiryDate: '2027-01-01',
        leaseState: '임대중',
        contractGroup: null,
        leaseAreaSqm: 50,
        legalBasis: '상가',
        mgmtFeeKrw: 200_000,
        currentStartDate: '2025-01-01',
        firstContractDate: '2020-01-01',
        renewalExercised: '없음',
        opposingPower: '사업자등록',
        note: null,
      }];
      expect(resolveLedger(rows)).toBe('R3');
    });
  });
});

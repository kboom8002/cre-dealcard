/**
 * @file src/tests/im-simple/rent-roll-tsv-paste.test.ts
 * @description Milestone 5 Test Suite: R1 Rent Roll TSV Clipboard Paste & Parser
 *
 * Requirements:
 * 1. TSV Multi-Cell Paste Parsing:
 *    - Parses tab-separated and newline-separated rows from Excel / Google Sheets.
 *    - Automatically handles header row detection (e.g. 층/호수/보증금/월세).
 *    - Supports various column counts (5, 6, 7, 8 columns).
 *    - Normalizes floor names (지하1층 -> B1, 1층 -> 1F, b2 -> B2).
 *    - Resolves status accurately (공실 -> vacant, 자가 -> owner, 임대중 -> occupied).
 * 2. Unit Mistake Warning & Auto-Correction:
 *    - Detects when numbers are pasted in raw KRW instead of 만 원 (e.g. 50,000,000 vs 5,000).
 *    - Flags unitMistakeWarning and sets hasUnitMistakes = true.
 *    - Converts raw KRW to 만 원 units (50,000,000 -> 5,000만 원).
 * 3. Korean Currency Readout:
 *    - Formats manwon values into senior-friendly readable Korean string with '= ' prefix.
 *    - e.g. 5,000 -> "= 5,000만 원", 12,000 -> "= 1억 2,000만 원", 100,000 -> "= 10억 원".
 * 4. Flexible Lease-Expiry Date Parser:
 *    - Parses multiple Korean & numeric date formats: '2027.05', '27년 5월', '27/05/31', '27.3', '만기 2년', '2705', '273'.
 *    - Flags expired dates with warning '만기 지남, 연장 확인' and isExpired = true.
 *
 * Authoritative Sources:
 * - docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §4.3 (WP-P3-03, WP-P3-06)
 * - PROJECT.md (Milestone 5, Feature 49, 50, 53)
 * - TEST_INFRA.md (§ Feature Inventory #11, §8 Test Matrix #23)
 */

import { describe, it, expect } from 'vitest';
import {
  parseTsvRentRoll,
  parseManwonAmount,
  formatKoreanCurrencyReadout,
  normalizeFloorName,
} from '@/lib/rent-roll/tsv-parser';
import { parseLeaseExpiryDate } from '@/lib/rent-roll/date-parser';

describe('M5 IM Simple: Rent Roll TSV Paste & Formatting (WP-P3-03 & WP-P3-06)', () => {
  describe('1. TSV Multi-cell Clipboard Paste Parsing', () => {
    it('parses standard 8-column TSV clipboard paste with headers', () => {
      const sampleTsv = [
        '층\t호수\t업종\t보증금\t월세\t관리비\t만기일\t상태',
        'B1\tB01호\t주차장/창고\t1000\t80\t10\t2026.12\t임대중',
        '1F\t101호\t스타벅스\t5000\t450\t50\t2028.05\t임대중',
        '2F\t201호\t치과의원\t3000\t280\t30\t27년 3월\t임대중',
        '3F\t301호\t공실\t0\t0\t0\t-\t공실',
        '4F\t401호\t사옥 직영\t0\t0\t0\t-\t자가',
      ].join('\n');

      const result = parseTsvRentRoll(sampleTsv);

      expect(result.rows.length).toBe(5);
      expect(result.hasUnitMistakes).toBe(false);

      // Row 1 (B1)
      expect(result.rows[0].floor).toBe('B1');
      expect(result.rows[0].unit).toBe('B01호');
      expect(result.rows[0].depositManwon).toBe(1000);
      expect(result.rows[0].monthlyRentManwon).toBe(80);
      expect(result.rows[0].status).toBe('occupied');

      // Row 2 (1F)
      expect(result.rows[1].floor).toBe('1F');
      expect(result.rows[1].use).toBe('스타벅스');
      expect(result.rows[1].depositManwon).toBe(5000);
      expect(result.rows[1].monthlyRentManwon).toBe(450);
      expect(result.rows[1].maintenanceManwon).toBe(50);

      // Row 4 (3F - Vacant)
      expect(result.rows[3].floor).toBe('3F');
      expect(result.rows[3].status).toBe('vacant');
      expect(result.rows[3].monthlyRentManwon).toBe(0);

      // Row 5 (4F - Owner occupied)
      expect(result.rows[4].floor).toBe('4F');
      expect(result.rows[4].status).toBe('owner');

      // Totals
      expect(result.totalDepositManwon).toBe(1000 + 5000 + 3000 + 0 + 0);
      expect(result.totalMonthlyRentManwon).toBe(80 + 450 + 280 + 0 + 0);
      expect(result.totalMaintenanceManwon).toBe(10 + 50 + 30 + 0 + 0);
    });

    it('parses TSV paste without header row correctly', () => {
      const sampleTsv = [
        '1층\t약국\t10000\t800\t60\t2029.04',
        '2층\t이비인후과\t5000\t400\t40\t2027.10',
      ].join('\r\n');

      const result = parseTsvRentRoll(sampleTsv);

      expect(result.rows.length).toBe(2);
      expect(result.rows[0].floor).toBe('1F');
      expect(result.rows[0].use).toBe('약국');
      expect(result.rows[0].depositManwon).toBe(10000);
      expect(result.rows[0].monthlyRentManwon).toBe(800);

      expect(result.rows[1].floor).toBe('2F');
      expect(result.rows[1].depositManwon).toBe(5000);
    });

    it('normalizes Korean floor designations (지하1층, 2층, b2)', () => {
      expect(normalizeFloorName('지하 1층')).toBe('B1');
      expect(normalizeFloorName('지하2층')).toBe('B2');
      expect(normalizeFloorName('1층')).toBe('1F');
      expect(normalizeFloorName('5층')).toBe('5F');
      expect(normalizeFloorName('b1')).toBe('B1');
      expect(normalizeFloorName('3F')).toBe('3F');
      expect(normalizeFloorName('옥탑1')).toBe('옥탑1');
    });

    it('returns empty result gracefully on empty or whitespace clipboard input', () => {
      const resultEmpty = parseTsvRentRoll('');
      expect(resultEmpty.rows).toEqual([]);
      expect(resultEmpty.totalDepositManwon).toBe(0);
      expect(resultEmpty.summaryMessage).toContain('데이터가 없습니다');

      const resultWhitespace = parseTsvRentRoll('   \n\n\t\t\n  ');
      expect(resultWhitespace.rows).toEqual([]);
    });
  });

  describe('2. Unit Mistake Warning & Auto-Correction (5000 vs 50000000)', () => {
    it('detects raw KRW amounts entered instead of manwon and corrects them', () => {
      // User entered 50,000,000 KRW for deposit and 3,500,000 KRW for rent
      const parsedDeposit = parseManwonAmount('50,000,000');
      expect(parsedDeposit.isSuspiciousUnitMistake).toBe(true);
      expect(parsedDeposit.manwon).toBe(5000);

      const parsedRent = parseManwonAmount(3500000);
      expect(parsedRent.isSuspiciousUnitMistake).toBe(true);
      expect(parsedRent.manwon).toBe(350);

      // Normal manwon amount should NOT trigger mistake warning
      const normalDeposit = parseManwonAmount('5000');
      expect(normalDeposit.isSuspiciousUnitMistake).toBe(false);
      expect(normalDeposit.manwon).toBe(5000);

      const normalRent = parseManwonAmount(350);
      expect(normalRent.isSuspiciousUnitMistake).toBe(false);
      expect(normalRent.manwon).toBe(350);
    });

    it('parses Korean compound strings like "1억 2000만" or "5000만"', () => {
      const res1 = parseManwonAmount('1억 2000만');
      expect(res1.isSuspiciousUnitMistake).toBe(false);
      expect(res1.manwon).toBe(12000);

      const res2 = parseManwonAmount('1.5억');
      expect(res2.isSuspiciousUnitMistake).toBe(false);
      expect(res2.manwon).toBe(15000);

      const res3 = parseManwonAmount('5000만원');
      expect(res3.isSuspiciousUnitMistake).toBe(false);
      expect(res3.manwon).toBe(5000);
    });

    it('flags unit mistake warning in TSV parsing results', () => {
      const tsvWithMistake = [
        '층\t보증금\t월세\t관리비\t만기일',
        '1F\t50000000\t3500000\t300000\t2027.05',
      ].join('\n');

      const result = parseTsvRentRoll(tsvWithMistake);

      expect(result.hasUnitMistakes).toBe(true);
      expect(result.rows[0].depositManwon).toBe(5000);
      expect(result.rows[0].monthlyRentManwon).toBe(350);
      expect(result.rows[0].maintenanceManwon).toBe(30);
      expect(result.rows[0].unitMistakeWarning).toContain('원 단위 금액이 감지되어');
      expect(result.summaryMessage).toContain('자동 보정됨');
    });
  });

  describe('3. Korean Currency Readout Formatting', () => {
    it('formats manwon numbers into standard senior-friendly Korean strings with "= "', () => {
      expect(formatKoreanCurrencyReadout(0)).toBe('= 0원');
      expect(formatKoreanCurrencyReadout(500)).toBe('= 500만 원');
      expect(formatKoreanCurrencyReadout(5000)).toBe('= 5,000만 원');
      expect(formatKoreanCurrencyReadout(10000)).toBe('= 1억 원');
      expect(formatKoreanCurrencyReadout(12000)).toBe('= 1억 2,000만 원');
      expect(formatKoreanCurrencyReadout(100000)).toBe('= 10억 원');
      expect(formatKoreanCurrencyReadout(950000)).toBe('= 95억 원');
    });

    it('handles negative, NaN, null, and boundary values gracefully', () => {
      expect(formatKoreanCurrencyReadout(-100)).toBe('= 0원');
      expect(formatKoreanCurrencyReadout(NaN)).toBe('= 0원');
      expect(formatKoreanCurrencyReadout(null as any)).toBe('= 0원');
    });
  });

  describe('4. Flexible Lease-Expiry Date Parser', () => {
    // Reference date fixed at 2026-10-27 for deterministic tests
    const refDate = new Date('2026-10-27T00:00:00Z');

    it('parses standard dot, hyphen, and slash delimiters', () => {
      const d1 = parseLeaseExpiryDate('2027.05', refDate);
      expect(d1.year).toBe(2027);
      expect(d1.month).toBe(5);
      expect(d1.normalized).toBe('2027년 05월');
      expect(d1.shortFormat).toBe('27.05');
      expect(d1.isExpired).toBe(false);

      const d2 = parseLeaseExpiryDate('2028-11-30', refDate);
      expect(d2.year).toBe(2028);
      expect(d2.month).toBe(11);
      expect(d2.day).toBe(30);
      expect(d2.normalized).toBe('2028년 11월 30일');
      expect(d2.shortFormat).toBe('28.11');

      const d3 = parseLeaseExpiryDate('27/05/31', refDate);
      expect(d3.year).toBe(2027);
      expect(d3.month).toBe(5);
      expect(d3.day).toBe(31);
      expect(d3.shortFormat).toBe('27.05');
    });

    it('parses Korean text representations (27년 5월, 2027년 12월 31일)', () => {
      const d1 = parseLeaseExpiryDate('27년 5월', refDate);
      expect(d1.year).toBe(2027);
      expect(d1.month).toBe(5);
      expect(d1.normalized).toBe('2027년 05월');

      const d2 = parseLeaseExpiryDate('2027년 12월 31일', refDate);
      expect(d2.year).toBe(2027);
      expect(d2.month).toBe(12);
      expect(d2.day).toBe(31);
      expect(d2.normalized).toBe('2027년 12월 31일');

      const d3 = parseLeaseExpiryDate('27년3월', refDate);
      expect(d3.year).toBe(2027);
      expect(d3.month).toBe(3);
    });

    it('parses compact numbers (2705, 202705, 273)', () => {
      const d1 = parseLeaseExpiryDate('2705', refDate);
      expect(d1.year).toBe(2027);
      expect(d1.month).toBe(5);

      const d2 = parseLeaseExpiryDate('202705', refDate);
      expect(d2.year).toBe(2027);
      expect(d2.month).toBe(5);

      const d3 = parseLeaseExpiryDate('273', refDate);
      expect(d3.year).toBe(2027);
      expect(d3.month).toBe(3);
    });

    it('parses relative offsets like "만기 2년", "2년", "만기 6개월"', () => {
      const dYear = parseLeaseExpiryDate('만기 2년', refDate);
      expect(dYear.year).toBe(2028); // 2026 + 2
      expect(dYear.month).toBe(10);
      expect(dYear.isExpired).toBe(false);

      const dMonth = parseLeaseExpiryDate('만기 6개월', refDate);
      expect(dMonth.year).toBe(2027); // 2026-10 + 6 months -> 2027-04
      expect(dMonth.month).toBe(4);
      expect(dMonth.isExpired).toBe(false);
    });

    it('detects expired leases and attaches warning indicator', () => {
      const dPast = parseLeaseExpiryDate('2025.12', refDate);
      expect(dPast.year).toBe(2025);
      expect(dPast.isExpired).toBe(true);
      expect(dPast.warning).toBe('만기 지남, 연장 확인');

      const dPastMonth = parseLeaseExpiryDate('2026.05', refDate);
      expect(dPastMonth.isExpired).toBe(true);
      expect(dPastMonth.warning).toBe('만기 지남, 연장 확인');

      const dFuture = parseLeaseExpiryDate('2027.01', refDate);
      expect(dFuture.isExpired).toBe(false);
      expect(dFuture.warning).toBeUndefined();
    });

    it('handles null, undefined, empty, and invalid formats safely without throwing', () => {
      expect(parseLeaseExpiryDate(null).year).toBeNull();
      expect(parseLeaseExpiryDate(undefined).year).toBeNull();
      expect(parseLeaseExpiryDate('').year).toBeNull();

      const invalid = parseLeaseExpiryDate('미정/확인필요', refDate);
      expect(invalid.year).toBeNull();
      expect(invalid.warning).toBe('날짜 형식을 확인해주세요');
    });
  });
});

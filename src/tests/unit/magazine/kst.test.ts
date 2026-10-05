import { describe, it, expect } from 'vitest';
import {
  toKstDate, isoWeekLabel, isoWeekOf, parseIssueDate, formatKoreanDate, addDays, mondayOfWeek,
  isQuietHoursKst, previousMonthKst, previousQuarterKst, currentWeekLabel, weekdayOfDate, isFutureDateKst,
} from '@/lib/magazine/kst';

describe('kst — ISO week golden vectors', () => {
  const vectors: Array<[string, string]> = [
    ['2026-01-01', 'W01-2026'],
    ['2026-10-05', 'W41-2026'],
    ['2026-12-31', 'W53-2026'],
    ['2027-01-01', 'W53-2026'],
    ['2027-01-04', 'W01-2027'],
    ['2028-01-01', 'W52-2027'],
    ['2029-12-31', 'W01-2030'],
    ['2025-12-29', 'W01-2026'],
    ['2026-09-20', 'W38-2026'],
  ];
  it.each(vectors)('%s → %s', (d, label) => {
    expect(isoWeekLabel(d)).toBe(label);
  });

  it('cron 2026-10-04T22:00Z(=KST 10-05 07:00) → W41-2026', () => {
    expect(currentWeekLabel(new Date('2026-10-04T22:00:00Z'))).toBe('W41-2026');
  });

  it('1826일 전수: 같은 주(월~일)는 같은 라벨, 월요일에 주차가 바뀐다', () => {
    let prev = '';
    let d = '2026-01-01';
    for (let i = 0; i < 1826; i++) {
      const label = isoWeekLabel(d);
      const wd = weekdayOfDate(d)!;
      if (wd === 1 && prev) expect(label).not.toBe(prev);
      if (wd !== 1 && prev) expect(label).toBe(prev);
      // 목요일 규칙: 해당 주 목요일의 연도 = ISO 연도
      const thursday = addDays(mondayOfWeek(d), 3);
      expect(label.endsWith(`-${thursday.slice(0, 4)}`)).toBe(true);
      const { week } = isoWeekOf(d);
      expect(week).toBeGreaterThanOrEqual(1);
      expect(week).toBeLessThanOrEqual(53);
      prev = label;
      d = addDays(d, 1);
    }
  });
});

describe('kst — date boundaries', () => {
  it('UTC 15:00 이후는 KST 다음 날', () => {
    expect(toKstDate(new Date('2026-10-04T14:59:59Z'))).toBe('2026-10-04');
    expect(toKstDate(new Date('2026-10-04T15:00:00Z'))).toBe('2026-10-05');
  });
  it('KST 00:00~08:59(UTC 전날)에도 KST 오늘 날짜', () => {
    expect(toKstDate(new Date('2026-10-04T16:30:00Z'))).toBe('2026-10-05');
  });
  it('윤년/연말', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(parseIssueDate('2026-02-30')).toBeNull();
    expect(parseIssueDate('2028-02-29')).not.toBeNull();
    expect(parseIssueDate('2026-13-01')).toBeNull();
    expect(parseIssueDate('2026-1-1')).toBeNull();
    expect(parseIssueDate('')).toBeNull();
  });
  it('요일: 2026-09-20은 일요일', () => {
    expect(weekdayOfDate('2026-09-20')).toBe(0);
    expect(formatKoreanDate('2026-09-20')).toBe('2026년 9월 20일 (일)');
  });
  it('일요일이 속한 주의 월요일', () => {
    expect(mondayOfWeek('2026-10-04')).toBe('2026-09-28');
    expect(mondayOfWeek('2026-10-05')).toBe('2026-10-05');
  });
  it('이전 달/분기', () => {
    expect(previousMonthKst(new Date('2026-01-15T00:00:00Z'))).toBe('2025-12');
    expect(previousMonthKst(new Date('2026-03-31T16:00:00Z'))).toBe('2026-03'); // KST 4/1 → 이전 달 3월
    expect(previousQuarterKst(new Date('2026-02-10T00:00:00Z'))).toEqual({ year: 2025, quarter: 4 });
    expect(previousQuarterKst(new Date('2026-10-05T00:00:00Z'))).toEqual({ year: 2026, quarter: 3 });
  });
  it('야간 시간(21~08 KST)', () => {
    expect(isQuietHoursKst(new Date('2026-10-05T11:59:00Z'))).toBe(false); // KST 20:59
    expect(isQuietHoursKst(new Date('2026-10-05T12:00:00Z'))).toBe(true); // KST 21:00
    expect(isQuietHoursKst(new Date('2026-10-04T22:00:00Z'))).toBe(true); // KST 07:00 (월 07:00 cron)
    expect(isQuietHoursKst(new Date('2026-10-04T23:00:00Z'))).toBe(false); // KST 08:00
    expect(isQuietHoursKst(new Date('2026-10-05T01:00:00Z'))).toBe(false); // KST 10:00
  });
  it('미래 날짜 판정(KST)', () => {
    const now = new Date('2026-10-05T00:00:00Z'); // KST 09:00
    expect(isFutureDateKst('2026-10-05', now)).toBe(false);
    expect(isFutureDateKst('2026-10-06', now)).toBe(true);
    expect(isFutureDateKst('2099-12-31', now)).toBe(true);
  });
});

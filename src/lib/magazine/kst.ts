/**
 * src/lib/magazine/kst.ts — 매거진 전용 KST 날짜/ISO 주차 단일 유틸 (F-03)
 *
 * 규칙:
 *  - 매거진 코드에서 `toISOString().slice(0, 10)` / `getDate()` / `getDay()` 직접 사용 금지.
 *  - 서버(UTC, Vercel)와 클라이언트(KST)가 같은 결과를 내도록 모든 계산은 KST(UTC+9) 고정 오프셋.
 *  - 주차 라벨은 `isoWeekLabel()` 하나만 사용 (ISO 8601: 월요일 시작, 첫 목요일이 속한 주 = 1주).
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface KstParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  /** 0=일 … 6=토 */
  weekday: number;
}

/** 주어진 순간(Date)을 KST 달력 요소로 분해한다. */
export function kstParts(d: Date = new Date()): KstParts {
  const shifted = new Date(d.getTime() + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** KST 기준 'YYYY-MM-DD'. */
export function toKstDate(d: Date = new Date()): string {
  const p = kstParts(d);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** 오늘(KST) 'YYYY-MM-DD'. */
export function todayKst(now: Date = new Date()): string {
  return toKstDate(now);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 'YYYY-MM-DD' 문자열을 검증·파싱한다. 형식 불일치/존재하지 않는 날짜(2026-02-30)면 null.
 * 반환 Date는 해당 날짜의 UTC 00:00 (달력 계산 전용 — 시각 의미 없음).
 */
export function parseIssueDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  const d = new Date(Date.UTC(y, mo - 1, da));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== da) return null;
  return d;
}

/** 'YYYY-MM-DD'의 요일 (0=일 … 6=토). 잘못된 날짜면 null. */
export function weekdayOfDate(dateStr: string): number | null {
  const d = parseIssueDate(dateStr);
  return d ? d.getUTCDay() : null;
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 'YYYY-MM-DD' → '2026년 9월 20일 (일)'. 잘못된 날짜면 원문 그대로. */
export function formatKoreanDate(dateStr: string): string {
  const d = parseIssueDate(dateStr);
  if (!d) return dateStr;
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAY_KO[d.getUTCDay()]})`;
}

/** 'YYYY-MM-DD'에 n일을 더한 'YYYY-MM-DD' (달력 연산, 시간대 무관). */
export function addDays(dateStr: string, n: number): string {
  const d = parseIssueDate(dateStr);
  if (!d) throw new Error(`Invalid date: ${dateStr}`);
  const r = new Date(d.getTime() + n * DAY_MS);
  return `${r.getUTCFullYear()}-${pad2(r.getUTCMonth() + 1)}-${pad2(r.getUTCDate())}`;
}

/**
 * ISO 8601 주차. 입력은 'YYYY-MM-DD'(달력 날짜). 반환 { year(ISO 연도), week(1-53) }.
 */
export function isoWeekOf(dateStr: string): { year: number; week: number } {
  const d = parseIssueDate(dateStr);
  if (!d) throw new Error(`Invalid date: ${dateStr}`);
  // ISO: 해당 주의 목요일이 속한 연도가 ISO 연도
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 월=1 … 일=7
  const thursday = new Date(d.getTime() + (4 - dayNum) * DAY_MS);
  const isoYear = thursday.getUTCFullYear();
  const jan1 = Date.UTC(isoYear, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / DAY_MS / 7) + 1;
  return { year: isoYear, week };
}

/** ISO 주차 라벨 'W41-2026' (단일 구현). 입력 'YYYY-MM-DD'. */
export function isoWeekLabel(dateStr: string): string {
  const { year, week } = isoWeekOf(dateStr);
  return `W${pad2(week)}-${year}`;
}

/** 현재 순간(KST)의 ISO 주차 라벨. */
export function currentWeekLabel(now: Date = new Date()): string {
  return isoWeekLabel(toKstDate(now));
}

/** 'YYYY-MM-DD'가 속한 주의 월요일 'YYYY-MM-DD'. */
export function mondayOfWeek(dateStr: string): string {
  const wd = weekdayOfDate(dateStr);
  if (wd === null) throw new Error(`Invalid date: ${dateStr}`);
  const diff = wd === 0 ? -6 : 1 - wd;
  return addDays(dateStr, diff);
}

/** 이전 달 'YYYY-MM' (KST 기준, 1월이면 전년 12월). */
export function previousMonthKst(now: Date = new Date()): string {
  const p = kstParts(now);
  const y = p.month === 1 ? p.year - 1 : p.year;
  const m = p.month === 1 ? 12 : p.month - 1;
  return `${y}-${pad2(m)}`;
}

/** 직전 분기 { year, quarter } (KST 기준). */
export function previousQuarterKst(now: Date = new Date()): { year: number; quarter: 1 | 2 | 3 | 4 } {
  const p = kstParts(now);
  const q = Math.floor((p.month - 1) / 3) + 1;
  if (q === 1) return { year: p.year - 1, quarter: 4 };
  return { year: p.year, quarter: (q - 1) as 1 | 2 | 3 };
}

/**
 * 정보통신망법 §50③ 야간 시간대(21:00~다음날 08:00, KST) 여부.
 * 21:00 정각 포함, 08:00 정각 제외.
 */
export function isQuietHoursKst(now: Date = new Date()): boolean {
  const { hour } = kstParts(now);
  return hour >= 21 || hour < 8;
}

/** 미래 날짜 여부 (KST 오늘보다 큼). */
export function isFutureDateKst(dateStr: string, now: Date = new Date()): boolean {
  return dateStr > toKstDate(now);
}

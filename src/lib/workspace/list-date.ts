/**
 * @file src/lib/workspace/list-date.ts
 * @description Date helpers for the left list column of the 4 broker workspaces
 * (DealCard · IM · Newsletter · Inbox).
 *
 * Senior-friendly rules (docs: workspace_list_column_redesign_plan §3):
 *  - Today        → "오후 2:20"
 *  - Yesterday    → "어제"
 *  - This year    → "11월 10일"
 *  - Older        → "2025. 3. 4."
 *  - Legacy relative strings ("방금", "3분 전", "2시간 전", "어제", "3일 전") are shown as-is,
 *    but converted to an approximate time so they still sort and group correctly.
 *  - Anything unparseable is shown as-is (or "날짜 없음" when empty) and sorted last.
 */

export type ListDateValue = string | number | Date | null | undefined;

export type ListDateBucket = "today" | "yesterday" | "week" | "earlier" | "unknown";

export const LIST_DATE_BUCKET_LABELS: Record<ListDateBucket, string> = {
  today: "오늘",
  yesterday: "어제",
  week: "이번 주",
  earlier: "이전",
  unknown: "날짜 없음",
};

const BUCKET_ORDER: ListDateBucket[] = ["today", "yesterday", "week", "earlier", "unknown"];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Parses legacy Korean relative strings into an approximate epoch ms. */
function parseKoreanRelative(raw: string, now: Date): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (s === "방금" || s === "방금 전" || s === "지금") return now.getTime();
  if (s === "어제") return now.getTime() - DAY;
  if (s === "오늘") return now.getTime();
  const m = s.match(/^(\d+)\s*(초|분|시간|일|주|개월|달)\s*전$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2];
  const ms =
    unit === "초"
      ? n * 1000
      : unit === "분"
      ? n * MINUTE
      : unit === "시간"
      ? n * HOUR
      : unit === "일"
      ? n * DAY
      : unit === "주"
      ? n * 7 * DAY
      : n * 30 * DAY;
  return now.getTime() - ms;
}

function isRelativeKoreanString(value: ListDateValue): value is string {
  return typeof value === "string" && parseKoreanRelative(value, new Date()) !== null;
}

/**
 * Converts any supported list date value into epoch ms (or null when unknown).
 * Bare `YYYY-MM-DD` strings are interpreted as local midnight (not UTC) so a
 * newsletter issue date never shifts to the previous day.
 */
export function toListTime(value: ListDateValue, now: Date = new Date()): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const s = String(value).trim();
  if (!s) return null;

  const rel = parseKoreanRelative(s, now);
  if (rel !== null) return rel;

  const ymd = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})\.?$/);
  if (ymd) {
    const t = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])).getTime();
    return Number.isFinite(t) ? t : null;
  }

  // Only accept strings that look like real ISO-ish dates (avoid Date.parse("12") style surprises)
  if (!/^\d{4}-\d{1,2}-\d{1,2}[T ]/.test(s)) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function formatKoreanTime(d: Date): string {
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  const meridiem = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${meridiem} ${h12}:${mm}`;
}

/** Formats a list date for the simple list row (right-aligned date column). */
export function formatListDate(value: ListDateValue, now: Date = new Date()): string {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) {
    return "날짜 없음";
  }
  // Legacy relative strings are already human-friendly — show them verbatim.
  if (typeof value === "string" && isRelativeKoreanString(value.trim())) {
    return value.trim();
  }
  const t = toListTime(value, now);
  if (t === null) return typeof value === "string" ? value.trim() : "날짜 없음";

  const d = new Date(t);
  const todayStart = startOfDay(now);
  if (t >= todayStart && t < todayStart + DAY) return formatKoreanTime(d);
  if (t >= todayStart - DAY && t < todayStart) return "어제";
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

/** Buckets a list date into 오늘 / 어제 / 이번 주 / 이전 / 날짜 없음. */
export function getListDateBucket(value: ListDateValue, now: Date = new Date()): ListDateBucket {
  const t = toListTime(value, now);
  if (t === null) return "unknown";
  const todayStart = startOfDay(now);
  if (t >= todayStart) return "today";
  if (t >= todayStart - DAY) return "yesterday";
  if (t >= todayStart - 6 * DAY) return "week";
  return "earlier";
}

export interface ListDateGroup<T> {
  bucket: ListDateBucket;
  label: string;
  items: T[];
}

/**
 * Sorts items newest-first (stable: equal or unknown times keep their original order)
 * and groups them into date buckets in a fixed order.
 */
export function groupItemsByListDate<T>(
  items: readonly T[],
  getDate: (item: T) => ListDateValue,
  now: Date = new Date()
): ListDateGroup<T>[] {
  const decorated = items.map((item, index) => ({
    item,
    index,
    time: toListTime(getDate(item), now),
  }));
  decorated.sort((a, b) => {
    if (a.time === null && b.time === null) return a.index - b.index;
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    if (b.time !== a.time) return b.time - a.time;
    return a.index - b.index;
  });

  const byBucket = new Map<ListDateBucket, T[]>();
  for (const d of decorated) {
    const bucket = getListDateBucket(d.time ?? null, now);
    const arr = byBucket.get(bucket) ?? [];
    arr.push(d.item);
    byBucket.set(bucket, arr);
  }

  return BUCKET_ORDER.filter((b) => (byBucket.get(b)?.length ?? 0) > 0).map((bucket) => ({
    bucket,
    label: LIST_DATE_BUCKET_LABELS[bucket],
    items: byBucket.get(bucket)!,
  }));
}

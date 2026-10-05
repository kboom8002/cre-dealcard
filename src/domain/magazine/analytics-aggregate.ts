/**
 * src/domain/magazine/analytics-aggregate.ts — 분석 이벤트 집계 순수 함수 (E-04)
 *
 * - 체류(dwell)는 페이지 로드(`metadata.pv`)마다 **누적 초**를 여러 번 보낼 수 있으므로(백그라운드 전환 때마다 flush)
 *   (visitor, pv[, section]) 단위로 **최댓값**만 취해 평균한다. 행 평균은 증분 보고를 과소 집계한다.
 * - 날짜 버킷은 KST (`@/lib/magazine/kst`). toISOString().slice(0,10) 금지.
 */
import { addDays, toKstDate } from '@/lib/magazine/kst';

/** KPI 기준 정의 — API 응답(`kpiDefinitions`)과 EditorAnalyticsTab 툴팁이 같은 문구를 쓴다 (T1-UX-4). */
export const KPI_DEFINITIONS = {
  totalViews: '최근 30일 동안 발행된 호수를 연 횟수입니다. 같은 방문자가 30분 안에 다시 열면 1회로 셉니다.',
  uniqueVisitors: '열람한 브라우저 수입니다(브라우저·기기가 다르면 다른 방문자). 사람 수와 다를 수 있습니다.',
  avgDwellSeconds: '한 번 방문할 때 화면을 보고 있던 시간(초)의 평균입니다. 탭을 숨기거나 앱을 전환한 시간은 제외합니다.',
  completionRate: '열람한 방문자 중 페이지 끝(100%)까지 스크롤한 방문자의 비율입니다.',
  subscriberCount: '현재 수신 중(활성) 상태인 구독자 수입니다. 수신 거부·보류는 제외합니다.',
  temperature: '관심사·읽은 이력(40%)과 최근 열람·클릭 행동(60%)을 합친 점수로 5단계로 나눕니다. 6개월 이상 열람이 없으면 냉각입니다.',
} as const;

export interface AnalyticsRow {
  event_type: string;
  visitor_id?: string | null;
  section_id?: string | null;
  dwell_seconds?: number | null;
  scroll_pct?: number | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

/** 한 번의 페이지 로드 식별자 (없으면 행별로 독립) */
function pvKey(row: AnalyticsRow, fallback: number): string {
  const pv = row.metadata && typeof row.metadata.pv === 'string' ? row.metadata.pv : `row${fallback}`;
  return `${row.visitor_id ?? 'anon'}:${pv}`;
}

const validDwell = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 14_400;

/** 페이지 평균 체류(초) — dwell 이면서 section_id 없는 행. 표본 0이면 avg null (0초로 위장 금지). */
export function aggregatePageDwell(rows: AnalyticsRow[]): { avgSeconds: number | null; samples: number } {
  const best = new Map<string, number>();
  rows.forEach((r, i) => {
    if (r.event_type !== 'dwell' || r.section_id || !validDwell(r.dwell_seconds)) return;
    const k = pvKey(r, i);
    best.set(k, Math.max(best.get(k) ?? 0, r.dwell_seconds));
  });
  if (best.size === 0) return { avgSeconds: null, samples: 0 };
  let sum = 0;
  for (const v of best.values()) sum += v;
  return { avgSeconds: Math.round(sum / best.size), samples: best.size };
}

export interface SectionAggregate {
  sectionId: string;
  /** section_view 이벤트 수 */
  count: number;
  /** 섹션 체류 평균(초) — 표본 없으면 null */
  avgDwellSeconds: number | null;
  dwellSamples: number;
}

/** 섹션별 열람수(section_view)·평균 체류(섹션 dwell 의 (visitor,pv,section) 최댓값 평균). */
export function aggregateSections(rows: AnalyticsRow[]): SectionAggregate[] {
  const counts = new Map<string, number>();
  const dwell = new Map<string, Map<string, number>>(); // section → key → max
  rows.forEach((r, i) => {
    if (!r.section_id) return;
    if (r.event_type === 'section_view') {
      counts.set(r.section_id, (counts.get(r.section_id) ?? 0) + 1);
      // 레거시: section_view 행에 직접 dwell 이 실린 경우도 체류로 인정
      if (validDwell(r.dwell_seconds)) {
        const m = dwell.get(r.section_id) ?? new Map<string, number>();
        const k = pvKey(r, i);
        m.set(k, Math.max(m.get(k) ?? 0, r.dwell_seconds));
        dwell.set(r.section_id, m);
      }
    } else if (r.event_type === 'dwell' && validDwell(r.dwell_seconds)) {
      const m = dwell.get(r.section_id) ?? new Map<string, number>();
      const k = pvKey(r, i);
      m.set(k, Math.max(m.get(k) ?? 0, r.dwell_seconds));
      dwell.set(r.section_id, m);
      if (!counts.has(r.section_id)) counts.set(r.section_id, 0);
    }
  });
  const out: SectionAggregate[] = [];
  for (const [sectionId, count] of counts) {
    const m = dwell.get(sectionId);
    let avg: number | null = null;
    if (m && m.size > 0) {
      let s = 0;
      for (const v of m.values()) s += v;
      avg = Math.round(s / m.size);
    }
    out.push({ sectionId, count, avgDwellSeconds: avg, dwellSamples: m?.size ?? 0 });
  }
  return out.sort((a, b) => b.count - a.count || a.sectionId.localeCompare(b.sectionId));
}

/** 고유 방문자 수 (v2 해시 기준 — 호출부가 이미 v2 로 필터) */
export function countUniqueVisitors(rows: Array<{ visitor_id?: string | null }>): number {
  const s = new Set<string>();
  for (const r of rows) if (r.visitor_id) s.add(r.visitor_id);
  return s.size;
}

/** 완독률 = 100% 스크롤 도달 **방문자** / 열람 **방문자** (이벤트 건수 비율은 1을 넘을 수 있어 사용하지 않는다). 열람 0 이면 null. */
export function completionRate(viewVisitors: Set<string>, completedVisitors: Set<string>): number | null {
  if (viewVisitors.size === 0) return null;
  let done = 0;
  for (const v of completedVisitors) if (viewVisitors.has(v)) done += 1;
  return Math.round((done / viewVisitors.size) * 1000) / 10;
}

/** 최근 N일 KST 일별 page_view. 키는 'MM-DD'. */
export function dailyTrendKst(rows: Array<{ created_at: string }>, days: number, now: Date = new Date()): Array<{ date: string; count: number }> {
  const today = toKstDate(now);
  const order: string[] = [];
  const bucket = new Map<string, number>();
  for (let d = days - 1; d >= 0; d--) {
    const day = addDays(today, -d);
    order.push(day);
    bucket.set(day, 0);
  }
  for (const r of rows) {
    const t = new Date(r.created_at);
    if (Number.isNaN(t.getTime())) continue;
    const day = toKstDate(t);
    if (bucket.has(day)) bucket.set(day, (bucket.get(day) ?? 0) + 1);
  }
  return order.map((day) => ({ date: day.slice(5), count: bucket.get(day) ?? 0 }));
}

export const POLL_HOURLY_MIN_SAMPLE = 5;

/**
 * 투표 응답 시간대(KST 0~23시) 분포. 표본이 5 미만이면 숨긴다(hidden:'LOW_SAMPLE') — 소표본 추이는 오해를 부른다.
 * 실제 created_at 만 사용(없으면 hidden:'NO_TIMESTAMP').
 */
export function pollHourlyDistribution(
  responses: Array<{ created_at?: string | null }>,
  minSample: number = POLL_HOURLY_MIN_SAMPLE,
): { hours: Array<{ hour: number; count: number }> | null; hidden: 'LOW_SAMPLE' | 'NO_TIMESTAMP' | null } {
  const stamped = responses.filter((r) => r.created_at && !Number.isNaN(new Date(r.created_at).getTime()));
  if (responses.length > 0 && stamped.length === 0) return { hours: null, hidden: 'NO_TIMESTAMP' };
  if (stamped.length < minSample) return { hours: null, hidden: 'LOW_SAMPLE' };
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const r of stamped) {
    const hour = new Date(new Date(r.created_at as string).getTime() + 9 * 3600_000).getUTCHours();
    hours[hour].count += 1;
  }
  return { hours, hidden: null };
}

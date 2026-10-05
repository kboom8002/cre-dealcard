/**
 * src/lib/magazine/subscriber-temperature.ts — 구독자별 매수 온도 산출 (서버 전용, E-04 / T3-ANL-1)
 *
 * analytics 대시보드와 subscribers 목록이 **같은 입력(구독자 귀속 이벤트)·같은 함수(computeBuyerTemperature)** 로
 * 온도를 계산하도록 하는 단일 진입점이다.
 *
 * 귀속 이벤트 = `magazine_analytics_events.metadata->>subscriber_id` (서버가 sid 서명 토큰 검증 후 기록, public analytics route).
 * 소유 범위 = 호출자 broker 키(slug/uuid)의 에디션 이벤트로만 한정 (T3-SEC-1).
 */
import { computeBuyerTemperature, type TemperatureEvent, type TemperatureResult } from '@/domain/magazine/buyer-temperature';
import { isUuid } from '@/lib/magazine/slug';
import { VISITOR_HASH_LIKE } from '@/lib/magazine/visitor-hash';

const DAY_MS = 86_400_000;
/** 6개월 냉각 판정을 위해 183일 + 여유 */
export const TEMPERATURE_LOOKBACK_DAYS = 190;
const MAX_EVENTS = 5000;
const MAX_EDITIONS = 500;

/** 최소 supabase 형태 — 서비스 클라이언트를 그대로 받는다. */
export interface TemperatureDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
}

export interface SubscriberRowForTemperature {
  id: string;
  interest_profile?: unknown;
  subscribed_at?: string | null;
}

export type SubscriberEventsLoad =
  | { ok: true; bySubscriber: Map<string, TemperatureEvent[]>; ownEditionIds: string[]; truncated: boolean }
  | { ok: false; message: string };

export async function loadSubscriberEvents(
  db: TemperatureDb,
  brokerKeys: string[],
  subscriberIds: string[],
  now: number = Date.now(),
): Promise<SubscriberEventsLoad> {
  const ids = Array.from(new Set(subscriberIds.filter((s) => isUuid(s))));
  const { data: eds, error: edErr } = await db
    .from('magazine_editions')
    .select('id')
    .in('broker_id', brokerKeys)
    .limit(MAX_EDITIONS);
  if (edErr) return { ok: false, message: edErr.message ?? 'edition lookup failed' };
  const ownEditionIds: string[] = (eds ?? []).map((e: { id: string }) => e.id);
  const bySubscriber = new Map<string, TemperatureEvent[]>();
  if (ids.length === 0 || ownEditionIds.length === 0) {
    return { ok: true, bySubscriber, ownEditionIds, truncated: false };
  }

  const since = new Date(now - TEMPERATURE_LOOKBACK_DAYS * DAY_MS).toISOString();
  const { data: rows, error } = await db
    .from('magazine_analytics_events')
    .select('event_type, created_at, section_id, target_url, target_param, dwell_seconds, scroll_pct, metadata')
    .in('edition_id', ownEditionIds)
    .in('metadata->>subscriber_id', ids)
    .like('visitor_id', VISITOR_HASH_LIKE)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(MAX_EVENTS);
  if (error) return { ok: false, message: error.message ?? 'events lookup failed' };

  const list = (rows ?? []) as Array<TemperatureEvent & { metadata?: { subscriber_id?: unknown } | null }>;
  for (const r of list) {
    const sid = r.metadata && typeof r.metadata.subscriber_id === 'string' ? r.metadata.subscriber_id : null;
    if (!sid) continue;
    const arr = bySubscriber.get(sid) ?? [];
    arr.push({
      event_type: r.event_type,
      created_at: r.created_at,
      section_id: r.section_id ?? null,
      target_url: r.target_url ?? null,
      target_param: r.target_param ?? null,
      dwell_seconds: r.dwell_seconds ?? null,
      scroll_pct: r.scroll_pct ?? null,
    });
    bySubscriber.set(sid, arr);
  }
  return { ok: true, bySubscriber, ownEditionIds, truncated: list.length >= MAX_EVENTS };
}

/** 구독자 목록 → 온도 결과 맵. events 가 없으면(조회 실패) profileOnly=true 로 표시해 호출부가 정직하게 알리게 한다. */
export function computeTemperatures(
  subs: SubscriberRowForTemperature[],
  bySubscriber: Map<string, TemperatureEvent[]> | null,
  now: number = Date.now(),
): Map<string, TemperatureResult> {
  const out = new Map<string, TemperatureResult>();
  for (const s of subs) {
    out.set(
      s.id,
      computeBuyerTemperature({
        profile: s.interest_profile,
        events: bySubscriber?.get(s.id) ?? [],
        subscribedAt: s.subscribed_at ?? null,
        now,
      }),
    );
  }
  return out;
}

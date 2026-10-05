/**
 * POST /api/public/magazine/analytics — 매거진 열람 이벤트 수신 (공개, 인증 없음)
 *
 * E-04 (T3-04·T3-06·T3-13·T3-14·S2-08·S2-28·D2-25·T1-13):
 *  - withPublicGuard: 본문 8KB · IP/방문자 레이트리밋 · zod 검증. event_type 은 5종 화이트리스트(그 외 'alert' 등 위조 이벤트는 400, 어떤 알림도 만들지 않는다).
 *  - 방문자 ID: 클라이언트 랜덤 uuid → 서버에서 HMAC 해시(`v2_…`)만 저장. 시크릿(MAGAZINE_SID_SECRET) 없으면 503 (미수집을 정직하게 알림).
 *  - edition_id(uuid) 필수 + 존재·발행 상태 확인. **broker 는 에디션에서 서버가 결정**(클라이언트 metadata.broker_id 신뢰 금지).
 *    draft/미발행 에디션 이벤트는 저장하지 않는다(미리보기 오염 서버측 방어선).
 *  - page_view: 30분 내 같은 방문자 중복은 저장·조회수 증가 모두 생략, 첫 열람만 `increment_edition_views` RPC 로 view_count 증가.
 *  - 구독자 귀속: metadata.sid(서명 토큰)를 서버가 검증해 같은 브로커의 구독자일 때만 metadata.subscriber_id 기록. 위조·만료면 익명 처리.
 *  - 핫리드 알림: **서버가 계산한 온도(🔥)** 로만 트리거 (클라이언트 값 무시) · 브로커당 시간당 상한 · 24시간 구독자 중복 방지 ·
 *    발송 마스터 스위치(MAGAZINE_SEND_ENABLED) 꺼져 있으면 보내지 않는다.
 */
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createModuleLogger } from '@/lib/logger';
import { guardError, withPublicGuard } from '@/lib/magazine/public-guard';
import { GENERIC_ERROR_MESSAGE } from '@/lib/magazine/user-message';
import { resolveBroker } from '@/lib/magazine/resolve-broker';
import { isMagazineSendEnabled, isMagazineTrackingEnabled } from '@/lib/magazine/send-flags';
import { hashVisitorId } from '@/lib/magazine/visitor-hash';
import { canonicalClickTarget, rawClickTarget, sanitizeClickMeta } from '@/lib/magazine/visitor-id';
import {
  AnalyticsEventSchema,
  HOT_LEAD_ALERTS_PER_HOUR,
  PAGE_VIEW_DEDUP_MINUTES,
  referrerHost,
  sanitizeTargetUrl,
  type AnalyticsEventBody,
} from '@/lib/magazine/analytics-event';
import { verifySidToken } from '@/domain/magazine/sid-token';
import { classifyEvent, computeBuyerTemperature } from '@/domain/magazine/buyer-temperature';
import { loadSubscriberEvents } from '@/lib/magazine/subscriber-temperature';

const log = createModuleLogger('route');

export const dynamic = 'force-dynamic';


export const POST = withPublicGuard<AnalyticsEventBody>({
  name: 'magazine-analytics',
  schema: AnalyticsEventSchema,
  maxBodyBytes: 8 * 1024,
  rateLimit: {
    ip: { max: 300, windowSec: 60 },
    target: { key: (b: AnalyticsEventBody) => b.visitor_id, max: 120, windowSec: 60 },
  },
})(async (_req, { body }) => {
  if (!isMagazineTrackingEnabled()) {
    return NextResponse.json({ ok: true, tracked: false, reason: 'TRACKING_DISABLED' });
  }

  const visitorHash = hashVisitorId(body.visitor_id);
  if (!visitorHash) {
    log.error('[Magazine Analytics] MAGAZINE_SID_SECRET 미설정 — 이벤트를 저장하지 않습니다');
    return guardError(503, 'NOT_CONFIGURED', '일시적으로 수집할 수 없습니다.');
  }

  const supabase = createServiceClient();

  // 1) 에디션: 존재 · 발행 상태 확인, broker 는 서버가 결정
  const { data: edition, error: edErr } = await supabase
    .from('magazine_editions')
    .select('id, broker_id, status')
    .eq('id', body.edition_id)
    .maybeSingle();
  if (edErr) {
    log.error('[Magazine Analytics] edition lookup', edErr.message);
    return guardError(500, 'INTERNAL', GENERIC_ERROR_MESSAGE);
  }
  if (!edition) return guardError(404, 'EDITION_NOT_FOUND', '존재하지 않는 호수입니다.');
  if (edition.status !== 'published') {
    return NextResponse.json({ ok: true, tracked: false, reason: 'NOT_PUBLISHED' });
  }

  const broker = await resolveBroker(supabase, String(edition.broker_id));
  const brokerKeys = Array.from(
    new Set([String(edition.broker_id), broker?.userId, broker?.slug].filter((k): k is string => !!k)),
  );

  // 2) page_view 중복 억제
  if (body.event_type === 'page_view') {
    const since = new Date(Date.now() - PAGE_VIEW_DEDUP_MINUTES * 60_000).toISOString();
    const { count, error: dupErr } = await supabase
      .from('magazine_analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('edition_id', edition.id)
      .eq('visitor_id', visitorHash)
      .eq('event_type', 'page_view')
      .gte('created_at', since);
    if (dupErr) {
      log.error('[Magazine Analytics] dedup lookup', dupErr.message);
      return guardError(500, 'INTERNAL', GENERIC_ERROR_MESSAGE);
    }
    if ((count ?? 0) > 0) return NextResponse.json({ ok: true, tracked: false, reason: 'DUPLICATE_VIEW' });
  }

  // 3) 구독자 귀속 (서명 토큰 검증 + 브로커 일치 + 구독자 존재)
  let subscriber: { id: string; interest_profile: unknown; subscribed_at: string | null } | null = null;
  if (body.metadata?.sid) {
    const v = verifySidToken(body.metadata.sid);
    if (v.ok && brokerKeys.includes(v.brokerKey)) {
      const { data: sub, error: subErr } = await supabase
        .from('magazine_subscribers')
        .select('id, status, interest_profile, subscribed_at')
        .eq('id', v.subscriberId)
        .in('broker_id', brokerKeys)
        .maybeSingle();
      if (subErr) {
        log.warn('[Magazine Analytics] subscriber lookup', subErr.message);
      } else if (sub && sub.status !== 'unsubscribed') {
        subscriber = { id: sub.id, interest_profile: sub.interest_profile, subscribed_at: sub.subscribed_at };
      }
    } else if (!v.ok && v.reason !== 'NO_SECRET') {
      log.warn('[Magazine Analytics] sid 검증 실패 — 익명 처리', { reason: v.reason });
    }
  }

  // 4) 저장
  const rawTarget = body.target_param ? rawClickTarget(body.target_param) : null;
  const targetParam = rawTarget ? canonicalClickTarget(rawTarget) : null;
  const meta = sanitizeClickMeta(body.metadata?.meta);
  if (rawTarget && targetParam && rawTarget !== targetParam && meta.target_raw === undefined) {
    meta.target_raw = rawTarget; // 뷰어 원문 어휘 보존 (감사·재분류용)
  }
  const row = {
    edition_id: edition.id,
    visitor_id: visitorHash,
    event_type: body.event_type,
    section_id: body.section_id ?? null,
    target_url: sanitizeTargetUrl(body.target_url),
    target_param: targetParam,
    dwell_seconds: body.dwell_seconds ?? null,
    scroll_pct: body.scroll_pct ?? null,
    metadata: {
      v: 2,
      ...(body.metadata?.pv ? { pv: body.metadata.pv } : {}),
      ...(referrerHost(body.metadata?.referrer) ? { referrer_host: referrerHost(body.metadata?.referrer) } : {}),
      ...(subscriber ? { subscriber_id: subscriber.id } : {}),
      ...(Object.keys(meta).length > 0 ? { meta } : {}),
    },
  };
  const { error: insErr } = await supabase.from('magazine_analytics_events').insert(row);
  if (insErr) {
    log.error('[Magazine Analytics] insert', insErr.message);
    return guardError(500, 'INTERNAL', GENERIC_ERROR_MESSAGE);
  }

  // 5) 조회수 (첫 page_view 만)
  if (body.event_type === 'page_view') {
    const { error: rpcErr } = await supabase.rpc('increment_edition_views', { edition_id: edition.id });
    if (rpcErr) log.warn('[Magazine Analytics] increment_edition_views 실패 (view_count 미증가)', rpcErr.message);
  }

  const kind = classifyEvent({
    event_type: body.event_type,
    created_at: new Date().toISOString(),
    section_id: row.section_id,
    target_url: row.target_url,
    target_param: row.target_param,
    dwell_seconds: row.dwell_seconds,
    scroll_pct: row.scroll_pct,
  });

  // 6) 중앙 퍼널 이벤트 (activity_events) — 열람 1회·IM 요청만, broker 는 서버 결정값
  if (broker?.userId && (body.event_type === 'page_view' || kind === 'im_request')) {
    const { error: actErr } = await supabase.from('activity_events').insert({
      actor_id: broker.userId,
      actor_role: 'system',
      event_type: kind === 'im_request' ? 'magazine_to_im_click' : 'magazine_view',
      entity_type: 'building_ssot_lite',
      broker_id: broker.userId,
      metadata: {
        user_agent_hash: visitorHash,
        edition_id: edition.id,
        ...(subscriber ? { subscriber_id: subscriber.id } : {}),
      },
      created_at: new Date().toISOString(),
    });
    if (actErr) log.warn('[Magazine Analytics] activity_events insert', actErr.message);
  }

  // 7) 핫리드 알림 — 서버 계산 점수로만
  if (subscriber && broker?.userId && kind && ['page_view', 'im_request', 'phone_click', 'listing_click', 'poll_vote', 'inquiry'].includes(kind)) {
    try {
      await maybeSendHotLeadAlert(supabase, { subscriber, brokerKeys, brokerUserId: broker.userId, brokerSlug: broker.slug });
    } catch (err) {
      log.error('[Magazine Analytics] hot lead alert 처리 실패', err instanceof Error ? err.message : String(err));
    }
  }

  return NextResponse.json({ ok: true, tracked: true });
});

// ───────────────────────────────────────────────────────────────────

interface AlertDeps {
  subscriber: { id: string; interest_profile: unknown; subscribed_at: string | null };
  brokerKeys: string[];
  brokerUserId: string;
  brokerSlug: string | null;
}

async function maybeSendHotLeadAlert(
  supabase: ReturnType<typeof createServiceClient>,
  deps: AlertDeps,
): Promise<'sent' | 'skipped'> {
  if (!isMagazineSendEnabled()) return 'skipped'; // 발송 마스터 스위치(기본 꺼짐)
  if (!deps.brokerSlug) return 'skipped'; // 알림 모듈이 slug 로 브로커를 찾는다

  const load = await loadSubscriberEvents(supabase, deps.brokerKeys, [deps.subscriber.id]);
  if (!load.ok) {
    log.warn('[Hot Lead] 이벤트 조회 실패 — 알림 생략', load.message);
    return 'skipped';
  }
  const events = load.bySubscriber.get(deps.subscriber.id) ?? [];
  const temp = computeBuyerTemperature({
    profile: deps.subscriber.interest_profile,
    events,
    subscribedAt: deps.subscriber.subscribed_at,
  });
  if (temp.tier.label !== '🔥 적극검토') return 'skipped';

  // 브로커당 시간당 상한
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error: capErr } = await supabase
    .from('activity_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', 'hot_lead_alert_sent')
    .eq('broker_id', deps.brokerUserId)
    .gte('created_at', hourAgo);
  if (capErr) {
    log.warn('[Hot Lead] 시간당 상한 조회 실패 — 알림 생략', capErr.message);
    return 'skipped';
  }
  if ((count ?? 0) >= HOT_LEAD_ALERTS_PER_HOUR) {
    log.warn('[Hot Lead] 시간당 알림 상한 도달 — 생략');
    return 'skipped';
  }

  const touchpoints = ['magazine_view'];
  if (temp.counts.im_request > 0) touchpoints.push('magazine_to_im_click');
  const { checkAndSendHotLeadAlert } = await import('@/domain/notification/hot-lead-alert');
  const sent = await checkAndSendHotLeadAlert(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase as any,
    deps.brokerSlug,
    { score: temp.composite, isHotLead: true, touchpoints, channelCount: 1, buildingsViewed: [] },
    `sub:${deps.subscriber.id}`,
  );
  return sent ? 'sent' : 'skipped';
}

/**
 * POST /api/public/magazine/analytics — 매거진 열람 이벤트 수신 (공개, 인증 없음)
 *
 * E-04 (T3-04·T3-06·T3-13·T3-14·S2-08·S2-28·D2-25·T1-13):
 *  - withPublicGuard: 본문 8KB · IP/방문자 레이트리밋 · zod 검증. event_type 은 5종 화이트리스트(그 외 'alert' 등 위조 이벤트는 400, 어떤 알림도 만들지 않는다).
 *  - 방문자 ID: 클라이언트 랜덤 uuid → 서버에서 HMAC 해시(`v2_…`)만 저장. 시크릿(MAGAZINE_SID_SECRET) 없으면 503 (미수집을 정직하게 알림).
 *  - edition_id(uuid) 필수 + 존재·발행 상태 확인. **broker 는 호에서 서버가 결정**(클라이언트 metadata.broker_id 신뢰 금지).
 *    레거시 뷰어가 magazine_issues.id 를 보내도 404 로 버리지 않는다(edition-target.ts): issue → 같은 날짜의 발행 에디션으로 연결,
 *    에디션이 없으면 edition_id NULL + metadata.legacy_issue_id 로 기록(에디션 지표와 분리).
 *    draft/미발행 호 이벤트는 저장하지 않는다(미리보기 오염 서버측 방어선).
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
import { resolveEventTarget, type LegacyIssueRef } from '@/lib/magazine/edition-target';
import { isUnpublishedContent } from '@/lib/magazine/get-published-issue';
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

  // 1) 호 해석: edition uuid 우선 → 레거시 issue id(→ 같은 날짜의 발행 에디션) → 에디션 없는 레거시 호.
  //    broker 는 호에서 서버가 결정한다.
  const target = await resolveEventTarget(supabase, body.edition_id);
  if (target.kind === 'error') {
    log.error('[Magazine Analytics] target lookup', target.message);
    return guardError(500, 'INTERNAL', GENERIC_ERROR_MESSAGE);
  }
  if (target.kind === 'not_found') return guardError(404, 'EDITION_NOT_FOUND', '존재하지 않는 호수입니다.');

  /** edition 에 연결된 호면 그 id, 에디션 없는 레거시 호면 null (집계에서 구분 · metadata.legacy_issue_id 로 보존) */
  let editionId: string | null = null;
  let brokerRaw: string;
  let legacy: LegacyIssueRef | null = null;
  if (target.kind === 'edition') {
    if (target.edition.status !== 'published') {
      return NextResponse.json({ ok: true, tracked: false, reason: 'NOT_PUBLISHED' });
    }
    editionId = target.edition.id;
    brokerRaw = String(target.edition.broker_id);
  } else {
    // 초안/검수대기 표시가 남은 레거시 콘텐츠는 기록하지 않는다 (뷰어와 같은 기준)
    if (target.issue.content && isUnpublishedContent(target.issue.content)) {
      return NextResponse.json({ ok: true, tracked: false, reason: 'NOT_PUBLISHED' });
    }
    legacy = target.issue;
    brokerRaw = legacy.brokerKey;
  }

  const broker = await resolveBroker(supabase, brokerRaw);
  const brokerKeys = Array.from(
    new Set([brokerRaw, broker?.userId, broker?.slug].filter((k): k is string => !!k)),
  );

  // 2) page_view 중복 억제
  if (body.event_type === 'page_view') {
    const since = new Date(Date.now() - PAGE_VIEW_DEDUP_MINUTES * 60_000).toISOString();
    let dupQuery = supabase
      .from('magazine_analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('visitor_id', visitorHash)
      .eq('event_type', 'page_view')
      .gte('created_at', since);
    dupQuery = legacy
      ? dupQuery.is('edition_id', null).eq('metadata->>legacy_issue_id', legacy.issueId)
      : dupQuery.eq('edition_id', editionId);

    const { count, error: dupErr } = await dupQuery;
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
    edition_id: editionId,
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
      // 에디션이 없는 레거시 호: edition_id NULL 로 저장하되 어느 호인지 보존 (에디션 지표와 섞이지 않음)
      ...(legacy ? { legacy_issue_id: legacy.issueId, ...(legacy.issueDate ? { legacy_issue_date: legacy.issueDate } : {}) } : {}),
      // issue id 로 들어왔지만 발행 에디션으로 연결된 경우의 원본 id (감사용)
      ...(target.kind === 'edition' && target.viaIssueId ? { via_issue_id: target.viaIssueId } : {}),
    },
  };
  const { error: insErr } = await supabase.from('magazine_analytics_events').insert(row);
  if (insErr) {
    log.error('[Magazine Analytics] insert', insErr.message);
    return guardError(500, 'INTERNAL', GENERIC_ERROR_MESSAGE);
  }

  // 5) 조회수 (첫 page_view 만, 에디션 연결 호만 — 레거시 호는 view_count 컬럼이 없다)
  if (body.event_type === 'page_view' && editionId) {
    const { error: rpcErr } = await supabase.rpc('increment_edition_views', { edition_id: editionId });
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
        ...(editionId ? { edition_id: editionId } : {}),
        ...(legacy ? { legacy_issue_id: legacy.issueId } : {}),
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

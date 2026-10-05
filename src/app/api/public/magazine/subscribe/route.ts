/**
 * POST /api/public/magazine/subscribe
 * 매거진 공개 구독 엔드포인트 (인증 불필요) — G-01 동의 기록 + E-05 공개 API 강화
 *
 * 요청: { brokerId, name?, phone?, email?, channel:'kakao'|'email'|'both', tags?, referrer?, source?,
 *         consent:{ privacy, marketing, age14, night? } }
 * 응답: { ok:true, status:'pending'|'confirmed', message } | { ok:false, error:{ code, message } }
 *
 * 처리: withPublicGuard(본문 8KB·IP 10/시간·연락처 3/일 레이트리밋, zod) → 동의 3종 필수(400) → 연락처 정규화/채널별 필수
 *      → tags 사전 검증 → resolveBroker(없으면 404) → recordOptIn(pending upsert, COALESCE 병합, 해지자 자동 재활성화 금지)
 *      → (발송 활성+실발송 모드일 때만) 확인 메시지 발송.
 * 정직성: 마이그레이션(동의 컬럼) 미적용이면 가짜 성공 없이 503. 오류 응답에 DB/파서 메시지를 싣지 않는다(S2-26).
 * 로그: PII(전화/이메일/이름/토큰) 금지 — 코드/브로커 slug/채널만.
 */
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createModuleLogger } from '@/lib/logger';
import { withPublicGuard, guardError } from '@/lib/magazine/public-guard';
import { resolveBroker, type ResolvedBroker } from '@/lib/magazine/resolve-broker';
import { validateTagList } from '@/lib/magazine/tags';
import { hashIp, normalizeKrPhone } from '@/lib/magazine/pii';
import { recordOptIn, sendOptInConfirmation } from '@/domain/magazine/consent-service';
import {
  normalizeEmail,
  subscribeRequestSchema,
  validateSubscribeInput,
  type SubscribeRequest,
} from '@/domain/magazine/subscriber-consent-types';

export const dynamic = 'force-dynamic';

const log = createModuleLogger('magazine-subscribe');

const MSG_UNAVAILABLE = '잠시 후 다시 시도해 주세요';
const MSG_ACCEPTED = '구독 신청이 접수되었습니다. 본인 확인이 끝나면 매거진을 받아보실 수 있습니다.';
const MSG_ACCEPTED_SENT = '구독 신청이 접수되었습니다. 보내드린 확인 링크를 눌러 구독을 완료해 주세요.';
// 이메일 확인 채널이 없는 신청(카카오 전용/이메일 없음): 알림톡 확인 템플릿 승인 전까지 확인 메시지를 보낼 수 없다 — 정직하게 안내
const MSG_NO_CONFIRM_CHANNEL =
  '구독 신청이 접수되었습니다. 다만 이메일 주소가 없어 확인 링크를 보내드릴 수 없으며, 구독 확인이 끝나기 전에는 매거진이 발송되지 않습니다. 이메일 주소를 함께 입력해 다시 신청해 주세요.';

/** 대상(연락처) 레이트리밋 키: 전화(정규화) 우선, 없으면 이메일(소문자). 형식이 맞지 않으면 건너뜀(IP 한도만 적용). */
function targetKey(b: SubscribeRequest): string | null {
  const phone = normalizeKrPhone(b?.phone ?? '');
  if (phone) return `p:${phone}`;
  const email = normalizeEmail(b?.email ?? '');
  return email ? `e:${email}` : null;
}

/** 의미 검증(동의 3종 필수 → 400, 연락처·채널·이름·태그·출처). 대상 한도 소모 전에 실행된다. */
function semanticValidate(body: SubscribeRequest): Response | null {
  const v = validateSubscribeInput(body, { normalizeTags: validateTagList });
  return v.ok ? null : guardError(v.status, v.code, v.message);
}

export const POST = withPublicGuard<SubscribeRequest>({
  name: 'magazine-subscribe',
  schema: subscribeRequestSchema,
  maxBodyBytes: 8 * 1024,
  validate: semanticValidate,
  rateLimit: {
    ip: { max: 10, windowSec: 3600 },
    target: { key: targetKey, max: 3, windowSec: 86_400 },
  },
})(async (_req, { body, ip }) => {
  // 1) 정제된 입력 (validate 훅을 이미 통과했으므로 항상 ok)
  const v = validateSubscribeInput(body, { normalizeTags: validateTagList });
  if (!v.ok) return guardError(v.status, v.code, v.message);
  const input = v.value;

  const supabase = createServiceClient();

  // 2) broker 확인 (없으면 404 — T2-09d). DB 오류는 '없음'으로 위장하지 않는다.
  let broker: ResolvedBroker | null;
  try {
    broker = await resolveBroker(supabase, input.brokerParam);
  } catch (err) {
    log.error('[subscribe] broker 조회 실패', { message: err instanceof Error ? err.message.slice(0, 120) : 'unknown' });
    return guardError(503, 'SERVICE_UNAVAILABLE', MSG_UNAVAILABLE);
  }
  if (!broker) return guardError(404, 'NOT_FOUND', '구독 페이지를 찾을 수 없습니다.');
  const brokerSlug = broker.slug ?? broker.userId;

  // 3) 동의 기록 + pending upsert
  const result = await recordOptIn(supabase, {
    brokerSlug,
    brokerUserId: broker.userId,
    input,
    ipHash: hashIp(ip),
  });
  if (!result.ok) {
    if (result.code === 'UNAVAILABLE') {
      // 동의 컬럼 미적용 등 — 가짜 성공 금지
      log.error('[subscribe] 스키마 미적용(마이그레이션 000006 필요)');
      return guardError(503, 'SERVICE_UNAVAILABLE', MSG_UNAVAILABLE);
    }
    return guardError(500, 'INTERNAL', '일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.');
  }

  // 4) 확인 메시지: 발송 활성 + dry-run 해제일 때만 실제 발송. 아니면 보내지 않고 pending 유지(정직).
  let sent = false;
  if (result.confirmToken) {
    const s = await sendOptInConfirmation({
      channel: input.channel,
      email: input.email,
      brokerSlug,
      brokerName: broker.displayName,
      subscriberName: input.name,
      token: result.confirmToken,
    });
    sent = s.sent;
    if (!s.sent) log.info('[subscribe] 확인 메시지 미발송', { reason: s.reason, outcome: result.outcome });
  }

  // 5) 구독 이벤트(PII 없음). 실패해도 구독 처리는 유지하되 경고 로그를 남긴다.
  const { error: evErr } = await supabase.from('activity_events').insert({
    event_type: 'magazine_subscribe',
    entity_type: 'magazine_subscribers',
    metadata: { broker_id: brokerSlug, channel: input.channel, source: input.source },
    created_at: new Date().toISOString(),
  });
  if (evErr) log.warn('[subscribe] 구독 이벤트 기록 실패', { code: evErr.code });

  const pendingReason = result.pendingReason;
  return NextResponse.json({
    ok: true,
    status: result.status,
    ...(pendingReason ? { pendingReason } : {}),
    message: pendingReason ? MSG_NO_CONFIRM_CHANNEL : sent ? MSG_ACCEPTED_SENT : MSG_ACCEPTED,
  });
});

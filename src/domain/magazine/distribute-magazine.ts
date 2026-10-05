/**
 * @module distributeMagazine
 * @description 매거진 발행 시 카카오 알림톡 + 이메일 일괄 배포. **모든 발송은 sendGate를 경유**한다.
 *
 * - P0-04: `MAGAZINE_SEND_ENABLED`가 false면 어떤 DB·provider 호출도 없이 즉시 `SEND_DISABLED` 반환.
 * - T2-02: 구독자 컬럼은 운영 스키마(`subscriber_email`, `interest_profile`)를 사용한다. select 에러는 throw.
 * - D2-12/M2-01: STUB 성공 집계를 제거하고 `{sent, blocked, failed, recorded, dryRun, total}`로 정직 보고한다.
 *   dry-run에서는 `sent`가 항상 0이며 원장에 기록된 건수는 `recorded`다.
 */
import { getBrokerSubscriptionTier, type SubscriptionTier } from '@/domain/subscription/tier-gate';
import { isMagazineSendDryRun, isMagazineSendEnabled, SEND_DISABLED_MESSAGE } from '@/lib/magazine/send-flags';
import { todayKst } from '@/lib/magazine/kst';
import { createModuleLogger } from '@/lib/logger';
import type { MagazineDbClient } from './types';
import { KAKAO_TEMPLATE_WEEKLY_ISSUE } from './templates/kakao-template-codes';
import type { GateDeps } from './send-gate';
import {
  emptyTally,
  loadActiveSubscribers,
  loadBrokerIdentity,
  planTargets,
  resolveBaseUrl,
  runTargets,
  segmentMatches,
  type TargetSegment,
} from './send-batch';

const log = createModuleLogger('distribute-magazine');

export interface DistributeMagazineEditionInput {
  id?: string;
  title: string;
  /** 발행일 YYYY-MM-DD (KST). 없으면 todayKst() */
  date?: string;
  headline?: string;
  market_temp?: string;
  /** DC-9: 구독자 segment 타깃. 기본 'all' */
  target?: TargetSegment;
}

export interface DistributeMagazineResult {
  /** false = 전체 발송 중지(blockedReason 참조). 개별 수신자 차단은 ok:true + blocked 집계 */
  ok: boolean;
  blockedReason?: 'SEND_DISABLED';
  message?: string;
  dryRun: boolean;
  /** 판정 대상 (구독자×채널) 수 */
  total: number;
  /** 실제 provider 발송 성공 수 (dry-run이면 0) */
  sent: number;
  failed: number;
  /** dry-run으로 원장에 기록된 수 */
  recorded: number;
  /** 차단 사유별 건수 */
  blocked: Record<string, number>;
  /** target 세그먼트 불일치로 제외된 구독자 수 */
  segmentExcluded: number;
  // 하위 호환 필드
  kakaoSent: number;
  kakaoFailed: number;
  /** 카카오 채널 미지원(CHANNEL_NOT_AVAILABLE) 건수 */
  kakaoSkipped: number;
  emailSent: number;
  emailFailed: number;
  isPaidTier: boolean;
  tier: SubscriptionTier;
}

function disabledResult(): DistributeMagazineResult {
  return {
    ok: false,
    blockedReason: 'SEND_DISABLED',
    message: SEND_DISABLED_MESSAGE,
    dryRun: isMagazineSendDryRun(),
    total: 0,
    sent: 0,
    failed: 0,
    recorded: 0,
    blocked: {},
    segmentExcluded: 0,
    kakaoSent: 0,
    kakaoFailed: 0,
    kakaoSkipped: 0,
    emailSent: 0,
    emailFailed: 0,
    isPaidTier: false,
    tier: 'free',
  };
}

export async function distributeMagazine(
  supabase: MagazineDbClient,
  brokerId: string,
  edition: DistributeMagazineEditionInput,
  deps: GateDeps = {},
): Promise<DistributeMagazineResult> {
  // 0. 킬스위치 — DB·provider 어느 것도 건드리기 전에 차단
  if (!isMagazineSendEnabled()) return disabledResult();

  const issueDate = edition.date || todayKst(deps.now);

  // 1. 브로커·구독자 (에러는 throw — T2-02b)
  const broker = await loadBrokerIdentity(supabase, brokerId);
  if (!broker) throw new Error(`브로커 프로필을 찾을 수 없습니다: ${brokerId}`);
  const brokerKeys = [broker.slug, broker.userId].filter((k): k is string => !!k);
  const rawSubscribers = await loadActiveSubscribers(supabase, brokerKeys);

  // 2. 타깃 세그먼트 (DC-9)
  const target = edition.target ?? 'all';
  const subscribers = rawSubscribers.filter((s) => segmentMatches(target, s.segment));

  // 3. 구독 티어 (Free는 이메일만)
  const { tier, isPaid } = await getBrokerSubscriptionTier(supabase, broker.userId ?? '');

  const tally = emptyTally();
  const baseUrl = resolveBaseUrl();
  const targets = planTargets(subscribers, { allowKakao: isPaid }, tally);

  await runTargets(
    {
      supabase,
      broker,
      kind: 'weekly',
      editionKey: `${broker.slug}:${issueDate}:weekly`,
      editionId: edition.id ?? null,
      baseUrl,
      edition: {
        title: edition.title,
        headline: edition.headline ?? '',
        marketTemp: edition.market_temp ?? '',
        date: issueDate,
        url: `${baseUrl}/magazine/${broker.slug}/${issueDate}`,
      },
      kakaoTemplateId: KAKAO_TEMPLATE_WEEKLY_ISSUE,
      gateDeps: deps,
    },
    targets,
    tally,
  );

  // 4. 배포 이력(관측용). 원장(magazine_dispatch_logs)이 진실의 원천이며 이 기록의 실패는 발송 결과에 영향 없음
  if (broker.userId) {
    const { error: logError } = await supabase.from('activity_events').insert({
      actor_id: broker.userId,
      actor_role: 'broker',
      event_type: 'magazine_distributed',
      entity_type: 'magazine_editions',
      metadata: {
        broker_id: broker.slug,
        issue_date: issueDate,
        dry_run: deps.dryRun ?? isMagazineSendDryRun(),
        total: tally.total,
        sent_count: tally.sent,
        recorded_count: tally.recorded,
        failed_count: tally.failed,
        blocked: tally.blocked,
      },
    });
    if (logError) log.warn('[Magazine Distribution] activity_events insert failed', logError.message);
  }

  log.info(
    `[Magazine Distribution] ${broker.slug} ${issueDate}: total=${tally.total} sent=${tally.sent} recorded=${tally.recorded} failed=${tally.failed}`,
    { blocked: tally.blocked },
  );

  return {
    ok: true,
    dryRun: deps.dryRun ?? isMagazineSendDryRun(),
    total: tally.total,
    sent: tally.sent,
    failed: tally.failed,
    recorded: tally.recorded,
    blocked: tally.blocked,
    segmentExcluded: rawSubscribers.length - subscribers.length,
    kakaoSent: tally.kakao.sent,
    kakaoFailed: tally.kakao.failed,
    kakaoSkipped: tally.blocked.CHANNEL_NOT_AVAILABLE ?? 0,
    emailSent: tally.email.sent,
    emailFailed: tally.email.failed,
    isPaidTier: isPaid,
    tier,
  };
}

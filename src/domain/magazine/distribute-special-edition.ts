/**
 * Special Edition Distributor (속보 매거진 스마트 배포기)
 *
 * 해당 매물의 권역·자산유형에 매칭되는 구독자에게 속보를 배포한다. **모든 발송은 sendGate(kind:'flash')를 경유**한다.
 *
 * - P0-04: `MAGAZINE_SEND_ENABLED`가 false면 즉시 `SEND_DISABLED` (provider·DB 미접촉)
 * - T2-13/S2-20: segment 기본값 investor 무조건 발송을 제거 → 태그 매칭(`matchTags`) 기반.
 *   태그 없는 구독자는 `includeUntagged:true`를 명시한 경우에만 포함한다.
 * - 속보는 주 2회 상한(원장 기반, `checkFlashWeeklyCap`)
 * - D2-11: 가짜 라벨('적극 매수'·'급매'·사전 검토 문구) 제거 — 입력에 있는 제목만 사용한다.
 */
import { getBrokerSubscriptionTier, type SubscriptionTier } from '@/domain/subscription/tier-gate';
import { isMagazineSendDryRun, isMagazineSendEnabled, SEND_DISABLED_MESSAGE } from '@/lib/magazine/send-flags';
import { toKstDate, todayKst } from '@/lib/magazine/kst';
import { matchTags } from '@/lib/magazine/tags';
import { createModuleLogger } from '@/lib/logger';
import type { MagazineDbClient, MagazineEdition } from './types';
import { KAKAO_TEMPLATE_FLASH_ISSUE } from './templates/kakao-template-codes';
import { checkFlashWeeklyCap, type GateDeps } from './send-gate';
import {
  addBlocked,
  emptyTally,
  loadActiveSubscribers,
  loadBrokerIdentity,
  planTargets,
  resolveBaseUrl,
  runTargets,
  segmentMatches,
  type SubscriberRow,
  type TargetSegment,
} from './send-batch';

const log = createModuleLogger('distribute-special-edition');

export interface DistributeSpecialEditionInput {
  edition: MagazineEdition;
  buildingId: string;
  areaSignal: string;
  assetType: string;
  priceBand?: string;
  headline: string;
  /** 구독자 broker_id 키(slug 권장; uuid도 허용) */
  brokerId: string;
  /** DC-9 세그먼트 타깃. 기본 'all' */
  target?: TargetSegment;
  /** 태그가 없는 구독자 포함 여부(기본 false) */
  includeUntagged?: boolean;
}

export interface DistributionResult {
  ok: boolean;
  blockedReason?: 'SEND_DISABLED';
  message?: string;
  dryRun: boolean;
  /** 판정 대상 (구독자×채널) 수 */
  total: number;
  /** 하위 호환: total과 동일 */
  totalTargets: number;
  sent: number;
  failed: number;
  recorded: number;
  blocked: Record<string, number>;
  kakaoSent: number;
  kakaoSkipped?: number;
  emailSent: number;
  isPaidTier?: boolean;
  tier?: SubscriptionTier;
}

function tagsOf(sub: SubscriberRow): { regions: string[]; assetTypes: string[] } {
  const raw = (sub.interest_profile as { tags?: { regions?: unknown; assetTypes?: unknown } } | null | undefined)?.tags;
  const regions = Array.isArray(raw?.regions) ? (raw.regions as string[]) : [];
  const assetTypes = Array.isArray(raw?.assetTypes) ? (raw.assetTypes as string[]) : [];
  return { regions, assetTypes };
}

/**
 * 속보 타깃 선별(발송·팝업 미리보기 공용).
 * 규칙: 권역 ∩ ≠ ∅ AND 자산 ∩ ≠ ∅ — 태그가 없는 구독자는 includeUntagged가 true일 때만 포함.
 */
export function selectFlashTargets(
  subs: SubscriberRow[],
  params: { areaSignal: string; assetType: string; target?: TargetSegment; includeUntagged?: boolean },
): SubscriberRow[] {
  return subs.filter((s) => {
    if (!segmentMatches(params.target, s.segment)) return false;
    const tags = tagsOf(s);
    if (tags.regions.length === 0 && tags.assetTypes.length === 0) return params.includeUntagged === true;
    const r: unknown = matchTags(tags, [params.areaSignal], [params.assetType]);
    if (typeof r === 'boolean') return r;
    return Boolean((r as { matched?: boolean } | null)?.matched);
  });
}

function disabled(): DistributionResult {
  return {
    ok: false,
    blockedReason: 'SEND_DISABLED',
    message: SEND_DISABLED_MESSAGE,
    dryRun: isMagazineSendDryRun(),
    total: 0,
    totalTargets: 0,
    sent: 0,
    failed: 0,
    recorded: 0,
    blocked: {},
    kakaoSent: 0,
    kakaoSkipped: 0,
    emailSent: 0,
    isPaidTier: false,
    tier: 'free',
  };
}

export async function distributeSpecialEdition(
  supabase: MagazineDbClient,
  input: DistributeSpecialEditionInput,
  deps: GateDeps = {},
): Promise<DistributionResult> {
  // 0. 킬스위치 — DB·provider 접촉 전에 차단
  if (!isMagazineSendEnabled()) return disabled();

  const { edition, areaSignal, assetType, headline, brokerId } = input;
  const now = deps.now ?? new Date();
  const dryRun = deps.dryRun ?? isMagazineSendDryRun();

  // 1. 브로커·구독자 (에러는 throw)
  const broker = await loadBrokerIdentity(supabase, brokerId);
  if (!broker) throw new Error(`브로커 프로필을 찾을 수 없습니다: ${brokerId}`);
  const rawSubscribers = await loadActiveSubscribers(
    supabase,
    [broker.slug, broker.userId].filter((k): k is string => !!k),
  );

  // 2. 스마트 타깃 (태그 매칭 — 태그 없는 구독자 기본 제외)
  const targetedSubscribers = selectFlashTargets(rawSubscribers, {
    areaSignal,
    assetType,
    target: input.target,
    includeUntagged: input.includeUntagged,
  });
  const issueDate = edition.published_at ? toKstDate(new Date(edition.published_at)) : todayKst(now);

  const tally = emptyTally();
  if (targetedSubscribers.length === 0) {
    log.info(`[Special Distribution] No targeted subscribers matched for ${areaSignal}/${assetType}`);
    return {
      ok: true, dryRun, total: 0, totalTargets: 0, sent: 0, failed: 0, recorded: 0, blocked: {},
      kakaoSent: 0, kakaoSkipped: 0, emailSent: 0,
    };
  }

  // 3. 구독 티어 (Free는 이메일만)
  const { tier, isPaid } = await getBrokerSubscriptionTier(supabase, broker.userId ?? '');
  const targets = planTargets(targetedSubscribers, { allowKakao: isPaid }, tally);

  // 4. 속보 주 2회 상한 — 초과/원장 불가면 전원 차단(provider 미호출)
  const cap = await checkFlashWeeklyCap(supabase, { brokerId: broker.slug, editionId: edition.id }, { now, dryRun });
  if (!cap.ok) {
    tally.total += targets.length;
    addBlocked(tally, cap.blocked, targets.length);
  } else {
    const baseUrl = resolveBaseUrl();
    await runTargets(
      {
        supabase,
        broker,
        kind: 'flash',
        editionKey: `${broker.slug}:${issueDate}:flash:${edition.id}`,
        editionId: edition.id ?? null,
        baseUrl,
        edition: {
          title: headline,
          headline,
          marketTemp: '',
          date: issueDate,
          url: `${baseUrl}/magazine/${broker.slug}/${issueDate}`,
        },
        kakaoTemplateId: KAKAO_TEMPLATE_FLASH_ISSUE,
        gateDeps: deps,
      },
      targets,
      tally,
    );
  }

  // 5. 배포 이력(관측용) — 원장이 진실의 원천, 실패해도 결과 불변
  if (broker.userId) {
    const { error: logError } = await supabase.from('activity_events').insert({
      actor_id: broker.userId,
      actor_role: 'broker',
      event_type: 'special_magazine_distributed',
      entity_type: 'magazine_editions',
      metadata: {
        edition_id: edition.id,
        edition_label: edition.edition_label,
        building_id: input.buildingId,
        area_signal: areaSignal,
        asset_type: assetType,
        dry_run: dryRun,
        total_targets: tally.total,
        sent_count: tally.sent,
        recorded_count: tally.recorded,
        failed_count: tally.failed,
        blocked: tally.blocked,
      },
    });
    if (logError) log.warn('[Special Distribution] activity_events insert failed', logError.message);
  }

  log.info(
    `[Special Distribution] Finished: targets=${targetedSubscribers.length}, sent=${tally.sent}, recorded=${tally.recorded}, failed=${tally.failed}`,
    { blocked: tally.blocked },
  );
  return {
    ok: true,
    dryRun,
    total: tally.total,
    totalTargets: tally.total,
    sent: tally.sent,
    failed: tally.failed,
    recorded: tally.recorded,
    blocked: tally.blocked,
    kakaoSent: tally.kakao.sent,
    kakaoSkipped: tally.blocked.CHANNEL_NOT_AVAILABLE ?? 0,
    emailSent: tally.email.sent,
    isPaidTier: isPaid,
    tier,
  };
}

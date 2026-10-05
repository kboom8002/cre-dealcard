import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { assertOwnsRow, jsonError, notFoundResponse, requireBrokerContext } from '@/lib/magazine/authz';
import { isUuid } from '@/lib/magazine/slug';
import { maskPhone } from '@/lib/magazine/pii';
import { generateSpecialEdition } from '@/domain/magazine/special-edition-generator';
import { distributeSpecialEdition, selectFlashTargets } from '@/domain/magazine/distribute-special-edition';
import type { SubscriberRow, TargetSegment } from '@/domain/magazine/send-batch';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('route-special-magazine');

export const dynamic = 'force-dynamic';

const TARGETS: readonly TargetSegment[] = ['all', 'buyer', 'seller'];

/** building_ssot_lite 실제 컬럼(2026-10 스냅샷): owner_id, raw_address, area_signal, asset_type, price_band, layers */
interface BuildingRow {
  id: string;
  owner_id: string;
  raw_address: string | null;
  area_signal: string | null;
  asset_type: string | null;
  price_band: string | null;
  layers: Record<string, unknown> | null;
}

const BUILDING_SELECT = 'id, owner_id, raw_address, area_signal, asset_type, price_band, layers';

function priceDisplayOf(b: BuildingRow): string | null {
  if (b.price_band) return b.price_band;
  const v = b.layers?.askingPriceDisplay;
  return typeof v === 'string' && v ? v : null;
}

/**
 * GET /api/broker/magazine/special?buildingId=xxx[&includeUntagged=true&target=all|buyer|seller]
 * 특정 매물의 속보 타깃 독자 수 미리보기 `{ total, matched, hotLeads }` (본인 소유 매물만 — 타인 건물은 404)
 */
export async function GET(req: NextRequest) {
  try {
    const { ctx, error } = await requireBrokerContext(req, { requireSlug: true });
    if (error || !ctx) return error ?? jsonError('UNAUTHORIZED', '로그인이 필요합니다.', 401);

    const { searchParams } = new URL(req.url);
    const buildingId = searchParams.get('buildingId');
    if (!buildingId || !isUuid(buildingId)) {
      return jsonError('BAD_REQUEST', 'buildingId 파라미터가 올바르지 않습니다.', 400);
    }
    const includeUntagged = searchParams.get('includeUntagged') === 'true';
    const targetParam = searchParams.get('target') ?? 'all';
    if (!TARGETS.includes(targetParam as TargetSegment)) {
      return jsonError('BAD_REQUEST', 'target은 all, buyer, seller 중 하나여야 합니다.', 400);
    }
    const target = targetParam as TargetSegment;

    const supabase = createServiceClient();

    // 1. 매물 소유권 확인 (owner_id = 로그인 사용자). 불일치·없음은 모두 404
    const building = await assertOwnsRow<BuildingRow>(supabase, 'building_ssot_lite', buildingId, ctx, {
      keyColumn: 'owner_id',
      select: BUILDING_SELECT,
    });
    if (!building) return notFoundResponse('매물을 찾을 수 없습니다.');

    const areaSignal = building.area_signal;
    const assetType = building.asset_type;
    const priceDisplay = priceDisplayOf(building);

    // 2. 브로커의 활성 구독자 (select 에러는 삼키지 않는다)
    const { data: subscribers, error: subErr } = await supabase
      .from('magazine_subscribers')
      .select('id, subscriber_name, subscriber_phone, segment, channel, interest_profile')
      .in('broker_id', ctx.brokerKeys)
      .eq('status', 'active');
    if (subErr) {
      log.error('[GET /api/broker/magazine/special] subscriber query failed', subErr.message);
      return jsonError('INTERNAL_ERROR', '구독자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
    }
    const subList = (subscribers ?? []) as SubscriberRow[];

    // 3. 태그 매칭 (태그 없는 구독자는 includeUntagged 명시 시에만 포함). 권역·자산 정보가 없으면 매칭 불가
    const canMatch = !!areaSignal && !!assetType;
    const matched = canMatch
      ? selectFlashTargets(subList, { areaSignal: areaSignal as string, assetType: assetType as string, target, includeUntagged })
      : [];
    const untagged = subList.filter((s) => {
      const t = (s.interest_profile as { tags?: { regions?: unknown[]; assetTypes?: unknown[] } } | null)?.tags;
      return !(t?.regions?.length || t?.assetTypes?.length);
    }).length;

    const { getBuyerTemperature } = await import('@/domain/magazine/buyer-temperature');
    let hotLeads = 0;
    const matchedPreview = matched.map((s) => {
      const temp = getBuyerTemperature(s.interest_profile as never);
      if (temp.label === '🔥 적극검토' || temp.label === '📈 관심') hotLeads++;
      return {
        id: s.id,
        name: s.subscriber_name,
        phone: maskPhone(s.subscriber_phone),
        temperature: temp.label,
        badgeBg: temp.badgeBg,
        color: temp.color,
      };
    });

    const defaultHeadline =
      canMatch && priceDisplay ? `[단독 속보] ${areaSignal} ${assetType} (${priceDisplay})` : null;

    return NextResponse.json({
      building: {
        id: building.id,
        address: building.raw_address,
        areaSignal,
        assetType,
        priceDisplay,
      },
      total: subList.length,
      matched: matched.length,
      hotLeads,
      untagged,
      matchable: canMatch,
      matchedPreview: matchedPreview.slice(0, 10),
      defaultHeadline,
      // 하위 호환 키
      totalSubscribers: subList.length,
      targetCount: matched.length,
      hotLeadCount: hotLeads,
    });
  } catch (err: unknown) {
    log.error('[GET /api/broker/magazine/special] Error:', err instanceof Error ? err.message : String(err));
    return jsonError('INTERNAL_ERROR', '속보 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
  }
}

/**
 * POST /api/broker/magazine/special
 * 속보 매거진 생성 (+ 선택적 즉시 배포). autoDistribute 기본값은 **false** (S2-20) — 명시 true일 때만 배포 시도.
 * 배포는 sendGate(kind:'flash')를 경유하며 MAGAZINE_SEND_ENABLED=false면 생성만 남고 발송은 중지된다.
 */
export async function POST(req: NextRequest) {
  try {
    const { ctx, error } = await requireBrokerContext(req, { requireSlug: true });
    if (error || !ctx || !ctx.slug) return error ?? jsonError('UNAUTHORIZED', '로그인이 필요합니다.', 401);

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonError('BAD_REQUEST', '요청 본문이 올바르지 않습니다.', 400);
    }
    const buildingId = typeof body.buildingId === 'string' ? body.buildingId : '';
    if (!buildingId || !isUuid(buildingId)) {
      return jsonError('BAD_REQUEST', 'buildingId가 올바르지 않습니다.', 400);
    }
    const headline = typeof body.headline === 'string' ? body.headline : undefined;
    const urgentNote = typeof body.urgentNote === 'string' ? body.urgentNote : undefined;
    const autoDistribute = body.autoDistribute === true;
    const includeUntagged = body.includeUntagged === true;
    const target = (body.target ?? 'all') as TargetSegment;
    if (!TARGETS.includes(target)) {
      return jsonError('BAD_REQUEST', 'target은 all, buyer, seller 중 하나여야 합니다.', 400);
    }

    const supabase = createServiceClient();

    // 검증 선행(Rule 45): 소유권을 확인한 뒤에만 생성한다. 불일치는 404
    const building = await assertOwnsRow<BuildingRow>(supabase, 'building_ssot_lite', buildingId, ctx, {
      keyColumn: 'owner_id',
      select: BUILDING_SELECT,
    });
    if (!building) return notFoundResponse('매물을 찾을 수 없습니다.');

    if (autoDistribute && (!building.area_signal || !building.asset_type)) {
      return jsonError('BAD_REQUEST', '권역·자산유형 정보가 없는 매물은 자동 발송 대상을 계산할 수 없습니다.', 422);
    }

    // 1. 속보 에디션 생성
    const edition = await generateSpecialEdition({
      supabase,
      brokerId: ctx.slug,
      buildingId,
      urgentHeadline: headline,
      urgentNote,
    });

    // 2. 명시적 배포 요청인 경우에만 배포 수행
    if (!autoDistribute) {
      return NextResponse.json({ success: true, edition, distributionResult: null });
    }

    const distributionResult = await distributeSpecialEdition(supabase, {
      edition,
      buildingId,
      areaSignal: building.area_signal as string,
      assetType: building.asset_type as string,
      priceBand: building.price_band ?? '',
      headline: edition.title,
      brokerId: ctx.slug,
      target,
      includeUntagged,
    });

    if (!distributionResult.ok && distributionResult.blockedReason === 'SEND_DISABLED') {
      return NextResponse.json({
        success: false,
        blocked: 'SEND_DISABLED',
        message: distributionResult.message,
        published: edition.status === 'published',
        sent: 0,
        edition,
        distributionResult,
      });
    }

    return NextResponse.json({
      success: true,
      edition,
      dryRun: distributionResult.dryRun,
      sent: distributionResult.sent,
      failed: distributionResult.failed,
      blocked: distributionResult.blocked,
      distributionResult,
    });
  } catch (err: unknown) {
    log.error('[POST /api/broker/magazine/special] Error:', err instanceof Error ? err.message : String(err));
    return jsonError('INTERNAL_ERROR', '속보 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 500);
  }
}

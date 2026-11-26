import { NextRequest, NextResponse } from 'next/server';

import { createModuleLogger } from '@/lib/logger';
import { acquireCronIdempotencySlot, verifyCronRequest } from '@/lib/security/cron-auth';

const log = createModuleLogger('route');

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authFailure = verifyCronRequest(req);
  if (authFailure) return authFailure;

  try {
    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = createServiceClient();

    const bucketKey = new Date().toISOString().slice(0, 10);
    const slot = await acquireCronIdempotencySlot(supabase, 'consistency-check', bucketKey);
    if (!slot.acquired) {
      return NextResponse.json({ status: 'ok', skipped: 'DUPLICATE_SLOT', checked: 0, driftsFound: 0, drifts: [] });
    }

    const drifts: Array<{ buildingId: string; field: string; ssotValue: unknown; imValue: unknown }> = [];

    // 최근 갱신된 published IM 문서 가져오기 (최대 50건)
    const { data: recentDocs, error: docErr } = await supabase
      .from('document_objects')
      .select('id, building_id, content')
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(50);

    if (docErr || !recentDocs) {
      log.error('[consistency-check] Failed to query documents:', docErr);
      console.error('[consistency-check] Document query failed:', docErr);
      return NextResponse.json({ status: 'error', error: 'Document query failed' }, { status: 500 });
    }

    // 고유 building_id 배치 조회 (N+1 제거)
    const uniqueBuildingIds = Array.from(
      new Set(
        recentDocs
          .map((doc) => doc.building_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );

    const ssotById = new Map<string, { raw_address: unknown; layers: unknown }>();
    if (uniqueBuildingIds.length > 0) {
      const { data: ssotRows, error: ssotErr } = await supabase
        .from('building_ssot_lite')
        .select('id, raw_address, layers')
        .in('id', uniqueBuildingIds);

      if (ssotErr) {
        log.error('[consistency-check] Failed to query building_ssot_lite:', ssotErr);
      } else if (Array.isArray(ssotRows)) {
        for (const row of ssotRows) {
          if (row && typeof row.id === 'string') {
            ssotById.set(row.id, row);
          }
        }
      }
    }

    // 각 IM 문서에 대해 SSoT 데이터와 핵심 필드 비교
    for (const doc of recentDocs) {
      if (!doc.building_id) continue;

      const row = ssotById.get(doc.building_id);
      if (!row) continue;

      const layers =
        row.layers && typeof row.layers === 'object'
          ? (row.layers as Record<string, unknown>)
          : {};
      const finance =
        layers.finance && typeof layers.finance === 'object'
          ? (layers.finance as Record<string, unknown>)
          : undefined;

      const ssot = {
        address: row.raw_address,
        asking_price_krw: finance?.asking_price_krw,
        land_area_pyung: layers.land_area_pyung,
        total_floor_area_pyung: layers.total_floor_area_pyung,
      };

      const content = doc.content as Record<string, unknown> | null;
      if (!content) continue;

      const heroCard = content.heroCard as Record<string, unknown> | undefined;
      if (!heroCard) continue;

      // 주소 drift 검사
      if (ssot.address && heroCard.address && ssot.address !== heroCard.address) {
        drifts.push({
          buildingId: doc.building_id,
          field: 'address',
          ssotValue: ssot.address,
          imValue: heroCard.address,
        });
      }

      // 매각가 drift 검사
      if (
        ssot.asking_price_krw &&
        heroCard.askingPriceKrw &&
        Math.abs(Number(ssot.asking_price_krw) - Number(heroCard.askingPriceKrw)) > 1e6
      ) {
        drifts.push({
          buildingId: doc.building_id,
          field: 'askingPriceKrw',
          ssotValue: ssot.asking_price_krw,
          imValue: heroCard.askingPriceKrw,
        });
      }
    }

    if (drifts.length > 0) {
      log.warn(`[consistency-check] Found ${drifts.length} drift(s):`, drifts.slice(0, 10));
    } else {
      log.info('[consistency-check] No drifts found.');
    }

    return NextResponse.json({
      status: 'ok',
      checked: recentDocs.length,
      driftsFound: drifts.length,
      drifts: drifts.slice(0, 20),
    });
  } catch (err) {
    log.error('[consistency-check] Unexpected error:', err);
    console.error('[consistency-check] Internal server error:', err);
    return NextResponse.json({ status: 'error', error: 'Internal server error' }, { status: 500 });
  }
}

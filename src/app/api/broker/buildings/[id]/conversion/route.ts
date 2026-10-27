/**
 * GET /api/broker/buildings/[id]/conversion
 * Returns deal conversion probability for a building (P-X)
 * Also returns network recommendations (G-S) and similar deals (G-D)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractDealFeatures, snapshotDealFeatures } from '@/domain/prediction/deal-feature-extractor';
import { predictDealConversion } from '@/domain/prediction/deal-conversion-predictor';
import { getNetworkRecommendations } from '@/domain/graph/property-network';
import { findSimilarDeals } from '@/domain/graph/deal-semantic-search';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';
import { requireBroker } from '@/lib/auth-guard';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // P0-SEC SEC-2: 소유권은 building_ssot_lite.owner_id 직접 판정.
  // (이전: readWithMigration 결과의 존재하지 않는 broker_id 컬럼과 비교해 정당한 소유자도 항상 404)
  const ownership = await assertBuildingOwner<Record<string, any>>(supabase, (await params).id, user!.id, {
    allowAdmin: true,
    role: guard.role,
    select: 'id, owner_id, area_signal, asset_type, price_band',
  });
  if (!ownership.ok) return ownership.response;
  const building = ownership.row as any;

  try {
    // Run in parallel
    const [features, networkRecs, similarDeals] = await Promise.all([
      extractDealFeatures((await params).id),
      getNetworkRecommendations((await params).id, 5),
      findSimilarDeals({
        areaSignal: building.area_signal,
        assetType:  building.asset_type,
        priceBand:  building.price_band,
        limit: 5,
      }),
    ]);

    let conversion = null;
    if (features) {
      conversion = await predictDealConversion(features);
      // Save snapshot async (non-blocking)
      snapshotDealFeatures((await params).id).catch((e) => log.warn('[snapshot]', e));
    }

    return NextResponse.json({
      ok: true,
      conversion,
      networkRecommendations: networkRecs,
      similarDeals: similarDeals.deals,
      similarDealsMode: similarDeals.mode,
    });
  } catch (err) {
    log.error('[conversion]', err);
    return NextResponse.json({ error: '예측 중 오류가 발생했습니다' }, { status: 500 });
  }
}

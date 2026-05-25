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
import { requireBroker } from '@/lib/auth-guard';

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

  // Verify ownership
  const { data: building } = await supabase
    .from('building_ssot_lite')
    .select('id, area_signal, asset_type, price_band')
    .eq('id', (await params).id)
    .eq('broker_id', user!.id)
    .single();
  if (!building) return NextResponse.json({ error: '매물을 찾을 수 없습니다' }, { status: 404 });

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
      snapshotDealFeatures((await params).id).catch((e) => console.warn('[snapshot]', e));
    }

    return NextResponse.json({
      ok: true,
      conversion,
      networkRecommendations: networkRecs,
      similarDeals: similarDeals.deals,
      similarDealsMode: similarDeals.mode,
    });
  } catch (err) {
    console.error('[conversion]', err);
    return NextResponse.json({ error: '예측 중 오류가 발생했습니다' }, { status: 500 });
  }
}

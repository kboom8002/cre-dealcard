/**
 * GET /api/broker/buildings/rank
 * Returns broker's buildings sorted by promotion_score DESC
 * with match counts, pipeline stage, and vacancy status.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { promotionScoreLabel } from '@/domain/promotion/promotion-ranker';
import { requireBroker } from '@/lib/auth-guard';

function isOptionalSchemaError(err: { code?: unknown; message?: unknown } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '');
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST200' ||
    /column .* does not exist|could not find a relationship/i.test(msg)
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireBroker(request);
  if (auth.error) return auth.error;
  const { user, role } = auth;
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: '인증이 필요합니다.' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const buildQuery = (cols: string, orderByPromotion: boolean) => {
    let q: any = supabase.from('building_ssot_lite').select(cols);
    if (role !== 'admin' && typeof q.eq === 'function') {
      q = q.eq('owner_id', user.id);
    }
    if (typeof q.neq === 'function') {
      q = q.neq('status', 'archived');
    }
    if (typeof q.order === 'function') {
      q = orderByPromotion
        ? q.order('promotion_score', { ascending: false })
        : q.order('created_at', { ascending: false });
    }
    if (typeof q.limit === 'function') {
      q = q.limit(50);
    }
    return q;
  };

  let { data: buildings, error } = await buildQuery(
    `
      id,
      owner_id,
      status,
      area_signal,
      asset_type,
      price_band,
      vacancy_signal,
      promotion_score,
      matched_buyer_count,
      vacancy_inquiry_count,
      vacancy_avg_fit_score,
      vacancy_demand_verified,
      promotion_updated_at,
      created_at,
      deal_pipeline_states (
        stage,
        entered_at
      )
    `,
    true,
  );

  if (error && isOptionalSchemaError(error)) {
    const fallbackRes = await buildQuery(
      'id, owner_id, status, area_signal, asset_type, price_band, vacancy_signal, created_at',
      false,
    );
    buildings = fallbackRes.data;
    error = fallbackRes.error;
  }

  if (error) {
    console.error('[buildings/rank] Query failed:', error);
    return NextResponse.json(
      { ok: false, error: '매물 순위 정보를 불러오지 못했습니다.' },
      { status: 500 },
    );
  }

  const enriched = (Array.isArray(buildings) ? buildings : []).map((b: any) => {
    const pipeline = Array.isArray(b.deal_pipeline_states)
      ? b.deal_pipeline_states[0] ?? null
      : null;

    const holdDays = pipeline?.entered_at
      ? Math.floor((Date.now() - new Date(pipeline.entered_at).getTime()) / 86_400_000)
      : 0;

    return {
      id: b.id,
      areaSignal: b.area_signal,
      assetType: b.asset_type,
      priceBand: b.price_band,
      vacancySignal: b.vacancy_signal,
      promotionScore: b.promotion_score ?? 0,
      promotionLabel: promotionScoreLabel(b.promotion_score ?? 0),
      matchedBuyerCount: b.matched_buyer_count ?? 0,
      vacancyInquiryCount: b.vacancy_inquiry_count ?? 0,
      vacancyAvgFitScore: b.vacancy_avg_fit_score ?? null,
      vacancyDemandVerified: b.vacancy_demand_verified ?? false,
      currentStage: pipeline?.stage ?? null,
      holdDays,
      holdAlert: holdDays >= 14,
    };
  });

  return NextResponse.json({ ok: true, buildings: enriched });
}

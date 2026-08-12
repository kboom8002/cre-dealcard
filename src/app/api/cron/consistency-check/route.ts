import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = createServiceClient();
    const drifts: Array<{ buildingId: string; field: string; ssotValue: unknown; imValue: unknown }> = [];

    // 최근 갱신된 published IM 문서 가져오기 (최대 50건)
    const { data: recentDocs, error: docErr } = await supabase
      .from('document_objects')
      .select('id, building_id, content')
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(50);

    if (docErr || !recentDocs) {
      console.error('[consistency-check] Failed to query documents:', docErr);
      return NextResponse.json({ status: 'error', error: 'Document query failed' }, { status: 500 });
    }

    // 각 IM 문서에 대해 SSoT 데이터와 핵심 필드 비교
    for (const doc of recentDocs) {
      if (!doc.building_id) continue;

      const { data: ssot, error: ssotErr } = await supabase
        .from('building_ssot_lite')
        .select('address, asking_price_krw, land_area_pyung, total_floor_area_pyung')
        .eq('id', doc.building_id)
        .single();

      if (ssotErr || !ssot) continue;

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
      if (ssot.asking_price_krw && heroCard.askingPriceKrw &&
          Math.abs(Number(ssot.asking_price_krw) - Number(heroCard.askingPriceKrw)) > 1e6) {
        drifts.push({
          buildingId: doc.building_id,
          field: 'askingPriceKrw',
          ssotValue: ssot.asking_price_krw,
          imValue: heroCard.askingPriceKrw,
        });
      }
    }

    if (drifts.length > 0) {
      console.warn(`[consistency-check] Found ${drifts.length} drift(s):`, drifts.slice(0, 10));
    } else {
      console.info('[consistency-check] No drifts found.');
    }

    return NextResponse.json({
      status: 'ok',
      checked: recentDocs.length,
      driftsFound: drifts.length,
      drifts: drifts.slice(0, 20),
    });
  } catch (err) {
    console.error('[consistency-check] Unexpected error:', err);
    return NextResponse.json({ status: 'error', error: 'Internal server error' }, { status: 500 });
  }
}

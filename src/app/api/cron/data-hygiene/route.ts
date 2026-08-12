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
    const results: Record<string, unknown> = {};

    // 1. 30일 이상 draft 상태인 IM 문서 경고 목록 추출
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleDrafts, error: draftErr } = await supabase
      .from('document_objects')
      .select('id, building_id, created_at')
      .eq('status', 'draft')
      .lt('updated_at', thirtyDaysAgo)
      .limit(100);

    if (draftErr) {
      console.error('[data-hygiene] Failed to query stale drafts:', draftErr);
    }
    results.staleDrafts = staleDrafts?.length ?? 0;

    // 2. pending_confirmation 상태 14일 초과 OCR 데이터 만료 처리
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: expiredOcr, error: ocrErr } = await supabase
      .from('building_ssot_lite')
      .select('id')
      .eq('ocr_status', 'pending_confirmation')
      .lt('updated_at', fourteenDaysAgo)
      .limit(100);

    if (!ocrErr && expiredOcr && expiredOcr.length > 0) {
      const expiredIds = expiredOcr.map((r: { id: string }) => r.id);
      const { error: updateErr } = await supabase
        .from('building_ssot_lite')
        .update({ ocr_status: 'expired' })
        .in('id', expiredIds);

      if (updateErr) {
        console.error('[data-hygiene] Failed to expire OCR records:', updateErr);
      }
      results.expiredOcrRecords = expiredIds.length;
    } else {
      results.expiredOcrRecords = 0;
    }

    // 3. 비활성 골든셋 중 90일 이상 미사용 건 정리
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleGolden, error: goldenErr } = await supabase
      .from('im_golden_sets')
      .select('id')
      .eq('is_active', false)
      .lt('updated_at', ninetyDaysAgo)
      .limit(200);

    if (!goldenErr && staleGolden && staleGolden.length > 0) {
      const staleIds = staleGolden.map((r: { id: string }) => r.id);
      const { error: deleteErr } = await supabase
        .from('im_golden_sets')
        .delete()
        .in('id', staleIds);

      if (deleteErr) {
        console.error('[data-hygiene] Failed to delete stale golden sets:', deleteErr);
      }
      results.deletedGoldenSets = staleIds.length;
    } else {
      results.deletedGoldenSets = 0;
    }

    console.info('[data-hygiene] Completed:', results);
    return NextResponse.json({ status: 'ok', results });
  } catch (err) {
    console.error('[data-hygiene] Unexpected error:', err);
    return NextResponse.json({ status: 'error', error: 'Internal server error' }, { status: 500 });
  }
}

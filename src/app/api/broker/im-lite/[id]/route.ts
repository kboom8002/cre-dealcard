import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const service = createServiceClient();

    // id can be building_id or document id
    const { data: docs, error } = await service
      .from('document_objects')
      .select('id, building_id, document_type, title, body, status, created_at')
      .or(`building_id.eq.${id},id.eq.${id}`)
      .in('document_type', ['im_lite', 'mobile_im', 'im_approval', 'blind_teaser'])
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      documents: (docs || []).map((d) => ({
        id: d.id,
        created_at: d.created_at,
        status: d.status,
        body: d.body,
        tier: (d.body as any)?.tier || 'basic',
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 인증 확인 (App Router 표준 세션)
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const service = createServiceClient();

    // 대상 IM 문서 조회
    const { data: doc, error: fetchErr } = await service
      .from('document_objects')
      .select('id, owner_id, building_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !doc) {
      return NextResponse.json({ error: '투자설명서(IM)를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 소유권 확인: doc.owner_id 또는 연결된 building_ssot_lite의 owner_id 일치 여부
    let isOwner = doc.owner_id === user.id;
    if (!isOwner && doc.building_id) {
      const { data: bldg } = await service
        .from('building_ssot_lite')
        .select('owner_id')
        .eq('id', doc.building_id)
        .maybeSingle();
      if (bldg && bldg.owner_id === user.id) {
        isOwner = true;
      }
    }

    if (!isOwner) {
      return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 });
    }

    // 연관 데이터 선삭제 (참조 무결성)
    await Promise.allSettled([
      service.from('full_im_handoffs').delete().contains('source_document_ids', [id]),
      service.from('im_golden_sets').delete().eq('document_id', id),
    ]);

    // 메인 문서 삭제 시도
    const { error: deleteErr } = await service
      .from('document_objects')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      console.warn('[im-lite/delete] Hard delete failed, falling back to soft delete:', deleteErr.message);
      const { error: softDeleteErr } = await service
        .from('document_objects')
        .update({ status: 'archived' })
        .eq('id', id);

      if (softDeleteErr) {
        console.error('[im-lite/delete] Soft delete failed:', softDeleteErr);
        return NextResponse.json({ error: `삭제 실패: ${softDeleteErr.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, message: 'IM이 삭제되었습니다.' });
  } catch (err: any) {
    console.error('[im-lite/delete] Unexpected error:', err);
    return NextResponse.json({ error: `삭제 중 오류가 발생했습니다: ${err.message}` }, { status: 500 });
  }
}

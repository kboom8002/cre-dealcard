import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireBroker } from '@/lib/auth-guard';
import { assertBuildingOwner, assertDocOwner } from '@/lib/authz/assert-owner';
import { softDeleteWorkspaceItem } from '@/lib/workspace/workspace-repository';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    // P0-SEC: 인증 + 소유권 (이전: 무인증으로 매물/문서 id 의 모든 IM 본문 반환)
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const userId = guard.user!.id;
    const service = createServiceClient();

    // id 는 매물(building_ssot_lite) id 또는 문서(document_objects) id 일 수 있다.
    const buildingCheck = await assertBuildingOwner(service, id, userId, { allowAdmin: true, role: guard.role });
    let scope: 'building' | 'document';
    if (buildingCheck.ok) {
      scope = 'building';
    } else if (buildingCheck.status === 404) {
      const docCheck = await assertDocOwner(service, id, userId, {
        allowAdmin: true,
        role: guard.role,
        allowBuildingOwner: true,
      });
      if (!docCheck.ok) return docCheck.response;
      scope = 'document';
    } else {
      return buildingCheck.response;
    }

    let docsQuery: any = service
      .from('document_objects')
      .select('id, building_id, document_type, title, body, status, created_at')
      .eq(scope === 'building' ? 'building_id' : 'id', id)
      .in('document_type', ['im_lite', 'mobile_im'])
      .order('created_at', { ascending: false });
    if (typeof docsQuery.limit === 'function') {
      docsQuery = docsQuery.limit(5);
    }
    const { data: docs, error } = await docsQuery;

    if (error) {
      // WP-7.3D P2-7: no raw DB error text to clients.
      log.error('[im-lite/get] document_objects query failed:', { code: error.code, message: error.message, id });
      return NextResponse.json({ error: 'IM 문서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      documents: (docs || []).map((d: any) => ({
        id: d.id,
        created_at: d.created_at,
        status: d.status,
        body: d.body,
        tier: (d.body as any)?.tier || 'basic',
      })),
    });
  } catch (err: any) {
    log.error('[im-lite/get] Unexpected error:', err);
    return NextResponse.json({ error: 'IM 문서 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const userId = guard.user!.id;
    const isAdmin = guard.role === 'admin';

    const service = createServiceClient();

    // 소유권 확인 (Admin 패리티 + 연결 매물 소유자 포함)
    const docCheck = await assertDocOwner(service, id, userId, {
      allowAdmin: true,
      role: guard.role,
      allowBuildingOwner: true,
    });
    if (!docCheck.ok) {
      return docCheck.response;
    }

    const { data: doc } = await service
      .from('document_objects')
      .select('id, building_id')
      .eq('id', id)
      .maybeSingle();

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
      log.warn('[im-lite/delete] Hard delete failed, falling back to soft delete:', deleteErr.message);
      const { error: softDeleteErr } = await service
        .from('document_objects')
        .update({ status: 'archived' })
        .eq('id', id);

      if (softDeleteErr) {
        log.error('[im-lite/delete] Soft delete failed:', softDeleteErr);
        return NextResponse.json({ error: 'IM 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 });
      }
    }

    // workspace_items soft-delete 동기화
    await softDeleteWorkspaceItem(service, {
      id,
      userId,
      isAdmin,
      kind: 'im',
      requireExisting: false,
    }).catch(() => {});
    if (doc?.building_id && doc.building_id !== id) {
      await softDeleteWorkspaceItem(service, {
        id: doc.building_id,
        userId,
        isAdmin,
        kind: 'im',
        requireExisting: false,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, message: 'IM이 삭제되었습니다.' });
  } catch (err: any) {
    log.error('[im-lite/delete] Unexpected error:', err);
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 });
  }
}

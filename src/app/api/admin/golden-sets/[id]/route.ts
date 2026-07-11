/**
 * GET    /api/admin/golden-sets/[id]  — 단일 Golden Set 조회
 * PATCH  /api/admin/golden-sets/[id]  — Golden Set 수정
 * DELETE /api/admin/golden-sets/[id]  — 소프트 삭제 (is_active = false)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';

const SELECT_FIELDS = [
  'id', 'document_id', 'building_id', 'section_type', 'section_alias',
  'asset_type', 'price_band', 'markdown', 'judge_score', 'was_edited',
  'source_type', 'tags', 'version', 'usage_count', 'last_used_at',
  'is_active', 'source_file_name', 'created_at', 'approved_at',
].join(', ');

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('im_golden_sets')
      .select(SELECT_FIELDS)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { ok: false, error: { code: 'NOT_FOUND', message: '해당 Golden Set을 찾을 수 없습니다.' } },
          { status: 404 },
        );
      }
      throw error;
    }

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[GET /api/admin/golden-sets/[id]]', message);
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL', message } },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const body = await req.json();

    const allowedFields = [
      'markdown', 'judge_score', 'tags', 'is_active',
      'section_type', 'asset_type', 'price_band', 'section_alias',
    ] as const;

    // Pick only allowed fields from the body
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION', message: '수정할 필드가 없습니다.' } },
        { status: 400 },
      );
    }

    // When markdown changes: bump version, mark was_edited
    if ('markdown' in updates) {
      const supabase = createServiceClient();
      const { data: current, error: fetchErr } = await supabase
        .from('im_golden_sets')
        .select('version')
        .eq('id', id)
        .single();

      if (fetchErr) {
        if (fetchErr.code === 'PGRST116') {
          return NextResponse.json(
            { ok: false, error: { code: 'NOT_FOUND', message: '해당 Golden Set을 찾을 수 없습니다.' } },
            { status: 404 },
          );
        }
        throw fetchErr;
      }

      updates.version = (current?.version ?? 0) + 1;
      updates.was_edited = true;
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('im_golden_sets')
      .update(updates)
      .eq('id', id)
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { ok: false, error: { code: 'NOT_FOUND', message: '해당 Golden Set을 찾을 수 없습니다.' } },
          { status: 404 },
        );
      }
      throw error;
    }

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[PATCH /api/admin/golden-sets/[id]]', message);
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL', message } },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const supabase = createServiceClient();

    const { error } = await supabase
      .from('im_golden_sets')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ ok: true, success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[DELETE /api/admin/golden-sets/[id]]', message);
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL', message } },
      { status: 500 },
    );
  }
}

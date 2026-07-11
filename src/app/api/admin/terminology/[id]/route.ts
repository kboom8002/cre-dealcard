/**
 * GET    /api/admin/terminology/[id]  — 용어 규칙 단일 조회
 * PATCH  /api/admin/terminology/[id]  — 용어 규칙 수정
 * DELETE /api/admin/terminology/[id]  — 용어 규칙 삭제
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('im_terminology_rules')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ ok: false, error: '규칙을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[terminology-detail-api] GET error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const body = await req.json();
    const { pattern, replacement, category, priority, is_regex, is_active, note } = body;

    const supabase = createServiceClient();

    const updatePayload: Record<string, any> = {};
    if (pattern !== undefined) updatePayload.pattern = pattern;
    if (replacement !== undefined) updatePayload.replacement = replacement;
    if (category !== undefined) updatePayload.category = category;
    if (priority !== undefined) updatePayload.priority = priority;
    if (is_regex !== undefined) updatePayload.is_regex = is_regex;
    if (is_active !== undefined) updatePayload.is_active = is_active;
    if (note !== undefined) updatePayload.note = note;

    const { data, error } = await supabase
      .from('im_terminology_rules')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    console.error('[terminology-detail-api] PATCH error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const supabase = createServiceClient();

    // 실제 삭제 대신 is_active=false로 soft delete 수행
    const { error } = await supabase
      .from('im_terminology_rules')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ ok: true, message: '비활성화 완료' });
  } catch (err: any) {
    console.error('[terminology-detail-api] DELETE error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

/**
 * GET    /api/broker/pptx-preset/[id] - 단일 프리셋 조회
 * PUT    /api/broker/pptx-preset/[id] - 프리셋 업데이트
 * DELETE /api/broker/pptx-preset/[id] - 프리셋 삭제
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireBroker } from '@/lib/auth-guard';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const user = guard.user!;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from('pptx_custom_presets')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Preset not found' }, { status: 404 });

  // 접근 권한 확인 (내 것 또는 같은 법인)
  if (data.user_id !== user.id && !data.is_public) {
    // 같은 법인인지 확인
    const { data: myPreset } = await supabase
      .from('pptx_custom_presets')
      .select('company_id')
      .eq('user_id', user.id)
      .eq('company_id', data.company_id)
      .maybeSingle();
    if (!myPreset) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // use_count 증가 (백그라운드)
  supabase.from('pptx_custom_presets').update({ use_count: (data.use_count ?? 0) + 1 }).eq('id', id);

  return NextResponse.json({ preset: data });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const user = guard.user!;

  const body = await req.json();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from('pptx_custom_presets')
    .update({
      ...body,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)  // 내 것만 수정 가능
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 });

  return NextResponse.json({ preset: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const user = guard.user!;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from('pptx_custom_presets')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

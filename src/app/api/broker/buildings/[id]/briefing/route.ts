/**
 * GET /api/broker/buildings/[id]/briefing
 * Returns cross-system AI briefing for a specific building
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateDealBriefing } from '@/domain/briefing/deal-briefing-generator';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify ownership
  const { data: building } = await supabase
    .from('building_ssot_lite')
    .select('id')
    .eq('id', params.id)
    .eq('broker_id', user.id)
    .single();

  if (!building) {
    return NextResponse.json({ error: '매물을 찾을 수 없습니다' }, { status: 404 });
  }

  try {
    const briefing = await generateDealBriefing(params.id, user.id);
    return NextResponse.json({ ok: true, briefing });
  } catch (err) {
    console.error('[briefing] error', err);
    return NextResponse.json({ error: '브리핑 생성 중 오류가 발생했습니다' }, { status: 500 });
  }
}

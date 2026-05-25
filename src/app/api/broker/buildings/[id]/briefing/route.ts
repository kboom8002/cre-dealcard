/**
 * GET /api/broker/buildings/[id]/briefing
 * Returns cross-system AI briefing for a specific building
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateDealBriefing } from '@/domain/briefing/deal-briefing-generator';
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
    .select('id')
    .eq('id', (await params).id)
    .eq('broker_id', user!.id)
    .single();

  if (!building) {
    return NextResponse.json({ error: '매물을 찾을 수 없습니다' }, { status: 404 });
  }

  try {
    const briefing = await generateDealBriefing((await params).id, user!.id);
    return NextResponse.json({ ok: true, briefing });
  } catch (err) {
    console.error('[briefing] error', err);
    return NextResponse.json({ error: '브리핑 생성 중 오류가 발생했습니다' }, { status: 500 });
  }
}

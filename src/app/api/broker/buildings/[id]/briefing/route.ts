/**
 * GET /api/broker/buildings/[id]/briefing
 * Returns cross-system AI briefing for a specific building
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateDealBriefing } from '@/domain/briefing/deal-briefing-generator';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';
import { requireBroker } from '@/lib/auth-guard';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


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

  // P0-SEC SEC-2: 소유권은 building_ssot_lite.owner_id 직접 판정.
  // (이전: readWithMigration 결과의 존재하지 않는 broker_id 컬럼과 비교해 정당한 소유자도 항상 404)
  const ownership = await assertBuildingOwner(supabase, (await params).id, user!.id, {
    allowAdmin: true,
    role: guard.role,
  });
  if (!ownership.ok) return ownership.response;

  try {
    const briefing = await generateDealBriefing((await params).id, user!.id);
    return NextResponse.json({ ok: true, briefing });
  } catch (err) {
    log.error('[briefing] error', err);
    return NextResponse.json({ error: '브리핑 생성 중 오류가 발생했습니다' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireBroker } from '@/lib/auth-guard';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('pro-grant-approve');
const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBroker(req);
  if (guard.error) {
    return guard.error;
  }

  try {
    const supabase = createServiceClient();
    const { id: grantId } = await params;

    if (!grantId) {
      return NextResponse.json({ ok: false, error: 'Missing grant ID' }, { status: 400 });
    }
    if (!SAFE_ID_RE.test(grantId)) {
      return NextResponse.json({ ok: false, error: '유효하지 않은 권한 ID입니다.' }, { status: 400 });
    }

    // Fetch target grant and verify ownership FAIL-CLOSED (admin bypasses)
    const { data: existingGrant, error: fetchErr } = await supabase
      .from('im_pro_grants')
      .select('id, broker_id, tenant_id, deal_id, building_id')
      .eq('id', grantId)
      .maybeSingle();

    if (fetchErr) {
      log.error('[pro-grant] Grant lookup failed:', fetchErr);
      return NextResponse.json(
        { ok: false, error: '권한 요청 정보를 확인하지 못했습니다.' },
        { status: 500 },
      );
    }

    if (!existingGrant) {
      return NextResponse.json({ ok: false, error: 'Grant not found' }, { status: 404 });
    }

    let ownerBrokerId: string | null =
      (existingGrant.broker_id as string | null | undefined) ||
      (existingGrant.tenant_id as string | null | undefined) ||
      null;

    // Fallback to parent building_ssot_lite.owner_id or deals.broker_id when grant stores FK only
    if (!ownerBrokerId && existingGrant.building_id) {
      const { data: bRow } = await supabase
        .from('building_ssot_lite')
        .select('owner_id')
        .eq('id', existingGrant.building_id)
        .maybeSingle();
      ownerBrokerId = (bRow?.owner_id as string | null | undefined) || null;
    }
    if (!ownerBrokerId && existingGrant.deal_id) {
      const { data: dRow } = await supabase
        .from('deals')
        .select('broker_id')
        .eq('id', existingGrant.deal_id)
        .maybeSingle();
      ownerBrokerId = (dRow?.broker_id as string | null | undefined) || null;
    }

    const isAdmin = guard.role === 'admin';
    if (!isAdmin && (!ownerBrokerId || !guard.user?.id || ownerBrokerId !== guard.user.id)) {
      return NextResponse.json(
        { ok: false, error: '본인 소유의 딜 권한 요청만 승인할 수 있습니다.', code: 'FORBIDDEN' },
        { status: 403 },
      );
    }

    // Approve the Pro-IM grant on im_pro_grants
    const { data: grant, error } = await supabase
      .from('im_pro_grants')
      .update({
        status: 'approved',
      })
      .eq('id', grantId)
      .select()
      .maybeSingle();

    if (error) {
      log.error('[pro-grant] Supabase update failed:', error);
      return NextResponse.json(
        { ok: false, error: '권한 승인 처리 중 오류가 발생했습니다.' },
        { status: 500 },
      );
    }

    if (!grant) {
      return NextResponse.json({ ok: false, error: 'Grant not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: grantId, status: 'approved', grant });
  } catch (err) {
    log.error('[pro-grant] Approve Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}

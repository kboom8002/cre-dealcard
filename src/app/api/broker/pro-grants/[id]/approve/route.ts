import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireBroker } from '@/lib/auth-guard';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';
import { createModuleLogger } from '@/lib/logger';
import {
  issueOrRefreshProGrant,
  parseGateReasonRequesterMeta,
  resolveProGrantByAnyId,
} from '@/domain/gate/im-pro-grant-service';

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

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const isAdmin = guard.role === 'admin';

    // Resolve by grant id, gate_request_id, or building_id
    const resolved = await resolveProGrantByAnyId(supabase, grantId);
    const existingGrant = resolved.grant;

    if (existingGrant) {
      let ownerBrokerId: string | null =
        (existingGrant.broker_id as string | null | undefined) ||
        (existingGrant.tenant_id as string | null | undefined) ||
        null;

      const parentBuildingId = existingGrant.building_id || resolved.buildingId;
      if (!ownerBrokerId && parentBuildingId) {
        const { data: bRow } = await supabase
          .from('building_ssot_lite')
          .select('owner_id')
          .eq('id', parentBuildingId)
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

      if (!isAdmin && (!ownerBrokerId || !guard.user?.id || ownerBrokerId !== guard.user.id)) {
        return NextResponse.json(
          { ok: false, error: '본인 소유의 딜 권한 요청만 승인할 수 있습니다.', code: 'FORBIDDEN' },
          { status: 403 },
        );
      }

      const issued = await issueOrRefreshProGrant(supabase, {
        grantId: String(existingGrant.id),
        gateRequestId: existingGrant.gate_request_id ?? resolved.gateRequest?.id ?? null,
        buildingId: parentBuildingId ?? existingGrant.deal_id ?? null,
        dealId: existingGrant.deal_id ?? null,
        requesterId: existingGrant.requester_id ?? null,
        requesterName: existingGrant.requester_name ?? null,
        requesterEmail: existingGrant.requester_email ?? null,
        requesterPhone: existingGrant.requester_phone ?? null,
        brokerId: ownerBrokerId || guard.user!.id,
        ttlHours: 72,
        maxDownloads: typeof existingGrant.max_downloads === 'number' ? existingGrant.max_downloads : 5,
        status: existingGrant.nda_signed_at ? 'active' : 'pending_nda',
      });

      if (!issued.ok || !issued.grant) {
        log.error('[pro-grant] Grant refresh failed:', issued.error);
        return NextResponse.json(
          { ok: false, error: '권한 승인 처리 중 오류가 발생했습니다.' },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        id: String(issued.grant.id),
        status: String(issued.grant.status || (existingGrant.nda_signed_at ? 'active' : 'pending_nda')),
        grant: issued.grant,
        ...(issued.grantToken ? { grantToken: issued.grantToken } : {}),
      });
    }

    // No pre-created im_pro_grants row: create one if gate_request or explicit buildingId exists
    const bodyBuildingId = typeof body?.buildingId === 'string' ? body.buildingId.trim() : '';
    const targetBuildingId = resolved.gateRequest?.building_id || bodyBuildingId || null;
    if (!targetBuildingId) {
      return NextResponse.json({ ok: false, error: 'Grant not found' }, { status: 404 });
    }

    const ownership = await assertBuildingOwner(supabase, targetBuildingId, guard.user!.id, {
      allowAdmin: true,
      role: guard.role,
    });
    if (!ownership.ok) return ownership.response;

    const reasonMeta = parseGateReasonRequesterMeta(resolved.gateRequest?.reason);
    const issued = await issueOrRefreshProGrant(supabase, {
      gateRequestId: resolved.gateRequest?.id ?? null,
      buildingId: targetBuildingId,
      requesterId:
        resolved.gateRequest?.requester_id ??
        (typeof body?.requesterId === 'string' ? body.requesterId.trim() : null),
      requesterName:
        reasonMeta.name ??
        (typeof body?.requesterName === 'string' ? body.requesterName.trim() : null),
      requesterEmail:
        reasonMeta.email ??
        (typeof body?.requesterEmail === 'string' ? body.requesterEmail.trim() : null),
      requesterPhone:
        reasonMeta.phone ??
        (typeof body?.requesterPhone === 'string' ? body.requesterPhone.trim() : null),
      brokerId: ownership.ownerId || guard.user!.id,
      ttlHours: 72,
      maxDownloads: 5,
      status: 'pending_nda',
    });

    if (!issued.ok || !issued.grant) {
      log.error('[pro-grant] Grant issuance failed:', issued.error);
      return NextResponse.json(
        { ok: false, error: '권한 발급 처리 중 오류가 발생했습니다.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      id: String(issued.grant.id),
      status: String(issued.grant.status || 'pending_nda'),
      grant: issued.grant,
      ...(issued.grantToken ? { grantToken: issued.grantToken } : {}),
    });
  } catch (err) {
    log.error('[pro-grant] Approve Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}

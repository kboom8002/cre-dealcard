/**
 * GET /api/public/im-pro/[grantId]
 * Returns Pro IM data after NDA verification
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getIMRenderPolicy } from '@/domain/building/im-render-policy';
import { readWithMigration } from '@/lib/ssot-adapter';
import { generateProIMWatermark } from '@/domain/gate/nda-watermark';
import { logGateAccess } from '@/domain/gate/gate-audit-logger';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ grantId: string }> },
) {
  try {
    const { grantId } = await params;
    const supabase = createServiceClient();

    // Fetch grant
    const { data: grant, error } = await supabase
      .from('im_pro_grants')
      .select('*, deals!inner(id, asset_id, broker_id)')
      .eq('id', grantId)
      .single();

    if (error || !grant) {
      return NextResponse.json({ error: 'Grant not found' }, { status: 404 });
    }

    // Status check
    if (grant.status !== 'active') {
      return NextResponse.json({
        error: 'Grant not active',
        status: grant.status,
        requiresNDA: !grant.nda_signed_at,
      }, { status: 403 });
    }

    // Expiry check
    if (grant.expires_at && new Date(grant.expires_at) < new Date()) {
      await supabase.from('im_pro_grants').update({ status: 'expired' }).eq('id', grantId);
      return NextResponse.json({ error: 'Grant expired' }, { status: 410 });
    }

    // NDA check
    if (!grant.nda_signed_at) {
      return NextResponse.json({
        error: 'NDA not signed',
        requiresNDA: true,
        grantId,
      }, { status: 403 });
    }

    // Get render policy
    const policy = getIMRenderPolicy('pro', true);

    // Fetch building data
    const { data: buildingData } = await readWithMigration(grant.deals?.asset_id || '');
    const building = buildingData as any;

    // Fetch IM document
    const { data: imDoc } = await supabase
      .from('document_objects')
      .select('*')
      .eq('building_id', grant.deals?.asset_id || '')
      .in('document_type', ['mobile_im', 'im_lite', 'im_lite_draft', 'blind_teaser', 'im_pro'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Watermark seed via nda-watermark module
    const wm = generateProIMWatermark({
      requesterName: grant.requester_name || 'Confidential Viewer',
      requesterPhone: grant.requester_phone || '010-0000-0000',
      dealId: grant.deals?.id || grant.deal_id || '',
      grantId,
    });
    const watermarkSeed = wm.formattedDisplay;

    // Gate audit log & View count 증가 (비동기 — 응답 차단 없음)
    logGateAccess(supabase, {
      gateRequestId: grant.gate_request_id || grantId,
      accessorId: grant.requester_id || grantId,
      buildingId: grant.deals?.asset_id || '',
      accessedFields: ['im_pro', 'layers', 'lease_summary'],
      accessType: 'view',
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
      userAgent: req.headers.get('user-agent') || undefined,
    }).catch(() => {});

    supabase
      .from('activity_events')
      .insert({
        event_type: 'im_pro_viewed',
        entity_type: 'im_pro_grant',
        entity_id: grantId,
        source_app: 'web'
      })
      .then(() => {}, (err) => console.error('Failed to insert view event:', err));

    return NextResponse.json({
      ok: true,
      grant: {
        id: grant.id,
        requesterName: grant.requester_name,
        expiresAt: grant.expires_at,
        pdfExportAllowed: grant.pdf_export_allowed !== false,
      },
      renderPolicy: policy,
      building: building ? {
        id: building.id,
        areaSignal: building.area_signal,
        assetType: building.asset_type,
        priceBand: building.price_band,
        layers: building.layers,
        leaseSummary: building.lease_summary,
      } : null,
      imDocument: imDoc?.body || null,
      watermarkSeed,
      dcfEligible: imDoc?.body?.dcfEligible ?? false,
      dataGrade: imDoc?.body?.dataGrade ?? null,
    });
  } catch (error) {
    console.error('im-pro fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

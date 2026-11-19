/**
 * GET /api/public/im-pro/[grantId]
 * Returns Pro IM data after NDA verification
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getIMRenderPolicy } from '@/domain/building/im-render-policy';
import { readWithMigration } from '@/lib/ssot-adapter';
import { generateProIMWatermark } from '@/domain/gate/nda-watermark';
import { logGateAccess } from '@/domain/gate/gate-audit-logger';
import {
  resolveProGrantByAnyId,
  verifyProGrantViewerAccess,
} from '@/domain/gate/im-pro-grant-service';
import { resolvePublishedImProDocument } from '@/app/api/public/im-pro/_lib/im-pro-doc-guard';
import { filterHiddenImSections, normalizeHiddenSectionSet } from '@/lib/im-lite/im-public-guard';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ grantId: string }> },
) {
  try {
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip')?.trim() ||
      'unknown';
    const rateAllowed = await checkRateLimit(clientIp, 'im_pro_view', 60, 60_000);
    if (!rateAllowed) {
      return NextResponse.json(
        {
          ok: false,
          code: 'RATE_LIMITED',
          error: '요청이 일시적으로 많습니다. 잠시 후 다시 시도해 주세요.',
        },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const { grantId } = await params;
    const supabase = createServiceClient();

    // Strict grant lookup (IDOR closure: never resolve by buildingId/dealId)
    const resolved = await resolveProGrantByAnyId(supabase, grantId, {
      allowBuildingLookup: false,
    });
    const grant = resolved.grant;

    if (!grant) {
      return NextResponse.json({ error: 'Grant not found' }, { status: 404 });
    }

    const effectiveGrantId = String(grant.id || grantId);

    // Status & revocation check
    if (grant.is_revoked === true || grant.status === 'revoked') {
      return NextResponse.json({ error: 'Grant revoked' }, { status: 403 });
    }
    if (grant.status !== 'active') {
      return NextResponse.json(
        {
          error: 'Grant not active',
          status: grant.status,
          requiresNDA: !grant.nda_signed_at,
          grantId: effectiveGrantId,
          expiresAt: grant.expires_at ?? null,
        },
        { status: 403 },
      );
    }

    // Expiry check
    if (grant.expires_at && new Date(grant.expires_at) < new Date()) {
      await supabase.from('im_pro_grants').update({ status: 'expired' }).eq('id', effectiveGrantId);
      return NextResponse.json({ error: 'Grant expired' }, { status: 410 });
    }

    // NDA check
    if (!grant.nda_signed_at) {
      return NextResponse.json(
        {
          error: 'NDA not signed',
          requiresNDA: true,
          grantId: effectiveGrantId,
          expiresAt: grant.expires_at ?? null,
        },
        { status: 403 },
      );
    }

    // Fail-closed token / authorized session gate once grant is active and NDA-signed
    const access = await verifyProGrantViewerAccess(req, grant);
    if (!access.ok) {
      return NextResponse.json(
        {
          error: access.error || 'Grant token required',
          code: access.code || 'GRANT_TOKEN_REQUIRED',
        },
        { status: access.status || 403 },
      );
    }

    // Optional deal lookup only when building_id is absent
    let dealRow: { id?: string; asset_id?: string; broker_id?: string } | null = null;
    if (!grant.building_id && grant.deal_id) {
      try {
        const { data: dRow } = await supabase
          .from('deals')
          .select('id, asset_id, broker_id')
          .eq('id', grant.deal_id)
          .maybeSingle();
        dealRow = dRow ?? null;
      } catch {
        dealRow = null;
      }
    }

    const targetBuildingId = String(
      grant.building_id || dealRow?.asset_id || resolved.buildingId || '',
    ).trim();

    // Get render policy
    const policy = getIMRenderPolicy('pro', true);

    // Fetch building data (best-effort when building_ssot_lite row exists)
    const { data: buildingData } = targetBuildingId
      ? await readWithMigration(targetBuildingId)
      : { data: null };
    const building = buildingData as any;

    // Fetch IM document (strict status allowlist + revocation + workspace guard)
    const imDocGuard = await resolvePublishedImProDocument({
      supabase,
      buildingId: targetBuildingId,
      quickLookupId: grant.building_id || targetBuildingId,
    });
    if (!imDocGuard.ok) {
      return NextResponse.json({ error: imDocGuard.error }, { status: imDocGuard.status });
    }
    const imDoc = imDocGuard.doc;

    // Watermark seed via nda-watermark module
    const wm = generateProIMWatermark({
      requesterName: grant.requester_name || 'Confidential Viewer',
      requesterPhone: grant.requester_phone || '010-0000-0000',
      dealId: dealRow?.id || grant.deal_id || targetBuildingId,
      grantId: effectiveGrantId,
    });
    const watermarkSeed = wm.formattedDisplay;

    // Gate audit log & View count 증가 (비동기 — 응답 차단 없음)
    logGateAccess(supabase, {
      gateRequestId: grant.gate_request_id || effectiveGrantId,
      accessorId: grant.requester_id || effectiveGrantId,
      buildingId: targetBuildingId,
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
        entity_id: effectiveGrantId,
        source_app: 'web',
      })
      .then(() => {}, (err: unknown) => console.error('Failed to insert view event:', err));

    const rawImBody =
      imDoc?.body && typeof imDoc.body === 'object' && !Array.isArray(imDoc.body)
        ? (imDoc.body as Record<string, unknown>)
        : null;
    const imHiddenSet = normalizeHiddenSectionSet(rawImBody);
    const filteredImDocument =
      rawImBody && imHiddenSet.size > 0 && Array.isArray(rawImBody.sections)
        ? {
            ...rawImBody,
            hiddenSections: Array.from(imHiddenSet),
            sections: filterHiddenImSections(
              rawImBody.sections as Array<Record<string, unknown>>,
              imHiddenSet,
            ),
          }
        : rawImBody;

    return NextResponse.json({
      ok: true,
      grant: {
        id: grant.id,
        requesterName: grant.requester_name,
        expiresAt: grant.expires_at,
        pdfExportAllowed: grant.pdf_export_allowed !== false,
        maxDownloads:
          typeof grant.max_downloads === 'number' && grant.max_downloads > 0
            ? grant.max_downloads
            : 5,
        downloadCount:
          typeof grant.download_count === 'number' && grant.download_count >= 0
            ? grant.download_count
            : 0,
      },
      renderPolicy: policy,
      building: building
        ? {
            id: building.id,
            areaSignal: building.area_signal,
            assetType: building.asset_type,
            priceBand: building.price_band,
            layers: building.layers,
            leaseSummary: building.lease_summary,
          }
        : null,
      imDocument: filteredImDocument,
      watermarkSeed,
      dcfEligible: imDoc?.body?.dcfEligible ?? false,
      dataGrade: imDoc?.body?.dataGrade ?? null,
    });
  } catch (error) {
    console.error('im-pro fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

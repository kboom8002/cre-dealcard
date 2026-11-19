/**
 * GET /api/public/im-pro/[grantId]/pptx
 * 
 * Mobile IM Pro PPTX 다운로드 (워터마크 포함)
 * Grant 검증 + NDA 확인 + pdf_export_allowed 확인
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { checkRateLimit } from '@/lib/rate-limiter';
import type { ReleaseTier } from '@/domain/building/im-core';

import { createModuleLogger } from '@/lib/logger';
import { resolvePublishedImProDocument } from '@/app/api/public/im-pro/_lib/im-pro-doc-guard';
import {
  consumeProGrantDownload,
  resolveProGrantByAnyId,
  verifyProGrantViewerAccess,
} from '@/domain/gate/im-pro-grant-service';
const log = createModuleLogger('route');

export const runtime = 'nodejs';
export const maxDuration = 300; // Pro 24p 덱 + 이미지 최적화 대응

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ grantId: string }> }
) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const rateAllowed = await checkRateLimit(ip, 'im_pro_pptx', 10, 60_000);
  if (!rateAllowed) {
    return NextResponse.json(
      {
        ok: false,
        code: 'RATE_LIMITED',
        error: 'Rate limit exceeded',
        reason: '요청이 일시적으로 많습니다. 잠시 후 다시 시도해 주세요.',
      },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const { grantId } = await params;
  const preset = req.nextUrl.searchParams.get('preset') || undefined;

  const supabase = createServiceClient();

  // 1. Verify grant strictly by grant id/token/gate_request_id (never by building_id)
  const resolved = await resolveProGrantByAnyId(supabase, grantId, {
    allowBuildingLookup: false,
  });
  const grant = resolved.grant && resolved.grant.status === 'active' ? resolved.grant : null;

  if (!grant) {
    return NextResponse.json({ error: 'Grant not found or inactive' }, { status: 404 });
  }
  const effectiveGrantId = String(grant.id || grantId);
  if (grant.is_revoked === true) {
    return NextResponse.json({ error: 'Grant revoked' }, { status: 403 });
  }
  if (!grant.nda_signed_at) {
    return NextResponse.json({ error: 'NDA signing required' }, { status: 403 });
  }
  if (grant.pdf_export_allowed === false) {
    return NextResponse.json({ error: 'PPTX export not permitted' }, { status: 403 });
  }
  if (grant.expires_at && new Date(grant.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Grant expired' }, { status: 410 });
  }

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

  const maxDownloads =
    typeof grant.max_downloads === 'number' && Number.isFinite(grant.max_downloads) && grant.max_downloads > 0
      ? grant.max_downloads
      : 5;
  const grantDownloadCount =
    typeof grant.download_count === 'number' && Number.isFinite(grant.download_count) && grant.download_count >= 0
      ? grant.download_count
      : 0;
  if (grantDownloadCount >= maxDownloads) {
    return NextResponse.json(
      {
        error: '다운로드 횟수 초과',
        limit: maxDownloads,
        used: grantDownloadCount,
      },
      { status: 429 }
    );
  }

  // 2. Resolve building_id from deal_id -> deals.asset_id (or direct building_id if available)
  let buildingId: string | null = grant.building_id || resolved.buildingId || null;
  if (!buildingId && grant.deal_id) {
    const { data: deal } = await supabase
      .from('deals')
      .select('asset_id')
      .eq('id', grant.deal_id)
      .maybeSingle();
    buildingId = deal?.asset_id || null;
  }
  if (!buildingId) {
    return NextResponse.json({ error: 'Cannot resolve building from grant' }, { status: 404 });
  }

  // 3. Fetch IM document (strict published/sent/approved allowlist + revocation + workspace guard)
  const docGuard = await resolvePublishedImProDocument({
    supabase,
    buildingId,
    quickLookupId: grant.building_id || buildingId,
  });
  if (!docGuard.ok) {
    return NextResponse.json(
      { error: docGuard.error },
      { status: docGuard.status }
    );
  }
  const doc: any = docGuard.doc;

  // 4. Fetch building + scrub Dangsan poison coordinates (Rule 46)
  const { data: buildingRow } = await supabase
    .from('building_ssot_lite')
    .select('*')
    .eq('id', buildingId)
    .maybeSingle();

  const rawAddr = String(
    doc.body?.ssot_summary?.address ||
    doc.body?.resolved_address ||
    doc.body?.address ||
    buildingRow?.raw_address ||
    buildingRow?.address ||
    ''
  ).trim();
  let coordLat = Number(doc.body?.coordinates?.lat ?? doc.body?.ssot_summary?.coordinates?.lat ?? buildingRow?.lat ?? 0) || null;
  let coordLng = Number(doc.body?.coordinates?.lng ?? doc.body?.ssot_summary?.coordinates?.lng ?? buildingRow?.lng ?? 0) || null;
  let resolvedPnu = String(doc.body?.ssot_summary?.pnu || doc.body?.pnu || buildingRow?.pnu || '').trim() || null;

  const isDangsanOrYeongdeungpoAddr = /당산|영등포/.test(rawAddr);
  const isDangsanPoisonCoord =
    coordLat != null &&
    coordLng != null &&
    Math.abs(coordLat - 37.534) < 0.002 &&
    Math.abs(coordLng - 126.902) < 0.002;
  const isDangsanPoisonPnu = resolvedPnu === '1156011500100110047';

  if (!isDangsanOrYeongdeungpoAddr && (isDangsanPoisonCoord || isDangsanPoisonPnu)) {
    coordLat = null;
    coordLng = null;
    if (isDangsanPoisonPnu) {
      resolvedPnu = null;
    }
    if (doc.body && typeof doc.body === 'object') {
      doc.body = { ...doc.body };
      delete doc.body.coordinates;
      if (doc.body.pnu === '1156011500100110047') {
        delete doc.body.pnu;
      }
      if (doc.body.ssot_summary && typeof doc.body.ssot_summary === 'object') {
        doc.body.ssot_summary = { ...doc.body.ssot_summary };
        delete doc.body.ssot_summary.coordinates;
        if (doc.body.ssot_summary.pnu === '1156011500100110047') {
          delete doc.body.ssot_summary.pnu;
        }
      }
      if (doc.body.enrichment && typeof doc.body.enrichment === 'object') {
        doc.body.enrichment = { ...doc.body.enrichment };
        delete doc.body.enrichment.cadastralMapImage;
      }
    }
  }

  const building = buildingRow
    ? {
        ...buildingRow,
        raw_address: buildingRow.raw_address || rawAddr,
        address: rawAddr || buildingRow.raw_address,
        pnu: resolvedPnu,
        lat: coordLat,
        lng: coordLng,
      }
    : doc.body?.ssot_summary || rawAddr
    ? {
        id: buildingId,
        owner_id: doc.owner_id ?? null,
        raw_address: rawAddr,
        address: rawAddr,
        pnu: resolvedPnu,
        lat: coordLat,
        lng: coordLng,
        investment_posture:
          doc.body?.ssot_summary?.investment_posture ||
          doc.body?.investmentPosture ||
          'income',
      }
    : null;

  // 브로커 연락처 SSoT resolver — 실제 DB 값만, 부재 시 생략
  const ownerId = doc?.broker_id ?? doc?.owner_id ?? building?.owner_id;
  const { fetchBrokerContact, toPptxBrokerInput } = await import('@/domain/broker/broker-contact');
  const broker = toPptxBrokerInput(await fetchBrokerContact(supabase, ownerId)) ?? null;

  // 6. 다운로드 횟수 제한 (grant.max_downloads ?? 5, grant.download_count + activity_events 병행 검증)
  let eventCount = 0;
  try {
    const aeTable: any = supabase.from('activity_events');
    if (aeTable && typeof aeTable.select === 'function') {
      const { count } = await aeTable
        .select('id', { count: 'exact', head: true })
        .eq('entity_id', effectiveGrantId)
        .in('event_type', ['im_pro_pptx_exported', 'im_pro_pdf_exported']);
      eventCount = count ?? 0;
    }
  } catch {
    eventCount = 0;
  }

  const effectiveUsed = Math.max(grantDownloadCount, eventCount);
  if (effectiveUsed >= maxDownloads) {
    return NextResponse.json({
      error: '다운로드 횟수 초과',
      limit: maxDownloads,
      used: effectiveUsed,
    }, { status: 429 });
  }

  // doc.body에서 posture/grade 등 덱 시퀀스 분기 파라미터 추출 (Grade D 차단 선행)
  const body = doc.body ?? {};
  const posture = body.investmentPosture
    ?? body.posture
    ?? body.identity?.investmentPosture
    ?? body.ssot_summary?.investment_posture
    ?? building?.investment_posture
    ?? 'income';

  const grade = body.dataGrade ?? body.dataCompleteness?.qualityGrade ?? body.qualityGrade ?? body.grade ?? 'B';
  if (grade === 'D') {
    return NextResponse.json({ error: 'Grade D documents cannot be exported to PPTX [G30]' }, { status: 422 });
  }

  // Atomic pre-render download quota consumption (aborts early on 429 before PPTX CPU work)
  const quotaRes = await consumeProGrantDownload(
    supabase,
    effectiveGrantId,
    maxDownloads,
    effectiveUsed,
  );
  if (!quotaRes.ok) {
    return NextResponse.json(
      {
        error: quotaRes.error || '다운로드 횟수 초과',
        limit: quotaRes.limit,
        used: quotaRes.used,
      },
      { status: 429 },
    );
  }

  // 4. Generate PPTX with watermark
  try {
    const { MobileImPptxRenderer } = await import('@/domain/building/mobile-im/pptx/pptx-renderer');
    const renderer = new MobileImPptxRenderer();
    
    const phoneLast4 = (grant.requester_phone || '0000').slice(-4);
    const timestamp = new Date().toISOString().slice(0, 16);

    const result = await renderer.render({
      buildingId,
      isPro: true, // P-C1 fix: Pro 시퀀스(30~40면) 활성화
      preset,
      posture,
      grade,
      incomeArchetype: body.incomeArchetype,
      hasViolation: body.hasViolation ?? body.violationStatus === 'exists',
      hasJointCollateral: body.hasJointCollateral ?? false,
      releaseTier: (body.releaseTier as ReleaseTier) || 'decision_im',
      docno: body.docno ?? `IM-${buildingId.substring(0, 6).toUpperCase()}`,
      doc: {
        title: doc.title || body.buildingName || 'Mobile IM Pro',
        body,
        sections: body.sections,
      },
      building: building || undefined,
      broker: broker || undefined,
      watermark: {
        requesterName: grant.requester_name || 'Unknown',
        phoneLast4,
        timestamp,
      },
      supabase,
      logoUrl: body.logoUrl ?? (broker as any)?.logo_url,
    });

    // 5. Upload to storage (best-effort)
    const ts = Date.now();
    const filePath = `im-pptx/${buildingId}/pro_${effectiveGrantId}_${ts}.pptx`;

    try {
      if (supabase.storage?.from) {
        await supabase.storage
          .from('Exports')
          .upload(filePath, result.buffer, {
            contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            upsert: true,
          });
      }
    } catch {
      // Non-blocking storage upload
    }

    try {
      await supabase.from('activity_events').insert({
        event_type: 'im_pro_pptx_exported',
        entity_type: 'im_pro_grant',
        entity_id: effectiveGrantId,
        building_ssot_lite_id: buildingId,
        metadata: {
          grant_id: effectiveGrantId,
          actor_name: grant.requester_name || '',
          exportedAt: new Date().toISOString(),
          slideCount: result.slideCount,
          fileSizeBytes: result.fileSizeBytes,
          userAgent: req.headers.get('user-agent'),
        },
        source_app: 'web'
      });
    } catch {
      // Non-blocking event logging
    }

    // 7. Return PPTX
    const buildingName = doc.title || doc.body?.buildingName || 'Mobile_IM';
    const safeFilename = buildingName.replace(/[^a-zA-Z0-9\u3131-\u318E\u3200-\u321E\uAC00-\uD7A3]/g, '_') + '_Pro.pptx';

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Slide-Count': String(result.slideCount || 0),
        'X-File-Size': String(result.fileSizeBytes || result.buffer.byteLength),
      },
    });
  } catch (err: any) {
    log.error('[PPTX Pro] Generation failed:', err);
    return NextResponse.json(
      { error: 'PPTX generation failed' },
      { status: 500 }
    );
  }
}

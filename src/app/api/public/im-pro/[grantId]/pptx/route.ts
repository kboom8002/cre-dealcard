/**
 * GET /api/public/im-pro/[grantId]/pptx
 * 
 * Mobile IM Pro PPTX 다운로드 (워터마크 포함)
 * Grant 검증 + NDA 확인 + pdf_export_allowed 확인
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ grantId: string }> }
) {
  const { grantId } = await params;
  const preset = req.nextUrl.searchParams.get('preset') || undefined;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 1. Verify grant
  const { data: grant } = await supabase
    .from('im_pro_grants')
    .select('*')
    .eq('id', grantId)
    .eq('status', 'active')
    .maybeSingle();

  if (!grant) {
    return NextResponse.json({ error: 'Grant not found or inactive' }, { status: 404 });
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

  // 2. Resolve building_id from deal_id -> deals.asset_id (or direct building_id if available)
  let buildingId: string | null = grant.building_id || null;
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

  // 3. Fetch IM document
  const { data: doc } = await supabase
    .from('document_objects')
    .select('*')
    .eq('building_id', buildingId)
    .in('document_type', ['mobile_im', 'im_lite_draft', 'blind_teaser'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!doc?.body) {
    return NextResponse.json({ error: 'IM document not found' }, { status: 404 });
  }

  // 4. Fetch building + broker
  const { data: building } = await supabase
    .from('building_ssot_lite')
    .select('owner_id, area_signal, asset_type, price_band')
    .eq('id', buildingId)
    .maybeSingle();

  let broker = null;
  if (building?.owner_id) {
    const { data: bp } = await supabase
      .from('broker_profiles')
      .select('display_name, company_name, phone, specialty')
      .eq('user_id', building.owner_id)
      .maybeSingle();
    broker = bp;
  }

  // 4. Generate PPTX with watermark
  try {
    const { MobileImPptxRenderer } = await import('@/domain/building/mobile-im/pptx/pptx-renderer');
    const renderer = new MobileImPptxRenderer();
    
    const phoneLast4 = (grant.requester_phone || '0000').slice(-4);
    const timestamp = new Date().toISOString().slice(0, 16);

    const result = await renderer.render({
      buildingId,
      tier: 'pro',
      preset,
      doc: {
        title: doc.title || doc.body?.buildingName || 'Mobile IM Pro',
        body: doc.body,
        sections: doc.body?.sections,
      },
      building: building || undefined,
      broker: broker || undefined,
      watermark: {
        requesterName: grant.requester_name || 'Unknown',
        phoneLast4,
        timestamp,
      },
    });

    // 5. Upload to storage
    const ts = Date.now();
    const filePath = `im-pptx/${grant.building_id}/pro_${grantId}_${ts}.pptx`;
    
    await supabase.storage
      .from('Exports')
      .upload(filePath, result.buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        upsert: true,
      });

    // 6. Log event
    await supabase.from('activity_events').insert({
      event_type: 'im_pro_pptx_exported',
      grant_id: grantId,
      building_id: grant.building_id,
      actor_name: grant.requester_name,
      metadata: {
        exportedAt: new Date().toISOString(),
        slideCount: result.slideCount,
        fileSizeBytes: result.fileSizeBytes,
        userAgent: req.headers.get('user-agent'),
      },
    });

    // 7. Return PPTX
    const buildingName = doc.title || doc.body?.buildingName || 'Mobile_IM';
    const safeFilename = buildingName.replace(/[^a-zA-Z0-9\u3131-\u318E\u3200-\u321E\uAC00-\uD7A3]/g, '_') + '_Pro.pptx';

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch (err: any) {
    console.error('[PPTX Pro] Generation failed:', err);
    return NextResponse.json(
      { error: 'PPTX generation failed', message: err.message },
      { status: 500 }
    );
  }
}

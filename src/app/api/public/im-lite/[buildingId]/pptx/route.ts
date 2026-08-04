/**
 * GET /api/public/im-lite/[buildingId]/pptx?doc_id=xxx&tier=basic&preset=golden_institutional
 *
 * Mobile IM PPTX 다운로드 (Basic / Pro)
 * Vercel Pro: runtime=nodejs, maxDuration=300
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300;  // Vercel Pro — 24p Pro 덱 대응

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  const { buildingId } = await params;
  const searchParams = req.nextUrl.searchParams;
  const docId = searchParams.get('doc_id');
  const tier = (searchParams.get('tier') ?? 'basic') as 'basic' | 'pro';
  const preset = searchParams.get('preset') || 'credeal_signature';

  // Create Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 1. Fetch document
  let docQuery = supabase
    .from('document_objects')
    .select('*')
    .eq('building_id', buildingId)
    .in('document_type', ['mobile_im', 'im_lite_draft', 'blind_teaser']);

  if (docId) {
    docQuery = docQuery.eq('id', docId);
  } else {
    docQuery = docQuery.order('created_at', { ascending: false }).limit(1);
  }

  const { data: doc } = await docQuery.maybeSingle();
  if (!doc?.body) {
    return NextResponse.json({ error: 'IM document not found' }, { status: 404 });
  }

  // 2. Fetch building info
  const { data: building } = await supabase
    .from('building_ssot_lite')
    .select('owner_id, area_signal, asset_type, price_band')
    .eq('id', buildingId)
    .maybeSingle();

  // 3. Fetch broker profile
  let broker = null;
  if (building?.owner_id) {
    const { data: bp } = await supabase
      .from('broker_profiles')
      .select('display_name, company_name, phone, specialty')
      .eq('user_id', building.owner_id)
      .maybeSingle();
    broker = bp;
  }

  // 4. Import and run renderer
  try {
    const { MobileImPptxRenderer } = await import(
      '@/domain/building/mobile-im/pptx/pptx-renderer'
    );
    const renderer = new MobileImPptxRenderer();

    // IM body에서 posture, grade 등 메타데이터 추출
    const body = doc.body ?? {};
    const posture = body.investmentPosture ?? body.posture ?? 'income';
    const grade = body.qualityGrade ?? body.grade ?? 'B';
    const incomeArchetype = body.incomeArchetype ?? undefined;
    const hasViolation = body.hasViolation ?? body.violationStatus === 'exists';
    const hasJointCollateral = body.hasJointCollateral ?? false;

    const result = await renderer.render({
      buildingId,
      tier,
      preset,
      posture,
      grade,
      incomeArchetype,
      hasViolation,
      hasJointCollateral,
      docno: body.docno ?? `IM-${buildingId.substring(0, 6).toUpperCase()}`,
      doc: {
        title: doc.title || body.buildingName || 'Mobile IM',
        body,
        sections: body.sections,
      },
      building: building || undefined,
      broker: broker || undefined,
      watermark: tier === 'pro'
        ? {
            requesterName: searchParams.get('requester') || 'CREDEAL',
            phoneLast4: searchParams.get('phone4') || '0000',
            timestamp: new Date().toISOString().split('T')[0],
          }
        : undefined,
      provenance: body.provenance ?? {},
    });

    // 5. Upload to Supabase Storage (Direct-to-Storage 패턴)
    const timestamp = Date.now();
    const filePath = `im-pptx/${buildingId}/${tier}_${timestamp}.pptx`;

    const { data: upload, error: uploadError } = await supabase.storage
      .from('Exports')
      .upload(filePath, result.buffer, {
        contentType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        upsert: true,
      });

    if (uploadError) {
      console.warn('[PPTX] Storage upload failed, returning direct download:', uploadError);
    }

    // 6. Return PPTX as direct download
    const buildingName = doc.title || body.buildingName || 'Mobile_IM';
    const safeName =
      buildingName.replace(
        /[^a-zA-Z0-9\u3131-\u318E\u3200-\u321E\uAC00-\uD7A3]/g,
        '_'
      ) + `_${tier === 'pro' ? 'Pro' : 'Basic'}.pptx`;

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        'Cache-Control': 'no-store',
        'X-Slide-Count': String(result.slideCount),
        'X-File-Size': String(result.fileSizeBytes),
        'X-Warnings': encodeURIComponent(JSON.stringify(result.warnings.slice(0, 10))),
      },
    });
  } catch (err: any) {
    console.error(`[PPTX ${tier}] Generation failed:`, err);
    return NextResponse.json(
      { error: 'PPTX generation failed', message: err.message },
      { status: 500 }
    );
  }
}

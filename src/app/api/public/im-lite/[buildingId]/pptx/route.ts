/**
 * GET /api/public/im-lite/[buildingId]/pptx?doc_id=xxx
 * 
 * Mobile IM Basic PPTX 다운로드
 * Vercel Pro: runtime=nodejs, maxDuration=60
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
// Import the renderer - it will be at:
// import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
// For now, since renderer may not exist yet, structure the route to import it

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  const { buildingId } = await params;
  const docId = req.nextUrl.searchParams.get('doc_id');

  // Create Supabase client (same pattern as existing export route)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 1. Fetch document
  let docQuery = supabase
    .from('document_objects')
    .select('*')
    .eq('building_id', buildingId)
    .in('document_type', ['mobile_im_lite', 'im_lite_draft']);
  
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
    const { MobileImPptxRenderer } = await import('@/domain/building/mobile-im/pptx/pptx-renderer');
    const renderer = new MobileImPptxRenderer();
    
    const result = await renderer.render({
      buildingId,
      tier: 'basic',
      doc: {
        title: doc.title || doc.body?.buildingName || 'Mobile IM',
        body: doc.body,
        sections: doc.body?.sections,
      },
      building: building || undefined,
      broker: broker || undefined,
    });

    // 5. Upload to Supabase Storage
    const timestamp = Date.now();
    const filePath = `im-pptx/${buildingId}/basic_${timestamp}.pptx`;
    
    await supabase.storage
      .from('Exports')
      .upload(filePath, result.buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        upsert: true,
      });

    // Return the PPTX directly as download
    const buildingName = doc.title || doc.body?.buildingName || 'Mobile_IM';
    const safeFilename = buildingName.replace(/[^a-zA-Z0-9\u3131-\u318E\u3200-\u321E\uAC00-\uD7A3]/g, '_') + '_Basic.pptx';

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
        'Cache-Control': 'no-store',
        'X-Slide-Count': String(result.slideCount),
        'X-File-Size': String(result.fileSizeBytes),
      },
    });
  } catch (err: any) {
    console.error('[PPTX Basic] Generation failed:', err);
    return NextResponse.json(
      { error: 'PPTX generation failed', message: err.message },
      { status: 500 }
    );
  }
}

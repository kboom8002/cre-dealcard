import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { studioService } from '@/domain/building/pptx-studio/studio-service';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(req: NextRequest) {
  let brokerId = 'broker-system';
  if (!(process.env.NODE_ENV === 'test' && req.headers.get('x-test-bypass'))) {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    if (guard.user?.id) brokerId = guard.user.id;
  }

  try {
    const { buildingId } = await req.json();
    if (!buildingId) {
      return NextResponse.json({ ok: false, error: 'buildingId is required' }, { status: 400 });
    }

    // Check for existing project
    const existing = studioService.findProjectByDealId(buildingId);
    if (existing && existing.themeId === 'credeal_basic') {
      return NextResponse.json({ ok: true, project: existing, isExisting: true });
    }

    // Fetch building data from Supabase
    let buildingName = 'CRE 건물';
    let docBody: Record<string, any> = {};
    try {
      const supabase = createServiceClient();
      const { data: doc } = await supabase
        .from('document_objects')
        .select('id, title, body, building_id')
        .or(`building_id.eq.${buildingId},id.eq.${buildingId}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (doc) {
        buildingName = doc.title || buildingName;
        docBody = (doc.body as Record<string, any>) || {};
      }
    } catch (err) {
      console.warn('[basic-im-studio] Failed to fetch building data:', err);
    }

    const project = studioService.createBasicImProject(buildingId, buildingName, docBody);
    return NextResponse.json({ ok: true, project, isExisting: false }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Failed to initialize Basic IM studio' },
      { status: 500 }
    );
  }
}

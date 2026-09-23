import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { studioService } from '@/domain/building/pptx-studio/studio-service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let brokerId = 'broker-system';
  if (!(process.env.NODE_ENV === 'test' && req.headers.get('x-test-bypass'))) {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    if (guard.user?.id) brokerId = guard.user.id;
  }

  const { id } = await params;
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const slideId = formData.get('slideId') as string;
    const fieldName = (formData.get('fieldName') as string) || 'mapImageUrl';

    if (!file || !slideId) {
      return NextResponse.json(
        { ok: false, error: 'file and slideId are required' },
        { status: 400 }
      );
    }

    // Convert to base64 data URL for in-memory storage
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = file.type || 'image/png';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    let project;
    try { project = await studioService.getProject(id); }
    catch { project = await studioService.findProjectByDealId(id); }
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }

    const updated = await studioService.patchSlideOverrides(
      project.id, slideId, { [fieldName]: dataUrl }
    );

    return NextResponse.json({
      ok: true,
      url: dataUrl.slice(0, 50) + '...',
      project: updated,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Map upload failed' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import type { MobileIMSection } from '@/domain/building/mobile-im/types';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const { id } = await params;
  let sections: MobileIMSection[];
  let newTitle: string | undefined;
  let hiddenSections: string[] | undefined;
  let photos: Array<{ url: string; caption?: string; order?: number }> | undefined;
  let ogTitle: string | undefined;
  let ogDescription: string | undefined;
  let heroTitle: string | undefined;
  let heroSubtitle: string | undefined;
  let keyInvestmentPoint: string | undefined;

  try {
    const body = await req.json();
    sections = body.sections;
    newTitle = body.title;
    hiddenSections = body.hidden_sections;
    photos = body.photos;
    ogTitle = body.ogTitle;
    ogDescription = body.ogDescription;
    heroTitle = body.heroTitle;
    heroSubtitle = body.heroSubtitle;
    keyInvestmentPoint = body.keyInvestmentPoint;
    if (!sections || !Array.isArray(sections)) {
      return NextResponse.json({ error: "Invalid 'sections' payload" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: doc, error: fetchErr } = await supabase
    .from('document_objects')
    .select('id, owner_id, broker_id, body')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const ownerId = doc.broker_id ?? doc.owner_id;
  if (ownerId !== guard.user!.id) {
    return NextResponse.json({ error: 'Forbidden: not your document' }, { status: 403 });
  }

  const content = (doc.body as Record<string, unknown>) || {};
  
  const updatedContent = {
    ...content,
    sections: sections,
    ...(newTitle ? { title: newTitle } : {}),
    ...(hiddenSections !== undefined ? { hidden_sections: hiddenSections } : {}),
    ...(photos !== undefined ? { photos } : {}),
    ...(ogTitle !== undefined ? { ogTitle } : {}),
    ...(ogDescription !== undefined ? { ogDescription } : {}),
    ...(heroTitle !== undefined ? { heroTitle } : {}),
    ...(heroSubtitle !== undefined ? { heroSubtitle } : {}),
    ...(keyInvestmentPoint !== undefined ? { heroCard: { ...((content as Record<string, any>).heroCard || {}), keyInvestmentPoint } } : {}),
  };

  const { error: updateErr } = await supabase
    .from('document_objects')
    .update({
      ...(newTitle ? { title: newTitle } : {}),
      body: updatedContent,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: '섹션이 성공적으로 저장되었습니다.',
  });
}

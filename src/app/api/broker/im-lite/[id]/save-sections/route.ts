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

  try {
    const body = await req.json();
    sections = body.sections;
    newTitle = body.title;
    if (!sections || !Array.isArray(sections)) {
      return NextResponse.json({ error: "Invalid 'sections' payload" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: doc, error: fetchErr } = await supabase
    .from('document_objects')
    .select('id, owner_id, broker_id, content')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const ownerId = doc.broker_id ?? doc.owner_id;
  if (ownerId !== guard.user!.id) {
    return NextResponse.json({ error: 'Forbidden: not your document' }, { status: 403 });
  }

  const content = (doc.content as Record<string, unknown>) || {};
  
  // Merge the updated sections back into the content
  const updatedContent = {
    ...content,
    sections: sections,
    ...(newTitle ? { title: newTitle } : {}),
  };

  const { error: updateErr } = await supabase
    .from('document_objects')
    .update({
      content: updatedContent,
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

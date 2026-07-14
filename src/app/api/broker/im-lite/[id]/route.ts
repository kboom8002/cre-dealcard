import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: doc, error: fetchErr } = await supabase
    .from('document_objects')
    .select('id, owner_id')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  if (doc.owner_id !== guard.user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error: deleteErr } = await supabase
    .from('document_objects')
    .delete()
    .eq('id', id);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: 'IM이 삭제되었습니다.' });
}

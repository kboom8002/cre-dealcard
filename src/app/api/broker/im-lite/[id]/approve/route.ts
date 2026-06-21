/**
 * POST /api/broker/im-lite/[id]/approve
 * { action: 'approve' | 'reject', broker_notes?: string }
 * Updates document_objects status to 'published' or 'revision_needed'.
 * Requires broker auth.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const { id } = await params;
  let action: string;
  let brokerNotes: string | undefined;

  try {
    const body = await req.json();
    action = body.action;
    brokerNotes = body.broker_notes;
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Ensure the document belongs to this broker
  const { data: doc, error: fetchErr } = await supabase
    .from('document_objects')
    .select('id, owner_id, status')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  if (doc.owner_id !== guard.user!.id) {
    return NextResponse.json({ error: 'Forbidden: not your document' }, { status: 403 });
  }

  const newStatus = action === 'approve' ? 'broker_reviewed' : 'draft';

  const { error: updateErr } = await supabase
    .from('document_objects')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id,
    status: newStatus,
    message: action === 'approve' ? 'IM이 승인되어 공개되었습니다.' : '수정 요청이 등록되었습니다.',
  });
}

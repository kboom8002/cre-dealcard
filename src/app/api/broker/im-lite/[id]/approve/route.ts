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
    .select('id, owner_id, broker_id, status, metadata')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const ownerId = doc.broker_id ?? doc.owner_id;
  if (ownerId !== guard.user!.id) {
    return NextResponse.json({ error: 'Forbidden: not your document' }, { status: 403 });
  }

  const newStatus = action === 'approve' ? 'published' : 'revision_needed';

  const { error: updateErr } = await supabase
    .from('document_objects')
    .update({
      status: newStatus,
      metadata: {
        ...((doc.metadata as Record<string, unknown>) ?? {}),
        broker_notes: brokerNotes ?? null,
        approved_at: action === 'approve' ? new Date().toISOString() : null,
        reviewed_by: guard.user!.id,
      },
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

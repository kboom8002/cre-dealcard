/**
 * POST /api/gate-requests/[id]/sign
 * Self-service NDA signing for Pro IM access
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { agreedToTerms, signerName, signerPhone } = body;

  if (
    !agreedToTerms ||
    !signerName ||
    typeof signerName !== 'string' ||
    signerName.trim() === ''
  ) {
    return NextResponse.json({ error: 'NDA agreement and signer name required' }, { status: 400 });
  }

  const trimmedSignerName = signerName.trim();

  // Fetch grant
  const { data: grant, error } = await supabase
    .from('im_pro_grants')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !grant) {
    return NextResponse.json({ error: 'Grant not found' }, { status: 404 });
  }

  if (grant.nda_signed_at) {
    return NextResponse.json({ error: 'NDA already signed', grantId: id }, { status: 409 });
  }

  // Update grant: activate + set NDA timestamp + 24h expiry
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const watermarkSeed = `${trimmedSignerName}|${(signerPhone || '').slice(-4)}|${now.toISOString()}`;

  const { error: updateError } = await supabase
    .from('im_pro_grants')
    .update({
      status: 'active',
      nda_signed_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      watermark_seed: watermarkSeed,
      requester_name: trimmedSignerName,
      requester_phone: signerPhone || grant.requester_phone,
    })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to process NDA' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    grantId: id,
    expiresAt: expiresAt.toISOString(),
    message: 'NDA signed successfully. Pro IM access granted for 24 hours.',
  });
}

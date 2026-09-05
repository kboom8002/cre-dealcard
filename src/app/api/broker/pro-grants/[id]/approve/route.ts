import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireBroker } from '@/lib/auth-guard';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBroker(req);
  if (auth.error) {
    return auth.error;
  }

  try {
    const supabase = createServiceClient();
    const { id: grantId } = await params;

    if (!grantId) {
      return NextResponse.json({ ok: false, error: 'Missing grant ID' }, { status: 400 });
    }

    // Approve the Pro-IM grant on the correct im_pro_grants table
    const { data: grant, error } = await supabase
      .from('im_pro_grants')
      .update({
        status: 'approved',
      })
      .eq('id', grantId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[pro-grant] Supabase update failed:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!grant) {
      return NextResponse.json({ ok: false, error: 'Grant not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: grantId, status: 'approved', grant });
  } catch (err) {
    console.error('[pro-grant] Approve Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}

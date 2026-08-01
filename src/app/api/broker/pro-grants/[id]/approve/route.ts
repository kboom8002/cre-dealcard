import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServiceClient();
    const grantId = params.id;

    if (!grantId) {
      return NextResponse.json({ ok: false, error: 'Missing grant ID' }, { status: 400 });
    }

    // Approve the Pro-IM grant
    const { error } = await supabase
      .from('pro_grants')
      .update({
        status: 'approved',
        updated_at: new Date().toISOString()
      })
      .eq('id', grantId);

    if (error) {
      console.error('[pro-grant] Supabase update failed:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: grantId, status: 'approved' });
  } catch (err) {
    console.error('[pro-grant] Approve Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}

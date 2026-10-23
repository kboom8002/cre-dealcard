import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireBroker } from '@/lib/auth-guard';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


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

    // Verify ownership if broker_id is tracked on the grant (admin bypasses)
    const { data: existingGrant } = await supabase
      .from('im_pro_grants')
      .select('id, broker_id, tenant_id')
      .eq('id', grantId)
      .maybeSingle();

    const ownerBrokerId = existingGrant?.broker_id || existingGrant?.tenant_id;
    if (
      ownerBrokerId &&
      auth.role !== 'admin' &&
      auth.user?.id &&
      ownerBrokerId !== auth.user.id
    ) {
      return NextResponse.json(
        { ok: false, error: '본인 소유의 딜 권한 요청만 승인할 수 있습니다.' },
        { status: 403 },
      );
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
      log.error('[pro-grant] Supabase update failed:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!grant) {
      return NextResponse.json({ ok: false, error: 'Grant not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: grantId, status: 'approved', grant });
  } catch (err) {
    log.error('[pro-grant] Approve Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}

/**
 * POST /api/broker/share-link — 공유 링크 발급
 * GET  /api/broker/share-link — 내 링크 목록 조회
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createShareLink } from '@/domain/distribution/share-link-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, dealId, dealVersion, tier, brokerId, recipientId, expiresInDays } = body;

    if (!tenantId || !dealId || !tier || !brokerId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['teaser', 'basic'].includes(tier)) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
    }

    const link = await createShareLink({
      tenantId,
      dealId,
      dealVersion,
      tier,
      brokerId,
      recipientId,
      expiresInDays,
    });

    return NextResponse.json({ link }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const brokerId = searchParams.get('brokerId');
    const dealId = searchParams.get('dealId');

    if (!brokerId) {
      return NextResponse.json({ error: 'brokerId required' }, { status: 400 });
    }

    const supabase = createServiceClient();
    let query = supabase
      .from('share_link')
      .select()
      .eq('broker_id', brokerId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });

    if (dealId) query = query.eq('deal_id', dealId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ links: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

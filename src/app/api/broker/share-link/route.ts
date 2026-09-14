/**
 * POST /api/broker/share-link — 공유 링크 발급
 * GET  /api/broker/share-link — 내 링크 목록 조회
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServiceClient } from '@/lib/supabase/service';
import { createShareLink } from '@/domain/distribution/share-link-service';
import { requireBroker } from '@/lib/auth-guard';

const CreateShareLinkSchema = z.object({
  tenantId: z.string().min(1, 'tenantId is required'),
  dealId: z.string().min(1, 'dealId is required'),
  dealVersion: z.number().int().positive().optional(),
  tier: z.enum(['teaser', 'basic']),
  brokerId: z.string().min(1, 'brokerId is required'),
  recipientId: z.string().optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

const GetShareLinksQuerySchema = z.object({
  brokerId: z.string().min(1, 'brokerId required'),
  dealId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // Auth guard — 미인증 요청 차단
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const parsed = CreateShareLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid share link payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { tenantId, dealId, dealVersion, tier, brokerId, recipientId, expiresInDays } = parsed.data;

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
  // Auth guard — 미인증 요청 차단
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = GetShareLinksQuerySchema.safeParse({
      brokerId: searchParams.get('brokerId') ?? undefined,
      dealId: searchParams.get('dealId') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { brokerId, dealId } = parsed.data;

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

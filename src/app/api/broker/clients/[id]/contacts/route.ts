/**
 * GET /api/broker/clients/[id]/contacts — 연락 이력 조회
 * POST /api/broker/clients/[id]/contacts — 연락 기록 추가
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod/v4';
import { requireBroker } from '@/lib/auth-guard';

const CreateContactSchema = z.object({
  contact_type: z.enum(['phone', 'kakao', 'sms', 'email', 'meeting', 'site_visit', 'note']),
  summary: z.string().min(1, '내용을 입력해주세요'),
  scheduled_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase
    .from('contact_history')
    .select('*')
    .eq('client_id', id)
    .eq('broker_id', auth.user!.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await req.json();
  const parsed = CreateContactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Verify client belongs to broker
  const { data: client } = await supabase
    .from('broker_clients')
    .select('id')
    .eq('id', id)
    .eq('broker_id', auth.user!.id)
    .single();

  if (!client) {
    return NextResponse.json({ error: '고객을 찾을 수 없습니다.' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('contact_history')
    .insert({
      broker_id: auth.user!.id,
      client_id: id,
      ...parsed.data,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

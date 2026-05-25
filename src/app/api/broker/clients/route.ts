/**
 * GET /api/broker/clients — 고객 목록 조회
 * POST /api/broker/clients — 신규 고객 등록
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod/v4';
import { requireBroker } from '@/lib/auth-guard';

const CreateClientSchema = z.object({
  client_type: z.enum(['seller', 'buyer', 'both']),
  display_name: z.string().min(1, '이름을 입력해주세요'),
  company: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  tier: z.enum(['vip', 'normal', 'potential', 'dormant']).default('normal'),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
  linked_building_ids: z.array(z.string().uuid()).default([]),
  linked_buyer_intent_ids: z.array(z.string().uuid()).default([]),
});

export async function GET(req: NextRequest) {
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const url = new URL(req.url);
  const clientType = url.searchParams.get('client_type');
  const tier = url.searchParams.get('tier');
  const search = url.searchParams.get('search');

  let query = supabase
    .from('broker_clients')
    .select('*')
    .eq('broker_id', auth.user!.id)
    .order('created_at', { ascending: false });

  if (clientType && clientType !== 'all') {
    query = query.eq('client_type', clientType);
  }
  if (tier && tier !== 'all') {
    query = query.eq('tier', tier);
  }
  if (search) {
    query = query.or(`display_name.ilike.%${search}%,company.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const { data, error } = await query.limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = CreateClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase
    .from('broker_clients')
    .insert({
      broker_id: auth.user!.id,
      ...parsed.data,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Activity event
  await supabase.from('activity_events').insert({
    actor_id: auth.user!.id,
    actor_role: auth.role,
    event_type: 'broker_client_created',
    entity_type: 'broker_clients',
    entity_id: data.id,
    metadata: { client_type: parsed.data.client_type, display_name: parsed.data.display_name },
  });

  return NextResponse.json({ data }, { status: 201 });
}

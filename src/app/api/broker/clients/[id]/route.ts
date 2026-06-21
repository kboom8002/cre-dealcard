/**
 * GET /api/broker/clients/[id] — 고객 상세 (연결된 건물/의향서 + 연락 이력)
 * PUT /api/broker/clients/[id] — 고객 정보 수정
 * DELETE /api/broker/clients/[id] — 고객 삭제
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod/v4';
import { requireBroker } from '@/lib/auth-guard';

const UpdateClientSchema = z.object({
  client_type: z.enum(['seller', 'buyer', 'both']).optional(),
  display_name: z.string().min(1).optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  tier: z.enum(['vip', 'normal', 'potential', 'dormant']).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  linked_building_ids: z.array(z.string().uuid()).optional(),
  linked_buyer_intent_ids: z.array(z.string().uuid()).optional(),
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

  // Fetch client
  const { data: client, error } = await supabase
    .from('broker_clients')
    .select('*')
    .eq('id', id)
    .eq('broker_id', auth.user!.id)
    .single();

  if (error || !client) {
    return NextResponse.json({ error: '고객을 찾을 수 없습니다.' }, { status: 404 });
  }

  // Fetch linked buildings
  let buildings: unknown[] = [];
  if (client.linked_building_ids?.length > 0) {
    const { data } = await supabase
      .from('building_ssot_lite')
      .select('id, area_signal, asset_type, price_band, status, created_at')
      .in('id', client.linked_building_ids);
    buildings = data ?? [];
  }

  // Fetch linked buyer intents
  let buyerIntents: unknown[] = [];
  if (client.linked_buyer_intent_ids?.length > 0) {
    const { data } = await supabase
      .from('buyer_intent_lite')
      .select('id, buyer_type, budget_display, preferred_regions, purchase_purpose, created_at')
      .in('id', client.linked_buyer_intent_ids);
    buyerIntents = data ?? [];
  }

  // Fetch contact history (last 20)
  const { data: contacts } = await supabase
    .from('contact_history')
    .select('*')
    .eq('client_id', id)
    .eq('broker_id', auth.user!.id)
    .order('created_at', { ascending: false })
    .limit(20);

  // Fetch bookings linked to the client's buyer intents
  let bookings: unknown[] = [];
  if (client.linked_buyer_intent_ids?.length > 0) {
    const { data } = await supabase
      .from('bookings')
      .select(`
        id, status, created_at,
        slot:availability_slots(
          slot_start,
          building:building_ssot_lite(id, area_signal)
        )
      `)
      .in('buyer_intent_id', client.linked_buyer_intent_ids)
      .order('created_at', { ascending: false })
      .limit(10);
    bookings = data ?? [];
  }

  return NextResponse.json({
    data: {
      ...client,
      buildings,
      buyerIntents,
      bookings,
      contacts: contacts ?? [],
    },
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateClientSchema.safeParse(body);
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
    .update(parsed.data)
    .eq('id', id)
    .eq('broker_id', auth.user!.id)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: '수정에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(
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

  const { error } = await supabase
    .from('broker_clients')
    .delete()
    .eq('id', id)
    .eq('broker_id', auth.user!.id);

  if (error) {
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

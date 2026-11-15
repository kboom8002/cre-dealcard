/**
 * GET /api/broker/clients/[id] — 고객 상세 (연결된 건물/의향서 + 연락 이력)
 * PUT / PATCH /api/broker/clients/[id] — 고객 정보 수정
 * DELETE /api/broker/clients/[id] — 고객 삭제
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('broker-clients-id');
const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

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
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const brokerId = guard.user!.id;

    const { id } = await params;
    if (!id || !SAFE_ID_RE.test(id)) {
      return NextResponse.json({ error: '유효하지 않은 고객 ID입니다.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Fetch client owned by caller
    const { data: client, error } = await supabase
      .from('broker_clients')
      .select('*')
      .eq('id', id)
      .eq('broker_id', brokerId)
      .maybeSingle();

    if (error || !client) {
      return NextResponse.json({ error: '고객을 찾을 수 없습니다.' }, { status: 404 });
    }

    // Hydrate linked buildings strictly scoped to caller's owner_id
    let buildings: unknown[] = [];
    if (Array.isArray(client.linked_building_ids) && client.linked_building_ids.length > 0) {
      const { data } = await supabase
        .from('building_ssot_lite')
        .select('id, area_signal, asset_type, price_band, status, created_at')
        .in('id', client.linked_building_ids)
        .eq('owner_id', brokerId);
      buildings = data ?? [];
    }

    // Hydrate linked buyer intents strictly scoped to caller's owner_id
    let buyerIntents: Array<Record<string, unknown> & { id: string }> = [];
    if (Array.isArray(client.linked_buyer_intent_ids) && client.linked_buyer_intent_ids.length > 0) {
      const { data } = await supabase
        .from('buyer_intent_lite')
        .select('id, buyer_type, budget_display, preferred_regions, purchase_purpose, created_at')
        .in('id', client.linked_buyer_intent_ids)
        .eq('owner_id', brokerId);
      buyerIntents = (data as Array<Record<string, unknown> & { id: string }> | null) ?? [];
    }

    // Fetch contact history (last 20) strictly scoped to caller's broker_id
    const { data: contacts } = await supabase
      .from('contact_history')
      .select('*')
      .eq('client_id', id)
      .eq('broker_id', brokerId)
      .order('created_at', { ascending: false })
      .limit(20);

    // Fetch bookings ONLY for buyer intents verified as owned by caller
    let bookings: unknown[] = [];
    const ownedBuyerIntentIds = buyerIntents.map((bi) => bi.id).filter(Boolean);
    if (ownedBuyerIntentIds.length > 0) {
      const { data } = await supabase
        .from('bookings')
        .select(`
          id, status, booked_by, created_at,
          slot:availability_slots(
            owner_id,
            slot_start,
            building:building_ssot_lite(id, owner_id, area_signal)
          )
        `)
        .in('buyer_intent_id', ownedBuyerIntentIds)
        .order('created_at', { ascending: false })
        .limit(10);

      bookings = ((data as any[] | null) ?? [])
        .filter((b) => {
          const slotOwner = b?.slot?.owner_id;
          // Exclude bookings whose slot belongs to a different owner unless booked_by caller
          if (slotOwner && slotOwner !== brokerId && b?.booked_by !== brokerId) {
            return false;
          }
          return true;
        })
        .map(({ booked_by: _bookedBy, slot, ...rest }) => ({
          ...rest,
          slot: slot
            ? {
                slot_start: slot.slot_start,
                building:
                  slot.building && (!slot.building.owner_id || slot.building.owner_id === brokerId)
                    ? { id: slot.building.id, area_signal: slot.building.area_signal }
                    : null,
              }
            : null,
        }));
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
  } catch (err) {
    log.error('[broker-clients-id-get] Error:', err);
    return NextResponse.json(
      { error: '요청 처리에 실패했습니다.' },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const brokerId = guard.user!.id;

    const { id } = await params;
    if (!id || !SAFE_ID_RE.test(id)) {
      return NextResponse.json({ error: '유효하지 않은 고객 ID입니다.' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    const parsed = UpdateClientSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: '입력 항목을 다시 확인해주세요.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Verify broker_clients row belongs to caller before updating
    const { data: existingClient, error: checkErr } = await supabase
      .from('broker_clients')
      .select('id')
      .eq('id', id)
      .eq('broker_id', brokerId)
      .maybeSingle();

    if (checkErr) {
      log.error('[broker-clients-id-put] Lookup error:', checkErr);
      return NextResponse.json({ error: '고객 정보를 확인하지 못했습니다.' }, { status: 500 });
    }
    if (!existingClient) {
      return NextResponse.json({ error: '고객을 찾을 수 없습니다.' }, { status: 404 });
    }

    const updatePayload = { ...parsed.data };

    // Filter linked_building_ids strictly to buildings owned by caller
    if (updatePayload.linked_building_ids !== undefined) {
      if (updatePayload.linked_building_ids.length > 0) {
        const { data: ownedBuildings, error: bErr } = await supabase
          .from('building_ssot_lite')
          .select('id')
          .in('id', updatePayload.linked_building_ids)
          .eq('owner_id', brokerId);
        if (bErr) {
          log.error('[broker-clients-id-put] Building filter error:', bErr);
          return NextResponse.json({ error: '매물 소유권 확인에 실패했습니다.' }, { status: 500 });
        }
        const ownedSet = new Set(((ownedBuildings as Array<{ id: string }> | null) ?? []).map((r) => r.id));
        updatePayload.linked_building_ids = updatePayload.linked_building_ids.filter((bid) => ownedSet.has(bid));
      } else {
        updatePayload.linked_building_ids = [];
      }
    }

    // Filter linked_buyer_intent_ids strictly to buyer intents owned by caller
    if (updatePayload.linked_buyer_intent_ids !== undefined) {
      if (updatePayload.linked_buyer_intent_ids.length > 0) {
        const { data: ownedIntents, error: iErr } = await supabase
          .from('buyer_intent_lite')
          .select('id')
          .in('id', updatePayload.linked_buyer_intent_ids)
          .eq('owner_id', brokerId);
        if (iErr) {
          log.error('[broker-clients-id-put] Buyer intent filter error:', iErr);
          return NextResponse.json({ error: '매수자 의향서 소유권 확인에 실패했습니다.' }, { status: 500 });
        }
        const ownedSet = new Set(((ownedIntents as Array<{ id: string }> | null) ?? []).map((r) => r.id));
        updatePayload.linked_buyer_intent_ids = updatePayload.linked_buyer_intent_ids.filter((iid) => ownedSet.has(iid));
      } else {
        updatePayload.linked_buyer_intent_ids = [];
      }
    }

    const { data, error } = await supabase
      .from('broker_clients')
      .update(updatePayload)
      .eq('id', id)
      .eq('broker_id', brokerId)
      .select('*')
      .maybeSingle();

    if (error) {
      log.error('[broker-clients-id-put] Update error:', error);
      return NextResponse.json({ error: '수정에 실패했습니다.' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: '고객을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    log.error('[broker-clients-id-put] Error:', err);
    return NextResponse.json(
      { error: '요청 처리에 실패했습니다.' },
      { status: 500 },
    );
  }
}

export const PATCH = PUT;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const brokerId = guard.user!.id;

    const { id } = await params;
    if (!id || !SAFE_ID_RE.test(id)) {
      return NextResponse.json({ error: '유효하지 않은 고객 ID입니다.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: deletedRows, error } = await supabase
      .from('broker_clients')
      .delete()
      .eq('id', id)
      .eq('broker_id', brokerId)
      .select('id');

    if (error) {
      log.error('[broker-clients-id-delete] Delete error:', error);
      return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
    }

    const matched = Array.isArray(deletedRows) ? deletedRows.length > 0 : Boolean(deletedRows);
    if (!matched) {
      return NextResponse.json({ error: '고객을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error('[broker-clients-id-delete] Error:', err);
    return NextResponse.json(
      { error: '요청 처리에 실패했습니다.' },
      { status: 500 },
    );
  }
}

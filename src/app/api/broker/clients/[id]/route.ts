/**
 * GET /api/broker/clients/[id] — 고객 상세 (연결된 건물/의향서 + 연락 이력)
 * PUT / PATCH /api/broker/clients/[id] — 고객 정보 수정
 * DELETE /api/broker/clients/[id] — 고객 삭제
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { isIgnorableSchemaError } from '@/lib/inbox/inbox-schema-caps';
import { purgeDeletedBrokerClientArtifacts } from '@/lib/inbox/inbox-actions-clients';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('broker-clients-id');
const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

const UpdateClientSchema = z.object({
  client_type: z.enum(['seller', 'buyer', 'both']).optional(),
  display_name: z.string().trim().min(1).max(120).optional(),
  company: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(254).email().optional().or(z.literal('')),
  tier: z.enum(['vip', 'normal', 'potential', 'dormant']).optional(),
  tags: z.array(z.string().trim().max(50)).max(30).optional(),
  notes: z.string().max(5000).optional(),
  linked_building_ids: z.array(z.string().uuid()).max(50).optional(),
  linked_buyer_intent_ids: z.array(z.string().uuid()).max(50).optional(),
});

interface ClientBookingRow {
  id: string;
  status: string;
  booked_by: string | null;
  created_at: string;
  slot?: {
    owner_id?: string | null;
    slot_start?: string | null;
    building?: {
      id: string;
      owner_id?: string | null;
      area_signal?: string | null;
    } | null;
  } | null;
}

interface ExistingClientLookup {
  id: string;
  tags?: unknown;
  consent_status?: string | null;
}

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

      bookings = ((data as ClientBookingRow[] | null) ?? [])
        .filter((b) => {
          const slotOwner = b?.slot?.owner_id;
          // Exclude bookings whose slot belongs to a different owner unless booked_by caller
          if (slotOwner && slotOwner !== brokerId && b?.booked_by !== brokerId) {
            return false;
          }
          return true;
        })
        .map(({ booked_by: _bookedBy, slot, ...rest }) => {
          void _bookedBy;
          return {
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
          };
        });
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
    let lookupRes = await supabase
      .from('broker_clients')
      .select('id, tags, consent_status')
      .eq('id', id)
      .eq('broker_id', brokerId)
      .maybeSingle();

    if (lookupRes.error && isIgnorableSchemaError(lookupRes.error)) {
      lookupRes = await supabase
        .from('broker_clients')
        .select('id, tags')
        .eq('id', id)
        .eq('broker_id', brokerId)
        .maybeSingle();
    }

    const { data: existingClientRaw, error: checkErr } = lookupRes;
    const existingClient = existingClientRaw as ExistingClientLookup | null;

    if (checkErr) {
      log.error('[broker-clients-id-put] Lookup error:', checkErr);
      return NextResponse.json({ error: '고객 정보를 확인하지 못했습니다.' }, { status: 500 });
    }
    if (!existingClient) {
      return NextResponse.json({ error: '고객을 찾을 수 없습니다.' }, { status: 404 });
    }

    const updatePayload: Record<string, unknown> = { ...parsed.data };

    if (typeof parsed.data.email === 'string') {
      const normalizedEmail = parsed.data.email.trim().toLowerCase();
      updatePayload.email = normalizedEmail || null;
    }

    if (parsed.data.tier !== undefined) {
      updatePayload.is_vip = parsed.data.tier === 'vip';
    }
    if (parsed.data.client_type !== undefined) {
      updatePayload.client_role = parsed.data.client_type === 'seller' ? 'seller' : 'buyer';
    }

    if (parsed.data.tags !== undefined) {
      const dbConsentStatus = String(existingClient.consent_status ?? 'unconfirmed').trim().toLowerCase();
      const existingTags = Array.isArray(existingClient.tags) ? existingClient.tags.map(String) : [];
      const hadOptOutTag =
        existingTags.some((t) => /수신거부|해지|unsub/i.test(t)) || dbConsentStatus === 'unsubscribed';
      let nextTags = parsed.data.tags.map((t) => String(t).trim()).filter(Boolean);
      if (dbConsentStatus !== 'confirmed') {
        nextTags = nextTags.filter((t) => !/뉴스레터구독|수신동의/i.test(t));
      }
      if (hadOptOutTag && !nextTags.some((t) => /수신거부/.test(t))) {
        nextTags.push('수신거부');
      }
      updatePayload.tags = Array.from(new Set(nextTags));
    }

    // Filter linked_building_ids strictly to buildings owned by caller
    if (parsed.data.linked_building_ids !== undefined) {
      if (parsed.data.linked_building_ids.length > 0) {
        const { data: ownedBuildings, error: bErr } = await supabase
          .from('building_ssot_lite')
          .select('id')
          .in('id', parsed.data.linked_building_ids)
          .eq('owner_id', brokerId);
        if (bErr) {
          log.error('[broker-clients-id-put] Building filter error:', bErr);
          return NextResponse.json({ error: '매물 소유권 확인에 실패했습니다.' }, { status: 500 });
        }
        const ownedSet = new Set(((ownedBuildings as Array<{ id: string }> | null) ?? []).map((r) => r.id));
        updatePayload.linked_building_ids = parsed.data.linked_building_ids.filter((bid) => ownedSet.has(bid));
      } else {
        updatePayload.linked_building_ids = [];
      }
    }

    // Filter linked_buyer_intent_ids strictly to buyer intents owned by caller
    if (parsed.data.linked_buyer_intent_ids !== undefined) {
      if (parsed.data.linked_buyer_intent_ids.length > 0) {
        const { data: ownedIntents, error: iErr } = await supabase
          .from('buyer_intent_lite')
          .select('id')
          .in('id', parsed.data.linked_buyer_intent_ids)
          .eq('owner_id', brokerId);
        if (iErr) {
          log.error('[broker-clients-id-put] Buyer intent filter error:', iErr);
          return NextResponse.json({ error: '매수자 의향서 소유권 확인에 실패했습니다.' }, { status: 500 });
        }
        const ownedSet = new Set(((ownedIntents as Array<{ id: string }> | null) ?? []).map((r) => r.id));
        updatePayload.linked_buyer_intent_ids = parsed.data.linked_buyer_intent_ids.filter((iid) => ownedSet.has(iid));
      } else {
        updatePayload.linked_buyer_intent_ids = [];
      }
    }

    let { data, error } = await supabase
      .from('broker_clients')
      .update(updatePayload)
      .eq('id', id)
      .eq('broker_id', brokerId)
      .select('*')
      .maybeSingle();

    if (error && isIgnorableSchemaError(error)) {
      const { is_vip: _iv, client_role: _cr, ...legacyUpdate } = updatePayload;
      void _iv;
      void _cr;
      const retry = await supabase
        .from('broker_clients')
        .update(legacyUpdate)
        .eq('id', id)
        .eq('broker_id', brokerId)
        .select('*')
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }

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

    // WP-7.4E P1-3: write custom_client_deleted tombstone, scrub PII from prior
    // custom_client_upserted / call_note_recorded events, and evict in-memory state.
    const purged = await purgeDeletedBrokerClientArtifacts(supabase, {
      userId: brokerId,
      targetKey: `custom_${id}`,
      rawClientId: id,
    });

    return NextResponse.json({
      ok: true,
      piiScrubbed: purged.piiScrubbed,
      tombstoneRecorded: purged.tombstoneRecorded,
    });
  } catch (err) {
    log.error('[broker-clients-id-delete] Error:', err);
    return NextResponse.json(
      { error: '요청 처리에 실패했습니다.' },
      { status: 500 },
    );
  }
}

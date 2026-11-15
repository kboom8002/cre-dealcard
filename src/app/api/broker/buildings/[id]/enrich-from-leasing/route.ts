import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireBroker } from '@/lib/auth-guard';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';
import { createModuleLogger } from '@/lib/logger';
import { z } from 'zod';

const log = createModuleLogger('enrich-from-leasing');
const SAFE_BUILDING_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

const patchSchema = z.object({
  source: z.literal('js-space-ai-page'),
  leasing_signals: z.object({
    inquiry_count: z.number().optional(),
    top_tenant_types: z.array(z.string()).optional()
  }).optional()
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const { id } = await params;

  if (!id || !SAFE_BUILDING_ID_RE.test(id) || id.includes('..')) {
    return NextResponse.json({ ok: false, error: '유효하지 않은 매물 식별자입니다.' }, { status: 400 });
  }

  try {
    let payload;
    try {
      const raw = await req.json();
      payload = patchSchema.parse(raw);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return NextResponse.json({ ok: false, error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Enforce strict building ownership (or explicit admin bypass) BEFORE reading/updating building_ssot_lite
    const ownership = await assertBuildingOwner<Record<string, any>>(
      supabase,
      id,
      guard.user!.id,
      {
        allowAdmin: true,
        role: guard.role,
        select: 'id, owner_id, current_use_signal, fit_summary, layers',
      },
    );
    if (!ownership.ok) {
      return ownership.response;
    }

    const building = ownership.row;
    const signals = payload.leasing_signals || {};

    // Enrich layers
    const layers = { ...(building.layers || {}) };
    const leaseIncome = { ...(layers.lease_income || {}) };
    const buyerFit = { ...(layers.buyer_fit || {}) };

    // Update fields based on signals
    let current_use_signal = building.current_use_signal;
    let fit_summary = building.fit_summary;

    if (signals.inquiry_count && signals.inquiry_count > 0) {
      current_use_signal = `현재 임대 마케팅 진행 중 (최근 문의 ${signals.inquiry_count}건)`;
    }

    if (signals.top_tenant_types && signals.top_tenant_types.length > 0) {
      fit_summary = `${fit_summary ? fit_summary + ' / ' : ''}임차 관심 업종: ${signals.top_tenant_types.join(', ')}`;
      buyerFit.tenant_interest = signals.top_tenant_types;
    }

    layers.lease_income = leaseIncome;
    layers.buyer_fit = buyerFit;

    // Save enriched
    const { error: updateErr } = await supabase
      .from('building_ssot_lite')
      .update({
        current_use_signal,
        fit_summary,
        layers,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateErr) {
      log.error('Failed to update building_ssot_lite', { id, error: updateErr.message });
      return NextResponse.json(
        { ok: false, error: '매물 임대 시그널 반영에 실패했습니다.' },
        { status: 500 },
      );
    }

    // Record event
    await supabase.from('activity_events').insert({
      actor_id: guard.user!.id,
      actor_role: guard.role || 'broker',
      event_type: 'building_ssot_enriched_from_leasing',
      entity_type: 'building_ssot_lite',
      entity_id: id,
      source_app: 'js-building-ssot-mvp',
      metadata: {
        leasing_signals: signals
      }
    });

    return NextResponse.json({ ok: true, data: { current_use_signal, fit_summary } });
  } catch (err: unknown) {
    log.error('enrich-from-leasing unexpected error', { id, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

/**
 * POST /api/broker/buildings/[id]/pipeline
 * Advances the deal pipeline stage for a building (Bridge SM transition)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod/v4';
import { requireBroker } from '@/lib/auth-guard';
import {
  validateBridgeTransition,
  VALID_TRANSITIONS,
  STAGE_LABELS,
  type DealStage,
} from '@/domain/pipeline/bridge-state-machine';

const BodySchema = z.object({
  toStage: z.enum([
    'memo_input','deal_card_created','gate_requested',
    'im_created','buyer_meeting','loi','contract','closed','failed',
  ]),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  // Get current pipeline state
  const { data: current } = await supabase
    .from('deal_pipeline_states')
    .select('id, stage, entered_at, metadata')
    .eq('building_ssot_lite_id', (await params).id)
    .eq('broker_id', user!.id)
    .order('entered_at', { ascending: false })
    .limit(1)
    .single();

  if (!current) {
    return NextResponse.json({ error: '파이프라인을 찾을 수 없습니다' }, { status: 404 });
  }

  const fromStage = current.stage as DealStage;
  const toStage = parsed.data.toStage as DealStage;

  // Check if transition is allowed
  const allowedNext = VALID_TRANSITIONS[fromStage] ?? [];
  if (!allowedNext.includes(toStage)) {
    return NextResponse.json({
      error: `'${STAGE_LABELS[fromStage]}' → '${STAGE_LABELS[toStage]}' 전환은 허용되지 않습니다`,
      allowedNext: allowedNext.map((s) => ({ stage: s, label: STAGE_LABELS[s] })),
    }, { status: 422 });
  }

  // Validate handoff contract
  const mergedMeta = { ...(current.metadata ?? {}), ...parsed.data.metadata };
  const validation = validateBridgeTransition(fromStage, toStage, mergedMeta, current.entered_at);

  if (!validation.valid) {
    return NextResponse.json({
      error: '필수 정보가 부족합니다',
      missing: validation.missing,
      holdWarning: validation.holdWarning,
      holdDays: validation.holdDays,
    }, { status: 422 });
  }

  // Insert new pipeline state (keep history)
  const { data: newState, error: insertErr } = await supabase
    .from('deal_pipeline_states')
    .insert({
      building_ssot_lite_id: (await params).id,
      broker_id: user!.id,
      stage: toStage,
      metadata: mergedMeta,
    })
    .select('id, stage')
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Activity event
  const { trackPipelineTransition } = await import("@/domain/analytics/pipeline-transition-tracker");
  const { trackMatchFailure } = await import("@/domain/analytics/match-failure-tracker");

  await trackPipelineTransition(supabase, {
    brokerId: user!.id,
    buildingSsotLiteId: (await params).id,
    fromStage: fromStage,
    toStage: toStage,
    transitionReason: (parsed.data.metadata as any)?.transition_reason || "경로 수동 변경",
    holdDays: validation.holdDays,
    metadata: mergedMeta,
  });

  if (toStage === "failed") {
    await trackMatchFailure(supabase, {
      brokerId: user!.id,
      entityType: "sale",
      failureReason: (parsed.data.metadata as any)?.failure_reason || "협상 결렬",
      priceGapPct: (parsed.data.metadata as any)?.price_gap ? Number((parsed.data.metadata as any).price_gap) : null,
      rejectedBy: (parsed.data.metadata as any)?.rejected_by || "buyer",
      rejectionDetail: (parsed.data.metadata as any)?.rejection_detail || "가격 갭 저항대 극복 불가",
    });
  }

  return NextResponse.json({
    ok: true,
    from: fromStage,
    to: toStage,
    label: STAGE_LABELS[toStage],
    holdWarning: validation.holdWarning ? `${validation.holdDays}일 경과` : null,
  });
}

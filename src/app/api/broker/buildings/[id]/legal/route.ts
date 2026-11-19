/**
 * GET & PATCH /api/broker/buildings/[id]/legal
 * Broker-authenticated Korean legal SSoT editor endpoint for `/broker/buildings/[id]/studio/legal`.
 * Enforces `requireBroker` + `assertBuildingOwner` on `building_ssot_lite` and persists into `layers.legal`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBroker } from '@/lib/auth-guard';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';
import { createServiceClient } from '@/lib/supabase/service';

const legalPatchSchema = z
  .object({
    violation_registered: z.boolean().optional(),
    violation_detail: z.string().max(2000).nullable().optional(),
    transaction_structure: z.enum(['일반과세', '포괄양수도', '미정']).optional(),
    mgmt_fee_structure: z.enum(['실비정산', '정액', '혼합']).optional(),
    redevelopment_zone: z.boolean().optional(),
    fund_source_report_required: z.boolean().optional(),
    brokerage_fee_rate: z.number().min(0).max(10).nullable().optional(),
    pretrial_reconciliation: z.boolean().nullable().optional(),
    fire_safety_certificate: z.string().max(500).nullable().optional(),
    septic_tank_capacity: z.string().max(500).nullable().optional(),
    encumbrance_note: z.string().max(2000).nullable().optional(),
    zoning_confirmed: z.boolean().nullable().optional(),
  })
  .strict();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireBroker(request);
  if (guard.error) return guard.error;
  const { user, role } = guard;

  const { id } = await params;
  const supabase = createServiceClient();

  const ownership = await assertBuildingOwner<Record<string, unknown>>(
    supabase,
    id,
    user!.id,
    {
      allowAdmin: true,
      role,
      select: '*',
    },
  );
  if (!ownership.ok) return ownership.response;

  const buildingRow = ownership.row;
  const layers =
    buildingRow.layers && typeof buildingRow.layers === 'object'
      ? (buildingRow.layers as Record<string, unknown>)
      : {};
  const legalLayer =
    layers.legal && typeof layers.legal === 'object'
      ? (layers.legal as Record<string, unknown>)
      : null;

  return NextResponse.json({
    ok: true,
    data: buildingRow,
    korean_legal: legalLayer,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireBroker(request);
  if (guard.error) return guard.error;
  const { user, role } = guard;

  const { id } = await params;
  const supabase = createServiceClient();

  const ownership = await assertBuildingOwner<Record<string, unknown>>(
    supabase,
    id,
    user!.id,
    {
      allowAdmin: true,
      role,
      select: '*',
    },
  );
  if (!ownership.ok) return ownership.response;
  const existing = ownership.row;

  let validatedLegal: z.infer<typeof legalPatchSchema>;
  try {
    const rawBody = await request.json();
    const candidate =
      rawBody && typeof rawBody === 'object' && rawBody.korean_legal && typeof rawBody.korean_legal === 'object'
        ? rawBody.korean_legal
        : rawBody && typeof rawBody === 'object' && rawBody.legal && typeof rawBody.legal === 'object'
        ? rawBody.legal
        : rawBody;
    validatedLegal = legalPatchSchema.parse(candidate);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          code: 'VALIDATION_FAILED',
          error: '법적 필수 항목 입력값이 올바르지 않습니다.',
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, code: 'INVALID_JSON', error: '잘못된 요청 형식입니다.' },
      { status: 400 },
    );
  }

  const existingLayers =
    existing.layers && typeof existing.layers === 'object'
      ? (existing.layers as Record<string, unknown>)
      : {};
  const existingLegal =
    existingLayers.legal && typeof existingLayers.legal === 'object'
      ? (existingLayers.legal as Record<string, unknown>)
      : {};

  const mergedLayers = {
    ...existingLayers,
    legal: {
      ...existingLegal,
      ...validatedLegal,
      updated_at: new Date().toISOString(),
    },
  };

  const { data: updated, error: updateErr } = await supabase
    .from('building_ssot_lite')
    .update({ layers: mergedLayers })
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (updateErr) {
    console.error('[buildings/legal] PATCH failed:', updateErr);
    return NextResponse.json(
      { ok: false, error: '법적 필수 항목 저장에 실패했습니다.' },
      { status: 500 },
    );
  }

  const responseRow = updated ?? { ...existing, layers: mergedLayers };
  return NextResponse.json({
    ok: true,
    data: responseRow,
    korean_legal: mergedLayers.legal,
  });
}

/**
 * POST /api/broker/im-lite/[id]/approve-override
 * { reason: string }   — 승인 시점 V12(렌트롤 면적 단위 혼동, AREA_UNIT_MISMATCH) 해제
 *
 * 이미 생성된 문서가 V12 로 승인 차단된 경우 재업로드 없이 중개인이 사유를 적어 해제한다.
 *  - V12 만 해제 가능 (V01 등 다른 게이트는 이 경로로 풀리지 않는다).
 *  - by/at 은 서버가 채운다 (요청 바디의 by/at 은 읽지 않는다).
 *  - body.rent_roll_meta.area_unit_override + body.override_log(stage:'approval') 기록 후 gateReport 재평가·영속.
 *  - body 가 바뀌므로 승인 대상 해시(targetHash)도 재계산해 돌려준다 — 클라이언트는 이 값을 expectedHash 로 쓴다.
 * 응답: { ok, id, gateReport, targetHash, override: { reason, by, at } }
 * Requires broker auth + document ownership. 발행된 문서는 변경 불가(409).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { computeTargetHash } from '@/domain/building/im-core/target-hash';
import { applyAreaUnitOverride, sanitizeOverrideReason } from '@/domain/building/mobile-im/approval-gate-override';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

  let rawReason: unknown;
  try {
    const body = await req.json();
    rawReason = body?.reason;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const reasonRes = sanitizeOverrideReason(rawReason);
  if (!reasonRes.ok) {
    return NextResponse.json({ error: reasonRes.error, code: 'V12_OVERRIDE_REASON_INVALID' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: doc, error: fetchErr } = await supabase
    .from('document_objects')
    .select('id, owner_id, broker_id, status, body')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const ownerId = doc.broker_id ?? doc.owner_id;
  if (ownerId !== guard.user!.id) {
    return NextResponse.json({ error: 'Forbidden: not your document' }, { status: 403 });
  }

  if (doc.status === 'published') {
    return NextResponse.json({ error: '이미 공개된 문서는 해제할 수 없습니다.', code: 'ALREADY_PUBLISHED' }, { status: 409 });
  }

  const currentBody = (doc.body ?? null) as Record<string, any> | null;
  if (!currentBody || typeof currentBody !== 'object') {
    return NextResponse.json({ error: '문서 본문(body)이 비어 있습니다.', code: 'IM_APPROVAL_EMPTY_BODY' }, { status: 422 });
  }

  const applied = applyAreaUnitOverride(currentBody, { reason: reasonRes.reason, userId: guard.user!.id });
  if (!applied.ok) {
    return NextResponse.json({ error: applied.error, code: applied.code }, { status: applied.status });
  }

  // approve/route.ts 와 같은 tier 보정으로 승인 대상 해시를 재계산한다 (그래야 expectedHash 가 일치).
  const updatedBody = applied.body;
  let tier = updatedBody.releaseTier ?? 'fact_om';
  if (tier === 'internal_only' && updatedBody.im_type === 'mobile_im_lite') tier = 'fact_om';
  const targetHash = computeTargetHash({ body: updatedBody, releaseTier: tier, policyVersion: '2026-08-31' });
  updatedBody.targetHash = targetHash;
  updatedBody.approval_target_hash = targetHash;

  const { error: updateErr } = await supabase
    .from('document_objects')
    .update({ body: updatedBody, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id,
    gateReport: applied.gateReport,
    targetHash,
    override: updatedBody.rent_roll_meta.area_unit_override,
  });
}

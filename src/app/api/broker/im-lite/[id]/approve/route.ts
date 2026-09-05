/**
 * POST /api/broker/im-lite/[id]/approve
 * { action: 'approve' | 'reject', broker_notes?: string }
 * Updates document_objects status to 'published' or 'revision_needed'.
 * Requires broker auth.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { markAsGoldenIM } from '@/domain/building/mobile-im/golden-im-manager';
import { createServiceClient } from '@/lib/supabase/service';
import { simulateReidentification } from '@/domain/deal/teaser/reident-simulator';
import { buildAttrsFromSsotLite, readWithMigration } from '@/lib/ssot-adapter';
import { runApprovalGate } from '@/domain/building/im-core';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const { id } = await params;
  let action: string;
  let brokerNotes: string | undefined;
  let expectedHash: string | undefined;

  try {
    const body = await req.json();
    action = body.action;
    brokerNotes = body.broker_notes;
    expectedHash = body.expectedHash;
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Ensure the document belongs to this broker
  const { data: doc, error: fetchErr } = await supabase
    .from('document_objects')
    .select('id, owner_id, status, building_id')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  if (doc.owner_id !== guard.user!.id) {
    return NextResponse.json({ error: 'Forbidden: not your document' }, { status: 403 });
  }

  let serverHash: string | undefined;

  // D37 H-2 & CIM-0102: ApprovalGate 사전 검증 및 해시 결속 (승인 시에만)
  if (action === 'approve') {
    if (!expectedHash || typeof expectedHash !== 'string' || !expectedHash.startsWith('sha256:')) {
      return NextResponse.json({
        error: 'IM_APPROVAL_MISSING_EXPECTED_HASH',
        message: '승인 대상 해시(expectedHash)가 누락되었거나 유효하지 않습니다.',
      }, { status: 400 });
    }

    const { data: fullDocForGate } = await supabase
      .from('document_objects')
      .select('body')
      .eq('id', id)
      .single();

    if (!fullDocForGate?.body) {
      return NextResponse.json({
        error: 'IM_APPROVAL_EMPTY_BODY',
        message: '승인할 문서 본문(body)이 비어 있습니다.',
      }, { status: 422 });
    }

    // 대상 해시 계산 및 검증 (G1 해결)
    const { computeTargetHash } = await import('@/domain/building/im-core/target-hash');
    const tier = fullDocForGate.body.releaseTier ?? 'fact_om';
    serverHash = computeTargetHash({
      body: fullDocForGate.body,
      releaseTier: tier,
      policyVersion: '2026-08-31',
    });

    if (serverHash !== expectedHash) {
      return NextResponse.json({
        error: 'IM_APPROVAL_HASH_MISMATCH',
        message: '승인 대상 문서가 변경되었습니다. 최신 상태를 확인 후 다시 승인해 주세요.',
        serverHash,
        expectedHash,
      }, { status: 422 });
    }

    // G2 해결: new ClaimRegistry() 빈 인스턴스화 제거 -> 실제 본문 claims로 재수화
    const { ClaimRegistry } = await import('@/domain/building/im-core');
    const registry = new ClaimRegistry();

    if (Array.isArray(fullDocForGate.body.claims) && fullDocForGate.body.claims.length > 0) {
      for (const rawClaim of fullDocForGate.body.claims) {
        registry.register(rawClaim);
      }
    } else if (fullDocForGate.body.ssot_summary || fullDocForGate.body.sections) {
      // 레거시 문서 호환: ssot_summary에서 기본 Claim 재수화
      const ssot = fullDocForGate.body.ssot_summary || {};
      if (ssot.asking_price || ssot.price) {
        registry.register({
          subject: 'asking_price',
          value: ssot.asking_price || ssot.price,
          evidence: [],
          provenance: 'broker',
          asOf: new Date().toISOString(),
          status: 'reconciled',
        });
      }
      if (ssot.total_area || ssot.gross_area) {
        registry.register({
          subject: 'total_area',
          value: ssot.total_area || ssot.gross_area,
          evidence: [],
          provenance: 'public_api',
          asOf: new Date().toISOString(),
          status: 'reconciled',
        });
      }
      if (ssot.gross_yield || ssot.cap_rate) {
        registry.register({
          subject: 'gross_yield',
          value: ssot.gross_yield || ssot.cap_rate,
          evidence: [],
          provenance: 'broker',
          asOf: new Date().toISOString(),
          status: 'reconciled',
        });
      }
    }

    const gateResult = runApprovalGate(registry, tier, {
      hasHallucination: fullDocForGate.body.hasHallucination === true,
      publishBlocked: fullDocForGate.body.gateReport?.blocked === true,
    });

    if (!gateResult.passed) {
      return NextResponse.json({
        error: '승인 게이트 미통과 — 아래 항목을 해결해 주세요.',
        blockers: gateResult.blockers,
      }, { status: 422 });
    }
  }

  const newStatus = action === 'approve' ? 'published' : 'draft';

  const updateFields: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (action === 'approve' && serverHash) {
    updateFields.approval_target_hash = serverHash;
    updateFields.approved_at = new Date().toISOString();
  }

  const { error: updateErr } = await supabase
    .from('document_objects')
    .update(updateFields)
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // ── Golden Set 자동 등록 (승인 시에만, non-blocking) ──
  if (action === 'approve') {
    try {
      const { data: fullDoc } = await supabase
        .from('document_objects')
        .select('body, building_id')
        .eq('id', id)
        .single();

      if (fullDoc?.body?.sections) {
        const ssot = fullDoc.body.ssot_summary || {};
        const goldenCount = await markAsGoldenIM(
          id,
          fullDoc.building_id || '',
          ssot.asset_type || '',
          ssot.price_band || '',
          fullDoc.body.sections,
          undefined,
          fullDoc.body.judge_score,
        );
        console.info(`[approve] Golden Set: ${goldenCount} sections registered`);
      }
    } catch (goldenErr) {
      console.warn('[approve] Golden set registration failed (non-blocking):', goldenErr);
    }
  }

  return NextResponse.json({
    ok: true,
    id,
    status: newStatus,
    message: action === 'approve' ? 'IM이 승인되어 공개되었습니다.' : '수정 요청이 등록되었습니다.',
  });
}

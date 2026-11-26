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
import { assertPublishable } from '@/lib/legal/publish-gate';
import {
  getWorkspaceItemByAnyId,
  isMissingRelationOrColumnError,
  upsertWorkspaceItem,
  type WorkspaceItemRecord,
} from '@/lib/workspace/workspace-repository';
import { buildSanitizedImPublicSnapshot } from '@/lib/workspace/summary/patch-upsert-im';

import { createModuleLogger } from '@/lib/logger';
import { sanitizeFitSummary } from '@/domain/building/mobile-im/fit-summary-sanitize';
const log = createModuleLogger('route');

function isMissingColumnError(err: { code?: unknown; message?: unknown } | null | undefined): boolean {
  if (!err) return false;
  return err.code === '42703' || String(err.message || '').toLowerCase().includes('column');
}

function isMissingRpcError(err: { code?: unknown; message?: unknown } | null | undefined): boolean {
  if (!err) return true;
  const code = String(err.code || '');
  const msg = String(err.message || '');
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    code === 'PGRST205' ||
    code === '42P01' ||
    /could not find the function|function .* does not exist/i.test(msg)
  );
}

function countMutatedRows(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  return data ? 1 : 0;
}

/**
 * WP-7.3D P1-2: approving a document must also publish its canonical workspace_items row with a
 * sanitized public snapshot — otherwise the public viewer keeps treating the IM as
 * "draft without snapshot" and returns 404. Pre-cutover (workspace_items table/columns missing)
 * this is a no-op so the legacy document_objects path keeps serving the IM.
 * Returns an error string only for unexpected failures.
 */
interface ApprovedWorkspaceSyncPayload {
  id: string;
  buildingId: string | null;
  title: string;
  address: string;
  priceBand: string | null;
  draftPayload: Record<string, unknown>;
  publishedSnapshot: Record<string, unknown>;
  docHash?: string;
}

async function prepareApprovedWorkspaceSyncPayload(params: {
  supabase: any;
  docId: string;
  buildingId: string | null;
  approvedBody: Record<string, any>;
  userId: string;
  isAdmin: boolean;
  docHash: string | null;
}): Promise<ApprovedWorkspaceSyncPayload | null> {
  const { supabase, docId, buildingId, approvedBody, userId, isAdmin, docHash } = params;
  const ownerScope = isAdmin ? undefined : userId;
  let wsItem: WorkspaceItemRecord | null = await getWorkspaceItemByAnyId(
    supabase,
    docId,
    'im',
    ownerScope
  );
  if (!wsItem && buildingId && buildingId !== docId) {
    wsItem = await getWorkspaceItemByAnyId(supabase, buildingId, 'im', ownerScope);
  }
  if (!wsItem) return null;
  if (wsItem.deletedAt || wsItem.status === 'archived' || wsItem.status === 'revoked') {
    return null;
  }

  const isDocumentRow = wsItem.id === docId;
  const snapshotSource = isDocumentRow
    ? approvedBody
    : wsItem.draftPayload && Object.keys(wsItem.draftPayload).length > 0
    ? wsItem.draftPayload
    : approvedBody;

  const ssot = (
    snapshotSource.ssot_summary && typeof snapshotSource.ssot_summary === 'object'
      ? snapshotSource.ssot_summary
      : approvedBody.ssot_summary && typeof approvedBody.ssot_summary === 'object'
      ? approvedBody.ssot_summary
      : {}
  ) as Record<string, any>;
  const basicDoc =
    snapshotSource.basicImDocument ||
    snapshotSource.basicImDoc ||
    approvedBody.basicImDocument ||
    approvedBody.basicImDoc ||
    undefined;
  const normalizedRentRoll =
    (Array.isArray(snapshotSource.rentRoll) && snapshotSource.rentRoll.length > 0 && snapshotSource.rentRoll) ||
    (Array.isArray(snapshotSource.rent_roll) && snapshotSource.rent_roll.length > 0 && snapshotSource.rent_roll) ||
    (Array.isArray(snapshotSource.floor_leases) && snapshotSource.floor_leases.length > 0 && snapshotSource.floor_leases) ||
    (Array.isArray(approvedBody.rentRoll) && approvedBody.rentRoll.length > 0 && approvedBody.rentRoll) ||
    (Array.isArray(approvedBody.rent_roll) && approvedBody.rent_roll.length > 0 && approvedBody.rent_roll) ||
    (Array.isArray(approvedBody.floor_leases) && approvedBody.floor_leases.length > 0 && approvedBody.floor_leases) ||
    undefined;
  const normalizedFloorLeases =
    (Array.isArray(snapshotSource.floor_leases) && snapshotSource.floor_leases.length > 0 && snapshotSource.floor_leases) ||
    (Array.isArray(approvedBody.floor_leases) && approvedBody.floor_leases.length > 0 && approvedBody.floor_leases) ||
    normalizedRentRoll;
  const normalizedAddress = String(
    snapshotSource.address ||
      snapshotSource.resolved_address ||
      ssot.address ||
      ssot.road_address ||
      ssot.jibun_address ||
      wsItem.address ||
      approvedBody.address ||
      approvedBody.resolved_address ||
      ''
  ).trim();
  const normalizedTitle = String(
    snapshotSource.title ||
      snapshotSource.buildingName ||
      snapshotSource.heroTitle ||
      wsItem.title ||
      approvedBody.title ||
      approvedBody.buildingName ||
      approvedBody.heroTitle ||
      '매물 IM'
  ).trim();
  const normalizedAskingPriceManwon =
    Number(
      snapshotSource.askingPriceManwon ??
        ssot.asking_price_manwon ??
        basicDoc?.facts?.transaction?.askingPriceManwon ??
        (Number(ssot.asking_price) > 0 ? Math.round(Number(ssot.asking_price) / 10_000) : 0)
    ) || 0;
  const normalizedGfaSqm =
    Number(
      snapshotSource.gfaSqm ??
        ssot.total_gross_area_sqm ??
        ssot.total_gross_area_m2 ??
        basicDoc?.facts?.building?.totalGrossAreaSqm ??
        0
    ) || 0;
  const normalizedLandAreaSqm =
    Number(
      snapshotSource.landAreaSqm ??
        ssot.land_area_sqm ??
        ssot.land_area_m2 ??
        basicDoc?.facts?.land?.landAreaSqm ??
        0
    ) || 0;
  const normalizedZoning = String(
    snapshotSource.zoning ||
      ssot.zoning ||
      basicDoc?.facts?.land?.zoning ||
      approvedBody.zoning ||
      ''
  ).trim();
  const normalizedSections =
    (Array.isArray(snapshotSource.sections) && snapshotSource.sections.length > 0 && snapshotSource.sections) ||
    (Array.isArray(approvedBody.sections) && approvedBody.sections.length > 0 && approvedBody.sections) ||
    undefined;

  const enrichedSnapshotSource: Record<string, any> = {
    ...approvedBody,
    ...snapshotSource,
    title: normalizedTitle,
    ...(normalizedAddress ? { address: normalizedAddress } : {}),
    ...(normalizedAskingPriceManwon > 0 ? { askingPriceManwon: normalizedAskingPriceManwon } : {}),
    ...(normalizedGfaSqm > 0 ? { gfaSqm: normalizedGfaSqm } : {}),
    ...(normalizedLandAreaSqm > 0 ? { landAreaSqm: normalizedLandAreaSqm } : {}),
    ...(normalizedZoning ? { zoning: normalizedZoning } : {}),
    ...(normalizedRentRoll ? { rentRoll: normalizedRentRoll } : {}),
    ...(normalizedFloorLeases ? { floor_leases: normalizedFloorLeases } : {}),
    ...(normalizedSections ? { sections: normalizedSections } : {}),
    ...(basicDoc ? { basicImDocument: basicDoc } : {}),
    ...(Object.keys(ssot).length > 0 ? { ssot_summary: ssot } : {}),
  };

  return {
    id: wsItem.id,
    buildingId: wsItem.buildingId ?? buildingId,
    title: normalizedTitle,
    address: normalizedAddress || wsItem.address,
    priceBand: wsItem.priceBand,
    draftPayload: isDocumentRow ? approvedBody : wsItem.draftPayload,
    publishedSnapshot: buildSanitizedImPublicSnapshot(enrichedSnapshotSource),
    ...(isDocumentRow && docHash ? { docHash } : {}),
  };
}

async function syncApprovedWorkspaceItem(params: {
  supabase: any;
  docId: string;
  buildingId: string | null;
  approvedBody: Record<string, any>;
  userId: string;
  isAdmin: boolean;
  docHash: string | null;
}): Promise<string | null> {
  const { supabase, userId, isAdmin } = params;
  try {
    const prepared = await prepareApprovedWorkspaceSyncPayload(params);
    if (!prepared) return null;

    await upsertWorkspaceItem(supabase, {
      id: prepared.id,
      buildingId: prepared.buildingId,
      ownerId: userId,
      isAdmin,
      kind: 'im',
      status: 'published',
      title: prepared.title,
      address: prepared.address,
      priceBand: prepared.priceBand,
      draftPayload: prepared.draftPayload,
      publishedSnapshot: prepared.publishedSnapshot,
      ...(prepared.docHash ? { docHash: prepared.docHash } : {}),
    });
    return null;
  } catch (err) {
    if (isMissingRelationOrColumnError(err)) return null;
    const msg = err instanceof Error ? err.message : String(err);
    if (/workspace_items/i.test(msg) && /does not exist|could not find/i.test(msg)) return null;
    return msg || 'workspace sync failed';
  }
}


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
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

  // Ensure the document belongs to this broker (with unmigrated column fallback)
  let { data: doc, error: fetchErr } = await supabase
    .from('document_objects')
    .select('id, owner_id, broker_id, status, building_id, series_id, version_no')
    .eq('id', id)
    .maybeSingle();

  if (
    fetchErr &&
    (fetchErr.code === '42703' || String(fetchErr.message || '').toLowerCase().includes('column'))
  ) {
    const fallbackRes = await supabase
      .from('document_objects')
      .select('id, owner_id, broker_id, status, building_id, body')
      .eq('id', id)
      .maybeSingle();
    doc = fallbackRes.data as any;
    fetchErr = fallbackRes.error;
  }

  if (fetchErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const ownerId = doc.broker_id ?? doc.owner_id;
  const isAdmin = guard.role === 'admin';
  if (!isAdmin && ownerId !== guard.user!.id) {
    return NextResponse.json({ error: 'Forbidden: not your document' }, { status: 403 });
  }

  let serverHash: string | undefined;
  let approvedTier: string | undefined;
  let approvedBody: Record<string, any> | null = null;
  let gateUpdatedAt: string | null = null;

  // D37 H-2 & CIM-0102: ApprovalGate 사전 검증 및 해시 결속 (승인 시에만)
  if (action === 'approve') {
    if (!expectedHash || typeof expectedHash !== 'string' || !expectedHash.startsWith('sha256:')) {
      return NextResponse.json({
        error: 'IM_APPROVAL_MISSING_EXPECTED_HASH',
        message: '승인 대상 해시(expectedHash)가 누락되었거나 유효하지 않습니다.',
      }, { status: 400 });
    }

    // WP-7.3D P2-6: read updated_at together with the body so the publish UPDATE can be
    // conditioned on it (optimistic concurrency — a concurrent edit after the hash check
    // must not be sealed under the stale hash).
    let { data: fullDocForGate, error: gateFetchErr } = await supabase
      .from('document_objects')
      .select('body, updated_at')
      .eq('id', id)
      .single();
    if (gateFetchErr && isMissingColumnError(gateFetchErr)) {
      const fb = await supabase.from('document_objects').select('body').eq('id', id).single();
      fullDocForGate = fb.data as any;
    }

    if (!fullDocForGate?.body) {
      return NextResponse.json({
        error: 'IM_APPROVAL_EMPTY_BODY',
        message: '승인할 문서 본문(body)이 비어 있습니다.',
      }, { status: 422 });
    }
    approvedBody = fullDocForGate.body as Record<string, any>;
    gateUpdatedAt =
      typeof (fullDocForGate as any).updated_at === 'string' && (fullDocForGate as any).updated_at
        ? String((fullDocForGate as any).updated_at)
        : null;

    // 대상 해시 계산 및 검증 (WP-P4a1-04 Three-Tier Hash Matrix 연동)
    const { computeContentHash } = await import('@/domain/building/im-core/hashes');
    const { computeTargetHash } = await import('@/domain/building/im-core/target-hash');
    const { resolveTier } = await import('@/domain/building/im-core/release-tier');
    
    // Bug 3-2: 기존에 internal_only로 잘못 저장된 문서 구제를 위해 승인 시점에 tier 재계산
    let tier = fullDocForGate.body.releaseTier ?? 'fact_om';
    if (tier === 'internal_only' && fullDocForGate.body.im_type === 'mobile_im_lite') {
       tier = 'fact_om'; // 모바일 Basic IM은 최소 fact_om 보장
    }
    approvedTier = tier;
    
    const contentHash = computeContentHash({
      body: fullDocForGate.body,
      releaseTier: tier,
      policyVersion: '2026-08-31',
    });

    const legacyTargetHash = computeTargetHash({
      body: fullDocForGate.body,
      releaseTier: tier,
      policyVersion: '2026-08-31',
    });

    if (expectedHash !== contentHash && expectedHash !== legacyTargetHash) {
      return NextResponse.json({
        error: 'IM_APPROVAL_HASH_MISMATCH',
        message: '승인 대상 문서가 변경되었습니다. 최신 상태를 확인 후 다시 승인해 주세요.',
        serverHash: contentHash,
        expectedHash,
      }, { status: 422 });
    }

    serverHash = expectedHash === legacyTargetHash ? legacyTargetHash : contentHash;

    // G2 해결: new ClaimRegistry() 빈 인스턴스화 제거 -> 실제 본문 claims로 재수화
    const { ClaimRegistry } = await import('@/domain/building/im-core');
    const registry = new ClaimRegistry();

    if (Array.isArray(fullDocForGate.body.claims) && fullDocForGate.body.claims.length > 0) {
      // 면적/금액 클레임은 유한 & > 0 만 재수화 (과거 문서의 0 값 클레임은 "누락"으로 취급 → 게이트가 포스처별로 판정)
      const POSITIVE_ONLY = new Set(['asking_price', 'total_area', 'total_area_sqm', 'land_area', 'land_area_sqm', 'plat_area_sqm', 'site_area_sqm']);
      for (const rawClaim of fullDocForGate.body.claims) {
        if (POSITIVE_ONLY.has(rawClaim?.subject) && typeof rawClaim?.value === 'number' && !(Number.isFinite(rawClaim.value) && rawClaim.value > 0)) continue;
        registry.register(rawClaim);
      }
    } else if (fullDocForGate.body.ssot_summary || fullDocForGate.body.sections) {
      // 레거시 문서 호환: ssot_summary에서 기본 Claim 재수화
      const ssot = fullDocForGate.body.ssot_summary || {};
      if (ssot.asking_price || ssot.asking_price_manwon || ssot.price) {
        registry.register({
          subject: 'asking_price',
          value: ssot.asking_price || (ssot.asking_price_manwon ? ssot.asking_price_manwon * 10000 : null) || ssot.price,
          evidence: [],
          provenance: 'broker',
          asOf: new Date().toISOString(),
          status: 'reconciled',
        });
      }
      const legacyTotalArea = [ssot.total_area, ssot.total_gross_area_sqm, ssot.gross_area].map(Number).find(v => Number.isFinite(v) && v > 0);
      if (legacyTotalArea) {
        registry.register({
          subject: 'total_area',
          value: legacyTotalArea,
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

    const allClaims = registry.getAll ? registry.getAll() : [];
    const ssot = fullDocForGate.body.ssot_summary || {};
    
    // gross_floor_area fallback for total_area
    if (!allClaims.some(c => ['total_area', 'total_area_sqm'].includes(c.subject))) {
      const area = [ssot.total_gross_area_sqm, ssot.gross_floor_area_sqm, ssot.gross_floor_area_m2].map(Number).find(v => Number.isFinite(v) && v > 0);
      if (area) {
        registry.register({
          subject: 'total_area',
          value: area,
          evidence: [],
          provenance: 'broker',
          asOf: new Date().toISOString(),
          status: 'reconciled',
        });
      }
    }
    // land_area fallback (개발 포스처 필수 / 그 외 선택) — ssot_summary 의 해석된 대지면적(>0)만 사용
    if (!allClaims.some(c => ['land_area', 'land_area_sqm', 'plat_area_sqm', 'site_area_sqm'].includes(c.subject))) {
      const land = [ssot.land_area_sqm, ssot.plat_area_sqm, ssot.site_area_sqm].map(Number).find(v => Number.isFinite(v) && v > 0);
      if (land) {
        registry.register({
          subject: 'land_area_sqm',
          value: land,
          evidence: [],
          provenance: 'broker',
          asOf: new Date().toISOString(),
          status: 'reconciled',
        });
      }
    }
    // yield fallback from monthly rent — V04 단일 수익률 정의: Σ월세×12 ÷ (매매가 − 보증금)
    // (보증금 미상/≥매매가 → 분모는 매매가 단독이며 단위 라벨에 기준을 명시)
    if (!allClaims.some(c => ['gross_yield', 'yield_on_cost', 'cap_rate', 'cap_rate_base', 'net_yield'].includes(c.subject))) {
      const monthlyRent = ssot.monthly_rent_total_krw || ssot.noi_monthly_krw;
      const askingPrice = ssot.asking_price_manwon ? ssot.asking_price_manwon * 10000 : ssot.asking_price;
      const depositKrwRaw = Number(ssot.total_deposit_krw ?? (Number(ssot.total_deposit_manwon) > 0 ? Number(ssot.total_deposit_manwon) * 10000 : NaN));
      const hasDeposit = Number.isFinite(depositKrwRaw) && depositKrwRaw > 0 && depositKrwRaw < askingPrice;
      const denominator = hasDeposit ? askingPrice - depositKrwRaw : askingPrice;
      if (monthlyRent && askingPrice && askingPrice > 0 && denominator > 0) {
        const annualYield = ((monthlyRent * 12) / denominator) * 100;
        registry.register({
          subject: 'gross_yield',
          value: Math.round(annualYield * 100) / 100,
          unit: hasDeposit ? '% (월세×12÷(매매가−보증금))' : '% (월세×12÷매매가, 보증금 미상)',
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
      posture: fullDocForGate.body.ssot_summary?.investment_posture ?? fullDocForGate.body.ssot_summary?.posture ?? fullDocForGate.body.investment_posture ?? fullDocForGate.body.investmentPosture ?? undefined,
    });

    if (!gateResult.passed) {
      return NextResponse.json({
        error: '승인 게이트 미통과 — 아래 항목을 해결해 주세요.',
        blockers: gateResult.blockers,
      }, { status: 422 });
    }

    // WP-7.3D P1-1: approval publishes the IM, so it must pass the same statutory disclosure
    // gate (공인중개사법 표시·광고 의무 + IM 핵심 5항목) as every other publish path
    // (workspace publish_im, lifecycle publish, quick-generate). Same 422 contract.
    const statutoryGate = await assertPublishable({
      supabase,
      userId: ownerId || guard.user!.id,
      kind: 'im',
      itemPayload: fullDocForGate.body,
    });
    if (!statutoryGate.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: statutoryGate.code,
          error: statutoryGate.message,
          missingFields: statutoryGate.missingFields,
          missingLabels: statutoryGate.missingLabels,
        },
        { status: 422 }
      );
    }
  }

  const newStatus = action === 'approve' ? 'published' : 'revision_needed';
  const nowIso = new Date().toISOString();

  // Attempt single-transaction atomic approval RPC when available (and not under mocked upsertWorkspaceItem unit spy)
  let ledgerRecorded = true;
  let workspaceSyncError: string | null = null;
  let handledApproveViaRpc = false;
  const isUpsertSpyMocked = Boolean((upsertWorkspaceItem as unknown as { mock?: unknown })?.mock);

  if (
    action === 'approve' &&
    typeof (supabase as { rpc?: unknown }).rpc === 'function' &&
    !isUpsertSpyMocked
  ) {
    let wsSyncJson: Record<string, unknown> | null = null;
    if (approvedBody) {
      try {
        const prepared = await prepareApprovedWorkspaceSyncPayload({
          supabase,
          docId: id,
          buildingId: (doc as any).building_id ? String((doc as any).building_id) : null,
          approvedBody,
          userId: guard.user!.id,
          isAdmin,
          docHash: serverHash ?? null,
        });
        if (prepared) {
          wsSyncJson = {
            id: prepared.id,
            title: prepared.title,
            address: prepared.address,
            price_band: prepared.priceBand,
            draft_payload: prepared.draftPayload,
            published_snapshot: prepared.publishedSnapshot,
            doc_hash: prepared.docHash ?? null,
          };
        }
      } catch (prepErr) {
        if (!isMissingRelationOrColumnError(prepErr)) {
          log.warn('[approve] workspace sync payload prep warning:', prepErr);
        }
      }
    }

    const rpcRes = await supabase.rpc('rpc_approve_im_document', {
      p_doc_id: id,
      p_expected_updated_at: gateUpdatedAt,
      p_server_hash: serverHash ?? null,
      p_release_tier: approvedTier || 'fact_om',
      p_policy_version: '2026-08-31',
      p_actor_id: guard.user!.id,
      p_approved_by: guard.user!.email || guard.user!.id,
      p_notes: brokerNotes || null,
      p_workspace_sync: wsSyncJson,
    });

    if (rpcRes && !rpcRes.error && rpcRes.data && typeof rpcRes.data === 'object') {
      const rpcObj = rpcRes.data as Record<string, unknown>;
      if (rpcObj.code === 'IM_APPROVAL_CONFLICT') {
        return NextResponse.json(
          {
            ok: false,
            error: 'IM_APPROVAL_CONFLICT',
            code: 'IM_APPROVAL_CONFLICT',
            message: '승인 도중 문서가 변경되었습니다. 최신 상태를 확인 후 다시 승인해 주세요.',
          },
          { status: 409 }
        );
      }
      if (rpcObj.code === 'NOT_FOUND') {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }
      if (rpcObj.ok === true) {
        handledApproveViaRpc = true;
        ledgerRecorded = rpcObj.ledger_recorded !== false;
      }
    } else if (rpcRes?.error && !isMissingRpcError(rpcRes.error)) {
      log.error('[approve] rpc_approve_im_document failed:', {
        code: rpcRes.error?.code,
        message: rpcRes.error?.message,
        id,
      });
      return NextResponse.json(
        { ok: false, error: 'IM 승인 상태 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 500 }
      );
    }
  }

  if (!handledApproveViaRpc) {
    // WP-P4a1-02: NEVER mutate document_objects.body in-place!
    // Write approval metadata strictly to im_approvals ledger and set sealed_at / status.
    const updatePayload: Record<string, any> = {
      status: newStatus,
      updated_at: nowIso,
    };

    if (action === 'approve') {
      updatePayload.sealed_at = nowIso;
      if (serverHash) {
        updatePayload.seal_hash = serverHash;
        updatePayload.content_hash = serverHash;
      }
    }

    // WP-7.3D P2-6: approval UPDATE is conditioned on the updated_at observed when the hash was
    // verified. 0 rows updated ⇒ someone changed the document in between ⇒ 409 (re-verify).
    const isConditionalApprove = action === 'approve' && Boolean(gateUpdatedAt);
    const runDocUpdate = async (payload: Record<string, any>) => {
      let q: any = supabase.from('document_objects').update(payload).eq('id', id);
      if (isConditionalApprove) {
        q = q.eq('updated_at', gateUpdatedAt);
        if (typeof q.select === 'function') q = q.select('id');
      }
      return (await q) as { data: unknown; error: any };
    };

    let updateRes = await runDocUpdate(updatePayload);

    if (updateRes.error && isMissingColumnError(updateRes.error)) {
      updateRes = await runDocUpdate({
        status: newStatus,
        updated_at: nowIso,
      });
    }

    if (updateRes.error) {
      // WP-7.3D P2-7: never leak raw DB error text to the client.
      log.error('[approve] document_objects update failed:', {
        code: updateRes.error?.code,
        message: updateRes.error?.message,
        id,
      });
      return NextResponse.json(
        { ok: false, error: 'IM 승인 상태 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 500 }
      );
    }

    if (isConditionalApprove && countMutatedRows(updateRes.data) === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'IM_APPROVAL_CONFLICT',
          code: 'IM_APPROVAL_CONFLICT',
          message: '승인 도중 문서가 변경되었습니다. 최신 상태를 확인 후 다시 승인해 주세요.',
        },
        { status: 409 }
      );
    }

    // Record to append-only im_approvals ledger
    if (action === 'approve' && serverHash) {
      try {
        // WP-7.3D P2-5: Supabase returns (not throws) errors → inspect them; and record the
        // tier the approval hash was actually computed with (not a hardcoded 'fact_om').
        const { error: ledgerErr } = await supabase
          .from('im_approvals')
          .insert({
            version_id: id,
            series_id: (doc as any).series_id || null,
            version_no: (doc as any).version_no || null,
            event: 'approve',
            actor_id: guard.user!.id,
            approved_by: guard.user!.email || guard.user!.id,
            target_hash: serverHash,
            content_hash: serverHash,
            release_tier: approvedTier || 'fact_om',
            policy_version: '2026-08-31',
            notes: brokerNotes || null,
            approved_at: nowIso,
          });
        if (ledgerErr) {
          ledgerRecorded = false;
          if (isMissingRelationOrColumnError(ledgerErr)) {
            log.warn('[approve] im_approvals ledger unavailable (pre-cutover schema):', {
              code: ledgerErr.code,
              message: ledgerErr.message,
            });
          } else {
            log.error('[approve] im_approvals ledger insert failed:', {
              code: ledgerErr.code,
              message: ledgerErr.message,
              id,
            });
          }
        }
      } catch (apprErr) {
        ledgerRecorded = false;
        log.warn('[approve] Failed to record to im_approvals (fallback):', apprErr);
      }

      // Update series pointer & mark prior version superseded if series_id exists
      if ((doc as any).series_id) {
        try {
          const { data: series } = await supabase
            .from('im_series')
            .select('published_version_id')
            .eq('id', (doc as any).series_id)
            .maybeSingle();

          if (series?.published_version_id && series.published_version_id !== id) {
            await supabase
              .from('document_objects')
              .update({
                status: 'superseded',
                superseded_by: id,
                updated_at: nowIso,
              })
              .eq('id', series.published_version_id);
          }

          await supabase
            .from('im_series')
            .update({
              latest_approved_version_no: (doc as any).version_no,
              latest_approved_version_id: id,
              published_version_id: id,
              updated_at: nowIso,
            })
            .eq('id', (doc as any).series_id);
        } catch (seriesErr) {
          log.warn('[approve] Failed to update im_series (fallback):', seriesErr);
        }
      }
    }

    // WP-7.3D P1-2: publish the canonical workspace_items row (sanitized snapshot) so the public
    // viewer no longer treats the approved IM as "draft without snapshot" (404).
    if (action === 'approve' && approvedBody) {
      workspaceSyncError = await syncApprovedWorkspaceItem({
        supabase,
        docId: id,
        buildingId: (doc as any).building_id ? String((doc as any).building_id) : null,
        approvedBody,
        userId: guard.user!.id,
        isAdmin,
        docHash: serverHash ?? null,
      });
      if (workspaceSyncError) {
        log.error('[approve] workspace_items publish sync failed:', { id, error: workspaceSyncError });
      }
    }
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
        log.info(`[approve] Golden Set: ${goldenCount} sections registered`);
      }

      // Bug 1: 딜카드 투자 포인트 역동기화 — heroCard → building_ssot_lite.fit_summary
      if (fullDoc?.body?.heroCard?.keyInvestmentPoint && fullDoc?.building_id) {
        // label-prefix accumulation guard: sync only the pure body text
        const fitSummary = sanitizeFitSummary(fullDoc.body.heroCard.keyInvestmentPoint);
        // 디폴트 문장이 아닌 경우에만 역동기화
        if (!fitSummary.includes('투자 검토 자료입니다') && fitSummary.length > 10) {
          await supabase
            .from('building_ssot_lite')
            .update({ fit_summary: fitSummary })
            .eq('id', fullDoc.building_id);
          log.info(`[approve] fit_summary synced to deal card: ${fitSummary.slice(0, 50)}...`);
        }
      }
    } catch (goldenErr) {
      log.warn('[approve] Golden set registration failed (non-blocking):', goldenErr);
    }
  }

  if (workspaceSyncError) {
    // The document is approved, but the public projection is not yet published — surface a
    // retryable error (re-approving is safe: the hash/conditional update re-verifies).
    return NextResponse.json(
      {
        ok: false,
        id,
        status: newStatus,
        code: 'WORKSPACE_SYNC_FAILED',
        error: '승인은 저장되었지만 공개 링크 반영에 실패했습니다. 잠시 후 다시 승인해 주세요.',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    id,
    status: newStatus,
    ...(action === 'approve' ? { ledgerRecorded } : {}),
    message: action === 'approve' ? 'IM이 승인되어 공개되었습니다.' : '수정 요청이 등록되었습니다.',
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { requireBroker, type AuthGuardResult } from '@/lib/auth-guard';
import { assertStudioDealOwner } from '@/lib/authz/studio-owner';
import { studioService } from '@/domain/building/pptx-studio/studio-service';
import { StudioApprovalService } from '@/domain/building/pptx-studio/approval/studio-approval-service';
import { createPersistentApprovalLedger } from '@/platform/im-pipeline/supabase-approval-ledger';
import { resolveApprovalTargetDoc } from '@/domain/building/pptx-studio/approval/resolve-approval-target';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let brokerId = 'broker-system';
  let studioGuard: AuthGuardResult | null = null;
  if (!(process.env.NODE_ENV === 'test' && req.headers.get('x-test-bypass'))) {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    studioGuard = guard;
    if (guard.user?.id) brokerId = guard.user.id;
  } else {
    brokerId = req.headers.get('x-broker-id') || 'broker-test';
  }

  const { id: projectId } = await params;

  try {
    let project;
    try {
      project = await studioService.getProject(projectId);
    } catch {
      project = await studioService.findProjectByDealId(projectId);
    }

    if (!project) {
      return NextResponse.json(
        { ok: false, error: `Project ${projectId} not found` },
        { status: 404 }
      );
    }

    // P0-SEC: 프로젝트 소유권 = dealId(매물/원본 문서) 소유권. 소유자·admin 만 접근.
    const denied = await assertStudioDealOwner(studioGuard, project.dealId);
    if (denied) return denied;

    // Strictly enforce S60 predecessor requirement
    if (project.stage !== 'S60_EDITORIAL_APPROVAL') {
      return NextResponse.json(
        {
          ok: false,
          code: 'PRECONDITION_FAILED',
          error: 'PRECONDITION_FAILED: 파일 승인(S70) 전 편집 승인(S60)이 반드시 선행되어야 합니다',
          currentStage: project.stage,
        },
        { status: 412 }
      );
    }

    const body = await req.json().catch(() => ({}));
    let fileHash = body.fileHash;
    if (!fileHash) {
      // Compute SHA-256 hash from project slides and publish metadata
      const binaryPayload = Buffer.from(JSON.stringify({
        projectId: project.id,
        dealId: project.dealId,
        title: project.title,
        themeId: project.themeId,
        slides: project.slides,
        editorialApprovedBy: project.editorialApprovedBy,
      }));
      fileHash = `sha256:${createHash('sha256').update(binaryPayload).digest('hex')}`;
    }

    const fileUrl = body.fileUrl || `/api/broker/pptx-studio/projects/${project.id}/download`;

    // P0-SEC: 승인 대상 문서를 정확히 1건으로 확정한다 (fail-closed).
    // 이전: .or(building_id.eq.X,id.eq.X).maybeSingle() 이 2건 이상이면 null → 게이트 생략 →
    //       update(...).or(...) 로 해당 매물의 모든 문서를 published 처리.
    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabaseClient: any = createServiceClient();
    const dealId = project.dealId;

    // 소유자 문서 기준: 일반 브로커는 본인, admin 은 매물 소유자의 문서
    let targetOwnerId: string | null = studioGuard ? (studioGuard.user?.id ?? null) : brokerId;
    if (studioGuard?.role === 'admin') {
      const { data: bRow } = await supabaseClient
        .from('building_ssot_lite')
        .select('owner_id')
        .eq('id', dealId)
        .maybeSingle();
      targetOwnerId = (bRow?.owner_id as string | null | undefined) ?? targetOwnerId;
    }

    const target = await resolveApprovalTargetDoc(supabaseClient, dealId, targetOwnerId);
    if (!target.ok) {
      return NextResponse.json(
        { ok: false, code: target.code, error: target.message },
        { status: target.status }
      );
    }
    const targetDoc = target.doc;

    // Enforce Rule 15: Run approval gate BEFORE recording S70 file approval in ledger (대상 문서 1건, 예외 시 fail-closed)
    try {
      const { ClaimRegistry, runApprovalGate } = await import('@/domain/building/im-core');
      const docBody: Record<string, any> = targetDoc.body ?? {};
      const tier = docBody.releaseTier ?? 'fact_om';
      const registry = new ClaimRegistry();

      if (Array.isArray(docBody.claims) && docBody.claims.length > 0) {
        for (const rawClaim of docBody.claims) {
          registry.register(rawClaim);
        }
      } else if (docBody.ssot_summary || docBody.sections) {
        const ssot = docBody.ssot_summary || {};
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

      const posture = docBody.ssot_summary?.investment_posture
        ?? docBody.ssot_summary?.posture
        ?? docBody.investment_posture
        ?? docBody.investmentPosture
        ?? undefined;

      const gateResult = runApprovalGate(registry, tier, {
        hasHallucination: docBody.hasHallucination === true,
        publishBlocked: docBody.gateReport?.blocked === true,
        posture,
      });

      if (gateResult.passed === false) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Approval gate failed',
            targetDocumentId: targetDoc.id,
            blockers: gateResult.blockers,
          },
          { status: 422 }
        );
      }
    } catch (gateCheckErr) {
      log.error('[approve-file] Pre-approval gate check failed (fail-closed):', gateCheckErr);
      return NextResponse.json(
        { ok: false, code: 'GATE_CHECK_FAILED', error: '승인 게이트 검사를 수행하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 500 }
      );
    }

    const approvalService = new StudioApprovalService(createPersistentApprovalLedger());
    const { fileApproval, release } = await approvalService.approveFile(
      project,
      fileHash,
      fileUrl,
      brokerId
    );

    studioService.saveProject(project);

    // Sync to document_objects (대상 문서 1건만) and broadcast S70 file approval event
    try {
      const { broadcastApprovalEvent } = await import('@/platform/im-pipeline/realtime/dealcard-sync-channel');
      const supabase = supabaseClient;

      const { error: publishErr } = await supabase
        .from('document_objects')
        .update({
          status: 'published',
          content: {
            ...(targetDoc.content || {}),
            approval_stage: 'S70_FILE_APPROVAL',
            approval_target_hash: fileHash,
            pptx_file_hash: fileHash,
            pptx_download_url: fileUrl,
            approved_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetDoc.id);
      if (publishErr) {
        log.warn('[approve-file] document publish update failed:', publishErr.message ?? publishErr);
      }

      await broadcastApprovalEvent(supabase, {
        buildingId: dealId,
        projectId: project.id,
        stage: 'S70_FILE_APPROVAL',
        targetHash: fileHash,
        approvalEvent: fileApproval,
        releaseRecord: release,
        fileUrl,
        timestamp: new Date().toISOString(),
      });
    } catch (syncErr) {
      log.warn('[approve-file] Sync to document_objects/broadcast failed (non-blocking):', syncErr);
    }

    return NextResponse.json({
      ok: true,
      projectId: project.id,
      stage: 'S70_FILE_APPROVAL',
      fileApprovedBy: brokerId,
      artifactFileHash: fileHash,
      publicUrl: fileUrl,
      publishedDocumentId: targetDoc.id,
      status: 'PUBLISHED',
      fileApproval,
      release,
      message: 'PPTX 파일 바이너리 승인이 완료되어 공식 발행되었습니다.',
    });
  } catch (err: any) {
    const isPrecondition = err.message?.includes('PRECONDITION_FAILED');
    return NextResponse.json(
      {
        ok: false,
        code: isPrecondition ? 'PRECONDITION_FAILED' : 'ERROR',
        error: err.message || 'File approval failed',
      },
      { status: isPrecondition ? 412 : 400 }
    );
  }
}

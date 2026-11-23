/**
 * POST /api/public/gate/submit
 * 
 * G2 게이트 제출 → Party 생성 → 조건 축적 → 슬라이더 소급 바인딩
 * §5: 대가로 Basic IM 전문 열람 권한 부여
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  validateG2Form,
  normalizeKoreanMobilePhone,
  ENTITY_TYPE_MAP,
  BUDGET_BAND_MAP,
} from '@/domain/identity/gate-schema';
import { findOrCreateParty, bindRecipientToParty } from '@/domain/identity/party-service';
import { insertCondition } from '@/domain/identity/condition-engine';
import { bindViewerHistory } from '@/domain/identity/bind';
import { createServiceClient } from '@/lib/supabase/service';
import { checkRateLimit } from '@/lib/rate-limiter';
import { createModuleLogger } from '@/lib/logger';
import { recordFunnelEvent } from '@/lib/observability/funnel-slo';
import { getInboxState, getQuickImRecord, isUuid } from '@/lib/im-lite/quick-generate-store';
import { getPublicWorkspaceProjection } from '@/lib/workspace/workspace-repository';
import { isLegacyBuildingRowPublic } from '@/lib/deal-card/publish-sync';
import {
  isBuildingShareLinkRevoked,
  verifyShareLinkToken,
} from '@/lib/security/share-link-tokens';
import { upsertBrokerClientFromInbound } from '@/lib/inbox/upsert-broker-client';

const log = createModuleLogger('public-gate-submit');

export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV !== 'test') {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
      const allowed = await checkRateLimit(ip, 'gate_g2_submit', 15, 60_000);
      if (!allowed) {
        return NextResponse.json(
          { ok: false, accessGranted: false, error: '요청 횟수가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
          { status: 429 }
        );
      }
    }

    const body = await req.json();
    const {
      formData,
      dealId,
      viewerId,
      shareToken,
      recipientId,
    } = body || {};

    // 0. 명시적 개인정보 수집·이용 동의 검증 (PIPA)
    const hasExplicitConsent =
      formData?.consent === true || body?.consent === true;
    if (!hasExplicitConsent) {
      return NextResponse.json(
        {
          ok: false,
          accessGranted: false,
          error: '개인정보 수집 및 이용에 동의해 주세요.',
          errors: ['개인정보 수집 및 이용에 동의해 주세요.'],
        },
        { status: 400 }
      );
    }

    // 1. 유효성 검증 (+82 국제번호 정규화 지원, 선택 필드 email/company/memo 포함)
    const normalizedFormData = {
      ...(formData || {}),
      ...(formData?.email === undefined && typeof (body as any)?.email === 'string'
        ? { email: (body as any).email }
        : {}),
      ...(formData?.company === undefined && typeof (body as any)?.company === 'string'
        ? { company: (body as any).company }
        : {}),
      ...(formData?.memo === undefined && typeof (body as any)?.memo === 'string'
        ? { memo: (body as any).memo }
        : {}),
    };
    const validation = validateG2Form(normalizedFormData);
    if (!validation.valid) {
      return NextResponse.json(
        { ok: false, accessGranted: false, errors: validation.errors },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizeKoreanMobilePhone(normalizedFormData.phone);
    const cleanName = String(normalizedFormData.name || '').trim();
    const cleanEmail =
      typeof normalizedFormData.email === 'string'
        ? normalizedFormData.email.trim().toLowerCase()
        : '';
    const cleanCompany =
      typeof normalizedFormData.company === 'string'
        ? normalizedFormData.company.trim()
        : '';
    const cleanMemo =
      typeof normalizedFormData.memo === 'string'
        ? normalizedFormData.memo.trim()
        : '';

    const supabase = createServiceClient();
    let effectiveDealId = typeof dealId === 'string' ? dealId.trim() : '';
    let verifiedTokenBrokerId: string | undefined = undefined;

    if (typeof shareToken === 'string' && shareToken.trim()) {
      try {
        const verified = await verifyShareLinkToken({
          token: shareToken.trim(),
          ...(effectiveDealId ? { buildingId: effectiveDealId } : {}),
        });
        if (!verified.valid) {
          return NextResponse.json(
            {
              ok: false,
              accessGranted: false,
              code: verified.reason === 'lookup_failed' ? 'GOVERNANCE_CHECK_UNAVAILABLE' : 'INVALID_OR_REVOKED_TOKEN',
              error:
                verified.reason === 'lookup_failed'
                  ? '공유 링크 상태를 확인할 수 없어 잠시 후 다시 시도해 주세요.'
                  : '유효하지 않거나 회수된 공유 링크입니다.',
            },
            { status: verified.reason === 'lookup_failed' ? 503 : 403 }
          );
        }
        if (!effectiveDealId && verified.buildingId) {
          effectiveDealId = verified.buildingId.trim();
        }
        if (verified.brokerId && isUuid(verified.brokerId)) {
          verifiedTokenBrokerId = verified.brokerId;
        }
      } catch {
        return NextResponse.json(
          {
            ok: false,
            accessGranted: false,
            error: '공유 링크 검증에 실패했습니다.',
          },
          { status: 503 }
        );
      }
    }

    if (!effectiveDealId) {
      return NextResponse.json(
        {
          ok: false,
          accessGranted: false,
          error: '대상 매물 식별자(dealId)가 필요합니다.',
          errors: ['대상 매물 식별자(dealId)가 필요합니다.'],
        },
        { status: 400 }
      );
    }

    let resolvedBrokerId: string | undefined = undefined;
    let resolvedTenantId: string | undefined = undefined;
    let resolvedBuildingTitle = '';
    let resolvedGateBuildingId: string | null = null;

    // 잠금 상태 및 실재·소유 공인중개사(broker_id / owner_id)를 서버에서 검증
    {
      const dealKey = effectiveDealId;
      const quickRec = getQuickImRecord(dealKey);

      if (
        isBuildingShareLinkRevoked(dealKey) ||
        Boolean(getInboxState().revokedBuildings?.[dealKey]?.revoked) ||
        Boolean(quickRec?.isRevoked)
      ) {
        return NextResponse.json(
          {
            ok: false,
            accessGranted: false,
            error: '담당 공인중개사가 열람 링크를 잠근 매물입니다.',
          },
          { status: 403 }
        );
      }

      // Cold-start revocation check via activity_events
      try {
        const { data: revEvents } = await supabase
          .from('activity_events')
          .select('event_type, entity_id, metadata, created_at')
          .in('event_type', ['link_revoked', 'link_restored'])
          .order('created_at', { ascending: false })
          .limit(50);
        for (const ev of revEvents || []) {
          const meta =
            ev?.metadata && typeof ev.metadata === 'object'
              ? (ev.metadata as Record<string, unknown>)
              : {};
          if (meta.scope === 'thread' || meta.scope === 'recipient_approval') continue;
          const evBId = String(meta.building_id || ev?.entity_id || '').trim();
          if (evBId !== dealKey) continue;
          if (ev.event_type === 'link_revoked') {
            return NextResponse.json(
              {
                ok: false,
                accessGranted: false,
                error: '담당 공인중개사가 열람 링크를 잠근 매물입니다.',
              },
              { status: 403 }
            );
          }
          if (ev.event_type === 'link_restored') break;
        }
      } catch {
        // non-blocking
      }

      // Kernel K2: Check canonical workspace_items FIRST so a draft/revoked workspace row
      // can NEVER be bypassed by a co-existing building_ssot_lite row.
      let dealExists = false;
      const wsProj = await getPublicWorkspaceProjection(supabase, dealKey).catch(() => null);
      if (wsProj?.found) {
        if (wsProj.revoked) {
          return NextResponse.json(
            {
              ok: false,
              accessGranted: false,
              error: '담당 공인중개사가 열람 링크를 잠근 매물입니다.',
            },
            { status: 403 }
          );
        }
        if (wsProj.deleted || !wsProj.projection) {
          return NextResponse.json(
            {
              ok: false,
              accessGranted: false,
              error: '비공개 또는 작성 중인 매물입니다.',
            },
            { status: 404 }
          );
        }
        dealExists = true;
        resolvedBrokerId = wsProj.projection.ownerId;
        resolvedTenantId = wsProj.projection.ownerId;
        resolvedBuildingTitle = String(wsProj.projection.title || '').trim();
        if (wsProj.projection.buildingId && isUuid(wsProj.projection.buildingId)) {
          resolvedGateBuildingId = wsProj.projection.buildingId;
        }
      }

      if (!dealExists && isUuid(dealKey)) {
        const { data: dealRow } = await supabase
          .from('deals')
          .select('id, broker_id')
          .eq('id', dealKey)
          .maybeSingle();
        if (dealRow?.id) {
          dealExists = true;
          if (dealRow.broker_id) {
            resolvedBrokerId = dealRow.broker_id;
            resolvedTenantId = dealRow.broker_id;
          }
        }
        if (!dealExists) {
          const { data: bldgRow } = await supabase
            .from('building_ssot_lite')
            .select('id, owner_id, status')
            .eq('id', dealKey)
            .maybeSingle();
          if (bldgRow?.status === 'archived') {
            return NextResponse.json(
              {
                ok: false,
                accessGranted: false,
                error: '비공개 또는 삭제된 매물입니다.',
              },
              { status: 404 }
            );
          }
          if (bldgRow?.id) {
            if (!isLegacyBuildingRowPublic(bldgRow.status)) {
              return NextResponse.json(
                {
                  ok: false,
                  accessGranted: false,
                  error: '비공개 또는 작성 중인 매물입니다.',
                },
                { status: 404 }
              );
            }
            dealExists = true;
            if (bldgRow.owner_id) {
              resolvedBrokerId = bldgRow.owner_id;
              resolvedTenantId = bldgRow.owner_id;
            }
          }
        }
      }

      if (!dealExists && quickRec) {
        const quickStatus = String((quickRec as unknown as Record<string, unknown>).status || '').toLowerCase();
        if (quickStatus === 'draft' || quickStatus === 'archived') {
          return NextResponse.json(
            {
              ok: false,
              accessGranted: false,
              error: '비공개 또는 작성 중인 매물입니다.',
            },
            { status: 404 }
          );
        }
        dealExists = true;
        if (quickRec.ownerId) {
          resolvedBrokerId = quickRec.ownerId;
          resolvedTenantId = quickRec.ownerId;
        }
        if (quickRec.buildingName) {
          resolvedBuildingTitle = String(quickRec.buildingName).trim();
        }
      }

      if (!dealExists) {
        return NextResponse.json(
          {
            ok: false,
            accessGranted: false,
            error: '대상 매물 정보를 찾을 수 없습니다.',
          },
          { status: 404 }
        );
      }

      if (!resolvedBrokerId && verifiedTokenBrokerId) {
        resolvedBrokerId = verifiedTokenBrokerId;
        resolvedTenantId = verifiedTokenBrokerId;
      }
    }

    const brokerId = resolvedBrokerId && isUuid(resolvedBrokerId) ? resolvedBrokerId : null;
    const tenantId =
      resolvedTenantId && isUuid(resolvedTenantId) ? resolvedTenantId : brokerId;

    if (!brokerId || !tenantId || !isUuid(brokerId) || !isUuid(tenantId)) {
      return NextResponse.json(
        {
          ok: false,
          accessGranted: false,
          code: 'BROKER_IDENTITY_UNRESOLVED',
          error: '담당 공인중개사 식별 정보를 확인할 수 없어 열람 자격을 처리할 수 없습니다.',
        },
        { status: 422 }
      );
    }

    // 2. Party 생성 (또는 기존 Party 반환)
    const entityType = (ENTITY_TYPE_MAP[formData.entityType] || 'individual') as
      | 'individual'
      | 'corp'
      | 'fund'
      | 'agent';
    const party = await findOrCreateParty({
      tenantId,
      ownerBrokerId: brokerId,
      name: cleanName,
      phone: normalizedPhone,
      entityType,
      consentVersion: 'v1',
    });

    // 3. buyer_condition 축적 (gate_form → confidence: high)
    await insertCondition({
      partyId: party.id,
      source: 'gate_form',
      confidence: 'high',
      budgetBand: BUDGET_BAND_MAP[formData.budgetBand] || formData.budgetBand,
      purpose: formData.purpose,
      financing: formData.financing,
    });

    // 4. Recipient → Party 확정적 결합
    if (recipientId) {
      await bindRecipientToParty(recipientId, party.id);
    }

    // 5. 슬라이더 소급 바인딩 (§6)
    if (viewerId) {
      await bindViewerHistory(viewerId, party.id);
    }

    // 6. Track event — intent.detail_request (strictly guarded on valid UUIDs, non-blocking)
    if (isUuid(effectiveDealId) && isUuid(tenantId)) {
      try {
        const { error: trackErr } = await supabase.from('track_event').insert({
          tenant_id: tenantId,
          deal_id: effectiveDealId,
          kind: 'intent.detail_request',
          viewer_id: viewerId || null,
          share_token: shareToken || null,
          party_id: party.id,
          payload: { formSource: 'gate_g2' },
        });
        if (trackErr) {
          log.warn('[gate/submit] track_event insert failed (non-blocking)', {
            dealId: effectiveDealId,
            partyId: party.id,
            error: trackErr.message,
          });
        }
      } catch (trackEx) {
        log.warn('[gate/submit] track_event insert threw (non-blocking)', {
          dealId: effectiveDealId,
          partyId: party.id,
          error: trackEx instanceof Error ? trackEx.message : String(trackEx),
        });
      }
    }

    // 7. Persist real gate_requests row (when UUID building exists) + activity_events fallback
    const budgetLabel =
      BUDGET_BAND_MAP[normalizedFormData.budgetBand] || normalizedFormData.budgetBand;
    const gateTargetBuildingId =
      resolvedGateBuildingId || (isUuid(effectiveDealId) ? effectiveDealId : null);

    let insertedGateRequestId: string | null = null;
    if (gateTargetBuildingId) {
      try {
        const gateReasonPayload = JSON.stringify({
          name: cleanName,
          phone: normalizedPhone,
          ...(cleanEmail ? { email: cleanEmail } : {}),
          ...(cleanCompany ? { company: cleanCompany } : {}),
          ...(cleanMemo ? { message: cleanMemo, memo: cleanMemo } : {}),
          budgetBand: budgetLabel,
          purpose: normalizedFormData.purpose,
          financing: normalizedFormData.financing,
          entityType: normalizedFormData.entityType,
          source: 'gate_g2',
        });

        const baseGatePayload = {
          building_id: gateTargetBuildingId,
          requester_id: null,
          requested_level: 'G2',
          requested_fields: ['상세 주소/지번', '임대차 현황(렌트롤)', '수익성 시나리오', '매도인 희망가'],
          reason: gateReasonPayload,
          status: 'submitted',
          ...(brokerId ? { target_broker_id: brokerId } : {}),
        };

        let grInsertRes: any = await supabase
          .from('gate_requests')
          .insert(baseGatePayload)
          .select('id')
          .single();

        const grErrCode = String(grInsertRes?.error?.code || '');
        const grErrMsg = String(grInsertRes?.error?.message || '');
        if (
          grInsertRes?.error &&
          (grErrCode === '42703' ||
            grErrCode === 'PGRST204' ||
            grErrMsg.includes('target_broker_id'))
        ) {
          const { target_broker_id: _omitted, ...fallbackPayload } = baseGatePayload;
          grInsertRes = await supabase
            .from('gate_requests')
            .insert(fallbackPayload)
            .select('id')
            .single();
        }

        if (
          !grInsertRes?.error &&
          grInsertRes?.data?.id &&
          isUuid(String(grInsertRes.data.id))
        ) {
          insertedGateRequestId = String(grInsertRes.data.id);
        }
      } catch {
        // Non-blocking (e.g. standalone workspace_items dealId or minimal test mock)
      }
    }

    const eventGateRequestId =
      insertedGateRequestId ||
      `gr-submit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // 7b. Record gate_request_created in activity_events so submissions appear in /broker/w/inbox
    try {
      await supabase.from('activity_events').insert({
        actor_id: party.id && isUuid(party.id) ? party.id : null,
        actor_role: 'anonymous',
        event_type: 'gate_request_created',
        entity_type: 'gate_request',
        entity_id:
          insertedGateRequestId ||
          (isUuid(effectiveDealId)
            ? effectiveDealId
            : party.id && isUuid(party.id)
            ? party.id
            : null),
        metadata: {
          gate_request_id: eventGateRequestId,
          building_id: gateTargetBuildingId || effectiveDealId,
          broker_id: brokerId,
          party_id: party.id,
          requester_name: cleanName,
          requester_phone: normalizedPhone,
          ...(cleanEmail ? { email: cleanEmail, requester_email: cleanEmail } : {}),
          ...(cleanCompany
            ? { company: cleanCompany, requester_company: cleanCompany }
            : {}),
          ...(cleanMemo ? { memo: cleanMemo, message: cleanMemo } : {}),
          requested_level: 'G2',
          budget_band: budgetLabel,
          purpose: normalizedFormData.purpose,
          financing: normalizedFormData.financing,
          consent_agreed: true,
          form_source: 'gate_g2',
        },
      });
    } catch {
      // non-blocking
    }

    // 8. Auto-upsert into broker_clients CRM (idempotent, non-blocking)
    try {
      await upsertBrokerClientFromInbound({
        supabase,
        brokerUserId: brokerId,
        name: cleanName,
        phone: normalizedPhone,
        email: cleanEmail || undefined,
        company: cleanCompany || undefined,
        buildingId: gateTargetBuildingId || (isUuid(effectiveDealId) ? effectiveDealId : null),
        buildingTitle: resolvedBuildingTitle || undefined,
        clientRole: 'buyer',
        source: 'gate_g2',
      });
    } catch (crmErr) {
      log.warn('[gate/submit] upsertBrokerClientFromInbound failed (non-blocking)', {
        dealId: effectiveDealId,
        error: crmErr instanceof Error ? crmErr.message : String(crmErr),
      });
    }

    recordFunnelEvent({
      funnel: 'share_view_to_gate',
      outcome: 'ok',
      entityId: effectiveDealId,
      meta: { budgetBand: normalizedFormData.budgetBand, purpose: normalizedFormData.purpose },
    });

    return NextResponse.json(
      {
        ok: true,
        partyId: party.id,
        gateRequestId: eventGateRequestId,
        accessGranted: true,
      },
      { status: 201 }
    );
  } catch {
    recordFunnelEvent({
      funnel: 'share_view_to_gate',
      outcome: 'failed',
      code: 'GATE_SUBMIT_ERROR',
    });
    return NextResponse.json(
      { ok: false, accessGranted: false, error: '열람 자격 처리 중 서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

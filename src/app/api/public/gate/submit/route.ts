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
import { getInboxState, getQuickImRecord, isUuid } from '@/lib/im-lite/quick-generate-store';
import { isBuildingShareLinkRevoked } from '@/lib/security/share-link-tokens';

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
      tenantId: clientTenantId,
      dealId,
      brokerId: clientBrokerId,
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

    // 1. 유효성 검증 (+82 국제번호 정규화 지원)
    const validation = validateG2Form(formData);
    if (!validation.valid) {
      return NextResponse.json(
        { ok: false, accessGranted: false, errors: validation.errors },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizeKoreanMobilePhone(formData.phone);
    const cleanName = String(formData.name || '').trim();

    const supabase = createServiceClient();
    let resolvedBrokerId: string | undefined = undefined;
    let resolvedTenantId: string | undefined = undefined;

    // dealId가 있으면 잠금 상태 및 실재·소유 중개사(broker_id / owner_id)를 서버에서 검증
    if (dealId) {
      const dealKey = String(dealId).trim();
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
            error: '담당 중개인이 열람 링크를 잠근 매물입니다.',
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
          const evBId = String(meta.building_id || ev?.entity_id || '').trim();
          if (evBId !== dealKey) continue;
          if (ev.event_type === 'link_revoked') {
            return NextResponse.json(
              {
                ok: false,
                accessGranted: false,
                error: '담당 중개인이 열람 링크를 잠근 매물입니다.',
              },
              { status: 403 }
            );
          }
          if (ev.event_type === 'link_restored') break;
        }
      } catch {
        // non-blocking
      }

      let dealExists = false;
      if (isUuid(dealKey)) {
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
            dealExists = true;
            if (bldgRow.owner_id) {
              resolvedBrokerId = bldgRow.owner_id;
              resolvedTenantId = bldgRow.owner_id;
            }
          }
        }
      }

      if (!dealExists && quickRec) {
        dealExists = true;
        if (quickRec.ownerId) {
          resolvedBrokerId = quickRec.ownerId;
          resolvedTenantId = quickRec.ownerId;
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
    } else {
      resolvedBrokerId = clientBrokerId;
      resolvedTenantId = clientTenantId;
    }

    const tenantId = resolvedTenantId || resolvedBrokerId || 'default';
    const brokerId = resolvedBrokerId || resolvedTenantId || tenantId;

    // 2. Party 생성 (또는 기존 Party 반환)
    const party = await findOrCreateParty({
      tenantId,
      ownerBrokerId: brokerId,
      name: cleanName,
      phone: normalizedPhone,
      entityType: (ENTITY_TYPE_MAP[formData.entityType] || 'individual') as any,
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

    // 6. Track event — intent.detail_request
    await supabase.from('track_event').insert({
      tenant_id: tenantId,
      deal_id: dealId,
      kind: 'intent.detail_request',
      viewer_id: viewerId || null,
      share_token: shareToken || null,
      party_id: party.id,
      payload: { formSource: 'gate_g2' },
    });

    // 7. Record gate_request_created in activity_events so submissions appear in /broker/w/inbox
    try {
      await supabase.from('activity_events').insert({
        actor_id: party.id && isUuid(party.id) ? party.id : null,
        actor_role: 'anonymous',
        event_type: 'gate_request_created',
        entity_type: 'gate_request',
        entity_id: dealId && isUuid(dealId) ? dealId : (party.id && isUuid(party.id) ? party.id : null),
        metadata: {
          building_id: dealId || null,
          broker_id: brokerId || null,
          party_id: party.id,
          requester_name: cleanName,
          requester_phone: normalizedPhone,
          requested_level: 'G2',
          budget_band: BUDGET_BAND_MAP[formData.budgetBand] || formData.budgetBand,
          purpose: formData.purpose,
          financing: formData.financing,
          consent_agreed: true,
          form_source: 'gate_g2',
        },
      });
    } catch {
      // non-blocking
    }

    return NextResponse.json(
      {
        ok: true,
        partyId: party.id,
        accessGranted: true,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { ok: false, accessGranted: false, error: '열람 자격 처리 중 서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

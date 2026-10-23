/**
 * POST /api/public/gate/submit
 * 
 * G2 게이트 제출 → Party 생성 → 조건 축적 → 슬라이더 소급 바인딩
 * §5: 대가로 Basic IM 전문 열람 권한 부여
 */
import { NextRequest, NextResponse } from 'next/server';
import { validateG2Form, ENTITY_TYPE_MAP, BUDGET_BAND_MAP } from '@/domain/identity/gate-schema';
import { findOrCreateParty, bindRecipientToParty } from '@/domain/identity/party-service';
import { insertCondition } from '@/domain/identity/condition-engine';
import { bindViewerHistory } from '@/domain/identity/bind';
import { createServiceClient } from '@/lib/supabase/service';
import { checkRateLimit } from '@/lib/rate-limiter';

export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV !== 'test') {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
      const allowed = await checkRateLimit(ip, 'gate_g2_submit', 15, 60_000);
      if (!allowed) {
        return NextResponse.json({ error: '요청 횟수가 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 });
      }
    }

    const body = await req.json();
    const { formData, tenantId: clientTenantId, dealId, brokerId: clientBrokerId, viewerId, shareToken, recipientId } = body;

    // 1. 유효성 검증
    const validation = validateG2Form(formData);
    if (!validation.valid) {
      return NextResponse.json({ errors: validation.errors }, { status: 400 });
    }

    const supabase = createServiceClient();
    let resolvedBrokerId = clientBrokerId;
    let resolvedTenantId = clientTenantId;

    // dealId가 있으면 서버 측에서 실제 소유 중개사(broker_id)를 조회하여 위조 방지
    if (dealId) {
      const { data: dealRow } = await supabase
        .from('deals')
        .select('broker_id')
        .eq('id', dealId)
        .maybeSingle();
      if (dealRow?.broker_id) {
        resolvedBrokerId = dealRow.broker_id;
        resolvedTenantId = dealRow.broker_id;
      }
    }

    const tenantId = resolvedTenantId || resolvedBrokerId || 'default';
    const brokerId = resolvedBrokerId || resolvedTenantId;

    // 2. Party 생성 (또는 기존 Party 반환)
    const party = await findOrCreateParty({
      tenantId,
      ownerBrokerId: brokerId,
      name: formData.name,
      phone: formData.phone,
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

    return NextResponse.json({
      ok: true,
      partyId: party.id,
      // Basic IM 열람 권한 부여 — 클라이언트가 이 응답으로 IM 전문을 렌더링
      accessGranted: true,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

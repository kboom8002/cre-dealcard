/**
 * POST /api/public/track
 * 
 * Fire-and-forget 이벤트 수집 API.
 * 50ms 이내 응답 목표. 실패해도 열람을 막지 않습니다.
 * §9-6: 토큰을 로그·에러 리포트에 남기지 않습니다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, dealId, kind, viewerId, shareToken, grantToken, partyId, ...payload } = body;

    if (!tenantId || !dealId || !kind) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Fire-and-forget: 큐 삽입만 하고 즉시 응답
    supabase.from('track_event').insert({
      tenant_id: tenantId,
      deal_id: dealId,
      kind,
      viewer_id: viewerId || null,
      share_token: shareToken || null,
      grant_token: grantToken || null,
      party_id: partyId || null,
      payload,
    }).then(({ error }) => {
      if (error) {
        // §9-6: 토큰을 로그에 남기지 않음
        console.error('[track] Insert error:', error.message);
      }
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 }); // 추적 실패를 노출하지 않음
  }
}

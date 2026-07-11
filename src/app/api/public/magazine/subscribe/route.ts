/**
 * POST /api/public/magazine/subscribe
 * 매거진 공개 구독 엔드포인트 (인증 불필요)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(req: NextRequest) {
  try {
    const { broker_id, phone, name, email, channel, source } = await req.json();
    
    if (!broker_id || (!phone && !email)) {
      return NextResponse.json({ error: 'broker_id and phone/email required' }, { status: 400 });
    }

    const supabase = createServiceClient();
    
    // upsert subscriber details
    const { error } = await supabase.from('magazine_subscribers').upsert({
      broker_id,
      subscriber_phone: phone ?? null,
      subscriber_email: email ?? null,
      subscriber_name: name ?? null,
      channel: channel || 'kakao',
      source: source || 'magazine',
      status: 'active',
      subscribed_at: new Date().toISOString(),
    }, { onConflict: 'broker_id,subscriber_phone' });

    if (error) {
      console.error('[Magazine Subscribe Error]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 구독 이벤트 기록
    await supabase.from('activity_events').insert({
      event_type: 'magazine_subscribe',
      entity_type: 'magazine_subscribers',
      metadata: { broker_id, channel, source },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[POST /api/public/magazine/subscribe]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

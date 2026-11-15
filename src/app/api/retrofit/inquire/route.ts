import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { z } from 'zod/v4';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getClientIp } from '@/lib/magazine/public-guard';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('retrofit-inquire-route');
const MAX_BODY_BYTES = 8 * 1024;

const Schema = z.object({
  building_id: z.string().uuid(),
  broker_id: z.string().uuid().optional(),
  space_id: z.string().uuid().optional(),
  product_slug: z.string().min(1).max(120),
  trigger_source: z.enum(['owner_report_cta', 'direct']).default('owner_report_cta'),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req) ?? 'unknown';
    const allowed = await checkRateLimit(ip, 'public_retrofit_inquire', 10, 10 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429 }
      );
    }

    const declaredLen = Number(req.headers.get('content-length'));
    if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, error: '요청 내용이 너무 큽니다.' },
        { status: 413 }
      );
    }

    const rawText = await req.text();
    if (Buffer.byteLength(rawText, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, error: '요청 내용이 너무 큽니다.' },
        { status: 413 }
      );
    }

    let body: unknown;
    try {
      body = rawText ? JSON.parse(rawText) : {};
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 제품 조회
    const { data: product, error: prodErr } = await supabase
      .from('retrofit_products')
      .select('id, name, install_fee_krw')
      .eq('slug', parsed.data.product_slug)
      .maybeSingle();

    if (prodErr || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // 문의 생성 + 인센티브 계산
    const LEAD_INCENTIVE_KRW = 50000;
    const { data: inquiry, error: inqErr } = await supabase
      .from('retrofit_inquiries')
      .insert({
        ...parsed.data,
        product_id: product.id,
        status: 'lead',
        broker_incentive_krw: parsed.data.broker_id ? LEAD_INCENTIVE_KRW : 0,
      })
      .select('id')
      .single();

    if (inqErr || !inquiry?.id) {
      log.warn('[retrofit/inquire] Inquiry insert failed', {
        code: inqErr?.code || 'UNKNOWN',
      });
      return NextResponse.json(
        { ok: false, error: '문의 접수 처리 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    // 이벤트 기록 (비블로킹 보조 경로)
    try {
      await supabase.from('activity_events').insert({
        event_type: 'retrofit_inquiry_created',
        entity_type: 'retrofit_inquiry',
        entity_id: inquiry.id,
        actor_role: 'broker',
        source_app: 'js-building-ssot-mvp',
        metadata: { product: parsed.data.product_slug, trigger: parsed.data.trigger_source },
      });
    } catch {
      // non-blocking
    }

    return NextResponse.json({ ok: true, inquiry_id: inquiry.id });
  } catch (err) {
    log.error('[retrofit/inquire] Unexpected error', {
      message: err instanceof Error ? err.message.slice(0, 120) : 'unknown',
    });
    return NextResponse.json(
      { ok: false, error: '문의 처리 중 서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

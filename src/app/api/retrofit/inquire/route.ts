import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

const Schema = z.object({
  building_id:    z.string().uuid(),
  broker_id:      z.string().uuid().optional(),
  space_id:       z.string().uuid().optional(),
  product_slug:   z.string(),
  trigger_source: z.enum(['owner_report_cta', 'direct']).default('owner_report_cta'),
})

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const supabase = createServiceClient()

  // 제품 조회
  const { data: product } = await supabase
    .from('retrofit_products')
    .select('id, name, install_fee_krw')
    .eq('slug', parsed.data.product_slug)
    .single()

  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  // 문의 생성 + 인센티브 계산
  const LEAD_INCENTIVE_KRW = 50000
  const { data: inquiry } = await supabase.from('retrofit_inquiries').insert({
    ...parsed.data,
    product_id: product.id,
    status: 'lead',
    broker_incentive_krw: parsed.data.broker_id ? LEAD_INCENTIVE_KRW : 0,
  }).select('id').single()

  // 이벤트 기록 (기존 analytics 연동)
  await supabase.from('activity_events').insert({
    event_type: 'retrofit_inquiry_created',
    entity_type: 'retrofit_inquiry',
    entity_id: inquiry?.id,
    actor_role: 'broker',
    source_app: 'js-building-ssot-mvp',
    metadata: { product: parsed.data.product_slug, trigger: parsed.data.trigger_source },
  })

  return NextResponse.json({ ok: true, inquiry_id: inquiry?.id })
}

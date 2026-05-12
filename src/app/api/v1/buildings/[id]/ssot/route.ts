import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// API Key 인증 + 과금 이벤트 기록
export async function GET(req: NextRequest, { params }: { params: Promise<{id:string}> }) {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // API 키 검증 + 요금제 조회
  const { data: client } = await supabase
    .from('api_clients')
    .select('id, plan, allowed_fields')
    .eq('api_key', apiKey)
    .single()

  if (!client) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })

  const { id } = await params
  const { data: building } = await supabase
    .from('building_ssot_lite')
    .select(client.allowed_fields.join(','))  // 요금제별 필드 제한
    .eq('id', id)
    .single()

  if (!building) return NextResponse.json({ error: 'Building not found' }, { status: 404 })

  // 과금 이벤트
  await supabase.from('api_usage_events').insert({
    client_id: client.id,
    endpoint: `/v1/buildings/${id}/ssot`,
    billed_amount_krw: client.plan === 'enterprise' ? 5000 : 2000,
  })

  return NextResponse.json({ data: building })
}

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

const IotPayloadSchema = z.object({
  device_id: z.string(),
  building_id: z.string().uuid(),
  metrics: z.array(z.object({
    metric_type: z.enum(['footfall', 'energy_kwh', 'occupancy']),
    value: z.number(),
    floor: z.string().optional(),
    recorded_at: z.string().datetime(),
  }))
})

export async function POST(req: NextRequest) {
  // API Key 인증 (IoT 디바이스 전용)
  const apiKey = req.headers.get('x-iot-api-key')
  if (process.env.IOT_INGEST_API_KEY && apiKey !== process.env.IOT_INGEST_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = IotPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { device_id, building_id, metrics } = parsed.data

  // 1. 원시 스트림 저장
  await supabase.from('iot_data_stream').insert(
    metrics.map(m => ({ building_id, device_id, ...m }))
  )

  // 2. building_ssot_lite 집계값 업데이트
  await syncIotAggregates(supabase, building_id)

  return NextResponse.json({ ok: true, ingested: metrics.length })
}

async function syncIotAggregates(supabase: any, buildingId: string) {
  // 최근 7일 집계
  const since = new Date(Date.now() - 7 * 86400000).toISOString()

  const { data } = await supabase
    .from('iot_data_stream')
    .select('metric_type, value, floor')
    .eq('building_id', buildingId)
    .gte('recorded_at', since)

  if (!data?.length) return

  const footfalls = data.filter((d: any) => d.metric_type === 'footfall')
  const energies  = data.filter((d: any) => d.metric_type === 'energy_kwh')
  const occupancies = data.filter((d: any) => d.metric_type === 'occupancy')

  const daily_footfall = footfalls.length
    ? Math.round(footfalls.reduce((s: number, d: any) => s + d.value, 0) / 7)
    : null

  const monthly_energy_kwh = energies.length
    ? energies.reduce((s: number, d: any) => s + d.value, 0)
    : null
    
  let iot_floor_occupancy: Record<string, number> | null = null
  if (occupancies.length > 0) {
    iot_floor_occupancy = {}
    // Get latest occupancy per floor
    occupancies.forEach((occ: any) => {
      if (occ.floor && iot_floor_occupancy) {
        iot_floor_occupancy[occ.floor] = occ.value
      }
    })
  }

  await supabase.from('building_ssot_lite').update({
    iot_daily_footfall: daily_footfall,
    iot_monthly_energy_kwh: monthly_energy_kwh,
    iot_floor_occupancy: iot_floor_occupancy,
    iot_last_synced_at: new Date().toISOString(),
  }).eq('id', buildingId)
}

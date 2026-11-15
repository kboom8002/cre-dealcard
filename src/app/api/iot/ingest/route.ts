import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { createModuleLogger } from '@/lib/logger';
import { z } from 'zod/v4';

const log = createModuleLogger('iot-ingest-route');

const IotPayloadSchema = z.object({
  device_id: z.string().min(1).max(128),
  building_id: z.string().uuid(),
  metrics: z
    .array(
      z.object({
        metric_type: z.enum(['footfall', 'energy_kwh', 'occupancy']),
        value: z.number().finite(),
        floor: z.string().max(32).optional(),
        recorded_at: z.string().datetime(),
      }),
    )
    .min(1)
    .max(500),
});

function isValidApiKey(providedKey: string, expectedKey: string): boolean {
  const expectedBuf = Buffer.from(expectedKey, 'utf8');
  const providedBuf = Buffer.from(providedKey, 'utf8');
  if (expectedBuf.byteLength !== providedBuf.byteLength) {
    return false;
  }
  return timingSafeEqual(expectedBuf, providedBuf);
}

export async function POST(req: NextRequest) {
  try {
    // Fail-closed API Key 인증 (IoT 디바이스 전용)
    const expectedKey = process.env.IOT_INGEST_API_KEY?.trim();
    if (!expectedKey) {
      return NextResponse.json(
        { error: 'IoT 수집 키가 설정되지 않았습니다.' },
        { status: 503 },
      );
    }

    const providedKey = req.headers.get('x-iot-api-key')?.trim() ?? '';
    if (!providedKey || !isValidApiKey(providedKey, expectedKey)) {
      return NextResponse.json({ error: '인증에 실패했습니다.' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: '요청 형식이 올바르지 않습니다.' },
        { status: 400 },
      );
    }

    const parsed = IotPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: '유효하지 않은 측정 데이터 형식입니다.' },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();
    const { device_id, building_id, metrics } = parsed.data;

    // 1. 원시 스트림 저장
    const { error: insertError } = await supabase.from('iot_data_stream').insert(
      metrics.map((m) => ({ building_id, device_id, ...m })),
    );

    if (insertError) {
      log.error('[iot-ingest] insert failed:', insertError.message);
      return NextResponse.json(
        { error: '요청 처리에 실패했습니다.' },
        { status: 500 },
      );
    }

    // 2. building_ssot_lite 집계값 업데이트
    await syncIotAggregates(supabase, building_id);

    return NextResponse.json({ ok: true, ingested: metrics.length });
  } catch (err) {
    log.error(
      '[iot-ingest] Error:',
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: '요청 처리에 실패했습니다.' },
      { status: 500 },
    );
  }
}

async function syncIotAggregates(
  supabase: ReturnType<typeof createServiceClient>,
  buildingId: string,
) {
  // 최근 7일 집계
  const since = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data } = await supabase
    .from('iot_data_stream')
    .select('metric_type, value, floor')
    .eq('building_id', buildingId)
    .gte('recorded_at', since);

  if (!data?.length) return;

  type MetricRow = { metric_type: string; value: number; floor?: string | null };
  const rows = data as MetricRow[];
  const footfalls = rows.filter((d) => d.metric_type === 'footfall');
  const energies = rows.filter((d) => d.metric_type === 'energy_kwh');
  const occupancies = rows.filter((d) => d.metric_type === 'occupancy');

  const daily_footfall = footfalls.length
    ? Math.round(footfalls.reduce((s, d) => s + d.value, 0) / 7)
    : null;

  const monthly_energy_kwh = energies.length
    ? energies.reduce((s, d) => s + d.value, 0)
    : null;

  let iot_floor_occupancy: Record<string, number> | null = null;
  if (occupancies.length > 0) {
    iot_floor_occupancy = {};
    occupancies.forEach((occ) => {
      if (occ.floor && iot_floor_occupancy) {
        iot_floor_occupancy[occ.floor] = occ.value;
      }
    });
  }

  await supabase
    .from('building_ssot_lite')
    .update({
      iot_daily_footfall: daily_footfall,
      iot_monthly_energy_kwh: monthly_energy_kwh,
      iot_floor_occupancy: iot_floor_occupancy,
      iot_last_synced_at: new Date().toISOString(),
    })
    .eq('id', buildingId);
}

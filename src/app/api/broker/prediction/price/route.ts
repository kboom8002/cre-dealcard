/**
 * POST /api/broker/prediction/price
 * Estimates price range for a building (P-D)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod/v4';
import { estimatePriceRange } from '@/domain/prediction/price-prediction';
import { requireBroker } from '@/lib/auth-guard';

const BodySchema = z.object({
  dealId:       z.string().optional(),
  areaSignal:   z.string().optional().default("강남구"),
  assetType:    z.string().optional().default("중소형빌딩"),
  buildingArea: z.number().positive().optional().default(300),
  builtYear:    z.number().optional(),
});

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const rawBody = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  let result: any = null;
  try {
    result = await estimatePriceRange({
      areaSignal: parsed.data.areaSignal,
      assetType: parsed.data.assetType,
      buildingArea: parsed.data.buildingArea,
      builtYear: parsed.data.builtYear,
    });
  } catch (err) {
    console.error('[PricePrediction] estimatePriceRange failed:', err);
    return NextResponse.json(
      { ok: false, error: '가격 예측에 실패했습니다.' },
      { status: 500 }
    );
  }

  const minPrice = result?.lower80 ?? result?.min ?? result?.predictedMin ?? null;
  const maxPrice = result?.upper80 ?? result?.max ?? result?.predictedMax ?? null;

  return NextResponse.json({
    ok: true,
    priceRange: result || { min: minPrice, max: maxPrice },
    predictedMin: minPrice,
    predictedMax: maxPrice,
  });
}

/**
 * POST /api/broker/prediction/molit-etl (admin)
 * Triggers MOLIT data fetch for the specified number of months
 */

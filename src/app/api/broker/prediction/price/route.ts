/**
 * POST /api/broker/prediction/price
 * Estimates price range for a building (P-D)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod/v4';
import { estimatePriceRange } from '@/domain/prediction/price-prediction';

const BodySchema = z.object({
  areaSignal:   z.string(),
  assetType:    z.string(),
  buildingArea: z.number().positive(),
  builtYear:    z.number().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const authHeader = req.headers.get('authorization') ?? '';
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const result = await estimatePriceRange(parsed.data);
  if (!result) return NextResponse.json({ error: '추정 실패' }, { status: 500 });

  return NextResponse.json({ ok: true, priceRange: result });
}

/**
 * POST /api/broker/prediction/molit-etl (admin)
 * Triggers MOLIT data fetch for the specified number of months
 */

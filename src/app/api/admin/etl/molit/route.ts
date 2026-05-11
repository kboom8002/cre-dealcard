/**
 * POST /api/admin/etl/molit
 * Triggers MOLIT 국토부 실거래가 ETL (admin only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod/v4';
import { runMolitETL } from '@/domain/prediction/price-prediction';

const BodySchema = z.object({
  months: z.number().min(1).max(36).default(12),
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

  // Verify admin role
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  const months = parsed.success ? parsed.data.months : 12;

  // Run ETL asynchronously (long running)
  runMolitETL(months)
    .then((r) => console.log('[MOLIT ETL]', r))
    .catch((e) => console.error('[MOLIT ETL error]', e));

  return NextResponse.json({ ok: true, message: `MOLIT ETL 시작 (${months}개월)`, note: '백그라운드 실행 중' });
}

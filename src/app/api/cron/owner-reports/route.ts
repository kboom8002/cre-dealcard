import { NextResponse } from 'next/server';
import { generateOwnerReport } from '@/domain/magazine/owner-report-generator';
import { buildAttrsFromSsotLite } from '@/lib/ssot-adapter';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET(request: Request) {
  // Verify Vercel cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  
  // Get all active buildings with owners
  const { data: buildings } = await supabase
    .from('building_ssot_lite')
    .select('*')
    .not('broker_id', 'is', null)
    .limit(50);

  let generated = 0;
  const errors: string[] = [];

  for (const building of (buildings || [])) {
    try {
      const attrs = buildAttrsFromSsotLite(building);
      await generateOwnerReport(
        building.id,
        String(attrs.ownerName || 'Owner'),
        attrs
      );
      generated++;
    } catch (err) {
      errors.push(`${building.id}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return NextResponse.json({
    ok: true,
    generated,
    errors: errors.slice(0, 5),
    timestamp: new Date().toISOString(),
  });
}

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { promptCache } from '@/lib/cache/semantic-prompt-cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {};
  
  // DB 연결 확인
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('building_ssot_lite').select('id').limit(1);
    checks.database = error ? 'error' : 'ok';
    if (error) console.error('[health] DB check failed:', error);
  } catch (err) {
    console.error('[health] DB client failed:', err);
    checks.database = 'error';
  }

  // 캐시 상태
  checks.cache = 'ok'; // LRU cache is in-memory, always available
  const cacheMetrics = promptCache.getMetrics();

  const allOk = Object.values(checks).every(v => v === 'ok');

  return NextResponse.json(
    { status: allOk ? 'healthy' : 'degraded', checks, cacheMetrics, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 503 }
  );
}

import 'dotenv/config';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const CANONICAL_TABLES = [
  'workspace_items',
  'email_suppressions',
  'im_share_links',
  'magazine_subscribers',
  'broker_clients',
  'magazine_dispatch_logs',
] as const;

async function main() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const baseUrl = (process.env.PROD_SMOKE_BASE_URL || 'https://www.credeal.net').replace(/\/+$/, '');

  const results: CheckResult[] = [];

  if (!supabaseUrl || !serviceKey || supabaseUrl.includes('mock.supabase.co')) {
    console.error('[verify-post-cutover-health] Missing real NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  for (const table of CANONICAL_TABLES) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*`, {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: 'count=exact',
          Range: '0-0',
        },
        signal: AbortSignal.timeout(10_000),
      });
      const contentRange = res.headers.get('content-range') || '';
      const totalMatch = /\/(\d+)$/.exec(contentRange);
      const totalCount = totalMatch ? Number(totalMatch[1]) : null;
      const isOk = (res.status === 200 || res.status === 206) && (table !== 'workspace_items' || (totalCount ?? 0) > 0);
      results.push({
        name: `supabase:${table}`,
        ok: isOk,
        detail: `status=${res.status} range=${contentRange || '-'}`,
      });
    } catch (err) {
      results.push({
        name: `supabase:${table}`,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const httpChecks: Array<{
    name: string;
    path: string;
    method?: string;
    body?: string;
    expectedStatuses: number[];
  }> = [
    { name: 'prod:home', path: '/', expectedStatuses: [200] },
    { name: 'prod:funding_pruned', path: '/funding', expectedStatuses: [404] },
    { name: 'prod:circles_pruned', path: '/broker/circles', expectedStatuses: [404] },
    { name: 'prod:campaign_api_deprecated', path: '/api/broker/campaign', method: 'POST', body: '{}', expectedStatuses: [401, 410] },
    {
      name: 'prod:reverse_onboarding_uuid',
      path: '/api/public/reverse-onboarding',
      method: 'POST',
      body: JSON.stringify({ buildingId: 'not-a-uuid', name: '테스트', phone: '01012345678', budget: '100억' }),
      expectedStatuses: [400],
    },
  ];

  for (const check of httpChecks) {
    try {
      const res = await fetch(`${baseUrl}${check.path}`, {
        method: check.method || 'GET',
        headers: check.body ? { 'Content-Type': 'application/json' } : undefined,
        body: check.body,
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      results.push({
        name: check.name,
        ok: check.expectedStatuses.includes(res.status),
        detail: `status=${res.status} expected=[${check.expectedStatuses.join(',')}]`,
      });
    } catch (err) {
      results.push({
        name: check.name,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} | ${r.name} | ${r.detail}`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`[verify-post-cutover-health] ${failed.length} check(s) failed`);
    process.exit(1);
  }
  console.log(`[verify-post-cutover-health] ALL ${results.length} CHECKS PASSED`);
}

main().catch((err) => {
  console.error('[verify-post-cutover-health] Fatal:', err);
  process.exit(1);
});

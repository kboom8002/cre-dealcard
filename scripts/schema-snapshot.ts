/**
 * scripts/schema-snapshot.ts — 운영 스키마 스냅샷 생성 (F-01, 읽기 전용)
 *
 * PostgREST OpenAPI(`GET {SUPABASE_URL}/rest/v1/`, service role)에서 테이블→컬럼, rpc 목록을 읽어
 * `supabase/schema-snapshot.json` 에 저장한다. 스키마 메타데이터만 담으며 행 데이터·PII 는 없다.
 * 쓰기·DDL 호출은 하지 않는다.
 *
 * 실행:  npx tsx scripts/schema-snapshot.ts      (Node 24 는 `node scripts/schema-snapshot.ts` 도 가능)
 * 필요:  .env.local 의 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 마이그레이션 적용 후에는 이 스크립트를 다시 실행해 스냅샷을 갱신하고, `--applied 20261004000001,20261004000002`
 * 처럼 적용 완료된 마이그레이션 prefix 를 기록해 드리프트 체커의 "미적용 마이그레이션 오버레이"에서 제외시킨다.
 */
import fs from 'node:fs';
import path from 'node:path';

interface Snapshot {
  $comment: string;
  generatedAt: string;
  source: string;
  appliedMigrations: string[];
  tables: Record<string, { columns: Record<string, string>; required?: string[] }>;
  rpcs: Record<string, string[]>;
}

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'supabase', 'schema-snapshot.json');

function loadEnvLocal(): Record<string, string> {
  const p = path.join(ROOT, '.env.local');
  const out: Record<string, string> = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

async function main() {
  const env = { ...loadEnvLocal(), ...process.env } as Record<string, string | undefined>;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다(.env.local).');
    process.exit(2);
  }
  const appliedArg = process.argv.indexOf('--applied');
  let applied: string[] = [];
  if (appliedArg > -1 && process.argv[appliedArg + 1]) {
    applied = process.argv[appliedArg + 1].split(',').map((s) => s.trim()).filter(Boolean);
  } else if (fs.existsSync(OUT)) {
    // 기존 값 보존
    try { applied = (JSON.parse(fs.readFileSync(OUT, 'utf8')) as Snapshot).appliedMigrations ?? []; } catch { applied = []; }
  }

  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
  });
  if (!res.ok) {
    console.error('ERROR: OpenAPI 조회 실패 HTTP', res.status, (await res.text()).slice(0, 200));
    process.exit(2);
  }
  const spec = (await res.json()) as {
    definitions?: Record<string, { properties?: Record<string, { type?: string; format?: string }>; required?: string[] }>;
    paths?: Record<string, { post?: { parameters?: Array<{ schema?: { properties?: Record<string, unknown> } }> } }>;
  };

  const tables: Snapshot['tables'] = {};
  for (const name of Object.keys(spec.definitions ?? {}).sort()) {
    const def = spec.definitions![name];
    const columns: Record<string, string> = {};
    for (const col of Object.keys(def.properties ?? {}).sort()) {
      const p = def.properties![col];
      columns[col] = p.format ?? p.type ?? 'unknown';
    }
    tables[name] = { columns, ...(def.required?.length ? { required: [...def.required].sort() } : {}) };
  }
  const rpcs: Snapshot['rpcs'] = {};
  for (const p of Object.keys(spec.paths ?? {}).sort()) {
    if (!p.startsWith('/rpc/')) continue;
    const params = (spec.paths![p].post?.parameters ?? []).flatMap((x) => (x.schema?.properties ? Object.keys(x.schema.properties) : []));
    rpcs[p.slice(5)] = [...new Set(params)].sort();
  }

  const snap: Snapshot = {
    $comment: '운영 PostgREST OpenAPI 스키마 스냅샷(F-01). 스키마 메타데이터만 포함(PII 없음). scripts/schema-snapshot.ts 로 재생성.',
    generatedAt: new Date().toISOString(),
    source: 'PostgREST OpenAPI /rest/v1/ (service role, read-only)',
    appliedMigrations: applied,
    tables,
    rpcs,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(snap, null, 1) + '\n', 'utf8');
  console.log(`schema snapshot → ${path.relative(ROOT, OUT)}  tables=${Object.keys(tables).length} rpcs=${Object.keys(rpcs).length}`);
}

main().catch((e) => {
  console.error('ERROR:', e instanceof Error ? e.message : String(e));
  process.exit(2);
});

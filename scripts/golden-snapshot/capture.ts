/**
 * @file scripts/golden-snapshot/capture.ts
 * @description 골든 E2E 가 생성한 최신 문서를 DB 에서 **읽기 전용**으로 읽어 오프라인 재렌더용 스냅샷으로 저장.
 *
 *   npx tsx scripts/golden-snapshot/capture.ts <name|all|core> [--live-enrich] [--no-download]
 *
 *  - name : GOLDENS 의 이름 (예: operating-hotel-r2) / all = 15개 전부 / core = 7대 골든
 *  - doc id : e2e/screenshots/<name>/doc-id.txt (없으면 건너뜀)
 *  - 저장 : e2e/golden-snapshots/<name>.json (+ 큰 이미지는 e2e/golden-snapshots/<name>/ 파일로 외부화)
 *  - --live-enrich : enrichForBasicIm 을 1회 실 호출해 liveEnrichment 로 저장 (공시지가 추이/POI/지적도).
 *                    ※ 이 모드만 외부 API 를 호출한다. 기본은 DB 읽기뿐.
 *  - --pool-only   : 기존 스냅샷은 그대로 두고 랜드마크 풀(poi-pool.json)만 live 로 재캡처 (DB 접근 없음)
 *  - --no-pool     : 풀 캡처 생략. 기본은 스냅샷 캡처 후 resolveLandmarkPool 을 live 로 1회 호출해
 *                    e2e/golden-snapshots/<name>/poi-pool.json 저장 (W2 랜드마크 oracle 용; 이 모드도 외부 API 호출)
 *  - 보안 : 인증/토큰/키 필드 제거, 소유자 식별자(owner_id/broker_id) 제거, 중개인 연락처 마스킹.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { GOLDENS, CORE_GOLDEN_NAMES, ROOT, SNAP_DIR, assetDir, snapshotPath, loadSnapshot, poiPoolPath, landmarkPoolArgs, type GoldenSnapshot } from './lib';

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const f = path.join(ROOT, '.env.local');
  if (!fs.existsSync(f)) return env;
  for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([^#=\s][^=]*)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

const SENSITIVE_KEY = /(token|secret|password|passwd|api[_-]?key|authorization|cookie|service[_-]?role|access[_-]?key|jwt)/i;
const OWNER_KEYS = new Set(['owner_id', 'broker_id', 'source_id', 'created_by', 'user_id']);
const SECRET_VALUE = /(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.|sb_secret_|sk-[A-Za-z0-9]{20,}|KakaoAK\s+\w{8,})/;
const IMG_DATA = /^(data:)?image\/(png|jpe?g|webp|gif);base64,/i;
const IMG_URL = /^https?:\/\/.+\.(png|jpe?g|webp)(\?.*)?$|^https?:\/\/[^/]*supabase\.co\/storage\/v1\/object\//i;
const EXTERNALIZE_MIN = 20_000;

interface Ctx {
  name: string;
  download: boolean;
  seq: number;
  assetBytes: number;
  warnings: string[];
  removedKeys: Set<string>;
  urlCache: Map<string, string>;
}

async function sanitizeAndExternalize(v: any, ctx: Ctx, keyPath = ''): Promise<any> {
  if (typeof v === 'string') {
    if (SECRET_VALUE.test(v)) { ctx.warnings.push(`secret-like value removed at ${keyPath}`); return '[REDACTED]'; }
    if (IMG_DATA.test(v) && v.length > EXTERNALIZE_MIN) {
      const m = v.match(/^(?:data:)?image\/(\w+);base64,([\s\S]*)$/)!;
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      const buf = Buffer.from(m[2], 'base64');
      const rel = `${ctx.name}/asset-${String(++ctx.seq).padStart(2, '0')}.${ext}`;
      fs.mkdirSync(assetDir(ctx.name), { recursive: true });
      fs.writeFileSync(path.join(SNAP_DIR, rel), buf);
      ctx.assetBytes += buf.length;
      return `$asset-data:${rel}`;
    }
    if (ctx.download && IMG_URL.test(v)) {
      const cached = ctx.urlCache.get(v);
      if (cached) return cached;
      try {
        const r = await fetch(v, { signal: AbortSignal.timeout(15000) });
        if (r.ok) {
          const src = Buffer.from(await r.arrayBuffer());
          // 스냅샷 용량 상한(<3MB) 유지: 렌더러가 어차피 재최적화하므로 1000px/JPEG q60 으로 축소
          const sharp = (await import('sharp')).default;
          const buf = await sharp(src).rotate().resize({ width: 1000, withoutEnlargement: true }).jpeg({ quality: 60 }).toBuffer();
          const rel = `${ctx.name}/asset-${String(++ctx.seq).padStart(2, '0')}.jpg`;
          fs.mkdirSync(assetDir(ctx.name), { recursive: true });
          fs.writeFileSync(path.join(SNAP_DIR, rel), buf);
          ctx.assetBytes += buf.length;
          const ref = `$asset-path:${rel}`;
          ctx.urlCache.set(v, ref);
          return ref;
        }
        ctx.warnings.push(`image download ${r.status}: ${v.slice(0, 80)}`);
      } catch (e) {
        ctx.warnings.push(`image download failed: ${v.slice(0, 80)}`);
      }
    }
    return v;
  }
  if (Array.isArray(v)) {
    const out: any[] = [];
    for (let i = 0; i < v.length; i++) out.push(await sanitizeAndExternalize(v[i], ctx, `${keyPath}[${i}]`));
    return out;
  }
  if (v && typeof v === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(v)) {
      if (SENSITIVE_KEY.test(k) || OWNER_KEYS.has(k)) { ctx.removedKeys.add(k); continue; }
      out[k] = await sanitizeAndExternalize(v[k], ctx, keyPath ? `${keyPath}.${k}` : k);
    }
    return out;
  }
  return v;
}

function readTxt(p: string): string | null {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').trim() : null;
}

async function captureOne(name: string, sb: any, opts: { liveEnrich: boolean; download: boolean }): Promise<void> {
  const def = GOLDENS.find(g => g.name === name)!;
  const shotDir = path.join(ROOT, 'e2e', 'screenshots', name);
  const docId = readTxt(path.join(shotDir, 'doc-id.txt'));
  if (!docId) { console.log(`⏭  ${name}: e2e/screenshots/${name}/doc-id.txt 없음 — 건너뜀`); return; }

  const { data: doc, error } = await sb.from('document_objects').select('*').eq('id', docId).maybeSingle();
  if (error || !doc?.body) { console.log(`❌ ${name}: doc ${docId} 읽기 실패 ${error?.message ?? '(없음)'}`); return; }
  const buildingId: string = doc.building_id ?? readTxt(path.join(shotDir, 'building-id.txt')) ?? '';

  const { data: buildingRow } = await sb.from('building_ssot_lite').select('*').eq('id', buildingId).maybeSingle();
  // 라우트(/api/public/im-lite/[buildingId]/pptx)와 동일한 파생 필드
  const b = doc.body ?? {};
  const building = buildingRow ? {
    ...buildingRow,
    address: b.ssot_summary?.address || buildingRow.raw_address,
    pnu: b.ssot_summary?.pnu || b.pnu,
    lat: b.coordinates?.lat || b.ssot_summary?.coordinates?.lat,
    lng: b.coordinates?.lng || b.ssot_summary?.coordinates?.lng,
    investment_posture: b.ssot_summary?.investment_posture || b.investmentPosture || 'income',
  } : null;

  // 중개인 연락처 (마스킹)
  let broker: Record<string, any> | null = null;
  try {
    const { fetchBrokerContact, toPptxBrokerInput } = await import('../../src/domain/broker/broker-contact');
    const ownerId = doc.broker_id ?? doc.owner_id ?? buildingRow?.owner_id;
    const raw = toPptxBrokerInput(await fetchBrokerContact(sb, ownerId)) as Record<string, any> | null;
    if (raw) {
      broker = { ...raw };
      if (broker.phone) broker.phone = '010-0000-0000';
      if (broker.email) broker.email = 'broker@example.test';
    }
  } catch (e: any) {
    console.log(`  ⚠️ broker 조회 실패(무시): ${e?.message}`);
  }

  const ctx: Ctx = { name, download: opts.download, seq: 0, assetBytes: 0, warnings: [], removedKeys: new Set(), urlCache: new Map() };
  fs.rmSync(assetDir(name), { recursive: true, force: true });

  let liveEnrichment: Record<string, any> | null = null;
  if (opts.liveEnrich) {
    const coords = b.coordinates ?? b.ssot_summary?.coordinates ?? (building?.lat && building?.lng ? { lat: Number(building.lat), lng: Number(building.lng) } : undefined);
    if (coords?.lat && coords?.lng) {
      delete process.env.OFFLINE_RENDER;
      const { enrichForBasicIm } = await import('../../src/domain/building/mobile-im/pptx/basic-im-enrichment');
      liveEnrichment = await enrichForBasicIm(coords, {
        pnu: b.ssot_summary?.pnu ?? b.pnu ?? building?.pnu,
        pnus: b.ssot_summary?.pnus ?? b.pnus,
        address: b.ssot_summary?.address ?? building?.address,
        landAreaSqm: Number(b.ssot_summary?.land_area_sqm ?? building?.land_area_sqm ?? 0),
      }) as unknown as Record<string, any>;
    }
  }

  const snapshot: GoldenSnapshot = {
    schemaVersion: 1,
    name,
    fixtureDir: def.fixtureDir,
    capturedAt: new Date().toISOString(),
    docId,
    buildingId,
    doc: await sanitizeAndExternalize({
      id: doc.id, title: doc.title, document_type: doc.document_type, created_at: doc.created_at, body: doc.body,
    }, ctx, 'doc'),
    building: building ? await sanitizeAndExternalize(building, ctx, 'building') : null,
    broker,
    liveEnrichment: liveEnrichment ? await sanitizeAndExternalize(liveEnrichment, ctx, 'liveEnrichment') : null,
    urlTier: 'basic',
  };

  fs.mkdirSync(SNAP_DIR, { recursive: true });
  const json = JSON.stringify(snapshot, null, 1);
  fs.writeFileSync(snapshotPath(name), json, 'utf8');
  const total = Buffer.byteLength(json) + ctx.assetBytes;
  const flag = total > 3 * 1024 * 1024 ? ' ⚠️ >3MB' : '';
  console.log(`✅ ${name}: doc ${docId.slice(0, 8)} json ${(Buffer.byteLength(json) / 1024).toFixed(0)}KB + assets ${(ctx.assetBytes / 1024).toFixed(0)}KB = ${(total / 1024).toFixed(0)}KB${flag}` +
    `${ctx.removedKeys.size ? ` | 제거 키: ${[...ctx.removedKeys].join(',')}` : ''}${liveEnrichment ? ' | live-enrich' : ''}`);
  for (const w of ctx.warnings) console.log(`   ⚠️ ${w}`);
}

/**
 * 랜드마크 풀 live 1회 캡처 (resolveLandmarkPool, 캐시 미사용) → e2e/golden-snapshots/<name>/poi-pool.json
 * - 좌표/포스처/자산유형은 스냅샷 값 (렌더러가 resolveLandmarkPool 에 넘기는 것과 동일)
 * - 키/토큰은 출력하지 않음. 실패 시 로그만 남기고 기존 poi-pool.json 은 유지.
 * - income-yangpyeong-r3 는 live 실패 시 docs/golden-test-data/p5-yangpyeong-income/poi-pool.json 재사용.
 */
async function capturePool(name: string): Promise<void> {
  const snap = loadSnapshot(name);
  const { coords, posture, assetType } = landmarkPoolArgs(snap);
  if (!coords) { console.log(`  ⚠️ pool ${name}: 좌표 없음 — 건너뜀`); return; }
  const t0 = Date.now();
  try {
    delete process.env.OFFLINE_RENDER;
    delete process.env.LANDMARK_POOL_OFFLINE;
    delete process.env.LANDMARK_POOL_FIXTURE;
    const { resolveLandmarkPool } = await import('../../src/lib/external/landmark-pool');
    const pool = await resolveLandmarkPool(coords, { posture, assetType, useCache: false });
    if (!pool?.candidates?.length) throw new Error('풀 비어있음/null');
    fs.mkdirSync(assetDir(name), { recursive: true });
    fs.writeFileSync(poiPoolPath(name), JSON.stringify(pool), 'utf8');
    const d = pool.diagnostics;
    console.log(`  🗺  pool ${name}: 후보 ${pool.candidates.length}, 건물 ${pool.buildings.length}, 쿼리 ${d.queries} 실패 ${d.failedQueries.length}, vworld ${d.vworld.ok ? 'ok' : 'FAIL'} (${Date.now() - t0}ms) posture=${posture} asset=${assetType} extras=[${pool.extras}]`);
  } catch (e: any) {
    console.log(`  ⚠️ pool ${name}: live 캡처 실패 — ${String(e?.message ?? e).replace(/key=[^&\s]+/gi, 'key=***')}`);
    const p5 = path.join(ROOT, 'docs', 'golden-test-data', 'p5-yangpyeong-income', 'poi-pool.json');
    if (name === 'income-yangpyeong-r3' && !fs.existsSync(poiPoolPath(name)) && fs.existsSync(p5)) {
      fs.mkdirSync(assetDir(name), { recursive: true });
      fs.copyFileSync(p5, poiPoolPath(name));
      console.log('  ↪ p5 docs poi-pool.json 재사용');
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.find(a => !a.startsWith('--')) ?? 'core';
  const liveEnrich = args.includes('--live-enrich');
  const download = !args.includes('--no-download');
  const poolOnly = args.includes('--pool-only');
  const withPool = !args.includes('--no-pool');
  const names = target === 'all' ? GOLDENS.map(g => g.name) : target === 'core' ? CORE_GOLDEN_NAMES : [target];
  for (const n of names) if (!GOLDENS.some(g => g.name === n)) throw new Error(`unknown golden: ${n}`);

  const env = loadEnv();
  // 외부 API 키를 쓰는 live-enrich / 풀 캡처를 위해 .env.local 을 process.env 로 주입 (값은 출력/저장하지 않음)
  for (const [k, v] of Object.entries(env)) if (!(k in process.env)) process.env[k] = v;

  if (poolOnly) {
    for (const n of names) {
      if (!fs.existsSync(snapshotPath(n))) { console.log(`⏭  ${n}: 스냅샷 없음`); continue; }
      await capturePool(n);
    }
    return;
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  for (const n of names) {
    try {
      // 재캡처 시 assetDir 가 삭제되므로 기존 poi-pool.json 은 보존
      const prevPool = fs.existsSync(poiPoolPath(n)) ? fs.readFileSync(poiPoolPath(n), 'utf8') : null;
      await captureOne(n, sb, { liveEnrich, download });
      if (prevPool && fs.existsSync(snapshotPath(n))) { fs.mkdirSync(assetDir(n), { recursive: true }); fs.writeFileSync(poiPoolPath(n), prevPool, 'utf8'); }
      if (withPool && fs.existsSync(snapshotPath(n))) await capturePool(n);
    }
    catch (e: any) { console.log(`❌ ${n}: ${e?.message ?? e}`); }
  }
}

main().catch(e => { console.error(e); process.exit(1); });

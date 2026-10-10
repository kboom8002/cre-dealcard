/**
 * @file scripts/golden-snapshot/lib.ts
 * @description 골든 스냅샷 공용 모듈 — 캡처(capture.ts) / 오프라인 재렌더(rerender.ts) / 사실 오라클 테스트가 공유.
 *
 * 오프라인 보장 (서버·Playwright·LLM·실 API 불필요):
 *  1. OFFLINE_RENDER=1 → enrichForBasicIm 이 외부 호출 없이 스냅샷의 enrichment 만 반환 (basic-im-enrichment.ts 훅)
 *  2. globalThis.fetch 를 가드로 교체 — 모든 네트워크 호출 차단 + 기록. (Kakao Static Map 만 중립 회색 PNG 로 대체:
 *     POI 선별/라벨 로직이 프로덕션과 동일하게 돌도록. 이미지 내용은 텍스트 검증에 영향 없음)
 */
import fs from 'fs';
import path from 'path';

export const ROOT = path.resolve(__dirname, '..', '..');
export const SNAP_DIR = path.join(ROOT, 'e2e', 'golden-snapshots');
export const OUT_DIR = path.join(SNAP_DIR, 'out');

export interface GoldenDef {
  name: string;
  /** docs/ 하위 픽스처 디렉터리 (repo 상대) */
  fixtureDir: string;
  /** 오라클(expected_facts.json) 위치 */
  oracleDir?: string;
  /** 'income-ig': git 미추적 데이터(docs/income-golden-data) 기반 — 'core' 범위에서 제외, 파일 없으면 오라클 skip */
  group?: 'income-ig';
}

export const GOLDENS: GoldenDef[] = [
  { name: 'development-jamwon-r3', fixtureDir: 'docs/golden-test-data/p4-jamwon-dev/r3-verified', oracleDir: 'docs/golden-test-data/p4-jamwon-dev' },
  { name: 'development-sutaek-r2', fixtureDir: 'docs/golden-test-data/p7-sutaek-dev/r2-standard', oracleDir: 'docs/golden-test-data/p7-sutaek-dev' },
  { name: 'income-dangsan-r3', fixtureDir: 'docs/golden-test-data/p1-dangsan-income/r3-verified', oracleDir: 'docs/golden-test-data/p1-dangsan-income' },
  { name: 'income-yangpyeong-r3', fixtureDir: 'docs/golden-test-data/p5-yangpyeong-income/r3-verified', oracleDir: 'docs/golden-test-data/p5-yangpyeong-income' },
  { name: 'operating-hotel-r2', fixtureDir: 'docs/golden-test-data/p6-hotel-operating/r2-standard', oracleDir: 'docs/golden-test-data/p6-hotel-operating' },
  { name: 'owner-seocho-r3', fixtureDir: 'docs/golden-test-data/p3-seocho-owner/r3-verified', oracleDir: 'docs/golden-test-data/p3-seocho-owner' },
  { name: 'trading-sinsa-r3', fixtureDir: 'docs/golden-test-data/p2-sinsa-trading/r3-verified', oracleDir: 'docs/golden-test-data/p2-sinsa-trading' },
  // e2e/income-golden-*.auth.spec.ts (docs/income-golden-data, git 미추적) — expected_facts.json 은 각 변형 폴더에 둔다
  ...([
    ['ig1', 'ig1-dangsan5ga-11-47'], ['ig2', 'ig2-ssangnim-114'], ['ig3', 'ig3-changsin-464-6'], ['ig4', 'ig4-yangpyeong4ga-117'],
  ] as const).flatMap(([id, dir]) => (['as-is', 'corrected'] as const).map((v): GoldenDef => ({
    name: `income-${id}-${v}`,
    fixtureDir: `docs/income-golden-data/${dir}/${v}`,
    oracleDir: `docs/income-golden-data/${dir}/${v}`,
    group: 'income-ig',
  }))),
];

/** 7대 골든 (git 추적 데이터) — rerender/capture 'core' 범위 */
export const CORE_GOLDEN_NAMES = GOLDENS.filter(g => g.oracleDir && !g.group).map(g => g.name);
/** income ig 8변형 */
export const INCOME_IG_NAMES = GOLDENS.filter(g => g.group === 'income-ig').map(g => g.name);
/** 사실 오라클 대상 전체 (expected_facts.json·스냅샷이 없으면 테스트에서 skip) */
export const ORACLE_GOLDEN_NAMES = GOLDENS.filter(g => g.oracleDir).map(g => g.name);

/** docs/golden-test-data/<fixture>/expected_facts.json (없으면 null) */
export function loadExpectedFacts(name: string): any | null {
  const def = GOLDENS.find(g => g.name === name);
  if (!def?.oracleDir) return null;
  const f = path.join(ROOT, def.oracleDir, 'expected_facts.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')) : null;
}

export function snapshotPath(name: string): string {
  return path.join(SNAP_DIR, `${name}.json`);
}
export function hasSnapshot(name: string): boolean {
  return fs.existsSync(snapshotPath(name));
}

export interface GoldenSnapshot {
  schemaVersion: 1;
  name: string;
  fixtureDir: string;
  capturedAt: string;
  docId: string;
  buildingId: string;
  /** document_objects 행 (인증/소유자 식별 필드 제거) */
  doc: { id: string; title: string | null; document_type: string; created_at: string; body: Record<string, any> };
  /** building_ssot_lite 행 (owner_id 등 제거) + 라우트와 동일한 파생 필드(address/pnu/lat/lng/investment_posture) */
  building: Record<string, any> | null;
  /** toPptxBrokerInput 결과 — 연락처는 마스킹됨 */
  broker: Record<string, any> | null;
  /** (선택) capture --live-enrich 로 저장한 enrichForBasicIm 실 호출 결과 (공시지가 추이/POI/지적도 등) */
  liveEnrichment: Record<string, any> | null;
  /** 라우트 URL 파라미터: ?tier= (기본 basic) */
  urlTier: 'basic' | 'pro';
}

// ─── 자산(이미지) 외부화 / 복원 ───

const ASSET_DATA = '$asset-data:';
const ASSET_PATH = '$asset-path:';

export function assetDir(name: string): string {
  return path.join(SNAP_DIR, name);
}

/** 스냅샷 JSON 을 읽고 $asset-* 참조를 실제 데이터(data URI / 절대경로)로 복원 */
export function loadSnapshot(name: string): GoldenSnapshot {
  const raw = JSON.parse(fs.readFileSync(snapshotPath(name), 'utf8')) as GoldenSnapshot;
  const hydrate = (v: any): any => {
    if (typeof v === 'string') {
      if (v.startsWith(ASSET_DATA)) {
        const rel = v.slice(ASSET_DATA.length);
        const buf = fs.readFileSync(path.join(SNAP_DIR, rel));
        const ext = path.extname(rel).slice(1).toLowerCase();
        const mime = ext === 'jpg' ? 'jpeg' : ext;
        return `data:image/${mime};base64,${buf.toString('base64')}`;
      }
      if (v.startsWith(ASSET_PATH)) return path.join(SNAP_DIR, v.slice(ASSET_PATH.length));
      return v;
    }
    if (Array.isArray(v)) return v.map(hydrate);
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) v[k] = hydrate(v[k]);
    }
    return v;
  };
  raw.doc.body = hydrate(raw.doc.body);
  raw.building = hydrate(raw.building);
  if (raw.liveEnrichment) raw.liveEnrichment = hydrate(raw.liveEnrichment);
  return raw;
}

// ─── 라우트(/api/public/im-lite/[buildingId]/pptx) 입력 재현 ───

export interface RenderInputBundle {
  input: Record<string, any>;
}

/**
 * src/app/api/public/im-lite/[buildingId]/pptx/route.ts 의 renderer.render() 입력 구성을 그대로 재현.
 * (라우트 로직이 바뀌면 이 함수도 맞춰야 함 — README-oracle.md 참조)
 */
export async function buildRenderInput(snap: GoldenSnapshot): Promise<Record<string, any>> {
  const body: Record<string, any> = snap.doc.body ?? {};
  const building = snap.building;
  const posture = body.investment_posture
    ?? body.investmentPosture
    ?? body.posture
    ?? body.identity?.investmentPosture
    ?? body.identity?.investment_posture
    ?? body.ssot_summary?.investment_posture
    ?? building?.investment_posture
    ?? 'income';

  let grade = body.dataGrade ?? body.dataCompleteness?.qualityGrade ?? body.qualityGrade ?? body.grade;
  if (!grade) {
    try {
      const { computeDataQualityBadge, tierToGrade } = await import('../../src/domain/building/mobile-im/data-quality-badge');
      const { resolveEnrichment } = await import('../../src/domain/building/im-core/resolve-enrichment');
      const enriched = resolveEnrichment(body);
      const ssot = body.ssot_summary ?? {};
      const badge = computeDataQualityBadge({
        hasAddress: !!(ssot.address || ssot.raw_address || enriched.meta.address),
        hasPublicData: !!(enriched.buildingRegister || ssot.building_register_source === 'api'),
        hasMonthlyRent: !!(ssot.monthly_rent_total_krw || body.financial?.monthlyRentKrw),
        hasVacancy: ssot.vacancy_pct != null || !!ssot.vacancy_signal,
        hasPhotos: !!(body.photos_v2?.length || body.photos?.length),
        hasAskingPrice: !!(ssot.asking_price_manwon || ssot.price_band),
        hasFloorLeases: !!(body.floor_leases?.length || body.rentRoll?.length),
        hasTotalGrossArea: !!(ssot.total_gross_area_sqm || ssot.size_signal),
        hasLandArea: !!(ssot.land_area_sqm),
      }, posture as any);
      grade = tierToGrade(badge.tier);
    } catch {
      grade = 'B';
    }
  }

  const docTier = body.tier || snap.urlTier;
  const isBasicIM = docTier === 'basic';
  const visualPreset = body.preset || (isBasicIM ? 'credeal_basic' : 'credeal_signature');
  const resolvedPreset = isBasicIM ? 'credeal_basic' : visualPreset;

  return {
    buildingId: snap.buildingId,
    preset: resolvedPreset,
    posture,
    grade,
    incomeArchetype: body.incomeArchetype ?? undefined,
    hasViolation: body.hasViolation ?? body.violationStatus === 'exists',
    hasJointCollateral: body.hasJointCollateral ?? false,
    releaseTier: isBasicIM ? 'fact_om' : (body.releaseTier || 'decision_im'),
    docno: body.docno ?? `IM-${snap.buildingId.substring(0, 6).toUpperCase()}`,
    doc: {
      title: snap.doc.title || body.buildingName || 'Mobile IM',
      body,
      sections: body.sections,
    },
    building: building || undefined,
    broker: snap.broker || undefined,
    // 라우트 기본값(워터마크 on). 날짜는 결정성을 위해 캡처일 고정.
    watermark: { requesterName: 'CREDEAL', phoneLast4: '0000', timestamp: snap.capturedAt.slice(0, 10) },
    provenance: body.provenance ?? {},
  };
}

// ─── 랜드마크 풀(W2 oracle) 픽스처 ───

/** capture 가 live 로 1회 저장하는 랜드마크 후보 풀 (렌더러 landmarkPoolFixture 로 주입) */
export function poiPoolPath(name: string): string {
  return path.join(assetDir(name), 'poi-pool.json');
}

/** 렌더러(pptx-renderer / basic-im-enrichment)가 resolveLandmarkPool 에 넘기는 것과 동일한 좌표/포스처/자산유형 */
export function landmarkPoolArgs(snap: GoldenSnapshot): { coords: { lat: number; lng: number } | null; posture: string; assetType: string | null } {
  const body: Record<string, any> = snap.doc.body ?? {};
  const c = body.coordinates ?? body.ssot_summary?.coordinates ?? (snap.building?.lat && snap.building?.lng ? { lat: snap.building.lat, lng: snap.building.lng } : null);
  const posture = String(body.investment_posture ?? body.investmentPosture ?? body.posture ?? body.identity?.investmentPosture
    ?? body.identity?.investment_posture ?? body.ssot_summary?.investment_posture ?? snap.building?.investment_posture ?? 'income');
  const assetType = snap.building?.asset_type ?? body.ssot_summary?.asset_type ?? null;
  return { coords: c?.lat && c?.lng ? { lat: Number(c.lat), lng: Number(c.lng) } : null, posture, assetType };
}

export function loadPoiPool(name: string): Record<string, any> | null {
  const f = poiPoolPath(name);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

// ─── 오프라인 가드 ───

export interface NetworkLog {
  stubbedKakaoStaticMap: number;
  blocked: string[];
}

let _guard: { log: NetworkLog; restore: () => void } | null = null;

/** 재렌더 중 모든 fetch 를 차단/기록. 반환된 log 는 렌더 후 점검용 */
export async function installOfflineGuard(): Promise<NetworkLog> {
  if (_guard) return _guard.log;
  process.env.OFFLINE_RENDER = '1';
  // 실 키가 환경에 있더라도 오프라인 렌더에서는 절대 사용하지 않음 (더미 값 — Kakao 분기 활성화 용도)
  process.env.KAKAO_REST_API_KEY = 'offline-dummy-key';
  const log: NetworkLog = { stubbedKakaoStaticMap: 0, blocked: [] };
  const original = globalThis.fetch;
  let grayPng: Buffer | null = null;
  const sharp = (await import('sharp')).default;
  grayPng = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 226, g: 228, b: 232 } } }).png().toBuffer();
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === 'string' ? input : (input?.url ?? String(input));
    if (/^https:\/\/dapi\.kakao\.com\/v2\/maps\/staticmap/.test(url)) {
      log.stubbedKakaoStaticMap++;
      return new Response(new Uint8Array(grayPng!), { status: 200, headers: { 'content-type': 'image/png' } });
    }
    log.blocked.push(url.slice(0, 160));
    throw new TypeError(`OFFLINE_RENDER: network blocked (${url.slice(0, 80)})`);
  }) as typeof fetch;
  _guard = { log, restore: () => { globalThis.fetch = original; } };
  return log;
}

export function resetOfflineGuardLog(): void {
  if (_guard) { _guard.log.blocked.length = 0; _guard.log.stubbedKakaoStaticMap = 0; }
}

// ─── PPTX 텍스트 추출 (scratch/dump-pptx-text.cjs 로직) ───

export function extractSlideTexts(buf: Buffer): string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AdmZip = require('adm-zip');
  const z = new AdmZip(buf);
  const slides = (z.getEntries() as any[])
    .filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => parseInt(a.entryName.match(/(\d+)/)[1], 10) - parseInt(b.entryName.match(/(\d+)/)[1], 10));
  return slides.map(e => e.getData().toString('utf8')
    .replace(/<\/a:p>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ').trim());
}

/** 모바일 뷰어에 노출되는 텍스트: heroCard 문자열 값 + 섹션 제목/마크다운 */
export function extractViewerSections(body: Record<string, any>): Array<{ section_type: string; title: string; markdown: string }> {
  const secs = Array.isArray(body?.sections) ? body.sections : [];
  return secs.map((s: any) => ({
    section_type: String(s.section_type ?? s.type ?? ''),
    title: String(s.title ?? ''),
    markdown: String(s.markdown ?? s.content ?? ''),
  }));
}

export function viewerTextOf(body: Record<string, any>): string {
  const parts: string[] = [];
  const hero = body?.heroCard;
  if (hero && typeof hero === 'object') {
    for (const v of Object.values(hero)) if (typeof v === 'string' || typeof v === 'number') parts.push(String(v));
  }
  for (const k of ['heroTitle', 'heroSubtitle', 'keyInvestmentPoint']) if (typeof body?.[k] === 'string') parts.push(body[k]);
  for (const s of extractViewerSections(body)) parts.push(s.title, s.markdown);
  return parts.join('\n');
}

// ─── 오프라인 재렌더 ───

export interface RerenderResult {
  name: string;
  pptxPath: string;
  slideCount: number;
  slides: string[];
  viewerSections: ReturnType<typeof extractViewerSections>;
  viewerText: string;
  pptxText: string;
  ms: number;
  warnings: string[];
  network: NetworkLog;
}

export async function rerenderSnapshot(name: string, opts: { writeFiles?: boolean } = {}): Promise<RerenderResult> {
  const t0 = Date.now();
  const net = await installOfflineGuard();
  resetOfflineGuardLog();
  const snap = loadSnapshot(name);

  const { setOfflineEnrichment } = await import('../../src/domain/building/mobile-im/pptx/basic-im-enrichment');
  setOfflineEnrichment(snap.liveEnrichment ?? null);

  const { MobileImPptxRenderer } = await import('../../src/domain/building/mobile-im/pptx/pptx-renderer');
  const input = await buildRenderInput(snap);
  // W2: capture 가 저장한 랜드마크 풀이 있으면 주입 (resolveLandmarkPool 은 fixture 우선 → 네트워크/캐시 미사용). 없으면 풀 없음(레거시 후보 폴백)
  const pool = loadPoiPool(name);
  if (pool) input.landmarkPoolFixture = pool;
  const out = await new MobileImPptxRenderer().render(input as any);

  const slides = extractSlideTexts(out.buffer);
  const viewerSections = extractViewerSections(snap.doc.body);
  const res: RerenderResult = {
    name,
    pptxPath: path.join(OUT_DIR, `${name}.pptx`),
    slideCount: out.slideCount,
    slides,
    viewerSections,
    viewerText: viewerTextOf(snap.doc.body),
    pptxText: slides.join('\n'),
    ms: Date.now() - t0,
    warnings: out.warnings ?? [],
    network: { stubbedKakaoStaticMap: net.stubbedKakaoStaticMap, blocked: [...net.blocked] },
  };
  if (opts.writeFiles !== false) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(res.pptxPath, out.buffer);
    fs.writeFileSync(path.join(OUT_DIR, `${name}.slides.json`), JSON.stringify({
      name, slideCount: out.slideCount, ms: res.ms, warnings: res.warnings, network: res.network,
      slides, viewer: { sections: viewerSections },
    }, null, 1), 'utf8');
  }
  return res;
}

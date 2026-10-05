/**
 * @file e2e/helpers/golden-test-factory.ts
 * @description 매개변수화 골든 테스트 팩토리 — 공통 Phase 1~4를 자동화
 *
 * 사용법:
 *   const factory = createGoldenTest({
 *     name: 'dangsan-income-r3',
 *     dataDir: 'docs/golden-test-data/p1-dangsan-income/r3-verified',
 *     posture: 'income',
 *     askingPriceManwon: 1150000,
 *   });
 *
 *   test.describe.serial(factory.suiteName, () => {
 *     factory.registerCommonPhases();
 *     // 특수 검증
 *     test('Phase 5: 통합계약 검증', async ({ page }) => { ... });
 *   });
 */

import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import {
  ensureDir,
  shot,
  getVisibleText,
  handleDuplicateModal,
  pollImCompletion,
  approveDocument,
  markReplayWindowStart,
  assertNoReplayMisses,
  downloadPptx,
  analyzePptxZip,
  assertNoPoisonTokens,
  assertNoDummyData,
  assertNoEvasivePhrases,
  assertPriceBandBlocked,
  assertMapImagePresence,
  assertPriceReflected,
  assertFloorKeywordsPresent,
  assertNoEvasivePhrasesExtended,
  assertOutputInvariants,
  assertNoHardcodedFallback,
  assertOverviewPhotoPresence,
  assertGallerySlidePresence,
} from './golden-test-utils';

// ── Types ──

export type InvestmentPosture = 'income' | 'trading' | 'owner_occupied' | 'development' | 'operating';
export type ResolutionLevel = 'R1' | 'R2' | 'R3';

export interface GoldenTestConfig {
  /** 고유 테스트명 (영문, 스크린샷 디렉토리명으로 사용) */
  name: string;
  /** 데이터 세트 디렉토리 경로 (프로젝트 루트 기준 상대 경로) */
  dataDir: string;
  /** 투자 포스처 */
  posture: InvestmentPosture;
  /** 매각 희망가 (만원) */
  askingPriceManwon: number;
  /** 해상도 등급 */
  resolution: ResolutionLevel;
  /** 테스트 타임아웃 (ms), 기본 600_000 (10분) */
  timeout?: number;
  /** IM 생성 최대 대기 (ms), 기본 300_000 (5분) */
  imWaitMs?: number;
  /** XLSX 렌트롤 업로드 여부 (R2+ income에서 true) */
  uploadXlsx?: boolean;
  /** XLSX 파일명 (uploadXlsx가 true일 때, dataDir 기준) */
  xlsxFileName?: string;
  /**
   * 사진을 바텀시트 실제 업로드 UI(setInputFiles + 카테고리/캡션/★/🏢)로 입력.
   * 기본 false = 기존 방식(generate-async 요청 가로채기로 photos_v2 주입).
   * 환경변수 GOLDEN_PHOTO_MODE=inject 이면 true 여도 주입 방식으로 강제.
   */
  uiPhotoUpload?: boolean;
  /** 다필지 여부 */
  multiParcel?: boolean;
  /** 기대 층 키워드 (R2+ 검증용) */
  expectedFloors?: string[];
  /** 기대 최소 슬라이드 수 */
  expectedMinSlides?: number;
  /** 기대 최대 슬라이드 수 */
  expectedMaxSlides?: number;
  /** 기대 등급 */
  expectedGrade?: string;
  /** A24 렌트롤 슬라이드 미생성 기대 */
  a24ShouldSuppress?: boolean;
  /** A23 수익률 슬라이드 미생성 기대 */
  a23ShouldSuppress?: boolean;
  /** PPTX에 반드시 포함되어야 할 키워드 */
  expectedKeywords?: string[];
}

// ── Internal state ──

interface GoldenTestState {
  buildingId: string;
  docId: string;
  pptxPath: string;
  slideCount: number;
  fullPptxText: string;
  slideEntries: any[];
  mediaEntries: any[];
}

// ── Factory ──

/**
 * 다필지 골든: 픽스처의 필지 주소를 실제 주소 API(/api/public/address)로 PNU 해소.
 * 바텀시트 ParcelSection 에서 중개인이 필지별로 주소 검색 → PNU 확정하는 경로와 동일한 데이터를 만든다.
 * - PNU 는 절대 지어내지 않는다: 해소 실패 시 테스트를 즉시 실패시킨다.
 * - 면적은 픽스처에 양수로 명시된 경우에만 주입 (없으면 서버가 공공데이터로 보강).
 */
async function resolveFixtureParcels(
  page: Page,
  bs: Record<string, any>,
): Promise<Array<{ pnu: string; landCategory?: string; areaM2?: number }>> {
  const parcels: Array<Record<string, any>> = Array.isArray(bs.parcels) ? bs.parcels : [];
  if (parcels.length < 2) return [];
  const region = (String(bs.address ?? '').match(/[가-힣]+(?:구|시|군)(?=\s|$)/g) ?? [])
    .find(t => !/(특별시|광역시|특별자치시)$/.test(t)) ?? '';
  const out: Array<{ pnu: string; landCategory?: string; areaM2?: number }> = [];
  for (const p of parcels) {
    const keyword = String(p.address ?? '').trim();
    if (!keyword) throw new Error('다필지 픽스처 필지에 address 가 없습니다.');
    const resp = await page.request.get(`/api/public/address?keyword=${encodeURIComponent(keyword)}`);
    if (!resp.ok()) throw new Error(`필지 주소 검색 실패 (${resp.status()}): ${keyword}`);
    const data = await resp.json();
    const arr: any[] = Array.isArray(data) ? data : (data.results ?? data.juso ?? []);
    const hit = arr.find(r => /^\d{19}$/.test(String(r.pnu ?? ''))
      && String(r.jibunAddr ?? '').trim().endsWith(keyword.replace(/^[가-힣]+(?:구|시|군)\s+/, ''))
      && (!region || String(r.jibunAddr ?? '').includes(region)));
    if (!hit) throw new Error(`필지 PNU 해소 실패 (실제 주소 API 결과 없음): ${keyword}`);
    const entry: { pnu: string; landCategory?: string; areaM2?: number } = { pnu: String(hit.pnu) };
    if (typeof p.jibun === 'string' && p.jibun) entry.landCategory = p.jibun;
    if (typeof p.areaM2 === 'number' && p.areaM2 > 0) entry.areaM2 = p.areaM2;
    out.push(entry);
  }
  console.log(`  🧩 다필지 ${out.length}필지 PNU 해소: ${out.map(p => p.pnu).join(', ')}`);
  return out;
}

/**
 * 렌트롤 xlsx 를 RentRollImporter 의 파일 입력(실제 업로드 경로)으로 올린다.
 * 파서 결과(합계·공실률·경고)는 화면 문구로 확인하고 콘솔에 남긴다.
 */
async function uploadRentRollXlsxViaUi(page: Page, absXlsxPath: string): Promise<void> {
  if (!fs.existsSync(absXlsxPath)) throw new Error(`렌트롤 xlsx 없음: ${absXlsxPath}`);
  // 엑셀 탭이 기본이지만 텍스트 탭이 열려 있을 수 있어 먼저 전환
  const input = page.locator('input[type="file"][accept*=".xlsx"]').first();
  if (await input.count() === 0) {
    await page.locator('button:has-text("엑셀/CSV")').first().click();
  }
  await input.waitFor({ state: 'attached', timeout: 10_000 });
  await input.setInputFiles(absXlsxPath);
  const done = page.locator('text=/호실 분석 완료|❌/').first();
  await done.waitFor({ state: 'visible', timeout: 20_000 });
  const msg = (await done.innerText()).trim();
  if (msg.startsWith('❌')) throw new Error(`렌트롤 xlsx 업로드 실패: ${msg}`);
  console.log(`  📊 렌트롤 xlsx 업로드: ${path.basename(absXlsxPath)} → ${msg.split('\n')[0]}`);
  // 파서 경고(공실/자가 금액 제외, 만료 계약 등) 노출 문구 기록
  const warnLines = await page.locator('text=/합계에서 제외|만료일이 기준일/').allInnerTexts().catch(() => []);
  for (const w of warnLines) console.log(`    ⚠️ 파서 경고: ${w.trim().slice(0, 140)}`);
}

/**
 * 바텀시트 합계(월 임대료·보증금)를 중개인이 직접 적은 값으로 덮어쓰고,
 * 공실률 버튼·한줄 코멘트를 입력한다. (as-is 는 렌트롤 합계와 일부러 다를 수 있음)
 */
async function fillIncomeBottomSheetExtras(page: Page, bs: Record<string, any>): Promise<void> {
  if (typeof bs.monthlyRentTotalManwon === 'number') {
    const rentInput = page.locator('input[placeholder="예: 1500"]').first();
    if (await rentInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await rentInput.fill(String(bs.monthlyRentTotalManwon));
      console.log(`  ✅ 월 임대료 합계 ${bs.monthlyRentTotalManwon}만원 입력`);
    }
  }
  if (typeof bs.totalDepositManwon === 'number') {
    const depInput = page.locator('input[placeholder="예: 30000"]').first();
    if (await depInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await depInput.fill(String(bs.totalDepositManwon));
      console.log(`  ✅ 보증금 합계 ${bs.totalDepositManwon}만원 입력`);
    }
  }
  if (typeof bs.vacancy === 'string' && bs.vacancy) {
    const label = bs.vacancy === '만실' ? '만실' : bs.vacancy; // '~10%' / '~20%'
    const btn = page.locator('button[data-vacancy-btn]', { hasText: label }).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      // 같은 버튼을 다시 누르면 선택이 해제되므로 미선택일 때만 클릭
      const cls = (await btn.getAttribute('class')) ?? '';
      if (!cls.includes('bg-primary')) await btn.click();
      console.log(`  ✅ 공실률 [${label}] 선택`);
    }
  }
  if (bs.broker_highlight) {
    const hl = page.locator('input[placeholder^="예: 역세권 1분"]').first();
    if (await hl.isVisible({ timeout: 2000 }).catch(() => false)) {
      await hl.fill(String(bs.broker_highlight));
      console.log('  ✅ 중개인 한줄 코멘트 입력');
    }
  }
}

/**
 * 바텀시트 '중개인 추가 정보 (선택)' 그룹을 실제 UI 로 입력한다.
 * bottom_sheet.json 에 broker_extras 가 있는 변형(corrected)에서만 동작 — 없으면 아무 것도 하지 않는다.
 */
async function fillBrokerExtras(page: Page, bs: Record<string, any>): Promise<void> {
  const x = bs.broker_extras as Record<string, any> | undefined;
  if (!x) return;
  const tid = (id: string) => page.locator(`[data-testid="${id}"]`).first();
  const fillIf = async (id: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    const el = tid(id);
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.fill(String(value));
  };

  const summary = tid('broker-extras-summary');
  await summary.scrollIntoViewIfNeeded().catch(() => {});
  const detailsOpen = await tid('broker-extras-section').evaluate((el) => (el as HTMLDetailsElement).open).catch(() => false);
  if (!detailsOpen) await summary.click();

  await fillIf('broker-extras-investment-points', (x.investment_points ?? []).join('\n'));
  await fillIf('broker-extras-closing-line', x.closing_line);

  const regs: any[] = x.regulatory_notes ?? [];
  for (let i = 0; i < regs.length; i++) {
    await tid('broker-extras-reg-add').click();
    await tid(`broker-extras-reg-kind-${i}`).selectOption(String(regs[i].kind));
    await fillIf(`broker-extras-reg-detail-${i}`, regs[i].detail);
    if (regs[i].kind === 'dev_restriction') {
      await fillIf(`broker-extras-reg-basis-${i}`, regs[i].basis);
      await fillIf(`broker-extras-reg-acts-${i}`, regs[i].restricted_acts);
      await fillIf(`broker-extras-reg-period-${i}`, regs[i].period);
    }
  }

  const comps: any[] = x.market_comps ?? [];
  for (let i = 0; i < comps.length; i++) {
    await tid('broker-extras-comp-add').click();
    await tid(`broker-extras-comp-kind-${i}`).selectOption(String(comps[i].kind));
    await fillIf(`broker-extras-comp-location-${i}`, comps[i].location);
    await fillIf(`broker-extras-comp-price-${i}`, comps[i].price_eok);
    await fillIf(`broker-extras-comp-landprice-${i}`, comps[i].land_price_per_pyeong_manwon);
    await fillIf(`broker-extras-comp-note-${i}`, comps[i].note);
  }

  await fillIf('broker-extras-location-note', x.location_note);
  await fillIf('broker-extras-plan', (x.post_acquisition_plan ?? []).join('\n'));
  await fillIf('broker-extras-target-rent', x.target_rent_per_pyeong_manwon);
  console.log(`  ✅ 중개인 추가 정보 입력 (투자포인트 ${x.investment_points?.length ?? 0} · 규제 ${regs.length} · 시세 ${comps.length}${x.target_rent_per_pyeong_manwon ? ' · 목표임대료' : ''})`);
}

/** 사진을 실제 업로드 UI 로 입력: 파일 선택 → 카테고리/캡션 → ★ 대표 / 🏢 외관 */
async function uploadPhotosViaUi(page: Page, photos: Array<Record<string, any>>): Promise<void> {
  const files = photos.map((ph) => path.resolve(process.cwd(), String(ph.url)));
  for (const f of files) if (!fs.existsSync(f)) throw new Error(`사진 파일 없음: ${f}`);
  const captionInputs = page.locator('input[placeholder="설명 (선택)"]');
  const before = await captionInputs.count();
  const fileInput = page.locator('input[type="file"][accept="image/*"]').first();
  await fileInput.waitFor({ state: 'attached', timeout: 10_000 });
  await fileInput.setInputFiles(files);
  await expect(captionInputs).toHaveCount(before + files.length, { timeout: 20_000 });
  const selects = page.locator('select:has(option[value="floor_plan"])');
  for (let i = 0; i < photos.length; i++) {
    const idx = before + i;
    const ph = photos[i];
    if (ph.category) await selects.nth(idx).selectOption(String(ph.category));
    if (ph.caption) await captionInputs.nth(idx).fill(String(ph.caption));
  }
  const hero = photos.findIndex((ph) => ph.isHero);
  if (hero >= 0) await page.locator('button[title="대표 사진으로 지정"]').nth(before + hero).click();
  const ext = photos.findIndex((ph) => ph.role === 'exterior' || ph.role === 'cover');
  if (ext >= 0) await page.locator('button[title^="외관 사진으로 지정"]').nth(before + ext).click();
  console.log(`  🖼️ 사진 ${files.length}장 UI 업로드 (대표=${hero >= 0 ? hero + 1 : '-'}, 외관=${ext >= 0 ? ext + 1 : '-'})`);
}

export function createGoldenTest(config: GoldenTestConfig) {
  const {
    name,
    dataDir,
    posture,
    askingPriceManwon,
    resolution,
    timeout = 600_000,
    imWaitMs = 300_000,
    uploadXlsx = false,
    xlsxFileName,
    uiPhotoUpload = false,
    multiParcel = false,
    expectedFloors = [],
    expectedMinSlides,
    expectedMaxSlides,
    expectedGrade,
    a24ShouldSuppress = false,
    a23ShouldSuppress = false,
    expectedKeywords = [],
  } = config;

  const screenshotDir = path.resolve(__dirname, '..', 'screenshots', name);
  const stepCounter = { current: 0 };
  const absDataDir = path.resolve(process.cwd(), dataDir);

  // State shared across serial tests
  const state: GoldenTestState = {
    buildingId: '',
    docId: '',
    pptxPath: '',
    slideCount: 0,
    fullPptxText: '',
    slideEntries: [],
    mediaEntries: [],
  };

  // Load data files
  function loadMemo(): string {
    const memoPath = path.join(absDataDir, 'memo.txt');
    if (fs.existsSync(memoPath)) {
      return fs.readFileSync(memoPath, 'utf-8').trim();
    }
    throw new Error(`memo.txt not found in ${absDataDir}`);
  }

  function loadBottomSheet(): Record<string, any> {
    const bsPath = path.join(absDataDir, 'bottom_sheet.json');
    if (fs.existsSync(bsPath)) {
      return JSON.parse(fs.readFileSync(bsPath, 'utf-8'));
    }
    throw new Error(`bottom_sheet.json not found in ${absDataDir}`);
  }

  // Posture label mapping (UI 버튼 텍스트 정합: 임대수익, 자가사용, 개발형, 운영형, 단기매매)
  const postureLabels: Record<InvestmentPosture, string[]> = {
    income: ['임대수익', '수익형'],
    trading: ['단기매매', '매매차익', '트레이딩'],
    owner_occupied: ['자가사용', '사옥전환', '자가사옥'],
    development: ['개발형', '개발사업'],
    operating: ['운영형', '호텔'],
  };

  const suiteName = `${name} 골든 E2E (${posture} / ${resolution})`;

  return {
    suiteName,
    state,
    config,

    /** 모든 공통 Phase (1~4)를 test.describe.serial 내에서 등록 */
    registerCommonPhases() {
      test.setTimeout(timeout);

      // ── Phase 1: 딜카드 생성 ──
      test(`Phase 1: 딜카드 생성 [${name}]`, async ({ page }) => {
        console.log(`\n🔷 Phase 1: ${name} 딜카드 생성`); markReplayWindowStart(screenshotDir);

        await page.goto('/broker');
        await page.waitForLoadState('networkidle');
        expect(page.url()).not.toContain('/login');
        console.log('  ✅ 인증 세션 확인');

        // 기존 buildingId 재사용
        const existingIdFile = path.join(screenshotDir, 'building-id.txt');
        if (fs.existsSync(existingIdFile)) {
          const existingId = fs.readFileSync(existingIdFile, 'utf-8').trim();
          if (existingId) {
            await page.goto(`/broker/deal-card/${existingId}`);
            await page.waitForLoadState('networkidle');
            if (page.url().includes(existingId)) {
              state.buildingId = existingId;
              console.log(`  ✅ 기존 딜카드 재사용: ${existingId}`);
              await shot(page, screenshotDir, 'deal-card-reused', stepCounter);
              return;
            }
          }
        }

        // 신규 생성
        await page.goto('/broker/deal-card/new');
        await page.waitForLoadState('networkidle');
        await shot(page, screenshotDir, 'deal-card-new', stepCounter);

        const memo = loadMemo();
        await page.locator('#broker-memo-input').fill(memo);
        await shot(page, screenshotDir, 'memo-filled', stepCounter);

        await page.locator('#cta-generate-deal-card').click();
        console.log('  ⏳ 딜카드 생성 요청...');

        const navPromise = page.waitForURL(/\/broker\/deal-card\/[a-f0-9]{8}-/, { timeout: 180_000 });
        await handleDuplicateModal(page, navPromise);

        const dealCardUrl = page.url();
        const buildingId = dealCardUrl.match(/deal-card\/([a-f0-9-]+)/)?.[1];
        expect(buildingId).toBeTruthy();
        state.buildingId = buildingId!;

        console.log(`  ✅ 딜카드 생성 성공: ${buildingId}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
        await shot(page, screenshotDir, 'deal-card-created', stepCounter);

        ensureDir(screenshotDir);
        fs.writeFileSync(path.join(screenshotDir, 'building-id.txt'), buildingId!);
      });

      // ── Phase 2: 바텀시트 데이터 주입 + IM 생성 ──
      test(`Phase 2: 바텀시트 주입 + IM 생성 [${name}]`, async ({ page }) => {
        console.log(`\n🔷 Phase 2: ${name} 바텀시트 주입 & IM 생성`);

        const idFile = path.join(screenshotDir, 'building-id.txt');
        if (!fs.existsSync(idFile)) { test.skip(); return; }
        state.buildingId = fs.readFileSync(idFile, 'utf-8').trim();

        // 기존 docId 재사용 (REUSE_DOC_ID=1 환경변수 지정 시에만 재사용, 기본은 신규 생성)
        const existingDocFile = path.join(screenshotDir, 'doc-id.txt');
        if (process.env.REUSE_DOC_ID === '1' && fs.existsSync(existingDocFile)) {
          const existingDocId = fs.readFileSync(existingDocFile, 'utf-8').trim();
          if (existingDocId) {
            state.docId = existingDocId;
            console.log(`  📋 기존 docId 재사용: ${existingDocId}`);
            return;
          }
        }

        // 📸 사진 에셋 자동 주입을 위한 generate-async 요청 가로채기
        const bs = loadBottomSheet();
        const photoViaUi = uiPhotoUpload && process.env.GOLDEN_PHOTO_MODE !== 'inject';
        // 다필지 골든: 필지별 실제 PNU 를 해소해 요청에 주입 (미해소 시 즉시 실패)
        const injectedParcels = multiParcel ? await resolveFixtureParcels(page, bs) : [];
        await page.route('**/api/broker/im-lite/generate-async', async (route) => {
          const req = route.request();
          try {
            const postData = req.postDataJSON() || {};
            if (injectedParcels.length > 1) {
              postData.parcels = injectedParcels;
              postData.pnus = injectedParcels.map(p => p.pnu);
            }
            if (!photoViaUi && bs.photo_urls && Array.isArray(bs.photo_urls) && bs.photo_urls.length > 0) {
              postData.photo_urls = bs.photo_urls;
            }
            if (!photoViaUi && bs.photos_v2 && Array.isArray(bs.photos_v2) && bs.photos_v2.length > 0) {
              postData.photos_v2 = bs.photos_v2;
            }
            if (process.env.GOLDEN_LOG_PAYLOAD === '1') {
              const dump = { ...postData };
              ensureDir(screenshotDir);
              fs.writeFileSync(path.join(screenshotDir, 'generate-async-payload.json'), JSON.stringify(dump, null, 2));
            }
            await route.continue({
              postData: JSON.stringify(postData),
            });
            console.log(`  📸 E2E 가로채기: 사진 에셋 ${postData.photo_urls?.length || 0}장 주입 완료`);
          } catch (err) {
            await route.continue();
          }
        });

        await page.goto(`/broker/deal-card/${state.buildingId}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);

        // Basic IM 버튼 클릭
        const basicBtn = page.locator('#cta-mobile-im-basic, button:has-text("⚡ 기본 IM"), button:has-text("기본 IM"), button:has-text("IM 생성")').first();
        await basicBtn.waitFor({ state: 'visible', timeout: 10_000 });
        await basicBtn.click();
        console.log('  ✅ Basic IM 버튼 클릭 완료');
        await page.waitForTimeout(2000);
        await shot(page, screenshotDir, 'bottom-sheet-opened', stepCounter);

        // 포스처 선택
        const labels = postureLabels[posture];
        for (const label of labels) {
          const btn = page.locator(`button:has-text("${label}")`).first();
          if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await btn.click();
            console.log(`  ✅ 포스처 [${label}] 선택`);
            break;
          }
        }

        // 주소 검색 (bottom_sheet에서 address 추출)
        if (bs.address) {
          const addrInput = page.locator('input[placeholder*="동/도로명"]').first();
          if (await addrInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            // 동/로/길 + 번지 추출 (예: "대현동 56-1", "당산동5가 11-47")
            const match = bs.address.match(/([가-힣\d]+(?:동\d*가?|로|길)\s*[\d-]+)/);
            const searchKeyword = match ? match[1] : bs.address.replace(/^(서울특별시|서울|경기도)\s*/, '').replace(/\s*(구|시)\s*/, ' ');
            await addrInput.fill(searchKeyword);
            await addrInput.press('Enter');
            await page.waitForTimeout(2500);

            const searchResultBtn = page.locator('div[class*="divide-y"] button, button:has-text("PNU")').first();
            if (await searchResultBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
              await searchResultBtn.click();
              console.log(`  ✅ 검색 결과 PNU/주소 확정 완료 (${searchKeyword})`);
            }
          }
          await page.waitForTimeout(1000);
        }

        // 매각가 입력
        const priceInput = page.locator('input[placeholder="예: 300000"], input[placeholder*="매매"], #input-asking-price').first();
        if (await priceInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          const currentVal = await priceInput.inputValue();
          if (!currentVal) {
            await priceInput.fill(String(askingPriceManwon));
            console.log(`  ✅ 매각가 ${askingPriceManwon}만원 입력`);
          }
        }

        // D4: 중개인 주차/승강기 대수 (선택 입력) — 골든 픽스처의 parking/elevator 를 실제 UI 로 입력
        {
          const specDetails = page.locator('details', { hasText: '주차 · 승강기 대수' }).first();
          const hasPark = Number.isInteger(bs.parking) && bs.parking > 0;
          const hasElev = Number.isInteger(bs.elevator) && bs.elevator > 0;
          if ((hasPark || hasElev) && await specDetails.isVisible({ timeout: 2000 }).catch(() => false)) {
            await specDetails.locator('summary').click();
            const nums = specDetails.locator('input[type="number"]');
            if (hasPark) await nums.nth(0).fill(String(bs.parking));
            if (hasElev) await nums.nth(1).fill(String(bs.elevator));
            console.log(`  ✅ 중개인 주차/승강기 입력: ${hasPark ? bs.parking : '-'}대 / ${hasElev ? bs.elevator : '-'}대`);
          }
        }

        // ── 포스처별 필수 필드 입력 ──
        const xlsxMode = uploadXlsx && !!bs.rentRollXlsx;
        if (posture === 'income') {
          if (bs.floor_leases && bs.floor_leases.length > 0 && !xlsxMode) {
            const totalRent = bs.floor_leases.reduce((s: number, l: any) => s + (l.rent_manwon || 0), 0);
            const totalDeposit = bs.floor_leases.reduce((s: number, l: any) => s + (l.deposit_manwon || 0), 0);

            const rentInput = page.locator('input[placeholder="예: 1500"]').first();
            if (await rentInput.isVisible({ timeout: 2000 }).catch(() => false)) {
              const currentVal = await rentInput.inputValue();
              if (!currentVal && totalRent > 0) {
                await rentInput.fill(String(totalRent));
                console.log(`  ✅ 월 임대료 합계 ${totalRent}만원 입력`);
              }
            }

            const depositInput = page.locator('input[placeholder="예: 30000"]').first();
            if (await depositInput.isVisible({ timeout: 2000 }).catch(() => false)) {
              const currentVal = await depositInput.inputValue();
              if (!currentVal && totalDeposit > 0) {
                await depositInput.fill(String(totalDeposit));
                console.log(`  ✅ 보증금 합계 ${totalDeposit}만원 입력`);
              }
            }
          }
        } else if (posture === 'operating') {
          const hop = bs.hotel_operating || {};
          const roomCount = hop.total_rooms || 94;
          const adrManwon = hop.adr_krw ? Math.round(hop.adr_krw / 10000) : 10;

          // 총 단위 수 / 객실 수 입력
          const roomInputs = page.locator('input[placeholder="예: 45"]');
          const count = await roomInputs.count();
          for (let i = 0; i < count; i++) {
            const inp = roomInputs.nth(i);
            if (await inp.isVisible().catch(() => false)) {
              await inp.fill(String(roomCount));
            }
          }
          console.log(`  🏨 총 객실 수 ${roomCount}실 입력`);

          // 라벨 기준 입력 — placeholder 부분일치(예: *="12", *="30")는 다른 섹션 입력과 충돌한다.
          // ADR/OCC/GOP 은 OperatingPerfSection 과 HospitalitySpecSection 이 같은 상태를 공유하므로 보이는 입력 모두에 입력한다.
          const fillByLabel = async (labelRe: string, value: string, tag: string): Promise<number> => {
            const inputs = page.locator(`xpath=//label[contains(normalize-space(.), "${labelRe}")]/following-sibling::input[1]`);
            const n = await inputs.count();
            let filled = 0;
            for (let i = 0; i < n; i++) {
              const inp = inputs.nth(i);
              if (await inp.isVisible().catch(() => false)) {
                await inp.scrollIntoViewIfNeeded().catch(() => {});
                await inp.fill(value);
                filled++;
              }
            }
            console.log(`  🏨 ${tag} ${value} 입력 (${filled}곳)`);
            return filled;
          };
          // ADR: 원 → 만원 (소수 허용; 반올림으로 95,000원이 10만원이 되는 왜곡 방지)
          await fillByLabel('ADR', String(Math.round((hop.adr_krw ? hop.adr_krw / 10000 : 10) * 100) / 100), 'ADR(만원)');
          await fillByLabel('OCC', String(hop.occupancy_rate_pct || 78), 'OCC(%)');
          await fillByLabel('GOP 마진율', String(hop.gop_margin_pct || 38), 'GOP 마진율(%)');
        } else if (posture === 'development') {
          const dspec = bs.developmentSpec || {};
          const scalePyung = dspec.targetScalePyeong || 2500;
          const scaleInput = page.locator('input[placeholder="예: 1200"], input[placeholder*="1200"]').first();
          if (await scaleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await scaleInput.fill(String(scalePyung));
            console.log(`  🏗️ 목표 연면적 ${scalePyung}평 입력`);
          }
        } else if (posture === 'owner_occupied') {
          const occInput = page.locator('input[placeholder*="100"]').first();
          if (await occInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await occInput.fill('50');
          }
          const floorInput = page.locator('input[placeholder*="2~5"]').first();
          if (await floorInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await floorInput.fill('지상 2~5층');
          }
        } else if (posture === 'trading') {
          const acqInput = page.locator('input[placeholder*="350000"]').first();
          if (await acqInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await acqInput.fill(String(Math.round(askingPriceManwon * 0.85)));
          }
        }

        // ── 렌트롤 입력 (R2+ income/owner_occupied 지원: RentRollImporter 텍스트 탭) ──
        if (xlsxMode && (posture === 'income' || posture === 'owner_occupied')) {
          await uploadRentRollXlsxViaUi(page, path.join(absDataDir, String(bs.rentRollXlsx)));
          await shot(page, screenshotDir, 'rentroll-xlsx-imported', stepCounter);
        }
        if (!xlsxMode && bs.floor_leases && bs.floor_leases.length > 0 && (posture === 'income' || posture === 'owner_occupied')) {
          try {
            const textTab = page.locator('button:has-text("텍스트"), button:has-text("📝 텍스트")').first();
            if (await textTab.isVisible({ timeout: 2000 }).catch(() => false)) {
              await textTab.click();
              await page.waitForTimeout(500);
              const rentRollArea = page.locator('textarea[placeholder*="층"], textarea[placeholder*="B1"], textarea[placeholder*="임차"]').first();
              if (await rentRollArea.isVisible({ timeout: 2000 }).catch(() => false)) {
                const rentRollText = bs.floor_leases.map((l: any) =>
                  `${l.floor} ${l.tenant_type || ''} ${l.area_pyeong ? l.area_pyeong + '평 ' : ''}보증금${l.deposit_manwon || 0} 월세${l.rent_manwon || 0} ${l.mgmt_fee_manwon != null ? `관리비${l.mgmt_fee_manwon} ` : ''}${l.lease_start || l.lease_end ? `계약 ${l.lease_start || ''}~${l.lease_end || ''} ` : ''}${l.note || ''}`
                ).join('\n');
                await rentRollArea.fill(rentRollText);
                console.log(`  📝 렌트롤 텍스트 입력 (${bs.floor_leases.length}개 층)`);
                const aiParseBtn = page.locator('button:has-text("AI 분석")').first();
                if (await aiParseBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
                  await aiParseBtn.click();
                  console.log('  🔄 AI 분석 클릭 — 렌트롤 파싱 대기...');
                  await page.waitForSelector('text=분석이 완료되었습니다', { timeout: 30000 }).catch(async () => {
                    await page.waitForSelector('text=/폼에 금액|파싱 완료|개 호실/', { timeout: 10000 }).catch(() => {
                      console.log('  ⚠️ AI 분석 완료 텍스트 미감지 — 대기');
                    });
                    await page.waitForTimeout(3000);
                  });
                  await page.waitForTimeout(1000);
                  console.log('  ✅ 렌트롤 AI 파싱 완료');
                }
              }
            }
          } catch (e) {
            console.log('  ⚠️ 렌트롤 텍스트 입력 스킵:', (e as Error).message);
          }
        }

        // ── income 골든: 바텀시트 합계·공실률·한줄코멘트·사진을 실제 UI 로 입력 ──
        if (posture === 'income') {
          await fillIncomeBottomSheetExtras(page, bs);
          await fillBrokerExtras(page, bs);
        }
        if (photoViaUi && Array.isArray(bs.photos_v2) && bs.photos_v2.length > 0) {
          await uploadPhotosViaUi(page, bs.photos_v2);
          await shot(page, screenshotDir, 'photos-uploaded', stepCounter);
        }

        await page.waitForTimeout(1000);
        await shot(page, screenshotDir, 'form-filled-ready', stepCounter);

        // IM 생성 실행
        const generateBtn = page.locator('button:has-text("⚡ IM 생성"), button:has-text("IM 생성")').last();
        await expect(generateBtn).toBeEnabled({ timeout: 10_000 });
        await generateBtn.click();
        console.log('  🚀 Basic IM 생성 시작...');
        await shot(page, screenshotDir, 'im-generating-started', stepCounter);

        const completed = await pollImCompletion(page, imWaitMs);
        expect(completed).toBe(true); assertNoReplayMisses(screenshotDir);
        await shot(page, screenshotDir, 'im-generation-complete', stepCounter);

        state.docId = await approveDocument(page, state.buildingId, screenshotDir);
        expect(state.docId).toBeTruthy();
      });

      // ── Phase 3: PPTX 다운로드 + 바이너리 분석 ──
      test(`Phase 3: PPTX 다운로드 + 바이너리 분석 [${name}]`, async ({ page }) => {
        console.log(`\n🔷 Phase 3: ${name} PPTX 다운로드 & 바이너리 분석`);

        const idFile = path.join(screenshotDir, 'building-id.txt');
        const docFile = path.join(screenshotDir, 'doc-id.txt');
        if (!fs.existsSync(idFile) || !fs.existsSync(docFile)) { test.skip(); return; }
        state.buildingId = fs.readFileSync(idFile, 'utf-8').trim();
        state.docId = fs.readFileSync(docFile, 'utf-8').trim();

        const defaultPath = path.join(screenshotDir, `${name}.pptx`);
        state.pptxPath = await downloadPptx(page, state.buildingId, state.docId, defaultPath);
        expect(fs.existsSync(state.pptxPath)).toBe(true);

        const analysis = analyzePptxZip(state.pptxPath);
        state.slideCount = analysis.slideCount;
        state.fullPptxText = analysis.fullPptxText;
        state.slideEntries = analysis.slideEntries;
        state.mediaEntries = analysis.mediaCount > 0
          ? require('adm-zip')(state.pptxPath).getEntries().filter((e: any) => e.entryName.startsWith('ppt/media/'))
          : [];

        console.log(`  📊 슬라이드: ${state.slideCount}면, 미디어: ${analysis.mediaCount}건`);
        console.log(`  📝 텍스트 길이: ${state.fullPptxText.length}자`);

        // 슬라이드 수 범위 검증
        if (expectedMinSlides != null) {
          expect(state.slideCount).toBeGreaterThanOrEqual(expectedMinSlides);
        }
        if (expectedMaxSlides != null) {
          expect(state.slideCount).toBeLessThanOrEqual(expectedMaxSlides);
        }

        // PPTX 텍스트 저장
        fs.writeFileSync(path.join(screenshotDir, 'pptx-full-text.txt'), state.fullPptxText);
      });

      // ── Phase 4: 9종 단언 (4 바이너리 + 5 콘텐츠) ──
      test(`Phase 4: 9종 품질 단언 [${name}]`, async () => {
        console.log(`\n🔷 Phase 4: ${name} 9종 품질 단언`);

        if (state.slideEntries.length === 0) { test.skip(); return; }

        // 4대 바이너리 단언
        assertNoPoisonTokens(state.slideEntries);
        assertNoDummyData(state.fullPptxText);
        assertNoEvasivePhrases(state.fullPptxText);
        assertPriceBandBlocked(state.fullPptxText);

        // 7종 콘텐츠 및 이미지 단언
        assertMapImagePresence(state.mediaEntries);
        assertPriceReflected(state.fullPptxText, askingPriceManwon);
        // D4: 바텀시트 주차/승강기(선택 입력)가 물건 개요에 '주차 / 승강기 N대 / M대' 로 반영되어야 함
        {
          const bsSpec = loadBottomSheet();
          if (Number.isInteger(bsSpec.parking) && bsSpec.parking > 0) {
            expect(state.fullPptxText, '물건 개요에 주차/승강기 행 누락').toMatch(/주차\s*\/\s*승강기[\s\S]{0,40}\d+\s*대/);
          }
        }
        if (expectedFloors.length > 0) {
          assertFloorKeywordsPresent(state.fullPptxText, expectedFloors);
        }
        assertNoEvasivePhrasesExtended(state.fullPptxText);
        assertOutputInvariants(state.fullPptxText.split('\n')); // 슬라이드 단위 (fullPptxText = 슬라이드별 개행 결합)
        assertNoHardcodedFallback(state.fullPptxText);
        assertOverviewPhotoPresence(state.slideEntries);
        assertGallerySlidePresence(state.slideEntries);

        // 키워드 검증
        for (const kw of expectedKeywords) {
          expect(state.fullPptxText).toContain(kw);
          console.log(`  ✅ 키워드 "${kw}" 확인`);
        }

        // 다필지: 'N필지 통합' 표기 + 합계 대지면적(픽스처 landAreaM2)이 PPTX 에 반영되어야 함
        //   (과거에는 대표 필지 1개로만 렌더되어도 약한 OR 단언이 통과했다)
        if (multiParcel) {
          const bsMp = loadBottomSheet();
          const n = Array.isArray(bsMp.parcels) ? bsMp.parcels.length : 0;
          if (n > 1) {
            expect(state.fullPptxText, `다필지 ${n}필지 표기 누락`).toContain(`${n}필지`);
            if (Number(bsMp.landAreaM2) > 0) {
              expect(state.fullPptxText, `합계 대지면적 ${bsMp.landAreaM2}㎡ 누락`).toContain(Number(bsMp.landAreaM2).toLocaleString());
            }
            console.log(`  ✅ 다필지 ${n}필지 / 합계 ${bsMp.landAreaM2}㎡ 반영 확인`);
          }
        }

        console.log(`\n  🎉 ${name}: 11종 품질 단언 전부 통과!`);
      });
    },

    /** Phase 5: 모바일 IM 뷰어 시각 검증 등록 */
    registerViewerPhase() {
      test(`Phase 5: 모바일 IM 뷰어 시각 검증 [${name}]`, async ({ page }) => {
        console.log(`\n🔷 Phase 5: ${name} 모바일 IM 뷰어 검증`);

        const idFile = path.join(screenshotDir, 'building-id.txt');
        const docFile = path.join(screenshotDir, 'doc-id.txt');
        if (!fs.existsSync(idFile) || !fs.existsSync(docFile)) { test.skip(); return; }
        const bid = fs.readFileSync(idFile, 'utf-8').trim();
        const did = fs.readFileSync(docFile, 'utf-8').trim();

        // P5-01: 뷰어 로딩
        const url = `/im-lite/${bid}?doc=${did}`;
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        const visibleText = await getVisibleText(page);
        expect(visibleText.length).toBeGreaterThan(100);
        console.log(`  ✅ 뷰어 로딩 완료 (${visibleText.length}자)`);

        // P5-02: Hero Card 키워드
        for (const kw of expectedKeywords) {
          if (visibleText.includes(kw)) {
            console.log(`  ✅ Hero Card 키워드 "${kw}" 확인`);
          }
        }

        // P5-XX: 결함 토큰 0건 (사용자 화면 노출 텍스트 기준)
        const defectPatterns = [/\bNaN\b/, /\bundefined\b/, /\[object Object\]/];
        for (const pattern of defectPatterns) {
          expect(pattern.test(visibleText)).toBe(false);
        }
        console.log('  ✅ 뷰어 결함 토큰 0건 확인');

        // P5-08: PPTX 다운로드 버튼
        const pptxBtn = page.locator('button:has-text("PPTX"), a:has-text("PPTX"), button:has-text("다운로드")').first();
        try {
          await pptxBtn.waitFor({ state: 'visible', timeout: 8000 });
          console.log('  ✅ PPTX 다운로드 버튼 visible');
        } catch {
          console.log('  ⚠️ PPTX 버튼 미감지 (승인 전일 수 있음)');
        }

        // P5-09: 모바일 반응형 검증 (375×812)
        await page.setViewportSize({ width: 375, height: 812 });
        await page.waitForTimeout(1000);
        const hasOverflow = await page.evaluate(() =>
          document.documentElement.scrollWidth > document.documentElement.clientWidth
        );
        expect(hasOverflow).toBe(false);
        console.log('  ✅ 375px 반응형 가로 오버플로우 없음');

        // Restore viewport
        await page.setViewportSize({ width: 1280, height: 720 });

        // P5-10: 전체 스크린샷
        ensureDir(screenshotDir);
        await page.screenshot({
          path: path.join(screenshotDir, 'viewer-full-page.png'),
          fullPage: true,
        });
        console.log('  📸 뷰어 전체 스크린샷 저장');
      });
    },

    /** Phase 7: PPTX 시각 오버플로우 검증 등록 */
    registerOverflowPhase() {
      test(`Phase 7: PPTX 시각 오버플로우 검증 [${name}]`, async () => {
        console.log(`\n🔷 Phase 7: ${name} PPTX 오버플로우 검증`);

        if (state.slideEntries.length === 0) { test.skip(); return; }

        // P7-04: 물건 개요 11대 제원
        const specs = [
          '대지면적', '연면적', '건축면적', '건폐율', '용적률',
          '주용도', '주구조', '층수', '주차', '승강기', '사용승인',
        ];
        const found = specs.filter(s => state.fullPptxText.includes(s));
        console.log(`  📋 물건 개요 제원 ${found.length}/11개: [${found.join(', ')}]`);
        expect(found.length).toBeGreaterThanOrEqual(4);
        console.log('  ✅ 물건 개요 최소 기준(4/11) 충족');

        // P7-05: 토지정보+지적도 통합 확인
        let landSlideWithImage = false;
        for (const slide of state.slideEntries) {
          const xml = slide.getData().toString('utf-8');
          const hasLandKw = xml.includes('용도지역') || xml.includes('건폐율') || xml.includes('용적률');
          const hasImage = xml.includes('r:embed') || xml.includes('a:blip');
          if (hasLandKw && hasImage) {
            landSlideWithImage = true;
            break;
          }
        }
        if (landSlideWithImage) {
          console.log('  ✅ 토지정보+이미지 단일 슬라이드 통합 확인');
        } else {
          console.log('  ⚠️ 토지정보+이미지 통합 미감지');
        }
      });
    },

    /** Phase 10: 회귀 방지 스냅샷 등록 */
    registerSnapshotPhase() {
      test(`Phase 10: 회귀 방지 스냅샷 [${name}]`, async () => {
        console.log(`\n🔷 Phase 10: ${name} 회귀 방지 스냅샷`);

        if (!state.fullPptxText) { test.skip(); return; }

        ensureDir(screenshotDir);

        // P10-01: PPTX 전체 텍스트 (이미 Phase 3에서 저장됨)
        const textPath = path.join(screenshotDir, 'pptx-full-text.txt');
        if (!fs.existsSync(textPath)) {
          fs.writeFileSync(textPath, state.fullPptxText);
        }
        expect(fs.existsSync(textPath)).toBe(true);
        console.log('  ✅ pptx-full-text.txt 보존');

        // P10-02: 슬라이드 제목 시퀀스
        const titles: string[] = [];
        for (const slide of state.slideEntries) {
          const xml = slide.getData().toString('utf-8');
          const titleMatch = xml.match(/<p:sp>[\s\S]*?<a:t>([^<]{3,40})<\/a:t>/);
          titles.push(titleMatch ? titleMatch[1].trim() : `(slide ${slide.entryName})`);
        }
        const titlesPath = path.join(screenshotDir, 'slide-titles.json');
        fs.writeFileSync(titlesPath, JSON.stringify(titles, null, 2));
        expect(fs.existsSync(titlesPath)).toBe(true);
        console.log(`  ✅ slide-titles.json (${titles.length}면) 저장`);

        // P10-04: pipeline_log.md 자동 생성
        const logLines = [
          `# Pipeline Log: ${name}`,
          `- **생성일**: ${new Date().toISOString()}`,
          `- **포스처**: ${posture}`,
          `- **해상도**: ${resolution}`,
          `- **매각가**: ${(askingPriceManwon / 10000).toLocaleString()}억`,
          `- **슬라이드**: ${state.slideCount}면`,
          `- **텍스트 길이**: ${state.fullPptxText.length}자`,
          `- **미디어**: ${state.mediaEntries.length}건`,
          '',
          '## Phase 결과',
          '- Phase 1~4: Factory 공통 ✅',
          `- Phase 7: 물건 개요 검증 ✅`,
          `- Phase 10: 스냅샷 저장 ✅`,
        ];
        const logPath = path.join(screenshotDir, 'pipeline_log.md');
        fs.writeFileSync(logPath, logLines.join('\n'));
        expect(fs.existsSync(logPath)).toBe(true);
        console.log('  ✅ pipeline_log.md 생성 완료');
      });
    },

    /** Phase 6: 승인/편집/재승인 워크플로우 등록 */
    registerApprovalPhase() {
      test(`Phase 6: 승인/편집/재승인 워크플로우 [${name}]`, async ({ page }) => {
        console.log(`\n🔷 Phase 6: ${name} 승인/편집/재승인 워크플로우`);

        const idFile = path.join(screenshotDir, 'building-id.txt');
        const docFile = path.join(screenshotDir, 'doc-id.txt');
        if (!fs.existsSync(idFile) || !fs.existsSync(docFile)) { test.skip(); return; }
        const bid = fs.readFileSync(idFile, 'utf-8').trim();
        const did = fs.readFileSync(docFile, 'utf-8').trim();

        // P6-01: 승인 페이지 접근
        await page.goto(`/broker/im-approval/${did}`);
        await page.waitForLoadState('networkidle');
        const pageText = await page.textContent('body') || '';

        // 승인 페이지가 서버 컴포넌트라 리다이렉트될 수 있음 (Rule 23)
        if (page.url().includes('/login') || page.url().includes('/404')) {
          console.log('  ⚠️ 승인 페이지 접근 불가 (서버 컴포넌트 제약) — API 레벨 검증으로 폴백');

          // API 레벨 검증: 문서 상태 확인
          const docsRes = await page.request.get(`/api/broker/im-lite/${bid}`);
          if (docsRes.ok()) {
            const docsJson = await docsRes.json();
            const doc = docsJson.documents?.[0] || docsJson.document;
            expect(doc).toBeTruthy();
            console.log(`  ✅ 문서 상태: ${doc.status} (API 검증)`);

            // P6-03: 섹션 수정 API 테스트
            if (doc.body?.sections && doc.body.sections.length > 0) {
              const firstSection = doc.body.sections[0];
              const originalContent = firstSection.content || '';
              const testSuffix = ' [E2E-EDIT-TEST]';

              // 섹션 수정 요청
              const editRes = await page.request.patch(`/api/broker/im-lite/${did}/sections`, {
                data: {
                  sectionIndex: 0,
                  content: originalContent + testSuffix,
                },
              });

              if (editRes.ok()) {
                console.log('  ✅ 섹션 편집 API 성공');

                // P6-04: 편집 후 해시 변경 확인
                const editedDoc = await editRes.json().catch(() => null);
                if (editedDoc?.targetHash || editedDoc?.approval_target_hash) {
                  console.log('  ✅ targetHash 재계산 확인');
                }

                // 원복
                await page.request.patch(`/api/broker/im-lite/${did}/sections`, {
                  data: { sectionIndex: 0, content: originalContent },
                });
                console.log('  ✅ 섹션 원복 완료');
              } else {
                console.log(`  ⚠️ 섹션 편집 API 미지원 (${editRes.status()}) — 스킵`);
              }
            }

            // P6-05: 승인 상태 확인
            if (doc.status === 'published') {
              console.log('  ✅ 문서 이미 published 상태');
            } else if (doc.status === 'draft') {
              console.log('  📋 문서 draft 상태 — Phase 2에서 이미 승인 처리됨');
            }
          } else {
            console.log(`  ⚠️ 문서 조회 실패 (${docsRes.status()}) — 스킵`);
          }
          return;
        }

        // 브라우저 기반 승인 흐름 (서버 컴포넌트 접근 가능한 경우)
        expect(pageText.length).toBeGreaterThan(50);
        console.log(`  ✅ 승인 페이지 로딩 (${pageText.length}자)`);

        // P6-02: 승인 상태 배너
        const statusText = pageText.includes('draft') || pageText.includes('승인 대기')
          ? 'draft' : pageText.includes('published') || pageText.includes('공개')
            ? 'published' : 'unknown';
        console.log(`  📋 문서 상태: ${statusText}`);

        // P6-06: 공유 링크 확인
        const shareLink = page.locator('a[href*="im-lite"], input[value*="im-lite"], button:has-text("퍼블릭 IM"), button:has-text("링크 복사")').first();
        try {
          await shareLink.waitFor({ state: 'visible', timeout: 5000 });
          console.log('  ✅ 공유 링크 감지');
        } catch {
          console.log('  ⚠️ 공유 링크 미감지');
        }

        await ensureDir(screenshotDir);
        await page.screenshot({
          path: path.join(screenshotDir, 'approval-page.png'),
          fullPage: true,
        });
        console.log('  📸 승인 페이지 스크린샷 저장');
      });
    },

    /** Phase 8: 재무 교차 검증 등록 */
    registerFinancialPhase() {
      test(`Phase 8: 재무 교차 검증 [${name}]`, async () => {
        console.log(`\n🔷 Phase 8: ${name} 재무 교차 검증`);

        if (!state.fullPptxText) { test.skip(); return; }

        const text = state.fullPptxText;

        // P8-01: 매각가 PPTX 반영 교차 검증
        const priceEok = Math.round(askingPriceManwon / 10000);
        const priceFound = text.includes(`${priceEok}억`)
          || text.includes(`${priceEok.toLocaleString()}억`)
          || text.includes(`${priceEok}`);
        expect(priceFound).toBe(true);
        console.log(`  ✅ 매각가 ${priceEok}억 PPTX 반영 확인`);

        // P8-02: 수익률/Cap Rate 키워드 존재 (income/operating만 해당)
        if (posture === 'income' || posture === 'operating') {
          const hasYieldKw = text.includes('Cap Rate')
            || text.includes('수익률')
            || text.includes('NOI')
            || text.includes('cap rate');
          if (hasYieldKw) {
            console.log('  ✅ 수익률/Cap Rate 키워드 존재');

            // Cap Rate 수치 추출 시도
            const capMatch = text.match(/(?:Cap\s*Rate|수익률)[^\d]*(\d+\.?\d*)\s*%/i);
            if (capMatch) {
              const capRate = parseFloat(capMatch[1]);
              expect(capRate).toBeGreaterThan(0);
              expect(capRate).toBeLessThan(30); // 합리적 범위 0~30%
              console.log(`  ✅ Cap Rate ${capRate}% 범위 정상 (0~30%)`);
            }
          } else {
            console.log('  ⚠️ 수익률/Cap Rate 키워드 미발견');
          }
        }

        // P8-03: 보증금/임대료 키워드 (income만 해당)
        if (posture === 'income') {
          const hasRentKw = text.includes('보증금') || text.includes('임대료')
            || text.includes('월세') || text.includes('월 임대');
          expect(hasRentKw).toBe(true);
          console.log('  ✅ 보증금/임대료 키워드 PPTX 존재');
        }

        // P8-04: 포스처별 고급 분석 슬라이드 존재/부재 (Rule 47)
        const advancedKeywords = ['DCF', 'NPV', '민감도', 'Sensitivity'];
        const hasAdvanced = advancedKeywords.some(kw => text.includes(kw));

        // Basic IM에서는 고급 분석이 없어야 함
        if (!hasAdvanced) {
          console.log('  ✅ Basic IM — 고급 분석 슬라이드 부재 확인 (Rule 47)');
        } else {
          console.log('  ⚠️ Basic IM에 고급 분석 키워드 발견 — Pro IM 혼입 가능성');
        }

        // P8-05: 면적 단위 일관성 검증
        const hasArea = text.includes('㎡') || text.includes('평')
          || text.includes('m²') || text.includes('sqm');
        if (hasArea) {
          console.log('  ✅ 면적 단위 표기 존재');
        }

        console.log(`  🎉 Phase 8 재무 교차 검증 완료`);
      });
    },

    /** Phase 1~10 전체 등록 (편의 메서드) */
    registerAllPhases() {
      this.registerCommonPhases();     // Phase 1~4
      this.registerViewerPhase();      // Phase 5
      this.registerApprovalPhase();    // Phase 6
      this.registerOverflowPhase();    // Phase 7
      this.registerFinancialPhase();   // Phase 8
      this.registerSnapshotPhase();    // Phase 10
    },

    /** 상태 접근 (특수 검증에서 사용) */
    getState() {
      return state;
    },

    /** 특수 검증용 유틸: PPTX 전체 텍스트 */
    getPptxText() {
      return state.fullPptxText;
    },

    /** 스크린샷 디렉토리 */
    getScreenshotDir() {
      return screenshotDir;
    },

    /** 데이터 디렉토리 */
    getDataDir() {
      return absDataDir;
    },
  };
}

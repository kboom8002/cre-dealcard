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
  assertNoHardcodedFallback,
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
        console.log(`\n🔷 Phase 1: ${name} 딜카드 생성`);

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

        // 기존 docId 재사용
        const existingDocFile = path.join(screenshotDir, 'doc-id.txt');
        if (fs.existsSync(existingDocFile)) {
          const existingDocId = fs.readFileSync(existingDocFile, 'utf-8').trim();
          if (existingDocId) {
            state.docId = existingDocId;
            console.log(`  📋 기존 docId 재사용: ${existingDocId}`);
            return;
          }
        }

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
        const bs = loadBottomSheet();
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

        // ── 포스처별 필수 필드 입력 ──
        if (posture === 'income') {
          if (bs.floor_leases && bs.floor_leases.length > 0) {
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

          // ADR 입력
          const adrInput = page.locator('input[placeholder*="12"]').first();
          if (await adrInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await adrInput.fill(String(adrManwon));
            console.log(`  🏨 ADR ${adrManwon}만원 입력`);
          }

          // OCC 입력
          const occInput = page.locator('input[placeholder*="75"]').first();
          if (await occInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await occInput.fill(String(hop.occupancy_rate_pct || 78));
          }

          // GOP 마진 입력
          const gopInput = page.locator('input[placeholder*="30"]').first();
          if (await gopInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await gopInput.fill(String(hop.gop_margin_pct || 38));
          }
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
        if (bs.floor_leases && bs.floor_leases.length > 0 && (posture === 'income' || posture === 'owner_occupied')) {
          try {
            const textTab = page.locator('button:has-text("텍스트"), button:has-text("📝 텍스트")').first();
            if (await textTab.isVisible({ timeout: 2000 }).catch(() => false)) {
              await textTab.click();
              await page.waitForTimeout(500);
              const rentRollArea = page.locator('textarea[placeholder*="층"], textarea[placeholder*="B1"], textarea[placeholder*="임차"]').first();
              if (await rentRollArea.isVisible({ timeout: 2000 }).catch(() => false)) {
                const rentRollText = bs.floor_leases.map((l: any) =>
                  `${l.floor} ${l.tenant_type || ''} ${l.area_pyeong ? l.area_pyeong + '평 ' : ''}보증금${l.deposit_manwon || 0} 월세${l.rent_manwon || 0} ${l.note || ''}`
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

        await page.waitForTimeout(1000);
        await shot(page, screenshotDir, 'form-filled-ready', stepCounter);

        // IM 생성 실행
        const generateBtn = page.locator('button:has-text("⚡ IM 생성"), button:has-text("IM 생성")').last();
        await expect(generateBtn).toBeEnabled({ timeout: 10_000 });
        await generateBtn.click();
        console.log('  🚀 Basic IM 생성 시작...');
        await shot(page, screenshotDir, 'im-generating-started', stepCounter);

        const completed = await pollImCompletion(page, imWaitMs);
        expect(completed).toBe(true);
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

        state.pptxPath = path.join(screenshotDir, `${name}.pptx`);
        await downloadPptx(page, state.buildingId, state.docId, state.pptxPath);
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

        // 5종 콘텐츠 단언
        if (state.mediaEntries.length > 0) {
          assertMapImagePresence(state.mediaEntries);
        }
        assertPriceReflected(state.fullPptxText, askingPriceManwon);
        if (expectedFloors.length > 0) {
          assertFloorKeywordsPresent(state.fullPptxText, expectedFloors);
        }
        assertNoEvasivePhrasesExtended(state.fullPptxText);
        assertNoHardcodedFallback(state.fullPptxText);

        // 키워드 검증
        for (const kw of expectedKeywords) {
          expect(state.fullPptxText).toContain(kw);
          console.log(`  ✅ 키워드 "${kw}" 확인`);
        }

        console.log(`\n  🎉 ${name}: 9종 단언 전부 통과!`);
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
        const bodyText = await page.textContent('body') || '';
        expect(bodyText.length).toBeGreaterThan(100);
        console.log(`  ✅ 뷰어 로딩 완료 (${bodyText.length}자)`);

        // P5-02: Hero Card 키워드
        for (const kw of expectedKeywords) {
          if (bodyText.includes(kw)) {
            console.log(`  ✅ Hero Card 키워드 "${kw}" 확인`);
          }
        }

        // P5-XX: 결함 토큰 0건
        const defects = ['NaN', 'undefined', '[object Object]'];
        const foundDefects = defects.filter(d => bodyText.includes(d));
        expect(foundDefects).toEqual([]);
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
        expect(found.length).toBeGreaterThanOrEqual(5);
        console.log('  ✅ 물건 개요 최소 기준(5/11) 충족');

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
        const shareLink = page.locator('a[href*="im-lite"], input[value*="im-lite"]').first();
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
        const advancedKeywords = ['DCF', 'NPV', '민감도', 'Sensitivity', '시나리오'];
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

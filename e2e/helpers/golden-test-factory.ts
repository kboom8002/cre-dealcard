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

  // Posture label mapping
  const postureLabels: Record<InvestmentPosture, string[]> = {
    income: ['임대수익', '수익형'],
    trading: ['매매차익', '트레이딩'],
    owner_occupied: ['자가사옥', '사옥전환'],
    development: ['개발사업', '개발형'],
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
            // 주소에서 동/번지만 추출
            const shortAddr = bs.address.replace(/^(서울특별시|서울|경기도)\s*/, '').replace(/\s*(구|시)\s*/, ' ');
            await addrInput.fill(shortAddr);
            await addrInput.press('Enter');
            await page.waitForTimeout(2500);

            const searchResultBtn = page.locator('button:has-text("PNU")').first();
            if (await searchResultBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
              await searchResultBtn.click();
              console.log('  ✅ 검색 결과 PNU 확정 완료');
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

        // 임대료/보증금 입력 (income/operating에서)
        if (bs.floor_leases && bs.floor_leases.length > 0 && (posture === 'income' || posture === 'operating')) {
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

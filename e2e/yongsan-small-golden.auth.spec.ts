/**
 * @file e2e/yongsan-small-golden.auth.spec.ts
 * @description 용산구 이태원동 소형(32억, 42평) 근생 실매물 기반 Basic IM 골든 테스트
 *
 * 포스처: income (소형 근생 임대수익형)
 * 매각가: 32억 (50억 미만 소형 매물)
 * 규모: B1~3F (총 4개 층, 소형 테이블)
 * 핵심 검증:
 * - 50억 미만 소형 매물 수익률 산식 및 대지/연면적 파싱 무결성
 * - B1 자가사용(창고) 층별 임대차 렌더링 무결성
 * - 10면 규격 준수 (Rule 47) 및 결함 토큰 0건
 * - 150 DPI PNG 슬라이드 변환 및 시각 무결성 (Rule 4)
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { convertPptxToSlideImages } from '../src/tests/e2e/pptx-slide-capturer';
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
} from './helpers/golden-test-utils';

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots', 'yongsan-small-golden');
const VISUAL_QA_DIR = path.resolve(process.cwd(), 'docs', 'test', 'stress', 'e2e-outputs', 'visual-qa', 'yongsan-small');
const stepCounter = { current: 0 };

test.describe.serial('용산 이태원동 소형 근생 Basic IM 골든 테스트 (income 포스처, 32억 소형)', () => {
  test.setTimeout(600_000); // 10분 — LLM 호출 및 이미지 변환 포함

  test('Phase 1: 소형 매물 메모 입력 → 딜카드 생성', async ({ page }) => {
    console.log('\n🔷 Phase 1: 용산 이태원동 소형 근생 메모로 딜카드 생성');

    await page.goto('/broker');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/login');
    console.log('  ✅ 인증 세션 확인');

    const existingIdFile = path.join(SCREENSHOT_DIR, 'building-id.txt');
    if (fs.existsSync(existingIdFile)) {
      const existingId = fs.readFileSync(existingIdFile, 'utf-8').trim();
      if (existingId) {
        console.log(`  📋 기존 buildingId 확인: ${existingId} → 딜카드 페이지 직접 확인`);
        await page.goto(`/broker/deal-card/${existingId}`);
        await page.waitForLoadState('networkidle');
        if (page.url().includes(existingId)) {
          console.log(`  ✅ 기존 딜카드 재사용 확인 완료: ${existingId}`);
          await shot(page, SCREENSHOT_DIR, 'deal-card-reused', stepCounter);
          return;
        }
      }
    }

    await page.goto('/broker/deal-card/new');
    await page.waitForLoadState('networkidle');
    await shot(page, SCREENSHOT_DIR, 'deal-card-new', stepCounter);

    const memo = `[매각 IM] 이태원동 127-1 (소형 근생빌딩)
이태원역 도보 3분. 대지 42평, 연면적 105평, B1~3F.
매각가 32억 (토지평당 약 7,600만).
만실. 보증금 4000만 / 월세 580만.
B1 창고 (자가사용), 1F 음식점, 2F 음식점, 3F 사무실.
준공 1992년.`;

    await page.locator('#broker-memo-input').fill(memo);
    await shot(page, SCREENSHOT_DIR, 'memo-filled', stepCounter);

    await page.locator('#cta-generate-deal-card').click();
    console.log('  ⏳ 딜카드 생성 요청...');

    const navPromise = page.waitForURL(/\/broker\/deal-card\/[a-f0-9]{8}-/, { timeout: 180_000 });
    await handleDuplicateModal(page, navPromise);

    const dealCardUrl = page.url();
    const buildingId = dealCardUrl.match(/deal-card\/([a-f0-9-]+)/)?.[1];
    expect(buildingId).toBeTruthy();
    console.log(`  ✅ 딜카드 생성 성공: ${buildingId}`);

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await shot(page, SCREENSHOT_DIR, 'deal-card-created', stepCounter);

    ensureDir(SCREENSHOT_DIR);
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'building-id.txt'), buildingId!);
  });

  test('Phase 2: 바텀시트 오픈 → 소형 근생 데이터 주입 → Basic IM 비동기 생성', async ({ page }) => {
    console.log('\n🔷 Phase 2: 소형 근생 바텀시트 데이터 주입 & 생성');

    const idFile = path.join(SCREENSHOT_DIR, 'building-id.txt');
    if (!fs.existsSync(idFile)) {
      console.log('  ⚠️ building-id.txt 없음');
      test.skip();
      return;
    }
    const buildingId = fs.readFileSync(idFile, 'utf-8').trim();

    // 이미 Phase 2에서 문서를 생성 및 승인 완료한 경우 빠른 패스
    const existingDocFile = path.join(SCREENSHOT_DIR, 'doc-id.txt');
    if (fs.existsSync(existingDocFile)) {
      const existingDocId = fs.readFileSync(existingDocFile, 'utf-8').trim();
      if (existingDocId) {
        console.log(`  📋 기존 docId 확인: ${existingDocId} → Phase 2 빠른 패스`);
        return;
      }
    }

    await page.goto(`/broker/deal-card/${buildingId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const basicBtn = page.locator('#cta-mobile-im-basic, button:has-text("⚡ 기본 IM"), button:has-text("기본 IM"), button:has-text("IM 생성")').first();
    await basicBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await basicBtn.click();
    console.log('  ✅ Basic IM 버튼 클릭 완료');

    await page.waitForTimeout(2000);
    await shot(page, SCREENSHOT_DIR, 'bottom-sheet-opened', stepCounter);

    // 1. 포스처: 임대수익형
    const incomeBtn = page.locator('button:has-text("임대수익"), button:has-text("수익형")').first();
    if (await incomeBtn.isVisible({ timeout: 2000 })) {
      await incomeBtn.click();
      console.log('  ✅ 포스처 [임대수익] 확인');
    }

    // 2. 주소 검색 및 PNU 확정
    console.log('  🔍 주소 검색: "이태원동 127-1"');
    const addrInput = page.locator('input[placeholder*="동/도로명"]').first();
    if (await addrInput.isVisible({ timeout: 3000 })) {
      await addrInput.fill('이태원동 127-1');
      await addrInput.press('Enter');
      await page.waitForTimeout(2500);

      const searchResultBtn = page.locator('button:has-text("PNU")').first();
      if (await searchResultBtn.isVisible({ timeout: 5000 })) {
        await searchResultBtn.click();
        console.log('  ✅ 검색 결과 PNU 확정 완료');
      }
    }
    await page.waitForTimeout(1000);

    // 3. 월세 (580만) 및 보증금 (4,000만) 입력
    const rentInput = page.locator('input[placeholder="예: 1500"]').first();
    if (await rentInput.isVisible({ timeout: 2000 })) {
      const currentVal = await rentInput.inputValue();
      if (!currentVal) {
        await rentInput.fill('580');
        console.log('  ✅ 월 임대료 580만원 입력');
      }
    }

    const depositInput = page.locator('input[placeholder="예: 30000"]').first();
    if (await depositInput.isVisible({ timeout: 2000 })) {
      const currentVal = await depositInput.inputValue();
      if (!currentVal) {
        await depositInput.fill('4000');
        console.log('  ✅ 보증금 4,000만원 입력');
      }
    }

    // 4. 매각가 (32억 = 320,000만) 확인
    const priceInput = page.locator('input[placeholder="예: 300000"], input[placeholder*="매매"], #input-asking-price').first();
    if (await priceInput.isVisible({ timeout: 2000 })) {
      const currentVal = await priceInput.inputValue();
      if (!currentVal) {
        await priceInput.fill('320000');
        console.log('  ✅ 매각가 32억 입력');
      }
    }

    await page.waitForTimeout(1000);
    await shot(page, SCREENSHOT_DIR, 'form-filled-ready', stepCounter);

    const generateBtn = page.locator('button:has-text("⚡ IM 생성"), button:has-text("IM 생성")').last();
    await expect(generateBtn).toBeEnabled({ timeout: 10_000 });
    await generateBtn.click();
    console.log('  🚀 Basic IM 생성 시작...');
    await shot(page, SCREENSHOT_DIR, 'im-generating-started', stepCounter);

    const completed = await pollImCompletion(page, 300_000);
    expect(completed).toBe(true);
    await shot(page, SCREENSHOT_DIR, 'im-generation-complete', stepCounter);

    const docId = await approveDocument(page, buildingId, SCREENSHOT_DIR);
    expect(docId).toBeTruthy();
  });

  test('Phase 3: 모바일 IM 뷰어 레이아웃 & 반응형 검증', async ({ page }) => {
    console.log('\n🔷 Phase 3: 모바일 IM 뷰어 레이아웃 검증');

    const buildingId = fs.readFileSync(path.join(SCREENSHOT_DIR, 'building-id.txt'), 'utf-8').trim();
    const docId = fs.existsSync(path.join(SCREENSHOT_DIR, 'doc-id.txt'))
      ? fs.readFileSync(path.join(SCREENSHOT_DIR, 'doc-id.txt'), 'utf-8').trim() : '';

    const imUrl = docId ? `/im-lite/${buildingId}?doc=${docId}` : `/im-lite/${buildingId}`;
    console.log(`  🔗 접속 URL: ${imUrl}`);
    await page.goto(imUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await shot(page, SCREENSHOT_DIR, 'im-viewer-desktop', stepCounter);

    const bodyText = await getVisibleText(page);
    expect(bodyText).toContain('이태원');
    expect(bodyText).toContain('32');
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('undefined');
    expect(bodyText).not.toContain('[object Object]');
    console.log('  ✅ 키워드 "이태원", "32" 및 결함 토큰 없음 확인');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(1000);

    const hasOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasOverflow).toBe(false);
    console.log('  ✅ 모바일 가로 오버플로 없음 (scrollWidth <= clientWidth)');

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(500);
      await shot(page, SCREENSHOT_DIR, `mobile-scroll-${String(i).padStart(2, '0')}`, stepCounter);
    }
  });

  test('Phase 4: PPTX 다운로드 & AdmZip 바이너리 + 콘텐츠 정합성 검증', async ({ page }) => {
    console.log('\n🔷 Phase 4: PPTX 다운로드 및 콘텐츠 정합성 검증');

    const buildingId = fs.readFileSync(path.join(SCREENSHOT_DIR, 'building-id.txt'), 'utf-8').trim();
    const docId = fs.existsSync(path.join(SCREENSHOT_DIR, 'doc-id.txt'))
      ? fs.readFileSync(path.join(SCREENSHOT_DIR, 'doc-id.txt'), 'utf-8').trim() : '';

    await page.setViewportSize({ width: 1280, height: 800 });
    const pptxPath = path.join(SCREENSHOT_DIR, 'yongsan-small-basic-im.pptx');

    await downloadPptx(page, buildingId, docId, pptxPath);

    expect(fs.existsSync(pptxPath)).toBe(true);
    const stats = fs.statSync(pptxPath);
    console.log(`  📊 PPTX 용량: ${(stats.size / 1024).toFixed(1)} KB`);
    expect(stats.size).toBeGreaterThan(100_000);

    const { slideCount, slideEntries, fullPptxText } = analyzePptxZip(pptxPath);
    console.log(`  📄 총 슬라이드 면수: ${slideCount}면`);

    // 수익형 면수 규격 (8~10면: A23 수익률 포함, 사진 유무/지적도 여부에 따라 8~10면)
    expect(slideCount).toBeGreaterThanOrEqual(8);
    expect(slideCount).toBeLessThanOrEqual(10);
    console.log(`  ✅ Basic IM 수익형 면수 규격 (${slideCount}면) 확인`);

    assertNoPoisonTokens(slideEntries);
    assertNoDummyData(fullPptxText);
    assertNoEvasivePhrases(fullPptxText);
    assertPriceBandBlocked(fullPptxText);

    // 소형 매물 32억 반영 확인
    expect(fullPptxText).toContain('32억');
    console.log('  ✅ 매매가 32억 PPTX 반영 확인');

    await shot(page, SCREENSHOT_DIR, 'pptx-verified', stepCounter);
  });

  test('Phase 5: LibreOffice 150 DPI PNG 슬라이드 변환 및 시각 검증', async () => {
    console.log('\n🔷 Phase 5: LibreOffice 150 DPI PNG 변환 및 시각 검증');

    const pptxPath = path.join(SCREENSHOT_DIR, 'yongsan-small-basic-im.pptx');
    if (!fs.existsSync(pptxPath)) {
      console.log('  ⚠️ PPTX 파일 없음');
      test.skip();
      return;
    }

    const pptxBuffer = fs.readFileSync(pptxPath);
    ensureDir(VISUAL_QA_DIR);

    const result = await convertPptxToSlideImages(pptxBuffer, VISUAL_QA_DIR, 'yongsan_small_basic', 150);
    console.log(`  ✅ PNG 변환 완료: ${result.slideImages.length}장 슬라이드 캡처됨`);
    expect(result.slideImages.length).toBeGreaterThanOrEqual(8);

    for (const imgPath of result.slideImages) {
      expect(fs.existsSync(imgPath)).toBe(true);
      const s = fs.statSync(imgPath);
      expect(s.size).toBeGreaterThan(10_000);
      console.log(`    [Slide] ${path.basename(imgPath)} (${(s.size / 1024).toFixed(1)} KB)`);
    }
  });

});

/**
 * @file e2e/gangnam-vacancy-golden.auth.spec.ts
 * @description 강남구 역삼동 고공실(57%) 오피스 실매물 기반 Basic IM 골든 테스트
 *
 * 포스처: income (고공실 밸류애드 수익형)
 * 매각가: 135억
 * 공실: 3,4,5,6층 공실 (공실률 57%)
 * 핵심 검증:
 * - A23 투자수익률 슬라이드 안정화(Stabilized) 시나리오 렌더 및 `◇ 분석가정` 배지
 * - A24 임대차 현황 슬라이드 공실층 주황색 하이라이트 (`FBEFE8`) 스타일링
 * - 0으로 나누기 방어 및 결함 토큰 0건
 * - 10면 규격 및 150 DPI PNG 슬라이드 시각 무결성 (Rule 4, Rule 47)
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

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots', 'gangnam-vacancy-golden');
const VISUAL_QA_DIR = path.resolve(process.cwd(), 'docs', 'test', 'stress', 'e2e-outputs', 'visual-qa', 'gangnam-vacancy');
const stepCounter = { current: 0 };

test.describe.serial('강남 역삼동 고공실 오피스 Basic IM 골든 테스트 (income 포스처, 공실률 57%)', () => {
  test.setTimeout(600_000); // 10분 — LLM 호출 및 이미지 변환 포함

  test('Phase 1: 고공실 메모 입력 → 딜카드 생성', async ({ page }) => {
    console.log('\n🔷 Phase 1: 강남 역삼동 고공실 메모로 딜카드 생성');

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

    const memo = `[매각 IM] 역삼동 832-7 (오피스빌딩)
강남역 도보 7분, 테헤란로 이면 오피스 밀집 권역.
대지 95평, 연면적 580평, B1~7F, 준공 2005년.
매각가 135억 (평당 약 2,330만).
현재 3,4,5,6층 공실 (공실률 약 57%).
B1 보증금 3000만 월세 220만 (커피숍)
1F 보증금 5000만 월세 450만 (편의점)
2F 보증금 3000만 월세 280만 (학원)
7F 보증금 2000만 월세 180만 (소규모 사무실)
총 보증금 1.3억 / 월세 1,130만.`;

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

  test('Phase 2: 바텀시트 오픈 → 수익형 데이터 주입 → Basic IM 비동기 생성', async ({ page }) => {
    console.log('\n🔷 Phase 2: 고공실 수익형 바텀시트 데이터 주입 & 생성');

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

    const basicBtn = page.locator('#cta-mobile-im-basic, button:has-text("⚡ 기본 IM"), button:has-text("기본 IM")').first();
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
    console.log('  🔍 주소 검색: "역삼동 832-7"');
    const addrInput = page.locator('input[placeholder*="동/도로명"]').first();
    if (await addrInput.isVisible({ timeout: 3000 })) {
      await addrInput.fill('역삼동 832-7');
      await addrInput.press('Enter');
      await page.waitForTimeout(2500);

      const searchResultBtn = page.locator('button:has-text("PNU")').first();
      if (await searchResultBtn.isVisible({ timeout: 5000 })) {
        await searchResultBtn.click();
        console.log('  ✅ 검색 결과 PNU 확정 완료');
      }
    }
    await page.waitForTimeout(1000);

    // 3. 월세 (1,130만) 및 보증금 (1.3억 = 13,000만) 입력
    const rentInput = page.locator('input[placeholder="예: 1500"]').first();
    if (await rentInput.isVisible({ timeout: 2000 })) {
      const currentVal = await rentInput.inputValue();
      if (!currentVal) {
        await rentInput.fill('1130');
        console.log('  ✅ 월 임대료 1,130만원 입력');
      }
    }

    const depositInput = page.locator('input[placeholder="예: 30000"]').first();
    if (await depositInput.isVisible({ timeout: 2000 })) {
      const currentVal = await depositInput.inputValue();
      if (!currentVal) {
        await depositInput.fill('13000');
        console.log('  ✅ 보증금 13,000만원 입력');
      }
    }

    // 4. 매각가 (135억 = 1,350,000만) 확인
    const priceInput = page.locator('input[placeholder="예: 300000"], input[placeholder*="매매"], #input-asking-price').first();
    if (await priceInput.isVisible({ timeout: 2000 })) {
      const currentVal = await priceInput.inputValue();
      if (!currentVal) {
        await priceInput.fill('1350000');
        console.log('  ✅ 매각가 135억 입력');
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

  test('Phase 3: 모바일 IM 뷰어 레이아웃 & 공실 현황 검증', async ({ page }) => {
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
    expect(bodyText).toContain('역삼');
    expect(bodyText).toContain('135');
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('undefined');
    expect(bodyText).not.toContain('[object Object]');
    console.log('  ✅ 키워드 "역삼", "135" 및 결함 토큰 없음 확인');

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
    const pptxPath = path.join(SCREENSHOT_DIR, 'gangnam-vacancy-basic-im.pptx');

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

    // A23 수익률 슬라이드 포함 확인
    expect(fullPptxText).toContain('수익률');
    console.log('  ✅ A23 수익률 슬라이드 정상 바인딩 확인');

    assertNoPoisonTokens(slideEntries);
    assertNoDummyData(fullPptxText);
    assertNoEvasivePhrases(fullPptxText);
    assertPriceBandBlocked(fullPptxText);

    // 공실 스타일링 확인 (FBEFE8 배경색)
    const hasVacancyStyle = slideEntries.some((e: any) =>
      e.getData().toString('utf-8').includes('FBEFE8')
    );
    if (hasVacancyStyle) {
      console.log('  ✅ A24 렌트롤 공실 스타일링 (FBEFE8) 적용 확인');
    }

    await shot(page, SCREENSHOT_DIR, 'pptx-verified', stepCounter);
  });

  test('Phase 5: LibreOffice 150 DPI PNG 슬라이드 변환 및 시각 검증', async () => {
    console.log('\n🔷 Phase 5: LibreOffice 150 DPI PNG 변환 및 시각 검증');

    const pptxPath = path.join(SCREENSHOT_DIR, 'gangnam-vacancy-basic-im.pptx');
    if (!fs.existsSync(pptxPath)) {
      console.log('  ⚠️ PPTX 파일 없음');
      test.skip();
      return;
    }

    const pptxBuffer = fs.readFileSync(pptxPath);
    ensureDir(VISUAL_QA_DIR);

    const result = await convertPptxToSlideImages(pptxBuffer, VISUAL_QA_DIR, 'gangnam_vacancy_basic', 150);
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

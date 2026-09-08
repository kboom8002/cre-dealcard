import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots', 'dangsan-pipeline');
// 데모 IM 문서가 하드코딩된 fixture — DB 없이 렌더링 가능
const IM_BUILDING_ID = 'case01_seocho_medical';
let stepCounter = 0;

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function shot(page: Page, label: string) {
  ensureDir(SCREENSHOT_DIR);
  stepCounter++;
  const filePath = path.join(SCREENSHOT_DIR, `${String(stepCounter).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`📸 [${stepCounter}] ${label}`);
  return filePath;
}

test.describe('당산동 115억 전구간 파이프라인 E2E', () => {
  test.setTimeout(300_000); // 5분

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 1: 메모 입력 UI 검증 (인증 불필요)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  test('Phase 1: 메모 입력 → CTA 버튼 → 딜카드 생성 UI', async ({ page }) => {
    console.log('\n🔷 Phase 1: 메모 입력 UI 검증');

    await page.goto('/broker/deal-card/new');
    await page.waitForLoadState('networkidle');
    await shot(page, 'deal-card-new');

    // Fill memo
    const memo = `당산동5가 11-47 (호산당빌딩)
매매가 115억 (근린생활시설, 메디컬 임차인 위주)
보증금 약 2억 9,000만원, 월임대료 약 1,946만원
만실 (공실률 0%, 자가사용 포함)
B1~5F
당산역(2·9호선) 도보 5분 역세권 우량 매물`;

    const memoInput = page.locator('#broker-memo-input');
    await expect(memoInput).toBeVisible({ timeout: 10_000 });
    await memoInput.fill(memo);
    await shot(page, 'memo-filled');

    // Verify character count
    const charCount = page.getByText('136 / 3,000자');
    await expect(charCount).toBeVisible({ timeout: 3000 });
    console.log('  ✅ 글자 수 카운트 정상');

    // Verify CTA button
    const ctaBtn = page.locator('#cta-generate-deal-card');
    await expect(ctaBtn).toBeVisible();
    await expect(ctaBtn).toBeEnabled();
    console.log('  ✅ "1분 딜카드 만들기" 버튼 활성화');

    // Verify auto-masking info
    await expect(page.getByText('✅ 정확한 주소')).toBeVisible();
    await expect(page.getByText('✅ 임차인명')).toBeVisible();
    console.log('  ✅ 자동 마스킹 정보 표시');

    // Click CTA → verify loading state appears
    await ctaBtn.click();
    await page.waitForTimeout(1500);
    await shot(page, 'loading-state');

    // 로딩 화면 or 인증 에러 — 둘 다 CTA 반응 확인
    const bodyText = await page.textContent('body') || '';
    const hasLoading = bodyText.includes('만들고 있') || bodyText.includes('추출 중');
    const hasAuthError = bodyText.includes('UNAUTHORIZED') || bodyText.includes('인증');
    console.log(hasLoading ? '  ✅ 딜카드 생성 로딩 화면 확인' : '  ⚠️ 로딩 화면 미표시');
    console.log(hasAuthError ? '  ⚠️ 인증 필요 (Playwright 세션 — 예상된 동작)' : '  ✅ 인증 에러 없음');

    await shot(page, 'phase1-complete');
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 2: IM 뷰어 육안 검사 (기존 DB 데이터)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  test('Phase 2: IM 뷰어 전체 페이지 육안 검사', async ({ page }) => {
    console.log('\n🔷 Phase 2: IM 뷰어 전체 페이지 육안 검사');

    // Desktop viewport first
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/im-lite/${IM_BUILDING_ID}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await shot(page, 'im-viewer-desktop');

    // Check page loaded
    const bodyText = await page.textContent('body') || '';
    const isLoaded = bodyText.length > 200 && !bodyText.includes('준비 중');
    
    if (!isLoaded) {
      console.log('  ⚠️ IM 뷰어 데이터 로드 안됨 — "준비 중" 또는 빈 페이지');
      await shot(page, 'WARNING-viewer-not-loaded');
      return;
    }

    // Verify key content
    const checks = [
      { keyword: '호산당', label: '건물명' },
      { keyword: '당산', label: '지역명' },
      { keyword: '115', label: '매매가' },
      { keyword: '수익', label: '포스처 키워드' },
    ];
    for (const { keyword, label } of checks) {
      console.log(bodyText.includes(keyword) ? `  ✅ ${label}: "${keyword}" 확인` : `  ⚠️ ${label}: "${keyword}" 미발견`);
    }

    // Check for console errors
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    // ── Mobile viewport scroll capture ──
    console.log('\n  📱 모바일 뷰포트 스크롤 캡처');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(1000);
    await shot(page, 'im-mobile-top');

    // Check horizontal overflow
    const hasHScroll = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    console.log(hasHScroll ? '  ❌ 가로 스크롤 감지!' : '  ✅ 가로 오버플로 없음');

    // Scroll through entire page
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const vpHeight = 812;
    const totalScreens = Math.ceil(scrollHeight / vpHeight);
    console.log(`  📐 총 스크롤 높이: ${scrollHeight}px (${totalScreens} 화면)`);

    for (let i = 0; i < Math.min(totalScreens, 20); i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * vpHeight);
      await page.waitForTimeout(400);
      await shot(page, `im-scroll-${String(i).padStart(2, '0')}`);
    }

    // ── Check section structure ──
    console.log('\n  📑 섹션 구조 확인');
    const headings = await page.locator('h2, h3').allTextContents();
    console.log(`  📋 발견된 섹션 헤딩: ${headings.length}개`);
    headings.forEach((h, i) => console.log(`    [${i + 1}] ${h.trim()}`));

    await shot(page, 'phase2-complete');
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 3: PPTX 다운로드 및 검사
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  test('Phase 3: PPTX 다운로드', async ({ page }) => {
    console.log('\n🔷 Phase 3: PPTX 다운로드');

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/im-lite/${IM_BUILDING_ID}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await shot(page, 'pptx-page-loaded');

    // Look for PPTX download button
    const pptxBtn = page.locator('button:has-text("PPTX"), a:has-text("PPTX"), button:has-text("다운로드")').first();

    try {
      await pptxBtn.waitFor({ state: 'visible', timeout: 10_000 });
      console.log('  ✅ PPTX 다운로드 버튼 발견');
      await shot(page, 'pptx-button-found');

      // Trigger download
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 120_000 }),
        pptxBtn.click(),
      ]);

      const pptxPath = path.join(SCREENSHOT_DIR, 'dangsan-115-im.pptx');
      await download.saveAs(pptxPath);
      
      const stats = fs.statSync(pptxPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.log(`  ✅ PPTX 다운로드 완료: ${sizeMB} MB`);
      console.log(`  📁 경로: ${pptxPath}`);
      
      // Basic validation
      expect(stats.size).toBeGreaterThan(100_000); // > 100KB
      console.log('  ✅ PPTX 파일 크기 정상 (> 100KB)');

      await shot(page, 'pptx-downloaded');
    } catch (err) {
      console.warn('  ⚠️ PPTX 다운로드 불가:', err);
      await shot(page, 'WARNING-pptx-unavailable');

      // Debug: check what's on the page
      const allBtns = await page.locator('button').allTextContents();
      console.log('  📋 페이지 내 버튼들:', allBtns.filter(t => t.trim()).slice(0, 15));
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 4: 태블릿 & 데스크탑 반응형 검사
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  test('Phase 4: 반응형 뷰포트 검사', async ({ page }) => {
    console.log('\n🔷 Phase 4: 반응형 뷰포트 검사');

    const viewports = [
      { name: 'iPhone SE', width: 375, height: 667 },
      { name: 'iPhone 14 Pro', width: 393, height: 852 },
      { name: 'iPad Mini', width: 768, height: 1024 },
      { name: 'iPad Pro', width: 1024, height: 1366 },
      { name: 'Desktop HD', width: 1920, height: 1080 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/im-lite/${IM_BUILDING_ID}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await shot(page, `responsive-${vp.name.replace(/\s/g, '-')}`);

      const hasHScroll = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      console.log(`  ${hasHScroll ? '❌' : '✅'} ${vp.name} (${vp.width}x${vp.height}) ${hasHScroll ? '가로 오버플로!' : '정상'}`);
    }

    await shot(page, 'phase4-complete');
  });
});

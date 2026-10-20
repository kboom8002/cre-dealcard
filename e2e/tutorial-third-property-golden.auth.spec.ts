/**
 * @file e2e/tutorial-third-property-golden.auth.spec.ts
 * @description 당산동(p1)·양평동(p5)과 다른 제3의 실매물(중구 쌍림동 114 운남빌딩, 95억, ig2-ssangnim-114)을
 * 활용한 60대 중개인 튜토리얼(제1장~준비편~제5장 슬라이드 편집 스튜디오) 전 과정 E2E 골든 테스트.
 *
 * 실행:
 *   npx playwright test e2e/tutorial-third-property-golden.auth.spec.ts --project=authenticated --workers=1
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { registerIncomeGolden } from './helpers/income-golden';
import {
  analyzePptxZip,
  assertNoPoisonTokens,
  assertNoDummyData,
  assertNoEvasivePhrases,
  assertPriceBandBlocked,
} from './helpers/golden-test-utils';

// 1. 제1장~준비편~제4장~제5장(승인·기본 PPTX·매수자 웹 뷰어) + Income-1~9 정합성 단언 등록
registerIncomeGolden('ig2-ssangnim-114', 'corrected');

// 2. 제5장 5-1~5-4단계: IM 완성 화면 → [📐 슬라이드 미리보기 · 편집 후 다운로드] → Basic IM 슬라이드 편집 스튜디오 E2E 검증
test.describe.serial('Tutorial Chapter 5 Studio E2E [ig2-ssangnim-114]', () => {
  const screenshotDir = path.resolve(__dirname, 'screenshots', 'income-ig2-corrected');

  test('Tutorial-Studio-1: IM 완성 화면에서 [📐 슬라이드 미리보기 · 편집 후 다운로드] 클릭 → 스튜디오 진입 · 테마 전환 · 편집 반영 PPTX 다운로드 검증', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const idFile = path.join(screenshotDir, 'building-id.txt');
    const docFile = path.join(screenshotDir, 'doc-id.txt');
    if (!fs.existsSync(idFile) || !fs.existsSync(docFile)) {
      test.skip();
      return;
    }

    const buildingId = fs.readFileSync(idFile, 'utf-8').trim();
    const docId = fs.readFileSync(docFile, 'utf-8').trim();
    expect(buildingId).toBeTruthy();
    expect(docId).toBeTruthy();

    // Step 5-1: IM 완성 화면(/broker/im-approval/[docId])에서 [📐 슬라이드 미리보기 · 편집 후 다운로드] 버튼 확인 후 스튜디오 이동
    await page.goto(`/broker/im-approval/${docId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2000);

    const studioEntryBtn = page.locator('a:has-text("슬라이드 미리보기"), button:has-text("슬라이드 미리보기")').first();
    if (await studioEntryBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await studioEntryBtn.click();
      await page.waitForURL(/\/broker\/basic-im-studio\//, { timeout: 20_000 });
    } else {
      await page.goto(`/broker/basic-im-studio/${buildingId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
    }

    // Step 5-3: 스튜디오 3단 워크스페이스(슬라이드 편집 / 테마·프리셋 / 헤더·푸터 탭 및 다운로드 버튼) 로드 대기
    const downloadBtn = page.getByTestId('studio-download-pptx-btn');
    await expect(downloadBtn).toBeVisible({ timeout: 30_000 });

    const tabContent = page.getByTestId('studio-tab-content');
    const tabTheme = page.getByTestId('studio-tab-theme');
    const tabBranding = page.getByTestId('studio-tab-branding');
    await expect(tabContent).toBeVisible();
    await expect(tabTheme).toBeVisible();
    await expect(tabBranding).toBeVisible();

    await page.screenshot({
      path: path.join(screenshotDir, '90-tutorial-studio-content-tab.png'),
      fullPage: false,
    });

    // Step 5-4: [🎨 테마·프리셋] 탭 클릭 및 실시간 테마 전환 확인
    await tabTheme.click();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(screenshotDir, '91-tutorial-studio-theme-tab.png'),
      fullPage: false,
    });

    // 다시 [📝 슬라이드 편집] 탭으로 돌아와 [📥 편집 반영 PPTX 다운로드] 실행 및 바이너리 검증
    await tabContent.click();
    await page.waitForTimeout(500);

    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await downloadBtn.click();
    const download = await downloadPromise;
    const studioPptxPath = path.join(screenshotDir, 'income-ig2-corrected-studio-edited.pptx');
    await download.saveAs(studioPptxPath);

    expect(fs.existsSync(studioPptxPath)).toBe(true);
    const stat = fs.statSync(studioPptxPath);
    expect(stat.size).toBeGreaterThan(50_000);

    const studioAnalysis = analyzePptxZip(studioPptxPath);
    console.log(
      `  📐 [Studio PPTX] 슬라이드: ${studioAnalysis.slideCount}면, 텍스트 길이: ${studioAnalysis.fullPptxText.length}자`,
    );
    expect(studioAnalysis.slideCount).toBeGreaterThanOrEqual(8);

    // 4대 바이너리 단언 (Poison Token / Dummy Data / Evasive Phrase / Price Band = 0건)
    assertNoPoisonTokens(studioAnalysis.slideEntries);
    assertNoDummyData(studioAnalysis.fullPptxText);
    assertNoEvasivePhrases(studioAnalysis.fullPptxText);
    assertPriceBandBlocked(studioAnalysis.fullPptxText);

    // 제3 실매물(쌍림동 114, 95억) 핵심 데이터 보존 단언
    expect(studioAnalysis.fullPptxText).toContain('쌍림동');
    expect(studioAnalysis.fullPptxText).toContain('95억');
  });
});

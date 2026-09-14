/**
 * @file e2e/mapo-dev-golden.auth.spec.ts
 * @description 마포구 대흥동 개발형(development) 실매물 기반 Basic IM 골든 테스트
 *
 * 포스처: development (재건축/신축 부지)
 * 매각가: 48억 (소형 개발 부지)
 * 공실: 전층 공실 (명도 완료)
 * 핵심 검증:
 * - 개발형 포스처에서 A23 수익률 슬라이드 자동 생략 및 10면 규격 준수 (Rule 47)
 * - 0건 모의 데이터, 0건 회피성 문구, 가격 밴드 차단
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

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots', 'mapo-dev-golden');
const VISUAL_QA_DIR = path.resolve(process.cwd(), 'docs', 'test', 'stress', 'e2e-outputs', 'visual-qa', 'mapo-dev');
const stepCounter = { current: 0 };

test.describe.serial('마포 대흥동 개발형 Basic IM 골든 테스트 (development 포스처)', () => {
  test.setTimeout(600_000); // 10분 — LLM 호출 및 이미지 변환 포함

  test('Phase 1: 개발형 메모 입력 → 딜카드 생성', async ({ page }) => {
    console.log('\n🔷 Phase 1: 마포 대흥동 개발형 메모로 딜카드 생성');

    await page.goto('/broker');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/login');
    console.log('  ✅ 인증 세션 확인');

    // 1. 기존 딜카드 재사용 확인
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

    // 2. 새 딜카드 생성 페이지 진입
    await page.goto('/broker/deal-card/new');
    await page.waitForLoadState('networkidle');
    await shot(page, SCREENSHOT_DIR, 'deal-card-new', stepCounter);

    // 3. 마포 대흥동 개발형 메모 입력 (실제 존재하는 필지 대흥동 12-41)
    const memo = `[매각 IM] 마포구 대흥동 12-41 (대지 110평, 4층 근생)
대흥역 도보 3분, 신촌로 대로변 접면.
준공 1988년, 노후도 심화. 대지 110평, 연면적 220평.
매각가 48억 (토지평당 약 4,360만).
전층 공실 (명도 완료). 재건축 또는 증축 개발 검토 대상.
용도지역 일반상업, 건폐율 80%, 용적률 800%.`;

    await page.locator('#broker-memo-input').fill(memo);
    await shot(page, SCREENSHOT_DIR, 'memo-filled', stepCounter);

    // 4. 생성 CTA 클릭 및 중복 모달 대응
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

  test('Phase 2: 바텀시트 오픈 → 개발형 포스처 주입 → Basic IM 비동기 생성', async ({ page }) => {
    console.log('\n🔷 Phase 2: 개발형(development) 바텀시트 데이터 주입 & 생성');

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

    // 1. Basic IM 버튼 탐색 및 클릭
    const basicBtn = page.locator('#cta-mobile-im-basic, button:has-text("⚡ 기본 IM"), button:has-text("기본 IM")').first();
    await basicBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await basicBtn.click();
    console.log('  ✅ Basic IM 버튼 클릭 완료');

    await page.waitForTimeout(2000);
    await shot(page, SCREENSHOT_DIR, 'bottom-sheet-opened', stepCounter);

    // 2. 포스처: 개발(development) 선택
    const postureSelectors = [
      'button:has-text("신축부지")',
      'button:has-text("개발")',
      'button:has-text("개발형")',
      'input[value="development"]',
    ];
    for (const sel of postureSelectors) {
      const el = page.locator(sel).first();
      try {
        if (await el.isVisible({ timeout: 1500 })) {
          await el.click();
          console.log(`  ✅ 포스처 [개발/신축부지] 선택 (${sel})`);
          break;
        }
      } catch { /* next */ }
    }

    // 3. 주소 검색 및 PNU 확정
    console.log('  🔍 주소 검색: "대흥동 12-41"');
    const addrInput = page.locator('input[placeholder*="동/도로명"]').first();
    if (await addrInput.isVisible({ timeout: 3000 })) {
      await addrInput.fill('대흥동 12-41');
      await addrInput.press('Enter');
      await page.waitForTimeout(2500);

      const searchResultBtn = page.locator('button:has-text("PNU")').first();
      if (await searchResultBtn.isVisible({ timeout: 5000 })) {
        await searchResultBtn.click();
        console.log('  ✅ 검색 결과 PNU 확정 완료');
      }
    }
    await page.waitForTimeout(1000);

    // 4. 개발형 필수 항목: 목표 연면적
    const targetScaleInput = page.locator('input[placeholder*="1200"]').first();
    if (await targetScaleInput.isVisible({ timeout: 2000 })) {
      await targetScaleInput.fill('880');
      console.log('  ✅ 개발 목표 연면적 (880평) 입력');
    }

    // 5. 매각가 (48억) 확인
    const priceInput = page.locator('input[placeholder="예: 300000"], input[placeholder*="매매"], #input-asking-price').first();
    if (await priceInput.isVisible({ timeout: 2000 })) {
      const currentVal = await priceInput.inputValue();
      if (!currentVal) {
        await priceInput.fill('480000');
        console.log('  ✅ 매각가 48억 입력');
      }
    }

    await page.waitForTimeout(1000);
    await shot(page, SCREENSHOT_DIR, 'form-filled-ready', stepCounter);

    // 6. ⚡ IM 생성 실행
    const generateBtn = page.locator('button:has-text("⚡ IM 생성"), button:has-text("IM 생성")').last();
    await expect(generateBtn).toBeEnabled({ timeout: 10_000 });
    await generateBtn.click();
    console.log('  🚀 Basic IM 생성 시작...');
    await shot(page, SCREENSHOT_DIR, 'im-generating-started', stepCounter);

    // 6. 생성 완료 대기
    const completed = await pollImCompletion(page, 300_000);
    expect(completed).toBe(true);
    await shot(page, SCREENSHOT_DIR, 'im-generation-complete', stepCounter);

    // 7. 문서 승인
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

    // 뷰어 DOM 렌더링 텍스트 검증
    const bodyText = await getVisibleText(page);
    expect(bodyText).toContain('대흥');
    expect(bodyText).toContain('48');
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('undefined');
    expect(bodyText).not.toContain('[object Object]');
    console.log('  ✅ 키워드 "대흥", "48" 및 결함 토큰 없음 확인');

    // 모바일 375x812 뷰포트 전환 및 가로 오버플로 검사
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
    const pptxPath = path.join(SCREENSHOT_DIR, 'mapo-dev-basic-im.pptx');

    await downloadPptx(page, buildingId, docId, pptxPath);

    expect(fs.existsSync(pptxPath)).toBe(true);
    const stats = fs.statSync(pptxPath);
    console.log(`  📊 PPTX 용량: ${(stats.size / 1024).toFixed(1)} KB`);
    expect(stats.size).toBeGreaterThan(100_000);

    // AdmZip 바이너리 분석
    const { slideCount, slideEntries, fullPptxText } = analyzePptxZip(pptxPath);
    console.log(`  📄 총 슬라이드 면수: ${slideCount}면`);

    // 개발형 포스처 & 무사진 매물: A23 수익률 및 A14 갤러리 생략으로 7면 규격 확인 (Rule 9, Rule 47)
    expect(slideCount).toBe(7);
    console.log('  ✅ 개발형 Basic IM 면수 (7면: A23 수익률 및 갤러리 조건부 생략) 일치 확인');

    // A23 투자수익률 슬라이드 미포함 검증 (개발형 전용 분기)
    expect(fullPptxText).not.toContain('투자수익률 분석');
    console.log('  ✅ 개발형 포스처에서 A23 수익률 슬라이드 미포함 확인');

    // 결함 토큰, 더미 데이터, 회피성 문구, 가격 밴드 단언
    assertNoPoisonTokens(slideEntries);
    assertNoDummyData(fullPptxText);
    assertNoEvasivePhrases(fullPptxText);
    assertPriceBandBlocked(fullPptxText);

    await shot(page, SCREENSHOT_DIR, 'pptx-verified', stepCounter);
  });

  test('Phase 5: LibreOffice 150 DPI PNG 슬라이드 변환 및 시각 검증', async () => {
    console.log('\n🔷 Phase 5: LibreOffice 150 DPI PNG 변환 및 시각 검증');

    const pptxPath = path.join(SCREENSHOT_DIR, 'mapo-dev-basic-im.pptx');
    if (!fs.existsSync(pptxPath)) {
      console.log('  ⚠️ PPTX 파일 없음');
      test.skip();
      return;
    }

    const pptxBuffer = fs.readFileSync(pptxPath);
    ensureDir(VISUAL_QA_DIR);

    const result = await convertPptxToSlideImages(pptxBuffer, VISUAL_QA_DIR, 'mapo_dev_basic', 150);
    console.log(`  ✅ PNG 변환 완료: ${result.slideImages.length}장 슬라이드 캡처됨`);
    expect(result.slideImages.length).toBe(7);

    for (const imgPath of result.slideImages) {
      expect(fs.existsSync(imgPath)).toBe(true);
      const s = fs.statSync(imgPath);
      expect(s.size).toBeGreaterThan(10_000);
      console.log(`    [Slide] ${path.basename(imgPath)} (${(s.size / 1024).toFixed(1)} KB)`);
    }
  });

});

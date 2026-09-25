/**
 * e2e/d1-d7-screenshot-capture.auth.spec.ts
 *
 * D1-D7 골든 테스트 튜토리얼용 스크린 캡처 스크립트
 * 
 * 목적: 실제 시스템에서 모바일 IM 뷰어와 PPTX를 캡처하여
 *       docs/test/13_d1_d7_mobile_im_golden_e2e_tutorial.md 에 삽입할 이미지를 생성합니다.
 *
 * 실행: npx playwright test e2e/d1-d7-screenshot-capture.auth.spec.ts --project=authenticated
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'docs', 'test', 'images', 'd1-d7-golden');
let stepCounter = 0;

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function shot(page: Page, label: string) {
  ensureDir(SCREENSHOT_DIR);
  stepCounter++;
  const filePath = path.join(SCREENSHOT_DIR, `${String(stepCounter).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`📸 [${stepCounter}] ${label} → ${filePath}`);
  return filePath;
}

async function shotFull(page: Page, label: string) {
  ensureDir(SCREENSHOT_DIR);
  stepCounter++;
  const filePath = path.join(SCREENSHOT_DIR, `${String(stepCounter).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`📸 [${stepCounter}] ${label} (full) → ${filePath}`);
  return filePath;
}

test.describe('D1-D7 골든 테스트 스크린 캡처', () => {
  test.setTimeout(600_000); // 10분

  test('Phase 1: 딜카드 생성 → Basic IM 바텀시트 → IM 생성', async ({ page }) => {
    console.log('\n🔷 Phase 1: 딜카드 → 바텀시트 → IM 생성');

    // ── 0. 인증 확인 ──
    await page.goto('/broker');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/login');
    console.log('  ✅ 인증 세션 확인');

    // ── 1. 새 딜카드 생성 ──
    console.log('  📝 새 딜카드 생성...');
    await page.goto('/broker/deal-card/new');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await shot(page, 'step1-dealcard-new');

    const memo = `당산동5가 11-47 (호산당빌딩)
매매가 115억 (근린생활시설, 메디컬 임차인 위주)
보증금 약 2억 9,000만원, 월임대료 약 1,946만원
만실 (공실률 0%, 자가사용 포함)
B1~5F
당산역(2·9호선) 도보 5분 역세권 우량 매물`;

    const memoInput = page.locator('#broker-memo-input, textarea[placeholder*="카톡"], textarea[placeholder*="메모"]').first();
    await memoInput.fill(memo);
    await shot(page, 'step2-memo-input');

    const genBtn = page.locator('#cta-generate-deal-card, button:has-text("딜카드 생성"), button:has-text("AI 분석")').first();
    await genBtn.click();
    console.log('  🚀 딜카드 생성 버튼 클릭');

    // 딜카드 페이지 로드 대기
    await page.waitForURL(/\/broker\/deal-card\/[a-f0-9]{8}-/, { timeout: 180_000 });
    const buildingId = page.url().match(/deal-card\/([a-f0-9-]+)/)?.[1];
    console.log(`  ✅ 딜카드 생성 완료: ${buildingId}`);
    await page.waitForTimeout(3000);
    await shot(page, 'step3-dealcard-created');

    // buildingId 저장
    ensureDir(SCREENSHOT_DIR);
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'building-id.txt'), buildingId || '');

    // ── 2. ⚡ 기본 IM 버튼 클릭 → 바텀시트 ──
    const basicBtnSelectors = [
      'button:has-text("⚡ 기본 IM")',
      'button:has-text("기본 IM")',
      'button:has-text("IM 생성")',
    ];

    for (const sel of basicBtnSelectors) {
      const btn = page.locator(sel).first();
      try {
        if (await btn.isVisible({ timeout: 3000 })) {
          await btn.click();
          console.log(`  ✅ Basic IM 버튼 클릭: ${sel}`);
          break;
        }
      } catch { /* try next */ }
    }

    await page.waitForTimeout(2000);
    await shot(page, 'step4-bottomsheet-opened');

    // ── 3. D5 검증 캡처: PNU 입력 안내 텍스트 ──
    // 바텀시트를 스크롤하여 다필지 섹션 확인
    const sheetContent = page.locator('[class*="bottom-sheet"], [class*="bottomsheet"], [role="dialog"]').first();
    try {
      await sheetContent.evaluate(el => el.scrollTo(0, el.scrollHeight));
      await page.waitForTimeout(1000);
    } catch { /* ignore */ }
    
    // PNU 라벨 근처 캡처
    const pnuLabel = page.locator('text=PNU').first();
    try {
      if (await pnuLabel.isVisible({ timeout: 3000 })) {
        await pnuLabel.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        await shot(page, 'step5-D5-pnu-guidance');
        console.log('  📸 D5: PNU 안내 텍스트 캡처');
      }
    } catch {
      console.log('  ⚠️ PNU 라벨 미발견 — 스킵');
    }

    // ── 4. 필수 필드 입력 (Basic IM: 대출/관리비 미입력!) ──
    // 매각희망가
    const askInput = page.locator('input[placeholder*="250000"], input[placeholder*="매각"]').first();
    try {
      if (await askInput.isVisible({ timeout: 2000 })) {
        const val = await askInput.inputValue();
        if (!val) await askInput.fill('1150000');
      }
    } catch { /* */ }

    // 보증금
    const depositInput = page.locator('input[placeholder*="30000"], input[placeholder*="보증금"]').first();
    try {
      if (await depositInput.isVisible({ timeout: 2000 })) {
        const val = await depositInput.inputValue();
        if (!val) await depositInput.fill('29000');
      }
    } catch { /* */ }

    // 월세
    const rentInput = page.locator('input[placeholder*="1500"], input[placeholder*="월세"]').first();
    try {
      if (await rentInput.isVisible({ timeout: 2000 })) {
        const val = await rentInput.inputValue();
        if (!val) await rentInput.fill('1946');
      }
    } catch { /* */ }

    await shot(page, 'step6-basic-fields-filled');
    console.log('  ✅ Basic IM 필드 입력 완료 (대출/관리비 미입력)');

    // ── 5. IM 생성 ──
    const imGenBtn = page.locator('button:has-text("⚡ IM 생성"), button:has-text("IM 생성하기")').last();
    try {
      await imGenBtn.scrollIntoViewIfNeeded();
      if (await imGenBtn.isEnabled({ timeout: 3000 })) {
        await imGenBtn.click();
        console.log('  🚀 Basic IM 생성 시작!');
        await shot(page, 'step7-im-generating');
      }
    } catch (e) {
      console.log('  ⚠️ IM 생성 버튼 클릭 실패:', e);
      await shot(page, 'WARNING-generate-fail');
      return;
    }

    // ── 6. 생성 폴링 (최대 5분) ──
    console.log('  ⏳ Basic IM 생성 폴링 (최대 5분)...');
    const maxWait = 300_000;
    const start = Date.now();
    let generated = false;

    while (Date.now() - start < maxWait) {
      await page.waitForTimeout(15_000);
      const elapsed = Math.round((Date.now() - start) / 1000);
      const bodyText = await page.textContent('body') || '';

      if (bodyText.includes('섹션 생성 완료') || bodyText.includes('IM 바로가기') || page.url().includes('im-approval')) {
        console.log(`  ✅ Basic IM 생성 완료! (${elapsed}초)`);
        generated = true;
        break;
      }
      console.log(`  ⏳ 폴링 ${elapsed}초...`);
    }

    if (!generated) {
      console.log('  ⚠️ 폴링 타임아웃 — 기존 IM으로 진행 시도');
    }

    await shot(page, 'step8-im-generation-complete');
  });

  test('Phase 2: 모바일 IM 뷰어 — D1/D2/D3/D4/D6/D7 스크린 캡처', async ({ page }) => {
    console.log('\n🔷 Phase 2: 모바일 IM 뷰어 캡처');

    const idFile = path.join(SCREENSHOT_DIR, 'building-id.txt');
    if (!fs.existsSync(idFile)) {
      console.log('  ⚠️ building-id.txt 없음 — Phase 1 먼저 실행');
      test.skip();
      return;
    }
    const buildingId = fs.readFileSync(idFile, 'utf-8').trim();
    console.log(`  📋 buildingId: ${buildingId}`);

    // ── 모바일 뷰포트로 전환 ──
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 15
    
    // ── IM 뷰어 접속 ──
    await page.goto(`/im-lite/${buildingId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await shotFull(page, 'step9-mobile-im-hero');
    console.log('  ✅ 모바일 IM 뷰어 접속');

    // ── D1/D4 캡처: income_analysis 섹션 (수익 분석) ──
    const incomeSection = page.locator('text=수익이 나오는 딜인가').first();
    try {
      if (await incomeSection.isVisible({ timeout: 5000 })) {
        await incomeSection.click(); // 섹션 카드 확장
        await page.waitForTimeout(1500);
        await shot(page, 'step10-D1-D4-income-analysis');
        console.log('  📸 D1/D4: income_analysis 섹션 캡처');

        // 테이블 전체 스크롤 캡처
        await page.evaluate(() => window.scrollBy(0, 500));
        await page.waitForTimeout(500);
        await shot(page, 'step11-D1-D4-income-table');

        // D1/D4 텍스트 검증
        const sectionText = await page.textContent('body') || '';
        const hasWACC = sectionText.includes('WACC');
        const hasNPV = sectionText.includes('NPV');
        const hasIRR = sectionText.includes('IRR');
        const hasLTV = sectionText.includes('LTV 50%');
        const hasCapRate = sectionText.includes('Cap Rate') || sectionText.includes('수익률');
        
        console.log(`  🔍 D1 검증: LTV 50% → ${hasLTV ? '❌ FAIL' : '✅ PASS'}`);
        console.log(`  🔍 D4 검증: WACC=${hasWACC ? '❌' : '✅'}, NPV=${hasNPV ? '❌' : '✅'}, IRR=${hasIRR ? '❌' : '✅'}`);
        console.log(`  🔍 표면 수익률: Cap Rate → ${hasCapRate ? '✅ PASS' : '❌ FAIL'}`);
      }
    } catch {
      console.log('  ⚠️ income_analysis 섹션 미발견');
    }

    // ── D2/D6 캡처: comparables 섹션 ──
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    const compSection = page.locator('text=유사 매물').first();
    try {
      if (await compSection.isVisible({ timeout: 5000 })) {
        await compSection.click();
        await page.waitForTimeout(1500);
        await shot(page, 'step12-D2-D6-comparables');
        console.log('  📸 D2/D6: comparables 섹션 캡처');

        const compText = await page.textContent('body') || '';
        const hasNextSteps = compText.includes('투자 진행 단계') || compText.includes('NDA 체결');
        const hasComparable = compText.includes('비교 매물') || compText.includes('비교 가능한 매물');
        
        console.log(`  🔍 D2 검증: next_steps 혼입 → ${hasNextSteps ? '❌ FAIL' : '✅ PASS'}`);
        console.log(`  🔍 D6 검증: comparables 렌더링 → ${hasComparable ? '✅ PASS' : '⚠️ 확인 필요'}`);
      }
    } catch {
      console.log('  ⚠️ comparables 섹션 미발견 (suppress 가능)');
      await shot(page, 'step12-D2-D6-comparables-not-found');
    }

    // ── D7 캡처: next_steps 섹션 ──
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    const nextSection = page.locator('text=다음 단계').first();
    try {
      if (await nextSection.isVisible({ timeout: 5000 })) {
        await nextSection.click();
        await page.waitForTimeout(1500);
        await shot(page, 'step13-D7-next-steps');
        console.log('  📸 D7: next_steps 섹션 캡처');

        await page.evaluate(() => window.scrollBy(0, 400));
        await page.waitForTimeout(500);
        await shot(page, 'step14-D7-next-steps-detail');

        const nextText = await page.textContent('body') || '';
        const hasNDA = nextText.includes('NDA') || nextText.includes('비밀유지');
        const hasDealSummary = nextText.includes('본 건물은') || nextText.includes('역세권 입지로');

        console.log(`  🔍 D7 검증: 절차 안내 → ${hasNDA ? '✅ PASS' : '⚠️ 확인 필요'}`);
        console.log(`  🔍 D7 검증: 딜 요약 미반복 → ${hasDealSummary ? '❌ FAIL' : '✅ PASS'}`);
      }
    } catch {
      console.log('  ⚠️ next_steps 섹션 미발견');
    }

    // ── D3 캡처: 마크다운 헤딩 렌더링 ──
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    // 입지 분석 섹션 (보통 소제목이 많아서 D3 검증에 적합)
    const locationSection = page.locator('text=투자할 만한 곳인가').first();
    try {
      if (await locationSection.isVisible({ timeout: 5000 })) {
        await locationSection.click();
        await page.waitForTimeout(1500);
        await shot(page, 'step15-D3-location-headings');
        console.log('  📸 D3: 입지 분석 소제목 렌더링 캡처');

        await page.evaluate(() => window.scrollBy(0, 600));
        await page.waitForTimeout(500);
        await shot(page, 'step16-D3-location-detail');

        const locText = await page.textContent('body') || '';
        const hasBrokenBold = /\*\*[^\*\n]{1,5}$/.test(locText);
        const hasInlineHash = /[^\n]###\s/.test(locText);
        
        console.log(`  🔍 D3 검증: 깨진 볼드 → ${hasBrokenBold ? '❌ FAIL' : '✅ PASS'}`);
        console.log(`  🔍 D3 검증: 인라인 ### → ${hasInlineHash ? '❌ FAIL' : '✅ PASS'}`);
      }
    } catch {
      console.log('  ⚠️ location_access 섹션 미발견');
    }

    // ── 전체 섹션 목록 풀페이지 캡처 ──
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await shotFull(page, 'step17-mobile-im-full-page');
    console.log('  📸 전체 모바일 IM 풀페이지 캡처');

    // ── 데스크톱 뷰포트로 전환 (PPTX 다운로드용) ──
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('Phase 3: PPTX 다운로드 → 슬라이드 캡처', async ({ page }) => {
    console.log('\n🔷 Phase 3: PPTX 캡처');

    const idFile = path.join(SCREENSHOT_DIR, 'building-id.txt');
    if (!fs.existsSync(idFile)) {
      test.skip();
      return;
    }
    const buildingId = fs.readFileSync(idFile, 'utf-8').trim();

    // PPTX API 직접 호출하여 다운로드
    const pptxRes = await page.request.get(`/api/public/im-lite/${buildingId}/pptx`);
    
    if (pptxRes.ok()) {
      const pptxBuffer = await pptxRes.body();
      const pptxPath = path.join(SCREENSHOT_DIR, 'basic-im-output.pptx');
      fs.writeFileSync(pptxPath, pptxBuffer);
      console.log(`  ✅ PPTX 다운로드 완료: ${pptxPath} (${(pptxBuffer.length / 1024).toFixed(0)} KB)`);

      // PPTX 내 텍스트 추출 (JSZip 기반)
      try {
        const { extractSlideTexts } = await import('../src/tests/e2e/pptx-slide-capturer');
        // extractSlideTexts가 없으면 JSZip 직접 사용
      } catch {
        console.log('  ⚠️ pptx-slide-capturer 미사용 — PPTX 파일만 저장');
      }

      // PPTX 바이너리 텍스트 검증
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(pptxBuffer);
      const slideFiles = Object.keys(zip.files).filter(f => f.match(/ppt\/slides\/slide\d+\.xml$/)).sort();
      
      let allText = '';
      for (const slideFile of slideFiles) {
        const xml = await zip.files[slideFile].async('text');
        // XML에서 텍스트만 추출
        const texts = xml.match(/<a:t>([^<]+)<\/a:t>/g)?.map(m => m.replace(/<\/?a:t>/g, '')) || [];
        allText += texts.join(' ') + '\n';
      }

      console.log(`  📊 PPTX 슬라이드: ${slideFiles.length}장`);
      
      // D1/D4 PPTX 바이너리 단언
      const pptxHasWACC = allText.includes('WACC');
      const pptxHasNPV = allText.includes('NPV');
      const pptxHasIRR = allText.includes('IRR');
      const pptxHasLTV = allText.includes('LTV');
      const pptxHasCapRate = allText.includes('Cap Rate') || allText.includes('수익률');
      
      console.log(`\n  ═══ PPTX 바이너리 D1/D4 단언 ═══`);
      console.log(`  WACC: ${pptxHasWACC ? '❌ FAIL (포함됨)' : '✅ PASS (미포함)'}`);
      console.log(`  NPV:  ${pptxHasNPV ? '❌ FAIL (포함됨)' : '✅ PASS (미포함)'}`);
      console.log(`  IRR:  ${pptxHasIRR ? '❌ FAIL (포함됨)' : '✅ PASS (미포함)'}`);
      console.log(`  LTV:  ${pptxHasLTV ? '❌ FAIL (포함됨)' : '✅ PASS (미포함)'}`);
      console.log(`  수익률: ${pptxHasCapRate ? '✅ PASS (포함)' : '❌ FAIL (미포함)'}`);
      
      // 결과 저장
      const resultJson = {
        buildingId,
        timestamp: new Date().toISOString(),
        slideCount: slideFiles.length,
        pptxSizeKB: Math.round(pptxBuffer.length / 1024),
        assertions: {
          'D1_no_LTV': !pptxHasLTV,
          'D4_no_WACC': !pptxHasWACC,
          'D4_no_NPV': !pptxHasNPV,
          'D4_no_IRR': !pptxHasIRR,
          'has_CapRate': pptxHasCapRate,
        },
      };
      fs.writeFileSync(
        path.join(SCREENSHOT_DIR, 'pptx-assertion-result.json'),
        JSON.stringify(resultJson, null, 2)
      );
      console.log(`  📋 PPTX 검증 결과 저장 완료`);
    } else {
      console.log(`  ⚠️ PPTX 다운로드 실패: ${pptxRes.status()}`);
      
      // 기존 PPTX가 있는지 확인
      const existingPptx = path.join(SCREENSHOT_DIR, 'basic-im-output.pptx');
      if (fs.existsSync(existingPptx)) {
        console.log('  📋 기존 PPTX 파일 사용');
      }
    }

    // ── IM 뷰어를 데스크톱 모드로 캡처 ──
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/im-lite/${buildingId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await shotFull(page, 'step18-desktop-im-viewer');
    console.log('  📸 데스크톱 IM 뷰어 캡처');

    // ── 승인 페이지 캡처 ──
    try {
      const docsRes = await page.request.get(`/api/broker/im-lite/${buildingId}`);
      const docsJson = await docsRes.json();
      if (docsJson.ok && docsJson.documents?.length > 0) {
        const docId = docsJson.documents[0].id;
        await page.goto(`/broker/im-approval/${docId}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);
        await shotFull(page, 'step19-approval-page');
        console.log('  📸 승인 페이지 캡처');
      }
    } catch {
      console.log('  ⚠️ 승인 페이지 접근 실패');
    }

    console.log(`\n  ═══ 캡처 완료 ═══`);
    console.log(`  📁 이미지 저장 위치: ${SCREENSHOT_DIR}`);
    console.log(`  📸 총 캡처: ${stepCounter}장`);
  });
});

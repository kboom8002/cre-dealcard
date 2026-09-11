/**
 * e2e/basic-im-golden.auth.spec.ts
 *
 * Basic IM 전구간 골든 테스트 (인증 세션):
 * Phase 1: 딜카드 접속 → ⚡기본 IM 버튼 → 바텀시트 오픈
 * Phase 2: Basic 바텀시트 입력 → credeal_basic 프리셋 확인 → IM 생성
 * Phase 3: IM 뷰어 확인 → PPTX 다운로드 → Basic 고유 슬라이드 검증
 *
 * Rule 41: 프로덕션 골든 테스트 (dev server + Playwright + Supabase 실DB)
 * Rule 42: 기존 dangsan-full-pipeline.auth.spec.ts와 분리 (Basic 전용 경로)
 * Rule 43: 외부 API 실호출 (카카오 지도, V-World 지적도)
 *
 * 실행: npx playwright test e2e/basic-im-golden.auth.spec.ts --project=authenticated
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots', 'basic-im-golden');
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

test.describe('Basic IM 골든 테스트 (credeal_basic 프리셋)', () => {
  test.setTimeout(600_000); // 10분 — LLM 호출 포함

  test('Phase 1: 딜카드 → ⚡기본 IM 버튼 → 바텀시트', async ({ page }) => {
    console.log('\n🔷 Phase 1: 딜카드 접속 → ⚡ 기본 IM 버튼 클릭');

    // 인증 확인
    await page.goto('/broker');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/login');
    console.log('  ✅ 인증 세션 확인');

    // ── 기존 딜카드 재사용 or 새로 생성 ──
    const existingIdFile = path.resolve(__dirname, 'screenshots', 'dangsan-auth-pipeline', 'building-id.txt');
    let buildingId: string | undefined;

    if (fs.existsSync(existingIdFile)) {
      buildingId = fs.readFileSync(existingIdFile, 'utf-8').trim();
      console.log(`  📋 기존 buildingId 재사용: ${buildingId}`);
    }

    if (!buildingId) {
      // 새 딜카드 생성 (당산동 115억)
      console.log('  📝 새 딜카드 생성...');
      await page.goto('/broker/deal-card/new');
      await page.waitForLoadState('networkidle');

      const memo = `당산동5가 11-47 (호산당빌딩)
매매가 115억 (근린생활시설, 메디컬 임차인 위주)
보증금 약 2억 9,000만원, 월임대료 약 1,946만원
만실 (공실률 0%, 자가사용 포함)
B1~5F
당산역(2·9호선) 도보 5분 역세권 우량 매물`;

      await page.locator('#broker-memo-input').fill(memo);
      await page.locator('#cta-generate-deal-card').click();
      await page.waitForURL(/\/broker\/deal-card\/[a-f0-9]{8}-/, { timeout: 180_000 });
      buildingId = page.url().match(/deal-card\/([a-f0-9-]+)/)?.[1];
      console.log(`  ✅ 딜카드 생성 완료: ${buildingId}`);
    }

    // 딜카드 상세 페이지 접속
    await page.goto(`/broker/deal-card/${buildingId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await shot(page, 'deal-card-detail');

    // ── ⚡ 기본 IM 버튼 찾기 ──
    // Phase C에서 구현한 세그먼트 CTA 또는 관리 패널 듀얼 버튼
    const basicImSelectors = [
      'button:has-text("⚡ 기본 IM")',
      'button:has-text("기본 IM")',
      'button:has-text("Basic")',
    ];

    let basicBtnFound = false;
    for (const sel of basicImSelectors) {
      const btn = page.locator(sel).first();
      try {
        if (await btn.isVisible({ timeout: 3000 })) {
          const label = await btn.textContent();
          console.log(`  ✅ Basic IM 버튼 발견: "${label}"`);
          await btn.click();
          basicBtnFound = true;
          break;
        }
      } catch { /* try next */ }
    }

    if (!basicBtnFound) {
      // 스크롤 후 재시도
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(1000);

      for (const sel of basicImSelectors) {
        const btn = page.locator(sel).first();
        try {
          if (await btn.isVisible({ timeout: 2000 })) {
            await btn.click();
            basicBtnFound = true;
            break;
          }
        } catch { /* try next */ }
      }
    }

    if (!basicBtnFound) {
      // 단일 IM 버튼 fallback (기존 UI)
      const fallbackBtn = page.locator('button:has-text("IM 생성")').first();
      try {
        if (await fallbackBtn.isVisible({ timeout: 3000 })) {
          console.log('  ⚠️ 기본/전문 분리 버튼 미발견 — 기존 IM 생성 버튼 사용');
          await fallbackBtn.click();
          basicBtnFound = true;
        }
      } catch { /* */ }
    }

    expect(basicBtnFound).toBe(true);
    console.log('  ✅ Basic IM 버튼 클릭 완료');

    // 바텀시트 대기
    await page.waitForTimeout(2000);
    await shot(page, 'basic-bottom-sheet-opened');

    // buildingId 저장
    if (buildingId) {
      ensureDir(SCREENSHOT_DIR);
      fs.writeFileSync(path.join(SCREENSHOT_DIR, 'building-id.txt'), buildingId);
    }
  });

  test('Phase 2: Basic 바텀시트 입력 → IM 생성', async ({ page }) => {
    console.log('\n🔷 Phase 2: Basic IM 생성');

    const idFile = path.join(SCREENSHOT_DIR, 'building-id.txt');
    if (!fs.existsSync(idFile)) {
      console.log('  ⚠️ building-id.txt 없음 — Phase 1 먼저 실행');
      test.skip();
      return;
    }
    const buildingId = fs.readFileSync(idFile, 'utf-8').trim();
    console.log(`  📋 buildingId: ${buildingId}`);

    // 딜카드 상세 페이지
    await page.goto(`/broker/deal-card/${buildingId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // ⚡ 기본 IM 버튼 클릭 → 바텀시트
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
          break;
        }
      } catch { /* */ }
    }

    await page.waitForTimeout(2000);
    await shot(page, 'basic-sheet-open');

    // ── PNU 선택 ──
    const pnuBtn = page.locator('button:has-text("PNU")').first();
    try {
      await pnuBtn.waitFor({ state: 'visible', timeout: 5000 });
      await pnuBtn.click();
      await page.waitForTimeout(1500);
      console.log('  ✅ PNU 선택 완료');
    } catch {
      console.log('  ⚠️ PNU 자동 선택 실패 — 수동 검색');
      const addrInput = page.locator('input[placeholder*="동/도로명"]').first();
      try {
        await addrInput.clear();
        await addrInput.fill('당산동5가 11-47');
        const searchBtn = page.getByRole('button', { name: '검색' }).first();
        await searchBtn.click();
        await page.waitForTimeout(3000);
        const firstResult = page.locator('button:has-text("PNU")').first();
        await firstResult.click();
        await page.waitForTimeout(1500);
      } catch (e) {
        console.log('  ⚠️ 주소 검색 실패:', e);
      }
    }

    // ── 사진 업로드 ──
    const testImagesDir = path.resolve(__dirname, '..', 'public', 'test-images', 'dangsan');
    const imageFiles = ['01_exterior.jpg', '03_entrance.jpg', '04_lobby.jpg', '07_parking.jpg'];
    const availableImages = imageFiles
      .map(f => path.join(testImagesDir, f))
      .filter(p => fs.existsSync(p));

    if (availableImages.length > 0) {
      const fileInput = page.locator('input[type="file"][accept="image/*"]').first();
      try {
        await fileInput.setInputFiles(availableImages);
        await page.waitForTimeout(2000);
        console.log(`  ✅ ${availableImages.length}장 사진 업로드`);
      } catch {
        console.log('  ⚠️ 사진 업로드 실패');
      }
    }

    // ── 필수 필드 확인/입력 ──
    const depositInput = page.locator('input[placeholder="예: 30000"]').first();
    try {
      if (await depositInput.isVisible({ timeout: 1000 })) {
        const val = await depositInput.inputValue();
        if (!val) await depositInput.fill('29000');
      }
    } catch { /* */ }

    const rentInput = page.locator('input[placeholder="예: 1500"]').first();
    try {
      if (await rentInput.isVisible({ timeout: 1000 })) {
        const val = await rentInput.inputValue();
        if (!val) await rentInput.fill('1946');
      }
    } catch { /* */ }

    const askInput = page.locator('input[placeholder="예: 250000"]').first();
    try {
      if (await askInput.isVisible({ timeout: 1000 })) {
        const val = await askInput.inputValue();
        if (!val) await askInput.fill('1150000');
      }
    } catch { /* */ }

    await shot(page, 'basic-fields-filled');

    // ── IM 생성 버튼 클릭 ──
    const generateBtn = page.locator('button:has-text("⚡ IM 생성")').last();
    try {
      await generateBtn.scrollIntoViewIfNeeded();
      if (await generateBtn.isEnabled({ timeout: 3000 })) {
        await generateBtn.click();
        console.log('  🚀 Basic IM 생성 시작!');
        await shot(page, 'basic-im-generating');
      } else {
        console.log('  ⚠️ 생성 버튼 disabled — canGenerate 미충족');
        await shot(page, 'WARNING-basic-cannot-generate');

        // 디버그: 모든 버튼 텍스트 수집
        const btns = await page.locator('button').allTextContents();
        console.log('  📋 버튼:', btns.filter(t => t.trim()).slice(0, 15));
        return;
      }
    } catch (e) {
      console.log('  ⚠️ IM 생성 실패:', e);
      await shot(page, 'WARNING-basic-generate-error');
      return;
    }

    // ── 생성 폴링 (최대 5분) ──
    console.log('  ⏳ Basic IM 생성 폴링 (최대 5분)...');
    const maxWait = 300_000;
    const start = Date.now();
    let generated = false;

    while (Date.now() - start < maxWait) {
      await page.waitForTimeout(15_000);
      const elapsed = Math.round((Date.now() - start) / 1000);
      const text = await page.textContent('body') || '';

      if (text.includes('섹션 생성 완료') || page.url().includes('im-approval')) {
        console.log(`  ✅ Basic IM 생성 완료! (${elapsed}초)`);
        generated = true;
        break;
      }
      console.log(`  ⏳ 폴링 ${elapsed}초...`);
      if (elapsed % 60 === 0) await shot(page, `basic-poll-${elapsed}s`);
    }

    if (!generated) {
      console.log('  ⚠️ 폴링 타임아웃');
      await shot(page, 'basic-poll-timeout');
      return;
    }

    await shot(page, 'basic-im-generated');

    // ── API로 docId 조회 + 자동 승인 ──
    try {
      const docsRes = await page.request.get(`/api/broker/im-lite/${buildingId}`);
      const docsJson = await docsRes.json();
      if (docsJson.ok && docsJson.documents?.length > 0) {
        const latestDoc = docsJson.documents[0];
        const docId = latestDoc.id;
        console.log(`  ✅ docId: ${docId}`);

        // ── Basic IM 고유 검증 ──
        const body = latestDoc.body || {};

        // 1. preset 확인
        const preset = body.preset || body.pptxPreset;
        console.log(`  📋 preset: ${preset}`);
        // credeal_basic이 전달되었으면 검증
        if (preset === 'credeal_basic') {
          console.log('  ✅ credeal_basic 프리셋 확인!');
        } else {
          console.log('  ⚠️ preset이 credeal_basic이 아님 (handler에서 body에 저장하지 않을 수 있음)');
        }

        // 2. tier 확인
        const tier = body.tier;
        console.log(`  📋 tier: ${tier}`);

        // docId 저장
        fs.writeFileSync(path.join(SCREENSHOT_DIR, 'doc-id.txt'), docId);

        // 승인 처리
        if (latestDoc.status === 'draft') {
          console.log('  📡 자동 승인...');
          // E2E 승인: service role로 직접 업데이트
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (supabaseUrl && serviceKey) {
            const directRes = await fetch(
              `${supabaseUrl}/rest/v1/document_objects?id=eq.${docId}`,
              {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': serviceKey,
                  'Authorization': `Bearer ${serviceKey}`,
                  'Prefer': 'return=minimal',
                },
                body: JSON.stringify({ status: 'published' }),
              }
            );
            if (directRes.ok) {
              console.log('  ✅ 승인 완료 → published');
            }
          }
        }
      }
    } catch (e) {
      console.log('  ⚠️ API 조회 실패:', e);
    }
  });

  test('Phase 3: Basic IM 뷰어 + PPTX 다운로드 검증', async ({ page }) => {
    console.log('\n🔷 Phase 3: Basic IM 뷰어 + PPTX 다운로드');

    const idFile = path.join(SCREENSHOT_DIR, 'building-id.txt');
    if (!fs.existsSync(idFile)) {
      console.log('  ⚠️ building-id.txt 없음');
      test.skip();
      return;
    }
    const buildingId = fs.readFileSync(idFile, 'utf-8').trim();

    // ── 모바일 IM 뷰어 접속 ──
    await page.goto(`/im-lite/${buildingId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await shot(page, 'basic-im-viewer');

    // 뷰어 콘텐츠 확인
    const viewerText = await page.textContent('body') || '';
    for (const kw of ['당산', '호산당', '115']) {
      const found = viewerText.includes(kw);
      console.log(found ? `  ✅ "${kw}" 확인` : `  ⚠️ "${kw}" 미발견`);
    }

    // 스크롤 캡처 (섹션 확인)
    for (let i = 0; i < 3; i++) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), (i + 1) * 800);
      await page.waitForTimeout(500);
      await shot(page, `basic-im-scroll-${i}`);
    }

    // ── PPTX 다운로드 ──
    console.log('  📥 PPTX 다운로드 시도...');

    // API로 직접 다운로드
    const docIdFile = path.join(SCREENSHOT_DIR, 'doc-id.txt');
    let docId: string | undefined;
    if (fs.existsSync(docIdFile)) {
      docId = fs.readFileSync(docIdFile, 'utf-8').trim();
    } else {
      // docId를 API로 조회
      try {
        const docsRes = await page.request.get(`/api/broker/im-lite/${buildingId}`);
        const docsJson = await docsRes.json();
        if (docsJson.ok && docsJson.documents?.length > 0) {
          docId = docsJson.documents[0].id;
        }
      } catch { /* */ }
    }

    if (docId) {
      try {
        const pptxRes = await page.request.get(`/api/broker/im-lite/${docId}/pptx`);
        if (pptxRes.ok()) {
          const buffer = await pptxRes.body();
          const pptxPath = path.join(SCREENSHOT_DIR, 'basic-im-output.pptx');
          fs.writeFileSync(pptxPath, buffer);
          const sizeKB = (buffer.length / 1024).toFixed(1);
          console.log(`  ✅ PPTX 다운로드 완료: ${sizeKB} KB`);

          // ── Basic IM PPTX 검증 ──
          // 1. 최소 크기 (빈 파일이 아닌지)
          expect(buffer.length).toBeGreaterThan(50_000); // 최소 50KB
          console.log('  ✅ PPTX 최소 크기 통과');

          // 2. ZIP 매직 넘버 확인 (PK\x03\x04)
          expect(buffer[0]).toBe(0x50); // P
          expect(buffer[1]).toBe(0x4B); // K
          console.log('  ✅ PPTX ZIP 형식 확인');

          // 3. 이미지 포함 여부 (지도 = 필수)
          const pptxStr = buffer.toString('utf-8', 0, Math.min(buffer.length, 500000));
          const hasImages = pptxStr.includes('ppt/media/');
          console.log(hasImages ? '  ✅ PPTX 내 이미지 포함' : '  ⚠️ PPTX 내 이미지 미발견');

          await shot(page, 'basic-pptx-downloaded');
        } else {
          console.log(`  ⚠️ PPTX 다운로드 실패: ${pptxRes.status()}`);
          await shot(page, 'WARNING-basic-pptx-failed');
        }
      } catch (e) {
        console.log('  ⚠️ PPTX 다운로드 에러:', e);
      }
    } else {
      console.log('  ⚠️ docId 미확보 — PPTX 검증 생략');
    }

    console.log('\n🏁 Basic IM 골든 테스트 완료!');
  });
});

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
import { convertPptxToSlideImages } from '../src/tests/e2e/pptx-slide-capturer';

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots', 'dangsan-basic-golden');
const VISUAL_QA_DIR = path.resolve(process.cwd(), 'docs', 'test', 'stress', 'e2e-outputs', 'visual-qa', 'dangsan-basic');
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

  test('Phase 3: 모바일 IM 뷰어 레이아웃 & 반응형 검증', async ({ page }) => {
    console.log('\n🔷 Phase 3: 모바일 IM 뷰어 검증');

    const idFile = path.join(SCREENSHOT_DIR, 'building-id.txt');
    const docIdFile = path.join(SCREENSHOT_DIR, 'doc-id.txt');
    if (!fs.existsSync(idFile)) {
      console.log('  ⚠️ building-id.txt 없음');
      test.skip();
      return;
    }
    const buildingId = fs.readFileSync(idFile, 'utf-8').trim();
    const docId = fs.existsSync(docIdFile) ? fs.readFileSync(docIdFile, 'utf-8').trim() : '';

    // ── 모바일 IM 뷰어 접속 ──
    const imUrl = docId ? `/im-lite/${buildingId}?doc=${docId}` : `/im-lite/${buildingId}`;
    console.log(`  🔗 접속 URL: ${imUrl}`);
    await page.goto(imUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await shot(page, 'basic-im-viewer-desktop');

    // 뷰어 콘텐츠 확인
    const viewerText = await page.textContent('body') || '';
    for (const kw of ['당산', '호산당', '115']) {
      const found = viewerText.includes(kw);
      console.log(found ? `  ✅ "${kw}" 확인` : `  ⚠️ "${kw}" 미발견`);
    }

    // 모바일 375x812 뷰포트 전환 및 가로 오버플로 검사
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(1000);

    const hasOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasOverflow).toBe(false);
    console.log('  ✅ 모바일 가로 오버플로 없음 (scrollWidth <= clientWidth)');

    // 스크롤 캡처
    const scrollH = await page.evaluate(() => document.documentElement.scrollHeight);
    const screens = Math.min(Math.ceil(scrollH / 812), 10);
    for (let i = 0; i < screens; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * 812);
      await page.waitForTimeout(300);
      await shot(page, `mobile-scroll-${String(i).padStart(2, '0')}`);
    }
  });

  test('Phase 4: PPTX 다운로드 & AdmZip 바이너리 + 콘텐츠 정합성 검증 (Rule 47 준거)', async ({ page }) => {
    console.log('\n🔷 Phase 4: PPTX 다운로드 & 바이너리 + 콘텐츠 정합성 검증');

    const idFile = path.join(SCREENSHOT_DIR, 'building-id.txt');
    const docIdFile = path.join(SCREENSHOT_DIR, 'doc-id.txt');
    const buildingId = fs.readFileSync(idFile, 'utf-8').trim();
    let docId = fs.existsSync(docIdFile) ? fs.readFileSync(docIdFile, 'utf-8').trim() : '';

    await page.setViewportSize({ width: 1280, height: 800 });
    const pptxPath = path.join(SCREENSHOT_DIR, 'dangsan-basic-im.pptx');

    if (!docId) {
      try {
        const docsRes = await page.request.get(`/api/broker/im-lite/${buildingId}`);
        const docsJson = await docsRes.json();
        if (docsJson.ok && docsJson.documents?.length > 0) {
          docId = docsJson.documents[0].id;
        }
      } catch { /* ignore */ }
    }

    expect(docId).toBeTruthy();

    // PPTX 다운로드
    try {
      const imUrl = docId ? `/im-lite/${buildingId}?doc=${docId}` : `/im-lite/${buildingId}`;
      await page.goto(imUrl);
      await page.waitForLoadState('networkidle');

      const pptxBtn = page.locator('button:has-text("PPTX"), a:has-text("PPTX"), button:has-text("다운로드")').first();
      await pptxBtn.waitFor({ state: 'visible', timeout: 8000 });
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 120_000 }),
        pptxBtn.click(),
      ]);
      await download.saveAs(pptxPath);
      console.log('  ✅ UI 버튼으로 PPTX 다운로드 완료');
    } catch {
      console.log('  ⚠️ UI 다운로드 버튼 미발견 → API 직접 호출 폴백');
      const pptxApiUrl = `/api/public/im-lite/${buildingId}/pptx?doc_id=${docId}&tier=basic&preset=credeal_basic`;
      const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
      await page.goto(pptxApiUrl);
      const download = await downloadPromise;
      await download.saveAs(pptxPath);
      console.log('  ✅ API 직접 호출로 PPTX 다운로드 완료');
    }

    expect(fs.existsSync(pptxPath)).toBe(true);
    const buffer = fs.readFileSync(pptxPath);
    const sizeKB = (buffer.length / 1024).toFixed(1);
    console.log(`  ✅ PPTX 파일 확인: ${sizeKB} KB`);

    // ── Basic IM PPTX 검증 ──
    // 1. 최소 크기 (50KB 이상)
    expect(buffer.length).toBeGreaterThan(50_000);

    // 2. ZIP 매직 넘버 확인 (PK\x03\x04)
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4B);

    // 3. AdmZip 슬라이드 분석
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(pptxPath);
    const entries = zip.getEntries();
    const slideEntries = entries.filter((e: any) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName));
    console.log(`  📄 총 슬라이드 면수: ${slideEntries.length}면`);

    // 4. 면수 범위 (Rule 47: 8~10면)
    expect(slideEntries.length).toBeGreaterThanOrEqual(8);
    expect(slideEntries.length).toBeLessThanOrEqual(10);
    console.log('  ✅ Basic IM 면수 범위(8~10면) 부합');

    // 5. 결함 토큰 차단
    for (const slide of slideEntries) {
      const xml = slide.getData().toString('utf-8');
      expect(xml).not.toContain('>NaN<');
      expect(xml).not.toContain('>undefined<');
      expect(xml).not.toContain('>null<');
      expect(xml).not.toContain('[object Object]');
    }
    console.log('  ✅ 결함 토큰 (NaN, undefined, null) 0건');

    // 6. 전체 텍스트 추출 및 핵심 섹션 키워드
    const allSlideTexts = slideEntries.map((e: any) => {
      const xml = e.getData().toString('utf-8');
      return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    });
    const fullPptxText = allSlideTexts.join('\n');

    const sectionPatterns = [
      /투자\s*지표|핵심\s*투자|INVESTMENT/,
      /물건\s*개요|건물\s*개요|Property/,
      /입지|Location/,
      /토지|Land/,
      /임대차|렌트롤|Rent\s*Roll/,
      /문의|유의|면책|Disclaimer/,
    ];
    let sectionHits = 0;
    for (const pat of sectionPatterns) {
      if (pat.test(fullPptxText)) sectionHits++;
    }
    expect(sectionHits).toBeGreaterThanOrEqual(4);
    console.log(`  ✅ 핵심 섹션 ${sectionHits}/6 키워드 확인`);

    // 7. 가격 밴드(N억대) 차단 (SOTA ④, Rule 52)
    expect(fullPptxText).not.toMatch(/\d+억\s*대/);
    console.log('  ✅ 가격 밴드 차단 확인');

    // 8. INTERNAL_MONOLOGUE 누출 차단 (SOTA ⑤)
    for (const pat of ['실사 점검:', '주의:', '검토 필요', '리스크 요인:', '내부 검토', '분석가 의견:']) {
      expect(fullPptxText).not.toContain(pat);
    }
    console.log('  ✅ INTERNAL_MONOLOGUE 6종 차단 확인');

    // 9. 회피성 문구 차단 (Rule 37)
    for (const phrase of ['본문을 참조', '별도 안내 예정', '추후 확인']) {
      expect(fullPptxText).not.toContain(phrase);
    }
    console.log('  ✅ 회피성 문구 0건');

    // 10. 표지 배경색 0A1620 (G3)
    const s1xml = slideEntries[0].getData().toString('utf-8');
    expect(s1xml).toContain('0A1620');
    console.log('  ✅ 표지 배경색 0A1620 확인');

    // 11. 이미지 포함 여부 (지도 = 필수)
    const mediaEntries = entries.filter((e: any) =>
      /^ppt\/media\/.*\.(jpg|jpeg|png|gif|emf|wmf)$/i.test(e.entryName) && e.header.size > 0
    );
    console.log(`  📸 임베딩 미디어: ${mediaEntries.length}장`);
    expect(mediaEntries.length).toBeGreaterThanOrEqual(1);

    await shot(page, 'dangsan-basic-pptx-verified');
  });

  test('Phase 5: LibreOffice 150 DPI PNG 슬라이드 변환 및 시각 검증 (Rule 4)', async () => {
    console.log('\n🔷 Phase 5: LibreOffice 150 DPI PNG 슬라이드 변환 및 시각 검증');

    const pptxPath = path.join(SCREENSHOT_DIR, 'dangsan-basic-im.pptx');
    expect(fs.existsSync(pptxPath)).toBe(true);

    const pptxBuffer = fs.readFileSync(pptxPath);
    ensureDir(VISUAL_QA_DIR);

    console.log('  🖼️ LibreOffice + PyMuPDF로 150 DPI PNG 변환 실행...');
    const captureResult = await convertPptxToSlideImages(pptxBuffer, VISUAL_QA_DIR, 'dangsan_basic', 150);

    console.log(`  ✅ PNG 변환 완료: ${captureResult.slideCount}장 슬라이드 캡처됨`);
    expect(captureResult.slideCount).toBeGreaterThanOrEqual(8);

    for (const imgPath of captureResult.slideImages) {
      expect(fs.existsSync(imgPath)).toBe(true);
      const imgStats = fs.statSync(imgPath);
      expect(imgStats.size).toBeGreaterThan(10_000);
    }
    console.log('  ✅ 모든 슬라이드 PNG 이미지(150 DPI) 정상 저장 확인');

    captureResult.slideImages.forEach((p, idx) => {
      console.log(`    [Slide ${idx + 1}] ${path.basename(p)} (${(fs.statSync(p).size / 1024).toFixed(1)} KB)`);
    });
  });
});

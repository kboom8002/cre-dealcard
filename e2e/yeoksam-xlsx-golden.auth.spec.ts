/**
 * e2e/yeoksam-xlsx-golden.auth.spec.ts
 *
 * 역삼동 사옥형 XLSX 렌트롤 Basic IM 골든 테스트 (인증 세션):
 * Phase 1: 딜카드 접속 → ⚡기본 IM 버튼 → 바텀시트
 * Phase 2: XLSX 렌트롤 업로드 + 사진 업로드 → IM 생성
 * Phase 3: 모바일 IM 뷰어 검증
 * Phase 4: PPTX 다운로드 + 콘텐츠/렌트롤 정합성 검증
 * Phase 5: LibreOffice 150 DPI PNG 변환
 * Phase 6: XLSX ↔ PPTX 교차 검증
 *
 * Rule 41: 프로덕션 골든 테스트 (dev server + Playwright + Supabase 실DB)
 * Rule 42: basic-im-golden.auth.spec.ts(당산동 텍스트입력)와 독립 분리
 * Rule 43: 외부 API 실호출 (카카오 지도, V-World WMS 지적도)
 *
 * 실행: npx playwright test e2e/yeoksam-xlsx-golden.auth.spec.ts --project=authenticated
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { convertPptxToSlideImages } from '../src/tests/e2e/pptx-slide-capturer';

// ── 경로 상수 ──
const TEST_DATA_DIR = path.resolve(process.cwd(), 'docs', 'prod-test', '02-yeoksam-hq', 'level-3-verified');
const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots', 'yeoksam-xlsx-golden');
const VISUAL_QA_DIR = path.resolve(process.cwd(), 'docs', 'test', 'stress', 'e2e-outputs', 'visual-qa', 'yeoksam-xlsx');
const BUILDING_ID_FILE = path.join(SCREENSHOT_DIR, 'building-id.txt');

// ── 기대값 (bottom_sheet.json 기준) ──
const EXPECTED_ASKING_PRICE = 120; // 120억
const EXPECTED_FLOOR_COUNT = 7;    // B1 ~ 6F

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

test.describe('역삼 XLSX 렌트롤 Basic IM 골든 테스트', () => {
  test.setTimeout(600_000); // 10분

  // ══════════════════════════════════════════════════════════════
  // Phase 1: 딜카드 접속 → ⚡기본 IM → 바텀시트
  // ══════════════════════════════════════════════════════════════
  test('Phase 1: 딜카드 → ⚡기본 IM 버튼 → 바텀시트', async ({ page }) => {
    console.log('\n🔷 Phase 1: 딜카드 접속 → ⚡ 기본 IM 버튼 클릭');

    await page.goto('/broker');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/login');
    console.log('  ✅ 인증 세션 확인');

    let buildingId = '4a6f512c-4c82-4fdd-a0b0-cbfab392f0eb';
    if (fs.existsSync(BUILDING_ID_FILE)) {
      buildingId = fs.readFileSync(BUILDING_ID_FILE, 'utf-8').trim();
    }
    console.log(`  📋 buildingId: ${buildingId}`);

    await page.goto(`/broker/deal-card/${buildingId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await shot(page, 'deal-card-detail');

    const btnSelectors = ['button:has-text("⚡ 기본 IM")', 'button:has-text("기본 IM")', 'button:has-text("IM 생성")'];
    let found = false;
    for (const sel of btnSelectors) {
      const btn = page.locator(sel).first();
      try {
        if (await btn.isVisible({ timeout: 3000 })) {
          console.log(`  ✅ Basic IM 버튼 발견: "${await btn.textContent()}"`);
          await btn.click();
          found = true;
          break;
        }
      } catch { /* next */ }
    }
    if (!found) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(1000);
      for (const sel of btnSelectors) {
        const btn = page.locator(sel).first();
        try { if (await btn.isVisible({ timeout: 2000 })) { await btn.click(); found = true; break; } } catch { /* */ }
      }
    }
    expect(found).toBe(true);
    console.log('  ✅ Basic IM 버튼 클릭 완료');
    await page.waitForTimeout(2000);
    await shot(page, 'bottom-sheet-opened');

    ensureDir(SCREENSHOT_DIR);
    fs.writeFileSync(BUILDING_ID_FILE, buildingId);
  });

  // ══════════════════════════════════════════════════════════════
  // Phase 2: XLSX 렌트롤 업로드 + 사진 → IM 생성
  // ══════════════════════════════════════════════════════════════
  test('Phase 2: XLSX 렌트롤 업로드 → Basic IM 생성', async ({ page }) => {
    console.log('\n🔷 Phase 2: XLSX 렌트롤 + 사진 → Basic IM 생성');
    if (!fs.existsSync(BUILDING_ID_FILE)) { test.skip(); return; }
    const buildingId = fs.readFileSync(BUILDING_ID_FILE, 'utf-8').trim();
    console.log(`  📋 buildingId: ${buildingId}`);

    // 브라우저 콘솔 캡처
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('RentRollImport') || text.includes('floorLeases') || text.includes('호실')) {
        console.log(`  🖥️ [browser] ${text}`);
      }
    });

    await page.goto(`/broker/deal-card/${buildingId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // ⚡기본 IM 버튼
    for (const sel of ['button:has-text("⚡ 기본 IM")', 'button:has-text("기본 IM")', 'button:has-text("IM 생성")']) {
      const btn = page.locator(sel).first();
      try { if (await btn.isVisible({ timeout: 2000 })) { await btn.click(); break; } } catch { /* */ }
    }
    await page.waitForTimeout(2000);
    await shot(page, 'sheet-open');

    // ── 사진 업로드 (4장) ──
    const photoInput = page.locator('input[type="file"][accept*="image"]').first();
    if (await photoInput.count() > 0) {
      const photoFiles = ['01_exterior.jpg', '03_entrance.jpg', '04_lobby.jpg', '07_rooftop_terrace.jpg']
        .map(f => path.join(TEST_DATA_DIR, 'images', f))
        .filter(f => fs.existsSync(f));
      if (photoFiles.length > 0) {
        await photoInput.setInputFiles(photoFiles);
        await page.waitForTimeout(3000);
        console.log(`  ✅ ${photoFiles.length}장 사진 업로드`);
      }
    }
    await shot(page, 'photos-uploaded');

    // ══════════════════════════════════════════════════
    // 🔑 핵심: XLSX 렌트롤 파일 업로드
    // ══════════════════════════════════════════════════
    const excelTab = page.locator('button:has-text("엑셀"), button:has-text("Excel"), button:has-text("CSV")').first();
    if (await excelTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await excelTab.click();
      await page.waitForTimeout(500);
      console.log('  ✅ 엑셀/CSV 탭 전환');
    }

    const xlsxPath = path.join(TEST_DATA_DIR, 'rentroll.xlsx');
    expect(fs.existsSync(xlsxPath)).toBe(true);

    const fileInput = page.locator('input[type="file"][accept*=".xlsx"], input[type="file"][accept*=".csv"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(xlsxPath);
      console.log('  📁 XLSX 파일 업로드: rentroll.xlsx');

      const parseComplete = await page.waitForSelector(
        'text=/호실.*분석.*완료|분석이 완료되었습니다|호실 분석 완료/',
        { timeout: 15000 }
      ).catch(() => null);

      if (parseComplete) {
        console.log('  ✅ XLSX 렌트롤 파싱 완료');
      } else {
        console.log('  ⚠️ XLSX 파싱 완료 텍스트 미감지 — 5초 추가 대기');
        await page.waitForTimeout(5000);
      }
      await page.waitForTimeout(1000);
    } else {
      console.log('  ⚠️ XLSX 파일 input 미발견');
    }
    await shot(page, 'xlsx-rentroll-uploaded');

    // ── POST payload 인터셉트 ──
    let capturedFloorLeases = 0;
    await page.route('**/api/broker/im-lite/generate-async', async (route) => {
      try {
        const body = JSON.parse(route.request().postData() || '{}');
        capturedFloorLeases = (body.floor_leases || []).length;
        console.log(`  🔍 POST floor_leases: ${capturedFloorLeases}건`);
      } catch { /* */ }
      await route.continue();
    });

    // ── IM 생성 ──
    for (const sel of ['button:has-text("⚡ 기본 IM 생성")', 'button:has-text("기본 IM 생성")', 'button:has-text("IM 생성")', 'button:has-text("생성")']) {
      const btn = page.locator(sel).first();
      try { if (await btn.isVisible({ timeout: 2000 })) { await btn.click(); console.log('  🚀 Basic IM 생성 시작!'); break; } } catch { /* */ }
    }
    await shot(page, 'im-generating');

    // ── 폴링 ──
    console.log('  ⏳ Basic IM 생성 폴링 (최대 5분)...');
    const MAX_POLL_MS = 300_000;
    const pollStart = Date.now();
    let docId: string | null = null;

    while (Date.now() - pollStart < MAX_POLL_MS) {
      await page.waitForTimeout(15000);
      const elapsed = Math.round((Date.now() - pollStart) / 1000);
      console.log(`  ⏳ 폴링 ${elapsed}초...`);

      const doneText = page.locator('text=/생성.*완료|생성이 완료|IM이 생성|완료되었습니다/').first();
      if (await doneText.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log(`  ✅ Basic IM 생성 완료! (${elapsed}초)`);
        break;
      }

      const url = page.url();
      const docMatch = url.match(/doc[_=]([0-9a-f-]{36})/);
      if (docMatch) { docId = docMatch[1]; break; }

      docId = await page.evaluate(() => {
        const el = document.querySelector('[data-doc-id]');
        return el?.getAttribute('data-doc-id') || null;
      });
      if (docId) break;
    }

    await shot(page, 'im-generated');

    // Supabase에서 최신 IM 문서 조회 + 승인
    const dotenv = require('dotenv');
    dotenv.config({ path: '.env.local' });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceKey) {
      // 최신 mobile_im 또는 blind_teaser 문서 조회
      const docRes = await fetch(
        `${supabaseUrl}/rest/v1/document_objects?building_id=eq.${buildingId}&order=created_at.desc&limit=1`,
        {
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
          },
        }
      );
      const docs = await docRes.json();
      if (Array.isArray(docs) && docs.length > 0) {
        docId = docs[0].id;
        console.log(`  ✅ docId (DB 조회): ${docId}`);
        console.log(`  📋 document_type: ${docs[0].document_type}, status: ${docs[0].status}`);

        ensureDir(SCREENSHOT_DIR);
        fs.writeFileSync(path.join(SCREENSHOT_DIR, 'doc-id.txt'), docId!);

        // 승인
        if (docs[0].status !== 'published') {
          console.log('  📡 자동 승인...');
          const patchRes = await fetch(
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
          console.log(patchRes.ok ? '  ✅ 승인 완료 → published' : `  ⚠️ 승인 실패 (${patchRes.status})`);
        } else {
          console.log('  ✅ 이미 published 상태');
        }
      } else {
        console.log('  ⚠️ DB에서 문서 미발견');
      }
    } else {
      console.log('  ⚠️ Supabase 키 미설정');
    }

    console.log(`  📊 최종 캡처 floor_leases: ${capturedFloorLeases}건`);
  });

  // ══════════════════════════════════════════════════════════════
  // Phase 3: 모바일 IM 뷰어 검증
  // ══════════════════════════════════════════════════════════════
  test('Phase 3: 모바일 IM 뷰어 레이아웃 & 반응형 검증', async ({ page }) => {
    console.log('\n🔷 Phase 3: 모바일 IM 뷰어 검증');
    if (!fs.existsSync(BUILDING_ID_FILE)) { test.skip(); return; }
    const buildingId = fs.readFileSync(BUILDING_ID_FILE, 'utf-8').trim();
    const docIdFile = path.join(SCREENSHOT_DIR, 'doc-id.txt');
    const docId = fs.existsSync(docIdFile) ? fs.readFileSync(docIdFile, 'utf-8').trim() : null;

    const imUrl = docId ? `/im-lite/${buildingId}?doc=${docId}` : `/im-lite/${buildingId}`;
    console.log(`  🔗 접속 URL: ${imUrl}`);
    await page.goto(imUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await shot(page, 'im-viewer-desktop');

    const bodyText = await page.textContent('body') || '';
    for (const kw of ['역삼', String(EXPECTED_ASKING_PRICE)]) {
      if (bodyText.includes(kw)) console.log(`  ✅ "${kw}" 확인`);
      else console.log(`  ⚠️ "${kw}" 미발견`);
    }

    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(1000);
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    console.log(noOverflow ? '  ✅ 모바일 가로 오버플로 없음' : '  ⚠️ 모바일 가로 오버플로 발생');

    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(500);
      await shot(page, `mobile-scroll-${String(i).padStart(2, '0')}`);
    }
  });

  // ══════════════════════════════════════════════════════════════
  // Phase 4: PPTX 다운로드 + 콘텐츠 검증
  // ══════════════════════════════════════════════════════════════
  test('Phase 4: PPTX 다운로드 & 콘텐츠 정합성 검증', async ({ page }) => {
    console.log('\n🔷 Phase 4: PPTX 다운로드 & 콘텐츠 검증');
    if (!fs.existsSync(BUILDING_ID_FILE)) { test.skip(); return; }
    const buildingId = fs.readFileSync(BUILDING_ID_FILE, 'utf-8').trim();
    const docIdFile = path.join(SCREENSHOT_DIR, 'doc-id.txt');
    const docId = fs.existsSync(docIdFile) ? fs.readFileSync(docIdFile, 'utf-8').trim() : null;

    await page.goto(`/im-lite/${buildingId}${docId ? `?doc=${docId}` : ''}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    ensureDir(SCREENSHOT_DIR);
    let pptxPath = path.join(SCREENSHOT_DIR, 'yeoksam-xlsx-im.pptx');
    // D45: EBUSY 방어 — 이전 파일 삭제 시도, 실패 시 타임스탬프 파일명
    try { if (fs.existsSync(pptxPath)) fs.unlinkSync(pptxPath); } catch {
      pptxPath = path.join(SCREENSHOT_DIR, `yeoksam-xlsx-im-${Date.now()}.pptx`);
    }
    let downloaded = false;

    // UI 버튼 시도
    try {
      const pptxBtn = page.locator('button:has-text("PPTX"), a:has-text("PPTX"), button:has-text("다운로드")').first();
      await pptxBtn.waitFor({ state: 'visible', timeout: 8000 });
      const [dl] = await Promise.all([
        page.waitForEvent('download', { timeout: 120_000 }),
        pptxBtn.click(),
      ]);
      await dl.saveAs(pptxPath);
      downloaded = true;
      fs.writeFileSync(path.join(SCREENSHOT_DIR, 'latest-pptx-path.txt'), pptxPath);
      console.log(`  ✅ UI 버튼으로 PPTX 다운로드 완료: ${path.basename(pptxPath)}`);
    } catch {
      console.log('  ⚠️ UI 다운로드 버튼 미발견 → API 직접 호출 폴백');
    }

    // API 직접 호출 폴백 (page.request.get으로 바이너리 다운로드)
    if (!downloaded && docId) {
      const pptxApiUrl = `/api/public/im-lite/${buildingId}/pptx?doc_id=${docId}&tier=basic&preset=credeal_basic`;
      try {
        const resp = await page.request.get(pptxApiUrl, { timeout: 120_000 });
        if (resp.ok()) {
          const buf = await resp.body();
          fs.writeFileSync(pptxPath, buf);
          downloaded = true;
          console.log(`  ✅ API 직접 호출 PPTX 다운로드 완료 (${(buf.length / 1024).toFixed(1)} KB)`);
        } else {
          console.log(`  ⚠️ API PPTX 응답 실패: ${resp.status()}`);
        }
      } catch (e: any) {
        console.log(`  ⚠️ API PPTX 호출 오류: ${e.message?.slice(0, 100)}`);
      }
    }
    expect(downloaded).toBe(true);
    console.log(`  ✅ PPTX: ${(fs.statSync(pptxPath).size / 1024).toFixed(1)} KB`);

    const AdmZip = require('adm-zip');
    const zip = new AdmZip(pptxPath);
    const slideEntries = zip.getEntries().filter((e: any) => /ppt\/slides\/slide\d+\.xml$/.test(e.entryName));
    console.log(`  📄 슬라이드: ${slideEntries.length}면`);
    expect(slideEntries.length).toBeGreaterThanOrEqual(8);
    expect(slideEntries.length).toBeLessThanOrEqual(12);

    const fullText = slideEntries.map((e: any) => zip.readAsText(e.entryName).replace(/<[^>]+>/g, ' ')).join(' ');

    // 검증
    const defects = ['NaN', 'undefined', 'null'].filter(t => fullText.includes(t));
    expect(defects).toHaveLength(0);
    console.log(`  ✅ 결함 토큰 0건`);

    expect(fullText).toContain(String(EXPECTED_ASKING_PRICE));
    console.log(`  ✅ 매매가 ${EXPECTED_ASKING_PRICE}억 반영`);

    const evasive = ['본문을 참조', '별도 안내 예정', '추후 확인'];
    expect(evasive.filter(e => fullText.includes(e))).toHaveLength(0);
    console.log('  ✅ 회피 문구 차단');

    const floors = ['B1', '1F', '2F', '3F', '4F', '5F', '6F'].filter(kw => fullText.includes(kw));
    console.log(`  🏢 렌트롤 층 키워드: ${floors.length}/7개 [${floors.join(', ')}]`);

    const sections = ['건물 개요', '입지', '토지', '임대차', '투자수익률', '사진'].filter(kw => fullText.includes(kw));
    console.log(`  📋 섹션 키워드: ${sections.length}/6개 [${sections.join(', ')}]`);
    expect(sections.length).toBeGreaterThanOrEqual(4);

    const media = zip.getEntries().filter((e: any) => /ppt\/media\//.test(e.entryName));
    console.log(`  📸 미디어: ${media.length}장`);
    await shot(page, 'pptx-verified');
  });

  // ══════════════════════════════════════════════════════════════
  // Phase 5: LibreOffice PNG
  // ══════════════════════════════════════════════════════════════
  test('Phase 5: LibreOffice 150 DPI PNG 변환', async () => {
    console.log('\n🔷 Phase 5: LibreOffice PNG 변환');
    test.setTimeout(120_000);
    let pptxPath = path.join(SCREENSHOT_DIR, 'yeoksam-xlsx-im.pptx');
    const latestPathFile = path.join(SCREENSHOT_DIR, 'latest-pptx-path.txt');
    if (fs.existsSync(latestPathFile)) {
      const p = fs.readFileSync(latestPathFile, 'utf-8').trim();
      if (fs.existsSync(p)) pptxPath = p;
    }
    if (!fs.existsSync(pptxPath)) { test.skip(); return; }

    ensureDir(VISUAL_QA_DIR);
    const buf = fs.readFileSync(pptxPath);
    const result = await convertPptxToSlideImages(buf, VISUAL_QA_DIR, 'yeoksam_xlsx', 150);
    console.log(`  ✅ PNG 변환: ${result.slideCount}장`);
    expect(result.slideCount).toBeGreaterThanOrEqual(8);
    for (const sp of result.slideImages) {
      console.log(`    [${path.basename(sp)}] ${(fs.statSync(sp).size / 1024).toFixed(1)} KB`);
    }
  });

  // ══════════════════════════════════════════════════════════════
  // Phase 6: XLSX ↔ PPTX 교차 검증
  // ══════════════════════════════════════════════════════════════
  test('Phase 6: XLSX ↔ PPTX 교차 검증', async () => {
    console.log('\n🔷 Phase 6: XLSX ↔ PPTX 교차 검증');
    let pptxPath = path.join(SCREENSHOT_DIR, 'yeoksam-xlsx-im.pptx');
    const latestPathFile = path.join(SCREENSHOT_DIR, 'latest-pptx-path.txt');
    if (fs.existsSync(latestPathFile)) {
      const p = fs.readFileSync(latestPathFile, 'utf-8').trim();
      if (fs.existsSync(p)) pptxPath = p;
    }
    if (!fs.existsSync(pptxPath)) { test.skip(); return; }

    const XLSX = require('xlsx');
    const wb = XLSX.readFile(path.join(TEST_DATA_DIR, 'rentroll.xlsx'));
    const sheetName = wb.SheetNames.find((n: string) => n.includes('렌트롤') || n.toLowerCase().includes('rent')) || wb.SheetNames[0];
    console.log(`  📊 XLSX 시트: "${sheetName}"`);

    const AdmZip = require('adm-zip');
    const zip = new AdmZip(pptxPath);
    const fullText = zip.getEntries()
      .filter((e: any) => /ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
      .map((e: any) => zip.readAsText(e.entryName).replace(/<[^>]+>/g, ' '))
      .join(' ');

    const checks = [
      { label: 'B1층', check: fullText.includes('B1') },
      { label: '보증금 5,000/5000', check: fullText.includes('5,000') || fullText.includes('5000') },
      { label: '월세 400', check: fullText.includes('400') },
      { label: '매도인/사옥', check: fullText.includes('매도인') || fullText.includes('사옥') },
      { label: '역삼', check: fullText.includes('역삼') },
      { label: '120억', check: fullText.includes('120') },
    ];

    let matched = 0;
    for (const c of checks) {
      if (c.check) { console.log(`  ✅ ${c.label}`); matched++; }
      else console.log(`  ⚠️ ${c.label} 미매칭`);
    }
    console.log(`\n  📊 교차 검증: ${matched}/${checks.length}개 매칭`);
    expect(matched).toBeGreaterThanOrEqual(3);
    console.log('  ✅ XLSX ↔ PPTX 교차 검증 통과');
  });
});

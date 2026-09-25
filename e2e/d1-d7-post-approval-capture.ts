/**
 * e2e/d1-d7-post-approval-capture.ts
 * 
 * 승인 후 모바일 IM 뷰어의 개별 섹션을 캡처하는 보완 스크립트
 * tsx로 직접 실행: npx tsx e2e/d1-d7-post-approval-capture.ts
 */
import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'docs', 'test', 'images', 'd1-d7-golden');
const AUTH_FILE = path.resolve(__dirname, '.auth/user.json');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  const buildingId = fs.readFileSync(path.join(SCREENSHOT_DIR, 'building-id.txt'), 'utf-8').trim();
  console.log(`📋 buildingId: ${buildingId}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: AUTH_FILE,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  let step = 12; // 기존 캡처 이어서

  async function shot(label: string, full = false) {
    ensureDir(SCREENSHOT_DIR);
    step++;
    const filePath = path.join(SCREENSHOT_DIR, `${String(step).padStart(2, '0')}-${label}.png`);
    await page.screenshot({ path: filePath, fullPage: full });
    console.log(`📸 [${step}] ${label}`);
    return filePath;
  }

  // ── 1. API로 docId 조회 ──
  await page.goto('http://localhost:3000/broker');
  await page.waitForLoadState('networkidle');

  const docsRes = await page.request.get(`http://localhost:3000/api/broker/im-lite/${buildingId}`);
  const docsJson = await docsRes.json();
  
  if (!docsJson.ok || !docsJson.documents?.length) {
    console.log('❌ IM 문서 미발견');
    await browser.close();
    return;
  }

  const doc = docsJson.documents[0];
  const docId = doc.id;
  console.log(`📄 docId: ${docId}, status: ${doc.status}`);

  // ── 2. 승인 수행 (아직 미승인이면) ──
  if (doc.status !== 'approved' && doc.status !== 'published') {
    console.log('🔓 승인 수행 중...');
    try {
      const approveRes = await page.request.post(
        `http://localhost:3000/api/broker/im-lite/${docId}/approve`,
        {
          data: { confirmed: true, forceApprove: true },
          headers: { 'Content-Type': 'application/json' },
        }
      );
      const approveJson = await approveRes.json();
      console.log(`  승인 결과: ${approveRes.status()} — ${JSON.stringify(approveJson).slice(0, 200)}`);
    } catch (e) {
      console.log(`  ⚠️ 승인 API 실패: ${e}`);
    }
  }

  // ── 3. 모바일 뷰포트로 IM 뷰어 접속 ──
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://localhost:3000/im-lite/${buildingId}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  const bodyText = await page.textContent('body') || '';
  if (bodyText.includes('아직 준비 중')) {
    console.log('⚠️ IM 아직 미발행 — 공개 경로 시도');
    // 직접 im-lite public 뷰 시도
    await page.goto(`http://localhost:3000/api/public/im-lite/${buildingId}`);
    await page.waitForTimeout(2000);
    const apiBody = await page.textContent('body') || '';
    console.log(`  API 응답 (100자): ${apiBody.slice(0, 100)}`);
  }

  await shot('step20-mobile-im-viewer', true);

  // ── 4. 섹션 카드 클릭 & 캡처 ──
  // 섹션 카드는 보통 아코디언 형태 — 섹션 제목 텍스트로 찾기
  const sectionLabels = [
    { id: 'D1-D4', text: '수익', fallback: '딜인가' },
    { id: 'D2-D6', text: '유사 매물', fallback: '비교' },
    { id: 'D7', text: '다음 단계', fallback: '검토 후' },
    { id: 'D3', text: '입지', fallback: '투자할 만한' },
    { id: 'overview', text: '자산인가', fallback: '어떤' },
    { id: 'lease', text: '임대 현황', fallback: '공실' },
    { id: 'risk', text: '리스크', fallback: '대응' },
  ];

  for (const sec of sectionLabels) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    // 섹션 카드 찾기
    let sectionCard = page.locator(`text=${sec.text}`).first();
    let found = await sectionCard.isVisible({ timeout: 2000 }).catch(() => false);

    if (!found) {
      sectionCard = page.locator(`text=${sec.fallback}`).first();
      found = await sectionCard.isVisible({ timeout: 2000 }).catch(() => false);
    }

    if (found) {
      try {
        await sectionCard.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await sectionCard.click();
        await page.waitForTimeout(1500);
        await shot(`section-${sec.id}-expanded`);

        // 추가 스크롤 캡처 (테이블 등 하단 내용)
        await page.evaluate(() => window.scrollBy(0, 500));
        await page.waitForTimeout(500);
        await shot(`section-${sec.id}-detail`);

        console.log(`  ✅ ${sec.id} 섹션 캡처 완료`);
      } catch (e) {
        console.log(`  ⚠️ ${sec.id} 섹션 클릭 실패: ${e}`);
      }
    } else {
      console.log(`  ⚠️ ${sec.id} 섹션 미발견 (text="${sec.text}" / "${sec.fallback}")`);
    }
  }

  // ── 5. 데스크톱 모드 승인 페이지 캡처 (섹션 확장 상태) ──
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`http://localhost:3000/broker/im-approval/${docId}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // 수익 분석 섹션 찾아서 캡처 (D1/D4 검증용)
  const incomeHeading = page.locator('text=수익이 나오는 딜인가').first();
  if (await incomeHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
    await incomeHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await shot('approval-D1-D4-income-section');
    
    // 테이블 아래로 스크롤
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(500);
    await shot('approval-D1-D4-income-table');
  }

  // comparables 섹션 캡처 (D2/D6 검증용)
  const compHeading = page.locator('text=유사 매물').first();
  if (await compHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
    await compHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await shot('approval-D2-D6-comparables');
  }

  // next_steps 섹션 캡처 (D7 검증용)
  const nextHeading = page.locator('text=다음 단계').first();
  if (await nextHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nextHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await shot('approval-D7-next-steps');
  }

  console.log(`\n═══ 보완 캡처 완료 ═══`);
  console.log(`📁 ${SCREENSHOT_DIR}`);
  console.log(`📸 총 캡처: ${step}장`);

  await browser.close();
}

main().catch(console.error);

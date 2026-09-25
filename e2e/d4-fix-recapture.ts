/**
 * D4 수정 검증: IM 재생성 후 수정된 income_analysis 섹션 캡처
 * 
 * 목적: premium-template-engine.ts의 isBasicMode 수정 후
 * WACC/NPV/IRR이 Basic IM에서 사라졌는지 캡처로 증명
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE = 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, '..', 'docs', 'test', 'images', 'd1-d7-golden');
const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');

async function main() {
  if (!fs.existsSync(AUTH_FILE)) {
    console.error('Auth file not found. Run: npx playwright test e2e/auth.setup.ts --project=setup');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: AUTH_FILE,
    viewport: { width: 430, height: 932 }, // iPhone 14 Pro Max
  });
  const page = await context.newPage();

  // 1) 기존 빌딩 ID 읽기
  const buildingIdFile = path.join(OUT_DIR, 'building-id.txt');
  const buildingId = fs.readFileSync(buildingIdFile, 'utf-8').trim();
  console.log(`Building ID: ${buildingId}`);

  // 2) IM 재생성 — 최신 코드(D4 수정 포함)로 새 IM 생성
  console.log('Regenerating IM with fixed code...');
  const genResp = await page.request.post(`${BASE}/api/broker/im-lite/generate-async`, {
    data: {
      building_id: buildingId,
      investment_posture: 'income',
      monthly_rent_total_krw: 19_460_000,
      total_deposit_manwon: 29000,
      asking_price_manwon: 1_150_000,
      vacancy_status: 'full',
      // loan_amount_manwon 미전송 → isBasicMode = true
    },
  });

  if (!genResp.ok()) {
    console.error(`Generate failed: ${genResp.status()} ${await genResp.text()}`);
    // 기존 IM이라도 확인 시도
  } else {
    const genData = await genResp.json();
    const jobId = genData.jobId || genData.job_id;
    console.log(`Job started: ${jobId}`);

    // 3) 생성 완료 대기 (polling)
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const statusResp = await page.request.get(`${BASE}/api/broker/im-lite/generate-async?jobId=${jobId}`);
      if (statusResp.ok()) {
        const statusData = await statusResp.json();
        console.log(`Poll ${i + 1}: status=${statusData.status}`);
        if (statusData.status === 'completed') {
          console.log('IM generation completed!');
          break;
        }
        if (statusData.status === 'failed') {
          console.error('IM generation failed:', statusData.error);
          break;
        }
      }
    }
  }

  // 4) 승인 페이지 열기 — 최신 IM 문서 조회
  console.log('Finding latest IM document...');
  const imResp = await page.request.get(`${BASE}/api/public/im-lite/${buildingId}`);
  if (!imResp.ok()) {
    console.error(`Failed to get IM: ${imResp.status()}`);
    await browser.close();
    return;
  }
  const imData = await imResp.json();
  const docId = imData.data?.id || imData.data?.docId;
  console.log(`Doc ID: ${docId}`);

  // 5) income_analysis 마크다운에서 WACC/NPV/IRR 확인
  const sections = imData.data?.sections || [];
  const incomeSection = sections.find((s: any) => s.section_type === 'income_analysis');
  if (incomeSection) {
    const md = incomeSection.markdown || '';
    const hasWACC = md.includes('WACC');
    const hasNPV = md.includes('NPV');
    const hasIRR = /IRR/.test(md);
    console.log(`\n=== D4 검증 ===`);
    console.log(`WACC in markdown: ${hasWACC} ${hasWACC ? '❌ FAIL' : '✅ PASS'}`);
    console.log(`NPV in markdown:  ${hasNPV} ${hasNPV ? '❌ FAIL' : '✅ PASS'}`);
    console.log(`IRR in markdown:  ${hasIRR} ${hasIRR ? '❌ FAIL' : '✅ PASS'}`);
    
    // 검증 결과 저장
    fs.writeFileSync(path.join(OUT_DIR, 'd4-verification-result.json'), JSON.stringify({
      timestamp: new Date().toISOString(),
      docId,
      buildingId,
      d4_wacc_absent: !hasWACC,
      d4_npv_absent: !hasNPV,
      d4_irr_absent: !hasIRR,
      d4_all_pass: !hasWACC && !hasNPV && !hasIRR,
    }, null, 2));
  }

  // 6) 승인 페이지 스크린 캡처
  if (docId) {
    const approvalUrl = `${BASE}/broker/im-approval/${docId}`;
    console.log(`\nNavigating to approval page: ${approvalUrl}`);
    await page.goto(approvalUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 풀페이지 승인 캡처
    await page.screenshot({
      path: path.join(OUT_DIR, '12-step19-approval-page-v2.png'),
      fullPage: true,
    });
    console.log('Captured: 12-step19-approval-page-v2.png');

    // income_analysis 섹션 찾아서 캡처
    // 섹션 제목 "내 돈 넣으면 수익이 나오는 얼인가" 찾기
    const incomeHeading = page.locator('text=내 돈 넣으면 수익이 나오는 얼인가').first()
      .or(page.locator('text=수익이 나오는').first())
      .or(page.locator('text=income_analysis').first());

    try {
      // 섹션이 보일 때까지 스크롤
      const allSections = page.locator('[class*="section"], [class*="card"], article, [data-section]');
      const sectionCount = await allSections.count();
      console.log(`Found ${sectionCount} section elements`);

      // income_analysis 관련 영역을 넓게 캡처
      // 마크다운 테이블이 포함된 영역을 찾음
      const capRateEl = page.locator('text=Cap Rate').first();
      if (await capRateEl.isVisible({ timeout: 5000 })) {
        await capRateEl.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);

        // Cap Rate가 보이는 영역 주변 넓은 영역 캡처
        const box = await capRateEl.boundingBox();
        if (box) {
          // 테이블 전체를 포함하도록 넓은 영역 캡처 (위로 200px, 아래로 600px)
          const clipY = Math.max(0, box.y - 200);
          await page.screenshot({
            path: path.join(OUT_DIR, '28-approval-D1-D4-income-section-v2.png'),
            clip: { x: 0, y: clipY, width: 430, height: 600 },
          });
          console.log('Captured: 28-approval-D1-D4-income-section-v2.png');

          // 테이블 하단까지 (WACC/NPV/IRR이 없어야 하는 영역)
          await page.screenshot({
            path: path.join(OUT_DIR, '29-approval-D1-D4-income-table-v2.png'),
            clip: { x: 0, y: clipY, width: 430, height: 900 },
          });
          console.log('Captured: 29-approval-D1-D4-income-table-v2.png');
        }
      } else {
        console.log('Cap Rate element not visible, capturing full approval page');
      }

      // comparables + next_steps 섹션 재캡처
      const compEl = page.locator('text=유사 매물').first()
        .or(page.locator('text=비교').first());
      if (await compEl.isVisible({ timeout: 3000 })) {
        await compEl.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        const box = await compEl.boundingBox();
        if (box) {
          await page.screenshot({
            path: path.join(OUT_DIR, '30-approval-D2-D6-comparables-v2.png'),
            clip: { x: 0, y: Math.max(0, box.y - 50), width: 430, height: 500 },
          });
          console.log('Captured: 30-approval-D2-D6-comparables-v2.png');
        }
      }

      // next_steps 섹션
      const nextEl = page.locator('text=다음 단계').first();
      if (await nextEl.isVisible({ timeout: 3000 })) {
        await nextEl.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        const box = await nextEl.boundingBox();
        if (box) {
          await page.screenshot({
            path: path.join(OUT_DIR, '31-approval-D7-next-steps-v2.png'),
            clip: { x: 0, y: Math.max(0, box.y - 50), width: 430, height: 500 },
          });
          console.log('Captured: 31-approval-D7-next-steps-v2.png');
        }
      }
    } catch (err) {
      console.error('Section capture error:', err);
      // fallback: 풀페이지라도 캡처
    }
  }

  await browser.close();
  console.log('\n✅ Done! Check docs/test/images/d1-d7-golden/ for v2 screenshots.');
}

main().catch(console.error);

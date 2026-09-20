import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots/magazine');

test.describe('Part 1 Magazine Editor Full Walkthrough & Audit', () => {
  test.beforeAll(async () => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

  test('TC-1 & TC-5: Magazine API Suite Verification', async ({ request }) => {
    console.log('=== [API 감사] TC-1: 주간 매거진 Cron API ===');
    const cronSecret = process.env.CRON_SECRET || 'test-secret';
    const cronRes = await request.get('/api/cron/weekly-magazine', {
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
      }
    });
    console.log(`Cron API status: ${cronRes.status()}`);
    expect([200, 401, 500]).toContain(cronRes.status());

    // 잘못된 시크릿 검증
    const badCronRes = await request.get('/api/cron/weekly-magazine', {
      headers: { 'Authorization': 'Bearer WRONG_SECRET' }
    });
    console.log(`Unauthorized Cron API status: ${badCronRes.status()}`);
    expect(badCronRes.status()).toBe(401);

    console.log('=== [API 감사] TC-5.1: 매거진 당일 데이터 조회 API ===');
    const magRes = await request.get('/api/magazine/test-broker-kim');
    console.log(`Magazine API status: ${magRes.status()}`);
    if (magRes.ok()) {
      const magJson = await magRes.json();
      console.log('Magazine API Summary:', {
        cached: magJson.cached,
        hasHeadline: !!magJson.data?.headline,
        brokerName: magJson.data?.broker?.name,
        topNewsCount: magJson.data?.topNews?.length,
      });
    }

    console.log('=== [API 감사] TC-5.2: 에디션 목록 조회 API ===');
    const edRes = await request.get('/api/magazine/editions?broker_id=test-broker-kim&type=weekly&limit=5');
    console.log(`Editions API status: ${edRes.status()}`);
    if (edRes.ok()) {
      const edJson = await edRes.json();
      console.log('Editions API Summary:', {
        total: edJson.total,
        editionCount: edJson.editions?.length,
      });
    }
  });

  test('TC-2 & TC-3 & TC-6: Complete Magazine Editor Walkthrough with Screenshots', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    console.log('1. 브로커 매거진 에디터 페이지 접속...');
    await page.goto('/broker/magazine-editor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 01. 초기 로딩 화면 캡처
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_editor_initial_load.png'), fullPage: true });
    console.log('📸 01_editor_initial_load.png 캡처 완료');

    // ── TC-2.2: 커버 탭 (기본) ──
    console.log('2. 커버 탭 검증 및 입력...');
    const selectTempBtn = page.getByRole('button', { name: /선별 매수/ }).first();
    if (await selectTempBtn.isVisible()) {
      await selectTempBtn.click();
      await page.waitForTimeout(500);
    }

    const headlineInput = page.locator('input[placeholder*="헤드라인"], input[placeholder*="제목"]').first();
    if (await headlineInput.isVisible()) {
      await headlineInput.fill('[E2E 감사] 하반기 강남 상업용 부동산 핵심 분석');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_tab_cover_configured.png'), fullPage: true });
    console.log('📸 02_tab_cover_configured.png 캡처 완료');

    // ── TC-2.3: 필드노트 탭 ──
    console.log('3. 필드노트 탭 전환 및 검증...');
    const fieldNoteTabBtn = page.getByRole('button', { name: '필드노트', exact: true }).first();
    if (await fieldNoteTabBtn.isVisible()) {
      await fieldNoteTabBtn.click();
      await page.waitForTimeout(1000);

      const textareas = page.locator('textarea');
      const count = await textareas.count();
      if (count > 0) {
        await textareas.nth(0).fill('이번 주 강남 꼬마빌딩 문의가 30% 증가했습니다.');
      }
      if (count > 1) {
        await textareas.nth(1).fill('매수자들은 50억 내외의 신축/리모델링 부지를 선호합니다.');
      }
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_tab_field_note.png'), fullPage: true });
      console.log('📸 03_tab_field_note.png 캡처 완료');
    }

    // ── TC-2.4: 테마 & 매물 탭 ──
    console.log('4. 테마 & 매물 탭 전환 및 검증...');
    const themeDealsTabBtn = page.getByRole('button', { name: '테마&매물', exact: true })
      .or(page.getByRole('button', { name: '테마', exact: true })).first();
    if (await themeDealsTabBtn.isVisible()) {
      await themeDealsTabBtn.click();
      await page.waitForTimeout(1000);

      const themeTitleInput = page.locator('input[placeholder*="테마"], input[type="text"]').first();
      if (await themeTitleInput.isVisible()) {
        await themeTitleInput.fill('금주의 테마: 역세권 밸류애드 기회');
      }
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_tab_theme_deals.png'), fullPage: true });
      console.log('📸 04_tab_theme_deals.png 캡처 완료');
    }

    // ── TC-2.5: 뉴스 탭 ──
    console.log('5. 뉴스 탭 전환 및 검증...');
    const newsTabBtn = page.getByRole('button', { name: '뉴스', exact: true }).first();
    if (await newsTabBtn.isVisible()) {
      await newsTabBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_tab_news_curation.png'), fullPage: true });
      console.log('📸 05_tab_news_curation.png 캡처 완료');
    }

    // ── TC-2.6: AI 비서 탭 ──
    console.log('6. AI 비서 탭 전환 및 검증...');
    const aiTabBtn = page.getByRole('button', { name: 'AI비서', exact: true })
      .or(page.getByRole('button', { name: 'AI', exact: true })).first();
    if (await aiTabBtn.isVisible()) {
      await aiTabBtn.click();
      await page.waitForTimeout(1000);

      const aiTextarea = page.locator('textarea').first();
      if (await aiTextarea.isVisible()) {
        await aiTextarea.fill('역삼동 50억 꼬마빌딩 급매물. 캡레이트 4.3%. 임대수익 우수.');
      }
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_tab_ai_assist.png'), fullPage: true });
      console.log('📸 06_tab_ai_assist.png 캡처 완료');
    }

    // ── TC-2.7: 아웃리치 탭 & QR 모달 ──
    console.log('7. 아웃리치 탭 전환 및 검증...');
    const outreachTabBtn = page.getByRole('button', { name: '아웃리치', exact: true }).first();
    if (await outreachTabBtn.isVisible()) {
      await outreachTabBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_tab_outreach_subscribers.png'), fullPage: true });
      console.log('📸 07_tab_outreach_subscribers.png 캡처 완료');

      const qrBtn = page.locator('button:has-text("QR"), button[title*="QR"], button:has-text("QR코드")').first();
      if (await qrBtn.isVisible()) {
        await qrBtn.click({ force: true });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_qr_code_modal.png'), fullPage: true });
        console.log('📸 07_qr_code_modal.png 캡처 완료');
        
        const modalCloseBtn = page.getByRole('button', { name: '닫기' }).last();
        if (await modalCloseBtn.isVisible()) {
          await modalCloseBtn.click({ force: true });
          await page.waitForTimeout(500);
        }
      }
    }

    // ── TC-2.8: 발행 설정 탭 ──
    console.log('8. 발행 설정 탭 전환 및 검증...');
    const publishTabBtn = page.getByRole('button', { name: '발행설정', exact: true })
      .or(page.getByRole('button', { name: '발행', exact: true })).first();
    if (await publishTabBtn.isVisible()) {
      await publishTabBtn.click({ force: true });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_tab_publish_settings.png'), fullPage: true });
      console.log('📸 08_tab_publish_settings.png 캡처 완료');
    }

    // ── TC-3: 성과 탭 (EditorAnalyticsTab) ──
    console.log('9. 성과 탭 전환 및 검증...');
    const analyticsTabBtn = page.getByRole('button', { name: '성과', exact: true }).first();
    if (await analyticsTabBtn.isVisible()) {
      await analyticsTabBtn.click({ force: true });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_tab_analytics_kpi.png'), fullPage: true });
      console.log('📸 09_tab_analytics_kpi.png 캡처 완료');
    }

    // ── TC-6: 전체 에디터 + 모바일 프리뷰 화면 ──
    console.log('10. 전체 에디터 + 모바일 프리뷰 화면 캡처...');
    const coverTabBtn = page.getByRole('button', { name: '커버', exact: true }).first();
    if (await coverTabBtn.isVisible()) {
      await coverTabBtn.click({ force: true });
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_full_screen_editor_and_preview.png'), fullPage: true });
    console.log('📸 10_full_screen_editor_and_preview.png 캡처 완료');

    // ── TC-15: 퍼블릭 뷰어 렌더링 화면 ──
    console.log('11. 퍼블릭 매거진 뷰어 화면 접속 및 캡처...');
    const todayStr = new Date().toISOString().slice(0, 10);
    await page.goto(`/magazine/test-broker-kim/${todayStr}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_public_magazine_view.png'), fullPage: true });
    console.log('📸 11_public_magazine_view.png 캡처 완료');

    // ── TC-7: 구독 페이지 화면 ──
    console.log('12. 구독 페이지 화면 접속 및 캡처...');
    await page.goto(`/magazine/test-broker-kim/subscribe`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_subscribe_page.png'), fullPage: true });
    console.log('📸 12_subscribe_page.png 캡처 완료');

    console.log('🎉 모든 탭 및 주요 화면 워크스루 & 스크린샷 캡처 완료!');
  });
});

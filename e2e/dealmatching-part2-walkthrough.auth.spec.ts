import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots/dealmatching_part2');

const FX_10_CIRCLE_NAME = "강남 꼬마빌딩 공동중개방";
const FX_10_CIRCLE_DESC = "강남·서초 권역 꼬마빌딩 매물과 매수자를 공유하는 방입니다.";

test.describe('DealMatching Part 2 E2E Walkthrough', () => {
  test.beforeAll(async () => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

  test.use({ viewport: { width: 1440, height: 900 } });

  test('TC-13: 서클 생성', async ({ page }) => {
    console.log('--- TC-13: Circle Creation ---');
    await page.goto('/broker/circles', { waitUntil: 'networkidle' });
    
    // 서클 생성 페이지로 이동 버튼 클릭
    const createBtn = page.locator('text=새 서클 만들기').or(page.locator('a[href="/broker/circles/new"]')).first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
    } else {
      await page.goto('/broker/circles/new', { waitUntil: 'networkidle' });
    }
    
    await expect(page).toHaveURL(/\/broker\/circles\/new/);
    
    // 폼 입력
    await page.locator('input').fill(FX_10_CIRCLE_NAME);
    await page.locator('textarea').fill(FX_10_CIRCLE_DESC);
    
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tc13_01_circle_create_form.png') });
    
    // 생성 버튼 클릭
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();
    
    // 서클 상세 페이지로 이동 대기 (new가 아닌 uuid)
    await page.waitForURL(/\/broker\/circles\/[0-9a-fA-F]{8}-/, { timeout: 15000 });
    
    // 결과 확인
    await page.waitForSelector(`text=${FX_10_CIRCLE_NAME}`, { timeout: 10000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tc13_02_circle_detail.png'), fullPage: true });
  });

  test('TC-14: 초대 링크 생성 팝업 확인', async ({ page }) => {
    console.log('--- TC-14: Invite Link ---');
    // 현재 서클 상세 페이지 유지
    
    const inviteBtn = page.locator('button:has-text("멤버 초대")');
    if (await inviteBtn.isVisible()) {
      await inviteBtn.click();
      
      // 다이얼로그나 시트가 열릴 때까지 대기
      await page.waitForSelector('text=초대 링크 생성', { timeout: 5000 }).catch(() => {});
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tc14_01_invite_dialog.png') });
      
      // 닫기
      await page.keyboard.press('Escape');
    }
  });

  test('TC-15: 매물 공유 (Building)', async ({ page }) => {
    console.log('--- TC-15: Share Building to Circle ---');
    
    // 가장 최근 매물로 이동
    await page.goto('/broker/buildings', { waitUntil: 'networkidle' });
    const firstBuilding = page.locator('a[href^="/broker/deal-card/"]').first();
    await expect(firstBuilding).toBeVisible();
    await firstBuilding.click();
    
    // 딜카드 상세 페이지
    await page.waitForURL(/\/broker\/deal-card\/[a-zA-Z0-9-]+/, { timeout: 10000 });
    
    // 공유 버튼 찾기
    const shareBtn = page.locator('button:has-text("서클에 공유")').or(page.locator('button[aria-label="Share"]'));
    if (await shareBtn.isVisible()) {
      await shareBtn.click();
      
      // 공유 시트나 다이얼로그 대기
      await page.waitForSelector('text=서클 선택', { timeout: 5000 }).catch(() => {});
      
      // 생성했던 서클 선택
      const circleCheckbox = page.locator(`text=${FX_10_CIRCLE_NAME}`);
      if (await circleCheckbox.isVisible()) {
        await circleCheckbox.click();
        await page.locator('button:has-text("공유하기")').click();
      }
      
      // 토스트 메시지나 성공 상태 대기
      await page.waitForTimeout(2000);
    }
    
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tc15_01_share_building.png'), fullPage: true });
  });
  
  test('TC-16: 매수의향 공유 (Buyer Intent)', async ({ page }) => {
    console.log('--- TC-16: Share Buyer Intent to Circle ---');
    
    // 가장 최근 매수의향으로 이동
    await page.goto('/broker/buyer-intents', { waitUntil: 'networkidle' });
    const firstIntent = page.locator('a[href^="/broker/buyer-intents/"]').first();
    
    if (await firstIntent.isVisible()) {
      await firstIntent.click();
      
      // 상세 페이지 대기
      await page.waitForURL(/\/broker\/buyer-intents\/[a-zA-Z0-9-]+/, { timeout: 10000 });
      
      // 공유 버튼 찾기
      const shareBtn = page.locator('button:has-text("서클에 공유")');
      if (await shareBtn.isVisible()) {
        await shareBtn.click();
        
        const circleCheckbox = page.locator(`text=${FX_10_CIRCLE_NAME}`);
        if (await circleCheckbox.isVisible()) {
          await circleCheckbox.click();
          await page.locator('button:has-text("공유하기")').click();
        }
        await page.waitForTimeout(2000);
      }
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tc16_01_share_intent.png'), fullPage: true });
    }
  });

  test('TC-17: 서클 교차 매칭 대시보드 확인', async ({ page }) => {
    console.log('--- TC-17: Circle Cross Match Dashboard ---');
    
    // 서클 목록으로 이동
    await page.goto('/broker/circles', { waitUntil: 'networkidle' });
    const circleLink = page.locator(`text=${FX_10_CIRCLE_NAME}`).first();
    if (await circleLink.isVisible()) {
      await circleLink.click();
      await page.waitForURL(/\/broker\/circles\/[a-zA-Z0-9-]+/, { timeout: 10000 });
      
      // 서클 탭 중 '매칭' 탭 클릭
      const matchTab = page.locator('button:has-text("교차 매칭")').or(page.locator('a:has-text("매칭")'));
      if (await matchTab.isVisible()) {
        await matchTab.click();
      }
      
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tc17_01_circle_dashboard.png'), fullPage: true });
    }
  });
});

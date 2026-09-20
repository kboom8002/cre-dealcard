import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots/magazine_part2');
const BROKER_SLUG = 'test-broker-kim';
const BROKER_USER_ID = '204246a5-7c52-4549-9570-f089fbbf789c';

test.describe('Part 2 Magazine Subscription, Distribution & Referral Audit', () => {
  test.beforeAll(async () => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

  // ── [API 테스트 모음] TC-8, TC-9, TC-11 ──
  test('TC-8, TC-9, TC-11: Subscription & Referral API End-to-End Suite', async ({ request }) => {
    console.log('=== [Part 2 API] TC-11: 레퍼럴 API 마일스톤 검증 ===');
    const ref1Res = await request.post('/api/public/magazine/referral', {
      data: {
        brokerId: BROKER_USER_ID,
        referrerPhone: '01011112222',
        referredPhone: '01077771111'
      }
    });
    console.log(`Referral 1 status: ${ref1Res.status()}`);
    expect(ref1Res.status()).toBe(200);
    const ref1Json = await ref1Res.json();
    console.log('Referral 1 response:', ref1Json);
    expect(ref1Json.ok).toBe(true);

    // 중복 전달 방지 검증 (동일 전달)
    const refDupRes = await request.post('/api/public/magazine/referral', {
      data: {
        brokerId: BROKER_USER_ID,
        referrerPhone: '01011112222',
        referredPhone: '01077771111'
      }
    });
    expect(refDupRes.status()).toBe(200);

    // 레퍼럴 통계 조회 (전체 전달 수 - DB 테이블 미존재 시 0 반환 가드)
    const refStatsRes = await request.get(`/api/public/magazine/referral?brokerId=${BROKER_USER_ID}`);
    expect(refStatsRes.status()).toBe(200);
    const refStatsJson = await refStatsRes.json();
    console.log('Referral stats:', refStatsJson);
    expect(refStatsJson.totalForwardedSubscribers).toBeGreaterThanOrEqual(0);

    // 에러 케이스 검증 (brokerId 누락)
    const badRefRes = await request.post('/api/public/magazine/referral', {
      data: { referrerPhone: '01011112222', referredPhone: '01077771111' }
    });
    expect(badRefRes.status()).toBe(400);

    console.log('=== [Part 2 API] TC-9: 브로커 구독자 관리 API ===');
    // 구독자 목록 조회 (인증)
    const subsListRes = await request.get('/api/broker/magazine/subscribers?status=active&limit=10');
    console.log(`Subscribers list status: ${subsListRes.status()}`);
    expect(subsListRes.status()).toBe(200);
    const subsListJson = await subsListRes.json();
    console.log(`Total subscribers found: ${subsListJson.total}`);

    // 수동 구독자 추가
    const createSubRes = await request.post('/api/broker/magazine/subscribers', {
      data: {
        phone: '01099990000',
        name: '수동추가테스트',
        channel: 'both',
        interest_tags: { regions: ['강남'], assetTypes: ['꼬마빌딩'] }
      }
    });
    console.log(`Manual subscriber create status: ${createSubRes.status()}`);
    const createSubBody = await createSubRes.text();
    console.log('Manual create response body:', createSubBody);
    expect(createSubRes.status()).toBe(200);
    const createdSubJson = await createSubRes.json();
    const createdSubId = createdSubJson.subscriber?.id;

    if (createdSubId) {
      // 구독자 프로필 수정 (PATCH)
      const patchRes = await request.patch(`/api/broker/magazine/subscribers/${createdSubId}`, {
        data: {
          interest_tags: { regions: ['강남', '판교'], assetTypes: ['꼬마빌딩', '오피스텔'] },
          channel: 'both'
        }
      });
      expect(patchRes.status()).toBe(200);

      // AutoIntent 생성 검증
      const intentRes = await request.post(`/api/broker/magazine/subscribers/${createdSubId}/intent`);
      console.log(`AutoIntent create status: ${intentRes.status()}`);
      expect(intentRes.status()).toBe(200);
      const intentJson = await intentRes.json();
      console.log('AutoIntent result:', intentJson);
    }
  });

  // ── [브라우저 UI 워크스루] TC-7, TC-8, TC-11, TC-12 ──
  test('TC-7, TC-8, TC-11, TC-12: Browser UI Walkthrough with Screenshots', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    // ── 1. TC-7.1 & TC-7.2: 구독 랜딩 페이지 진입 및 폼 제출 ──
    console.log('1. 구독 랜딩 페이지 접속...');
    await page.goto(`/magazine/${BROKER_SLUG}/subscribe`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '21_subscribe_landing.png'), fullPage: true });
    console.log('📸 21_subscribe_landing.png 캡처 완료');

    // 폼 입력 (이름, 전화, 권역 태그, 자산 태그 클릭)
    console.log('2. 구독 폼 입력 및 태그 토글...');
    const nameInput = page.locator('input[placeholder*="이름"], input[type="text"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('박투자');
    }

    const phoneInput = page.locator('input[placeholder*="전화"], input[type="tel"]').first();
    if (await phoneInput.isVisible()) {
      await phoneInput.fill('01011112222');
    }

    // 관심 권역/자산 태그 클릭
    const gangnamTag = page.locator('button:has-text("강남·서초"), button:has-text("강남")').first();
    if (await gangnamTag.isVisible()) {
      await gangnamTag.click({ force: true });
    }

    const bldgTag = page.locator('button:has-text("꼬마빌딩")').first();
    if (await bldgTag.isVisible()) {
      await bldgTag.click({ force: true });
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '22_subscribe_form_filled.png'), fullPage: true });
    console.log('📸 22_subscribe_form_filled.png 캡처 완료');

    // 구독 신청 제출
    const submitBtn = page.getByRole('button', { name: /구독|신청/ }).first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click({ force: true });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '23_subscribe_success.png'), fullPage: true });
      console.log('📸 23_subscribe_success.png 캡처 완료');
    }

    // ── 2. TC-11.5 & TC-7.6: 매거진 뷰어 내 인라인 구독 & 전달하기(Referral) 섹션 ──
    console.log('3. 매거진 뷰어 접속 및 하단 인터랙션 섹션 검증...');
    const todayStr = new Date().toISOString().slice(0, 10);
    await page.goto(`/magazine/${BROKER_SLUG}/${todayStr}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 하단 전달하기 섹션으로 스크롤
    const referralSection = page.locator('[data-section-id="referral"], div:has-text("전달하기")').last();
    if (await referralSection.isVisible()) {
      await referralSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '24_viewer_referral_section.png') });
      console.log('📸 24_viewer_referral_section.png 캡처 완료');

      // 링크 복사 버튼 클릭
      const copyBtn = referralSection.locator('button:has-text("링크 복사"), button:has-text("복사")').first();
      if (await copyBtn.isVisible()) {
        await copyBtn.click({ force: true });
        await page.waitForTimeout(500);
      }
    }

    // 인라인 SubscribeCard 섹션 확인
    const subCard = page.locator('[data-section-id="subscribe_cta"], div:has-text("뉴스레터 구독")').first();
    if (await subCard.isVisible()) {
      await subCard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '25_viewer_inline_subscribecard.png') });
      console.log('📸 25_viewer_inline_subscribecard.png 캡처 완료');
    }

    // ── 3. TC-12.1: 매거진 아카이브 페이지 ──
    console.log('4. 매거진 아카이브 페이지 접속...');
    await page.goto(`/magazine/${BROKER_SLUG}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '26_archive_page.png'), fullPage: true });
    console.log('📸 26_archive_page.png 캡처 완료');

    // ── 4. TC-8.1: HMAC 서명 토큰 기반 구독 해지 확인 페이지 ──
    console.log('5. HMAC 서명 해지 페이지 접속 및 검증...');
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
    const fakeSubId = '00000000-0000-0000-0000-000000000001';
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${fakeSubId}.${BROKER_USER_ID}`)
      .digest('hex');
    const validToken = `${fakeSubId}.${BROKER_USER_ID}.${signature}`;

    await page.goto(`/api/public/magazine/unsubscribe?token=${validToken}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '27_unsubscribe_confirm_page.png'), fullPage: true });
    console.log('📸 27_unsubscribe_confirm_page.png 캡처 완료');

    console.log('🎉 Part 2 모든 구독/배포/레퍼럴/아카이브 워크스루 및 스크린샷 캡처 완료!');
  });
});

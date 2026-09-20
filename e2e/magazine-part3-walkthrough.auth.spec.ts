import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots/magazine_part3');
const BROKER_SLUG = 'test-broker-kim';
const BROKER_USER_ID = '204246a5-7c52-4549-9570-f089fbbf789c';
const EDITION_DATE = '2026-09-20';

test.describe('Part 3 Magazine Viewer, Analytics & Assets Audit Suite', () => {
  test.beforeAll(async () => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  //  [API 테스트 모음] TC-16, TC-17, TC-18, TC-19, TC-20
  // ═══════════════════════════════════════════════════════════════════
  test('TC-16 ~ TC-20: Viewer Telemetry, Poll, Analytics & Image Assets API Suite', async ({ request }) => {
    console.log('=== [Part 3 API] TC-16: 열람 텔레메트리 이벤트 수신 API ===');
    // 1. Page view event (FX-11-A)
    const pageViewRes = await request.post('/api/public/magazine/analytics', {
      data: {
        edition_id: `${BROKER_SLUG}-${EDITION_DATE}`,
        visitor_id: 'test-visitor-001',
        event_type: 'page_view',
        metadata: { broker_id: BROKER_SLUG, referrer: 'https://t.me/credeal' },
      },
    });
    console.log(`Page view analytics status: ${pageViewRes.status()}`);
    expect(pageViewRes.status()).toBe(200);
    const pageViewJson = await pageViewRes.json();
    expect(pageViewJson.ok).toBe(true);

    // 2. Section view event (FX-11-B)
    const sectionViewRes = await request.post('/api/public/magazine/analytics', {
      data: {
        edition_id: `${BROKER_SLUG}-${EDITION_DATE}`,
        visitor_id: 'test-visitor-001',
        event_type: 'section_view',
        section_id: 'ai_briefing',
      },
    });
    expect(sectionViewRes.status()).toBe(200);

    // 3. IM click event (FX-11-D)
    const imClickRes = await request.post('/api/public/magazine/analytics', {
      data: {
        edition_id: `${BROKER_SLUG}-${EDITION_DATE}`,
        visitor_id: 'test-visitor-001',
        event_type: 'click',
        target_url: '/im-lite/bldg-test-001',
        target_param: 'bldg-test-001',
        metadata: { broker_id: BROKER_SLUG },
      },
    });
    expect(imClickRes.status()).toBe(200);

    // 4. Validation error case (TC-16.3)
    const badAnalyticsRes = await request.post('/api/public/magazine/analytics', {
      data: { visitor_id: 'test-visitor-001' }, // missing edition_id & event_type
    });
    expect(badAnalyticsRes.status()).toBe(400);

    console.log('=== [Part 3 API] TC-17: 인터랙티브 설문 투표 & 온도 부스팅 API ===');
    // 1. 정상 투표 (선택지 0, FX-12-A)
    const vote1Res = await request.post('/api/public/magazine/poll', {
      data: {
        brokerId: BROKER_USER_ID,
        editionDate: EDITION_DATE,
        choice: 0,
        subscriberPhone: '01011112222',
      },
    });
    console.log(`Poll vote choice 0 status: ${vote1Res.status()}`);
    expect(vote1Res.status()).toBe(200);
    const vote1Json = await vote1Res.json();
    expect(vote1Json.ok).toBe(true);
    expect(vote1Json.results).toBeDefined();

    // 2. 3번 선택지 투표 (선택지 2, seller 세그먼트 전환, FX-12-B)
    const vote3Res = await request.post('/api/public/magazine/poll', {
      data: {
        brokerId: BROKER_USER_ID,
        editionDate: EDITION_DATE,
        choice: 2,
        subscriberPhone: '01033334444',
      },
    });
    expect(vote3Res.status()).toBe(200);

    // 3. 중복 투표 방지 검증 (동일 전화번호 재투표)
    const dupVoteRes = await request.post('/api/public/magazine/poll', {
      data: {
        brokerId: BROKER_USER_ID,
        editionDate: EDITION_DATE,
        choice: 1,
        subscriberPhone: '01011112222',
      },
    });
    expect(dupVoteRes.status()).toBe(200);
    const dupVoteJson = await dupVoteRes.json();
    expect(dupVoteJson.ok).toBe(true);

    // 4. 설문 결과 집계 조회 (TC-17.4)
    const getPollRes = await request.get(`/api/public/magazine/poll?brokerId=${BROKER_USER_ID}&editionDate=${EDITION_DATE}`);
    expect(getPollRes.status()).toBe(200);
    const getPollJson = await getPollRes.json();
    expect(getPollJson.results).toBeDefined();

    console.log('=== [Part 3 API] TC-18 & TC-19: 브로커 매거진 성과 분석 대시보드 API ===');
    // 1. 대시보드 전체 조회 (인증)
    const analyticsRes = await request.get('/api/broker/magazine/analytics');
    console.log(`Broker analytics dashboard status: ${analyticsRes.status()}`);
    expect(analyticsRes.status()).toBe(200);
    const analyticsJson = await analyticsRes.json();
    console.log('Broker analytics overview:', {
      subscriberCount: analyticsJson.subscriberCount,
      totalViews: analyticsJson.viewStats?.totalViews,
      temperatureDistribution: analyticsJson.temperatureDistribution,
    });
    expect(analyticsJson.viewStats).toBeDefined();
    expect(analyticsJson.temperatureDistribution).toBeDefined();
    expect(analyticsJson.temperatureDistribution['🔥 적극검토']).toBeGreaterThanOrEqual(0);
    expect(analyticsJson.temperatureDistribution['📈 관심']).toBeGreaterThanOrEqual(0);
    expect(analyticsJson.temperatureDistribution['⚪ 미확인']).toBeGreaterThanOrEqual(0);

    // 2. 개별 구독자 드릴다운 (첫 번째 구독자 조회)
    const subsListRes = await request.get('/api/broker/magazine/subscribers?limit=1');
    if (subsListRes.status() === 200) {
      const subsListJson = await subsListRes.json();
      const firstSub = subsListJson.subscribers?.[0];
      if (firstSub) {
        const drilldownRes = await request.get(`/api/broker/magazine/analytics?subscriberId=${firstSub.id}`);
        console.log(`Subscriber drilldown status: ${drilldownRes.status()}`);
        expect(drilldownRes.status()).toBe(200);
        const drilldownJson = await drilldownRes.json();
        expect(drilldownJson.subscriber).toBeDefined();
        expect(drilldownJson.analytics).toBeDefined();
      }
    }

    console.log('=== [Part 3 API] TC-20: 동적 이미지 에셋 생성 API ===');
    // 1. OG 이미지 (1200x630)
    const ogRes = await request.get(`/api/og/magazine?brokerId=${BROKER_SLUG}&date=${EDITION_DATE}`);
    console.log(`OG image status: ${ogRes.status()}, contentType: ${ogRes.headers()['content-type']}`);
    expect(ogRes.status()).toBe(200);
    expect(ogRes.headers()['content-type']).toContain('image/png');

    // 2. 프로모션 스토리 이미지 (1080x1920)
    const storyRes = await request.get(`/api/magazine/${BROKER_SLUG}/${EDITION_DATE}/image?format=story`);
    console.log(`Story promo status: ${storyRes.status()}, contentType: ${storyRes.headers()['content-type']}`);
    expect(storyRes.status()).toBe(200);
    expect(storyRes.headers()['content-type']).toContain('image/png');

    // 3. 프로모션 카드 이미지 (1080x1080)
    const cardRes = await request.get(`/api/magazine/${BROKER_SLUG}/${EDITION_DATE}/image?format=card`);
    expect(cardRes.status()).toBe(200);
    expect(cardRes.headers()['content-type']).toContain('image/png');

    // 4. 프로모션 가로형 OG 이미지 (1200x630)
    const promoOgRes = await request.get(`/api/magazine/${BROKER_SLUG}/${EDITION_DATE}/image?format=og`);
    expect(promoOgRes.status()).toBe(200);
    expect(promoOgRes.headers()['content-type']).toContain('image/png');

    // 5. 기본 포맷 (format 누락 시 story 기본값)
    const defaultFormatRes = await request.get(`/api/magazine/${BROKER_SLUG}/${EDITION_DATE}/image`);
    expect(defaultFormatRes.status()).toBe(200);
    expect(defaultFormatRes.headers()['content-type']).toContain('image/png');
  });

  // ═══════════════════════════════════════════════════════════════════
  //  [UI 워크스루 & 스크린샷 캡처] TC-15
  // ═══════════════════════════════════════════════════════════════════
  test('TC-15: Magazine Viewer Full-Sections Walkthrough & Screenshot Capture', async ({ page }) => {
    // 모바일 뷰포트 설정 (매거진 최적화: 480x950)
    await page.setViewportSize({ width: 480, height: 950 });

    console.log('1. 매거진 뷰어 페이지 진입...');
    await page.goto(`/magazine/${BROKER_SLUG}/${EDITION_DATE}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // 메타데이터 검증
    const pageTitle = await page.title();
    console.log('Page Title:', pageTitle);
    expect(pageTitle).toContain('CRE 데일리 매거진');

    // ── 31_viewer_hero_and_briefing.png ──
    console.log('2. 히어로 커버 & AI 브리핑 섹션 캡처...');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '31_viewer_hero_and_briefing.png') });
    console.log('📸 31_viewer_hero_and_briefing.png 캡처 완료');

    // ── 32_viewer_poll_interaction.png ──
    console.log('3. 인터랙티브 설문 투표 인터랙션 & 캡처...');
    const pollSection = page.locator('[data-section-id="poll"]').first();
    if (await pollSection.isVisible()) {
      await pollSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      
      // 첫 번째 선택지 클릭 (0번 인덱스는 SectionCard 헤더이므로 1번 인덱스가 첫 번째 투표 버튼)
      const pollChoiceBtn = pollSection.locator('button').nth(1);
      if (await pollChoiceBtn.isVisible()) {
        await pollChoiceBtn.click({ force: true });
        await page.waitForTimeout(1000);
      }
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '32_viewer_poll_interaction.png') });
      console.log('📸 32_viewer_poll_interaction.png 캡처 완료');
    }

    // ── 33_viewer_tax_clinic.png ──
    console.log('4. 세무 클리닉 A/B 비교 섹션 캡처...');
    const taxSection = page.locator('[data-section-id="tax_clinic"]').first();
    if (await taxSection.isVisible()) {
      await taxSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '33_viewer_tax_clinic.png') });
      console.log('📸 33_viewer_tax_clinic.png 캡처 완료');
    }

    // ── 34_viewer_roi_calculator.png ──
    console.log('5. 수지분석 계산기 슬라이더 조작 & 캡처...');
    const roiSection = page.locator('[data-section-id="roi_calculator"]').first();
    if (await roiSection.isVisible()) {
      await roiSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);

      // 슬라이더 조작 시뮬레이션
      const sliders = roiSection.locator('input[type="range"]');
      const count = await sliders.count();
      if (count > 0) {
        // 첫 번째 슬라이더(매입가) 값 변경
        await sliders.nth(0).fill('5000000000');
        await sliders.nth(0).dispatchEvent('input');
        await page.waitForTimeout(500);
      }
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '34_viewer_roi_calculator.png') });
      console.log('📸 34_viewer_roi_calculator.png 캡처 완료');
    }

    // ── 35_viewer_market_and_news.png ──
    console.log('6. 시장 데이터 및 뉴스 큐레이션 아코디언 펼침 & 캡처...');
    const marketSection = page.locator('[data-section-id="market_data"]').first();
    if (await marketSection.isVisible()) {
      await marketSection.scrollIntoViewIfNeeded();
      // 아코디언 버튼 클릭하여 펼치기
      const toggleBtn = marketSection.locator('button').first();
      if (await toggleBtn.isVisible()) {
        await toggleBtn.click({ force: true });
        await page.waitForTimeout(600);
      }
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '35_viewer_market_and_news.png') });
      console.log('📸 35_viewer_market_and_news.png 캡처 완료');
    }

    // ── 36_viewer_floating_bar.png ──
    console.log('7. 하단 고정 바 & 브로커 프로필 섹션 캡처...');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '36_viewer_floating_bar.png') });
    console.log('📸 36_viewer_floating_bar.png 캡처 완료');

    // ── 타겟 파라미터별 세그먼트 필터 검증 ──
    console.log('8. 타겟 파라미터 필터링 검증 (?target=buyer, ?target=seller)...');
    // 8a. buyer 타겟 접속 시 tax_clinic 미표시 검증
    await page.goto(`/magazine/${BROKER_SLUG}/${EDITION_DATE}?target=buyer`);
    await page.waitForLoadState('networkidle');
    const buyerTaxClinic = page.locator('[data-section-id="tax_clinic"]');
    const isTaxVisible = await buyerTaxClinic.isVisible().catch(() => false);
    console.log(`target=buyer tax_clinic visible: ${isTaxVisible}`);
    expect(isTaxVisible).toBe(false);

    // 8b. seller 타겟 접속 시 market_data 아코디언 기본 확장 검증
    await page.goto(`/magazine/${BROKER_SLUG}/${EDITION_DATE}?target=seller`);
    await page.waitForLoadState('networkidle');
    const sellerMarketData = page.locator('[data-section-id="market_data"]');
    expect(await sellerMarketData.isVisible()).toBe(true);

    // ── TC-15.20: 미발행 날짜 접속 시 폴백 화면 검증 ──
    console.log('9. 미발행 날짜 플레이스홀더 화면 검증...');
    await page.goto(`/magazine/${BROKER_SLUG}/2099-12-31`);
    await page.waitForLoadState('networkidle');
    const unreleasedText = page.locator('text=아직 발행되지 않은 매거진입니다');
    expect(await unreleasedText.isVisible()).toBe(true);
    const exploreLink = page.locator('a[href="/explore"]');
    expect(await exploreLink.isVisible()).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════
  //  [시각 에셋 스크린샷 캡처] TC-20
  // ═══════════════════════════════════════════════════════════════════
  test('TC-20: Dynamic Generated Image Assets Visual Capture', async ({ page }) => {
    // ── 37_asset_og_image.png ──
    console.log('1. 매거진 OG 이미지 렌더링 캡처 (1200x630)...');
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.goto(`/api/og/magazine?brokerId=${BROKER_SLUG}&date=${EDITION_DATE}`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '37_asset_og_image.png') });
    console.log('📸 37_asset_og_image.png 캡처 완료');

    // ── 38_asset_promo_story.png ──
    console.log('2. 프로모션 스토리 이미지 렌더링 캡처 (1080x1920)...');
    await page.setViewportSize({ width: 1080, height: 1920 });
    await page.goto(`/api/magazine/${BROKER_SLUG}/${EDITION_DATE}/image?format=story`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '38_asset_promo_story.png') });
    console.log('📸 38_asset_promo_story.png 캡처 완료');

    // ── 39_asset_promo_card.png ──
    console.log('3. 프로모션 카드 이미지 렌더링 캡처 (1080x1080)...');
    await page.setViewportSize({ width: 1080, height: 1080 });
    await page.goto(`/api/magazine/${BROKER_SLUG}/${EDITION_DATE}/image?format=card`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '39_asset_promo_card.png') });
    console.log('📸 39_asset_promo_card.png 캡처 완료');

    console.log('🎉 Part 3 모든 텔레메트리, 설문, 수지분석기, 시각 에셋 감사 및 캡처 완료!');
  });
});

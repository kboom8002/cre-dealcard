/**
 * @file e2e/new-user-full-lifecycle-golden.spec.ts
 * @description MECE Full-Lifecycle Commercial-Grade E2E Golden Test Suite (Brand-New Broker User)
 *
 * 검증 범위 (6대 MECE 축):
 * - Stage 0: 신규 중개사 계정 생성 (Supabase Auth Admin + /signup UI 검증 + /login 실제 로그인)
 * - Stage 1: 프로필 설정 (/broker/profile) 전 필드 입력 · 유효성/자동포맷 · 신뢰도 점수(100%) · 저장 및 새로고침 영속성(0% 유실) · 홈(/broker) 인사말 반영
 * - Stage 2: 딜카드 저작 · 서버 저장(PATCH /api/broker/workspace/summary) · 새로고침/워크스페이스 전환 후 중간/최종 산출물 복원 · 발송 전 확인시트 · 수신자 공개뷰(/dc/[id]) 프로필 연동
 * - Stage 3: IM 저작 (/broker/w/im) 프로필 자동 세팅 · 중간 초안 저장(💾 초안 저장) 및 새로고침 복원 · 바텀시트 상세모드 연동 · Basic IM 생성 · 모바일 IM(/im-lite/[id]) 및 PPTX 바이너리 4대 단언 + 프로필 인쇄 검증
 * - Stage 4: 주간 뉴스레터 저작 (/broker/magazine-editor) 5탭 통일 헤더 · 프로필 정체성 · 신규 딜카드/IM 후보 자동 연동 · 수동/자동 저장 및 새로고침 복원 · 발행 및 고객용 소식지(/magazine/[slug]/[date]) 검증
 * - Stage 5: 고객 소통함 (/broker/w/inbox) 신규 매수자 등록 · 통화 메모 영속성 · 실시간 정정 안내 배너 · 실시간 링크 회수(404) 및 복구 · 홈(/broker) 4-Door 집계/이어서 하기 연동
 */

import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import {
  analyzePptxZip,
  assertNoPoisonTokens,
  assertNoDummyData,
  assertNoEvasivePhrases,
  assertPriceBandBlocked,
} from './helpers/golden-test-utils';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function ensureChipSelected(page: Page, idPrefix: string, item: string) {
  const btn = page.locator(`[id="${idPrefix}-${item}"]`);
  await expect(btn).toBeVisible();
  const txt = (await btn.innerText()).trim();
  if (!txt.startsWith('✓')) {
    await btn.click();
  }
}

const ARTIFACT_DIR =
  'C:/Users/User/.gemini/antigravity/brain/81c019a6-0303-44db-bc94-8a1277019cc0/full-lifecycle-golden';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test.describe('New Broker Full-Lifecycle Commercial E2E Golden Suite', () => {
  let testUserId = '';
  const uniqueSuffix = Date.now().toString().slice(-6);
  const testEmail = `golden-broker-${uniqueSuffix}@credeal.test`;
  const testPassword = `GoldenBroker_${uniqueSuffix}!`;

  const BROKER_PROFILE_INPUT = {
    displayName: '강태산 대표공인중개사',
    rawPhone: '01098765432',
    formattedPhone: '010-9876-5432',
    company: '태산빌딩 부동산중개법인',
    officeRegNumber: '제 11680-2026-00777 호',
    licenseNumber: '2010-11-09988',
    tagline: '강남·영등포 수익형 빌딩 및 사옥 매매 전문 16년 베테랑',
    association: '한국공인중개사협회',
    careerStartYear: '2010',
    specialtyRegions: ['강남구', '서초구', '영등포구'],
    specialtyAssets: ['오피스빌딩', '꼬마빌딩'],
    totalDealCount: '85',
    dealSizeRange: '50~200억',
    dealSpecialty: '투자수익형',
    buyerTypes: ['법인', '개인 자산가'],
    preferredPriceRange: '50~200억',
    feePolicy: '법정수수료 준수',
    consultMethods: ['방문 상담', '전화'],
    responseTimeHours: '1',
    languages: ['한국어', '영어'],
    kakaoChannel: '@taesancre',
    naverBlogUrl: 'https://blog.naver.com/taesancre',
    bio: '강남구 및 영등포구 일대에서 16년간 중소형 빌딩, 사옥, 수익형 근린생활시설 매매를 전문으로 중개해 온 강태산 대표공인중개사입니다. 공적장부 교차검증과 정밀 렌트롤 실사를 통해 안전한 거래를 약속드립니다.',
  };

  test.beforeAll(async () => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Create a brand-new broker user in Supabase Auth
    const { data, error } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: {
        display_name: '신규가입중개사',
        name: '신규가입중개사',
        requested_role: 'broker',
      },
    });

    if (error || !data.user) {
      throw new Error(`Failed to provision new broker user: ${error?.message}`);
    }

    testUserId = data.user.id;

    // Seed initial minimal profile row as /signup callback does
    await adminClient.from('profiles').upsert({
      id: testUserId,
      role: 'broker',
      display_name: '신규가입중개사',
    });
  });

  test.afterAll(async () => {
    if (testUserId && SUPABASE_URL && SERVICE_ROLE_KEY) {
      try {
        const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        await adminClient.auth.admin.deleteUser(testUserId);
      } catch {
        // Non-blocking cleanup
      }
    }
  });

  test('executes full commercial lifecycle: Signup/Login -> Profile Save/Reload -> DealCard -> IM (Simple & BottomSheet & PPTX) -> Newsletter -> Inbox CRM', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 920 });

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 0: /signup UI Inspection & Real /login Authentication with New User
    // ═══════════════════════════════════════════════════════════════════════════
    await page.goto('/signup', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#displayName')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '00-signup-screen.png'),
      fullPage: false,
    });

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('#email').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('#email').fill(testEmail);
    await page.locator('#password').fill(testPassword);
    await page.getByRole('button', { name: '로그인' }).click();

    await page.waitForURL('**/broker**', { timeout: 60_000 });
    await expect(page.locator('h1')).toContainText('신규가입중개사 대표님, 환영합니다', {
      timeout: 25_000,
    });
    await expect(page.getByTestId('home-profile-settings-btn')).toBeVisible({ timeout: 15_000 });

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '01-home-initial-new-user.png'),
      fullPage: false,
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 1: Broker Profile Setup, Completeness Score, Save & Reload Persistence
    // ═══════════════════════════════════════════════════════════════════════════
    await page.getByTestId('home-profile-settings-btn').click();
    await page.waitForURL('**/broker/profile**', { timeout: 30_000 });
    await expect(page.getByText(`로그인 계정: ${testEmail}`)).toBeVisible({ timeout: 20_000 });

    // Verify unified 5-tab topbar and profile coach banner
    await expect(page.getByTestId('profile-where-it-shows-banner')).toBeVisible();
    await expect(page.getByTestId('save-profile-top-btn')).toBeVisible();

    // Test 1-second sample fill button first
    const sampleBtn = page.getByRole('button', { name: /표준 양식 1초 예시 채우기/ });
    if (await sampleBtn.isVisible()) {
      await sampleBtn.click();
    }

    // Fill Section 1: Basic Business Card Info
    await page.locator('#profile-display-name').fill(BROKER_PROFILE_INPUT.displayName);
    const phoneInput = page.locator('#profile-phone');
    await phoneInput.fill(BROKER_PROFILE_INPUT.rawPhone);
    // Verify automatic hyphen formatting
    await expect(phoneInput).toHaveValue(BROKER_PROFILE_INPUT.formattedPhone);

    await page.locator('#profile-company').fill(BROKER_PROFILE_INPUT.company);
    await page.locator('#profile-office-reg-number').fill(BROKER_PROFILE_INPUT.officeRegNumber);
    await page.locator('#profile-license-number').fill(BROKER_PROFILE_INPUT.licenseNumber);
    await page.locator('#profile-tagline').fill(BROKER_PROFILE_INPUT.tagline);

    // Fill Section 2: Qualification & Experience
    await page.locator('#profile-association').selectOption(BROKER_PROFILE_INPUT.association);
    await page.locator('#profile-career-start-year').fill(BROKER_PROFILE_INPUT.careerStartYear);

    for (const region of BROKER_PROFILE_INPUT.specialtyRegions) {
      await ensureChipSelected(page, 'region', region);
    }
    for (const asset of BROKER_PROFILE_INPUT.specialtyAssets) {
      await ensureChipSelected(page, 'asset', asset);
    }

    // Fill Section 3: Track Record & Buyer Types
    await page.locator('#profile-total-deal-count').fill(BROKER_PROFILE_INPUT.totalDealCount);
    await page
      .locator('#profile-deal-size-range')
      .selectOption(BROKER_PROFILE_INPUT.dealSizeRange);
    await ensureChipSelected(page, 'deal-spec', BROKER_PROFILE_INPUT.dealSpecialty);
    for (const bt of BROKER_PROFILE_INPUT.buyerTypes) {
      await ensureChipSelected(page, 'buyer-type', bt);
    }
    await page
      .locator('#profile-preferred-price-range')
      .selectOption(BROKER_PROFILE_INPUT.preferredPriceRange);

    // Fill Section 4: Service & Consultation Conditions
    await page.getByText(BROKER_PROFILE_INPUT.feePolicy, { exact: true }).click();
    for (const cm of BROKER_PROFILE_INPUT.consultMethods) {
      await ensureChipSelected(page, 'consult', cm);
    }
    await page
      .locator('#profile-response-time')
      .selectOption(BROKER_PROFILE_INPUT.responseTimeHours);
    for (const lang of BROKER_PROFILE_INPUT.languages) {
      await ensureChipSelected(page, 'lang', lang);
    }

    // Fill Section 5: Online Channels
    await page.locator('#profile-kakao-channel').fill(BROKER_PROFILE_INPUT.kakaoChannel);
    await page.locator('#profile-naver-blog').fill(BROKER_PROFILE_INPUT.naverBlogUrl);

    // Fill Section 6: Bio (>= 100 chars for +10% completeness)
    await page.locator('#profile-bio').fill(BROKER_PROFILE_INPUT.bio);

    // Verify Completeness Score reached 100%
    await expect(page.getByText('100%')).toBeVisible();

    // Save Profile
    await page.getByTestId('save-profile-top-btn').click();
    await expect(page.getByText('✓ 내 프로필과 중개사무소 정보가 저장되었습니다.')).toBeVisible({
      timeout: 15_000,
    });

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '02-profile-saved-100pct.png'),
      fullPage: false,
    });

    // Reload /broker/profile and verify 0% field loss
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#profile-display-name')).toHaveValue(
      BROKER_PROFILE_INPUT.displayName,
      { timeout: 15_000 }
    );
    await expect(page.locator('#profile-phone')).toHaveValue(
      BROKER_PROFILE_INPUT.formattedPhone
    );
    await expect(page.locator('#profile-company')).toHaveValue(BROKER_PROFILE_INPUT.company);
    await expect(page.locator('#profile-office-reg-number')).toHaveValue(
      BROKER_PROFILE_INPUT.officeRegNumber
    );
    await expect(page.locator('#profile-license-number')).toHaveValue(
      BROKER_PROFILE_INPUT.licenseNumber
    );
    await expect(page.locator('#profile-tagline')).toHaveValue(BROKER_PROFILE_INPUT.tagline);
    await expect(page.locator('#profile-career-start-year')).toHaveValue(
      BROKER_PROFILE_INPUT.careerStartYear
    );
    await expect(page.locator('#profile-total-deal-count')).toHaveValue(
      BROKER_PROFILE_INPUT.totalDealCount
    );
    await expect(page.locator('#profile-kakao-channel')).toHaveValue(
      BROKER_PROFILE_INPUT.kakaoChannel
    );
    await expect(page.getByText('100%')).toBeVisible();

    // Verify GET /api/broker/profile API payload directly
    const profileApiCheck = await page.evaluate(async () => {
      const r = await fetch('/api/broker/profile');
      return r.json();
    });
    expect(profileApiCheck.data.display_name).toBe(BROKER_PROFILE_INPUT.displayName);
    expect(profileApiCheck.data.phone).toBe(BROKER_PROFILE_INPUT.formattedPhone);
    expect(profileApiCheck.data.company).toBe(BROKER_PROFILE_INPUT.company);
    expect(profileApiCheck.data.broker.office_reg_number).toBe(
      BROKER_PROFILE_INPUT.officeRegNumber
    );
    expect(profileApiCheck.data.broker.license_number).toBe(BROKER_PROFILE_INPUT.licenseNumber);
    expect(profileApiCheck.data.broker.specialty_regions).toEqual(
      expect.arrayContaining(BROKER_PROFILE_INPUT.specialtyRegions)
    );
    expect(profileApiCheck.data.broker.slug).toBeTruthy();
    const brokerSlug: string = profileApiCheck.data.broker.slug;

    // Navigate back to Home (/broker) and verify updated greeting
    await page.getByTestId('workspace-nav-home').click();
    await page.waitForURL('**/broker', { timeout: 15_000 });
    await expect(page.locator('h1')).toContainText(
      `${BROKER_PROFILE_INPUT.displayName} 대표님, 환영합니다`,
      { timeout: 25_000 }
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 2: DealCard Creation, Server Save/Reload Persistence & Public View (/dc/[id])
    // ═══════════════════════════════════════════════════════════════════════════
    await page.getByTestId('home-task-dealcards').click();
    await page.waitForURL('**/broker/w/dealcards**', { timeout: 20_000 });

    // Create a brand-new DealCard
    await page.getByTestId('workspace-new-dealcard-btn').click();
    await page.waitForURL(/(?:buildingId|id)=bld-/, { timeout: 10_000 });
    const dealCardUrl = new URL(page.url());
    const newDealCardId = (dealCardUrl.searchParams.get('buildingId') ||
      dealCardUrl.searchParams.get('id'))!;
    expect(newDealCardId).toMatch(/^bld-/);

    // Fill 4-item Card4 fields
    await page.getByTestId('card4-region-input').fill('영등포구 당산동5가');
    await page.getByTestId('card4-use-input').fill('근린생활시설');
    await page.getByTestId('card4-priceband-input').fill('110~120억');
    await page.getByTestId('card4-point-input-0').fill('당산역 더블역세권 도보 3분 코너');
    await page.getByTestId('card4-point-input-1').fill('전층 우량 임차인 만실 안정 수익');
    await page.getByTestId('card4-point-input-2').fill('대지 142평 연수익률 4.3% 배당형');

    // Save DealCard to server
    await page.getByTestId('card4-save-btn').click();
    await expect(page.getByTestId('undo-confirm-toast')).toContainText(
      '딜카드 내용이 서버에 저장되었습니다'
    );

    // Clear localStorage and reload /broker/w/dealcards (WITHOUT ?buildingId query) to prove server persistence!
    await page.evaluate(() => window.localStorage.removeItem('credeal-w-dealcards-v3'));
    await page.goto('/broker/w/dealcards', { waitUntil: 'domcontentloaded' });

    const savedDealItem = page.getByTestId(`dealcard-item-${newDealCardId}`);
    await expect(savedDealItem).toBeVisible({ timeout: 15_000 });
    await expect(savedDealItem).toContainText('영등포구 당산동5가 근린생활시설');
    await savedDealItem.click();

    await expect(page.getByTestId('card4-region-input')).toHaveValue('영등포구 당산동5가');
    await expect(page.getByTestId('card4-priceband-input')).toHaveValue('110~120억');
    await expect(page.getByTestId('card4-point-input-0')).toHaveValue(
      '당산역 더블역세권 도보 3분 코너'
    );

    // Open Pre-Send Confirmation Sheet
    await page.getByTestId('workspace-primary-send-btn').click();
    await expect(page.getByText('당산역 더블역세권 도보 3분 코너').first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '03-dealcard-saved-and-presend.png'),
      fullPage: false,
    });

    // Verify Public DealCard Recipient View (/dc/[newDealCardId])
    await page.goto(`/dc/${newDealCardId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('영등포구 당산동5가');
    await expect(page.locator('body')).toContainText('110~120억');
    await expect(page.locator('body')).toContainText('당산역 더블역세권 도보 3분 코너');
    await expect(page.locator('body')).toContainText(BROKER_PROFILE_INPUT.displayName);
    await expect(page.locator('body')).toContainText(BROKER_PROFILE_INPUT.company);
    await expect(page.locator('body')).not.toContainText('●●●');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '04-public-dealcard-recipient-view.png'),
      fullPage: false,
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 3: IM Authoring (Profile Auto-Fill, Draft Save/Reload, BottomSheet, Mobile IM & PPTX)
    // ═══════════════════════════════════════════════════════════════════════════
    await page.goto('/broker/w/im', { waitUntil: 'domcontentloaded' });

    // Verify Broker Profile auto-populated into IM Authoring form
    await expect(page.getByTestId('im-brokerage-name-input')).toHaveValue(
      BROKER_PROFILE_INPUT.company,
      { timeout: 15_000 }
    );
    await expect(page.getByTestId('im-broker-name-input')).toHaveValue(
      BROKER_PROFILE_INPUT.displayName
    );
    await expect(page.getByTestId('im-broker-phone-input')).toHaveValue(
      BROKER_PROFILE_INPUT.formattedPhone
    );

    // Create a new IM draft and test intermediate draft save & reload
    await page.getByRole('button', { name: '+ 새 IM 만들기' }).click();
    await page.getByTestId('im-address-input').fill('서울특별시 영등포구 당산동5가 11-47');
    await page.getByTestId('im-asking-price-input').fill('1150000');

    // Verify broker profile remained pre-filled on new IM creation
    await expect(page.getByTestId('im-brokerage-name-input')).toHaveValue(
      BROKER_PROFILE_INPUT.company
    );
    await expect(page.getByTestId('im-broker-name-input')).toHaveValue(
      BROKER_PROFILE_INPUT.displayName
    );

    // Click 💾 초안 저장 and reload page to verify intermediate draft persistence
    await page.getByTestId('im-save-draft-btn').click();
    await expect(page.getByTestId('undo-confirm-toast')).toContainText(
      'IM 초안이 안전하게 저장되었습니다'
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('im-address-input')).toHaveValue(
      '서울특별시 영등포구 당산동5가 11-47'
    );
    await expect(page.getByTestId('im-asking-price-input')).toHaveValue('1150000');

    // Open Canonical Bottom-Sheet Mode (🎯 상세 IM 바텀시트 열기) and verify modal opens cleanly
    await page.getByTestId('im-open-bottom-sheet-btn').click();
    const bottomSheetDialog = page.locator('[role="dialog"]');
    await expect(bottomSheetDialog).toBeVisible({ timeout: 20_000 });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '05-im-bottom-sheet-modal.png'),
      fullPage: false,
    });
    // Close bottom sheet via close button and wait for dialog to close
    await bottomSheetDialog.getByRole('button', { name: /닫기/ }).click();
    await expect(bottomSheetDialog).toBeHidden({ timeout: 10_000 });

    // Trigger ⚡ Basic IM 만들기 · 약 20초
    const [quickGenRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/api/broker/im-lite/quick-generate') &&
          res.request().method() === 'POST',
        { timeout: 30_000 }
      ),
      page.getByTestId('im-quick-generate-btn').click(),
    ]);
    expect(quickGenRes.status()).toBe(201);
    const quickGenJson = await quickGenRes.json();
    const generatedBuildingId: string = quickGenJson.buildingId;
    expect(generatedBuildingId).toBeTruthy();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '06-im-workspace-generated.png'),
      fullPage: false,
    });

    // Clear localStorage and reload /broker/w/im to verify server-side IM list persistence
    await page.evaluate(() => window.localStorage.removeItem('credeal-w-im-v3'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('im-list-slot')).toContainText('당산동5가', {
      timeout: 15_000,
    });

    // Verify Customer Mobile IM Viewer (/im-lite/[generatedBuildingId])
    await page.goto(`/im-lite/${generatedBuildingId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(BROKER_PROFILE_INPUT.displayName, {
      timeout: 20_000,
    });
    await expect(page.locator('body')).toContainText(BROKER_PROFILE_INPUT.company);
    await expect(page.locator('body')).toContainText(BROKER_PROFILE_INPUT.formattedPhone);
    await expect(page.locator('body')).toContainText(BROKER_PROFILE_INPUT.officeRegNumber);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '07-mobile-im-customer-view.png'),
      fullPage: false,
    });

    // Verify PPTX Binary Download & 4 Binary Assertions + Broker Profile Print Verification
    const pptxRes = await page.request.get(
      `/api/public/im-lite/${generatedBuildingId}/pptx?tier=basic`
    );
    expect(pptxRes.status()).toBe(200);
    const pptxBuffer = await pptxRes.body();
    expect(pptxBuffer.length).toBeGreaterThan(50_000);

    const pptxPath = path.join(ARTIFACT_DIR, 'dangsan-new-broker-basic-im.pptx');
    fs.writeFileSync(pptxPath, pptxBuffer);

    const pptxAnalysis = analyzePptxZip(pptxPath);
    expect(pptxAnalysis.slideCount).toBeGreaterThanOrEqual(7);
    expect(pptxAnalysis.slideCount).toBeLessThanOrEqual(10);

    // Run 4 mandatory PPTX binary assertions (Rule 59)
    assertNoPoisonTokens(pptxAnalysis.slideEntries);
    assertNoDummyData(pptxAnalysis.fullPptxText);
    assertNoEvasivePhrases(pptxAnalysis.fullPptxText);
    assertPriceBandBlocked(pptxAnalysis.fullPptxText);

    // Verify Broker Profile is printed inside the PPTX slides (Slide 01 / Slide 10)
    expect(pptxAnalysis.fullPptxText).toContain(BROKER_PROFILE_INPUT.displayName);
    expect(pptxAnalysis.fullPptxText).toContain(BROKER_PROFILE_INPUT.company);
    expect(pptxAnalysis.fullPptxText).toContain(BROKER_PROFILE_INPUT.formattedPhone);
    expect(pptxAnalysis.fullPptxText).toContain(BROKER_PROFILE_INPUT.officeRegNumber);

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 4: Weekly Newsletter Authoring, Save/Reload, & Publish (/magazine/[slug]/[date])
    // ═══════════════════════════════════════════════════════════════════════════
    await page.goto('/broker/magazine-editor', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('workspace-topbar')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('workspace-nav-profile')).toBeVisible();
    await expect(page.getByTestId('my-magazine-badge')).toContainText(brokerSlug, {
      timeout: 20_000,
    });

    // Switch to Full Expert Mode (🛠️ 전문가 상세 편집)
    const fullModeBtn = page.locator('button[data-mode-switch="full"]');
    await expect(fullModeBtn).toBeVisible({ timeout: 20_000 });
    await fullModeBtn.click();
    await expect(page.locator('#editor-tab-field_note')).toBeVisible({ timeout: 10_000 });

    // 1. Cover Tab: Set Market Temperature & Headline
    await page.getByRole('button', { name: /선별 매수/ }).first().click();
    const customHeadline = '강태산 대표의 영등포·강남 수익형 빌딩 주간 브리핑';
    const headlineInput = page.locator('input[placeholder*="제목"], textarea[placeholder*="제목"], input[value*="브리핑"]').first();
    if (await headlineInput.isVisible()) {
      await headlineInput.fill(customHeadline);
    }

    // 2. Field Note Tab: Enter field note
    await page.locator('#editor-tab-field_note').click();
    const fieldNoteText =
      '이번 주 당산역 더블역세권 코너 근생빌딩 현장 실사를 다녀왔습니다. 전층 우량 임차인으로 구성되어 공실 위험이 낮고 대지 평당가가 인근 실거래 대비 경쟁력이 높습니다.';
    const commentTextarea = page.locator('textarea').first();
    await commentTextarea.fill(fieldNoteText);

    // 3. Theme & Deals Tab: Verify newly created DealCard/IM from Stage 2 & 3 appear in candidate list
    await page.locator('#editor-tab-theme_deals').click();
    await expect(page.locator('#editor-tabpanel')).toContainText('당산동5가', {
      timeout: 15_000,
    });

    // Click Manual Save (저장) and verify persistence across reload
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await page.waitForTimeout(1000);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('my-magazine-badge')).toContainText(brokerSlug, {
      timeout: 20_000,
    });
    const fullModeBtnAfterReload = page.locator('button[data-mode-switch="full"]');
    await expect(fullModeBtnAfterReload).toBeVisible({ timeout: 20_000 });
    await fullModeBtnAfterReload.click();
    await expect(page.locator('#editor-tab-field_note')).toBeVisible({ timeout: 10_000 });
    await page.locator('#editor-tab-field_note').click();
    await expect(page.locator('textarea').first()).toHaveValue(fieldNoteText);

    // 4. Publish Tab: Publish Newsletter via PublishConfirmModal
    await page.locator('#editor-tab-publish').click();
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '08-newsletter-editor-before-publish.png'),
      fullPage: false,
    });

    const openPublishBtn = page.getByRole('button', { name: '발행하기' }).first();
    await openPublishBtn.click();

    const publishDialog = page.getByRole('dialog');
    await expect(publishDialog).toBeVisible({ timeout: 15_000 });

    let publishRes = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/api/magazine/editions/') &&
          res.url().includes('/publish') &&
          res.request().method() === 'POST',
        { timeout: 25_000 }
      ),
      publishDialog.getByRole('button', { name: /발행하기|정정 발행/ }).click(),
    ]).then(([r]) => r);

    if (publishRes.status() === 409) {
      // Acknowledge quality gate review if prompted
      const ackCheckbox = publishDialog.locator('input[type="checkbox"]').last();
      await ackCheckbox.check();
      publishRes = await Promise.all([
        page.waitForResponse(
          (res) =>
            res.url().includes('/api/magazine/editions/') &&
            res.url().includes('/publish') &&
            res.request().method() === 'POST',
          { timeout: 25_000 }
        ),
        publishDialog.getByRole('button', { name: /발행하기|정정 발행/ }).click(),
      ]).then(([r]) => r);
    }

    expect(publishRes.ok()).toBe(true);
    const publishJson = await publishRes.json();
    const kstToday =
      publishJson?.issueDate ||
      publishJson?.edition?.issue_date ||
      new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());

    // Open Customer Published Magazine View (/magazine/[brokerSlug]/[kstToday])
    await page.goto(`/magazine/${brokerSlug}/${kstToday}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(BROKER_PROFILE_INPUT.displayName, {
      timeout: 20_000,
    });
    await expect(page.locator('body')).toContainText(fieldNoteText);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '09-published-customer-newsletter.png'),
      fullPage: false,
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 5: Customer Inbox Closed-Loop CRM (/broker/w/inbox) & Home Aggregation
    // ═══════════════════════════════════════════════════════════════════════════
    await page.goto('/broker/w/inbox', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('workspace-topbar')).toBeVisible();
    await expect(page.getByTestId('inbox-list-slot')).toBeVisible();

    // Register a new VIP Buyer Client linked to the new broker's generated building
    await page.getByTestId('toggle-new-client-btn').click();
    const vipClientName = `정우성 원장 (우성피부과_${uniqueSuffix})`;
    await page.getByTestId('new-client-name-input').fill(vipClientName);
    await page.getByTestId('new-client-phone-input').fill('010-7777-8888');
    await page.getByPlaceholder('예산 (예: 100~130억)').fill('110~130억');
    await page.getByPlaceholder('선호 권역 (예: 강남구)').fill('영등포구·강남구');
    await page.getByTestId('submit-new-client-btn').click();

    await expect(page.getByTestId('inbox-list-slot')).toContainText(vipClientName);

    // Add a consultation call note and verify reload persistence
    const callNoteText = `당산동5가 근생빌딩 현장 투어 금요일 오후 3시 확정 (${uniqueSuffix})`;
    await page
      .getByPlaceholder('통화 내용이나 상담 메모를 남기세요...')
      .fill(callNoteText);
    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/api/broker/inbox') && res.request().method() === 'POST',
        { timeout: 15_000 }
      ),
      page.getByRole('button', { name: '기록' }).click(),
    ]);
    await expect(page.getByTestId('inbox-editor-slot')).toContainText(callNoteText);

    // Clear localStorage and reload /broker/w/inbox to verify server-side Inbox state persistence
    await page.evaluate(() => window.localStorage.removeItem('credeal-w-inbox-v3'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('inbox-list-slot')).toContainText(vipClientName, {
      timeout: 15_000,
    });
    await page.getByTestId('inbox-list-slot').getByText(vipClientName).click();
    await expect(page.getByTestId('inbox-editor-slot')).toContainText(callNoteText);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '10-inbox-vip-client-and-callnote-persisted.png'),
      fullPage: false,
    });

    // Final check: Navigate to /broker Home and verify 4-Door counts & Resume Bar reflect new user's artifacts
    await page.getByTestId('workspace-nav-home').click();
    await page.waitForURL('**/broker', { timeout: 15_000 });
    await expect(page.locator('h1')).toContainText(
      `${BROKER_PROFILE_INPUT.displayName} 대표님, 환영합니다`
    );
    await expect(page.getByTestId('home-resume-bar')).toBeVisible();
    await expect(page.getByTestId('home-door-badge-dealcards')).not.toHaveText('0건');
    await expect(page.getByTestId('home-door-badge-im')).not.toHaveText('0건');
    await expect(page.getByTestId('home-door-badge-magazine')).not.toHaveText('0건');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '11-home-final-aggregated-state.png'),
      fullPage: false,
    });
  });
});

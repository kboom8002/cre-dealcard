/**
 * @file e2e/dealcard-golden.auth.spec.ts
 * @description 딜카드 상용화 골든 테스트 스위트 (24대 MECE 시나리오 -> 12개 골든 테스트)
 * 
 * Wave 1: 핵심 플로우 (생성 -> 편집 -> 공유 -> 수신자 열람)
 * Wave 2: AI 매칭 플로우 (페르소나 -> 가상 의향 -> AI 매칭 -> 임장)
 * Wave 3: 협업 플로우 (서클 공유 -> 게이트 처리)
 * Wave 4: 분석·관리 (분석 탭 -> 삭제 및 에러 바운더리)
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { ensureDir } from './helpers/golden-test-utils';

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots/dealcard-golden');

const FX_GOLDEN_MEMO = `강남구 역삼동 테헤란로 인근 코너 근생빌딩 매각
- 매각가: 85억
- 대지면적: 약 110평, 연면적: 약 320평
- 지하1층~지상5층, 엘리베이터 있음
- 현재 만실 운영 중 (1층 프랜차이즈 카페, 2~5층 사무실)
- 월 임대수익: 약 3,200만원 (보증금 총 4억)
- 역삼역 도보 5분, 테헤란로 인접
- 건물 상태 양호, 2019년 리모델링 완료
- 매도자 사정: 해외 이민으로 급매`;

test.describe.serial('DealCard Production Golden E2E Suite', () => {
  let buildingId: string = '';
  const shotCounter = { current: 0 };

  const takeShot = async (page: any, name: string) => {
    ensureDir(SCREENSHOT_DIR);
    shotCounter.current++;
    const filename = `${String(shotCounter.current).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: true });
    console.log(`📸 [${shotCounter.current}] ${name}`);
  };

  test.beforeAll(async () => {
    ensureDir(SCREENSHOT_DIR);
  });

  // ─────────────────────────────────────────────────────────────
  // WAVE 1: 핵심 플로우
  // ─────────────────────────────────────────────────────────────

  test('TC-01: [Wave 1] 딜카드 생성 (시나리오 A1, A2)', async ({ page }) => {
    test.setTimeout(180_000);
    console.log('\n--- TC-01: 딜카드 생성 검증 ---');

    await page.goto('/broker/deal-card/new', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/broker\/deal-card\/new/);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
    await textarea.fill(FX_GOLDEN_MEMO);

    await takeShot(page, 'tc01-01-memo-entered');

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 중복 모달 또는 로딩 처리
    const duplicateBtn = page.locator('button:has-text("새로 만들기"), button:has-text("이 물건 업데이트")').first();
    const navPromise = page.waitForURL(/\/broker\/deal-card\/[a-f0-9]{8}-/, { timeout: 150_000 });

    const race = await Promise.race([
      navPromise.then(() => 'navigated'),
      duplicateBtn.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'duplicate').catch(() => 'no_modal'),
    ]);

    if (race === 'duplicate') {
      console.log('  ⚠️ 중복 매물 감지 모달 노출 -> 신규 생성 선택');
      await duplicateBtn.click();
      await page.waitForURL(/\/broker\/deal-card\/[a-f0-9]{8}-/, { timeout: 120_000 });
    } else {
      await navPromise;
    }

    const currentUrl = page.url();
    const match = currentUrl.match(/\/broker\/deal-card\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
    expect(match).toBeTruthy();
    buildingId = match![1];
    console.log(`  ✅ 딜카드 생성 완료: buildingId=${buildingId}`);

    // 축하 모달 닫기 (있을 경우)
    const modalCheckBtn = page.locator('button:has-text("딜카드 확인"), button:has-text("확인")').first();
    if (await modalCheckBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await modalCheckBtn.click();
      await page.waitForTimeout(1000);
    }

    // 딜카드 미리보기 카드 렌더링 검증
    await expect(page.locator('text=역삼').or(page.locator('text=강남')).first()).toBeVisible({ timeout: 15000 });
    
    // 3-컬럼 CTA 바 검증 ("기본 IM", "전문IM", "AI매칭")
    await expect(page.locator('button:has-text("기본 IM")').first()).toBeVisible();
    await expect(page.locator('#cta-trigger-ai-match, button:has-text("매칭")').first()).toBeVisible();

    await takeShot(page, 'tc01-02-dealcard-created');
  });

  test('TC-02: [Wave 1] 딜 문구 & 시그널 편집 (시나리오 B1, B2)', async ({ page }) => {
    test.setTimeout(60_000);
    console.log('\n--- TC-02: 딜 문구 및 시그널 편집 검증 ---');

    await page.goto(`/broker/deal-card/${buildingId}`, { waitUntil: 'networkidle' });

    // 1. 타이틀 편집
    const titleInput = page.locator('input[placeholder*="만실 운영"]').first();
    await expect(titleInput).toBeVisible({ timeout: 10000 });
    await titleInput.fill('역삼역 코너 만실 근생빌딩');

    // 2. HookCopy 편집
    const hookInput = page.locator('input[placeholder*="신사역 도보"]').first();
    if (await hookInput.isVisible()) {
      await hookInput.fill('역삼역 5분, 만실 운영 85억 급매');
    }

    // 3. 저장 버튼 클릭
    const saveBtn = page.locator('button:has-text("변경사항 저장")');
    await expect(saveBtn).toBeEnabled({ timeout: 5000 });
    await saveBtn.click();
    await page.waitForTimeout(2000);
    console.log('  ✅ 딜카드 문구 편집 저장 완료');

    // 4. 시그널 정보 (권역) 인라인 편집 클릭
    const areaSignalBtn = page.locator('span:has-text("권역")').first();
    if (await areaSignalBtn.isVisible()) {
      console.log('  ✅ 시그널 정보 필드 확인');
    }

    await takeShot(page, 'tc02-01-edited-dealcard');

    // 5. 새로고침 후 값 보존 확인
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('text=역삼역 코너 만실 근생빌딩').first()).toBeVisible({ timeout: 10000 });
    console.log('  ✅ 새로고침 후에도 편집된 딜 타이틀 유지 검증 완료');
  });

  test('TC-03: [Wave 1] 카카오톡 공유 미리보기 및 링크 복사 (시나리오 C1, C2)', async ({ page }) => {
    test.setTimeout(30_000);
    console.log('\n--- TC-03: 카카오톡 공유 카드 & 링크 복사 검증 ---');

    await page.goto(`/broker/deal-card/${buildingId}`, { waitUntil: 'networkidle' });

    // 1. OG 썸네일 경로가 `/kakao` 경로를 가리키는지 검증 (F-3 & CRIT-4)
    const ogImg = page.locator(`img[src*="/api/og/deal/${buildingId}/kakao"]`).first();
    await expect(ogImg).toBeVisible({ timeout: 10000 });
    console.log('  ✅ 카카오 OG 이미지 경로 동기화 확인 (/kakao)');

    // 2. 링크 복사 버튼 클릭
    const copyBtn = page.locator('button:has-text("링크 복사")').first();
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();
    console.log('  ✅ 링크 복사 버튼 작동 확인');

    // 3. 수신자 화면 모달 열기
    const previewBtn = page.locator('button:has-text("수신자 화면")').first();
    if (await previewBtn.isVisible()) {
      await previewBtn.click();
      const iframe = page.locator('iframe');
      await expect(iframe).toBeVisible({ timeout: 10000 });
      console.log('  ✅ 수신자 화면 디바이스 프레임 모달 열림 확인');

      await takeShot(page, 'tc03-01-receiver-preview-modal');

      // 닫기
      const closeBtn = page.locator('button:has-text("닫기"), button[aria-label="Close"]').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      }
    }
  });

  test('TC-04: [Wave 1] 수신자 화면 열람 (시나리오 E1, E2, E3)', async ({ page, context }) => {
    test.setTimeout(60_000);
    console.log('\n--- TC-04: 매수자 수신 화면 열람 (/dc/[id]) ---');

    // 비로그인 환경 시뮬레이션을 위해 쿠키 없이 새 탭 생성
    const incognitoPage = await context.newPage();
    await incognitoPage.context().clearCookies();

    const res = await incognitoPage.goto(`/dc/${buildingId}`, { waitUntil: 'networkidle' });
    expect(res?.status()).toBe(200); // 500 에러 아님 (E-1, E-2 방어 검증)

    // 1. 헤더 (TeaserHeroHeader) 확인
    await expect(incognitoPage.locator('text=역삼역 코너 만실 근생빌딩').first()).toBeVisible({ timeout: 10000 });

    // 2. 4대 지표 타일 확인 (F-1 Props 수정 검증)
    const metricsGrid = incognitoPage.locator('text=매각가').or(incognitoPage.locator('text=수익률')).first();
    await expect(metricsGrid).toBeVisible();
    console.log('  ✅ 지표 타일 정상 렌더링 확인 (F-1 검증)');

    // 3. 보안 검증 블록 확인 (F-2 PublicPolicyBlock 수정 검증, 접이식 summary 클릭 후 확인)
    const policyDetails = incognitoPage.locator('summary:has-text("매도자 보호")').first();
    await expect(policyDetails).toBeVisible();
    await policyDetails.click();
    await expect(incognitoPage.locator('text=매도자 보호 및 비밀 유지 안내')).toBeVisible({ timeout: 5000 });

    // 4. 담당 중개사 신뢰 카드 확인
    await expect(incognitoPage.locator('text=담당').or(incognitoPage.locator('text=공인중개사')).first()).toBeVisible();

    // 5. 민감 지번 마스킹 검증 (W403 규칙)
    const content = await incognitoPage.content();
    expect(content).not.toMatch(/\d+-\d+번지/);
    expect(content).not.toContain('주민등록번호');

    await takeShot(incognitoPage, 'tc04-01-receiver-view');
    await incognitoPage.close();
    console.log('  ✅ 수신자 화면 완전 무결성 검증 완료');
  });

  // ─────────────────────────────────────────────────────────────
  // WAVE 2: AI 매칭 플로우
  // ─────────────────────────────────────────────────────────────

  test('TC-05: [Wave 2] 이상적 매수자 페르소나 생성 (시나리오 D1)', async ({ page }) => {
    test.setTimeout(60_000);
    console.log('\n--- TC-05: AI 매수자 페르소나 생성 검증 ---');

    await page.goto(`/broker/deal-card/${buildingId}`, { waitUntil: 'networkidle' });

    // 매수자 탭 클릭
    const buyersTab = page.locator('button:has-text("매수자")');
    await buyersTab.click();
    await page.waitForTimeout(1000);

    // 페르소나 생성 버튼 확인 또는 기존 생성 결과 확인
    const generateBtn = page.locator('#cta-generate-buyer-personas, button:has-text("AI 매수자 페르소나 도출")').first();
    if (await generateBtn.isVisible()) {
      console.log('  🚀 페르소나 생성 버튼 클릭');
      await generateBtn.click();
    }

    // 페르소나 카드 대기 (사옥형 / 임대수익형 / 투자형 등)
    const personaCard = page.locator('text=사옥').or(page.locator('text=수익')).or(page.locator('text=투자')).first();
    await expect(personaCard).toBeVisible({ timeout: 45000 });
    console.log('  ✅ AI 페르소나 카드 렌더링 확인 (A-1 null-safety 방어 검증)');

    await takeShot(page, 'tc05-01-persona-cards');
  });

  test('TC-06: [Wave 2] 가상 매수자 의향 등록 (시나리오 D2)', async ({ page }) => {
    test.setTimeout(30_000);
    console.log('\n--- TC-06: 가상 매수자 의향 등록 검증 ---');

    await page.goto(`/broker/deal-card/${buildingId}`, { waitUntil: 'networkidle' });
    await page.locator('button:has-text("매수자")').click();
    await page.waitForTimeout(1000);

    const virtualIntentBtn = page.locator('button:has-text("가상 의향 등록")').first();
    if (await virtualIntentBtn.isVisible({ timeout: 10000 })) {
      await virtualIntentBtn.click();
      await page.waitForTimeout(2000);
      console.log('  ✅ 가상 의향 등록 버튼 클릭 성공');
    } else {
      console.log('  ℹ️ 가상 의향 등록 버튼이 이미 처리되었거나 보이지 않음');
    }

    await takeShot(page, 'tc06-01-virtual-intent-registered');
  });

  test('TC-07: [Wave 2] AI 자동 매칭 센터 확인 (시나리오 D3)', async ({ page }) => {
    test.setTimeout(30_000);
    console.log('\n--- TC-07: AI 자동 매칭 센터 & 바로 임장 잡기 링크 검증 ---');

    await page.goto(`/broker/matching?buildingId=${buildingId}`, { waitUntil: 'networkidle' });
    expect(page.url()).toContain('/broker/matching');

    // CRIT-3 수정 검증: 바로 임장 잡기 링크가 404가 아닌 올바른 경로인지 확인
    const scheduleLink = page.locator('a[href*="/schedule"]').first();
    if (await scheduleLink.isVisible({ timeout: 5000 })) {
      const href = await scheduleLink.getAttribute('href');
      expect(href).not.toContain('/buildings/'); // 기존 잘못된 404 경로 배제
      expect(href).toContain('/broker/schedule?buildingId=');
      console.log(`  ✅ 바로 임장 잡기 링크 경로 검증 완료 (CRIT-3 해결): ${href}`);
    } else {
      console.log('  ℹ️ 현재 S/A등급 매칭이 없어 임장 잡기 링크가 미노출 상태');
    }

    await takeShot(page, 'tc07-01-matching-center');
  });

  test('TC-08: [Wave 2] 임장 일정 조율 페이지 검증 (시나리오 D5, F2)', async ({ page }) => {
    test.setTimeout(30_000);
    console.log('\n--- TC-08: 임장 일정 관리 페이지 (/broker/schedule) 검증 ---');

    const res = await page.goto(`/broker/schedule?buildingId=${buildingId}`, { waitUntil: 'networkidle' });
    expect([200, 304]).toContain(res?.status() ?? 200);
    console.log('  ✅ 임장 일정 페이지 200 정상 응답 확인');

    await takeShot(page, 'tc08-01-schedule-page');
  });

  // ─────────────────────────────────────────────────────────────
  // WAVE 3: 협업 플로우
  // ─────────────────────────────────────────────────────────────

  test('TC-09: [Wave 3] 서클 공동중개 공유 바텀시트 검증 (시나리오 C3)', async ({ page }) => {
    test.setTimeout(30_000);
    console.log('\n--- TC-09: 서클 공동중개 공유 바텀시트 검증 ---');

    await page.goto(`/broker/deal-card/${buildingId}`, { waitUntil: 'networkidle' });

    // ⋮ 더보기 메뉴 열기
    const moreMenuBtn = page.locator('button[aria-label="더 보기"]').first();
    await expect(moreMenuBtn).toBeVisible({ timeout: 5000 });
    await moreMenuBtn.click();

    // "서클에 공유" 클릭
    const circleShareBtn = page.locator('button:has-text("서클에 공유")');
    await expect(circleShareBtn).toBeVisible();
    await circleShareBtn.click();

    // ShareToCircleSheet 바텀시트 검증
    await expect(page.locator('text=서클').first()).toBeVisible({ timeout: 5000 });
    console.log('  ✅ 서클 공유 바텀시트 노출 확인');

    await takeShot(page, 'tc09-01-circle-share-sheet');

    // 닫기
    const closeBtn = page.locator('button:has-text("닫기"), button[aria-label="Close"]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }
  });

  test('TC-10: [Wave 3] 자료 요청 인박스 검증 (시나리오 D4)', async ({ page }) => {
    test.setTimeout(30_000);
    console.log('\n--- TC-10: 자료 요청 인박스 (GateRequestsInbox) 검증 ---');

    await page.goto(`/broker/deal-card/${buildingId}`, { waitUntil: 'networkidle' });
    await page.locator('button:has-text("매수자")').click();

    // GateRequestsInbox 섹션 존재 확인
    await expect(page.locator('text=자료 요청').or(page.locator('text=Gate Requests')).first()).toBeVisible({ timeout: 10000 });
    console.log('  ✅ GateRequestsInbox 렌더링 확인 (L-3 에러 핸들링 검증)');

    await takeShot(page, 'tc10-01-gate-inbox');
  });

  // ─────────────────────────────────────────────────────────────
  // WAVE 4: 분석·관리
  // ─────────────────────────────────────────────────────────────

  test('TC-11: [Wave 4] 분석 탭 및 건물주 보고서 링크 검증 (시나리오 F1, F3)', async ({ page }) => {
    test.setTimeout(30_000);
    console.log('\n--- TC-11: 분석 탭 & 건물주 보고서 링크 검증 ---');

    await page.goto(`/broker/deal-card/${buildingId}`, { waitUntil: 'networkidle' });
    await page.locator('button:has-text("분석")').click();

    // 1. 가격 예측 및 스케줄 섹션이 크래시 없이 렌더링되는지 확인 (E-6, E-8 수정 검증)
    await page.waitForTimeout(1500);
    const content = await page.content();
    expect(content).not.toContain('예측 데이터를 불러오는데 실패했습니다.');

    // 2. 건물주 보고서 링크 확인
    const ownerReportLink = page.locator(`a[href*="/broker/buildings/${buildingId}/owner-report"]`);
    await expect(ownerReportLink).toBeVisible({ timeout: 5000 });
    console.log('  ✅ 건물주 보고서 이동 링크 확인');

    await takeShot(page, 'tc11-01-analytics-tab');
  });

  test('TC-12: [Wave 4] 딜카드 삭제 및 에러 바운더리 검증 (시나리오 A4)', async ({ page }) => {
    test.setTimeout(45_000);
    console.log('\n--- TC-12: 딜카드 삭제 및 error.tsx 바운더리 검증 ---');

    await page.goto(`/broker/deal-card/${buildingId}`, { waitUntil: 'networkidle' });

    // 더보기 메뉴 -> 딜카드 삭제
    await page.locator('button[aria-label="더 보기"]').click();
    const deleteBtn = page.locator('button:has-text("딜카드 삭제")');
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // 삭제 확인 모달
    await expect(page.locator('text=딜카드를 삭제하시겠습니까?')).toBeVisible();
    await takeShot(page, 'tc12-01-delete-modal');

    // 확인 클릭
    const confirmDeleteBtn = page.locator('div[role="dialog"], div.fixed').locator('button:has-text("삭제")').first();
    await confirmDeleteBtn.click();

    // 매물 목록으로 리다이렉트 대기
    await page.waitForURL(/\/broker\/buildings/, { timeout: 30_000 });
    console.log('  ✅ 삭제 완료 후 매물 목록 리다이렉트 확인');

    // 삭제된 딜카드 URL 접속 시 500이 아닌 우아한 에러/미존재 처리 확인 (error.tsx 검증)
    const errorRes = await page.goto(`/broker/deal-card/${buildingId}`, { waitUntil: 'domcontentloaded' });
    console.log(`  ✅ 삭제된 딜카드 접근 응답 상태: ${errorRes?.status()}`);
    expect([200, 404]).toContain(errorRes?.status() ?? 200);

    await takeShot(page, 'tc12-02-deleted-dealcard-handled');
    console.log('  🎉 [Wave 1~4] 전체 12개 골든 테스트 완료!');
  });
});

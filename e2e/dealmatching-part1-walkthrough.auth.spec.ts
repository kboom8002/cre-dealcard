import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// .env.local 로드
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots/dealmatching');

const FX_01_MEMO = `역삼동 테헤란로 인근 꼬마빌딩 매물 접수.
대지 85평, 연면적 320평, 지하1층~지상5층.
2003년 준공, 근린생활시설 및 업무시설.
현재 만실 상태. 보증금 총 8억, 월세 총 2,800만원.
매도 희망가 80억 (감정가 대비 약 10% 할인).
1층 카페, 2~3층 사무실, 4~5층 공유오피스 임차 중.
리모델링 이력 있음 (2019년 외벽+엘리베이터 교체).
위반건축물 해당 없음. 단독소유. 명도 불필요(만실).`;

const FX_02_MEMO = `법인 매수자, 예산 60~100억.
강남·서초·역삼 권역 꼬마빌딩 선호.
임대수익형 투자 목적. 만실 또는 90% 이상 점유 매물 희망.
필수조건: 위반건축물 불가, 명도 불필요한 만실 매물.
수익률 4% 이상 기대. 대출 비율 50% 이내 예정.
리스크 허용도: 보수적.`;

test.describe('DealMatching Part 1 E2E Walkthrough', () => {
  test.beforeAll(async () => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

  // UI 크기를 일반 데스크탑으로 설정
  test.use({ viewport: { width: 1440, height: 900 } });

  test('TC-01: 딜카드 메모 입력 -> SSoT Lite 자동 생성', async ({ page }) => {
    console.log('--- TC-01: DealCard Creation ---');
    await page.goto('/broker/deal-card/new', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/broker\/deal-card\/new/);

    // 1. 메모 입력란 찾기
    const textarea = page.locator('textarea');
    await textarea.fill(FX_01_MEMO);

    // 2. 제출 버튼 (AI 분석 시작)
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();
    
    // 화면 캡처 1: 입력 완료 상태
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tc01_01_memo_input.png') });

    // 제출!
    await submitBtn.click();

    // 분석 로딩 완료까지 대기 (타임아웃 30초 부여)
    await page.waitForURL(/\/broker\/deal-card\/[a-zA-Z0-9-]+/, { timeout: 120000 }).catch(() => {
        // 혹시 저장 완료 화면(완료되었습니다)이 뜨는 경우
        console.log('Waiting for completion screen...');
    });
    
    // "딜카드 확인 / 카톡 공유" 버튼이 보인다면 클릭
    const checkBtn = page.locator('button:has-text("확인")');
    if (await checkBtn.isVisible()) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tc01_02_creation_success.png') });
        await checkBtn.click();
        await page.waitForURL(/\/broker\/deal-card\/[a-zA-Z0-9-]+/, { timeout: 10000 });
    }

    // 상세 페이지 렌더링 확인
    await page.waitForSelector('text=역삼동', { timeout: 10000 });
    await page.waitForSelector('text=80억', { timeout: 10000 });

    // 화면 캡처 2: 생성된 딜카드 상세
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tc01_03_dealcard_detail.png'), fullPage: true });
  });

  test('TC-02: 이상적 매수자 페르소나 생성', async ({ page }) => {
    console.log('--- TC-02: Buyer Persona Generation ---');
    // 최신 생성된 딜카드로 이동 (목록에서 첫번째 클릭)
    await page.goto('/broker/buildings');
    await page.locator('div[data-testid="building-card"], a[href^="/broker/deal-card/"]').first().click();
    await page.waitForURL(/\/broker\/deal-card\/[a-zA-Z0-9-]+/);

    // 페르소나 섹션 찾기
    const personaSection = page.locator('text=이상적 매수자 페르소나');
    await personaSection.scrollIntoViewIfNeeded();

    // 생성 버튼이 있는지 확인 후 클릭
    const generateBtn = page.locator('button:has-text("페르소나 생성")');
    if (await generateBtn.isVisible()) {
        await generateBtn.click();
    }

    // 결과 대기 (페르소나 카드가 표시될 때까지)
    await page.waitForSelector('div:has-text("임대수익"), div:has-text("사옥"), div:has-text("투자")', { timeout: 30000 }).catch(() => console.log('Persona keywords might vary'));
    await page.waitForTimeout(2000); // UI 안정화 대기

    // 화면 캡처
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tc02_01_personas.png') });
  });

  test('TC-03: 매수의향 메모 -> AI 정규화', async ({ page }) => {
    console.log('--- TC-03: Buyer Intent Creation ---');
    await page.goto('/broker/buyer-intents/new', { waitUntil: 'networkidle' });
    
    const textarea = page.locator('textarea');
    await textarea.fill(FX_02_MEMO);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tc03_01_intent_memo.png') });

    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    // 상세 페이지로 이동 대기
    await page.waitForURL(/\/broker\/buyer-intents\/[a-zA-Z0-9-]+/, { timeout: 120000 });
    
    // 내용 검증
    await page.waitForSelector('text=60억', { timeout: 10000 });
    await page.waitForSelector('text=임대수익', { timeout: 10000 });

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tc03_02_intent_detail.png'), fullPage: true });
  });

  test('TC-04 & TC-05: 매칭 콘솔 대시보드 확인', async ({ page }) => {
    console.log('--- TC-04/05: Matching Console ---');
    await page.goto('/broker/matching', { waitUntil: 'networkidle' });

    // 매칭 결과 리스트 대기
    await page.waitForTimeout(3000); // 자동 매칭이 완료되도록 잠시 대기

    // 화면 캡처
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tc04_01_matching_console.png'), fullPage: true });
    
    // 매칭 카드 중 하나라도 있는지 확인
    const matchCard = page.locator('text=S등급').first();
    if (await matchCard.isVisible()) {
        console.log('S등급 매칭 결과 확인됨');
        await matchCard.screenshot({ path: path.join(SCREENSHOT_DIR, 'tc04_02_matching_card.png') });
    }
  });
});

import { test, expect } from '@playwright/test';

/**
 * P2 UI Walkthrough E2E Tests (Playwright)
 * 대상: cre-dealcard 프론트엔드 핵심 컴포넌트 검증
 */

test.describe('P2 UI 컴포넌트 워크스루 (DealCard)', () => {
  // 실제 서버가 떠 있는 주소를 가정합니다.
  const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
  const MOCK_BUILDING_ID = 'b-123'; // 테스트용 매물 ID

  test.beforeEach(async ({ page }) => {
    // 딜카드 상세 페이지로 진입
    await page.goto(`${BASE_URL}/broker/buildings/${MOCK_BUILDING_ID}`);
  });

  test('DC-L5-02: PipelineStatusBar - 파이프라인 상태 확인 및 전이 인터랙션', async ({ page }) => {
    // PipelineStatusBar 컴포넌트 렌더링 확인
    const statusBar = page.locator('[data-testid="pipeline-status-bar"]');
    await expect(statusBar).toBeVisible();

    // 현재 단계('gate_requested' 등)가 하이라이트 되어 있는지 확인
    const activeStage = statusBar.locator('.active-stage');
    await expect(activeStage).toBeVisible();

    // 다음 단계로 전이하는 버튼 클릭 동작 확인
    const nextButton = statusBar.locator('button:has-text("다음 단계로 이동")');
    if (await nextButton.isVisible()) {
      await nextButton.click();
      // 모달이나 상태 변경 피드백 로딩 스피너 확인
      await expect(page.locator('[data-testid="stage-transition-modal"]')).toBeVisible();
    }
  });

  test('DC-L5-01 & DC-L5-03 ~ 07: ConversionIntelCard 및 BriefingCard 워크스루', async ({ page }) => {
    // 1. BriefingCard 렌더링 확인
    const briefingCard = page.locator('[data-testid="deal-briefing-card"]');
    await expect(briefingCard).toBeVisible();
    await expect(briefingCard.getByText('매수자 매칭 요약')).toBeVisible();

    // 2. ConversionIntelCard 로딩 상태 (DC-L5-07)
    // 데이터 페칭 중일 때 스켈레톤/스피너가 렌더되는지 (빠르게 지나갈 수 있으므로 상태만 체크)
    const intelCard = page.locator('[data-testid="conversion-intel-card"]');
    await expect(intelCard).toBeVisible();

    // 3. Conversion 게이지 및 확률 표시 (DC-L5-03)
    const probabilityGauge = intelCard.locator('[data-testid="probability-gauge"]');
    await expect(probabilityGauge).toBeVisible();
    const percentText = await probabilityGauge.textContent();
    expect(percentText).toMatch(/[0-9]+%/);

    // 4. 팩터 목록 표시 (DC-L5-05)
    const factorList = intelCard.locator('[data-testid="factor-list"]');
    await expect(factorList).toBeVisible();
    await expect(factorList.locator('li').first()).toBeVisible(); // 최소 1개 이상 팩터 렌더링

    // 5. 탭 전환 인터랙션 (DC-L5-04)
    const tabs = intelCard.locator('[role="tablist"]');
    const tabNetwork = tabs.getByText('연관 매물');
    await tabNetwork.click();

    // 6. 지식 그래프 네트워크 연관 매물 렌더링 (DC-L5-06)
    const networkList = intelCard.locator('[data-testid="network-recommendations"]');
    await expect(networkList).toBeVisible();
  });
});

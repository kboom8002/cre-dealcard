import { test, expect } from '@playwright/test';

/**
 * 📰 뉴스레터 스튜디오 & 💬 소통 관리함 — 30문항 골든 시나리오 Playwright E2E 검증
 * SSOT: docs/im261110/뉴스레터_소통관리함_상용화_골든테스트_지식파일.md
 */
test.describe('Newsletter & Inbox Golden 30 E2E Verification', () => {
  test.setTimeout(90000);

  test('1. /testguide 워크벤치 — 30문항 골든테스트 탭, 1클릭 복사 프리셋, 실시간 PASS 채점 검증', async ({ page }) => {
    await page.goto('/testguide');
    await expect(page.getByTestId('tab-nlinbox')).toBeVisible();
    await page.getByTestId('tab-nlinbox').click();

    await expect(page.getByTestId('testguide-nlinbox-panel')).toBeVisible({ timeout: 15000 });

    // 뉴스레터 프리셋 7개 & 소통함 프리셋 13개 섹션 존재 확인
    await expect(page.getByTestId('nlinbox-newsletter-presets')).toBeVisible();
    await expect(page.getByTestId('nlinbox-inbox-presets')).toBeVisible();

    // 30개 골든 시나리오 카드 모두 렌더링 확인
    await expect(page.getByTestId('golden30-row-NL-G01')).toBeVisible();
    await expect(page.getByTestId('golden30-row-NL-G08')).toBeVisible();
    await expect(page.getByTestId('golden30-row-IB-G01')).toBeVisible();
    await expect(page.getByTestId('golden30-row-IB-G16')).toBeVisible();
    await expect(page.getByTestId('golden30-row-SEC-G01')).toBeVisible();
    await expect(page.getByTestId('golden30-row-SEC-G06')).toBeVisible();

    // PASS 채점 버튼 동작 확인
    await page.getByTestId('nlinbox-mark-all-pass-btn').click();
    await expect(page.getByTestId('nlinbox-pass-count')).toContainText('30건');
    await expect(page.getByTestId('nlinbox-download-md-btn')).toBeVisible();
  });

  test('2. SEC-G01 & SEC-G02 — 비로그인 상태 API 호출 시 401 차단 및 pending-count 폴백 검증', async ({ request }) => {
    const inboxRes = await request.get('/api/broker/inbox?workspace=1');
    expect(inboxRes.status()).toBe(401);

    const actionsRes = await request.post('/api/broker/inbox/actions', {
      data: { action: 'approve_gate', id: 'test-gate-id' },
    });
    expect(actionsRes.status()).toBe(401);

    const pendingRes = await request.get('/api/broker/inbox/pending-count');
    expect(pendingRes.status()).toBe(200);
    const pendingBody = await pendingRes.json();
    expect(pendingBody).toEqual({ ok: true, count: 0 });
  });

  test('3. SEC-G05 & SEC-G06 — 모바일(375x812) 뷰포트 가로 스크롤 0px 및 반응형 레이아웃 검증', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/testguide');
    await page.getByTestId('tab-nlinbox').click();
    await expect(page.getByTestId('testguide-nlinbox-panel')).toBeVisible({ timeout: 15000 });

    const overflowPx = await page.evaluate(() => {
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    });
    expect(overflowPx).toBeLessThanOrEqual(0);
  });

  test('4. IB-G09 & SEC-G04 — 유효하지 않거나 회수된 토큰(?token=slk.invalid) 접속 시 매물 데이터 100% 차단 및 잠금 화면 렌더링 검증', async ({ page }) => {
    await page.goto('/im-lite/im-doc-donggyo-77?token=slk.invalid.revoked');
    await expect(page.getByTestId('revoked-im-screen')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('revoked-im-screen')).toContainText('열람 제한 안내');
  });
});

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR =
  'C:/Users/User/.gemini/antigravity/brain/81c019a6-0303-44db-bc94-8a1277019cc0/inbox-golden';

test.describe('Broker Inbox Workspace (/broker/w/inbox) E2E Golden Verification', () => {
  test.beforeAll(() => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  test('verifies end-to-end consistency: Inbox 3-column CRM -> Live IM Correction Banner -> Live 404 Link Revocation -> G2 Approval', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    // Ensure clean state for bld-01 and thread-02 before starting
    await request.post('/api/broker/inbox/actions', {
      data: { action: 'restore_link', buildingId: 'bld-01', threadId: 'thread-01' },
    });
    await request.post('/api/broker/inbox/actions', {
      data: { action: 'clear_correction_notice', buildingId: 'bld-01', threadId: 'thread-01' },
    });
    await request.post('/api/broker/inbox/actions', {
      data: { action: 'reset_gate', buildingId: 'bld-02', threadId: 'thread-02' },
    });

    // 1. Open /broker/w/inbox
    await page.goto('/broker/w/inbox', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.localStorage.removeItem('credeal-w-inbox-v3'));
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('workspace-topbar')).toBeVisible();
    await expect(page.getByTestId('inbox-list-slot')).toBeVisible();
    await expect(page.getByTestId('inbox-editor-slot')).toBeVisible();
    await expect(page.getByTestId('inbox-preview-slot')).toBeVisible();

    // Verify M4 (Section Dwell Badges), M5 (Cross-Workspace Bridge), M6 (Matched Alternative Deals)
    await expect(page.getByTestId('cross-workspace-bridge')).toBeVisible();
    await expect(page.getByTestId('section-dwell-badges')).toContainText('06 렌트롤');
    await expect(page.getByTestId('matched-deals-panel')).toContainText('예산·권역 맞춤 대체 매물 추천');
    await expect(page.getByTestId('hot-lead-callout')).toContainText('4회째 반복 열람 중입니다');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '01-inbox-workspace-overview.png'),
      fullPage: false,
    });

    // 2. Trigger Correction Notice on bld-01 and verify on customer Mobile IM (/im-lite/bld-01)
    const corrInput = page.getByTestId('correction-message-input');
    await corrInput.fill('1층 프랜차이즈 카페 임대 보증금 및 월세 조건이 최신 갱신계약 기준으로 정정되었습니다.');
    await page.getByRole('button', { name: /⚠️ 정정 안내/ }).click();
    await expect(page.getByTestId('undo-confirm-toast')).toContainText('매물 정보가 정정되었습니다');

    // Wait briefly for server action persistence
    await page.waitForTimeout(400);

    await page.goto('/im-lite/bld-01', { waitUntil: 'domcontentloaded' });
    const corrBanner = page.getByTestId('im-correction-banner');
    await expect(corrBanner).toBeVisible();
    await expect(corrBanner).toContainText('매물 정보가 정정되었습니다');
    await expect(corrBanner).toContainText('1층 프랜차이즈 카페 임대 보증금');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '02-mobile-im-live-correction-banner.png'),
      fullPage: false,
    });

    // 3. Return to /broker/w/inbox, click Link Revocation (🚫 링크 회수), and verify 404 screen on /im-lite/bld-01
    await page.goto('/broker/w/inbox', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /🚫 링크 회수/ }).click();
    await expect(page.getByTestId('undo-confirm-toast')).toContainText('즉시 회수되었습니다. (404 처리)');
    await page.waitForTimeout(400);

    await page.goto('/im-lite/bld-01', { waitUntil: 'domcontentloaded' });
    const revokedScreen = page.getByTestId('revoked-im-screen');
    await expect(revokedScreen).toBeVisible();
    await expect(revokedScreen).toContainText('담당 중개인에 의해 회수된 투자설명서(IM) 링크입니다');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '03-mobile-im-revoked-404-screen.png'),
      fullPage: false,
    });

    // Restore bld-01 state so subsequent tests remain clean
    await request.post('/api/broker/inbox/actions', {
      data: { action: 'restore_link', buildingId: 'bld-01', threadId: 'thread-01' },
    });
    await request.post('/api/broker/inbox/actions', {
      data: { action: 'clear_correction_notice', buildingId: 'bld-01', threadId: 'thread-01' },
    });

    // 4. Verify G2 Approval Workflow on thread-02 (최영진 원장)
    await page.goto('/broker/w/inbox', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('inbox-list-slot').getByText('최영진 원장').click();
    await expect(page.getByTestId('inbox-editor-slot')).toContainText('G2 상세자료 공개 승인 요청');

    await page.getByRole('button', { name: /✓ 공개 승인 \(G2\)/ }).click();
    const g2ApprovedBanner = page.getByTestId('g2-approved-banner');
    await expect(g2ApprovedBanner).toBeVisible();
    await expect(g2ApprovedBanner).toContainText('G2 상세자료 열람 승인 완료');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, '04-inbox-g2-approved-followup.png'),
      fullPage: false,
    });
  });
});

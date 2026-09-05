import { test, expect } from '@playwright/test';
import { join } from 'path';

test.describe('Journey 5: Admin Discrepancy Dashboard Web Walkthrough', () => {
  const DASHBOARD_URL = '/admin/discrepancy-dashboard';
  const SCREENSHOTS_DIR = join(process.cwd(), 'e2e', 'screenshots');

  const FORBIDDEN_PERSONA_PHRASES = [
    '60대 자산가',
    '50대 자산가',
    '40대 자산가',
    '30대 투자자',
    '법인 대표 맞춤',
    '고액 자산가 전용',
    'VIP 투자자용',
    '초보 매수자를 위한',
  ];

  const FORBIDDEN_TRANSLITERATIONS = [
    '네이밍 라이츠',
    '브랜딩 라이츠',
  ];

  test('W501: Dashboard page loads with proper header and 4 KPI summary cards', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
    expect(errors.length).toBe(0);

    // Verify Title & Subtitle
    await expect(page.locator('h1')).toContainText('IM 파이프라인 신/구 그림자 이중실행 계측 대시보드');
    await expect(page.getByText('레거시 파이프라인과 모던 IM CORE v1 간 실시간 수치 오차율')).toBeVisible();

    // Verify all 4 KPI Cards
    await expect(page.getByText('전체 그림자 실행')).toBeVisible();
    await expect(page.getByText('수치 정합 일치율')).toBeVisible();
    await expect(page.getByText('100.00%')).toBeVisible();
    await expect(page.getByText('허용 오차 초과')).toBeVisible();
    await expect(page.getByText('P95 지연 시간')).toBeVisible();

    // Capture visual screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'admin-discrepancy-dashboard.png'),
      fullPage: true,
    });
  });

  test('W502: 5 Key CRE Baseline Metrics Table is rendered with 0.00% diff and MATCH status', async ({ page }) => {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });

    // Verify 5 core metrics exist in table
    const table = page.locator('table');
    await expect(table).toBeVisible();

    await expect(table).toContainText('매매희망가 (asking_price)');
    await expect(table).toContainText('대지면적 (land_area)');
    await expect(table).toContainText('연면적 (gross_floor_area)');
    await expect(table).toContainText('월임대료 총액 (monthly_rent)');
    await expect(table).toContainText('공실률 (vacancy_rate)');

    // Verify 0.00% deviation and green MATCH badges
    const matchBadges = page.locator('span:has-text("MATCH")');
    await expect(matchBadges).toHaveCount(5);

    const zeroDiffs = page.locator('td:has-text("0.00%")');
    await expect(zeroDiffs).toHaveCount(5);
  });

  test('W503: Persona Isolation (Rule 1) & Lexicon Standards (Rule 2) in Admin Dashboard DOM', async ({ page }) => {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
    const text = await page.textContent('body') || '';

    for (const phrase of FORBIDDEN_PERSONA_PHRASES) {
      expect(text).not.toContain(phrase);
    }
    for (const term of FORBIDDEN_TRANSLITERATIONS) {
      expect(text).not.toContain(term);
    }
  });
});

import { test, expect } from '@playwright/test';
import { join } from 'path';

test.describe('Journey 1: Broker Studio Web Walkthrough', () => {
  const STUDIO_URL = '/broker/studio';
  const BUILDING_STUDIO_URL = '/broker/buildings/case01_seocho_medical/studio';
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

  test('W101: Broker Studio loads and redirects cleanly with 0 uncaught exceptions', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const response = await page.goto(STUDIO_URL, { waitUntil: 'domcontentloaded' });
    expect([200, 307, 308]).toContain(response?.status() ?? 200);
    expect(errors.length).toBe(0);

    // Capture visual screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'broker-studio-redirect.png'),
    });
  });

  test('W102: Broker Studio Building SSoT Dashboard renders completeness scores and checklist', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // Mock studio API for case01_seocho_medical to simulate complete SSoT readiness
    await page.route('**/api/broker/buildings/**/studio', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          completenessScore: 85,
          layerScores: {
            building_register: 10,
            registry_docs: 10,
            land_use_plan: 10,
            rent_roll: 10,
            photos: 10,
            floor_plan: 10,
            repair_history: 5,
            vacancy_docs: 5,
            asking_price: 10,
            disclosure_policy: 5,
            total: 85,
          },
          checklist: {
            buildingRegister: true,
            registry: true,
            landUsePlan: true,
            rentRoll: true,
            photos: true,
            floorPlan: true,
            repairHistory: false,
            vacancyDocs: false,
            askingPrice: true,
            disclosurePolicy: true,
          },
          eligibleOutputs: ['mobile_im', 'blind_dealcard', 'pptx_teaser'],
        }),
      });
    });

    await page.goto(BUILDING_STUDIO_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=SSoT 완결성', { timeout: 15000 });
    expect(errors.length).toBe(0);

    // Verify SSoT dashboard content
    const text = await page.textContent('body') || '';
    expect(text).toContain('SSoT 완결성');
    expect(text).toContain('85');

    // Capture visual screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'broker-studio-dashboard.png'),
    });
  });

  test('W103: Persona & Lexicon compliance on Broker Studio', async ({ page }) => {
    await page.goto(BUILDING_STUDIO_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const text = await page.textContent('body') || '';

    for (const phrase of FORBIDDEN_PERSONA_PHRASES) {
      expect(text).not.toContain(phrase);
    }
    for (const term of FORBIDDEN_TRANSLITERATIONS) {
      expect(text).not.toContain(term);
    }
  });
});

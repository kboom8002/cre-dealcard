/**
 * e2e/auth.setup.ts
 *
 * Playwright 인증 셋업 — 로그인 페이지에서 이메일/비밀번호로 로그인하고
 * storageState를 저장하여 이후 테스트에서 인증 세션을 재사용합니다.
 */
import { test as setup, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const authFile = path.resolve(__dirname, '.auth/user.json');

setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'E2E_TEST_EMAIL / E2E_TEST_PASSWORD가 .env.local에 없습니다.\n' +
      '먼저 실행: npx tsx e2e/setup/create-test-user.ts'
    );
  }

  console.log(`🔐 로그인 시도: ${email}`);

  // 1. 로그인 페이지 접속
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // 2. 이메일/비밀번호 입력
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);

  // 3. 로그인 버튼 클릭
  await page.getByRole('button', { name: '로그인' }).click();

  // 4. /broker 리다이렉트 대기 (로그인 성공 시)
  await page.waitForURL('**/broker**', { timeout: 30_000 });
  console.log('✅ 로그인 성공, 리다이렉트 완료');

  // 5. storageState 저장 (쿠키 + localStorage)
  await page.context().storageState({ path: authFile });
  console.log(`✅ storageState 저장: ${authFile}`);
});

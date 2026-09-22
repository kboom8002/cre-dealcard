const { chromium, request } = require('playwright');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const ARTIFACT_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\26f684f7-f120-455a-96d6-662c12789f8d';
const TARGET_URL = 'http://localhost:3000';
const BUILDING_ID = 'd2acdd2c-d686-435a-9cba-606eafd0860b';

(async () => {
  console.log('Starting Playwright...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Logging in to localhost...');
    await page.goto(`${TARGET_URL}/login`);
    await page.fill('input[type="email"], #email', process.env.E2E_TEST_EMAIL);
    await page.fill('input[type="password"], #password', process.env.E2E_TEST_PASSWORD);
    await page.click('button:has-text("로그인")');
    await page.waitForURL('**/broker**', { timeout: 30000 });
    console.log('Logged in successfully!');

    const apiContext = await request.newContext({
      baseURL: TARGET_URL,
      storageState: await context.storageState()
    });

    let projectId = '';
    let slideId = '';

    console.log('\n--- TC-ST01: 프로젝트 생성 (POST) ---');
    const postRes = await apiContext.post('/api/broker/basic-im-studio', {
      data: { buildingId: BUILDING_ID }
    });
    console.log(`Status: ${postRes.status()}`);
    if (postRes.ok()) {
      const data = await postRes.json();
      console.log(`Success! Project ID: ${data.project?.id}, isExisting: ${data.isExisting}`);
      projectId = data.project?.id;
      slideId = data.project?.slides?.[0]?.id; // Get the first slide (Cover)
    } else {
      console.error(await postRes.text());
      return;
    }

    console.log('\n--- TC-ST03: 프로젝트 조회 (GET) ---');
    const getRes = await apiContext.get(`/api/broker/basic-im-studio/${projectId}`);
    console.log(`Status: ${getRes.status()}`);
    if (getRes.ok()) {
       const data = await getRes.json();
       console.log(`Success! Retrieved project with ${data.project?.slides?.length} slides.`);
    } else {
       console.error(await getRes.text());
    }

    console.log('\n--- TC-ST08: 슬라이드 업데이트 (PATCH) ---');
    if (slideId) {
      const patchRes = await apiContext.patch(`/api/broker/basic-im-studio/${projectId}`, {
        data: {
          slideId,
          overrides: { customTitle: '커스텀 테스트 제목' },
          expectedLockVersion: 1
        }
      });
      console.log(`Status: ${patchRes.status()}`);
      if (patchRes.ok()) {
        const data = await patchRes.json();
        console.log(`Success! New lockVersion: ${data.project?.lockVersion}`);
      } else {
        console.error(await patchRes.text());
      }

      console.log('\n--- TC-ST09: Optimistic Locking 충돌 (PATCH with old lockVersion) ---');
      const conflictRes = await apiContext.patch(`/api/broker/basic-im-studio/${projectId}`, {
        data: {
          slideId,
          overrides: { customTitle: '충돌 테스트' },
          expectedLockVersion: 1 // Expected to fail
        }
      });
      console.log(`Status: ${conflictRes.status()} (Expected 409)`);
      if (conflictRes.status() === 409) {
        console.log('Conflict successfully detected (409 STALE_LOCK_ERROR)');
      }
    }

    console.log('\n--- TC-ST11: PPTX 다운로드 (GET) ---');
    const downloadRes = await apiContext.get(`/api/broker/basic-im-studio/${projectId}/download`, { timeout: 60000 });
    console.log(`Status: ${downloadRes.status()}`);
    if (downloadRes.ok()) {
      const headers = downloadRes.headers();
      console.log('Headers:', {
        'content-type': headers['content-type'],
        'x-slide-count': headers['x-slide-count'],
        'x-file-size': headers['x-file-size']
      });
      const body = await downloadRes.body();
      fs.writeFileSync(path.join(ARTIFACT_DIR, 'studio_basic.pptx'), body);
      console.log(`Saved studio_basic.pptx (${body.length} bytes)`);
    } else {
      console.error(await downloadRes.text());
    }

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
})();

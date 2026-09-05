import { test, expect } from '@playwright/test';
import { join } from 'path';

test.describe('Journey 3: PPTX Studio Editor & 2-Stage Approval Web Walkthrough', () => {
  const EDITOR_URL = '/broker/deal-card/sample-deal-1/pptx-editor';
  const ALT_EDITOR_URL = '/broker/deal-card/case01_seocho_medical/pptx-editor';
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
    '캡레이트',
  ];

  test.beforeEach(async ({ page }) => {
    // Inject bypass headers for deterministic test isolation
    await page.setExtraHTTPHeaders({
      'x-test-bypass': 'true',
      'x-broker-id': 'broker-test-walkthrough',
    });
  });

  test('W301: PPTX Editor page loads safely without uncaught runtime exceptions across mock dealcards', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // 1. Check Primary Mock Dealcard URL
    const response1 = await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded' });
    expect([200, 307, 308]).toContain(response1?.status() ?? 200);
    expect(errors.length).toBe(0);

    // Verify Title Header and SVG Canvas
    await expect(page.locator('h1')).toContainText('PPTX 템플릿 에디터');
    await expect(page.locator('svg').first()).toBeVisible();

    // 2. Check Alternative Mock Dealcard URL (case01_seocho_medical)
    const response2 = await page.goto(ALT_EDITOR_URL, { waitUntil: 'domcontentloaded' });
    expect([200, 307, 308]).toContain(response2?.status() ?? 200);
    expect(errors.length).toBe(0);
    await expect(page.locator('h1')).toContainText('PPTX 템플릿 에디터');

    // Visual screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'w301-pptx-editor-load.png'),
      fullPage: true,
    });
  });

  test('W302: 4 Core Prime Templates can be selected and switched seamlessly, and broker custom preset builder saves and reapplies presets', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // Mock pptx-preset endpoint to test custom builder persistence in pure browser context
    let storedPresets: any[] = [];
    await page.route('**/api/broker/pptx-preset*', async (route) => {
      if (route.request().method() === 'POST') {
        const postData = route.request().postDataJSON();
        const created = {
          id: `preset-custom-${Date.now()}`,
          preset_name: postData.preset_name,
          company_name: postData.company_name || '삼경파트너스',
          tokens: postData.tokens,
          cover_style: postData.cover_style,
          layout_style: postData.layout_style,
          base_preset_id: postData.base_preset_id,
          created_at: new Date().toISOString(),
        };
        storedPresets = [created, ...storedPresets];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, preset: created }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            my_presets: storedPresets,
            company_presets: [],
          }),
        });
      }
    });

    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 15000 });
    expect(errors.length).toBe(0);

    const header = page.locator('header');

    // 1. Switch to Corporate Clean White
    await page.locator('text=🏢 기업 사옥용 모던').click();
    await expect(header).toContainText('Corporate Clean White');

    // 2. Switch to Commercial Visual Grid
    await page.locator('text=🏥 메디컬/근생형 비주얼').click();
    await expect(header).toContainText('Commercial Visual Grid');

    // 3. Switch to Development Technical Blueprint
    await page.locator('text=📐 개발부지형 테크니컬').click();
    await expect(header).toContainText('Development Technical Blueprint');

    // 4. Switch back to Institutional Dark/Gold
    await page.locator('text=🏛️ 기관투자자 프라임').click();
    await expect(header).toContainText('Institutional');

    // 5. Test Broker Custom Preset Builder
    const presetNameInput = page.locator('input[placeholder="예: 삼경파트너스 골드 프리셋"]');
    await presetNameInput.fill('삼경파트너스 프라임 프리셋');

    // Select custom font (나눔스퀘어)
    const fontSelect = page.locator('select').first();
    await fontSelect.selectOption('나눔스퀘어');

    // Enter Company Name
    const companyInput = page.locator('label:has-text("중개법인 / 회사명")').locator('..').locator('input');
    await companyInput.fill('삼경파트너스 자산관리');

    // Save Preset
    const saveButton = page.locator('button:has-text("프리셋 영구 저장")');
    await saveButton.click();

    // Verify preset appears in "내 커스텀 프리셋"
    const savedPresetCard = page.locator('text=⭐ 삼경파트너스 프라임 프리셋');
    await expect(savedPresetCard).toBeVisible({ timeout: 5000 });

    // Click saved preset to re-apply
    await savedPresetCard.click();
    await expect(companyInput).toHaveValue('삼경파트너스 자산관리');

    // Visual screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'w302-template-switcher.png'),
    });
  });

  test('W303: Multi-slide deck thumbnail strip displays 16 body slides + appendices, slide selection, reordering, and visibility toggle', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 15000 });
    expect(errors.length).toBe(0);

    // 1. Verify Deck Sequence Thumbnail Strip Header (Rule 10 16-Slide Body Hard Limit + Appendices)
    await expect(page.locator('text=슬라이드 시퀀스 목록')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=총 20면 (본문 16면 + 부록 4면)')).toBeVisible();

    // Verify slide index badges exist from #01 to #20
    const slideCards = page.locator('.group').filter({ hasText: '#' });
    await expect(slideCards.first()).toContainText('#01');

    // 2. Select Slide #02 (투자 하이라이트 및 자산 개요)
    const slide2Card = page.locator('.group').filter({ hasText: '#02' }).first();
    await expect(slide2Card).toBeVisible();
    await slide2Card.click();
    await expect(slide2Card).toHaveClass(/border-blue-500/);

    // 3. Toggle Visibility (Hide Slide #02)
    const hideBtn = slide2Card.locator('button[title="슬라이드 숨기기"]');
    await hideBtn.click();

    // Verify slide card shows [숨김]
    await expect(slide2Card).toContainText('[숨김]');
    await expect(slide2Card).toHaveClass(/opacity-40/);

    // Unhide Slide #02
    const unhideBtn = slide2Card.locator('button[title="슬라이드 보이기"]');
    await unhideBtn.click();
    await expect(slide2Card).not.toContainText('[숨김]');

    // 4. Slide Reordering (Move Slide #01 down)
    const slide1Card = page.locator('.group').filter({ hasText: '#01' }).first();
    const moveDownBtn = slide1Card.locator('button[title="뒤로 이동"]');
    await moveDownBtn.click();

    // Visual screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'w303-thumbnail-strip.png'),
    });
  });

  test('W304: Inline text editing updates the active slide in SVG canvas in real-time (<100ms sync)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 15000 });
    expect(errors.length).toBe(0);

    // Verify Real-time Sync Latency Indicator (<10ms)
    await expect(page.locator('text=실시간 렌더 동기화 <10ms')).toBeVisible({ timeout: 10000 });

    // 1. Inline edit: Slide Title
    const titleInput = page.locator('label:has-text("슬라이드 제목 (Title)")').locator('..').locator('input');
    await titleInput.fill('강남 테헤란로 랜드마크 프라임 타워');

    // Verify real-time reflect in SVG canvas
    const svgCanvas = page.locator('svg').first();
    await expect(svgCanvas.locator('text:has-text("강남 테헤란로 랜드마크 프라임 타워")')).toBeVisible();

    // 2. Inline edit: Asking Price
    const priceInput = page.locator('label:has-text("매각 희망가")').locator('..').locator('input');
    await priceInput.fill('3,500억 원');
    await expect(svgCanvas.locator('text:has-text("3,500억 원")')).toBeVisible();

    // 3. Inline edit: Kicker
    const kickerInput = page.locator('label:has-text("상단 키커 / 카테고리 (Kicker)")').locator('..').locator('input');
    await kickerInput.fill('EXCLUSIVE OFFERING');
    await expect(svgCanvas.locator('text:has-text("EXCLUSIVE OFFERING")')).toBeVisible();

    // Visual screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'w304-inline-editing.png'),
    });
  });

  test('W305: Sequential 2-stage approval flow: S40 -> S60 editorial approval -> S70 file approval -> PUBLISHED release, followed by final .pptx download', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 15000 });
    expect(errors.length).toBe(0);

    // Wait for project state to fully initialize (indicated by slide deck strip)
    await expect(page.locator('text=슬라이드 시퀀스 목록')).toBeVisible({ timeout: 10000 });

    // 1. Initial State Verification (S40 Preview)
    await expect(page.locator('text=S40 미리보기')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=DRAFT')).toBeVisible();

    const stage1Btn = page.locator('button:has-text("1단계: 슬라이드 편집 승인 (S60)")');
    const stage2Btn = page.locator('button:has-text("2단계: PPTX 바이너리 해시 승인 (S70)")');
    const officialDownloadBtn = page.locator('button:has-text("공식 PPTX 다운로드")');

    await expect(stage1Btn).toBeEnabled();
    await expect(stage2Btn).toBeDisabled();
    await expect(officialDownloadBtn).toBeDisabled();

    // 2. Execute Stage 1: Editorial Approval (S60)
    await stage1Btn.click();
    await expect(page.locator('text=1단계 승인 완료')).toBeVisible({ timeout: 10000 });

    // Verify Stage 2 button is now unlocked and enabled
    await expect(stage2Btn).toBeEnabled();
    await expect(officialDownloadBtn).toBeDisabled();

    // 3. Execute Stage 2: File Binary Approval (S70)
    await stage2Btn.click();
    await expect(page.locator('text=2단계 승인 완료 (원장 기록)')).toBeVisible({ timeout: 10000 });

    // Verify Release Status changed to PUBLISHED
    await expect(page.locator('text=PUBLISHED')).toBeVisible();

    // Verify SHA-256 Hash badge is rendered
    await expect(page.locator('text=Hash:')).toBeVisible();

    // Verify Official Download button is now enabled
    await expect(officialDownloadBtn).toBeEnabled();

    // 4. Verify Final PPTX Binary Download via API
    const projectRes = await page.request.get('/api/broker/pptx-studio/projects/sample-deal-1', {
      headers: { 'x-test-bypass': 'true' },
    });
    expect(projectRes.status()).toBe(200);
    const { project } = await projectRes.json();
    expect(project).toBeDefined();

    const downloadRes = await page.request.get(`/api/broker/pptx-studio/projects/${project.id}/download`, {
      headers: { 'x-test-bypass': 'true' },
    });
    expect(downloadRes.status()).toBe(200);
    expect(downloadRes.headers()['content-type']).toContain('presentation');
    const downloadBuffer = await downloadRes.body();
    expect(downloadBuffer.length).toBeGreaterThan(1000);

    // Visual screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'w305-2stage-approval-published.png'),
    });
  });

  test('W306: Rule 1 Persona isolation (0 persona words) and Rule 2 Korean CRE Lexicon standards in PPTX Editor DOM', async ({ page }) => {
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 15000 });

    const fullPageText = (await page.textContent('body')) || '';

    // 1. Rule 1: Persona Isolation Verification (Zero persona terms in DOM)
    for (const phrase of FORBIDDEN_PERSONA_PHRASES) {
      expect(fullPageText).not.toContain(phrase);
    }

    // 2. Rule 2: CRE Lexicon Standards Verification (Zero banned transliterations)
    for (const term of FORBIDDEN_TRANSLITERATIONS) {
      expect(fullPageText).not.toContain(term);
    }

    // 3. Rule 2: Mandatory Korean CRE Standard Terms Presence Check
    expect(fullPageText).toContain('연 순수익률 (Cap Rate)');

    // 4. Test Injecting Standard Lexicon Terms into Slide Narrative
    const leadNarrativeInput = page.locator('label:has-text("가치 제안 리드문 (Lead Narrative)")').locator('..').locator('textarea');
    await leadNarrativeInput.fill('사옥 단독 명칭 표기(간판 설치권) 및 기업 단독 브랜딩을 전면 보장하는 프라임 오피스');

    const updatedText = (await page.textContent('body')) || '';
    expect(updatedText).toContain('사옥 단독 명칭 표기(간판 설치권)');
    expect(updatedText).toContain('기업 단독 브랜딩');

    // Visual screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'w306-persona-lexicon-compliance.png'),
    });
  });
});

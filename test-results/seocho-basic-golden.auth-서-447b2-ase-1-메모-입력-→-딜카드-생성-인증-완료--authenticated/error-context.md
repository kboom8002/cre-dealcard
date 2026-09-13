# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: seocho-basic-golden.auth.spec.ts >> 서초동 FM빌딩 Basic IM 골든 테스트 (Rule 47 준거) >> Phase 1: 메모 입력 → 딜카드 생성 (인증 완료)
- Location: e2e\seocho-basic-golden.auth.spec.ts:60:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 180000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - region "Notifications alt+T"
  - main [ref=f1e2]:
    - generic [ref=f1e3]:
      - generic [ref=f1e8]:
        - heading "동일한 물건이 감지되었습니다" [level=1] [ref=f1e9]
        - paragraph [ref=f1e10]: 이미 등록된 물건과 동일한 주소가 포함되어 있습니다.
      - generic [ref=f1e12]:
        - generic [ref=f1e14]:
          - generic [ref=f1e15]: 지번 일치 (95%)
          - paragraph [ref=f1e17]: 서초·양재권역 · 상가빌딩
          - paragraph [ref=f1e18]: 200억대 · 9월 13일 등록
        - button "이 물건 업데이트" [ref=f1e19]
      - generic [ref=f1e25]:
        - button "다른 물건이에요 — 새로 만들기" [ref=f1e26]
        - button "취소하고 메모 수정하기" [ref=f1e28]
  - button "Open Next.js Dev Tools" [ref=f1e37] [cursor=pointer]
  - alert [ref=f1e41]
```

# Test source

```ts
  1   | /**
  2   |  * e2e/seocho-basic-golden.auth.spec.ts
  3   |  *
  4   |  * 서초동 1364-28 FM빌딩 실매물 데이터 기반 Basic IM 전구간 골든 테스트:
  5   |  * Phase 1: 서초동 메모 입력 → 딜카드 생성
  6   |  * Phase 2: 바텀시트 오픈 → 포스처(임대수익) → 주소/PNU → 사진 7장 → R2 렌트롤 → Basic IM 생성 & 승인
  7   |  * Phase 3: 모바일 IM 뷰어 레이아웃 & 스태킹 플랜 검증
  8   |  * Phase 4: PPTX 다운로드 및 AdmZip 바이너리 무결성 + 콘텐츠 정합성 7종 단언
  9   |  * Phase 5: LibreOffice 150 DPI 고화질 슬라이드 PNG 변환 및 시각 검증
  10  |  *
  11  |  * Rule 4: AI 시각 무결성 (150 DPI PNG 캡처 및 육안 검사)
  12  |  * Rule 41: 프로덕션 골든 테스트 (Next.js dev server + Playwright + Supabase 실DB)
  13  |  * Rule 43: 외부 API 실호출 (카카오 지도, V-World WMS 지적도)
  14  |  * Rule 45: R2 렌트롤 Basic IM 시각화 보장
  15  |  * Rule 47: Basic IM 스펙 SSOT (docs/impipe/basic-im-guide.md 표준 9단계)
  16  |  *
  17  |  * 실행: npx playwright test e2e/seocho-basic-golden.auth.spec.ts --project=authenticated
  18  |  */
  19  | import { test, expect, type Page } from '@playwright/test';
  20  | import { createHash } from 'crypto';
  21  | import * as path from 'path';
  22  | import * as fs from 'fs';
  23  | import { convertPptxToSlideImages } from '../src/tests/e2e/pptx-slide-capturer';
  24  | 
  25  | // im-core/target-hash.ts 동일 로직
  26  | function canonicalizeJson(obj: unknown): string {
  27  |   if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  28  |   if (Array.isArray(obj)) return '[' + obj.map(canonicalizeJson).join(',') + ']';
  29  |   const keys = Object.keys(obj as Record<string, unknown>).sort();
  30  |   return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalizeJson((obj as Record<string, unknown>)[k])).join(',') + '}';
  31  | }
  32  | 
  33  | function computeTargetHash(body: unknown, releaseTier = 'fact_om') {
  34  |   const { targetHash, approval_target_hash, ...rest } = (body && typeof body === 'object' && !Array.isArray(body))
  35  |     ? body as Record<string, unknown> : {} as Record<string, unknown>;
  36  |   const payload = { body: rest, releaseTier, policyVersion: '2026-08-31' };
  37  |   return 'sha256:' + createHash('sha256').update(canonicalizeJson(payload), 'utf-8').digest('hex');
  38  | }
  39  | 
  40  | const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots', 'seocho-basic-golden');
  41  | const VISUAL_QA_DIR = path.resolve(process.cwd(), 'docs', 'test', 'stress', 'e2e-outputs', 'visual-qa', 'seocho-basic');
  42  | let stepCounter = 0;
  43  | 
  44  | function ensureDir(dir: string) {
  45  |   if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  46  | }
  47  | 
  48  | async function shot(page: Page, label: string) {
  49  |   ensureDir(SCREENSHOT_DIR);
  50  |   stepCounter++;
  51  |   const filePath = path.join(SCREENSHOT_DIR, `${String(stepCounter).padStart(2, '0')}-${label}.png`);
  52  |   await page.screenshot({ path: filePath, fullPage: true });
  53  |   console.log(`📸 [${stepCounter}] ${label}`);
  54  |   return filePath;
  55  | }
  56  | 
  57  | test.describe('서초동 FM빌딩 Basic IM 골든 테스트 (Rule 47 준거)', () => {
  58  |   test.setTimeout(600_000); // 10분 — LLM 호출 및 이미지 변환 포함
  59  | 
  60  |   test('Phase 1: 메모 입력 → 딜카드 생성 (인증 완료)', async ({ page }) => {
  61  |     console.log('\n🔷 Phase 1: 서초동 메모로 딜카드 생성');
  62  | 
  63  |     // 1. 인증 확인
  64  |     await page.goto('/broker');
  65  |     await page.waitForLoadState('networkidle');
  66  |     expect(page.url()).not.toContain('/login');
  67  |     console.log('  ✅ 인증 세션 확인');
  68  | 
  69  |     // 2. 딜카드 생성 페이지 진입
  70  |     await page.goto('/broker/deal-card/new');
  71  |     await page.waitForLoadState('networkidle');
  72  |     await shot(page, 'deal-card-new');
  73  | 
  74  |     // 3. 서초동 실매물 메모 텍스트 입력
  75  |     const memo = `[매각 IM] 서초동 1364-28 FM빌딩
  76  | 양재역 도보 5분, 양재역 동북부 먹자골목 상권.
  77  | 대지 180.3평, 연면적 636.7평, 매각가 230억 (토지평당 약 7천만).
  78  | 2, 4, 5층 (3개층) 공실. 총 보증금 2.9억 / 월세 2195만.`;
  79  | 
  80  |     await page.locator('#broker-memo-input').fill(memo);
  81  |     await shot(page, 'memo-filled');
  82  | 
  83  |     // 4. 생성 CTA 클릭
  84  |     await page.locator('#cta-generate-deal-card').click();
  85  |     console.log('  ⏳ 딜카드 생성 요청...');
  86  |     await shot(page, 'generating-deal-card');
  87  | 
  88  |     // 중복 물건 다이얼로그 대응 (이전에 생성된 적이 있을 경우)
  89  |     try {
  90  |       const duplicateModal = page.locator('button:has-text("새로 만들기"), button:has-text("신규 생성")').first();
  91  |       if (await duplicateModal.isVisible({ timeout: 4000 })) {
  92  |         console.log('  ⚠️ 중복 물건 감지 → "새로 만들기" 클릭');
  93  |         await duplicateModal.click();
  94  |       }
  95  |     } catch { /* ignore */ }
  96  | 
  97  |     // 5. 생성 완료 URL 대기
> 98  |     await page.waitForURL(/\/broker\/deal-card\/[a-f0-9]{8}-/, { timeout: 180_000 });
      |                ^ TimeoutError: page.waitForURL: Timeout 180000ms exceeded.
  99  |     const dealCardUrl = page.url();
  100 |     const buildingId = dealCardUrl.match(/deal-card\/([a-f0-9-]+)/)?.[1];
  101 |     expect(buildingId).toBeTruthy();
  102 |     console.log(`  ✅ 딜카드 생성 성공: ${buildingId}`);
  103 | 
  104 |     await page.waitForLoadState('networkidle');
  105 |     await page.waitForTimeout(2000);
  106 |     await shot(page, 'deal-card-created');
  107 | 
  108 |     ensureDir(SCREENSHOT_DIR);
  109 |     fs.writeFileSync(path.join(SCREENSHOT_DIR, 'building-id.txt'), buildingId!);
  110 |   });
  111 | 
  112 |   test('Phase 2: 바텀시트 오픈 → 데이터 주입 → Basic IM 비동기 생성', async ({ page }) => {
  113 |     console.log('\n🔷 Phase 2: Basic 바텀시트 데이터 주입 & 생성');
  114 | 
  115 |     const idFile = path.join(SCREENSHOT_DIR, 'building-id.txt');
  116 |     expect(fs.existsSync(idFile)).toBe(true);
  117 |     const buildingId = fs.readFileSync(idFile, 'utf-8').trim();
  118 | 
  119 |     await page.goto(`/broker/deal-card/${buildingId}`);
  120 |     await page.waitForLoadState('networkidle');
  121 |     await page.waitForTimeout(2000);
  122 |     await shot(page, 'deal-card-detail');
  123 | 
  124 |     // 1. ⚡ 기본 IM 버튼 클릭
  125 |     const basicBtnSelectors = [
  126 |       '#cta-mobile-im-basic',
  127 |       'button:has-text("⚡ 기본 IM")',
  128 |       'button:has-text("기본 IM")',
  129 |       'button:has-text("IM 생성")',
  130 |     ];
  131 | 
  132 |     let sheetOpened = false;
  133 |     for (const sel of basicBtnSelectors) {
  134 |       const btn = page.locator(sel).first();
  135 |       try {
  136 |         if (await btn.isVisible({ timeout: 2500 })) {
  137 |           console.log(`  ✅ 기본 IM 버튼 클릭: "${sel}"`);
  138 |           await btn.click();
  139 |           sheetOpened = true;
  140 |           break;
  141 |         }
  142 |       } catch { /* next */ }
  143 |     }
  144 | 
  145 |     if (!sheetOpened) {
  146 |       await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  147 |       await page.waitForTimeout(1000);
  148 |       for (const sel of basicBtnSelectors) {
  149 |         const btn = page.locator(sel).first();
  150 |         try {
  151 |           if (await btn.isVisible({ timeout: 2000 })) {
  152 |             await btn.click();
  153 |             sheetOpened = true;
  154 |             break;
  155 |           }
  156 |         } catch { /* next */ }
  157 |       }
  158 |     }
  159 |     expect(sheetOpened).toBe(true);
  160 |     await page.waitForTimeout(1500);
  161 |     await shot(page, 'bottom-sheet-opened');
  162 | 
  163 |     // 2. 포스처: 💰 임대수익 선택
  164 |     const incomePostureBtn = page.locator('button:has-text("💰 임대수익"), button:has-text("임대수익")').first();
  165 |     try {
  166 |       if (await incomePostureBtn.isVisible({ timeout: 2000 })) {
  167 |         await incomePostureBtn.click();
  168 |         console.log('  ✅ 포스처: 임대수익 선택');
  169 |       }
  170 |     } catch { /* ignore */ }
  171 | 
  172 |     // 3. 주소 검색 및 PNU 확정
  173 |     const pnuBtn = page.locator('button:has-text("PNU")').first();
  174 |     let pnuSelected = false;
  175 |     try {
  176 |       if (await pnuBtn.isVisible({ timeout: 3000 })) {
  177 |         await pnuBtn.click();
  178 |         pnuSelected = true;
  179 |         console.log('  ✅ 자동 감지된 PNU 선택');
  180 |       }
  181 |     } catch { /* manual search below */ }
  182 | 
  183 |     if (!pnuSelected) {
  184 |       console.log('  🔍 수동 주소 검색: "서초동 1364-28"');
  185 |       const addrInput = page.locator('input[placeholder*="동/도로명"]').first();
  186 |       await addrInput.waitFor({ state: 'visible', timeout: 5000 });
  187 |       await addrInput.fill('서초동 1364-28');
  188 |       await page.getByRole('button', { name: '검색' }).first().click();
  189 |       await page.waitForTimeout(3000);
  190 |       const searchResultBtn = page.locator('button:has-text("PNU")').first();
  191 |       await searchResultBtn.waitFor({ state: 'visible', timeout: 8000 });
  192 |       await searchResultBtn.click();
  193 |       console.log('  ✅ 검색 결과 PNU 확정 완료');
  194 |     }
  195 |     await page.waitForTimeout(1500);
  196 |     await shot(page, 'pnu-confirmed');
  197 | 
  198 |     // 4. 실사진 7장 업로드 (docs/real-test/05-seocho-income/images/)
```
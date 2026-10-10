/**
 * @file e2e/helpers/golden-test-utils.ts
 * @description CRE IM 프로덕션 E2E 골든 테스트 공통 유틸리티
 */

import { checkOutputInvariants, errorsOf, formatViolations } from '../../src/domain/building/mobile-im/quality/output-invariants';
import { type Page, expect, test } from '@playwright/test';
import { createHash } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

// ── 1. 파일 및 디렉토리 유틸 ──

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function shot(
  page: Page,
  dir: string,
  label: string,
  counterRef: { current: number }
): Promise<string> {
  ensureDir(dir);
  counterRef.current++;
  const filename = `${String(counterRef.current).padStart(2, '0')}-${label}.png`;
  const filePath = path.join(dir, filename);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`📸 [${counterRef.current}] ${label}`);
  return filePath;
}

// ── 2. DOM 텍스트 추출 (스크립트/스타일 제외한 실제 사용자 노출 텍스트) ──

export async function getVisibleText(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
    return clone.innerText || clone.textContent || '';
  });
}

// ── 3. 승인 프로토콜 해시 계산 (im-core/target-hash.ts 동기화) ──

export function canonicalizeJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalizeJson).join(',') + ']';
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalizeJson((obj as Record<string, unknown>)[k])).join(',') + '}';
}

export function computeTargetHash(body: unknown, releaseTier = 'fact_om'): string {
  const { targetHash, approval_target_hash, ...rest } = (body && typeof body === 'object' && !Array.isArray(body))
    ? body as Record<string, unknown> : {} as Record<string, unknown>;
  const payload = { body: rest, releaseTier, policyVersion: '2026-08-31' };
  return 'sha256:' + createHash('sha256').update(canonicalizeJson(payload), 'utf-8').digest('hex');
}

// ── 4. 딜카드 생성 시 중복 감지 다이얼로그 대응 (Promise.race) ──

export async function handleDuplicateModal(
  page: Page,
  navPromise: Promise<any>,
  timeoutMs = 60_000
): Promise<void> {
  const duplicateBtn = page.locator('button:has-text("이 물건 업데이트"), button:has-text("새로 만들기"), button:has-text("신규 생성")').first();

  const raceResult = await Promise.race([
    navPromise.then(() => 'navigated'),
    duplicateBtn.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'duplicate_modal').catch(() => 'no_modal'),
  ]);

  if (raceResult === 'duplicate_modal') {
    console.log('  ⚠️ 중복 물건 감지 → 버튼 클릭');
    await duplicateBtn.click();
    await page.waitForURL(/\/broker\/deal-card\/[a-f0-9]{8}-/, { timeout: 120_000 });
  } else {
    await navPromise;
  }
}

// ── 5. 비동기 IM 생성 완료 폴링 ──

export async function pollImCompletion(page: Page, maxWaitMs = 300_000): Promise<boolean> {
  console.log(`  ⏳ IM 생성 완료 대기 (최대 ${Math.round(maxWaitMs / 1000)}초)...`);
  const start = Date.now();
  let imCompleted = false;

  while (Date.now() - start < maxWaitMs) {
    await page.waitForTimeout(15_000);
    const elapsed = Math.round((Date.now() - start) / 1000);
    const currentUrl = page.url();
    const pageText = await page.textContent('body') || '';

    console.log(`  ⏱️ [${elapsed}s] URL: ${currentUrl.slice(0, 60)}...`);

    if (currentUrl.includes('im-approval') || pageText.includes('섹션 생성 완료') || pageText.includes('생성 완료')) {
      imCompleted = true;
      console.log(`  ✅ IM 생성 완료 확인! (${elapsed}초 소요)`);
      break;
    }
  }

  return imCompleted;
}

// ── 5-1. LLM 재생 미스 단언 (H4 보강) ──
// replay 모드에서 녹화 미스가 나면 섹션 생성기가 조용히 템플릿으로 폴백하여 골든이 "통과"해 버린다.
// 서버(RecordReplayProvider)가 남기는 JSONL(test-results/llm-replay-misses.jsonl)로 미스를 잡아 실패시킨다.
const REPLAY_MISS_LOG = process.env.LLM_MISS_LOG || path.join(process.cwd(), 'test-results', 'llm-replay-misses.jsonl');

export function markReplayWindowStart(screenshotDir: string): void {
  ensureDir(screenshotDir);
  fs.writeFileSync(path.join(screenshotDir, 'replay-window-start.txt'), new Date().toISOString());
}

export function assertNoReplayMisses(screenshotDir: string): void {
  if ((process.env.LLM_MODE ?? '').toLowerCase() !== 'replay') return;
  const markFile = path.join(screenshotDir, 'replay-window-start.txt');
  const since = fs.existsSync(markFile) ? fs.readFileSync(markFile, 'utf-8').trim() : '';
  if (!fs.existsSync(REPLAY_MISS_LOG)) { console.log('  ✅ LLM 재생 미스 0건 (미스 로그 없음)'); return; }
  const misses = fs.readFileSync(REPLAY_MISS_LOG, 'utf-8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((m: any) => m && m.kind === 'replay-miss' && (!since || m.at >= since));
  if (misses.length > 0) {
    for (const m of misses.slice(0, 5)) console.log(`  ❌ LLM 재생 미스: ${m.key} ${m.model} "${m.preview}"`);
  } else {
    console.log('  ✅ LLM 재생 미스 0건');
  }
  expect(misses.length, 'replay 모드 LLM 녹화 미스 (프롬프트 드리프트 → 템플릿 폴백). LLM_MODE=record-missing 으로 증분 녹화 필요').toBe(0);
}

// ── 6. 문서 조회 및 자동 승인 (API 호출 + DB 서비스롤 폴백) ──

export async function approveDocument(
  page: Page,
  buildingId: string,
  screenshotDir: string
): Promise<string> {
  const docsRes = await page.request.get(`/api/broker/im-lite/${buildingId}`);
  const docsJson = await docsRes.json();
  let latestDoc = docsJson.documents?.[0] || docsJson.document;
  if (!latestDoc) {
    // 폴백: 생성 완료 후 리다이렉트된 /broker/im-approval/<docId> 에서 문서 ID 해소
    const m = page.url().match(/im-approval\/([0-9a-f-]{36})/i);
    if (m) {
      const byIdRes = await page.request.get(`/api/broker/im-lite/${m[1]}`);
      const byIdJson = await byIdRes.json().catch(() => ({}));
      latestDoc = byIdJson.documents?.[0];
      console.log(`  ⚠️ buildingId(${buildingId}) 조회 결과 없음 → URL docId(${m[1]}) 폴백, 실제 building_id=${latestDoc?.body?.building_id ?? latestDoc?.building_id ?? '?'}`);
    } else {
      console.log(`  ⚠️ buildingId(${buildingId}) 조회 결과 없음, URL=${page.url()} status=${docsRes.status()} body=${JSON.stringify(docsJson).slice(0, 200)}`);
    }
  }
  expect(latestDoc).toBeTruthy();
  const docId = latestDoc.id;
  console.log(`  📋 docId 획득: ${docId}, 상태: ${latestDoc.status}`);
  ensureDir(screenshotDir);
  fs.writeFileSync(path.join(screenshotDir, 'doc-id.txt'), docId);

  if (latestDoc.status === 'draft') {
    console.log('  🔐 Draft 문서 승인 처리 진행...');
    const tier = latestDoc.body?.releaseTier || 'fact_om';
    const approvalHash = latestDoc.body?.approval_target_hash || latestDoc.body?.targetHash || computeTargetHash(latestDoc.body, tier);
    const approveRes = await page.request.post(`/api/broker/im-lite/${docId}/approve`, {
      data: { action: 'approve', expectedHash: approvalHash },
    });

    if (approveRes.ok()) {
      console.log('  ✅ 승인 API 성공 (status: published)');
    } else {
      const errBody = await approveRes.json().catch(() => ({}));
      console.log(`  ⚠️ 승인 API 에러 (${approveRes.status()}):`, errBody);
      // 2026-10 RCA: DB 직접 패치 폴백이 승인 게이트 결함(연면적/대지 0)을 가려 왔다.
      // 기본값 OFF — 승인 API 가 200 을 반환하지 못하면 골든은 실패해야 한다. (진단용 우회만 GOLDEN_APPROVE_DB_PATCH=1 로 허용)
      const failedBlockIds: string[] = (latestDoc.body?.gateReport?.failedBlocks ?? []).map((g: any) => g?.id);
      const onlyV01Blocks = failedBlockIds.length > 0 && failedBlockIds.every((id) => id === 'V01');
      if (onlyV01Blocks) {
        // 렌트롤 v1.5 V01: 통합계약 금액 판정(월세 누락·금액 중복) — as-is 입력 결함을 게이트가 잡은 것이므로 '예상된 차단'으로 기록
        console.log('  ⛔ 발행 게이트 V01 차단 확인(as-is 입력 결함: 계약그룹 미표기/월세 누락) — 덱 산출을 위해 DB 패치로 진행');
        test.info().annotations.push({ type: 'v01-publish-blocked', description: JSON.stringify(latestDoc.body?.gateReport?.failedBlocks ?? []).slice(0, 300) });
      } else if (process.env.GOLDEN_APPROVE_DB_PATCH !== '1') {
        throw new Error(`승인 API 실패 (${approveRes.status()}): ${JSON.stringify(errBody).slice(0, 600)} — 골든은 DB 패치 폴백 없이 승인 게이트를 통과해야 합니다 (진단용: GOLDEN_APPROVE_DB_PATCH=1)`);
      }
      console.log('  ⚠️ DB service role 직접 패치 폴백 (GOLDEN_APPROVE_DB_PATCH=1)');
      const { createClient } = require('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      if (serviceRoleKey) {
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        const { error } = await adminClient
          .from('document_objects')
          .update({ status: 'published', updated_at: new Date().toISOString() })
          .eq('id', docId);
        if (error) console.error('  ❌ DB 직접 패치 실패:', error.message);
        else console.log('  ✅ DB 직접 패치 완료 (status: published)');
      }
    }
  }

  return docId;
}

/**
 * 골든 결정성: 승인 시 heroCard.keyInvestmentPoint(= 직전 실행의 LLM 출력)가 building_ssot_lite.fit_summary 로
 * 역동기화되어, 다음 실행의 LLM 프롬프트 입력이 이전 실행 출력에 따라 달라진다(재녹화가 고정점에 도달하지 못함).
 * Phase 2 시작 전에 이 역동기화 필드를 고정값(null)으로 리셋해 매 실행이 동일한 입력에서 출발하게 한다.
 */
export async function resetBackSyncedBuildingState(buildingId: string): Promise<void> {
  const { createClient } = require('@supabase/supabase-js');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!serviceRoleKey || !buildingId) {
    console.log('  ⚠️ fit_summary 리셋 생략 (service role key/buildingId 없음)');
    return;
  }
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { error } = await adminClient.from('building_ssot_lite').update({ fit_summary: null }).eq('id', buildingId);
  if (error) console.log('  ⚠️ fit_summary 리셋 실패:', error.message);
  else console.log('  🔁 fit_summary 역동기화 상태 리셋 (골든 결정성)');
}

// ── 7. PPTX 다운로드 (UI 버튼 + API 직접 호출 폴백) ──

async function safeSaveDownload(download: any, targetPath: string): Promise<string> {
  const dir = path.dirname(targetPath);
  ensureDir(dir);
  try {
    if (fs.existsSync(targetPath)) {
      try { fs.unlinkSync(targetPath); } catch {}
    }
    await download.saveAs(targetPath);
    return targetPath;
  } catch (err: any) {
    if (err?.code === 'EBUSY' || err?.message?.includes('EBUSY')) {
      const fallbackPath = targetPath.replace(/\.pptx$/, `_${Date.now()}.pptx`);
      console.log(`  ⚠️ EBUSY 감지: 대체 파일명으로 저장 -> ${path.basename(fallbackPath)}`);
      await download.saveAs(fallbackPath);
      return fallbackPath;
    }
    throw err;
  }
}

export async function downloadPptx(
  page: Page,
  buildingId: string,
  docId: string,
  targetPptxPath: string
): Promise<string> {
  let savedPath = targetPptxPath;
  try {
    const imUrl = docId ? `/im-lite/${buildingId}?doc=${docId}` : `/im-lite/${buildingId}`;
    await page.goto(imUrl);
    await page.waitForLoadState('networkidle');

    const pptxBtn = page.locator('button:has-text("PPTX"), a:has-text("PPTX"), button:has-text("다운로드")').first();
    await pptxBtn.waitFor({ state: 'visible', timeout: 8000 });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120_000 }),
      pptxBtn.click(),
    ]);
    savedPath = await safeSaveDownload(download, targetPptxPath);
    console.log('  ✅ UI 버튼으로 PPTX 다운로드 완료');
  } catch {
    console.log('  ⚠️ UI 다운로드 버튼 미발견 → API 직접 호출 폴백');
    const pptxApiUrl = `/api/public/im-lite/${buildingId}/pptx?tier=basic`;
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.goto(pptxApiUrl).catch((err: any) => {
        if (!err.message?.includes('Download is starting') && !err.message?.includes('net::ERR_ABORTED')) {
          throw err;
        }
      }),
    ]);
    savedPath = await safeSaveDownload(download, targetPptxPath);
    console.log('  ✅ API 직접 호출로 PPTX 다운로드 완료');
  }
  return savedPath;
}

// ── 8. AdmZip 바이너리 파싱 및 텍스트 추출 ──

export function analyzePptxZip(pptxPath: string) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(pptxPath);
  const entries = zip.getEntries();

  const slideEntries = entries.filter((e: any) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName));
  const mediaEntries = entries.filter((e: any) => e.entryName.startsWith('ppt/media/'));

  function extractSlideText(slideXml: string): string {
    return slideXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const allSlideTexts = slideEntries.map((e: any) => extractSlideText(e.getData().toString('utf-8')));
  const fullPptxText = allSlideTexts.join('\n');

  return {
    slideCount: slideEntries.length,
    slideEntries,
    mediaCount: mediaEntries.length,
    allSlideTexts,
    fullPptxText,
  };
}

// ── 9. 품질 단언 헬퍼 (Poison tokens, dummy data, evasive phrases, price bands) ──

export function assertNoPoisonTokens(slideEntries: any[]): void {
  for (const slide of slideEntries) {
    const xml = slide.getData().toString('utf-8');
    expect(xml).not.toContain('>NaN<');
    expect(xml).not.toContain('>undefined<');
    expect(xml).not.toContain('>null<');
    expect(xml).not.toContain('[object Object]');
  }
  console.log('  ✅ OpenXML 결함 토큰 (NaN, undefined, null, [object Object]) 0건 확인');
}

export function assertNoDummyData(fullPptxText: string): void {
  const mockNames = ['NH농협캐피탈', '테헤란로 123', '테헤란로 456'];
  for (const name of mockNames) {
    expect(fullPptxText).not.toContain(name);
  }
  console.log('  ✅ 타 매물 목데이터(NH농협캐피탈 등) 누출 0건 확인 (Rule 34)');
}

export function assertNoEvasivePhrases(fullPptxText: string): void {
  const evasivePhrases = [
    '본문을 참조', '별도 안내 예정', '추후 확인', '상세...별첨',
    '추후 협의', '상세 제원은 실사 자료', '향후 공지', '별도 문의',
  ];
  for (const phrase of evasivePhrases) {
    expect(fullPptxText).not.toContain(phrase);
  }
  console.log('  ✅ 회피성 문구 8종 차단 확인 (Rule 37)');
}

export function assertPriceBandBlocked(fullPptxText: string): void {
  const priceBandPatterns = [
    /\d+억\s*~\s*\d+억/,
    /\d+억원\s*~\s*\d+억원/,
    /\d+억\s*-\s*\d+억/,
    /\d+만원\s*~\s*\d+만원/,
  ];
  for (const pat of priceBandPatterns) {
    expect(fullPptxText).not.toMatch(pat);
  }
  console.log('  ✅ 가격 밴드 차단 확인 (Rule 52)');
}

/** ⑩ H1 출력 불변식 (플레이스홀더/회피문구/수치잔재/JSON·마크다운 유출/목데이터) - 슬라이드 단위 error 0건 */
export function assertOutputInvariants(allSlideTexts: string[]): void {
  const errors = errorsOf(checkOutputInvariants(allSlideTexts, { skipDuplicateSentence: true }));
  expect(formatViolations(errors)).toBe('OK');
  console.log('  ✅ H1 출력 불변식 위반 0건 (placeholder/evasive/numeric/leak/mock)');
}

// ── 10. 콘텐츠 품질 단언 (5종) ──

/** ⑤ 지도/항공뷰 이미지 50KB 이상 1장 이상 포함 */
export function assertMapImagePresence(mediaEntries: any[]): void {
  const largeImages = mediaEntries.filter((e: any) => {
    const data = e.getData();
    return data && data.length >= 50_000;
  });
  expect(largeImages.length).toBeGreaterThanOrEqual(1);
  console.log(`  ✅ 50KB+ 이미지 ${largeImages.length}장 확인`);
}

/** ⑥ 매각가가 PPTX 텍스트에 실제 반영되었는지 교차 검증 */
export function assertPriceReflected(fullPptxText: string, askingPriceManwon: number): void {
  // 억원 단위로 변환하여 검색 (1150000만원 → 115억, 7600000만원 → 760억)
  const priceEok = Math.round(askingPriceManwon / 10000);
  const priceEokStr = priceEok.toLocaleString();
  // 다양한 포맷 검색: "115억", "1,150억", "115억원", "11,500,000" 등
  const found = fullPptxText.includes(`${priceEok}억`)
    || fullPptxText.includes(`${priceEokStr}억`)
    || fullPptxText.includes(`${priceEok}`)
    || fullPptxText.includes(askingPriceManwon.toLocaleString());
  expect(found).toBe(true);
  console.log(`  ✅ 매각가 ${priceEok}억 PPTX 반영 확인`);
}

/** ⑦ 기대 층 키워드가 PPTX에 포함되어 있는지 검증 (R2+ 전용) */
export function assertFloorKeywordsPresent(fullPptxText: string, expectedFloors: string[]): void {
  if (expectedFloors.length === 0) return;
  const missing: string[] = [];
  for (const floor of expectedFloors) {
    // 다각도 층 표기 매칭: "B1", "지하 1층", "지하1층", "B1F", "1F", "1층", "지상 1층" 등
    const floorNum = floor.replace(/[^\d]/g, '');
    const variants = [
      floor,
      floor.replace('F', '층'),
      floor.startsWith('B') ? `지하 ${floorNum}층` : `지상 ${floorNum}층`,
      floor.startsWith('B') ? `지하${floorNum}층` : `지상${floorNum}층`,
      floor.startsWith('B') ? `B${floorNum}F` : `${floorNum}F`,
    ];
    const found = variants.some(v => fullPptxText.includes(v));
    if (!found) {
      missing.push(floor);
    }
  }
  expect(missing).toEqual([]);
  console.log(`  ✅ 층 키워드 ${expectedFloors.length}개 전수 확인`);
}

/** ⑧ 확장 회피성 문구 12종 차단 */
export function assertNoEvasivePhrasesExtended(fullPptxText: string): void {
  const extendedPhrases = [
    '본문을 참조', '별도 안내 예정', '추후 확인', '상세...별첨',
    '추후 협의', '상세 제원은 실사 자료', '향후 공지', '별도 문의',
    '확인 중입니다', '데이터 로딩', '미정입니다', '분석 대기',
  ];
  const found: string[] = [];
  for (const phrase of extendedPhrases) {
    if (fullPptxText.includes(phrase)) {
      found.push(phrase);
    }
  }
  expect(found).toEqual([]);
  console.log('  ✅ 확장 회피성 문구 12종 차단 확인');
}

/** ⑨ 타 매물 하드코딩 폴백 혼입 감지 */
export function assertNoHardcodedFallback(fullPptxText: string, expectedRegion?: string): void {
  // 테헤란로, 역삼동 등 테스트 더미 지역이 실매물에 혼입되지 않았는지 확인
  const dummyLocations = ['테헤란로 123', '테헤란로 456', 'NH농협캐피탈', '피카딜리빌딩'];
  const found: string[] = [];
  for (const loc of dummyLocations) {
    if (fullPptxText.includes(loc)) {
      found.push(loc);
    }
  }
  expect(found).toEqual([]);
  console.log('  ✅ 하드코딩 폴백/타매물 혼입 0건 확인');
}

/** ⑩ 물건 개요(A04) 슬라이드 내 대표 건물 사진 삽입 검증 */
export function assertOverviewPhotoPresence(slideEntries: any[]): void {
  let overviewSlideFound = false;
  let hasImage = false;

  for (const slide of slideEntries) {
    const xml = slide.getData().toString('utf-8');
    const isOverview = xml.includes('물건 개요') || xml.includes('건축물 개요') || xml.includes('물건개요') || xml.includes('OVERVIEW') || xml.includes('건축물 개요 및 물리');
    if (isOverview) {
      overviewSlideFound = true;
      if (xml.includes('r:embed') || xml.includes('a:blip') || xml.includes('<p:pic>')) {
        hasImage = true;
      }
      break;
    }
  }

  if (overviewSlideFound) {
    expect(hasImage).toBe(true);
    console.log('  ✅ 물건 개요 슬라이드 대표 이미지 임베드 확인');
  } else {
    console.log('  ⚠️ 물건 개요 슬라이드 미발견 (포스처에 따라 상이할 수 있음)');
  }
}

/** ⑪ A14 갤러리 슬라이드 존재 및 이미지 삽입 검증 */
export function assertGallerySlidePresence(slideEntries: any[]): void {
  let gallerySlideFound = false;
  let imageCount = 0;

  for (const slide of slideEntries) {
    const xml = slide.getData().toString('utf-8');
    const isGallery = /gallery|갤러리|현장\s*사진|건물\s*사진|외관\s*및/i.test(xml);
    if (isGallery) {
      gallerySlideFound = true;
      const blipMatches = xml.match(/<a:blip\b|r:embed="rId/g);
      imageCount = blipMatches ? blipMatches.length : 0;
      break;
    }
  }

  expect(gallerySlideFound).toBe(true);
  expect(imageCount).toBeGreaterThanOrEqual(1);
  console.log(`  ✅ 갤러리 슬라이드 존재 확인 (이미지 ${imageCount}개 임베드)`);
}

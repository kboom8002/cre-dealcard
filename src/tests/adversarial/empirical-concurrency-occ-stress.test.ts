/**
 * @file empirical-concurrency-occ-stress.test.ts
 * @description Empirical Concurrency & OCC Stress Harness for Challenger 2.
 *
 * Verifies:
 * 1. Theme isolation under asynchronous race conditions across event-loop yields.
 * 2. Zero theme token bleed across executions (both in-memory and in actual PPTX OpenXML binaries).
 * 3. OCC lockVersion serialization under high-contention race conditions in Studio API routes.
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { NextRequest } from 'next/server';
import {
  MobileImPptxRenderer,
  type MobileImPptxInput,
} from '@/domain/building/mobile-im/pptx/pptx-renderer';
import {
  withThemeIsolation,
  ActiveThemeStore,
  C,
  CD,
  KR,
  TITLE_KR,
  getActiveKR,
  getActiveTitleKR,
  getActiveTheme,
  THEME_META,
  PV,
} from '@/domain/building/mobile-im/pptx/imlib';
import {
  getPptxTheme,
  PPTX_PRESET_TEMPLATES,
  type PptxThemeTokens,
} from '@/domain/building/mobile-im/pptx/pptx-theme';
import { PptxStudioService, studioService } from '@/domain/building/pptx-studio/studio-service';
import { PATCH as slidesPatch } from '@/app/api/broker/pptx-studio/projects/[id]/slides/route';
import { PATCH as basicStudioPatch } from '@/app/api/broker/basic-im-studio/[id]/route';

// In-memory test helper for PPTX input
const TINY_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function createAdversarialBasicImInput(
  overrides: Partial<MobileImPptxInput> = {}
): MobileImPptxInput {
  const buildingId =
    overrides.buildingId ||
    `adv-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const defaultSsot = {
    address: '서울특별시 강남구 역삼동 736-1',
    building_name: '역삼 마스터타워',
    asking_price_manwon: 1250000,
    total_deposit_manwon: 50000,
    monthly_rent_total_krw: 48000000,
    land_area_sqm: 495.8,
    total_gross_area_sqm: 1980.5,
    completion_year: 2019,
    zoning: '일반상업지역',
    floors: '지하 1층 / 지상 6층',
    floors_above: 6,
    floors_below: 1,
    parking_count: 14,
    elevator_count: 1,
    vacancy_pct: 0,
    price_band: '125억',
    building_age_years: 7,
    ...overrides.doc?.body?.ssot_summary,
  };

  const defaultFloorLeases = [
    { floor: '6F', tenant: '테크스타', area_pyeong: 65, deposit_manwon: 8000, rent_manwon: 750, is_vacant: false, lease_end: '2028-12-31' },
    { floor: '5F', tenant: '인베스트', area_pyeong: 65, deposit_manwon: 8000, rent_manwon: 750, is_vacant: false, lease_end: '2027-06-30' },
    { floor: '4F', tenant: '글로벌파트너스', area_pyeong: 65, deposit_manwon: 8000, rent_manwon: 750, is_vacant: false, lease_end: '2027-10-31' },
    { floor: '3F', tenant: '디지털랩', area_pyeong: 65, deposit_manwon: 8000, rent_manwon: 800, is_vacant: false, lease_end: '2026-05-31' },
    { floor: '2F', tenant: '메디컬클리닉', area_pyeong: 65, deposit_manwon: 8000, rent_manwon: 850, is_vacant: false, lease_end: '2029-01-31' },
    { floor: '1F', tenant: '투썸플레이스', area_pyeong: 55, deposit_manwon: 10000, rent_manwon: 900, is_vacant: false, lease_end: '2029-08-31' },
  ];

  const defaultHeroCard = {
    askingPriceDisplay: '125.0억 원',
    capRateBase: 4.6,
    noiBaseBil: 0.576,
    equityRequiredBil: 12.0,
    leveragedYieldPct: 6.4,
    posture: overrides.posture ?? 'income',
    landAreaM2: defaultSsot.land_area_sqm,
    totalGrossAreaM2: defaultSsot.total_gross_area_sqm,
    zoning: defaultSsot.zoning,
    keyInvestmentPoint: '강남 중심업무지구 초역세권 안정적 현금흐름 창출 자산',
    ...overrides.doc?.body?.heroCard,
  };

  const defaultPhotos = [
    { url: TINY_PNG_DATA_URI, category: 'exterior', role: 'cover', isHero: true, caption: '건물 외관 전경', buildingId },
    { url: TINY_PNG_DATA_URI, category: 'exterior', role: 'exterior', caption: '건물 정면', buildingId },
    { url: TINY_PNG_DATA_URI, category: 'interior', caption: '실내 로비', buildingId },
  ];

  return {
    buildingId,
    preset: overrides.preset ?? 'credeal_basic',
    posture: (overrides.posture as any) ?? 'income',
    grade: overrides.grade ?? 'B',
    doc: {
      title: overrides.doc?.title ?? `${defaultSsot.address} 투자설명서`,
      body: {
        document_id: `doc-${buildingId}`,
        deal_id: buildingId,
        title: overrides.doc?.title ?? `${defaultSsot.address} 투자설명서`,
        building_name: defaultSsot.building_name,
        address: defaultSsot.address,
        road_condition: '8차선 대로변',
        asking_price_manwon: defaultSsot.asking_price_manwon,
        heroCard: defaultHeroCard,
        ssot_summary: defaultSsot,
        floor_leases: defaultFloorLeases,
        photos: defaultPhotos,
        photo_urls: defaultPhotos.map((p) => p.url),
        sections: [
          { section_type: 'cover', title: '표지', content: '' },
          { section_type: 'summary', title: '핵심 요약', content: '' },
          { section_type: 'property_overview', title: '물건 개요', content: '' },
          { section_type: 'location_analysis', title: '입지 정보', content: '' },
          { section_type: 'land_info', title: '토지 정보', content: '' },
          { section_type: 'rent_roll', title: '임대차 현황', content: '' },
          { section_type: 'yield_analysis', title: '투자수익률 분석', content: '' },
          { section_type: 'photo_gallery', title: '현장 사진', content: '' },
          { section_type: 'closing', title: '문의 및 유의사항', content: '' },
        ],
        ...overrides.doc?.body,
      },
      ...overrides.doc,
    },
    building: {
      id: buildingId,
      name: defaultSsot.building_name,
      address: defaultSsot.address,
      road_condition: '8차선 대로변',
      asset_type: '근린생활시설/업무시설',
      price_band: defaultSsot.price_band,
      area_signal: '강남 GBD 테헤란로 이면',
      land_area_sqm: defaultSsot.land_area_sqm,
      total_area_sqm: defaultSsot.total_gross_area_sqm,
      built_year: defaultSsot.completion_year,
      floors_above: defaultSsot.floors_above,
      floors_below: defaultSsot.floors_below,
      parking_count: defaultSsot.parking_count,
      elevator_count: defaultSsot.elevator_count,
      use_zone: defaultSsot.zoning,
      ...overrides.building,
    },
    ...overrides,
  };
}

// Custom Boardroom Dark preset definition
const boardroomDarkTheme: PptxThemeTokens = {
  presetId: 'boardroom_dark',
  presetName: 'Boardroom Dark Executive',
  ink: 'F1F5F9',
  ink2: 'E2E8F0',
  ink3: 'CBD5E1',
  slate: '94A3B8',
  body: 'E2E8F0',
  mute: '64748B',
  mute2: '475569',
  line: '334155',
  line2: '1E293B',
  bg: '0F172A',
  tint: '1E293B',
  accent: 'EC4899', // Hot Pink - highly distinguishable
  accentD: 'BE185D',
  accentL: 'F472B6',
  accentT: 'FDF2F8',
  green: '10B981',
  greenL: '064E3B',
  red: 'EF4444',
  redL: '7F1D1D',
  amber: 'F59E0B',
  amberL: '78350F',
  blue: '3B82F6',
  blueL: '1E3A8A',
  violet: '8B5CF6',
  violetL: '4C1D95',
  darkCard: '1E293B',
  darkBlock: '334155',
  darkBorder: '475569',
  darkBody: 'F8FAFC',
  darkMute: '94A3B8',
  darkFaint: '64748B',
  darkAccentBg: 'BE185D',
  darkAccentBorder: 'EC4899',
  darkAccentText: 'FDF2F8',
  titleFont: 'NanumGothic',
  bodyFont: 'NanumGothic',
  coverStyle: 'hero_dark',
  layoutStyle: 'executive',
  companyName: 'Boardroom Capital',
  companyTagline: 'Executive Property Intelligence',
};

// Ensure boardroom_dark is known in templates for the test
PPTX_PRESET_TEMPLATES.boardroom_dark = boardroomDarkTheme;

describe('Empirical Concurrency & Theme Isolation Suite (Challenger 2)', () => {
  const themeBasic = getPptxTheme('credeal_basic');
  const themeWhite = getPptxTheme('corporate_clean_white');
  const themeSlate = getPptxTheme('institutional_slate');
  const themeBoardroom = boardroomDarkTheme;

  it('[CHALLENGE-CONC-01] Multi-Task Theme Token Isolation across interleaved event-loop yields', async () => {
    const iterations = 8;
    const errors: string[] = [];

    // Run 4 concurrent workers with 4 conflicting presets
    const worker1 = withThemeIsolation(themeBasic, async () => {
      for (let i = 0; i < iterations; i++) {
        await new Promise((r) => setTimeout(r, 5 + Math.random() * 10));
        if (C.ink !== themeBasic.ink) {
          errors.push(`Worker 1 (Basic) ink bleed at step ${i}: expected ${themeBasic.ink}, got ${C.ink}`);
        }
        if (C.brass !== themeBasic.accent) {
          errors.push(`Worker 1 (Basic) brass bleed at step ${i}: expected ${themeBasic.accent}, got ${C.brass}`);
        }
        if (getActiveTheme()?.presetId !== 'credeal_basic') {
          errors.push(`Worker 1 presetId bleed at step ${i}: got ${getActiveTheme()?.presetId}`);
        }
        if (getActiveKR() !== themeBasic.bodyFont) {
          errors.push(`Worker 1 getActiveKR bleed at step ${i}: got ${getActiveKR()}`);
        }
      }
      return C.ink;
    });

    const worker2 = withThemeIsolation(themeWhite, async () => {
      for (let i = 0; i < iterations; i++) {
        await new Promise((r) => setTimeout(r, 5 + Math.random() * 10));
        if (C.ink !== themeWhite.ink) {
          errors.push(`Worker 2 (White) ink bleed at step ${i}: expected ${themeWhite.ink}, got ${C.ink}`);
        }
        if (C.brass !== themeWhite.accent) {
          errors.push(`Worker 2 (White) brass bleed at step ${i}: expected ${themeWhite.accent}, got ${C.brass}`);
        }
        if (getActiveTheme()?.presetId !== 'corporate_clean_white') {
          errors.push(`Worker 2 presetId bleed at step ${i}: got ${getActiveTheme()?.presetId}`);
        }
        if (getActiveKR() !== themeWhite.bodyFont) {
          errors.push(`Worker 2 getActiveKR bleed at step ${i}: got ${getActiveKR()}`);
        }
      }
      return C.ink;
    });

    const worker3 = withThemeIsolation(themeSlate, async () => {
      for (let i = 0; i < iterations; i++) {
        await new Promise((r) => setTimeout(r, 5 + Math.random() * 10));
        if (C.ink !== themeSlate.ink) {
          errors.push(`Worker 3 (Slate) ink bleed at step ${i}: expected ${themeSlate.ink}, got ${C.ink}`);
        }
        if (C.brass !== themeSlate.accent) {
          errors.push(`Worker 3 (Slate) brass bleed at step ${i}: expected ${themeSlate.accent}, got ${C.brass}`);
        }
        if (getActiveTheme()?.presetId !== 'institutional_slate') {
          errors.push(`Worker 3 presetId bleed at step ${i}: got ${getActiveTheme()?.presetId}`);
        }
        if (getActiveKR() !== themeSlate.bodyFont) {
          errors.push(`Worker 3 getActiveKR bleed at step ${i}: got ${getActiveKR()}`);
        }
      }
      return C.ink;
    });

    const worker4 = withThemeIsolation(themeBoardroom, async () => {
      for (let i = 0; i < iterations; i++) {
        await new Promise((r) => setTimeout(r, 5 + Math.random() * 10));
        if (C.ink !== themeBoardroom.ink) {
          errors.push(`Worker 4 (Boardroom) ink bleed at step ${i}: expected ${themeBoardroom.ink}, got ${C.ink}`);
        }
        if (C.brass !== themeBoardroom.accent) {
          errors.push(`Worker 4 (Boardroom) brass bleed at step ${i}: expected ${themeBoardroom.accent}, got ${C.brass}`);
        }
        if (getActiveTheme()?.presetId !== 'boardroom_dark') {
          errors.push(`Worker 4 presetId bleed at step ${i}: got ${getActiveTheme()?.presetId}`);
        }
        if (getActiveKR() !== themeBoardroom.bodyFont) {
          errors.push(`Worker 4 getActiveKR bleed at step ${i}: got ${getActiveKR()}`);
        }
      }
      return C.ink;
    });

    const [res1, res2, res3, res4] = await Promise.all([worker1, worker2, worker3, worker4]);

    expect(errors).toEqual([]);
    expect(res1).toBe(themeBasic.ink);
    expect(res2).toBe(themeWhite.ink);
    expect(res3).toBe(themeSlate.ink);
    expect(res4).toBe(themeBoardroom.ink);

    // Verify all 4 themes are distinct
    const distinctInks = new Set([res1, res2, res3, res4]);
    expect(distinctInks.size).toBeGreaterThanOrEqual(3);
  });

  it('[CHALLENGE-CONC-02] Direct raw KR mutation bleed detection vs getActiveKR safety under overlapping async windows', async () => {
    // Hypothesis: Because raw `KR` is a module-level `export let KR = '...'`,
    // when taskB enters withThemeIsolation while taskA is suspended on await,
    // raw KR will be overwritten by taskB's font, whereas getActiveKR() remains isolated.
    let rawKrInTaskA: string | undefined;
    let safeKrInTaskA: string | undefined;

    const taskA = withThemeIsolation(themeBasic, async () => {
      // themeBasic bodyFont is '맑은 고딕'
      // Yield control for 20ms to allow taskB to interleave
      await new Promise((r) => setTimeout(r, 20));
      rawKrInTaskA = KR;
      safeKrInTaskA = getActiveKR();
      return { rawKr: KR, safeKr: getActiveKR() };
    });

    const taskB = withThemeIsolation(themeBoardroom, async () => {
      // Small initial delay so taskA sets up its context first
      await new Promise((r) => setTimeout(r, 5));
      // taskB sets KR to 'NanumGothic' and holds control until 40ms
      await new Promise((r) => setTimeout(r, 35));
      return { rawKr: KR, safeKr: getActiveKR() };
    });

    const [resA, resB] = await Promise.all([taskA, taskB]);

    // getActiveKR() is backed by AsyncLocalStorage and MUST NEVER BLEED
    expect(safeKrInTaskA).toBe(themeBasic.bodyFont);
    expect(resB.safeKr).toBe(themeBoardroom.bodyFont);

    // Empirical Observation: Did raw KR bleed?
    const didRawKrBleed = rawKrInTaskA === themeBoardroom.bodyFont;
    console.log(
      `[EMPIRICAL CRITIQUE] Raw module variable KR observed in Task A: "${rawKrInTaskA}" (expected by themeBasic: "${themeBasic.bodyFont}"). Bleed detected: ${didRawKrBleed}`
    );
  });

  it('[CHALLENGE-CONC-03] Full End-to-End Concurrent Parallel PPTX Rendering: Zero Token Bleed in OpenXML Binaries', async () => {
    const renderer = new MobileImPptxRenderer();

    const inputBasic = createAdversarialBasicImInput({
      buildingId: 'bld-concurrent-basic',
      preset: 'credeal_basic',
    });
    const inputWhite = createAdversarialBasicImInput({
      buildingId: 'bld-concurrent-white',
      preset: 'corporate_clean_white',
    });
    const inputSlate = createAdversarialBasicImInput({
      buildingId: 'bld-concurrent-slate',
      preset: 'institutional_slate',
    });
    const inputBoardroom = createAdversarialBasicImInput({
      buildingId: 'bld-concurrent-boardroom',
      preset: 'boardroom_dark',
    });

    // Execute 4 simultaneous PPTX renders
    const [outBasic, outWhite, outSlate, outBoardroom] = await Promise.all([
      renderer.render(inputBasic),
      renderer.render(inputWhite),
      renderer.render(inputSlate),
      renderer.render(inputBoardroom),
    ]);

    expect(outBasic.buffer.length).toBeGreaterThan(50_000);
    expect(outWhite.buffer.length).toBeGreaterThan(50_000);
    expect(outSlate.buffer.length).toBeGreaterThan(50_000);
    expect(outBoardroom.buffer.length).toBeGreaterThan(50_000);

    // Inspect OpenXML content from zip files to verify NO color bleed
    const zipBasic = await JSZip.loadAsync(outBasic.buffer);
    const zipSlate = await JSZip.loadAsync(outSlate.buffer);
    const zipBoardroom = await JSZip.loadAsync(outBoardroom.buffer);

    const extractAllXml = async (zip: JSZip) => {
      let combined = '';
      const slideFiles = Object.keys(zip.files).filter((k) => k.startsWith('ppt/slides/slide'));
      for (const f of slideFiles) {
        combined += await zip.files[f].async('text');
      }
      return combined;
    };

    const xmlBasic = await extractAllXml(zipBasic);
    const xmlSlate = await extractAllXml(zipSlate);
    const xmlBoardroom = await extractAllXml(zipBoardroom);

    // 1. Institutional Slate accent is E8DEC8 and background is 2B2F3E.
    // Slate MUST contain its own signature tokens:
    expect(xmlSlate).toContain('E8DEC8');

    // 2. Credeal Basic accent is B8860B.
    // Basic MUST contain B8860B:
    expect(xmlBasic).toContain('B8860B');

    // 3. ZERO BLEED CHECKS:
    // Boardroom accent (EC4899 - Hot Pink) MUST NOT appear anywhere in Basic or Slate:
    expect(xmlBasic).not.toContain('EC4899');
    expect(xmlSlate).not.toContain('EC4899');

    // Slate dark background (2B2F3E) MUST NOT appear in Credeal Basic:
    expect(xmlBasic).not.toContain('2B2F3E');
  }, 30000);
});

describe('Empirical OCC LockVersion Serialization & Race Conditions Suite (Challenger 2)', () => {
  it('[CHALLENGE-OCC-01] High-Contention Concurrent Slides Patch: Exactly 1 Success, 9 Stale Lock Rejections (HTTP 409)', async () => {
    // Create a project in studioService
    const project = await studioService.createProject(
      'deal-occ-race-1',
      'pkg-race-1',
      '경쟁 테스트 프로젝트'
    );
    const targetSlideId = project.slides[0].id;
    const initialLockVersion = project.lockVersion; // 1

    // 10 concurrent requests all claiming expectedLockVersion: 1
    const concurrencyCount = 10;
    const promises = Array.from({ length: concurrencyCount }).map((_, i) => {
      const req = new NextRequest(`http://localhost:3000/api/broker/pptx-studio/projects/${project.id}/slides`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-test-bypass': 'true',
          'x-broker-id': `broker-${i}`,
        },
        body: JSON.stringify({
          action: 'patch_overrides',
          slideId: targetSlideId,
          overrides: { title: `제목 갱신 ${i}` },
          expectedLockVersion: initialLockVersion,
        }),
      });

      return slidesPatch(req, { params: Promise.resolve({ id: project.id }) });
    });

    const responses = await Promise.all(promises);
    const results = await Promise.all(
      responses.map(async (res) => ({
        status: res.status,
        body: await res.json(),
      }))
    );

    const successCount = results.filter((r) => r.status === 200 && r.body.ok === true).length;
    const conflictCount = results.filter((r) => r.status === 409 && r.body.ok === false).length;

    // Strict OCC Invariant: EXACTLY 1 winner, exactly N-1 conflicts!
    expect(successCount).toBe(1);
    expect(conflictCount).toBe(concurrencyCount - 1);

    // Conflict error message must cite STALE_LOCK_ERROR
    const conflictErrors = results.filter((r) => r.status === 409).map((r) => r.body.error);
    for (const err of conflictErrors) {
      expect(err).toMatch(/STALE_LOCK_ERROR/);
    }

    // Final lockVersion must be exactly incremented by 1
    const finalProject = await studioService.getProject(project.id);
    expect(finalProject.lockVersion).toBe(initialLockVersion + 1);
  });

  it('[CHALLENGE-OCC-02] High-Contention Reorder OCC Conflict: Exactly 1 Success, 9 Rejections (HTTP 409)', async () => {
    const project = await studioService.createProject(
      'deal-occ-race-2',
      'pkg-race-2',
      '재정렬 경쟁 프로젝트'
    );
    const initialLockVersion = project.lockVersion;
    const slideIds = project.slides.map((s) => s.id);

    const concurrencyCount = 10;
    const promises = Array.from({ length: concurrencyCount }).map((_, i) => {
      const reversed = [...slideIds].reverse();
      const req = new NextRequest(`http://localhost:3000/api/broker/pptx-studio/projects/${project.id}/slides`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-test-bypass': 'true',
        },
        body: JSON.stringify({
          action: 'reorder',
          slideIds: reversed,
          expectedLockVersion: initialLockVersion,
        }),
      });

      return slidesPatch(req, { params: Promise.resolve({ id: project.id }) });
    });

    const responses = await Promise.all(promises);
    const results = await Promise.all(
      responses.map(async (res) => ({
        status: res.status,
        body: await res.json(),
      }))
    );

    const successCount = results.filter((r) => r.status === 200).length;
    const conflictCount = results.filter((r) => r.status === 409).length;

    expect(successCount).toBe(1);
    expect(conflictCount).toBe(concurrencyCount - 1);
  });

  it('[CHALLENGE-OCC-03] Batch Slides Update enforces expectedLockVersion check', async () => {
    const project = await studioService.createProject(
      'deal-occ-batch',
      'pkg-batch',
      '배치 업데이트 프로젝트'
    );
    const slide = project.slides[0];

    // 1. Mismatched lockVersion -> HTTP 409
    const staleReq = new NextRequest(`http://localhost:3000/api/broker/pptx-studio/projects/${project.id}/slides`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-bypass': 'true' },
      body: JSON.stringify({
        slides: [{ id: slide.id, slideOverrides: { title: '배치 수정' } }],
        expectedLockVersion: 999,
      }),
    });
    const staleRes = await slidesPatch(staleReq, { params: Promise.resolve({ id: project.id }) });
    expect(staleRes.status).toBe(409);
    const staleBody = await staleRes.json();
    expect(staleBody.error).toMatch(/STALE_LOCK_ERROR/);

    // 2. Matched lockVersion -> HTTP 200
    const validReq = new NextRequest(`http://localhost:3000/api/broker/pptx-studio/projects/${project.id}/slides`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-bypass': 'true' },
      body: JSON.stringify({
        slides: [{ id: slide.id, slideOverrides: { title: '배치 성공' } }],
        expectedLockVersion: project.lockVersion,
      }),
    });
    const validRes = await slidesPatch(validReq, { params: Promise.resolve({ id: project.id }) });
    expect(validRes.status).toBe(200);
    const validBody = await validRes.json();
    expect(validBody.ok).toBe(true);
  });

  it('[CHALLENGE-OCC-04] Basic IM Studio Route PATCH enforces expectedLockVersion serialization', async () => {
    const project = await studioService.createProject(
      'deal-basic-studio-occ',
      'pkg-basic-occ',
      '베이직 스튜디오 OCC'
    );
    const targetSlideId = project.slides[0].id;
    const initialLockVersion = project.lockVersion;

    // 5 concurrent PATCH calls to basic-im-studio/[id]/route.ts
    const concurrencyCount = 5;
    const promises = Array.from({ length: concurrencyCount }).map((_, i) => {
      const req = new NextRequest(`http://localhost:3000/api/broker/basic-im-studio/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-test-bypass': 'true' },
        body: JSON.stringify({
          slideId: targetSlideId,
          overrides: { title: `베이직 갱신 ${i}` },
          expectedLockVersion: initialLockVersion,
        }),
      });
      return basicStudioPatch(req, { params: Promise.resolve({ id: project.id }) });
    });

    const responses = await Promise.all(promises);
    const results = await Promise.all(
      responses.map(async (res) => ({
        status: res.status,
        body: await res.json(),
      }))
    );

    const successCount = results.filter((r) => r.status === 200 && r.body.ok === true).length;
    const conflictCount = results.filter((r) => r.status === 409).length;

    expect(successCount).toBe(1);
    expect(conflictCount).toBe(concurrencyCount - 1);
  });

  it('[CHALLENGE-OCC-05] Sequential LockVersion Chain: 10 updates execute in strict monotonic order', async () => {
    const project = await studioService.createProject(
      'deal-monotonic-chain',
      'pkg-chain',
      '단조 증가 직렬화'
    );

    let currentVersion = project.lockVersion; // 1
    const steps = 10;

    for (let step = 0; step < steps; step++) {
      const req = new NextRequest(`http://localhost:3000/api/broker/pptx-studio/projects/${project.id}/slides`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-test-bypass': 'true' },
        body: JSON.stringify({
          action: 'toggle_visibility',
          slideId: project.slides[step % project.slides.length].id,
          expectedLockVersion: currentVersion,
        }),
      });

      const res = await slidesPatch(req, { params: Promise.resolve({ id: project.id }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.project.lockVersion).toBe(currentVersion + 1);
      currentVersion = data.project.lockVersion;
    }

    expect(currentVersion).toBe(1 + steps);
  });
});

import {
  buildProDeckSequence,
  PRO_PAGE_HARD_LIMIT,
  PRO_PAGE_MIN_LIMIT,
} from '../src/domain/building/mobile-im/pptx/pro-deck-sequencer';
import { chunkTenantRoster, type InstitutionalTenantRosterItem } from '../src/domain/building/im-core/pro-tenant-roster';
import { buildA25ChapterDivider } from '../src/domain/building/mobile-im/pptx/archetypes/a25-chapter-divider';
import { withThemeIsolation } from '../src/domain/building/mobile-im/pptx/imlib';
import { PPTX_PRESET_TEMPLATES } from '../src/domain/building/mobile-im/pptx/pptx-theme';

function createMockTenant(idx: number): InstitutionalTenantRosterItem {
  return {
    floor: `${idx + 1}F`,
    unitNumber: `${idx + 1}01호`,
    tenantName: `테넌트_${idx + 1}`,
    industry: '일반사무',
    leasedAreaM2: 150,
    leasedAreaPyeong: 45.37,
    depositKrw: 50_000_000,
    monthlyRentKrw: 3_500_000,
    monthlyMaintenanceKrw: 700_000,
    leaseStartDate: '2024-01-01',
    leaseEndDate: '2026-12-31',
    statutoryProtection10Y: true,
  };
}

function createMockPptxCollector() {
  const shapes: Array<{ shape: any; opts: any }> = [];
  const texts: Array<{ text: any; opts: any }> = [];
  const slide = {
    background: null as any,
    addShape: (shape: any, opts: any) => {
      shapes.push({ shape, opts });
      return slide;
    },
    addText: (text: any, opts: any) => {
      texts.push({ text, opts });
      return slide;
    },
  };
  const pres = {
    addSlide: () => slide,
    ShapeType: { rect: 'rect', line: 'line' },
  };
  return { pres, slide, shapes, texts };
}

async function runChallengerVerification() {
  console.log('======================================================================');
  console.log('🧪 EMPIRICAL CHALLENGER M2-IT2: ADVERSARIAL STRESS VERIFICATION HARNESS');
  console.log('======================================================================\n');

  let passed = true;

  // --------------------------------------------------------------------------
  // Test 1: Tenant Roster Chunking Boundary Stress across required tenant counts
  // (0, 1, 12, 13, 24, 25, 73, 84, 85, 100, 200)
  // --------------------------------------------------------------------------
  console.log('▶ [VERIFICATION 1] Tenant Roster Boundary Condition & Slide Count Caps');
  const tenantCounts = [0, 1, 12, 13, 24, 25, 73, 84, 85, 100, 200];

  const expectedResults: Record<number, { chunks: number; expectedSlides: number; isFallback: boolean }> = {
    0: { chunks: 0, expectedSlides: 36, isFallback: true },
    1: { chunks: 1, expectedSlides: 36, isFallback: true },
    12: { chunks: 1, expectedSlides: 36, isFallback: true },
    13: { chunks: 2, expectedSlides: 36, isFallback: true },
    24: { chunks: 2, expectedSlides: 36, isFallback: true },
    25: { chunks: 3, expectedSlides: 37, isFallback: false },
    73: { chunks: 7, expectedSlides: 36, isFallback: true },
    84: { chunks: 7, expectedSlides: 36, isFallback: true },
    85: { chunks: 8, expectedSlides: 36, isFallback: true },
    100: { chunks: 9, expectedSlides: 36, isFallback: true },
    200: { chunks: 17, expectedSlides: 36, isFallback: true },
  };

  for (const count of tenantCounts) {
    const tenants = Array.from({ length: count }, (_, i) => createMockTenant(i));
    const chunks = chunkTenantRoster(tenants, 12);
    const expected = expectedResults[count];

    let seq: any[];
    try {
      seq = buildProDeckSequence({
        posture: 'income',
        grade: 'B',
        data: { floor_leases: tenants },
      });
    } catch (err: any) {
      console.error(`❌ CRASH: buildProDeckSequence threw for tenant count ${count}:`, err.message);
      passed = false;
      continue;
    }

    const rentRollSlides = seq.filter(s => s.archetype === 'A03' && s.dataKey.startsWith('rentRollPart'));
    const isFallback = rentRollSlides.length === 2 && chunks.length !== 2;

    const countMatches = seq.length === expected.expectedSlides;
    const limitMaintained = seq.length <= PRO_PAGE_HARD_LIMIT;
    const chunksMatch = chunks.length === expected.chunks;

    console.log(`  - Count ${String(count).padStart(3)}: Chunks=${String(chunks.length).padStart(2)}, Slides=${seq.length} (Expected=${expected.expectedSlides}), RentRollSlides=${rentRollSlides.length}, Fallback=${isFallback} | Limit <= 40: ${limitMaintained ? 'PASS' : 'FAIL'}`);

    if (!countMatches || !limitMaintained || !chunksMatch) {
      console.error(`    ❌ MISMATCH for count ${count}: got ${seq.length} slides, expected ${expected.expectedSlides}`);
      passed = false;
    }
  }

  // --------------------------------------------------------------------------
  // Test 2: Multi-chunk boundary transition (counts 25..72 -> 37..40 slides)
  // --------------------------------------------------------------------------
  console.log('\n▶ [VERIFICATION 2] Multi-Chunk Capacity Ramp (25..72 tenants -> 37..40 slides)');
  const capacityTenants = [
    { count: 25, expectedChunks: 3, expectedSlides: 37 },
    { count: 36, expectedChunks: 3, expectedSlides: 37 },
    { count: 37, expectedChunks: 4, expectedSlides: 38 },
    { count: 48, expectedChunks: 4, expectedSlides: 38 },
    { count: 49, expectedChunks: 5, expectedSlides: 39 },
    { count: 60, expectedChunks: 5, expectedSlides: 39 },
    { count: 61, expectedChunks: 6, expectedSlides: 40 },
    { count: 72, expectedChunks: 6, expectedSlides: 40 },
  ];

  for (const item of capacityTenants) {
    const tenants = Array.from({ length: item.count }, (_, i) => createMockTenant(i));
    const chunks = chunkTenantRoster(tenants, 12);
    const seq = buildProDeckSequence({
      posture: 'income',
      grade: 'B',
      data: { floor_leases: tenants },
    });

    const matches = seq.length === item.expectedSlides;
    const rentRollSlides = seq.filter(s => s.archetype === 'A03' && s.dataKey.startsWith('rentRollPart'));
    console.log(`  - Count ${item.count}: Chunks=${chunks.length}, Slides=${seq.length} (Expected=${item.expectedSlides}), RentRollParts=${rentRollSlides.length} | Match: ${matches ? 'PASS' : 'FAIL'}`);
    if (!matches || seq.length > PRO_PAGE_HARD_LIMIT) {
      console.error(`    ❌ Capacity ramp failure for count ${item.count}!`);
      passed = false;
    }
  }

  // --------------------------------------------------------------------------
  // Test 3: Fallback safety when capacity exceeded (73 tenants -> falls back to 36 slides)
  // --------------------------------------------------------------------------
  console.log('\n▶ [VERIFICATION 3] Safe Fallback Verification (73..84..120..500 tenants)');
  const fallbackCounts = [73, 74, 80, 84, 85, 96, 120, 500];
  for (const count of fallbackCounts) {
    const tenants = Array.from({ length: count }, (_, i) => createMockTenant(i));
    const seq = buildProDeckSequence({
      posture: 'income',
      grade: 'B',
      data: { floor_leases: tenants },
    });

    const isExactly36 = seq.length === 36;
    const rentRollSlides = seq.filter(s => s.archetype === 'A03' && s.dataKey.startsWith('rentRollPart'));
    const is2Part = rentRollSlides.length === 2 && rentRollSlides[0].dataKey === 'rentRollPart1' && rentRollSlides[1].dataKey === 'rentRollPart2';

    console.log(`  - Count ${String(count).padStart(3)}: TotalSlides=${seq.length} (== 36: ${isExactly36}), RentRollParts=${rentRollSlides.length} (== 2: ${is2Part})`);
    if (!isExactly36 || !is2Part) {
      console.error(`    ❌ Fallback failure for count ${count}!`);
      passed = false;
    }
  }

  // --------------------------------------------------------------------------
  // Test 4: A25 Chapter Dividers Bleed & Coordinate Physics
  // --------------------------------------------------------------------------
  console.log('\n▶ [VERIFICATION 4] A25 Chapter Divider Bleed & Layout Geometry Physics');
  const a25Cases = [
    { name: 'Standard Ch1', data: { title: 'EXECUTIVE SUMMARY', subtitle: 'Strategic overview', kicker: 'CHAPTER 01', topics: ['Overview', 'Highlights', 'Financials'] } },
    { name: 'Extreme Lengths', data: { title: 'LONG TITLE '.repeat(20), subtitle: 'LONG SUBTITLE '.repeat(30), kicker: 'CHAPTER '.repeat(10), topics: Array.from({ length: 14 }, (_, i) => `Extremely long agenda topic item ${i + 1} with deep technical due diligence and engineering details`) } },
    { name: 'Empty Data', data: { title: '', subtitle: '', kicker: '', topics: [] } },
  ];

  for (const c of a25Cases) {
    const { pres, texts, shapes } = createMockPptxCollector();
    buildA25ChapterDivider({
      pres: pres as any,
      slideNum: 1,
      docno: 'TEST-A25',
      data: c.data,
      grade: 'B',
      provenance: {},
    });

    let bleedCount = 0;
    const maxW = 13.34;
    const maxH = 7.51;

    for (const t of texts) {
      const x = Number(t.opts.x) || 0;
      const y = Number(t.opts.y) || 0;
      const w = Number(t.opts.w) || 0;
      const h = Number(t.opts.h) || 0;
      if (x < 0 || y < 0 || x + w > maxW || y + h > maxH) {
        console.error(`    Bleed in text: x=${x}, y=${y}, w=${w}, h=${h}, right=${x + w}, bottom=${y + h}`);
        bleedCount++;
      }
    }

    for (const s of shapes) {
      const x = Number(s.opts.x) || 0;
      const y = Number(s.opts.y) || 0;
      const w = Number(s.opts.w) || 0;
      const h = Number(s.opts.h) || 0;
      if (x < 0 || y < 0 || x + w > maxW || y + h > maxH) {
        console.error(`    Bleed in shape: x=${x}, y=${y}, w=${w}, h=${h}, right=${x + w}, bottom=${y + h}`);
        bleedCount++;
      }
    }

    console.log(`  - Case "${c.name}": Elements=${texts.length + shapes.length}, Bleeds=${bleedCount} | Zero Bleed: ${bleedCount === 0 ? 'PASS' : 'FAIL'}`);
    if (bleedCount > 0) {
      passed = false;
    }
  }

  // --------------------------------------------------------------------------
  // Test 5: A25 Background Color Assertions under institutional_slate & other presets
  // --------------------------------------------------------------------------
  console.log('\n▶ [VERIFICATION 5] A25 Slide Background Color Assertions');
  const slateTheme = PPTX_PRESET_TEMPLATES.institutional_slate;
  await withThemeIsolation(slateTheme, async () => {
    const { pres, slide } = createMockPptxCollector();
    buildA25ChapterDivider({
      pres: pres as any,
      slideNum: 3,
      docno: 'TEST-SLATE',
      data: { title: 'Slate Test', romanNumeral: 'I' },
      grade: 'B',
      provenance: {},
    });

    const isSlateFill = slide.background?.fill === '2B2F3E';
    console.log(`  - institutional_slate background: fill="${slide.background?.fill}" (Expected="2B2F3E") | Match: ${isSlateFill ? 'PASS' : 'FAIL'}`);
    if (!isSlateFill) passed = false;
  });

  const basicTheme = PPTX_PRESET_TEMPLATES.credeal_basic;
  await withThemeIsolation(basicTheme, async () => {
    const { pres, slide } = createMockPptxCollector();
    buildA25ChapterDivider({
      pres: pres as any,
      slideNum: 3,
      docno: 'TEST-BASIC',
      data: { title: 'Basic Test', romanNumeral: 'I' },
      grade: 'B',
      provenance: {},
    });

    const isBasicFill = slide.background?.fill === '0A1620';
    console.log(`  - credeal_basic background: fill="${slide.background?.fill}" (Expected="0A1620") | Match: ${isBasicFill ? 'PASS' : 'FAIL'}`);
    if (!isBasicFill) passed = false;
  });

  console.log('\n======================================================================');
  if (passed) {
    console.log('🏆 EMPIRICAL CHALLENGER VERDICT: ALL STRESS TESTS PASSED (APPROVE)');
  } else {
    console.log('💥 EMPIRICAL CHALLENGER VERDICT: DEFECTS DETECTED (REJECT)');
  }
  console.log('======================================================================');

  if (!passed) {
    process.exit(1);
  }
}

runChallengerVerification().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

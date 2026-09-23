import { describe, it, expect } from 'vitest';
import {
  buildProDeckSequence,
  PRO_PAGE_HARD_LIMIT,
  PRO_PAGE_MIN_LIMIT,
  PRO_PAGE_TARGET,
} from '@/domain/building/mobile-im/pptx/pro-deck-sequencer';
import {
  buildDeckSequence,
  PAGE_HARD_LIMIT,
} from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { buildA25ChapterDivider } from '@/domain/building/mobile-im/pptx/archetypes/a25-chapter-divider';
import { chunkTenantRoster, type InstitutionalTenantRosterItem } from '@/domain/building/im-core/pro-tenant-roster';
import { withThemeIsolation, W, H } from '@/domain/building/mobile-im/pptx/imlib';
import { PPTX_PRESET_TEMPLATES } from '@/domain/building/mobile-im/pptx/pptx-theme';
import type { InvestmentPosture } from '@/domain/ontology';

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

describe('Adversarial Stress Test: M2 Pro Deck Sequencer & A25 Archetype', () => {

  // --------------------------------------------------------------------------
  // Dimension 1: Extreme Tenant Roster Sizes Boundary Stress
  // --------------------------------------------------------------------------
  describe('Dimension 1: Tenant Roster Boundary Stress (0, 1, 12, 13, 24, 25, 100+)', () => {
    it('handles 0 tenants (empty roster) cleanly with standard 36 slides', async () => {
      const seq = buildProDeckSequence({
        posture: 'income',
        grade: 'B',
        data: { floor_leases: [] },
      });
      expect(seq.length).toBe(36);
      expect(seq.map(s => s.dataKey)).toContain('rentRollPart1');
      expect(seq.map(s => s.dataKey)).toContain('rentRollPart2');
    });

    it('handles 1 tenant (single occupant) cleanly with standard 36 slides', async () => {
      const seq = buildProDeckSequence({
        posture: 'income',
        grade: 'B',
        data: { floor_leases: [createMockTenant(0)] },
      });
      expect(seq.length).toBe(36);
      expect(seq.map(s => s.dataKey)).toContain('rentRollPart1');
      expect(seq.map(s => s.dataKey)).toContain('rentRollPart2');
    });

    it('handles 12 tenants (single page upper bound) cleanly with standard 36 slides', async () => {
      const seq = buildProDeckSequence({
        posture: 'income',
        grade: 'B',
        data: { floor_leases: Array.from({ length: 12 }, (_, i) => createMockTenant(i)) },
      });
      expect(seq.length).toBe(36);
      expect(seq.map(s => s.dataKey)).toContain('rentRollPart1');
      expect(seq.map(s => s.dataKey)).toContain('rentRollPart2');
    });

    it('handles 13 tenants (2-part chunking trigger) cleanly with standard 36 slides', async () => {
      const seq = buildProDeckSequence({
        posture: 'income',
        grade: 'B',
        data: { floor_leases: Array.from({ length: 13 }, (_, i) => createMockTenant(i)) },
      });
      expect(seq.length).toBe(36);
      expect(seq.map(s => s.dataKey)).toContain('rentRollPart1');
      expect(seq.map(s => s.dataKey)).toContain('rentRollPart2');
    });

    it('handles 24 tenants (2 full pages) cleanly with standard 36 slides', async () => {
      const seq = buildProDeckSequence({
        posture: 'income',
        grade: 'B',
        data: { floor_leases: Array.from({ length: 24 }, (_, i) => createMockTenant(i)) },
      });
      expect(seq.length).toBe(36);
      expect(seq.map(s => s.dataKey)).toContain('rentRollPart1');
      expect(seq.map(s => s.dataKey)).toContain('rentRollPart2');
    });

    it('handles 25 tenants (triggers 3 parts) expanding to 37 slides within limit', async () => {
      const seq = buildProDeckSequence({
        posture: 'income',
        grade: 'B',
        data: { floor_leases: Array.from({ length: 25 }, (_, i) => createMockTenant(i)) },
      });
      expect(seq.length).toBe(37);
      expect(seq.map(s => s.dataKey)).toContain('rentRollPart1');
      expect(seq.map(s => s.dataKey)).toContain('rentRollPart2');
      expect(seq.map(s => s.dataKey)).toContain('rentRollPart3');
      expect(seq.length).toBeLessThanOrEqual(PRO_PAGE_HARD_LIMIT);
    });

    it('handles 100 tenants cleanly falling back to 36 slides (<= PRO_PAGE_HARD_LIMIT)', async () => {
      const seq = buildProDeckSequence({
        posture: 'income',
        grade: 'B',
        data: { floor_leases: Array.from({ length: 100 }, (_, i) => createMockTenant(i)) },
      });
      expect(seq.length).toBe(36);
      expect(seq.length).toBeLessThanOrEqual(PRO_PAGE_HARD_LIMIT);
    });

    it('handles 500 tenants (massive portfolio) cleanly falling back to 36 slides', async () => {
      const seq = buildProDeckSequence({
        posture: 'income',
        grade: 'B',
        data: { floor_leases: Array.from({ length: 500 }, (_, i) => createMockTenant(i)) },
      });
      expect(seq.length).toBe(36);
      expect(seq.length).toBeLessThanOrEqual(PRO_PAGE_HARD_LIMIT);
    });

    // ------------------------------------------------------------------------
    // Remediated: 73..96 tenants safely falls back to standard 2-part roster (36 slides <= 40)
    // ------------------------------------------------------------------------
    it('73 tenants (7 chunks) safely falls back to standard 2-part rent roll (36 slides <= 40)', async () => {
      const tenants73 = Array.from({ length: 73 }, (_, i) => createMockTenant(i));
      const chunks = chunkTenantRoster(tenants73, 12);
      expect(chunks.length).toBe(7);

      const seq = buildProDeckSequence({
        posture: 'income',
        grade: 'B',
        data: { floor_leases: tenants73 },
      });
      expect(seq.length).toBe(36);
      expect(seq.length).toBeLessThanOrEqual(PRO_PAGE_HARD_LIMIT);
    });

    it('85 tenants (8 chunks) safely falls back to standard 2-part rent roll (36 slides <= 40)', async () => {
      const tenants85 = Array.from({ length: 85 }, (_, i) => createMockTenant(i));
      const chunks = chunkTenantRoster(tenants85, 12);
      expect(chunks.length).toBe(8);

      const seq = buildProDeckSequence({
        posture: 'income',
        grade: 'B',
        data: { floor_leases: tenants85 },
      });
      expect(seq.length).toBe(36);
      expect(seq.length).toBeLessThanOrEqual(PRO_PAGE_HARD_LIMIT);
    });
  });

  // --------------------------------------------------------------------------
  // Dimension 2: All 5 Investment Postures Stress
  // --------------------------------------------------------------------------
  describe('Dimension 2: All 5 Investment Postures Conformance', () => {
    const postures: InvestmentPosture[] = [
      'income',
      'owner_occupied',
      'development',
      'operating',
      'trading',
    ];

    for (const posture of postures) {
      it(`generates compliant 30+ slide sequence for posture: ${posture}`, () => {
        const seq = buildProDeckSequence({
          posture,
          grade: 'B',
          data: {},
        });

        expect(seq.length).toBeGreaterThanOrEqual(PRO_PAGE_MIN_LIMIT);
        expect(seq.length).toBeLessThanOrEqual(PRO_PAGE_HARD_LIMIT);

        // All 5 core chapter dividers present
        const a25Slides = seq.filter(s => s.archetype === 'A25');
        expect(a25Slides.length).toBe(5);

        // Check posture-specific routing in Chapter 3
        const keys = seq.map(s => s.dataKey);
        if (posture === 'development') {
          expect(keys).toContain('development_budget');
          expect(keys).not.toContain('debt_financing');
        } else {
          expect(keys).toContain('debt_financing');
          expect(keys).not.toContain('development_budget');
        }
      });
    }

    it('rejects publication when grade is D (G30 negative guard)', async () => {
      expect(() => {
        buildProDeckSequence({
          posture: 'income',
          grade: 'D',
          data: {},
        });
      }).toThrowError(/\[G30\]/);
    });

    it('handles unrecognized posture gracefully with fallback', async () => {
      const seq = buildProDeckSequence({
        posture: 'unrecognized_posture' as any,
        grade: 'B',
        data: {},
      });
      expect(seq.length).toBe(36);
      expect(seq.map(s => s.dataKey)).toContain('debt_financing');
    });
  });

  // --------------------------------------------------------------------------
  // Dimension 3: A25 Layout Physics & Extreme Dimensions
  // --------------------------------------------------------------------------
  describe('Dimension 3: A25 Layout Physics, Coordinate Bounds & Zero Bleed', () => {
    it('verifies 0 bleed under extreme title and subtitle lengths', async () => {
      const { pres, texts, shapes } = createMockPptxCollector();

      buildA25ChapterDivider({
        pres: pres as any,
        slideNum: 5,
        docno: 'DOC-EXTREME-01',
        data: {
          title: 'A'.repeat(400),
          subtitle: 'B'.repeat(800),
          kicker: 'C'.repeat(50),
          romanNumeral: 'IV',
          chapterNumber: 4,
          topics: [
            'D'.repeat(100),
            'E'.repeat(100),
            'F'.repeat(100),
            'G'.repeat(100),
          ],
        },
        grade: 'B',
        provenance: {},
      });

      // Assert all texts and shapes stay strictly within 16:9 canvas (13.333" x 7.5")
      for (const item of texts) {
        const x = Number(item.opts.x) || 0;
        const y = Number(item.opts.y) || 0;
        const w = Number(item.opts.w) || 0;
        const h = Number(item.opts.h) || 0;

        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(13.34);
        expect(y + h).toBeLessThanOrEqual(7.51);
      }

      for (const item of shapes) {
        const x = Number(item.opts.x) || 0;
        const y = Number(item.opts.y) || 0;
        const w = Number(item.opts.w) || 0;
        const h = Number(item.opts.h) || 0;

        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(13.34);
        expect(y + h).toBeLessThanOrEqual(7.51);
      }
    });

    it('verifies coordinate bounds with 0 topics (default note fallback box)', async () => {
      const { pres, texts, shapes } = createMockPptxCollector();

      buildA25ChapterDivider({
        pres: pres as any,
        slideNum: 1,
        docno: 'DOC-EMPTY-TOPICS',
        data: {
          title: 'Chapter Without Topics',
          romanNumeral: 'I',
          topics: [],
        },
        grade: 'A',
        provenance: {},
      });

      for (const item of [...texts, ...shapes]) {
        const x = Number(item.opts.x) || 0;
        const y = Number(item.opts.y) || 0;
        const w = Number(item.opts.w) || 0;
        const h = Number(item.opts.h) || 0;

        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(13.34);
        expect(y + h).toBeLessThanOrEqual(7.51);
      }
    });

    it('verifies coordinate bounds with 12 topics (2-column layout)', async () => {
      const { pres, texts, shapes } = createMockPptxCollector();

      const manyTopics = Array.from({ length: 12 }, (_, i) => `Topic item ${i + 1} with description`);

      buildA25ChapterDivider({
        pres: pres as any,
        slideNum: 2,
        docno: 'DOC-12-TOPICS',
        data: {
          title: 'Chapter With 12 Topics',
          subtitle: 'Detailed subtitle explaining the chapter',
          romanNumeral: 'II',
          topics: manyTopics,
        },
        grade: 'B',
        provenance: {},
      });

      for (const item of [...texts, ...shapes]) {
        const x = Number(item.opts.x) || 0;
        const y = Number(item.opts.y) || 0;
        const w = Number(item.opts.w) || 0;
        const h = Number(item.opts.h) || 0;

        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(13.34);
        expect(y + h).toBeLessThanOrEqual(7.51);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Dimension 4: Theme Switching & Background Colors
  // --------------------------------------------------------------------------
  describe('Dimension 4: Theme Switches & Non-White Background Verification', () => {
    it('verifies institutional_slate fills #2B2F3E and NEVER white', async () => {
      const slateTheme = PPTX_PRESET_TEMPLATES.institutional_slate;
      expect(slateTheme).toBeDefined();

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

        expect(slide.background).toBeDefined();
        expect(slide.background.fill).toBe('2B2F3E');
        expect(slide.background.fill).not.toBe('FFFFFF');
      });
    });

    it('verifies institutional_dark_gold fills dark navy #10161F and NEVER white', async () => {
      const darkGoldTheme = PPTX_PRESET_TEMPLATES.institutional_dark_gold;
      expect(darkGoldTheme).toBeDefined();

      await withThemeIsolation(darkGoldTheme, async () => {
        const { pres, slide } = createMockPptxCollector();
        buildA25ChapterDivider({
          pres: pres as any,
          slideNum: 3,
          docno: 'TEST-DARK-GOLD',
          data: { title: 'Dark Gold Test', romanNumeral: 'I' },
          grade: 'B',
          provenance: {},
        });

        expect(slide.background).toBeDefined();
        expect(slide.background.fill).toBe('10161F');
        expect(slide.background.fill).not.toBe('FFFFFF');
      });
    });

    it('verifies credeal_basic fills dark navy #0A1620 and NEVER white', async () => {
      const basicTheme = PPTX_PRESET_TEMPLATES.credeal_basic;
      expect(basicTheme).toBeDefined();

      await withThemeIsolation(basicTheme, async () => {
        const { pres, slide } = createMockPptxCollector();
        buildA25ChapterDivider({
          pres: pres as any,
          slideNum: 3,
          docno: 'TEST-BASIC',
          data: { title: 'Basic IM Dark Test', romanNumeral: 'I' },
          grade: 'B',
          provenance: {},
        });

        expect(slide.background).toBeDefined();
        expect(slide.background.fill).toBe('0A1620');
        expect(slide.background.fill).not.toBe('FFFFFF');
      });
    });

    it('verifies ALL available theme presets produce dark non-white backgrounds on A25', async () => {
      for (const [presetId, theme] of Object.entries(PPTX_PRESET_TEMPLATES)) {
        await withThemeIsolation(theme, async () => {
          const { pres, slide } = createMockPptxCollector();
          buildA25ChapterDivider({
            pres: pres as any,
            slideNum: 1,
            docno: `THEME-${presetId}`,
            data: { title: `Theme ${presetId}`, romanNumeral: 'I' },
            grade: 'B',
            provenance: {},
          });

          expect(slide.background, `Theme ${presetId} background`).toBeDefined();
          expect(slide.background.fill, `Theme ${presetId} background fill`).not.toBe('FFFFFF');
        });
      }
    });
  });
});

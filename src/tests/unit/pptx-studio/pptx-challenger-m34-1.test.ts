import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

import {
  PPTX_PRESET_TEMPLATES,
  CORE_PRIME_TEMPLATES,
  INSTITUTIONAL_SLATE_PRESET,
  getPptxTheme,
  validatePresetAccessibility,
  type PptxThemeTokens,
} from '@/domain/building/mobile-im/pptx/pptx-theme';

import {
  verifyCrossChannelConsistency,
  type CrossChannelAuditReport,
} from '@/domain/building/im-core/cross-channel-checker';

import {
  inspectPptxBinary,
  FORBIDDEN_PERSONA_PATTERN,
  FORBIDDEN_LEXICON_PATTERN,
  FORBIDDEN_LEGAL_RISK_PATTERN,
  type PptxPhysicalInspectionResult,
} from '@/assurance/im-harness/observers/pptx-binary-observer';

import {
  buildDeckSequence,
  type DeckSequenceInput,
  type SlideSpec,
} from '@/domain/building/mobile-im/pptx/deck-sequencer';

import { CORE_PRIME_PRESETS } from '@/components/broker/pptx-editor/token-editor-panel';

// ════════════════════════════════════════════════════════════════════════════
// Adversarial Challenger M34-1 Test Harness Helpers
// ════════════════════════════════════════════════════════════════════════════

function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * Helper to construct an in-memory PPTX ZIP binary with customizable elements.
 */
async function buildMockPptx(options: {
  shapes?: Array<{ x: number; y: number; cx: number; cy: number; text?: string }>;
  images?: Array<{ x: number; y: number; cx: number; cy: number; rId?: string; filename?: string; buffer?: Buffer }>;
  tables?: Array<{ x: number; y: number; cx: number; cy: number }>;
  groups?: Array<{ x: number; y: number; cx: number; cy: number }>;
  text?: string;
  missingMediaRel?: boolean;
}): Promise<Buffer> {
  const zip = new JSZip();

  let spXml = '';
  if (options.shapes && options.shapes.length > 0) {
    spXml = options.shapes
      .map(
        (sp, idx) => `
        <p:sp>
          <p:nvSpPr><p:cNvPr id="${idx + 1}" name="Shape${idx + 1}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
          <p:spPr>
            <a:xfrm>
              <a:off x="${sp.x}" y="${sp.y}"/>
              <a:ext cx="${sp.cx}" cy="${sp.cy}"/>
            </a:xfrm>
          </p:spPr>
          <p:txBody>
            <a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${sp.text ?? '정상 본문 텍스트'}</a:t></a:r></a:p>
          </p:txBody>
        </p:sp>`
      )
      .join('');
  } else {
    spXml = `
      <p:sp>
        <p:nvSpPr><p:cNvPr id="1" name="Shape1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="1000000" y="500000"/>
            <a:ext cx="5000000" cy="2000000"/>
          </a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${options.text ?? '표준 안내 문구'}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>`;
  }

  let picXml = '';
  const rels: string[] = [];

  if (options.images && options.images.length > 0) {
    picXml = options.images
      .map((img, idx) => {
        const rId = img.rId ?? `rIdImg${idx + 1}`;
        const fname = img.filename ?? `image${idx + 1}.png`;
        if (img.buffer !== undefined) {
          zip.file(`ppt/media/${fname}`, img.buffer);
        }
        rels.push(`<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${fname}"/>`);

        return `
          <p:pic>
            <p:nvPicPr><p:cNvPr id="${idx + 100}" name="Pic${idx + 1}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
            <p:blipFill><a:blip r:embed="${rId}"/></p:blipFill>
            <p:spPr>
              <a:xfrm>
                <a:off x="${img.x}" y="${img.y}"/>
                <a:ext cx="${img.cx}" cy="${img.cy}"/>
              </a:xfrm>
            </p:spPr>
          </p:pic>`;
      })
      .join('');
  } else {
    // Default valid 200 DPI PNG image
    const validPng = Buffer.alloc(33);
    validPng.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    validPng.writeUInt32BE(13, 8);
    validPng.write('IHDR', 12);
    validPng.writeUInt32BE(1600, 16); // 1600 px
    validPng.writeUInt32BE(1200, 20); // 1200 px
    zip.file('ppt/media/image1.png', validPng);

    rels.push(
      `<Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>`
    );

    picXml = `
      <p:pic>
        <p:nvPicPr><p:cNvPr id="200" name="Pic1"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="rIdImg1"/></p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="1000000" y="3000000"/>
            <a:ext cx="5486400" cy="3657600"/> <!-- 6.0" x 4.0" -> 1600/6 = 266.7 DPI -->
          </a:xfrm>
        </p:spPr>
      </p:pic>`;
  }

  if (options.missingMediaRel) {
    rels.push(
      `<Relationship Id="rIdMissing" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/nonexistent.png"/>`
    );
  }

  let gfXml = '';
  if (options.tables && options.tables.length > 0) {
    gfXml = options.tables
      .map(
        (tb, idx) => `
        <p:graphicFrame>
          <p:nvGraphicFramePr><p:cNvPr id="${idx + 300}" name="Table${idx + 1}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
          <p:xfrm>
            <a:off x="${tb.x}" y="${tb.y}"/>
            <a:ext cx="${tb.cx}" cy="${tb.cy}"/>
          </p:xfrm>
        </p:graphicFrame>`
      )
      .join('');
  }

  let grpXml = '';
  if (options.groups && options.groups.length > 0) {
    grpXml = options.groups
      .map(
        (grp, idx) => `
        <p:grpSp>
          <p:grpSpPr>
            <a:xfrm>
              <a:off x="${grp.x}" y="${grp.y}"/>
              <a:ext cx="${grp.cx}" cy="${grp.cy}"/>
            </a:xfrm>
          </p:grpSpPr>
        </p:grpSp>`
      )
      .join('');
  }

  zip.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <p:cSld>
        <p:spTree>
          ${spXml}
          ${picXml}
          ${gfXml}
          ${grpXml}
        </p:spTree>
      </p:cSld>
    </p:sld>`
  );

  zip.file(
    'ppt/slides/_rels/slide1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      ${rels.join('\n')}
    </Relationships>`
  );

  return await zip.generateAsync({ type: 'nodebuffer' });
}

describe('Adversarial Challenger M34-1: Hardening & Stress Suite', () => {
  // ════════════════════════════════════════════════════════════════════════════
  // 1. institutional_slate Theme Tokens & Contrast Adversarial Challenge
  // ════════════════════════════════════════════════════════════════════════════
  describe('Mission 1: institutional_slate Theme Tokens & Contrast', () => {
    const slateTheme = PPTX_PRESET_TEMPLATES.institutional_slate;

    it('CH-01: Baseline institutional_slate tokens achieve 0 accessibility violations', () => {
      expect(slateTheme).toBeDefined();
      expect(slateTheme.presetId).toBe(INSTITUTIONAL_SLATE_PRESET);
      expect(CORE_PRIME_TEMPLATES).toContain(INSTITUTIONAL_SLATE_PRESET);

      const violations = validatePresetAccessibility(slateTheme);
      expect(violations).toEqual([]);
      expect(violations.length).toBe(0);

      // Verify high contrast ratios on dark slate background (#2B2F3E)
      const inkRatio = contrastRatio(slateTheme.ink, slateTheme.bg);
      expect(inkRatio).toBeGreaterThanOrEqual(13.0); // ~13.14:1

      const bodyRatio = contrastRatio(slateTheme.body, slateTheme.bg);
      expect(bodyRatio).toBeGreaterThanOrEqual(8.0); // ~8.70:1

      const accentRatio = contrastRatio(slateTheme.accent, slateTheme.bg);
      expect(accentRatio).toBeGreaterThanOrEqual(9.0); // ~9.72:1

      const darkBodyRatio = contrastRatio(slateTheme.darkBody, slateTheme.darkCard);
      expect(darkBodyRatio).toBeGreaterThanOrEqual(10.0); // ~11.83:1
    });

    it('CH-02: Contrast validator catches and rejects deliberately low-contrast body text on dark bg', () => {
      const adversarialTheme: PptxThemeTokens = {
        ...slateTheme,
        presetId: 'adv_bad_body',
        body: '3D4356', // Very dark slate-gray on 2B2F3E: contrast ~1.5:1 (required >= 4.5:1)
      };

      const issues = validatePresetAccessibility(adversarialTheme);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.includes('body(3D4356)') && i.includes('bg(2B2F3E)'))).toBe(true);

      // Negative pair: original body (#CBD5E1) passes
      expect(validatePresetAccessibility(slateTheme)).toEqual([]);
    });

    it('CH-03: Contrast validator catches and rejects deliberately low-contrast ink / heading text', () => {
      const adversarialTheme: PptxThemeTokens = {
        ...slateTheme,
        presetId: 'adv_bad_ink',
        ink: '4A5268', // Dark border color used as ink text on 2B2F3E: contrast ~1.9:1 (required >= 4.5:1)
      };

      const issues = validatePresetAccessibility(adversarialTheme);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.includes('ink(4A5268)') && i.includes('bg(2B2F3E)'))).toBe(true);
    });

    it('CH-04: Contrast validator catches and rejects low-contrast accent color on dark bg', () => {
      const adversarialTheme: PptxThemeTokens = {
        ...slateTheme,
        presetId: 'adv_bad_accent',
        accent: '353B4D', // Dark muted tone on 2B2F3E: contrast ~1.2:1 (required >= 3.0:1)
      };

      const issues = validatePresetAccessibility(adversarialTheme);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.includes('accent(353B4D)'))).toBe(true);
    });

    it('CH-05: Contrast validator catches low-contrast darkBody text on darkCard container', () => {
      const adversarialTheme: PptxThemeTokens = {
        ...slateTheme,
        presetId: 'adv_bad_dark_body',
        darkBody: '2D3242', // Nearly identical to darkCard (#232733): contrast ~1.2:1 (required >= 3.0:1)
      };

      const issues = validatePresetAccessibility(adversarialTheme);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.includes('darkBody(2D3242)') && i.includes('darkCard(232733)'))).toBe(true);
    });

    it('CH-06: Multi-token corruption injection produces multiple simultaneous violation flags', () => {
      const heavilyCorruptedTheme: PptxThemeTokens = {
        ...slateTheme,
        presetId: 'adv_multi_corrupt',
        body: '3D4356', // Bad
        ink: '353B4D', // Bad
        accent: '2B2F3E', // Same as bg (1.0:1)
        darkBody: '232733', // Same as card (1.0:1)
      };

      const issues = validatePresetAccessibility(heavilyCorruptedTheme);
      expect(issues.length).toBeGreaterThanOrEqual(4);
      expect(issues.some((i) => i.includes('body'))).toBe(true);
      expect(issues.some((i) => i.includes('ink'))).toBe(true);
      expect(issues.some((i) => i.includes('accent'))).toBe(true);
      expect(issues.some((i) => i.includes('darkBody'))).toBe(true);
    });

    it('CH-07: CSS custom property parsing in globals.css maintains exact slate variables & contrast', () => {
      const globalsCssPath = path.resolve(process.cwd(), 'src/app/globals.css');
      const cssContent = fs.readFileSync(globalsCssPath, 'utf8');

      // Verify exact theme selector and properties
      expect(cssContent).toContain('[data-theme="institutional_slate"]');
      expect(cssContent).toMatch(/--background:\s*#2B2F3E/i);
      expect(cssContent).toMatch(/--foreground:\s*#FFFFFF/i);
      expect(cssContent).toMatch(/--card:\s*#232733/i);
      expect(cssContent).toMatch(/--accent:\s*#E8DEC8/i);
      expect(cssContent).toMatch(/--border:\s*#3D4356/i);
      expect(cssContent).toMatch(/--slate-bg:\s*#2B2F3E/i);
      expect(cssContent).toMatch(/--slate-gold:\s*#E8DEC8/i);

      // Verify token editor panel exports
      const slatePreset = CORE_PRIME_PRESETS.find((p) => p.id === 'institutional_slate');
      expect(slatePreset).toBeDefined();
      expect(slatePreset?.alias).toBe('institutional_slate');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. Cross-Channel Consistency (7 Core Metrics) Adversarial Stress-Testing
  // ════════════════════════════════════════════════════════════════════════════
  describe('Mission 2: Cross-Channel Consistency (7 Core Metrics)', () => {
    // Base clean document & pptx matching all 7 metrics
    const makeBaseline = () => ({
      webDoc: {
        title: '여의도 파이낸스타워',
        body: {
          title: '여의도 파이낸스타워',
          ssot_summary: {
            asking_price: 120_000_000_000, // 1200억
            total_area: 8450.5,
            land_area: 1820.3,
            cap_rate: 5.45,
            total_deposit: 6_000_000_000,
            monthly_rent: 350_000_000,
          },
        },
      },
      pptxProject: {
        title: '여의도 파이낸스타워',
        slides: [
          {
            layoutType: 'A01_Cover',
            dataKey: 'cover',
            title: '여의도 파이낸스타워',
          },
          {
            layoutType: 'A02_Overview',
            dataKey: 'overview',
            slideOverrides: {
              price: 120_000_000_000,
              area: 8450.5,
              landArea: 1820.3,
              grossYield: 5.45,
            },
          },
          {
            dataKey: 'financials',
            slideOverrides: {
              price: 120_000_000_000,
              capRate: 5.45,
              totalDeposit: 6_000_000_000,
              monthlyRent: 350_000_000,
            },
          },
          {
            dataKey: 'rentRoll',
            slideOverrides: {
              totalDeposit: 6_000_000_000,
              totalMonthlyRent: 350_000_000,
            },
          },
        ],
      },
    });

    it('CH-08: Baseline matches all 7 core metrics with 0 discrepancies and passed=true', () => {
      const base = makeBaseline();
      const report = verifyCrossChannelConsistency(base);

      expect(report.passed).toBe(true);
      expect(report.totalDiscrepancies).toBe(0);
      expect(report.discrepancies).toEqual([]);
      expect(report.verifiedMetrics).toEqual(
        expect.arrayContaining([
          'title',
          'asking_price',
          'total_area',
          'land_area',
          'cap_rate',
          'total_deposit',
          'monthly_rent',
        ])
      );
      expect(report.verifiedMetrics.length).toBe(7);
    });

    it('CH-09: Price drift stress-test: 0.05% drift passes, 0.15% drift (> 0.1% threshold) is caught', () => {
      const base = makeBaseline();

      // Negative pair: 0.05% sub-threshold drift is tolerated (within 0.1%)
      const subThreshold = makeBaseline();
      subThreshold.pptxProject.slides[1].slideOverrides.price = 120_000_000_000 * 1.0005; // 120,060,000,000
      subThreshold.pptxProject.slides[2].slideOverrides.price = 120_000_000_000 * 1.0005;
      const subReport = verifyCrossChannelConsistency(subThreshold);
      expect(subReport.passed).toBe(true);
      expect(subReport.verifiedMetrics).toContain('asking_price');

      // Adversarial attack: 0.15% drift (> 0.10% threshold)
      const adv = makeBaseline();
      const advPrice = 120_000_000_000 * 1.0015; // 120,180,000,000 (+1.8억)
      adv.pptxProject.slides[1].slideOverrides.price = advPrice;
      adv.pptxProject.slides[2].slideOverrides.price = advPrice;

      const report = verifyCrossChannelConsistency(adv);
      expect(report.passed).toBe(false);
      expect(report.totalDiscrepancies).toBe(1);
      const disc = report.discrepancies.find((d) => d.field === 'asking_price');
      expect(disc).toBeDefined();
      expect(disc?.discrepancyType).toBe('NUMERICAL_MISMATCH');
      expect(disc?.webValue).toBe(120_000_000_000);
      expect(disc?.pptxValue).toBe(advPrice);
    });

    it('CH-10: Total Area drift stress-test: 0.04 ㎡ passes, 0.08 ㎡ (> 0.05 ㎡ threshold) is caught', () => {
      // Negative pair: 0.04 ㎡ drift is tolerated
      const sub = makeBaseline();
      sub.pptxProject.slides[1].slideOverrides.area = 8450.54;
      const subReport = verifyCrossChannelConsistency(sub);
      expect(subReport.passed).toBe(true);
      expect(subReport.verifiedMetrics).toContain('total_area');

      // Adversarial attack: 0.08 ㎡ drift
      const adv = makeBaseline();
      adv.pptxProject.slides[1].slideOverrides.area = 8450.58;
      const report = verifyCrossChannelConsistency(adv);

      expect(report.passed).toBe(false);
      const disc = report.discrepancies.find((d) => d.field === 'total_area');
      expect(disc).toBeDefined();
      expect(disc?.discrepancyType).toBe('NUMERICAL_MISMATCH');
      expect(disc?.message).toContain('연면적 수치 불일치');
    });

    it('CH-11: Land Area drift stress-test: 0.03 ㎡ passes, 0.08 ㎡ (> 0.05 ㎡ threshold) is caught', () => {
      // Negative pair: 0.03 ㎡ drift is tolerated
      const sub = makeBaseline();
      sub.pptxProject.slides[1].slideOverrides.landArea = 1820.33;
      const subReport = verifyCrossChannelConsistency(sub);
      expect(subReport.passed).toBe(true);
      expect(subReport.verifiedMetrics).toContain('land_area');

      // Adversarial attack: 0.08 ㎡ drift
      const adv = makeBaseline();
      adv.pptxProject.slides[1].slideOverrides.landArea = 1820.38;
      const report = verifyCrossChannelConsistency(adv);

      expect(report.passed).toBe(false);
      const disc = report.discrepancies.find((d) => d.field === 'land_area');
      expect(disc).toBeDefined();
      expect(disc?.discrepancyType).toBe('NUMERICAL_MISMATCH');
      expect(disc?.message).toContain('대지면적 수치 불일치');
    });

    it('CH-12: Cap Rate drift stress-test: 0.03 %p passes, 0.08 %p (> 0.05 %p threshold) is caught', () => {
      // Negative pair: 0.03 %p drift is tolerated
      const sub = makeBaseline();
      sub.pptxProject.slides[1].slideOverrides.grossYield = 5.48;
      sub.pptxProject.slides[2].slideOverrides.capRate = 5.48;
      const subReport = verifyCrossChannelConsistency(sub);
      expect(subReport.passed).toBe(true);
      expect(subReport.verifiedMetrics).toContain('cap_rate');

      // Adversarial attack: 0.08 %p drift (5.45% vs 5.53%)
      const adv = makeBaseline();
      adv.pptxProject.slides[1].slideOverrides.grossYield = 5.53;
      adv.pptxProject.slides[2].slideOverrides.capRate = 5.53;
      const report = verifyCrossChannelConsistency(adv);

      expect(report.passed).toBe(false);
      const disc = report.discrepancies.find((d) => d.field === 'cap_rate');
      expect(disc).toBeDefined();
      expect(disc?.discrepancyType).toBe('NUMERICAL_MISMATCH');
      expect(disc?.message).toContain('수익률/Cap Rate 수치 불일치');
    });

    it('CH-13: Deposit & Rent 1 KRW vs 2 KRW stress-test: 1 KRW passes, 2 KRW (> 1 KRW threshold) is caught', () => {
      // Negative pair: 1 KRW difference is tolerated
      const sub = makeBaseline();
      sub.pptxProject.slides[2].slideOverrides.totalDeposit = 6_000_000_001;
      sub.pptxProject.slides[3].slideOverrides.totalDeposit = 6_000_000_001;
      sub.pptxProject.slides[2].slideOverrides.monthlyRent = 350_000_001;
      sub.pptxProject.slides[3].slideOverrides.totalMonthlyRent = 350_000_001;

      const subReport = verifyCrossChannelConsistency(sub);
      expect(subReport.passed).toBe(true);
      expect(subReport.verifiedMetrics).toContain('total_deposit');
      expect(subReport.verifiedMetrics).toContain('monthly_rent');

      // Adversarial attack: 2 KRW difference (> 1 KRW)
      const adv = makeBaseline();
      adv.pptxProject.slides[2].slideOverrides.totalDeposit = 6_000_000_002;
      adv.pptxProject.slides[3].slideOverrides.totalDeposit = 6_000_000_002;
      adv.pptxProject.slides[2].slideOverrides.monthlyRent = 350_000_002;
      adv.pptxProject.slides[3].slideOverrides.totalMonthlyRent = 350_000_002;

      const report = verifyCrossChannelConsistency(adv);
      expect(report.passed).toBe(false);
      expect(report.totalDiscrepancies).toBe(2);

      const depDisc = report.discrepancies.find((d) => d.field === 'total_deposit');
      expect(depDisc).toBeDefined();
      expect(depDisc?.discrepancyType).toBe('NUMERICAL_MISMATCH');

      const rentDisc = report.discrepancies.find((d) => d.field === 'monthly_rent');
      expect(rentDisc).toBeDefined();
      expect(rentDisc?.discrepancyType).toBe('NUMERICAL_MISMATCH');
    });

    it('CH-14: Title mismatch stress-test catches document title drift', () => {
      const adv = makeBaseline();
      adv.pptxProject.title = '완전히 다른 빌딩 이름';
      adv.pptxProject.slides[0].title = '완전히 다른 빌딩 이름';

      const report = verifyCrossChannelConsistency(adv);
      expect(report.passed).toBe(false);
      const disc = report.discrepancies.find((d) => d.field === 'title');
      expect(disc).toBeDefined();
      expect(disc?.discrepancyType).toBe('TEXT_MISMATCH');
    });

    it('CH-15: Simultaneous adversarial attack across all 7 metrics flags 100% of discrepancies (7/7)', () => {
      const adv = makeBaseline();

      // Corrupt all 7 metrics simultaneously
      adv.pptxProject.title = '강남 테헤란로 빌딩';
      adv.pptxProject.slides[0].title = '강남 테헤란로 빌딩';
      adv.pptxProject.slides[1].slideOverrides.price = 120_180_000_000; // 0.15% drift
      adv.pptxProject.slides[2].slideOverrides.price = 120_180_000_000;
      adv.pptxProject.slides[1].slideOverrides.area = 8450.59; // 0.09 ㎡ drift
      adv.pptxProject.slides[1].slideOverrides.landArea = 1820.39; // 0.09 ㎡ drift
      adv.pptxProject.slides[1].slideOverrides.grossYield = 5.54; // 0.09 %p drift
      adv.pptxProject.slides[2].slideOverrides.capRate = 5.54;
      adv.pptxProject.slides[2].slideOverrides.totalDeposit = 6_000_000_005; // 5 KRW drift
      adv.pptxProject.slides[3].slideOverrides.totalDeposit = 6_000_000_005;
      adv.pptxProject.slides[2].slideOverrides.monthlyRent = 350_000_005; // 5 KRW drift
      adv.pptxProject.slides[3].slideOverrides.totalMonthlyRent = 350_000_005;

      const report = verifyCrossChannelConsistency(adv);
      expect(report.passed).toBe(false);
      expect(report.totalDiscrepancies).toBe(7);
      expect(report.verifiedMetrics.length).toBe(0);

      const fields = report.discrepancies.map((d) => d.field);
      expect(fields).toContain('title');
      expect(fields).toContain('asking_price');
      expect(fields).toContain('total_area');
      expect(fields).toContain('land_area');
      expect(fields).toContain('cap_rate');
      expect(fields).toContain('total_deposit');
      expect(fields).toContain('monthly_rent');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. Physical Binary Observer (6 Gates) Adversarial Stress-Testing
  // ════════════════════════════════════════════════════════════════════════════
  describe('Mission 3: Physical Binary Observer (6 Gates)', () => {
    it('CH-16: Clean baseline PPTX binary passes all 6 gates with 0 issues and isPass=true', async () => {
      const cleanBuf = await buildMockPptx({
        shapes: [
          {
            x: 1000000,
            y: 1000000,
            cx: 5000000,
            cy: 2000000,
            text: '크리딜 상업용 부동산 투자설명서 - 핵심 투자 지표 요약',
          },
        ],
      });

      const inspection = await inspectPptxBinary(cleanBuf);
      expect(inspection.isPass).toBe(true);
      expect(inspection.bleedCount).toBe(0);
      expect(inspection.personaViolationCount).toBe(0);
      expect(inspection.lexiconViolationCount).toBe(0);
      expect(inspection.legalRiskViolationCount).toBe(0);
      expect(inspection.placeholderResidueCount).toBe(0);
      expect(inspection.brokenImageCount).toBe(0);
      expect(inspection.minEffectiveDpi).toBeGreaterThanOrEqual(150);
      expect(inspection.issues).toEqual([]);
    });

    it('CH-17: Bleed stress-testing detects coordinates outside 16:9 bounds across left, right, top, bottom', async () => {
      // Canvas: 12,192,000 x 6,858,000 EMU with 10,000 EMU tolerance

      // 1. Left edge bleed (x < -10,000)
      const leftBleedBuf = await buildMockPptx({
        shapes: [{ x: -10001, y: 100000, cx: 3000000, cy: 1000000 }],
      });
      const leftRes = await inspectPptxBinary(leftBleedBuf);
      expect(leftRes.bleedCount).toBe(1);
      expect(leftRes.isPass).toBe(false);

      // Negative pair: exactly at -10,000 EMU tolerance passes
      const leftTolBuf = await buildMockPptx({
        shapes: [{ x: -10000, y: 100000, cx: 3000000, cy: 1000000 }],
      });
      const leftTolRes = await inspectPptxBinary(leftTolBuf);
      expect(leftTolRes.bleedCount).toBe(0);

      // 2. Right edge bleed (x + cx > 12,192,000 + 10,000)
      const rightBleedBuf = await buildMockPptx({
        shapes: [{ x: 10000000, y: 100000, cx: 2202001, cy: 1000000 }], // 12,202,001
      });
      const rightRes = await inspectPptxBinary(rightBleedBuf);
      expect(rightRes.bleedCount).toBe(1);
      expect(rightRes.isPass).toBe(false);

      // 3. Top edge bleed (y < -10,000)
      const topBleedBuf = await buildMockPptx({
        shapes: [{ x: 100000, y: -10001, cx: 3000000, cy: 1000000 }],
      });
      const topRes = await inspectPptxBinary(topBleedBuf);
      expect(topRes.bleedCount).toBe(1);
      expect(topRes.isPass).toBe(false);

      // 4. Bottom edge bleed (y + cy > 6,858,000 + 10,000)
      const bottomBleedBuf = await buildMockPptx({
        shapes: [{ x: 100000, y: 5000000, cx: 3000000, cy: 1868001 }], // 6,868,001
      });
      const bottomRes = await inspectPptxBinary(bottomBleedBuf);
      expect(bottomRes.bleedCount).toBe(1);
      expect(bottomRes.isPass).toBe(false);
    });

    it('CH-18: Bleed detection functions across varied XML elements (shapes, images, tables, groups)', async () => {
      // Bleed in p:pic
      const picBleedBuf = await buildMockPptx({
        images: [{ x: 12000000, y: 1000000, cx: 500000, cy: 500000 }], // 12,500,000 > 12,202,000
      });
      const picRes = await inspectPptxBinary(picBleedBuf);
      expect(picRes.bleedCount).toBe(1);
      expect(picRes.issues.some((i) => i.includes('이미지 지면(16:9) 이탈'))).toBe(true);

      // Bleed in p:graphicFrame (tables)
      const tableBleedBuf = await buildMockPptx({
        tables: [{ x: 100000, y: 6500000, cx: 5000000, cy: 500000 }], // 7,000,000 > 6,868,000
      });
      const tableRes = await inspectPptxBinary(tableBleedBuf);
      expect(tableRes.bleedCount).toBe(1);
      expect(tableRes.issues.some((i) => i.includes('테이블/프레임 지면(16:9) 이탈'))).toBe(true);

      // Bleed in p:grpSp (groups)
      const grpBleedBuf = await buildMockPptx({
        groups: [{ x: -20000, y: 100000, cx: 1000000, cy: 1000000 }],
      });
      const grpRes = await inspectPptxBinary(grpBleedBuf);
      expect(grpRes.bleedCount).toBe(1);
      expect(grpRes.issues.some((i) => i.includes('그룹도형 지면(16:9) 이탈'))).toBe(true);
    });

    it('CH-19: Persona words injection (Rule 1) detects all forbidden demographic targeting terms', async () => {
      const personaAttacks = [
        '60대 자산가 맞춤 추천 물건',
        '70대 투자자를 위한 안전 자산',
        '50대 대표 맞춤형 사옥',
        '40대 고객을 위한 최적 포트폴리오',
        '30대 매수자 최적화',
        'MZ 자산가 추천',
        '초보 투자자 맞춤',
        '고액 자산가 전용',
        '법인 대표 맞춤',
        '디벨로퍼 투자자 추천',
        '리츠 운용사 맞춤',
        'VIP 고객 전용',
      ];

      for (const phrase of personaAttacks) {
        const buf = await buildMockPptx({ text: `본 자산은 ${phrase}으로 구성되었습니다.` });
        const res = await inspectPptxBinary(buf);
        expect(res.personaViolationCount).toBeGreaterThanOrEqual(1);
        expect(res.issues.some((i) => i.includes('[Rule 1 페르소나 위반]'))).toBe(true);
        expect(res.isPass).toBe(false);
      }

      // Negative pair: professional phrases without persona demographic targeting
      const validBuf = await buildMockPptx({
        text: '본 자산은 프라임 권역 내 핵심 기관급 오피스 물건으로 안정적인 현금흐름을 창출합니다.',
      });
      const validRes = await inspectPptxBinary(validBuf);
      expect(validRes.personaViolationCount).toBe(0);
    });

    it('CH-20: CRE Lexicon violations injection (Rule 2) detects all unapproved transliterations', async () => {
      const lexiconAttacks = [
        '연간 예상 캡레이트 5.4%',
        '연간 GOP 15억원 달성',
        '사옥 네이밍 라이츠 제공',
        '외벽 브랜딩 라이츠 확보',
      ];

      for (const phrase of lexiconAttacks) {
        const buf = await buildMockPptx({ text: `투자 핵심: ${phrase}` });
        const res = await inspectPptxBinary(buf);
        expect(res.lexiconViolationCount).toBeGreaterThanOrEqual(1);
        expect(res.issues.some((i) => i.includes('[Rule 2 CRE 표준용어 위반]'))).toBe(true);
        expect(res.isPass).toBe(false);
      }

      // Negative pair: standard approved Korean CRE terminology
      const approvedPhrases = [
        '연 순수익률 (Cap Rate) 5.4%',
        '실질 영업이익 (GOP) 15억원',
        '사옥 단독 명칭 표기(간판 설치권)',
        '기업 단독 브랜딩',
        '인테리어 지원금(TI) / 렌트프리(무상임대)',
      ];

      for (const phrase of approvedPhrases) {
        const buf = await buildMockPptx({ text: `검증 완료: ${phrase}` });
        const res = await inspectPptxBinary(buf);
        expect(res.lexiconViolationCount).toBe(0);
      }
    });

    it('CH-21: P0 Legal Risk phrases injection detects forbidden regulatory guarantee terms', async () => {
      const legalAttacks = [
        '연 7.5% 수익률 보장 상품',
        '투자 원금 보장 100%',
        '배당 확정 연 6.0%',
        '확정 수익률 지급 보증',
        '매수 강력 추천 물건',
        'LTV 80% 대출 확정',
      ];

      for (const phrase of legalAttacks) {
        const buf = await buildMockPptx({ text: `안내: ${phrase}` });
        const res = await inspectPptxBinary(buf);
        expect(res.legalRiskViolationCount).toBeGreaterThanOrEqual(1);
        expect(res.issues.some((i) => i.includes('[P0 법적 금지어 위반]'))).toBe(true);
        expect(res.isPass).toBe(false);
      }

      // Negative pair: objective factual descriptions
      const compliantLegal = await buildMockPptx({
        text: '임대차 계약 및 공공데이터에 기반한 과거 운영 실적 지표이며 장래 수익을 보장하지 않습니다.',
      });
      const compliantRes = await inspectPptxBinary(compliantLegal);
      expect(compliantRes.legalRiskViolationCount).toBe(0);
    });

    it('CH-22: Placeholder residue & corruption detector catches {{...}}, NaN, undefined, and null', async () => {
      const badTokens = [
        '매매가: {{claim.asking_price}}',
        '연면적: {{snapshot.gfa}} ㎡',
        '수치: >NaN<',
        '상태: >undefined<',
        '주소: >null<',
        '객체: >[object Object]<',
      ];

      for (const bad of badTokens) {
        const buf = await buildMockPptx({ text: `필드 출력: ${bad}` });
        const res = await inspectPptxBinary(buf);
        expect(res.placeholderResidueCount).toBeGreaterThanOrEqual(1);
        expect(res.issues.some((i) => i.includes('미치환 자리표시자'))).toBe(true);
        expect(res.isPass).toBe(false);
      }
    });

    it('CH-23: Broken images and low DPI images are flagged as release-blocking defects', async () => {
      // 1. 0-byte image file
      const zeroByteBuf = await buildMockPptx({
        images: [{ x: 1000000, y: 1000000, cx: 3000000, cy: 2000000, buffer: Buffer.alloc(0) }],
      });
      const zeroRes = await inspectPptxBinary(zeroByteBuf);
      expect(zeroRes.brokenImageCount).toBeGreaterThanOrEqual(1);
      expect(zeroRes.issues.some((i) => i.includes('0바이트 손상된 이미지'))).toBe(true);
      expect(zeroRes.isPass).toBe(false);

      // 2. Corrupt header image
      const corruptHeaderBuf = await buildMockPptx({
        images: [{ x: 1000000, y: 1000000, cx: 3000000, cy: 2000000, buffer: Buffer.from([0x01, 0x02, 0x03]) }],
      });
      const corruptRes = await inspectPptxBinary(corruptHeaderBuf);
      expect(corruptRes.brokenImageCount).toBeGreaterThanOrEqual(1);
      expect(corruptRes.issues.some((i) => i.includes('이미지 헤더 손상'))).toBe(true);
      expect(corruptRes.isPass).toBe(false);

      // 3. Missing image referenced in relationships
      const missingBuf = await buildMockPptx({
        missingMediaRel: true,
      });
      const missingRes = await inspectPptxBinary(missingBuf);
      expect(missingRes.brokenImageCount).toBeGreaterThanOrEqual(1);
      expect(missingRes.issues.some((i) => i.includes('참조된 이미지 파일 부재'))).toBe(true);
      expect(missingRes.isPass).toBe(false);

      // 4. Low resolution image (< 150 DPI)
      // 600 px image placed in 5.0" box (4,572,000 EMU) -> 120 DPI (< 150 DPI)
      const lowDpiPng = Buffer.alloc(33);
      lowDpiPng.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      lowDpiPng.writeUInt32BE(13, 8);
      lowDpiPng.write('IHDR', 12);
      lowDpiPng.writeUInt32BE(600, 16); // 600 px width
      lowDpiPng.writeUInt32BE(600, 20);

      const lowDpiBuf = await buildMockPptx({
        images: [{ x: 1000000, y: 1000000, cx: 4572000, cy: 4572000, buffer: lowDpiPng }],
      });
      const lowDpiRes = await inspectPptxBinary(lowDpiBuf);
      expect(lowDpiRes.minEffectiveDpi).toBeLessThan(150);
      expect(lowDpiRes.issues.some((i) => i.includes('실효 DPI 부족'))).toBe(true);
      expect(lowDpiRes.isPass).toBe(false);
    });

    it('CH-24: Multi-defect PPTX fails all 6 gates concurrently with comprehensive issue reporting', async () => {
      // Inject: bleed + persona + lexicon + legal risk + placeholder + low DPI
      const lowDpiPng = Buffer.alloc(33);
      lowDpiPng.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      lowDpiPng.writeUInt32BE(13, 8);
      lowDpiPng.write('IHDR', 12);
      lowDpiPng.writeUInt32BE(400, 16);
      lowDpiPng.writeUInt32BE(400, 20);

      const multiDefectBuf = await buildMockPptx({
        shapes: [
          {
            x: -20000, // Bleed (x < -10,000)
            y: 1000000,
            cx: 5000000,
            cy: 2000000,
            text: '60대 자산가 맞춤 연간 예상 캡레이트 6.5% 수익률 보장 {{claim.asking_price}}',
          },
        ],
        images: [
          {
            x: 1000000,
            y: 1000000,
            cx: 4572000,
            cy: 4572000,
            buffer: lowDpiPng, // 80 DPI
          },
        ],
      });

      const res = await inspectPptxBinary(multiDefectBuf);
      expect(res.isPass).toBe(false);
      expect(res.bleedCount).toBeGreaterThanOrEqual(1);
      expect(res.personaViolationCount).toBeGreaterThanOrEqual(1);
      expect(res.lexiconViolationCount).toBeGreaterThanOrEqual(1);
      expect(res.legalRiskViolationCount).toBeGreaterThanOrEqual(1);
      expect(res.placeholderResidueCount).toBeGreaterThanOrEqual(1);
      expect(res.minEffectiveDpi).toBeLessThan(150);
      expect(res.issues.length).toBeGreaterThanOrEqual(6);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 4. Rule 10 Slide Limit Hardness (22 Body Slides + 4 Appendix Input)
  // ════════════════════════════════════════════════════════════════════════════
  describe('Mission 4: Rule 10 Slide Limit Hardness', () => {
    it('CH-25: Provides deck sequence with 22 body slides and 4 appendix slides, strictly trimming body to <= 16 while preserving all 4 appendices', () => {
      // Configure input that generates exactly 22 raw body slides:
      // - cover (1)
      // - 6 gallery slides (6)
      // - summary (1)
      // - location (1)
      // - land (1)
      // - building (1)
      // - rentRoll (1)
      // - stability (1)
      // - profit (1)
      // - comps (1)
      // - capital (1) [Grade B]
      // - totalReturn (1) [Grade B]
      // - closing slides: thesis (1), risk (1), checklist (1), process (1), closing (1)
      // Raw Body Slides = 1 + 6 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 5 = 22 body slides.
      //
      // Plus 4 appendices triggered by dataAvailability:
      // - publicRecords (hasBuildingRegister + hasLandUsePlan)
      // - titleRights (hasRegistryData)
      // - cadastralMap (hasCadastralMap)
      // - commercialDistrict (hasCommercialDistrict)
      // Appendix Slides = 4.

      const input: DeckSequenceInput = {
        posture: 'income',
        grade: 'B',
        incomeArchetype: 'R-INC-01',
        hasPhotos: false,
        gallerySpecs: [
          { kicker: 'Gallery', title: '외관 전경', dataKey: 'gallery_front' },
          { kicker: 'Gallery', title: '로비 및 엘리베이터홀', dataKey: 'gallery_lobby' },
          { kicker: 'Gallery', title: '기준층 업무공간', dataKey: 'gallery_office' },
          { kicker: 'Gallery', title: '상층부 테라스 및 조망', dataKey: 'gallery_terrace' },
          { kicker: 'Gallery', title: '지하 주차장', dataKey: 'gallery_parking' },
          { kicker: 'Gallery', title: '기계실 및 주요 설비', dataKey: 'gallery_facility' },
        ],
        dataAvailability: {
          hasRentRoll: true,
          hasBuildingRegister: true,
          hasLandUsePlan: true,
          hasRegistryData: true,
          hasCadastralMap: true,
          hasCommercialDistrict: true,
        },
      };

      const sequence = buildDeckSequence(input);

      // Separate body and appendix slides
      const bodySlides = sequence.filter((s) => s.placement !== 'appendix');
      const appendixSlides = sequence.filter((s) => s.placement === 'appendix');

      // 1. Rule 10 Hard Limit Assertion: Body slides must be <= 16
      expect(bodySlides.length).toBeLessThanOrEqual(16);
      expect(bodySlides.length).toBe(16); // Strictly trimmed to exact ceiling

      // 2. Appendix Preservation: All 4 appendices must be preserved
      expect(appendixSlides.length).toBe(4);
      const appendixKeys = appendixSlides.map((s) => s.dataKey);
      expect(appendixKeys).toContain('publicRecords');
      expect(appendixKeys).toContain('titleRights');
      expect(appendixKeys).toContain('cadastralMap');
      expect(appendixKeys).toContain('commercialDistrict');

      // 3. Total Slides = 16 body + 4 appendices = 20 slides
      expect(sequence.length).toBe(20);

      // 4. Protected Body Slides Invariant: None of the protected keys may be pruned
      const protectedKeys = ['cover', 'summary', 'closing', 'risk', 'checklist', 'process', 'thesis'];
      const finalBodyKeys = bodySlides.map((s) => s.dataKey);
      for (const pk of protectedKeys) {
        expect(finalBodyKeys).toContain(pk);
      }

      // 5. Appendix Ordering Invariant: Appendices must be positioned after body slides
      const firstAppendixIndex = sequence.findIndex((s) => s.placement === 'appendix');
      expect(firstAppendixIndex).toBe(16);
    });

    it('CH-26: Extreme over-budget scenario (28+ raw body slides) still adheres strictly to 16 body slide limit', () => {
      // Grade A with 10 gallery slides + 6 financial slides
      const input: DeckSequenceInput = {
        posture: 'income',
        grade: 'A',
        incomeArchetype: 'R-INC-02',
        hasPhotos: false,
        gallerySpecs: Array.from({ length: 10 }, (_, i) => ({
          kicker: 'Gallery',
          title: `사진 ${i + 1}`,
          dataKey: `gallery_${i + 1}`,
        })),
        dataAvailability: {
          hasRentRoll: true,
          hasStackingPlan: true,
          hasBuildingRegister: true,
          hasLandUsePlan: true,
          hasRegistryData: true,
          hasCadastralMap: true,
          hasCommercialDistrict: true,
        },
      };

      const sequence = buildDeckSequence(input);
      const bodySlides = sequence.filter((s) => s.placement !== 'appendix');
      const appendixSlides = sequence.filter((s) => s.placement === 'appendix');

      // Body must NOT exceed PAGE_HARD_LIMIT (16)
      expect(bodySlides.length).toBeLessThanOrEqual(16);
      expect(bodySlides.length).toBe(16);

      // All 4 appendices still preserved
      expect(appendixSlides.length).toBe(4);
      expect(sequence.length).toBe(20);
    });

    it('CH-27: Negative pair & boundary: Compact decks (<= 16 slides) are not pruned unnecessarily', () => {
      const input: DeckSequenceInput = {
        posture: 'trading',
        grade: 'C',
        hasPhotos: false,
        dataAvailability: {
          hasRentRoll: false,
        },
      };

      const sequence = buildDeckSequence(input);
      const bodySlides = sequence.filter((s) => s.placement !== 'appendix');

      // 14 body slides is within PAGE_HARD_LIMIT (16) so it is preserved without pruning
      expect(bodySlides.length).toBe(14);
      expect(bodySlides.length).toBeLessThanOrEqual(16);
      expect(bodySlides.length).toBeGreaterThan(0);
    });

    it('CH-28: Grade D issuance hard rejection [G30] is enforced deterministically', () => {
      expect(() =>
        buildDeckSequence({
          posture: 'income',
          grade: 'D',
        })
      ).toThrowError(/\[G30\] D등급은 발행할 수 없습니다/);
    });
  });
});

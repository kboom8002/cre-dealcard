import { describe, it, expect, vi } from 'vitest';
import { rows, col, colX, CW, M, W, H, SAFE_BOTTOM, split2Col, type RowEntry } from '@/domain/building/mobile-im/pptx/imlib';

describe('imlib-label-ratio', () => {
  it('tests labRatio default values', async () => {
    // Mock Slide
    const s: any = {
      addText: vi.fn(),
      addShape: vi.fn(),
    };

    const listWithoutBadge: RowEntry[] = [
      ['Label', 'Value'],
    ];

    rows(s, 0, 0, 10, listWithoutBadge);
    
    // Find the first addText call for the label
    const labelCall1 = s.addText.mock.calls[0];
    // x = 0, y = 0, w should be 10 * 0.28 = 2.8
    expect(labelCall1[1].w).toBeCloseTo(2.8);

    s.addText.mockClear();

    const listWithBadge: RowEntry[] = [
      ['Label', 'Value', '✓ 등기'],
    ];

    rows(s, 0, 0, 10, listWithBadge);
    const labelCall2 = s.addText.mock.calls[0];
    // x = 0, y = 0, w should be 10 * 0.30 = 3.0
    expect(labelCall2[1].w).toBeCloseTo(3.0);
  });

  it('tests custom labRatio override', async () => {
    const s: any = {
      addText: vi.fn(),
      addShape: vi.fn(),
    };

    const list: RowEntry[] = [
      ['Label', 'Value'],
    ];

    rows(s, 0, 0, 10, list, { labRatio: 0.46 });
    const labelCall = s.addText.mock.calls[0];
    expect(labelCall[1].w).toBeCloseTo(4.6);
  });
});

describe('imlib-column-distribution', () => {
  it('tests column width distribution for 2-6 column tables', async () => {
    const gap = 0.2;
    
    // For n=2
    const w2 = col(2, gap);
    expect(w2).toBeCloseTo((CW - gap) / 2);
    expect(colX(1, w2, gap)).toBeCloseTo(M + w2 + gap);

    // For n=3
    const w3 = col(3, gap);
    expect(w3).toBeCloseTo((CW - gap * 2) / 3);

    // For n=6
    const w6 = col(6, gap);
    expect(w6).toBeCloseTo((CW - gap * 5) / 6);
    expect(colX(5, w6, gap)).toBeCloseTo(M + 5 * (w6 + gap));
  });
});

describe('M1: SSoT Margin & Bilateral Symmetry', () => {
  it('[Positive] M, CW, and SAFE_BOTTOM match SSoT constants and maintain bilateral symmetry', () => {
    expect(W).toBe(13.333);
    expect(H).toBe(7.5);
    expect(M).toBe(0.62);
    expect(CW).toBe(12.093);
    expect(SAFE_BOTTOM).toBe(6.75);

    // Bilateral symmetry: Left margin == Right margin
    const rightMargin = Math.round((W - (M + CW)) * 1000) / 1000;
    expect(rightMargin).toBe(M);
    expect(M + CW + M).toBeCloseTo(W, 3);
  });

  it('[Negative Pair] Non-standard M=0.55 causes bilateral asymmetry', () => {
    const legacyM = 0.55;
    const asymmetricRightMargin = Math.round((W - (legacyM + CW)) * 1000) / 1000;
    expect(asymmetricRightMargin).not.toBe(legacyM);
    expect(asymmetricRightMargin - legacyM).toBeCloseTo(0.14, 2);
  });
});

describe('M1: Canonical 2-Column Split Presets', () => {
  it('[Positive] 60_40 preset produces canonical widths and perfect right margin closure', () => {
    const bounds = split2Col('60_40', 1.5, 4.8);
    expect(bounds.left.w).toBe(7.30);
    expect(bounds.gap).toBe(0.40);
    expect(bounds.right.w).toBe(4.393);
    expect(bounds.left.x).toBe(M);
    expect(bounds.right.x).toBeCloseTo(M + 7.30 + 0.40, 3);
    expect(bounds.right.x + bounds.right.w).toBeCloseTo(W - M, 3);
  });

  it('[Positive] 50_50 preset produces balanced split', () => {
    const bounds = split2Col('50_50', 1.5, 4.8);
    expect(bounds.left.w).toBe(5.846);
    expect(bounds.gap).toBe(0.40);
    expect(bounds.right.w).toBe(5.847);
    expect(bounds.left.x).toBe(M);
    expect(bounds.right.x + bounds.right.w).toBeCloseTo(W - M, 3);
  });

  it('[Positive] 45_55 preset produces map/chart-friendly split', () => {
    const bounds = split2Col('45_55', 1.5, 4.8);
    expect(bounds.left.w).toBe(5.45);
    expect(bounds.gap).toBe(0.28);
    expect(bounds.right.w).toBe(6.363);
    expect(bounds.left.x).toBe(M);
    expect(bounds.right.x + bounds.right.w).toBeCloseTo(W - M, 3);
  });

  it('[Positive] stacking preset produces 3.40" stacking plan and 8.393" rentroll split', () => {
    const bounds = split2Col('stacking', 1.8, 4.8);
    expect(bounds.left.w).toBe(3.40);
    expect(bounds.gap).toBe(0.30);
    expect(bounds.right.w).toBe(8.393);
    expect(bounds.left.x).toBe(M);
    expect(bounds.right.x + bounds.right.w).toBeCloseTo(W - M, 3);
  });

  it('[Positive] Custom gap override adjusts right width while maintaining W - M boundary', () => {
    const customGap = 0.50;
    const bounds = split2Col('60_40', 1.5, 4.8, customGap);
    expect(bounds.gap).toBe(0.50);
    expect(bounds.left.w).toBe(7.30);
    expect(bounds.right.w).toBeCloseTo(CW - 7.30 - customGap, 3);
    expect(bounds.right.x + bounds.right.w).toBeCloseTo(W - M, 3);
  });

  it('[Negative Pair] Over-extended columns exceeding CW violate right safe margin', () => {
    const overflowColW = [0.50, 1.10, 0.90, 0.80, 0.80, 0.80, 0.80, 0.80, 0.80, 1.33]; // sum = 8.63
    const sumColW = overflowColW.reduce((a, b) => a + b, 0);
    const bounds = split2Col('stacking', 1.8, 4.8);
    expect(sumColW).toBeGreaterThan(bounds.right.w); // 8.63 > 8.393
  });
});


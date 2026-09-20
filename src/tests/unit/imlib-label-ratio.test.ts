import { describe, it, expect, vi } from 'vitest';
import { rows, col, colX, CW, M, type RowEntry } from '@/domain/building/mobile-im/pptx/imlib';

describe('imlib-label-ratio', () => {
  it('tests labRatio default values', () => {
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

  it('tests custom labRatio override', () => {
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
  it('tests column width distribution for 2-6 column tables', () => {
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

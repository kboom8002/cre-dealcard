import { describe, it, expect } from 'vitest';
import { parseInlineMarkdown, resetFallbackTracker } from '../pptx-markdown-fallback';

describe('PPTX Markdown Parser & Fallback (P1-2)', () => {
  it('parseInlineMarkdown parses bold and italic markdown tags', () => {
    const runs = parseInlineMarkdown('This is **bold** and *italic* text.');
    expect(runs.length).toBeGreaterThanOrEqual(3);
    const boldRun = runs.find(r => r.options?.bold);
    expect(boldRun).toBeDefined();
    expect(boldRun?.text).toBe('bold');

    const italicRun = runs.find(r => r.options?.italic);
    expect(italicRun).toBeDefined();
    expect(italicRun?.text).toBe('italic');
  });

  it('parseInlineMarkdown returns plain text run when no formatting tags present', () => {
    const runs = parseInlineMarkdown('Plain simple text');
    expect(runs.length).toBe(1);
    expect(runs[0].text).toBe('Plain simple text');
    expect(runs[0].options?.bold).toBeUndefined();
    expect(runs[0].options?.italic).toBeUndefined();
  });

  // Rule 7: Negative Pair — empty or blank string handling
  it('Rule 7 (Negative Pair): parseInlineMarkdown handles empty string without crashing', () => {
    const runs = parseInlineMarkdown('');
    expect(runs).toBeDefined();
    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(runs[0].text).toBe('');
  });

  it('resetFallbackTracker should clear tracked fallback content hashes without error', () => {
    expect(() => resetFallbackTracker()).not.toThrow();
  });
});

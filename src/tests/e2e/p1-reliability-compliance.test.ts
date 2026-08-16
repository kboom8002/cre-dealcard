/**
 * @file p1-reliability-compliance.test.ts
 * @description CREDEAL PPTX Phase 2 - Reliability & Compliance (T25, T26, T28, T30)
 */

import { describe, it, expect } from 'vitest';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { bindSectionData } from '@/domain/building/mobile-im/pptx/data-binder';
import { buildMinimalDoc, extractSlideTexts, assertNoCorruptionStrings } from './pptx-test-helpers';

describe('T25: Concurrent Generation Load', () => {
  it('T25-01: 3 concurrent renders with DIFFERENT presets produce correct slide counts', async () => {
    const renderer = new MobileImPptxRenderer();
    const doc = buildMinimalDoc('income');
    const presets = ['golden_institutional', 'credeal_signature', 'corporate_clean'];
    
    const tasks = presets.map(preset => renderer.render({
      buildingId: 'test-25-01',
      tier: 'pro',
      preset,
      posture: 'income',
      grade: 'B',
      doc
    }));
    
    const results = await Promise.all(tasks);
    expect(results).toHaveLength(3);
    for (const res of results) {
      expect(res.slideCount).toBeGreaterThan(0);
      expect(res.buffer.length).toBeGreaterThan(1000);
    }
  }, 120_000);

  it('T25-02: 5 concurrent renders with SAME preset produce identical slide counts', async () => {
    const renderer = new MobileImPptxRenderer();
    const doc = buildMinimalDoc('income');
    const preset = 'golden_institutional';
    
    const tasks = Array(5).fill(0).map((_, i) => renderer.render({
      buildingId: `test-25-02-${i}`,
      tier: 'pro',
      preset,
      posture: 'income',
      grade: 'B',
      doc
    }));
    
    const results = await Promise.all(tasks);
    expect(results).toHaveLength(5);
    const firstCount = results[0].slideCount;
    for (const res of results) {
      expect(res.slideCount).toBe(firstCount);
      expect(res.buffer.length).toBeGreaterThan(1000);
    }
  }, 120_000);

  it('T25-03: Concurrent renders complete within 10 seconds total', async () => {
    const renderer = new MobileImPptxRenderer();
    const doc = buildMinimalDoc('income');
    const start = Date.now();
    
    const tasks = Array(3).fill(0).map((_, i) => renderer.render({
      buildingId: `test-25-03-${i}`,
      tier: 'pro',
      preset: 'credeal_signature',
      posture: 'income',
      grade: 'B',
      doc
    }));
    
    await Promise.all(tasks);
    const duration = Date.now() - start;
    // 15 seconds is used for CI buffer, though the target is 10s.
    expect(duration).toBeLessThanOrEqual(15_000);
  }, 120_000);
});

describe('T26: Large Memo Input', () => {
  // '가나다라마바사아자차카타파하' is 14 chars. 14 * 200 = 2800 chars.
  const longText = '가나다라마바사아자차카타파하'.repeat(200); 
  
  it('T26-01: bindSectionData does not crash with 2800+ character markdown', () => {
    const doc = buildMinimalDoc('income');
    if (doc.sections && doc.sections[0]) {
      doc.sections[0].markdown = longText;
    }
    const result = bindSectionData(doc as any, {});
    expect(result).toBeDefined();
    const key = Object.keys(result).find(k => result[k]?.content?.includes('가나다라'));
    expect(key).toBeDefined();
  });

  it('T26-02: PPTX renders without error and buffer > 5KB with 2800+ character markdown', async () => {
    const renderer = new MobileImPptxRenderer();
    const doc = buildMinimalDoc('income');
    if (doc.sections && doc.sections[0]) {
      doc.sections[0].markdown = longText;
    }
    
    const result = await renderer.render({
      buildingId: 'test-26-02',
      tier: 'pro',
      posture: 'income',
      grade: 'B',
      doc
    });
    
    expect(result.buffer).toBeDefined();
    expect(result.buffer.length).toBeGreaterThan(5000);
  }, 120_000);

  it('T26-03: All sections with 500+ char markdown have no NaN/undefined in rendered PPTX', async () => {
    const renderer = new MobileImPptxRenderer();
    const doc = buildMinimalDoc('income');
    const mediumText = '오백글자테스트'.repeat(100); // ~700 chars
    
    if (doc.sections) {
      doc.sections.forEach(sec => {
        sec.markdown = mediumText;
      });
    }
    
    const result = await renderer.render({
      buildingId: 'test-26-03',
      tier: 'pro',
      posture: 'income',
      grade: 'B',
      doc
    });
    
    await assertNoCorruptionStrings(result.buffer);
  }, 120_000);
});

describe('T28: Network Failure Recovery', () => {
  it('T28-01: doc.body.photos with invalid URLs renders without crash', async () => {
    const renderer = new MobileImPptxRenderer();
    const doc = buildMinimalDoc('income');
    doc.body = {
      photos: [
        { url: 'invalid-url', isHero: true },
        { url: null },
        { url: undefined }
      ]
    };
    
    const result = await renderer.render({
      buildingId: 'test-28-01',
      tier: 'pro',
      posture: 'income',
      grade: 'B',
      doc
    });
    
    expect(result.buffer.length).toBeGreaterThan(0);
  }, 120_000);

  it('T28-02: building metadata with all fields undefined uses defaults', async () => {
    const renderer = new MobileImPptxRenderer();
    const doc = buildMinimalDoc('income');
    
    const result = await renderer.render({
      buildingId: 'test-28-02',
      tier: 'pro',
      posture: 'income',
      grade: 'B',
      doc,
      building: {
        area_signal: undefined,
        asset_type: undefined,
        price_band: undefined,
      }
    });
    
    expect(result.buffer.length).toBeGreaterThan(0);
  }, 120_000);

  it('T28-03: Empty doc.body ({}) and sections renders with cover + closing at minimum', async () => {
    const renderer = new MobileImPptxRenderer();
    
    const result = await renderer.render({
      buildingId: 'test-28-03',
      tier: 'pro',
      posture: 'income',
      grade: 'B',
      doc: {
        title: 'Empty Test',
        body: {},
        sections: [] // no sections
      }
    });
    
    expect(result.slideCount).toBeGreaterThanOrEqual(2);
  }, 120_000);
});

describe('T30: Disclaimer Legal Completeness', () => {
  it('T30-01: Rendered PPTX contains "투자 권유가 아니며" disclaimer text', async () => {
    const renderer = new MobileImPptxRenderer();
    const doc = buildMinimalDoc('income');
    
    const result = await renderer.render({
      buildingId: 'test-30-01',
      tier: 'pro',
      posture: 'income',
      grade: 'B',
      doc
    });
    
    const slideTexts = await extractSlideTexts(result.buffer);
    const allTexts = Array.from(slideTexts.values()).flat().join(' ');
    
    expect(allTexts).toContain('투자 권유가 아니며');
  }, 120_000);

  it('T30-02: Rendered PPTX contains "공부확인" data source label', async () => {
    const renderer = new MobileImPptxRenderer();
    const doc = buildMinimalDoc('income');
    
    const result = await renderer.render({
      buildingId: 'test-30-02',
      tier: 'pro',
      posture: 'income',
      grade: 'B',
      doc
    });
    
    const slideTexts = await extractSlideTexts(result.buffer);
    const allTexts = Array.from(slideTexts.values()).flat().join(' ');
    
    expect(allTexts).toContain('공부확인');
  }, 120_000);

  it('T30-03: Rendered PPTX contains "전문가검증" data source label', async () => {
    const renderer = new MobileImPptxRenderer();
    const doc = buildMinimalDoc('income');
    
    const result = await renderer.render({
      buildingId: 'test-30-03',
      tier: 'pro',
      posture: 'income',
      grade: 'B',
      doc
    });
    
    const slideTexts = await extractSlideTexts(result.buffer);
    const allTexts = Array.from(slideTexts.values()).flat().join(' ');
    
    expect(allTexts).toContain('전문가검증');
  }, 120_000);

  it('T30-04: Rendered PPTX contains all 5 data source categories', async () => {
    const renderer = new MobileImPptxRenderer();
    const doc = buildMinimalDoc('income');
    
    const result = await renderer.render({
      buildingId: 'test-30-04',
      tier: 'pro',
      posture: 'income',
      grade: 'B',
      doc
    });
    
    const slideTexts = await extractSlideTexts(result.buffer);
    const allTexts = Array.from(slideTexts.values()).flat().join(' ');
    
    const categories = ['공부확인', '전문가검증', '매도인고지', '중개인입력', 'AI추정·가정'];
    for (const cat of categories) {
      expect(allTexts).toContain(cat);
    }
  }, 120_000);
});

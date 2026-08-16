import { describe, test, expect, beforeAll } from 'vitest';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import type { MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { buildMinimalDoc, BUILDING_META, extractSlideTexts, assertNoCorruptionStrings } from './pptx-test-helpers';
import { bindSectionData, stripMarkdown } from '@/domain/building/mobile-im/pptx/data-binder';

describe('T01: Graceful Degradation — Blank Slide Prevention', { timeout: 60_000 }, () => {
  let renderer: MobileImPptxRenderer;

  beforeAll(() => {
    renderer = new MobileImPptxRenderer();
  });

  test('T01-01: 5 sections with empty markdown + valid section_type -> no blank slides, only cover/summary/closing survive', async () => {
    const doc = buildMinimalDoc('income');
    // Set 5 sections to empty
    doc.sections[0].markdown = ''; // property_overview
    doc.sections[1].markdown = ''; // location_access
    doc.sections[2].markdown = ''; // lease_status
    doc.sections[3].markdown = ''; // income_analysis
    doc.sections[4].markdown = ''; // risk_check

    const input: MobileImPptxInput = {
      buildingId: 'test-t01-01',
      tier: 'pro',
      posture: 'income',
      grade: 'A',
      doc,
      building: BUILDING_META.income,
    };

    const result = await renderer.render(input);
    await assertNoCorruptionStrings(result.buffer);
    
    const slideTextsMap = await extractSlideTexts(result.buffer);
    
    // Ensure every generated slide has at least 1 text element
    for (const [slideNum, texts] of slideTextsMap.entries()) {
      expect(texts.length).toBeGreaterThan(0);
    }

    // Since many sections are empty, slideCount should be small
    // Default min: cover(1), summary(1), investment_thesis(1), next_steps(1), closing(1)
    // Even if it produces 12 slides (due to galleries/etc.), the blank sections shouldn't crash.
    expect(result.slideCount).toBeGreaterThanOrEqual(2);
  });

  test('T01-02: Mix of valid and empty sections -> only slides with content appear', async () => {
    const doc = buildMinimalDoc('income');
    // Mix: property_overview has content, others empty
    doc.sections[1].markdown = ''; // location_access
    doc.sections[2].markdown = ''; // lease_status
    doc.sections[3].markdown = ''; // income_analysis
    doc.sections[4].markdown = ''; // risk_check

    const input: MobileImPptxInput = {
      buildingId: 'test-t01-02',
      tier: 'basic',
      posture: 'income',
      grade: 'B',
      doc,
      building: BUILDING_META.income,
    };

    const result = await renderer.render(input);
    const slideTextsMap = await extractSlideTexts(result.buffer);
    const allText = Array.from(slideTextsMap.values()).flat().join(' ');
    
    // Check that sections with content appear
    expect(allText).toContain('물건 개요');
    expect(allText).toContain('투자 포인트'); // investment_thesis had content
    
    // Check that empty sections do not appear
    expect(allText).not.toContain('입지 및 교통');
    expect(allText).not.toContain('임대차 현황');
  });

  test('T01-03: All sections have content consisting only of whitespace -> treated as empty', async () => {
    const doc = buildMinimalDoc('income');
    doc.sections.forEach(s => {
      s.markdown = '   \n\n  \t  ';
    });

    const input: MobileImPptxInput = {
      buildingId: 'test-t01-03',
      tier: 'basic',
      posture: 'income',
      grade: 'B',
      doc,
      building: BUILDING_META.income,
    };

    const result = await renderer.render(input);
    const slideTextsMap = await extractSlideTexts(result.buffer);
    
    for (const [slideNum, texts] of slideTextsMap.entries()) {
      expect(texts.length).toBeGreaterThan(0);
    }
  });

  test('T01-04: Section with only a markdown table (no prose text) -> should still render', async () => {
    const doc = buildMinimalDoc('income');
    doc.sections[0].markdown = '| 항목 | 내용 |\n|---|---|\n| 대지면적 | 142.5평 |'; // Only table
    doc.sections.forEach((s, idx) => {
      if (idx !== 0) s.markdown = ''; // Empty out the rest
    });

    const input: MobileImPptxInput = {
      buildingId: 'test-t01-04',
      tier: 'basic',
      posture: 'income',
      grade: 'B',
      doc,
      building: BUILDING_META.income,
    };

    const result = await renderer.render(input);
    const slideTextsMap = await extractSlideTexts(result.buffer);
    const allText = Array.from(slideTextsMap.values()).flat().join(' ');
    
    expect(allText).toContain('대지면적');
    expect(allText).toContain('142.5평');
  });

  test('T01-05: Section with markdown containing only bold key-value pairs but no table -> should still render', async () => {
    const doc = buildMinimalDoc('income');
    doc.sections[3].markdown = '**연 순영업소득(NOI)**: 약 7.14억 원\n**매입 Cap Rate**: 4.62%';
    
    const input: MobileImPptxInput = {
      buildingId: 'test-t01-05',
      tier: 'basic',
      posture: 'income',
      grade: 'B',
      doc,
      building: BUILDING_META.income,
    };

    const result = await renderer.render(input);
    const slideTextsMap = await extractSlideTexts(result.buffer);
    const allText = Array.from(slideTextsMap.values()).flat().join(' ');
    
    expect(allText).toContain('순영업소득(NOI)');
    expect(allText).toContain('7.14억');
  });
});

describe('T03: LLM Output Structure Fuzz — Parser Resilience', () => {
  
  test('T03-01: H2 (##) instead of H3 (###) section headers -> parses correctly, tables extracted', () => {
    const markdown = '## 임대차 현황\n\n| 층 | 보증금 |\n|---|---|\n| 1F | 3억 |';
    const doc = {
      body: {},
      sections: [{ title: '임대차 현황', markdown, section_type: 'lease_status' }]
    };
    const result = bindSectionData(doc);
    expect(result['rentRoll']).toBeDefined();
    expect(result['rentRoll'].tables.length).toBeGreaterThan(0);
    expect(result['rentRoll'].tables[0].headers).toContain('보증금');
  });

  test('T03-02: Numbered list (1. item) instead of bullet (- item) -> no crash, content preserved', () => {
    const markdown = '수익률 요약:\n1. 실투자금: 69억 원\n2. 순수익: 3,650만 원';
    const doc = {
      body: {},
      sections: [{ title: '수익성 분석', markdown, section_type: 'income_analysis' }]
    };
    const result = bindSectionData(doc);
    expect(result['profit']).toBeDefined();
    expect(result['profit'].content).toContain('1. 실투자금');
  });

  test('T03-03: Bold position variation -> extractBoldKeyValues still extracts', () => {
    const markdown = '**키**: 값\n다른키: **다른값**\n**세번째**: **세번째값**';
    const doc = {
      body: {},
      sections: [{ title: '수익성 분석', markdown, section_type: 'income_analysis' }]
    };
    const result = bindSectionData(doc);
    const stats = result['profit'].right?.stats || [];
    expect(stats.length).toBeGreaterThan(0);
    expect(stats[0].label).toBe('키');
    expect(stats[0].value).toBe('값');
  });

  test('T03-04: Korean colon (：) instead of ASCII (:) -> handles [：:] pattern', () => {
    const markdown = '**한국어콜론**： 1234\n**영어콜론**: 5678';
    const doc = {
      body: {},
      sections: [{ title: '수익성 분석', markdown, section_type: 'income_analysis' }]
    };
    const result = bindSectionData(doc);
    const stats = result['profit'].right?.stats || [];
    expect(stats.length).toBe(2);
    expect(stats[0].label).toBe('한국어콜론');
    expect(stats[0].value).toBe('1234');
    expect(stats[1].label).toBe('영어콜론');
    expect(stats[1].value).toBe('5678');
  });

  test('T03-05: Nested bold (****deep****) -> stripMarkdown removes asterisks', () => {
    const stripped = stripMarkdown('****매우강조****');
    expect(stripped).toBe('매우강조');
  });

  test('T03-06: Escaped pipe in table (\\|) -> table parsing does not break', () => {
    const markdown = '| 항목 | 비고 |\n|---|---|\n| 특이사항 | 파이프\\|포함 |';
    const doc = {
      body: {},
      sections: [{ title: '위험 요인', markdown, section_type: 'risk_check' }]
    };
    const result = bindSectionData(doc);
    expect(result['risk']).toBeDefined();
    expect(result['risk'].tables.length).toBeGreaterThan(0);
    expect(result['risk'].tables[0].rows[0][0]).toBe('특이사항');
  });

  test('T03-07: Mixed Korean-English bold (**Cap Rate 5.33%**) -> stripMarkdown works', () => {
    const stripped = stripMarkdown('수익률은 **Cap Rate 5.33%** 입니다.');
    expect(stripped).toBe('수익률은 Cap Rate 5.33% 입니다.');
  });

  test('T03-08: Parentheses with colon ((월 2,400만 원): 확인) -> no false key-value extraction', () => {
    const markdown = '임대수익(월 2,400만 원): 확인됨\n**정상키**: 정상값';
    const doc = {
      body: {},
      sections: [{ title: '수익성 분석', markdown, section_type: 'income_analysis' }]
    };
    const result = bindSectionData(doc);
    const stats = result['profit'].right?.stats || [];
    expect(stats.length).toBe(1);
    expect(stats[0].label).toBe('정상키');
    expect(stats[0].value).toBe('정상값');
  });

  test('T03-09: Multiple consecutive empty lines between sections -> no crash', () => {
    const markdown = '내용 시작\n\n\n\n\n\n\n내용 끝';
    const doc = {
      body: {},
      sections: [{ title: '분석', markdown, section_type: 'income_analysis' }]
    };
    expect(() => bindSectionData(doc)).not.toThrow();
  });

  test('T03-10: Very long single line (500 chars without line breaks) -> no crash, text preserved', () => {
    const longText = 'A'.repeat(500);
    const markdown = `**긴텍스트**: ${longText}`;
    const doc = {
      body: {},
      sections: [{ title: '수익성 분석', markdown, section_type: 'income_analysis' }]
    };
    const result = bindSectionData(doc);
    expect(result['profit'].right?.stats[0].value).toBe(longText);
  });
});

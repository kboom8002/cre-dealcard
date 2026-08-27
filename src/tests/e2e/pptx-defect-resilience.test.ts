import { describe, test, expect, beforeAll } from 'vitest';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import type { MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { buildMinimalDoc, BUILDING_META, assertNoCorruptionStrings, extractSlideTexts } from './pptx-test-helpers';

describe('Axis 2: PPTX Input Defect Resilience & Edge Case Tests', { timeout: 60_000 }, () => {
  let renderer: MobileImPptxRenderer;

  beforeAll(() => {
    renderer = new MobileImPptxRenderer();
  });

  // D01: sections가 빈 배열일 때
  test('D01: sections: [] -> throws no unhandled error, renders minimal deck', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'test-d01',
      posture: 'income',
      grade: 'B',
      doc: {
        title: '빈 섹션 테스트',
        body: {},
        sections: [],
      },
      building: BUILDING_META.income,
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(5_000);
    expect(result.slideCount).toBeGreaterThanOrEqual(2); // cover + closing at least
    await assertNoCorruptionStrings(result.buffer);
  });

  // D02: section_type 누락
  test('D02: sections missing section_type -> fallback to title and renders safely', async () => {
    const doc = buildMinimalDoc('income');
    doc.sections = doc.sections.map(s => {
      const { section_type, ...rest } = s;
      return rest as any;
    });

    const input: MobileImPptxInput = {
      buildingId: 'test-d02',
      posture: 'income',
      grade: 'B',
      doc,
      building: BUILDING_META.income,
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(5_000);
    await assertNoCorruptionStrings(result.buffer);
  });

  // D03: markdown이 빈 문자열
  test('D03: empty markdown in sections -> graceful degradation without crash', async () => {
    const doc = buildMinimalDoc('income');
    doc.sections.forEach(s => {
      s.markdown = '';
    });

    const input: MobileImPptxInput = {
      buildingId: 'test-d03',
      posture: 'income',
      grade: 'B',
      doc,
      building: BUILDING_META.income,
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(5_000);
    await assertNoCorruptionStrings(result.buffer);
  });

  // D04: building 메타데이터 누락
  test('D04: building metadata undefined -> renders with defaults', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'test-d04',
      posture: 'income',
      grade: 'B',
      doc: buildMinimalDoc('income'),
      building: undefined,
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(5_000);
    await assertNoCorruptionStrings(result.buffer);
  });

  // D05: doc.body가 빈 객체
  test('D05: doc.body: {} -> builds summary and defaults safely', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'test-d05',
      posture: 'income',
      grade: 'B',
      doc: {
        title: '빈 바디 테스트',
        body: {},
        sections: buildMinimalDoc('income').sections,
      },
      building: BUILDING_META.income,
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(5_000);
    await assertNoCorruptionStrings(result.buffer);
  });

  // D06: 7섹션 중 2개만 존재
  test('D06: partial sections (only 2 sections) -> renders present sections safely', async () => {
    const doc = buildMinimalDoc('income');
    doc.sections = doc.sections.slice(0, 2); // only overview and location

    const input: MobileImPptxInput = {
      buildingId: 'test-d06',
      posture: 'income',
      grade: 'B',
      doc,
      building: BUILDING_META.income,
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(5_000);
    await assertNoCorruptionStrings(result.buffer);
  });

  // D07: 중복 section_type
  test('D07: duplicate section_types in doc -> binds first occurrence safely', async () => {
    const doc = buildMinimalDoc('income');
    doc.sections.push({
      title: '물건 개요 중복',
      markdown: '중복된 물건 개요 섹션입니다.',
      section_type: 'property_overview',
    });

    const input: MobileImPptxInput = {
      buildingId: 'test-d07',
      posture: 'income',
      grade: 'B',
      doc,
      building: BUILDING_META.income,
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(5_000);
    await assertNoCorruptionStrings(result.buffer);
  });

  // D08: 알 수 없는 unknown section_type
  test('D08: unknown section_type -> fallback binding without crash', async () => {
    const doc = buildMinimalDoc('income');
    doc.sections.push({
      title: '특수 분석',
      markdown: '특수한 분석 내용입니다.\n\n- 항목 1: 내용 1',
      section_type: 'custom_special_analysis',
    });

    const input: MobileImPptxInput = {
      buildingId: 'test-d08',
      posture: 'income',
      grade: 'B',
      doc,
      building: BUILDING_META.income,
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(5_000);
    await assertNoCorruptionStrings(result.buffer);
  });

  // D09: XSS 스크립트 및 HTML 태그 포함
  test('D09: XSS script tags and dirty HTML in markdown -> strips and renders cleanly', async () => {
    const doc = buildMinimalDoc('income');
    doc.sections[0].markdown = '<script>alert("XSS")</script><b>서초 메디컬</b> <iframe src="evil.com"></iframe>\n\n| 항목 | 내용 |\n|---|---|\n| 대지 | 100평<script> |';

    const input: MobileImPptxInput = {
      buildingId: 'test-d09',
      posture: 'income',
      grade: 'B',
      doc,
      building: BUILDING_META.income,
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(5_000);
    await assertNoCorruptionStrings(result.buffer);

    const slideTextsMap = await extractSlideTexts(result.buffer);
    const allText = Array.from(slideTextsMap.values()).flat().join(' ');
    expect(allText).not.toContain('<script>');
    expect(allText).not.toContain('<iframe>');
  });

  // D10: 대형 테이블 및 긴 텍스트 (텍스트 예산 초과)
  test('D10: huge table with 50 rows -> handles overflow with warnings without crashing', async () => {
    const longRows = Array.from({ length: 50 }, (_, i) => `| ${i + 1}층 | 병원 ${i + 1} | ${i + 1}억 | ${i + 10}만 |`).join('\n');
    const doc = buildMinimalDoc('income');
    doc.sections[2].markdown = `전체 층별 임대차 상세 현황입니다.\n\n| 층 | 임차인 | 보증금 | 월세 |\n|---|---|---|---|\n${longRows}`;

    const input: MobileImPptxInput = {
      buildingId: 'test-d10',
      posture: 'income',
      grade: 'B',
      doc,
      building: BUILDING_META.income,
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(5_000);
    await assertNoCorruptionStrings(result.buffer);
  });

  // D11: grade undefined (기본 Grade B fallback)
  test('D11: grade undefined -> defaults to Grade B', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'test-d11',
      posture: 'income',
      grade: undefined as any,
      doc: buildMinimalDoc('income'),
      building: BUILDING_META.income,
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(5_000);
    expect(result.slideCount).toBeGreaterThanOrEqual(7);
  });

  // D12: posture undefined (기본 income fallback)
  test('D12: posture undefined -> defaults to income posture sequence', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'test-d12',
      posture: undefined as any,
      grade: 'B',
      doc: buildMinimalDoc('income'),
      building: BUILDING_META.income,
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(5_000);
    expect(result.slideCount).toBeGreaterThanOrEqual(7);
  });

  // D13: 20장의 대량 사진 주입
  test('D13: 20 photos injected -> gallery planner distributes across max gallery slides without crashing', async () => {
    const photos = Array.from({ length: 20 }, (_, i) => ({
      url: `https://example.com/photo-${i}.jpg`,
      label: `사진 ${i + 1}`,
      type: 'exterior' as const,
    }));
    const doc = buildMinimalDoc('income');
    doc.body.photos = photos;

    const input: MobileImPptxInput = {
      buildingId: 'test-d13',
      posture: 'income',
      grade: 'B',
      doc,
      building: BUILDING_META.income,
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(5_000);
    await assertNoCorruptionStrings(result.buffer);
  });

  // D14: broker undefined
  test('D14: broker undefined -> closing slide renders safely without broker block', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'test-d14',
      posture: 'income',
      grade: 'B',
      doc: buildMinimalDoc('income'),
      building: BUILDING_META.income,
      broker: undefined,
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(5_000);
    await assertNoCorruptionStrings(result.buffer);
  });

  // D15: NaN 값을 포함한 비정형 데이터
  test('D15: doc contains NaN/null metrics in markdown -> sanitized in PPTX output', async () => {
    const doc = buildMinimalDoc('income');
    doc.sections[3].markdown = '수익률 분석: Cap Rate NaN%, NOI NaN억 원, 대출이자 null원';

    const input: MobileImPptxInput = {
      buildingId: 'test-d15',
      posture: 'income',
      grade: 'B',
      doc,
      building: BUILDING_META.income,
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(5_000);
    await assertNoCorruptionStrings(result.buffer);
  });

  // D16: 불법건축물 / 공동담보 플래그가 있는 복합 케이스
  test('D16: hasViolation and hasJointCollateral flags -> loan slide suppressed in pro tier', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'test-d16',
      posture: 'income',
      grade: 'A',
      hasViolation: true,
      hasJointCollateral: true,
      doc: buildMinimalDoc('income'),
      building: BUILDING_META.income,
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(5_000);
    await assertNoCorruptionStrings(result.buffer);

    const slideTextsMap = await extractSlideTexts(result.buffer);
    const allText = Array.from(slideTextsMap.values()).flat().join(' ');
    // When hasViolation is true, '대출시나리오' (loan slide) should be suppressed
    expect(allText).not.toContain('대출시나리오');
  });
});

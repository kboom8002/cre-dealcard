/**
 * @file p0-numeric-pipeline.test.ts
 * @description T02: 수치 파이프라인 End-to-End 일관성 검증
 *
 * 매매가/면적/수익률 등 핵심 수치가 입력 → SSoT → 데이터바인더 → PPTX XML까지
 * 파이프라인을 거치며 변형 없이 보존되는지 스냅샷 방식으로 추적합니다.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import type { MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { bindSectionData } from '@/domain/building/mobile-im/pptx/data-binder';
import { extractSlideTexts, assertNoCorruptionStrings, BUILDING_META } from './pptx-test-helpers';

describe('T02: Numeric Pipeline End-to-End Consistency', { timeout: 60_000 }, () => {
  let renderer: MobileImPptxRenderer;

  beforeAll(() => {
    renderer = new MobileImPptxRenderer();
  });

  // ── 핵심 수치 상수 ──
  const ASKING_PRICE = '165억';
  const AREA_PYEONG = '620.8평';
  const CAP_RATE = '4.62%';
  const NOI = '7.14억';
  const MONTHLY_NET = '3,650만';
  const LEVERAGE_YIELD = '5.8%';

  const incomeDoc = {
    title: '서초 메디컬빌딩 투자보고서',
    body: {
      ssot_summary: {
        price_band: ASKING_PRICE,
        size_signal: AREA_PYEONG,
        area_signal: '서초권역',
        asking_price_manwon: 1650000,
      },
    },
    sections: [
      {
        title: '물건 개요',
        markdown: `서초 메디컬 빌딩은 지하2층~지상7층 규모의 올근생 빌딩입니다.\n\n| 항목 | 내용 |\n|---|---|\n| 대지면적 | 142.5평 |\n| 연면적 | ${AREA_PYEONG} |\n| 준공 | 2017년 |`,
        section_type: 'property_overview',
      },
      {
        title: '입지 및 교통',
        markdown: '강남역·양재역 더블역세권 도보 4분 거리에 위치합니다.',
        section_type: 'location_access',
      },
      {
        title: '임대차 현황',
        markdown: '전층 메디컬 만실 운영 중이며 WALE 평균 3.5년입니다.\n\n| 층 | 업종 | 보증금 | 월세 |\n|---|---|---|---|\n| 1F | 약국 | 3억 | 1,200만 |\n| 2F | 안과 | 2억 | 1,100만 |',
        section_type: 'lease_status',
      },
      {
        title: '수익성 분석',
        markdown: `연 순영업소득(NOI) 약 ${NOI} 원, 매입 Cap Rate ${CAP_RATE}입니다.\n\n- 실투자금: 약 69억 원\n- 순수익(매월): 약 ${MONTHLY_NET} 원\n- 레버리지 수익률: 약 ${LEVERAGE_YIELD}`,
        section_type: 'income_analysis',
      },
      {
        title: '리스크 점검',
        markdown: '| 리스크 | 현황 | 완화 방안 |\n|---|---|---|\n| 메디컬 단일업종 | 전층 의료 | 업종 다각화 검토 |',
        section_type: 'risk_check',
      },
      {
        title: '투자 포인트',
        markdown: '안정적 월 임대수익과 우량 메디컬 테넌트를 보유한 핵심 투자 자산입니다.',
        section_type: 'investment_thesis',
      },
      {
        title: '다음 단계',
        markdown: '현장 실사 및 임대차계약서 원본 확인을 권장합니다.',
        section_type: 'next_steps',
      },
    ],
  };

  test('T02-01: bindSectionData preserves numeric values in metrics/content', () => {
    const result = bindSectionData(incomeDoc, BUILDING_META.income);

    // 수익분석 섹션의 content에 원본 수치가 보존되어야 함
    const profit = result['profit'];
    expect(profit).toBeDefined();
    expect(profit.content).toContain(NOI);
    expect(profit.content).toContain(CAP_RATE);
    expect(profit.content).toContain(MONTHLY_NET);
    expect(profit.content).toContain(LEVERAGE_YIELD);

    // building 섹션에 면적이 보존
    const building = result['building'];
    expect(building).toBeDefined();
    expect(building.content).toContain(AREA_PYEONG);
  });

  test('T02-02: SSoT summary price_band appears in rendered PPTX', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'numeric-t02',
      posture: 'income',
      grade: 'A',
      doc: incomeDoc,
      building: BUILDING_META.income,
    };

    const result = await renderer.render(input);
    await assertNoCorruptionStrings(result.buffer);

    const slideTexts = await extractSlideTexts(result.buffer);
    const allText = Array.from(slideTexts.values()).flat().join(' ');

    // 매매가가 PPTX에 포함되어야 함
    expect(allText).toContain('165');
  });

  test('T02-03: Area values preserved through pipeline to PPTX', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'numeric-t02-area',
      posture: 'income',
      grade: 'A',
      doc: incomeDoc,
      building: { ...BUILDING_META.income, total_area_pyeong: '620.8' } as any,
    };

    const result = await renderer.render(input);
    const slideTexts = await extractSlideTexts(result.buffer);
    const allText = Array.from(slideTexts.values()).flat().join(' ');

    // 면적 수치가 PPTX 어딘가에 존재
    expect(allText).toContain('620');
  });

  test('T02-04: Cap Rate and NOI values in rendered PPTX', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'numeric-t02-yield',
      posture: 'income',
      grade: 'A',
      doc: incomeDoc,
      building: BUILDING_META.income,
    };

    const result = await renderer.render(input);
    const slideTexts = await extractSlideTexts(result.buffer);
    const allText = Array.from(slideTexts.values()).flat().join(' ');

    // Cap Rate 수치 보존
    expect(allText).toContain('4.62');

    // NOI 수치 보존
    expect(allText).toContain('7.14');
  });

  test('T02-05: No numeric corruption (NaN, Infinity) in output', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'numeric-t02-corruption',
      posture: 'income',
      grade: 'A',
      doc: incomeDoc,
      building: BUILDING_META.income,
    };

    const result = await renderer.render(input);
    const slideTexts = await extractSlideTexts(result.buffer);
    const allText = Array.from(slideTexts.values()).flat().join(' ');

    expect(allText).not.toContain('NaN');
    expect(allText).not.toContain('Infinity');
    expect(allText).not.toContain('undefined');
    expect(allText).not.toContain('[object Object]');
  });

  test('T02-06: asking_price_manwon numeric consistency', () => {
    // SSoT: asking_price_manwon: 1650000 → price_band: '165억' → PPTX
    const ssot = incomeDoc.body.ssot_summary;
    const manwon = ssot.asking_price_manwon; // 1650000
    const expectedBillion = manwon / 10000; // 165
    const priceBand = ssot.price_band; // '165억'

    // price_band의 숫자 부분이 manwon에서 정확히 유도됨
    const numInPriceBand = parseInt(priceBand.replace(/[^\d]/g, ''), 10);
    expect(numInPriceBand).toBe(expectedBillion);
  });

  test('T02-07: All 5 postures preserve their respective building metadata', async () => {
    const postures = ['income', 'owner_occupied', 'development', 'operating', 'trading'] as const;

    for (const posture of postures) {
      const meta = BUILDING_META[posture];
      const input: MobileImPptxInput = {
        buildingId: `numeric-meta-${posture}`,
        posture,
        grade: 'A',
        doc: {
          title: `${posture} 테스트`,
          body: { ssot_summary: { price_band: meta.price_band, area_signal: meta.area_signal } },
          sections: [
            { title: '물건 개요', markdown: `${meta.asset_type} 물건입니다.`, section_type: 'property_overview' },
            { title: '리스크', markdown: '| 리스크 | 현황 | 완화 |\n|---|---|---|\n| 테스트 | 정상 | 정상 |', section_type: 'risk_check' },
            { title: '투자 포인트', markdown: '핵심 투자 자산입니다.', section_type: 'investment_thesis' },
            { title: '다음 단계', markdown: '실사를 권장합니다.', section_type: 'next_steps' },
          ],
        },
        building: meta,
      };

      const result = await renderer.render(input);
      expect(result.buffer.length).toBeGreaterThan(5_000);
      await assertNoCorruptionStrings(result.buffer);

      const slideTexts = await extractSlideTexts(result.buffer);
      const allText = Array.from(slideTexts.values()).flat().join(' ');

      // price_band의 숫자 부분이 PPTX에 포함
      const priceNum = meta.price_band.replace(/[^\d]/g, '');
      expect(allText).toContain(priceNum);
    }
  });
});

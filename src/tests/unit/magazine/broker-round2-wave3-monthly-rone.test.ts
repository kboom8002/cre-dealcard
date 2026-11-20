import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  computeTrailing12MonthAverage,
  getRegionalCommercialBenchmarks,
} from '@/lib/external/rone-api';
import {
  getMonthlyChartsForRegion,
  MONTHLY_CHART_TYPE_META,
} from '@/domain/magazine/monthly-stats-charts';
import {
  buildRebCore3TrendChart,
  MONTHLY_GRAPHIC_PAIR_PRESETS,
} from '@/domain/magazine/monthly-stats-hydration';
import { MonthlyGlassStatCard } from '@/components/magazine/MonthlyGlassStatCard';
import { MonthlyStatsEditorPanel } from '@/components/magazine-editor/MonthlyStatsEditorPanel';
import { normalizePdfFilename } from '@/lib/im-lite/slides-pdf-exporter';
import { buildSlidesHtmlExport } from '@/lib/im-lite/slides-html-builder';

describe('Round 2 Wave 3 — R-ONE 3대 지표 12M 평균 · 민간리서치 · 16:9 가로형 PDF 내보내기', () => {
  it('1. computeTrailing12MonthAverage는 최근 12개 시점을 정렬·평균 계산한다', () => {
    const avg = computeTrailing12MonthAverage([
      { period: '2025-Q1', value: 4.0 },
      { period: '2025-Q2', value: 4.2 },
      { period: '2025-Q3', value: 4.4 },
      { period: '2025-Q4', value: 4.6 },
    ]);
    expect(avg).toBe(4.3);

    const bms = getRegionalCommercialBenchmarks('gbd');
    expect(bms).toHaveLength(1);
    expect(bms[0].landPriceRatePct).toBeGreaterThan(0);
    expect(bms[0].rentalYieldPct).toBeGreaterThan(0);
    expect(bms[0].vacancyRatePct).toBeGreaterThan(0);
  });

  it('2. reb_core3_trend 차트 및 R-ONE 3대 지표 프리셋이 정상 구성된다', () => {
    expect(MONTHLY_CHART_TYPE_META.reb_core3_trend.shortTitle).toContain('3대 지표');
    expect(MONTHLY_GRAPHIC_PAIR_PRESETS.some((p) => p.id === 'reb_core3')).toBe(true);

    const chart = buildRebCore3TrendChart('ybd', '영등포·여의도 권역 (YBD)');
    expect(chart.chartType).toBe('reb_core3_trend');
    expect(chart.series.map((s) => s.label)).toEqual([
      '지가변동률(12M)',
      '임대수익률(12M)',
      '상권공실률(12M)',
    ]);
    expect(chart.isPlaceholder).toBe(false);

    const placeholderPair = getMonthlyChartsForRegion('gbd', ['molit_tx_price_trend', 'reb_core3_trend']);
    expect(placeholderPair[1].chartType).toBe('reb_core3_trend');
  });

  it('3. MonthlyGlassStatCard & MonthlyStatsEditorPanel은 선택적 민간 리서치 슬롯을 지원한다', () => {
    const baseChart = buildRebCore3TrendChart('gbd', '강남·서초 (GBD)');
    const withResearch = {
      ...baseChart,
      privateResearchSource: '교보리얼코',
      privateResearchNote: '2026 Q1 테헤란로 중대형 오피스 실질 임대료 상승 지속',
    };

    const cardHtml = renderToStaticMarkup(
      React.createElement(MonthlyGlassStatCard, { chart: withResearch, index: 0 }),
    );
    expect(cardHtml).toContain('data-testid="monthly-stat-private-research"');
    expect(cardHtml).toContain('교보리얼코');
    expect(cardHtml).toContain('테헤란로 중대형 오피스 실질 임대료 상승 지속');

    const editorHtml = renderToStaticMarkup(
      React.createElement(MonthlyStatsEditorPanel, {
        monthlyRegion: 'gbd',
        onChangeRegion: () => {},
        monthlyCharts: [withResearch, baseChart],
        onChangeCharts: () => {},
      }),
    );
    expect(editorHtml).toContain('data-testid="monthly-chart-pair-reb_core3"');
    expect(editorHtml).toContain('data-testid="monthly-chart-research-note-0"');
    expect(editorHtml).toContain('메이트플러스');
  });

  it('4. 16:9 가로형 슬라이드 PDF HTML 수출 및 파일명 정규화가 정상 동작한다', () => {
    expect(normalizePdfFilename('역삼동 / 신한빌딩: IM')).toBe('역삼동___신한빌딩__IM_투자설명서.pdf');

    const slidesHtml = buildSlidesHtmlExport({
      buildingId: 'bld-test-1',
      title: '강남구 역삼동 신한빌딩 (근생, 120억)',
      content: {
        ssot_summary: {
          address: '서울특별시 강남구 역삼동 700-1',
          land_area_sqm: 450,
          total_gross_area_sqm: 1480,
          zoning: '제2종일반주거지역',
        },
        heroCard: {
          askingPriceDisplay: '120억 원',
          grossYieldPct: 4.25,
          keyPoints: ['코너 입지 가시성', '전 층 만실 운영'],
        },
        floor_leases: [
          { floor: '1F', tenant_name: '카페', leasable_area_sqm: 120, deposit_manwon: 5000, rent_manwon: 350 },
        ],
        expected_rent_roll: [
          { floor: '2F', tenant_name: '예상 오피스', leasable_area_sqm: 130, deposit_manwon: 3000, rent_manwon: 260 },
        ],
      },
      building: {},
      brokerInfo: { displayName: '홍길동', company: '크리딜중개법인', phone: '010-1234-5678' },
    });

    expect(slidesHtml).toContain('@page { size: 13.333in 7.5in landscape; margin: 0; }');
    expect(slidesHtml).toContain('class="im-slide-page');
    expect(slidesHtml).toContain('기대수익률(추정수익률) 렌트롤');
    expect(slidesHtml).not.toContain('oklch(');
  });
});

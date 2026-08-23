// src/domain/building/mobile-im/pptx/archetypes/a16-investment-structure.ts
// A16: 투자 구조 (Investment Structure) 아키타입
// Spec: API_TYPE_CONTRACT.md (D3 §5.1), ARCHETYPE_DESIGN_SYSTEM.md

import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR, CD, NUM } from '../imlib';
import type { ProvenanceKind } from '../imlib';

export interface ArchetypeInput {
  pres: PptxGenJS;
  slideNum: number;
  docno: string;
  watermarkText?: string;
  data: Record<string, any>;
  grade: 'A' | 'B' | 'C';
  provenance: Record<string, ProvenanceKind>;
}

export interface ArchetypeOutput {
  slide: ReturnType<PptxGenJS['addSlide']>;
  warnings: string[];
}

export function buildA16InvestmentStructure(input: ArchetypeInput): ArchetypeOutput {
  const onDark = input.data.onDark === true;
  const slide = onDark ? L.dark(input.pres) : L.light(input.pres);
  const warnings: string[] = [];

  const kicker = input.data.kicker || 'CAPITAL STRUCTURE';
  const title = input.data.title || '투자 및 자본 조달 구조 분석';

  if (onDark) {
    L.headD(slide, input.slideNum, kicker, title);
  } else {
    L.head(slide, input.slideNum, kicker, title);
  }

  const gap = 0.30;
  const colW = L.col(2, gap); // (13.333 - 1.2 - 0.3) / 2 = ~5.91
  const y = 1.55;
  const cardH = 4.80;

  // ── 좌측 카드: 총취득원가 및 실투자금 내역 ──
  const leftX = L.colX(0, colW, gap);
  L.card(slide, leftX, y, colW, cardH, { onDark });

  slide.addText('1. 총취득원가 및 자기자본 소요', {
    x: leftX + 0.25,
    y: y + 0.22,
    w: colW - 0.5,
    h: 0.35,
    fontFace: KR,
    fontSize: 13.5,
    bold: true,
    color: onDark ? C.brass : C.brassD,
    margin: 0,
  });

  const eq = input.data.equityBreakdown || {};
  const priceBil = eq.price ? (eq.price / 1e8).toFixed(1) : (input.data.askingPriceBil ?? '-');
  const taxBil = eq.acquisitionTax ? (eq.acquisitionTax / 1e8).toFixed(2) : '-';
  const feeBil = eq.brokerFee ? (eq.brokerFee / 1e8).toFixed(2) : '-';
  const totalCostBil = eq.totalAcquisitionCost ? (eq.totalAcquisitionCost / 1e8).toFixed(1) : '-';
  const depositBil = eq.deposit ? (eq.deposit / 1e8).toFixed(1) : (input.data.totalDepositBil ?? '-');
  const loanBil = eq.loan ? (eq.loan / 1e8).toFixed(1) : (input.data.loanAmountBil ?? '-');
  const equityBil = eq.equity ? (eq.equity / 1e8).toFixed(1) : (input.data.equityRequiredBil ?? '-');

  const breakdownRows: [string, string][] = [
    ['매매 희망가 (A)', `${priceBil}억 원`],
    ['취득세 (4.6% 법정)', `${taxBil}억 원`],
    ['중개보수 (0.9% 한도)', `${feeBil}억 원`],
    ['총취득원가 (A + 세/비용)', `${totalCostBil}억 원`],
    ['(-) 임대보증금 승계', `${depositBil}억 원`],
    ['(-) 담보대출 조달', `${loanBil}억 원`],
    ['실투자금 (Net Equity)', `${equityBil}억 원`],
  ];

  L.rows(slide, leftX + 0.25, y + 0.65, colW - 0.5, breakdownRows, {
    rh: 0.52,
    fs: 11.5,
    onDark,
  });

  // ── 우측 카드: LTV 시나리오 비교 분석 ──
  const rightX = L.colX(1, colW, gap);
  L.card(slide, rightX, y, colW, cardH, { onDark });

  slide.addText('2. LTV 시나리오별 레버리지 효과', {
    x: rightX + 0.25,
    y: y + 0.22,
    w: colW - 0.5,
    h: 0.35,
    fontFace: KR,
    fontSize: 13.5,
    bold: true,
    color: onDark ? C.brass : C.brassD,
    margin: 0,
  });

  const ltvScenarios = input.data.ltvScenarios || [
    { ltvPct: 0, equityBil: priceBil, yieldPct: input.data.grossYieldPct ?? 4.0, note: '전액 자기자본' },
    { ltvPct: 40, equityBil: (parseFloat(priceBil) * 0.6).toFixed(1), yieldPct: 4.5, note: '보수적 차입' },
    { ltvPct: 50, equityBil: (parseFloat(priceBil) * 0.5).toFixed(1), yieldPct: 4.8, note: '표준 차입' },
  ];

  const ltvTableHead = ['구분', '대출비율', '실투자금', '예상수익률'];
  const ltvTableRows = ltvScenarios.map((s: any) => [
    s.note || `LTV ${s.ltvPct}%`,
    `${s.ltvPct}%`,
    s.equityBil ? `${s.equityBil}억` : '-',
    s.yieldPct ? `${s.yieldPct}%` : '-',
  ]);

  const ltvColW = [1.6, 1.1, 1.4, 1.4];
  L.table(
    slide,
    rightX + 0.25,
    y + 0.70,
    colW - 0.5,
    ltvTableHead,
    ltvTableRows.map((r: string[]) => r.map((c: string) => ({ t: c }))),
    ltvColW,
    { rh: 0.50, bfs: 11, hfs: 11, onDark }
  );

  // ── 하단 경고/안내 배너 ──
  const isNegativeLeverage = input.data.negativeLeverage === true;
  const warningY = y + 2.90;
  const warningH = 1.60;

  if (isNegativeLeverage) {
    L.callout(
      slide,
      rightX + 0.25,
      warningY,
      colW - 0.5,
      warningH,
      'warn',
      '⚠️ 역레버리지 유의 구간',
      input.data.negativeLeverageWarning ||
        '차입 금리가 자산 총수익률을 상회하여 대출 실행 시 자기자본수익률이 하락할 수 있습니다. 에쿼티 비중 확대를 권장합니다.'
    );
    warnings.push('역레버리지 경고 슬라이드 반영');
  } else {
    L.callout(
      slide,
      rightX + 0.25,
      warningY,
      colW - 0.5,
      warningH,
      'info',
      '💡 자본조달 가이드',
      '• 금융기관별 감정평가액 및 LTV 한도 사전 확인 필요\n• 취득세(4.6%) 및 부대비용을 포함한 총소요자금 기반 에쿼티 조달 계획 수립 권장'
    );
  }

  if (input.watermarkText) L.watermark(slide, input.watermarkText, onDark);
  L.foot(slide, input.slideNum, input.docno, onDark);

  return { slide, warnings };
}

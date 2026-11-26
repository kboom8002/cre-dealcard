import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR, NUM, SAFE_BOTTOM } from '../imlib';
import type { ProvenanceKind } from '../imlib';
import { SQM_RATIO } from '@/lib/utils/area-conversion';
import { fmtFixed } from '@/lib/format/safe-number';
import {
  YIELD_LABELS,
  stabilizedReserveLabel,
  yieldFootnote,
  type YieldSet,
} from '../../yield-set';
import {
  computeLandPriceRateStats,
  getRegionalLandPriceRateSeries,
  type RegionalLandPriceRateSeries,
} from '@/lib/external/rone-api';

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

/** 하단 각주 높이 (8pt 1~2줄) — 콜아웃/밴드는 이 위에서 끝난다 */
const FOOTNOTE_H = 0.24;

/**
 * 연도별 수평 막대 차트 행 높이·막대 두께·세로 시작 좌표 산출.
 * 데이터 연도 수가 적을 때(예: 4개년) 상단에 다닥다닥 몰리지 않도록 가용 영역 내에서 균등 분배한다.
 */
export function computeHorizontalBarLayout(
  count: number,
  barAreaY: number,
  barAreaH: number,
): {
  rowPitch: number;
  visualBarH: number;
  startY: number;
  fontSize: number;
} {
  const safeCount = Math.max(1, count);
  const rowPitch = Math.min(0.46, barAreaH / safeCount);
  const visualBarH = Math.max(0.08, Math.min(0.22, rowPitch * 0.54));
  const totalBarsH = rowPitch * safeCount;
  const startY = barAreaY + Math.max(0, (barAreaH - totalBarsH) / 2);
  const fontSize = safeCount <= 5 ? 9.0 : 8.0;
  return { rowPitch, visualBarH, startY, fontSize };
}

/**
 * X축=연도 세로 막대 차트 렌더러 (네이티브 PPTX 도형+텍스트 — Rule 66 Sharp CJK 금지 준수)
 */
export function renderVerticalLandPriceChart(
  slide: ReturnType<PptxGenJS['addSlide']>,
  params: {
    x: number;
    y: number;
    w: number;
    h: number;
    points: Array<{ year: string | number; value: number; formattedLabel: string; isNegative?: boolean }>;
    title: string;
    sourceText: string;
  },
): void {
  const { x, y, w, h, title, sourceText } = params;
  const pts = params.points.slice(-5);
  slide.addText(title, {
    x, y, w, h: 0.22,
    fontFace: KR, fontSize: 9.0, bold: true, color: C.ink2, valign: 'middle', margin: 0,
  });

  const footerH = 0.20;
  const xLabelH = 0.24;
  const valLabelH = 0.22;
  const plotTop = y + 0.26 + valLabelH;
  const plotBottom = y + h - footerH - xLabelH - 0.04;
  const plotH = Math.max(0.75, plotBottom - plotTop);

  // 기준선 (X축)
  slide.addShape('line', {
    x, y: plotBottom, w, h: 0,
    line: { color: C.line, width: 0.8 },
  });

  if (pts.length === 0) return;

  const maxAbs = Math.max(0.5, ...pts.map((p) => Math.abs(p.value)));
  const slotW = w / pts.length;
  const barW = Math.min(0.62, slotW * 0.50);

  pts.forEach((pt, idx) => {
    const slotX = x + idx * slotW;
    const barX = slotX + (slotW - barW) / 2;
    const ratio = Math.max(0.10, Math.abs(pt.value) / maxAbs);
    const barH = Math.max(0.16, plotH * ratio);
    const barY = plotBottom - barH;
    const isLatest = idx === pts.length - 1;
    const barColor = pt.isNegative ? '94A3B8' : isLatest ? C.brass : (C.navy || C.brand || '1E3A8A');

    slide.addShape('roundRect', {
      x: barX, y: barY, w: barW, h: barH,
      fill: { color: barColor },
      line: { color: barColor, width: 0 },
      rectRadius: 0.03,
    });

    slide.addText(pt.formattedLabel, {
      x: slotX + 0.02, y: Math.max(y + 0.22, barY - valLabelH), w: slotW - 0.04, h: valLabelH,
      fontFace: NUM, fontSize: 8.8, bold: true, color: isLatest ? C.brass : C.ink,
      align: 'center', valign: 'bottom', shrinkText: true, margin: 0,
    });

    slide.addText(String(pt.year), {
      x: slotX + 0.02, y: plotBottom + 0.03, w: slotW - 0.04, h: xLabelH,
      fontFace: NUM, fontSize: 8.8, bold: isLatest, color: isLatest ? C.ink : C.mute,
      align: 'center', valign: 'top', margin: 0,
    });
  });

  slide.addText(sourceText, {
    x, y: y + h - footerH, w, h: footerH,
    fontSize: 8.0, color: '8A8A8A', fontFace: KR, valign: 'middle', shrinkText: true, margin: 0,
  });
}

/**
 * A23 — 투자수익률 분석 슬라이드 (Basic IM v2.2 — Round 2)
 *
 *  - Cap Rate (NOI 기준), 공시지가 비교, 단순 합산 기대수익률 완전 배제
 *  - 좌측 패널: 기대수익률(추정수익률) (공실 100% 매물 포함) / 현행 임대수익률 + 핵심 재무 지표
 *  - 우측 패널: 대지 평당 매매가 · R-ONE 지가상승률 KPI + 최근 5개년 X축=연도 세로 막대 차트
 */
export function buildA23YieldFormula(input: ArchetypeInput): ArchetypeOutput {
  const slide = L.light(input.pres);
  const warnings: string[] = [];

  L.head(slide, input.slideNum, input.data.kicker || 'YIELD', input.data.title || '투자수익률 분석');

  const d = input.data;
  const annualRent = d.annualRent ?? 0;
  const totalDeposit = d.totalDeposit ?? 0;
  const askingPrice = d.askingPrice ?? 0;
  const vacancyPct = d.vacancyPct ?? 0;
  const capRateAsIs = d.capRateAsIs ?? 0;
  const capRateStabilized = d.capRateStabilized ?? d.yieldSet?.stabilized?.value;
  const callerAssumption: string | undefined = typeof d.stabilizedAssumption === 'string' && d.stabilizedAssumption.trim()
    ? d.stabilizedAssumption.trim()
    : undefined;
  const yieldSet: YieldSet | undefined = d.yieldSet && typeof d.yieldSet === 'object' ? d.yieldSet : undefined;
  const landPriceHistory = d.landPriceHistory;
  const landAreaSqm = d.landAreaSqm ?? 0;
  const areaSignal = d.areaSignal ?? '';
  void vacancyPct;

  // ── 한국부동산원(R-ONE) 지역 10년 지가변동률 조회 ──
  const roneSeries: RegionalLandPriceRateSeries | null =
    (d.regionalLandPriceRates as RegionalLandPriceRateSeries | null | undefined) ??
    getRegionalLandPriceRateSeries({
      pnu: d.pnu,
      sigunguCode: d.sigunguCode,
      address: d.address || areaSignal,
    });

  // ── 금액 포맷터 ──
  const fmtManwon = (v: number) => {
    if (!isFinite(v) || isNaN(v)) return '0원';
    if (v >= 100_000_000) {
      return `${Number((v / 100_000_000).toFixed(1)).toLocaleString('ko-KR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}억원`;
    }
    return `${Math.round(v / 10000).toLocaleString()}만원`;
  };

  // ── 0으로 나누기 방어 ──
  if (askingPrice > 0 && totalDeposit >= askingPrice) {
    warnings.push('[A23] 승계 보증금이 매매가 이상입니다 (실질 투자금 <= 0)');
  }

  const netInvestment = askingPrice - totalDeposit;
  const hasLandHistory = Boolean(landPriceHistory?.history && landPriceHistory.history.length >= 2);
  const explicitOfficialSqm = Number(d.officialLandPricePerSqm ?? 0);
  const latestHistorySqm = hasLandHistory ? Number(landPriceHistory.latestPricePerSqm ?? 0) : 0;
  const effectiveOfficialPricePerSqm =
    Number.isFinite(latestHistorySqm) && latestHistorySqm > 0
      ? latestHistorySqm
      : Number.isFinite(explicitOfficialSqm) && explicitOfficialSqm > 0
      ? explicitOfficialSqm
      : 0;

  // ── 좌우 패널 분할 (상단 카드: y = 1.45..5.60, 하단 밴드: y = 5.70..6.34, 각주: y = 6.46..6.70) ──
  const leftW = 5.55;
  const gap = 0.28;
  const rightX = M + leftW + gap; // 0.62 + 5.55 + 0.28 = 6.45
  const rightW = CW - leftW - gap; // 12.09 - 5.55 - 0.28 = 6.26

  const rawCap = typeof capRateAsIs === 'number' ? capRateAsIs : parseFloat(String(capRateAsIs));
  const numCapRate = Number.isFinite(rawCap) && rawCap > 0
    ? rawCap
    : (yieldSet?.grossYieldNetOfDeposit != null && yieldSet.grossYieldNetOfDeposit > 0 ? yieldSet.grossYieldNetOfDeposit : 0);

  // V05 — 기타수입이 있을 때만(YieldSet이 null 이면 줄 자체를 만들지 않는다)
  const inclOther = yieldSet?.grossYieldInclOtherIncome != null && Number.isFinite(yieldSet.grossYieldInclOtherIncome) && yieldSet.grossYieldInclOtherIncome > 0
    ? yieldSet.grossYieldInclOtherIncome
    : null;

  const rawStab = typeof capRateStabilized === 'number' ? capRateStabilized : parseFloat(String(capRateStabilized));
  const stabVal = Number.isFinite(rawStab) && rawStab > 0 ? rawStab : 0;
  const hasStabilized = stabVal > 0;
  if (!hasStabilized) warnings.push('안정화 수익률 데이터 없음');

  const ysStab = yieldSet?.stabilized && Math.abs(yieldSet.stabilized.value - stabVal) < 0.02
    ? yieldSet.stabilized
    : yieldSet?.stabilized ?? null;
  let stabLabel = '';
  let stabCaption: string | null = null;
  let hasTrueStabilized = false;
  if (hasStabilized) {
    if (ysStab && ysStab.kind !== 'reserve_excluded') {
      stabLabel = ysStab.label || YIELD_LABELS.stabilizedBrokerPlan;
      stabCaption = ysStab.caption ?? callerAssumption ?? null;
      hasTrueStabilized = true;
    } else if (!ysStab && callerAssumption) {
      stabLabel = YIELD_LABELS.stabilizedTargetRent;
      stabCaption = callerAssumption;
      hasTrueStabilized = true;
    } else if (numCapRate <= 0) {
      // 공실 100% 또는 현행 임대수입 0원 물건은 기대수익률을 히어로 카드로 승격
      stabLabel = YIELD_LABELS.stabilizedBrokerPlan;
      stabCaption = ysStab?.caption ?? callerAssumption ?? '공실 임대 전환 가정 기준 기대수익률';
      hasTrueStabilized = true;
    } else {
      stabLabel = ysStab?.label ?? stabilizedReserveLabel(yieldSet?.assumptions.vacancyReservePct);
      stabCaption = null;
      hasTrueStabilized = false;
    }
  }

  // ── 좌측 KPI 행 산출 (토지 공시지가 / 매매가 대비 토지 비중 비교 제거) ──
  const planSummary = ysStab?.kind === 'broker_plan' ? ysStab.planSummary : undefined;
  const kpiRows: Array<[string, string, boolean]> = planSummary
    ? [
        ['연간 임대수입 (현행 → 기대)', `${fmtManwon(annualRent)} → ${fmtManwon(planSummary.newAnnualRentKrw)}`, false],
        ['임대보증금 총액 (현행 → 기대)', `${fmtManwon(totalDeposit)} → ${fmtManwon(planSummary.newDepositKrw)}`, false],
        ['매각 희망가', fmtManwon(askingPrice), false],
        ['실투자금 (매매가−보증금)', `${fmtManwon(netInvestment)} → ${fmtManwon(planSummary.newNetPurchaseKrw)}`, true],
      ]
    : [
        ['연간 임대수입', fmtManwon(annualRent), false],
        ['승계 보증금', fmtManwon(totalDeposit), false],
        ['매각 희망가', fmtManwon(askingPrice), false],
        ['보증금 차감 매입가 (매매가−보증금)', fmtManwon(netInvestment), true],
      ];

  // ── 세로 레이아웃 예산 (SAFE_BOTTOM = 6.75 엄수) ──
  const footY = 6.42; // 6.42 + 0.24 = 6.66 <= SAFE_BOTTOM(6.75)
  const bandY = 5.40;
  const bandH = 0.94; // 5.40 + 0.94 = 6.34 <= footY(6.42) — 기존 0.62 대비 +51.6% 확대
  const cardY = 1.45;
  const cardH = 3.86; // 1.45 + 3.86 = 5.31 <= bandY(5.40)

  const padTop = 0.16;
  const afterYield = 0.10;
  const padBottom = 0.12;
  const boxPad = 0.08;
  const primaryRowH = 0.44;
  const formulaSubH = planSummary ? 0.22 : 0;
  const secondaryRowH = 0.28;
  const captionH = stabCaption ? 0.34 : 0;
  const yieldBgH =
    boxPad * 2 +
    primaryRowH +
    formulaSubH +
    (inclOther != null ? secondaryRowH : 0) +
    (hasStabilized ? secondaryRowH + captionH : 0);

  const availForKpi = Math.max(1.2, cardH - (padTop + yieldBgH + afterYield + padBottom));
  const rowH = Math.max(0.24, Math.min(0.36, availForKpi / Math.max(1, kpiRows.length)));

  // ══════════════════════════════════════════════════════════════
  // 좌측 패널: 수익률 히어로 + 핵심 재무 지표 카드
  // ══════════════════════════════════════════════════════════════
  slide.addShape('roundRect', {
    x: M, y: cardY, w: leftW, h: cardH,
    fill: { color: 'FFFFFF' },
    line: { color: C.line, width: 1 },
    rectRadius: 0.08,
  });

  const yieldBgY = cardY + padTop;
  const boxX = M + 0.22;
  const boxW = leftW - 0.44;
  slide.addShape('roundRect', {
    x: boxX, y: yieldBgY, w: boxW, h: yieldBgH,
    fill: { color: C.ink },
    rectRadius: 0.08,
  });

  const yLabelX = boxX + 0.18;
  const yValW = 1.50;
  const yValX = boxX + boxW - yValW - 0.14;
  const yLabelW = yValX - yLabelX - 0.05;
  let yRowY = yieldBgY + boxPad;

  if (hasTrueStabilized) {
    // ① 히어로: 안정화 기대수익률 (broker_plan / market_rent / target_rent)
    slide.addText(stabLabel, {
      x: yLabelX, y: yRowY, w: yLabelW, h: primaryRowH,
      color: 'FFFFFF', fontFace: KR, fontSize: 11, bold: true, valign: 'middle', shrinkText: true, margin: 0,
    });
    slide.addText(fmtFixed(stabVal, 2, '%'), {
      x: yValX, y: yRowY, w: yValW, h: primaryRowH,
      color: C.brass, fontFace: NUM, fontSize: 24, bold: true,
      align: 'right', valign: 'middle', margin: 0,
    });
    yRowY += primaryRowH;

    if (planSummary) {
      const addedRentMan = Math.round(planSummary.addedMonthlyRentKrw / 10_000);
      const newAnnualMan = Math.round(planSummary.newAnnualRentKrw / 10_000);
      const newDepBil = Number((planSummary.newDepositKrw / 1e8).toFixed(1)).toLocaleString(
        'ko-KR',
        { minimumFractionDigits: 1, maximumFractionDigits: 1 },
      );
      const formulaLine = planSummary.units.length > 0
        ? `산식: (현행 연임대료 + 전환 월세 ${addedRentMan.toLocaleString()}만×12) ÷ (매매가 − 전환후 보증금 ${newDepBil}억)`
        : `산식: 기대 연임대료 ${newAnnualMan.toLocaleString()}만 ÷ (매매가 − 기대 보증금 ${newDepBil}억)`;
      slide.addText(formulaLine, {
        x: yLabelX, y: yRowY, w: boxW - 0.34, h: formulaSubH,
        color: 'CBD5E1', fontFace: KR, fontSize: 8, valign: 'middle', shrinkText: true, margin: 0,
      });
      yRowY += formulaSubH;
    }

    // ② 보조: 현행 임대수익률 (매매가−보증금 대비)
    slide.addText(`현행 ${YIELD_LABELS.grossNetOfDeposit}`, {
      x: yLabelX, y: yRowY, w: yLabelW, h: secondaryRowH,
      color: 'E2E8F0', fontFace: KR, fontSize: 9.5, valign: 'middle', shrinkText: true, margin: 0,
    });
    slide.addText(fmtFixed(numCapRate, 2, '%'), {
      x: yValX, y: yRowY, w: yValW, h: secondaryRowH,
      color: 'FFFFFF', fontFace: NUM, fontSize: 14, bold: true,
      align: 'right', valign: 'middle', margin: 0,
    });
    yRowY += secondaryRowH;

    if (inclOther != null) {
      slide.addText(YIELD_LABELS.grossInclOtherIncome, {
        x: yLabelX, y: yRowY, w: yLabelW, h: secondaryRowH,
        color: 'E2E8F0', fontFace: KR, fontSize: 9.5, valign: 'middle', shrinkText: true, margin: 0,
      });
      slide.addText(fmtFixed(inclOther, 2, '%'), {
        x: yValX, y: yRowY, w: yValW, h: secondaryRowH,
        color: C.brass, fontFace: NUM, fontSize: 13.5, bold: true,
        align: 'right', valign: 'middle', margin: 0,
      });
      yRowY += secondaryRowH;
    }

    if (stabCaption) {
      slide.addText(`◇ 분석가정: ${stabCaption}`, {
        x: yLabelX, y: yRowY, w: boxW - 0.34, h: captionH,
        color: 'E8E0C8', fontFace: KR, fontSize: 8, valign: 'top', shrinkText: true, margin: 0,
      });
    }
  } else {
    // ① 히어로: 현행 임대수익률 (매매가−보증금 대비)
    slide.addText(YIELD_LABELS.grossNetOfDeposit, {
      x: yLabelX, y: yRowY, w: yLabelW, h: primaryRowH,
      color: 'FFFFFF', fontFace: KR, fontSize: 10.5, bold: true, valign: 'middle', shrinkText: true, margin: 0,
    });
    slide.addText(fmtFixed(numCapRate, 2, '%'), {
      x: yValX, y: yRowY, w: yValW, h: primaryRowH,
      color: C.brass, fontFace: NUM, fontSize: 24, bold: true,
      align: 'right', valign: 'middle', margin: 0,
    });
    yRowY += primaryRowH;

    if (inclOther != null) {
      slide.addText(YIELD_LABELS.grossInclOtherIncome, {
        x: yLabelX, y: yRowY, w: yLabelW, h: secondaryRowH,
        color: 'FFFFFF', fontFace: KR, fontSize: 9.5, valign: 'middle', shrinkText: true, margin: 0,
      });
      slide.addText(fmtFixed(inclOther, 2, '%'), {
        x: yValX, y: yRowY, w: yValW, h: secondaryRowH,
        color: C.brass, fontFace: NUM, fontSize: 14, bold: true,
        align: 'right', valign: 'middle', margin: 0,
      });
      yRowY += secondaryRowH;
    }

    if (hasStabilized) {
      slide.addText(stabLabel, {
        x: yLabelX, y: yRowY, w: yLabelW, h: secondaryRowH,
        color: 'FFFFFF', fontFace: KR, fontSize: 9.5, valign: 'middle', shrinkText: true, margin: 0,
      });
      slide.addText(fmtFixed(stabVal, 2, '%'), {
        x: yValX, y: yRowY, w: yValW, h: secondaryRowH,
        color: C.brass, fontFace: NUM, fontSize: 14, bold: true,
        align: 'right', valign: 'middle', margin: 0,
      });
    }
  }

  // ── 핵심 재무 지표 행 ──
  let rowY = yieldBgY + yieldBgH + afterYield;
  const labelX = M + 0.28;
  const valueX = M + leftW - 2.65;
  const rowFs = rowH < 0.30 ? 9.5 : 10.5;

  for (let rowIdx = 0; rowIdx < kpiRows.length; rowIdx++) {
    const [lbl, value, highlight] = kpiRows[rowIdx];
    slide.addText(lbl, {
      x: labelX, y: rowY, w: 2.85, h: rowH,
      color: C.mute, fontFace: KR, fontSize: rowFs, valign: 'middle', shrinkText: true, margin: 0,
    });
    const hasKoreanGlyph = /[가-힣]/.test(value);
    slide.addText(value, {
      x: valueX, y: rowY, w: 2.40, h: rowH,
      color: highlight ? C.brass : C.ink, fontFace: hasKoreanGlyph ? KR : NUM, fontSize: rowFs + 0.5, bold: highlight,
      align: 'right', valign: 'middle', shrinkText: true, margin: 0,
    });
    if (rowIdx < kpiRows.length - 1) {
      slide.addShape('line', {
        x: M + 0.22, y: rowY + rowH, w: leftW - 0.44, h: 0,
        line: { color: 'E8E8E8', width: 0.5 },
      });
    }
    rowY += rowH;
  }

  // ══════════════════════════════════════════════════════════════
  // 우측 패널 (Top 1, 2, 3 ONLY): 평당 단가 · 공시지가 배율 KPI + 10개년 추이 바 차트
  // ══════════════════════════════════════════════════════════════
  const fmtPyeongPrice = (wonPerPyeong: number): string => {
    if (!Number.isFinite(wonPerPyeong) || wonPerPyeong <= 0) return '-';
    if (wonPerPyeong >= 100_000_000) return `${(wonPerPyeong / 100_000_000).toFixed(2)}억/평`;
    return `${Math.round(wonPerPyeong / 10_000).toLocaleString()}만/평`;
  };

  const hasRoneSeries = Boolean(roneSeries && roneSeries.points && roneSeries.points.length >= 2);
  const showRichRightCard = hasRoneSeries || hasLandHistory;
  void effectiveOfficialPricePerSqm;

  if (!showRichRightCard) {
    const chartY = cardY;
    const chartH = cardH;
    L.fallbackCard(slide, rightX, chartY, rightW, chartH, {
      badge: '지역 지표 안내',
      badgeKind: 'brass',
      title: '권역 지가동향 및 수익성 참고 안내',
      leadText: '대상 권역의 한국부동산원 연간 지가변동률 및 대지 평당 매매가 비교 기준을 통해 중장기 지가 추이를 함께 검토합니다.',
      checklist: [
        '한국부동산원 전국지가변동률조사 최근 5개년 권역 상승률 추이',
        '매매가·보증금 승계액 차감 실투자금 기준 임대수익률 산출',
        '공실·자가사용 임대 전환 시 기대수익률 시나리오 분석',
        '인근 거래 사례 및 임차 수요 변동성에 따른 수익률 민감도 점검',
      ],
      icon: 'chart',
    });
    warnings.push('[A23] 권역 지가동향 미제공 — 수익성 참고 대체 카드 삽입');
  } else {
    const chartY = cardY;
    const chartH = cardH;
    const innerX = rightX + 0.20;
    const innerW = rightW - 0.40;

    slide.addShape('roundRect', {
      x: rightX, y: chartY, w: rightW, h: chartH,
      fill: { color: C.bg || 'FFFFFF' },
      line: { color: C.line, width: 0.75 },
      rectRadius: 0.08,
    });

    const landHistoryPoints = hasLandHistory ? landPriceHistory.history.slice(-5) : [];
    const landHistoryYearCount = landHistoryPoints.length || 5;
    const headerTitle = hasRoneSeries
      ? `${roneSeries!.regionName} 지가동향 및 토지 평당 매매가`
      : `최근 ${landHistoryYearCount}개년 지가 추이 및 토지 평당 매매가`;
    slide.addText(headerTitle, {
      x: innerX, y: chartY + 0.09, w: innerW - 1.55, h: 0.26,
      color: C.ink, fontFace: KR, fontSize: 11.5, bold: true, valign: 'middle', shrinkText: true, margin: 0,
    });
    slide.addShape('roundRect', {
      x: rightX + rightW - 1.65, y: chartY + 0.11, w: 1.45, h: 0.22,
      fill: { color: hasRoneSeries ? 'EFF6FF' : 'FEF3C7' },
      line: { color: hasRoneSeries ? C.navy : C.brass, width: 0.5 },
      rectRadius: 0.04,
    });
    slide.addText(hasRoneSeries ? '한국부동산원 R-ONE' : '공공 통계 기준', {
      x: rightX + rightW - 1.65, y: chartY + 0.11, w: 1.45, h: 0.22,
      color: hasRoneSeries ? C.navy : C.brass, fontFace: KR, fontSize: 8.0, bold: true,
      align: 'center', valign: 'middle', shrinkText: true, margin: 0,
    });

    // ── 상단 KPI 2셀: 대지 평당 매매가 + 권역 최근 5년 지가변동률 ──
    const askingPerLandPyeong = landAreaSqm > 0 && askingPrice > 0 ? (askingPrice / landAreaSqm) * SQM_RATIO : 0;
    const stripY = chartY + 0.40;
    const stripH = 0.56;
    const stripGap = 0.12;
    const stripCellW = (innerW - stripGap) / 2;
    const last5Points = hasRoneSeries && roneSeries ? roneSeries.points.slice(-5) : [];
    const last5Stats = last5Points.length > 0 ? computeLandPriceRateStats(last5Points) : null;

    const kpiStripCells: Array<{ label: string; value: string; accent: boolean }> = [
      {
        label: '대지 평당 매매가',
        value: askingPerLandPyeong > 0 ? fmtPyeongPrice(askingPerLandPyeong) : '대지면적 확인 중',
        accent: false,
      },
      hasRoneSeries && roneSeries && last5Stats
        ? {
            label: `${roneSeries.regionName} 최근 ${last5Points.length}년 연평균 지가변동률`,
            value: `+${last5Stats.geometricMeanPct.toFixed(2)}% (${last5Points.length}년 누적 +${last5Stats.cumulativePct.toFixed(1)}%)`,
            accent: true,
          }
        : {
            label: '연평균 지가 변동률(CAGR)',
            value: landPriceHistory?.cagrPct != null ? `+${landPriceHistory.cagrPct}%` : '-',
            accent: true,
          },
    ];

    kpiStripCells.forEach((cell, idx) => {
      const cx = innerX + idx * (stripCellW + stripGap);
      slide.addShape('roundRect', {
        x: cx, y: stripY, w: stripCellW, h: stripH,
        fill: { color: cell.accent ? 'FFFBEB' : 'F8FAFC' },
        line: { color: cell.accent ? C.brass : C.line, width: cell.accent ? 0.75 : 0.5 },
        rectRadius: 0.05,
      });
      slide.addText(cell.label, {
        x: cx + 0.08, y: stripY + 0.05, w: stripCellW - 0.16, h: 0.18,
        fontFace: KR, fontSize: 8.2, color: C.mute, align: 'center', valign: 'middle', shrinkText: true, margin: 0,
      });
      slide.addText(cell.value, {
        x: cx + 0.08, y: stripY + 0.24, w: stripCellW - 0.16, h: 0.28,
        fontFace: KR, fontSize: 10.2, bold: true, color: cell.accent ? C.brass : C.ink,
        align: 'center', valign: 'middle', shrinkText: true, margin: 0,
      });
    });

    // ── X축=연도 세로 막대 차트 (최근 5개년) ──
    const verticalChartY = chartY + 1.06;
    const verticalChartH = chartH - 1.12;
    if (hasRoneSeries && roneSeries) {
      const vPoints = last5Points.map((pt) => ({
        year: pt.year,
        value: pt.ratePct,
        formattedLabel: `${pt.ratePct >= 0 ? '+' : ''}${pt.ratePct.toFixed(2)}%`,
        isNegative: pt.ratePct < 0,
      }));
      renderVerticalLandPriceChart(slide, {
        x: innerX,
        y: verticalChartY,
        w: innerW,
        h: verticalChartH,
        points: vPoints,
        title: `${roneSeries.regionName} 연간 지가변동률 최근 ${vPoints.length}개년 (X축=연도)`,
        sourceText: `※ 출처: 한국부동산원 전국지가변동률조사(${roneSeries.statblId}) 기준`,
      });
    } else if (hasLandHistory) {
      const vPoints = landHistoryPoints.map((item: { year: string; pricePerSqm: number }) => ({
        year: item.year,
        value: item.pricePerSqm,
        formattedLabel: `${Math.round(item.pricePerSqm / 10_000).toLocaleString()}만`,
      }));
      renderVerticalLandPriceChart(slide, {
        x: innerX,
        y: verticalChartY,
        w: innerW,
        h: verticalChartH,
        points: vPoints,
        title: `최근 ${vPoints.length}개년 지가 추이 (만원/㎡, X축=연도)`,
        sourceText: '※ 출처: 국토교통부 공표 통계 기준 (투자 판단 참고 자료)',
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 하단 요약 밴드: 현행 임대수익률 ↔ 기대수익률 산출 기준 (단순 합산 기대수익률 제거)
  // ══════════════════════════════════════════════════════════════
  if (hasStabilized || numCapRate > 0) {
    slide.addShape('roundRect', {
      x: M, y: bandY, w: CW, h: bandH,
      fill: { color: 'F8FAFC' },
      line: { color: C.line, width: 0.9 },
      rectRadius: 0.08,
    });

    const leftBoxW = 5.45;
    const rightBoxX = M + leftBoxW + 0.35;
    const rightBoxW = CW - leftBoxW - 0.53;

    slide.addShape('line', {
      x: M + leftBoxW + 0.17, y: bandY + 0.14, w: 0, h: bandH - 0.28,
      line: { color: C.line, width: 0.75 },
    });

    slide.addText('현행 임대수익률 (보증금 차감 실투자금 기준)', {
      x: M + 0.18, y: bandY + 0.08, w: leftBoxW - 0.20, h: 0.26,
      fontFace: KR, fontSize: 10.5, bold: true, color: C.ink2, valign: 'middle', shrinkText: true, margin: 0,
    });
    slide.addText(numCapRate > 0 ? fmtFixed(numCapRate, 2, '%') : '공실 상태 (현행 임대수입 0원)', {
      x: M + 0.18, y: bandY + 0.36, w: leftBoxW - 0.20, h: 0.48,
      fontFace: numCapRate > 0 ? NUM : KR,
      fontSize: numCapRate > 0 ? 18.0 : 12.5,
      bold: true,
      color: numCapRate > 0 ? C.ink : C.mute,
      valign: 'middle',
      margin: 0,
    });

    if (roneSeries) {
      const bandLast5 = roneSeries.points.slice(-5);
      const bandLast5Stats = computeLandPriceRateStats(bandLast5);
      const periodRange = bandLast5.length >= 2
        ? `${bandLast5[0].year}~${bandLast5[bandLast5.length - 1].year}`
        : `${bandLast5.length}개년`;
      slide.addText(`${roneSeries.regionName} 최근 ${bandLast5.length}년 연평균 지가변동률 (한국부동산원 R-ONE)`, {
        x: rightBoxX, y: bandY + 0.08, w: rightBoxW, h: 0.26,
        fontFace: KR, fontSize: 10.5, bold: true, color: C.navy || C.ink2, valign: 'middle', shrinkText: true, margin: 0,
      });
      slide.addText(`연평균 +${bandLast5Stats.geometricMeanPct.toFixed(2)}% (${periodRange} 누적 +${bandLast5Stats.cumulativePct.toFixed(1)}%)`, {
        x: rightBoxX, y: bandY + 0.36, w: rightBoxW, h: 0.48,
        fontFace: KR, fontSize: 14.5, bold: true, color: C.ink, valign: 'middle', shrinkText: true, margin: 0,
      });
    } else if (hasStabilized) {
      slide.addText(stabLabel || YIELD_LABELS.stabilizedBrokerPlan, {
        x: rightBoxX, y: bandY + 0.08, w: rightBoxW, h: 0.26,
        fontFace: KR, fontSize: 10.5, bold: true, color: C.brass, valign: 'middle', shrinkText: true, margin: 0,
      });
      slide.addText(
        stabCaption || '공실·자가사용 정상화 시 임대수익률 추정 (실제 임대 조건에 따라 변동)',
        {
          x: rightBoxX, y: bandY + 0.36, w: rightBoxW, h: 0.48,
          fontFace: KR, fontSize: 11, bold: false, color: C.ink2, valign: 'middle', shrinkText: true, margin: 0,
        },
      );
    }
  }

  // ── 각주: 보증금 승계 및 산출 기준 (8pt, Cap Rate 문구 배제) ──
  const footnoteText = yieldSet
    ? yieldFootnote(yieldSet.assumptions)
    : '※ 보증금 승계 가정. 임대수익률은 운영비 차감 전(제세공과금 포함) 기준, 기대수익률은 공실·자가사용 임대 전환 가정치입니다.';
  slide.addText(footnoteText, {
    x: M, y: footY, w: CW, h: FOOTNOTE_H,
    fontSize: 8, color: '8A8A8A', fontFace: KR, valign: 'middle', shrinkText: true, margin: 0,
  });

  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);

  return { slide, warnings };
}


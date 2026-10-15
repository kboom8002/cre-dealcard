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
 * A23 — 투자수익률 분석 슬라이드 (Basic IM v2.1 — R9/R10)
 *
 *  - Cap Rate (NOI 기준) 및 중복 인근 시세 문구 완전 배제
 *  - 좌측 패널: 안정화 기대수익률(broker_plan / market_rent / target_rent) 히어로 승격 + 현행 임대수익률 병기 + 핵심 재무 지표
 *  - 우측 패널: 개별공시지가 10년 추이 바 차트 + 한국부동산원(R-ONE A_2024_00902) 시군구 10년 지가변동률 병기
 *  - 하단 밴드: 운영수익률 + 자본수익률(지역 10년 지가변동률 참고) = 단순 합산 기대수익률(참고)
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
    if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억원`;
    return `${Math.round(v / 10000).toLocaleString()}만원`;
  };

  // ── 0으로 나누기 방어 ──
  if (askingPrice > 0 && totalDeposit >= askingPrice) {
    warnings.push('[A23] 승계 보증금이 매매가 이상입니다 (실질 투자금 <= 0)');
  }

  const netInvestment = askingPrice - totalDeposit;
  const hasLandHistory = landPriceHistory?.history?.length >= 2;

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
      stabLabel = ysStab.label;
      stabCaption = ysStab.caption ?? callerAssumption ?? null;
      hasTrueStabilized = true;
    } else if (!ysStab && callerAssumption) {
      stabLabel = YIELD_LABELS.stabilizedTargetRent;
      stabCaption = callerAssumption;
      hasTrueStabilized = true;
    } else {
      stabLabel = ysStab?.label ?? stabilizedReserveLabel(yieldSet?.assumptions.vacancyReservePct);
      stabCaption = null;
      hasTrueStabilized = false;
    }
  }

  // ── 좌측 KPI 행 산출 ──
  const planSummary = ysStab?.kind === 'broker_plan' ? ysStab.planSummary : undefined;
  const kpiRows: Array<[string, string, boolean]> = planSummary
    ? [
        ['연간 임대수입 (현행 → 안정화)', `${fmtManwon(annualRent)} → ${fmtManwon(planSummary.newAnnualRentKrw)}`, false],
        ['임대보증금 총액 (현행 → 안정화)', `${fmtManwon(totalDeposit)} → ${fmtManwon(planSummary.newDepositKrw)}`, false],
        ['매각 희망가', fmtManwon(askingPrice), false],
        ['실투자금 (매매가−보증금)', `${fmtManwon(netInvestment)} → ${fmtManwon(planSummary.newNetPurchaseKrw)}`, true],
      ]
    : [
        ['연간 임대수입', fmtManwon(annualRent), false],
        ['승계 보증금', fmtManwon(totalDeposit), false],
        ['매각 희망가', fmtManwon(askingPrice), false],
        ['보증금 차감 매입가 (매매가−보증금)', fmtManwon(netInvestment), true],
      ];

  if (landPriceHistory?.latestPricePerSqm > 0) {
    const pricePerPyeong = Math.round(landPriceHistory.latestPricePerSqm * SQM_RATIO);
    const priceLabel = d.landPriceBasis === 'weighted' ? '토지 공시지가 (평당, 면적가중)'
      : d.landPriceBasis === 'representative' ? '토지 공시지가 (평당, 대표 필지)'
      : '토지 공시지가 (평당)';
    kpiRows.push([priceLabel, `${Math.round(pricePerPyeong / 10000).toLocaleString()}만원`, false]);
  }
  let landRatio: number | null = null;
  if (landPriceHistory?.latestPricePerSqm > 0 && landAreaSqm > 0 && askingPrice > 0) {
    const landTotalValue = landPriceHistory.latestPricePerSqm * landAreaSqm;
    const ratio = (landTotalValue / askingPrice) * 100;
    if (ratio > 0 && ratio < 200) {
      landRatio = ratio;
      kpiRows.push(['매매가 대비 토지 비중', `${ratio.toFixed(1)}%`, ratio >= 50]);
    }
  }

  // ── 세로 레이아웃 예산 (SAFE_BOTTOM = 6.75 엄수) ──
  const footY = SAFE_BOTTOM - FOOTNOTE_H; // 6.51
  const bandY = 5.72;
  const bandH = 0.64; // 5.72 + 0.64 = 6.36 <= footY(6.51)
  const cardY = 1.45;
  const cardH = 4.15; // 1.45 + 4.15 = 5.60 <= bandY(5.72)

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
      const newDepBil = (planSummary.newDepositKrw / 1e8).toFixed(1);
      const formulaLine = `산식: (현행 연임대료 + 전환 월세 ${addedRentMan.toLocaleString()}만×12) ÷ (매매가 − 전환후 보증금 ${newDepBil}억)`;
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

  for (const [lbl, value, highlight] of kpiRows) {
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
    slide.addShape('line', {
      x: M + 0.22, y: rowY + rowH, w: leftW - 0.44, h: 0,
      line: { color: 'E8E8E8', width: 0.5 },
    });
    rowY += rowH;
  }

  // ══════════════════════════════════════════════════════════════
  // 우측 패널: 공시지가 10년 추이 바 차트 + 한국부동산원(R-ONE) 지역 지가변동률
  // ══════════════════════════════════════════════════════════════
  if (!hasLandHistory) {
    const chartY = cardY;
    const chartH = cardH;
    L.fallbackCard(slide, rightX, chartY, rightW, chartH, {
      badge: '공시지가 열람 안내',
      badgeKind: 'brass',
      title: '개별공시지가 및 토지 가치 평가 안내',
      leadText: '대상 필지의 개별공시지가 연도별 이력 및 표준지 공시지가 대비 배율은 부동산 공시가격 알리미 및 감정평가 공적 자료를 통해 확인합니다.',
      checklist: [
        '최근 5~10개년 개별공시지가 변동 추이 및 연평균 상승률 분석',
        '인근 표준지 공시지가 대비 토지 특성(도로접면, 형상, 방위) 차이 분석',
        '토지 공시지가 대비 실거래가 매매 배율 및 평당 단가 프리미엄 검증',
        '보유세(재산세·종합부동산세) 과세표준 기준액 산출 및 세무 영향 점검',
      ],
      icon: 'chart',
    });
    warnings.push('[A23] 공시지가 미제공 — 토지 가치 평가 대체 카드 삽입');
  } else {
    const chartY = cardY;
    const chartH = cardH;
    const history = landPriceHistory.history;

    slide.addShape('roundRect', {
      x: rightX, y: chartY, w: rightW, h: chartH,
      fill: { color: C.bg || 'FFFFFF' },
      line: { color: C.line, width: 0.5 },
      rectRadius: 0.08,
    });

    slide.addText('공시지가 추이 및 지역 지가변동률', {
      x: rightX + 0.20, y: chartY + 0.12, w: rightW - 0.40, h: 0.30,
      color: C.ink, fontFace: KR, fontSize: 11.5, bold: true, valign: 'middle', margin: 0,
    });

    // 상단 요약 칩 2개 (본건 개별공시지가 CAGR vs 한국부동산원 시군구 지가변동률 10년 연평균)
    const chipY = chartY + 0.46;
    const chipH = 0.46;
    const chipGap = 0.12;
    const chipW = (rightW - 0.40 - chipGap) / 2;

    slide.addShape('roundRect', {
      x: rightX + 0.20, y: chipY, w: chipW, h: chipH,
      fill: { color: 'F8FAFC' },
      line: { color: C.line, width: 0.5 },
      rectRadius: 0.05,
    });
    const indivCagrStr = landPriceHistory.cagrPct != null ? `+${landPriceHistory.cagrPct}%` : '-';
    const indivCumStr = landPriceHistory.totalGrowthPct != null ? ` (누적 +${landPriceHistory.totalGrowthPct}%)` : '';
    slide.addText(`본건 공시지가 ${history.length}년 연평균(CAGR)\n${indivCagrStr}${indivCumStr}`, {
      x: rightX + 0.28, y: chipY + 0.04, w: chipW - 0.16, h: chipH - 0.08,
      color: C.ink, fontFace: KR, fontSize: 8.5, bold: true, valign: 'middle', shrinkText: true, margin: 0,
    });

    const chip2X = rightX + 0.20 + chipW + chipGap;
    slide.addShape('roundRect', {
      x: chip2X, y: chipY, w: chipW, h: chipH,
      fill: { color: 'F8FAFC' },
      line: { color: C.line, width: 0.5 },
      rectRadius: 0.05,
    });
    const chip2Text = roneSeries
      ? `${roneSeries.regionName} 지가변동률 10년 연평균\n+${roneSeries.geometricMeanPct.toFixed(2)}% (한국부동산원)`
      : `토지 공시지가(평당)\n${Math.round((landPriceHistory.latestPricePerSqm * SQM_RATIO) / 10000).toLocaleString()}만원`;
    slide.addText(chip2Text, {
      x: chip2X + 0.08, y: chipY + 0.04, w: chipW - 0.16, h: chipH - 0.08,
      color: C.brass, fontFace: KR, fontSize: 8.5, bold: true, valign: 'middle', shrinkText: true, margin: 0,
    });

    // 바 차트 영역
    const barAreaY = chartY + 1.00;
    const barAreaH = roneSeries ? 2.25 : 2.65;
    const maxPrice = Math.max(...history.map((h: { pricePerSqm: number }) => h.pricePerSqm));
    const barCount = history.length;
    const barH = Math.min(0.24, barAreaH / Math.max(1, barCount));
    const maxBarW = rightW - 2.15;

    history.forEach((item: { year: string; pricePerSqm: number }, i: number) => {
      const y = barAreaY + i * barH;
      const ratio = maxPrice > 0 ? item.pricePerSqm / maxPrice : 0;
      const bw = Math.max(0.05, maxBarW * ratio);

      slide.addText(item.year, {
        x: rightX + 0.15, y, w: 0.55, h: barH,
        fontFace: NUM, fontSize: 8.5, color: C.mute, align: 'right', valign: 'middle', margin: 0,
      });

      const isLatest = i === history.length - 1;
      const barColor = isLatest ? C.brass : (C.navy || C.brand || '1E3A8A');
      slide.addShape('rect', {
        x: rightX + 0.78, y: y + 0.03, w: bw, h: Math.max(0.08, barH - 0.06),
        fill: { color: barColor },
      });

      slide.addText(`${item.pricePerSqm.toLocaleString()}`, {
        x: rightX + 0.84 + bw, y, w: 1.15, h: barH,
        fontFace: NUM, fontSize: 8, color: C.mute, align: 'left', valign: 'middle', margin: 0,
      });
    });

    // 한국부동산원 연도별 지가변동률 스트립 (우측 하단)
    if (roneSeries && roneSeries.points.length > 0) {
      const stripY = chartY + 3.32;
      const stripText = roneSeries.points
        .map((pt) => `'${String(pt.year).slice(-2)} ${pt.ratePct >= 0 ? '+' : ''}${pt.ratePct.toFixed(2)}%`)
        .join(' · ');
      slide.addText(`${roneSeries.regionName} 연도별 지가변동률: ${stripText}`, {
        x: rightX + 0.20, y: stripY, w: rightW - 0.40, h: 0.42,
        fontSize: 8, color: C.mute, fontFace: KR, valign: 'middle', shrinkText: true, margin: 0,
      });
    }

    // 출처
    const srcNote = roneSeries
      ? `※ 국토교통부 개별공시지가 · 한국부동산원 전국지가변동률조사(${roneSeries.statblId}) 기준`
      : '※ 국토교통부 개별공시지가 기준 (투자 판단 참고 자료)';
    slide.addText(srcNote, {
      x: rightX + 0.18, y: chartY + chartH - 0.28, w: rightW - 0.36, h: 0.22,
      fontSize: 8, color: '8A8A8A', fontFace: KR, valign: 'middle', shrinkText: true, margin: 0,
    });
  }

  // ══════════════════════════════════════════════════════════════
  // 하단 밴드: 운영수익률 + 자본수익률(지역 지가변동률 참고) = 단순 합산 기대수익률(참고)
  // ══════════════════════════════════════════════════════════════
  const opYieldPct = hasTrueStabilized ? stabVal : numCapRate;
  const opYieldBasisLabel = hasTrueStabilized
    ? (ysStab?.kind === 'broker_plan' ? '안정화 기대수익률' : '안정화 가정 수익률')
    : '현행 임대수익률';
  const capGainPct = roneSeries
    ? roneSeries.geometricMeanPct
    : (hasLandHistory && landPriceHistory?.cagrPct != null && Number.isFinite(Number(landPriceHistory.cagrPct))
      ? Number(landPriceHistory.cagrPct)
      : null);

  if (opYieldPct > 0 && capGainPct != null) {
    const combinedPct = parseFloat((opYieldPct + capGainPct).toFixed(2));
    const capBasisLabel = roneSeries
      ? `${roneSeries.regionName} 10년 지가변동률 연평균`
      : '개별공시지가 10년 연평균 변동률';
    const landRatioNote = landRatio != null ? ` · 토지가치 비중 ${fmtFixed(landRatio, 1, '%')}` : '';

    slide.addShape('roundRect', {
      x: M, y: bandY, w: CW, h: bandH,
      fill: { color: 'F8FAFC' },
      line: { color: C.line, width: 0.75 },
      rectRadius: 0.06,
    });

    const segW = (CW - 0.40) / 3;
    // Segment 1: 운영수익률
    slide.addText(
      `운영수익률 (${opYieldBasisLabel})\n${fmtFixed(opYieldPct, 2, '%')}${hasTrueStabilized && numCapRate > 0 ? `  [현행 ${fmtFixed(numCapRate, 2, '%')}]` : ''}`,
      {
        x: M + 0.20, y: bandY + 0.06, w: segW, h: bandH - 0.12,
        fontFace: KR, fontSize: 9.0, bold: true, color: C.ink, valign: 'middle', shrinkText: true, margin: 0,
      },
    );
    // Segment 2: + 자본수익률 (참고)
    slide.addText(
      `+ 자본수익률 (참고 · ${capBasisLabel})\n+${capGainPct.toFixed(2)}%`,
      {
        x: M + 0.20 + segW, y: bandY + 0.06, w: segW, h: bandH - 0.12,
        fontFace: KR, fontSize: 9.0, bold: true, color: C.ink, valign: 'middle', align: 'center', shrinkText: true, margin: 0,
      },
    );
    // Segment 3: = 단순 합산 기대수익률 (참고)
    slide.addText(
      `= 단순 합산 기대수익률 (참고)\n${combinedPct.toFixed(2)}%${landRatioNote}`,
      {
        x: M + 0.20 + segW * 2, y: bandY + 0.06, w: segW, h: bandH - 0.12,
        fontFace: KR, fontSize: 9.5, bold: true, color: C.brass, valign: 'middle', align: 'right', shrinkText: true, margin: 0,
      },
    );
  } else if (opYieldPct > 0) {
    const summaryText = hasTrueStabilized
      ? `• ${opYieldBasisLabel} ${fmtFixed(opYieldPct, 2, '%')} (현행 임대수익률 ${fmtFixed(numCapRate, 2, '%')}, 운영비 차감 전)`
      : `• 임대수익률 ${fmtFixed(numCapRate, 2, '%')} (운영비 차감 전, 보증금 차감 매입가 기준)`;
    L.callout(slide, M, bandY, CW, bandH, 'info', '수익률 산출 요약', summaryText);
  }

  // ── 각주: 보증금 승계 및 산출 기준 (8pt, Cap Rate 문구 배제) ──
  const footnoteText = yieldSet
    ? yieldFootnote(yieldSet.assumptions)
    : '※ 보증금 승계 가정. 임대수익률은 운영비 차감 전(제세공과금 차감 전) 기준이며, 안정화 기대수익률은 공실·자가사용 임대 전환 가정치입니다.';
  slide.addText(footnoteText, {
    x: M, y: footY, w: CW, h: FOOTNOTE_H,
    fontSize: 8, color: '8A8A8A', fontFace: KR, valign: 'middle', shrinkText: true, margin: 0,
  });

  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);

  return { slide, warnings };
}


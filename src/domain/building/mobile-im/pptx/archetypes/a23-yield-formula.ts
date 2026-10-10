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

/** 하단 각주 높이 (8pt 1~2줄) — 콜아웃/카드는 이 위에서 끝난다 */
const FOOTNOTE_H = 0.24;

/**
 * A23 — 투자수익률 분석 슬라이드 (Basic IM v2.0)
 *
 * D10/D9 (2026-10): 수익률 3행을 같은 이름·같은 정의로 표기하고(요약 슬라이드와 동일 YieldSet), 하단에 가정 각주를 둔다.
 *  1) 임대수익률 (매매가−보증금 대비) — 운영비 차감 전 (v1.5 Q1: 전 IM 단일 수익률 헤드라인, V04). 기타수입이 있으면 V05 를 별도 줄로.
 *  2) Cap Rate (NOI 기준) — 운영비·공실충당 차감 후 (NOI 값이 있을 때만)
 *  3) 안정화 수익률 — 실제 공실·자가사용 면적 × 중개인 목표임대료일 때만 '임대 가정' 문구,
 *     아니면 '공실충당 N% 제외 기준 (참고)' (시세 임대를 가정하지 않음)
 * 하단 콜아웃은 계산된 사실(수치·공시지가 CAGR·토지 비중)만 중립적으로 서술한다.
 * 시장 평균 비교 등 출처 없는 평가·권고 문구는 생성하지 않는다.
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
  const capRateStabilized = d.capRateStabilized;
  const callerAssumption: string | undefined = typeof d.stabilizedAssumption === 'string' && d.stabilizedAssumption.trim()
    ? d.stabilizedAssumption.trim()
    : undefined;
  const yieldSet: YieldSet | undefined = d.yieldSet && typeof d.yieldSet === 'object' ? d.yieldSet : undefined;
  const landPriceHistory = d.landPriceHistory;
  const landAreaSqm = d.landAreaSqm ?? 0;
  const areaSignal = d.areaSignal ?? '';
  void vacancyPct;
  void areaSignal;

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

  // ── 좌우 패널 분할 ──
  const leftW = 5.60; // F-05: 무조건 좌측 5.60 고정
  const gap = 0.40;
  const rightX = M + leftW + gap;
  const rightW = CW - leftW - gap; // F-05: 우측 패널 항상 확보

  const rawCap = typeof capRateAsIs === 'number' ? capRateAsIs : parseFloat(String(capRateAsIs));
  const numCapRate = Number.isFinite(rawCap) && rawCap > 0 ? rawCap : 0;

  // ── 수익률 3행 사전 산출 (이름·정의는 요약 슬라이드와 공유) ──
  const noiCap = yieldSet?.noiCapRate != null && Number.isFinite(yieldSet.noiCapRate) && yieldSet.noiCapRate > 0
    ? yieldSet.noiCapRate
    : null;
  // V05 — 기타수입이 있을 때만(YieldSet이 null 이면 줄 자체를 만들지 않는다)
  const inclOther = yieldSet?.grossYieldInclOtherIncome != null && Number.isFinite(yieldSet.grossYieldInclOtherIncome) && yieldSet.grossYieldInclOtherIncome > 0
    ? yieldSet.grossYieldInclOtherIncome
    : null;

  const hasStabilized = capRateStabilized != null && Number.isFinite(capRateStabilized) && capRateStabilized > 0;
  if (!hasStabilized) warnings.push('안정화 수익률 데이터 없음');
  const rawStab = typeof capRateStabilized === 'number' ? capRateStabilized : parseFloat(String(capRateStabilized));
  const stabVal = Number.isFinite(rawStab) && rawStab > 0 ? rawStab : 0;
  // 안정화 행의 종류: YieldSet이 같은 값을 산출했으면 그 종류·라벨, 호출자가 근거 문구를 직접 준 경우는 분석가정,
  // 둘 다 아니면 시세 임대 가정을 암시하지 않는 '공실충당 제외 기준 (참고)'.
  const ysStab = yieldSet?.stabilized && Math.abs(yieldSet.stabilized.value - stabVal) < 0.005 ? yieldSet.stabilized : null;
  let stabLabel = '';
  let stabCaption: string | null = null;
  if (hasStabilized) {
    if (ysStab && ysStab.kind !== 'reserve_excluded') {
      // target_rent · market_rent(M5~M7 출처 인용) 모두 캡션 표기 — 가정의 근거를 숨기지 않는다
      stabLabel = ysStab.label;
      stabCaption = ysStab.caption;
    } else if (!ysStab && callerAssumption) {
      stabLabel = YIELD_LABELS.stabilizedTargetRent;
      stabCaption = callerAssumption;
    } else {
      stabLabel = ysStab?.label ?? stabilizedReserveLabel(yieldSet?.assumptions.vacancyReservePct);
      stabCaption = null;
    }
  }

  // ── 좌측 KPI 행 사전 산출 (2026-10-05: 레이아웃 높이를 먼저 계산해 하단 콜아웃과의 겹침을 원천 차단) ──
  const kpiRows: Array<[string, string, boolean]> = [
    ['연간 임대수입', fmtManwon(annualRent), false],
    ['승계 보증금', fmtManwon(totalDeposit), false],
    ['매매가', fmtManwon(askingPrice), false],
    ['보증금 차감 매입가 (매매가−보증금)', fmtManwon(netInvestment), true],
  ];
  // 토지평당가 (공시지가 최신값이 있을 때)
  if (landPriceHistory?.latestPricePerSqm > 0) {
    const pricePerPyeong = Math.round(landPriceHistory.latestPricePerSqm * SQM_RATIO);
    // 다필지: 단가 기준 명시 (면적 가중평균 / 대표 필지)
    const priceLabel = d.landPriceBasis === 'weighted' ? '토지 공시지가 (평당, 면적가중)'
      : d.landPriceBasis === 'representative' ? '토지 공시지가 (평당, 대표 필지)'
      : '토지 공시지가 (평당)';
    kpiRows.push([priceLabel, `${Math.round(pricePerPyeong / 10000).toLocaleString()}만원`, false]);
  }
  // 매매가 대비 토지비중
  let landRatio: number | null = null;
  if (landPriceHistory?.latestPricePerSqm > 0 && landAreaSqm > 0 && askingPrice > 0) {
    const landTotalValue = landPriceHistory.latestPricePerSqm * landAreaSqm;
    const ratio = (landTotalValue / askingPrice) * 100;
    if (ratio > 0 && ratio < 200) {
      landRatio = ratio;
      kpiRows.push(['매매가 대비 토지 비중', `${ratio.toFixed(1)}%`, ratio >= 50]);
    }
  }

  // ── 하단 콜아웃 (D9): 계산된 사실만 중립 서술 — 근거 없는 시장 비교·평가·권고 문구 없음 ──
  // 근거(출처)가 있는 비교는 중개인 제공 시세(토지 평당가)뿐이며, 수익률(Cap Rate) 비교 근거는 없으므로 서술하지 않는다.
  const calloutBullets: string[] = [];

  // 수익률 사실 (수치 + 산출 기준)
  if (numCapRate > 0) {
    const parts = [`임대수익률 ${fmtFixed(numCapRate, 2, '%')} (운영비 차감 전)`];
    if (noiCap != null) parts.push(`Cap Rate ${fmtFixed(noiCap, 2, '%')} (운영비·공실충당 차감 후)`);
    if (hasStabilized && stabCaption) {
      parts.push(`${ysStab?.kind === 'market_rent' ? '공실·자가사용 면적 시장 임대료 가정 시' : '공실·자가사용 면적 임대 가정 시'} 안정화 수익률 ${fmtFixed(stabVal, 2, '%')}`);
    }
    calloutBullets.push(`• ${parts.join(', ')}`);
  }

  // 공시지가 CAGR + 토지 비중 (둘 다 계산값일 때만; 방향은 값의 부호로 서술)
  const landParts: string[] = [];
  if (hasLandHistory && landPriceHistory.cagrPct != null && Number.isFinite(Number(landPriceHistory.cagrPct))) {
    const cagr = Number(landPriceHistory.cagrPct);
    const dir = cagr > 0 ? `연평균 ${cagr}% 상승` : cagr < 0 ? `연평균 ${Math.abs(cagr)}% 하락` : '연평균 변동 없음';
    landParts.push(`${landPriceHistory.history.length}년간 개별공시지가 ${dir}`);
  }
  if (landRatio != null) landParts.push(`매매가 대비 토지 가치 비중 ${fmtFixed(landRatio, 1, '%')} (공시지가×대지면적 기준)`);
  if (landParts.length > 0) calloutBullets.push(`• ${landParts.join(', ')}`);

  // 중개인 제공 인근 시세 중 토지 평당가가 있는 건만 (출처 표기). 필드가 없으면 생략.
  const marketComps: Array<Record<string, any>> = Array.isArray(d.marketComps) ? d.marketComps : [];
  const landComps = marketComps
    .filter((c) => c && Number.isFinite(Number(c.land_price_per_pyeong_manwon)) && Number(c.land_price_per_pyeong_manwon) > 0)
    .slice(0, 2);
  if (landComps.length > 0) {
    const txt = landComps
      .map((c) => `${String(c.location ?? '').trim() || '인근'} 토지 평당 ${Number(c.land_price_per_pyeong_manwon).toLocaleString()}만원(${c.kind === 'transaction' ? '실거래' : '매물'})`)
      .join(', ');
    calloutBullets.push(`• 중개인 제공 인근 시세: ${txt}`);
  }

  // ── 하단 각주 (8pt) — 운영비율/공실충당/보증금 승계 가정 ──
  const footnoteText = yieldSet
    ? yieldFootnote(yieldSet.assumptions)
    : '※ 임대수익률은 운영비 차감 전 기준, 보증금 승계 가정.';
  const footY = SAFE_BOTTOM - FOOTNOTE_H;
  const contentBottom = footY - 0.06;

  // ── 세로 레이아웃 예산 (SAFE_BOTTOM 6.75 내에서 카드 + 콜아웃 + 각주가 겹치지 않도록) ──
  const cardY = 1.45;
  const calloutGap = 0.15;
  const padTop = 0.20;
  const afterYield = 0.12;
  const padBottom = 0.16;

  // 다크 박스: 수익률 3행
  const boxPad = 0.08;
  const primaryRowH = 0.46;
  const secondaryRowH = 0.30;
  const captionH = stabCaption ? 0.30 : 0;
  const yieldBgH = boxPad * 2 + primaryRowH + (inclOther != null ? secondaryRowH : 0) + (noiCap != null ? secondaryRowH : 0) + (hasStabilized ? secondaryRowH + captionH : 0);

  const fixedH = padTop + yieldBgH + afterYield + padBottom;
  const calloutHFor = (n: number) => (n > 0 ? 0.42 + n * 0.25 : 0);
  let rowH = 0.38;
  let availCardH = 0;
  // 카드 하단이 콜아웃·각주를 침범하면 행 높이를 줄이고, 그래도 부족하면 후순위 콜아웃 불릿부터 제거한다.
  for (;;) {
    const calloutH = calloutHFor(calloutBullets.length);
    availCardH = contentBottom - cardY - (calloutH > 0 ? calloutH + calloutGap : 0);
    rowH = fixedH + kpiRows.length * 0.38 > availCardH
      ? (availCardH - fixedH) / Math.max(1, kpiRows.length)
      : 0.38;
    if (rowH >= 0.27 || calloutBullets.length <= 1) break;
    calloutBullets.pop();
  }
  rowH = Math.max(0.24, Math.min(0.38, rowH));
  const calloutH = calloutHFor(calloutBullets.length);
  // 카드는 가용 높이를 채워 좌우 패널 하단을 정렬 (최대 4.40)
  const cardH = Math.min(4.40, Math.max(fixedH + kpiRows.length * rowH, availCardH));

  // ══════════════════════════════════════════════════════════════
  // 좌측 패널: 수익률 KPI 카드
  // ══════════════════════════════════════════════════════════════
  // 카드 배경
  slide.addShape('roundRect', {
    x: M, y: cardY, w: leftW, h: cardH,
    fill: { color: 'FFFFFF' },
    line: { color: C.line, width: 1 },
    rectRadius: 0.08,
  });

  // ── 수익률 3행 (다크 박스) ──
  const yieldBgY = cardY + padTop;
  const boxX = M + 0.25;
  const boxW = leftW - 0.50;
  slide.addShape('roundRect', {
    x: boxX, y: yieldBgY, w: boxW, h: yieldBgH,
    fill: { color: C.ink },
    rectRadius: 0.08,
  });

  const yLabelX = boxX + 0.20;
  const yValW = 1.55;
  const yValX = boxX + boxW - yValW - 0.15;
  const yLabelW = yValX - yLabelX - 0.05;
  let yRowY = yieldBgY + boxPad;

  // ① 임대수익률 (Gross, 매매가−보증금 대비) — 운영비 차감 전
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

  // ①-b 임대수익률 (기타수입 포함, 참고) — V05. 렌트롤 J8 기타수입이 있을 때만, 헤드라인 V04 와 별도 줄
  if (inclOther != null) {
    slide.addText(YIELD_LABELS.grossInclOtherIncome, {
      x: yLabelX, y: yRowY, w: yLabelW, h: secondaryRowH,
      color: 'FFFFFF', fontFace: KR, fontSize: 10, valign: 'middle', shrinkText: true, margin: 0,
    });
    slide.addText(fmtFixed(inclOther, 2, '%'), {
      x: yValX, y: yRowY, w: yValW, h: secondaryRowH,
      color: C.brass, fontFace: NUM, fontSize: 15, bold: true,
      align: 'right', valign: 'middle', margin: 0,
    });
    yRowY += secondaryRowH;
  }

  // ② Cap Rate (NOI 기준) — 운영비·공실충당 차감 후 (요약 슬라이드와 같은 값·같은 이름)
  if (noiCap != null) {
    slide.addText(YIELD_LABELS.noiCapRate, {
      x: yLabelX, y: yRowY, w: yLabelW, h: secondaryRowH,
      color: 'FFFFFF', fontFace: KR, fontSize: 10, valign: 'middle', shrinkText: true, margin: 0,
    });
    slide.addText(fmtFixed(noiCap, 2, '%'), {
      x: yValX, y: yRowY, w: yValW, h: secondaryRowH,
      color: C.brass, fontFace: NUM, fontSize: 15, bold: true,
      align: 'right', valign: 'middle', margin: 0,
    });
    yRowY += secondaryRowH;
  }

  // ③ 안정화 수익률 / 공실충당 N% 제외 기준 (참고)
  if (hasStabilized) {
    slide.addText(stabLabel, {
      x: yLabelX, y: yRowY, w: yLabelW, h: secondaryRowH,
      color: 'FFFFFF', fontFace: KR, fontSize: 10, valign: 'middle', shrinkText: true, margin: 0,
    });
    slide.addText(fmtFixed(stabVal, 2, '%'), {
      x: yValX, y: yRowY, w: yValW, h: secondaryRowH,
      color: C.brass, fontFace: NUM, fontSize: 15, bold: true,
      align: 'right', valign: 'middle', margin: 0,
    });
    yRowY += secondaryRowH;
    if (stabCaption) {
      // 근거 캡션은 계산이 실제로 뒷받침할 때만 (중개인 목표임대료 × 실제 공실·자가사용 면적)
      slide.addText(`◇ 분석가정: ${stabCaption}`, {
        x: yLabelX, y: yRowY, w: boxW - 0.40, h: captionH,
        color: 'E8E0C8', fontFace: KR, fontSize: 8, valign: 'top', shrinkText: true, margin: 0,
      });
    }
  }

  // ── 핵심 재무 지표 행 ──
  let rowY = yieldBgY + yieldBgH + afterYield;
  const labelX = M + 0.35;
  const valueX = M + leftW - 2.80;
  const rowFs = rowH < 0.34 ? 10.5 : 11;

  for (const [lbl, value, highlight] of kpiRows) {
    slide.addText(lbl, {
      x: labelX, y: rowY, w: 3.0, h: rowH,
      color: C.mute, fontFace: KR, fontSize: rowFs, valign: 'middle',
    });
    slide.addText(value, {
      x: valueX, y: rowY, w: 2.40, h: rowH,
      color: highlight ? C.brass : C.ink, fontFace: NUM, fontSize: rowFs + 1, bold: highlight,
      align: 'right', valign: 'middle',
    });
    // 구분선
    slide.addShape('line', {
      x: M + 0.25, y: rowY + rowH, w: leftW - 0.50, h: 0,
      line: { color: 'E8E8E8', width: 0.5 },
    });
    rowY += rowH;
  }

  // ══════════════════════════════════════════════════════════════
  // 우측 패널: 공시지가 10년 추이 바 차트
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

    // 차트 배경
    slide.addShape('roundRect', {
      x: rightX, y: chartY, w: rightW, h: chartH,
      fill: { color: C.bg || 'FFFFFF' },
      line: { color: C.line, width: 0.5 },
      rectRadius: 0.08,
    });

    // 타이틀
    slide.addText('공시지가 추이', {
      x: rightX + 0.20, y: chartY + 0.15, w: rightW - 0.40, h: 0.35,
      color: C.ink, fontFace: KR, fontSize: 12, bold: true, valign: 'middle',
    });

    // 바 차트 영역 (하단 CAGR 2행 + 출처 1행 공간 확보 — 출처와 누적 상승률 겹침 방지)
    const barAreaY = chartY + 0.60;
    const barAreaH = chartH - 1.85;
    const maxPrice = Math.max(...history.map((h: { pricePerSqm: number }) => h.pricePerSqm));
    const barCount = history.length;
    const barH = Math.min(0.32, (barAreaH - 0.1) / barCount);
    const maxBarW = rightW - 2.20;

    history.forEach((item: { year: string; pricePerSqm: number }, i: number) => {
      const y = barAreaY + i * barH;
      const ratio = item.pricePerSqm / maxPrice;
      const bw = maxBarW * ratio;

      // 연도 라벨
      slide.addText(item.year, {
        x: rightX + 0.15, y, w: 0.55, h: barH,
        fontFace: NUM, fontSize: 9, color: C.mute, align: 'right', valign: 'middle',
      });

      // 바
      const isLatest = i === history.length - 1;
      const barColor = isLatest ? C.brass : (C.navy || C.brand || '1E3A8A');
      slide.addShape('rect', {
        x: rightX + 0.80, y: y + 0.04, w: bw, h: barH - 0.08,
        fill: { color: barColor },
      });

      // 가격 라벨 (원/㎡)
      slide.addText(`${item.pricePerSqm.toLocaleString()}`, {
        x: rightX + 0.85 + bw, y, w: 1.20, h: barH,
        fontFace: NUM, fontSize: 8, color: C.mute, align: 'left', valign: 'middle',
      });
    });

    // CAGR / 누적 상승률
    const summaryY = barAreaY + barCount * barH + 0.15;
    if (landPriceHistory.cagrPct != null) {
      slide.addText([
        { text: '연평균 상승률(CAGR) ', options: { color: C.mute, fontSize: 10 } },
        { text: `${landPriceHistory.cagrPct}%`, options: { color: C.brass, fontSize: 14, bold: true } },
      ], {
        x: rightX + 0.20, y: summaryY, w: rightW - 0.40, h: 0.35,
        fontFace: KR, valign: 'middle',
      });
    }
    if (landPriceHistory.totalGrowthPct != null) {
      slide.addText([
        { text: `${history.length}년 누적 상승률 `, options: { color: C.mute, fontSize: 10 } },
        { text: `${landPriceHistory.totalGrowthPct}%`, options: { color: C.ink, fontSize: 12, bold: true } },
      ], {
        x: rightX + 0.20, y: summaryY + 0.35, w: rightW - 0.40, h: 0.30,
        fontFace: KR, valign: 'middle',
      });
    }

    // 출처
    slide.addText('※ 국토교통부 개별공시지가 기준 (투자 판단 참고 자료)', {
      x: rightX + 0.15, y: chartY + chartH - 0.35, w: rightW - 0.30, h: 0.25,
      fontSize: 8, color: '8A8A8A', fontFace: KR,
    });
  }

  // ══════════════════════════════════════════════════════════════
  // 하단 콜아웃: 계산된 사실 요약 — 좌·우 카드 하단 아래에 배치 (겹침 없음)
  // ══════════════════════════════════════════════════════════════
  if (calloutBullets.length > 0) {
    const calloutY = cardY + cardH + calloutGap;
    const finalH = Math.max(0.50, Math.min(calloutH, contentBottom - calloutY));
    L.callout(slide, M, calloutY, CW, finalH, 'info', '수익률 산출 요약',
      calloutBullets.join('\n'));
  }

  // ── 각주: 운영비율·공실충당·보증금 승계 가정 (8pt) ──
  slide.addText(footnoteText, {
    x: M, y: footY, w: CW, h: FOOTNOTE_H,
    fontSize: 8, color: '8A8A8A', fontFace: KR, valign: 'middle', shrinkText: true, margin: 0,
  });

  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);

  return { slide, warnings };
}

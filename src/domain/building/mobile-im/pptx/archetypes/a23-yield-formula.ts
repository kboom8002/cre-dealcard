import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR, NUM, SAFE_BOTTOM } from '../imlib';
import type { ProvenanceKind } from '../imlib';
import { SQM_RATIO } from '@/lib/utils/area-conversion';

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

/**
 * A23 — 투자수익률 분석 슬라이드 (Basic IM v2.0)
 *
 * 개선사항:
 * - 산식 제거 → 수익률을 직관적 KPI로 표시
 * - "Cap Rate" → "수익률" (한국 소형부동산 실무 용어)
 * - 공시지가 10년 추이 바 차트 추가 (CAGR 포함)
 * - 순투자금, 토지평당가, 매매가 대비 토지비중 추가
 * - 하단 투자 판단 참고 콜아웃 자동 생성
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
  const assumption = d.stabilizedAssumption ?? '공실층을 인근 시세 수준으로 임대 가정';
  const landPriceHistory = d.landPriceHistory;
  const landAreaSqm = d.landAreaSqm ?? 0;
  const areaSignal = d.areaSignal ?? '';

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

  // ══════════════════════════════════════════════════════════════
  // 좌측 패널: 수익률 KPI 카드
  // ══════════════════════════════════════════════════════════════
  const cardY = 1.50;
  const cardH = 4.20; // SSoT: 4.20 균일 높이로 하단 SAFE_BOTTOM(6.75) 준수 및 지면 이탈 방어

  // 카드 배경
  slide.addShape('roundRect', {
    x: M, y: cardY, w: leftW, h: cardH,
    fill: { color: 'FFFFFF' },
    line: { color: C.line, width: 1 },
    rectRadius: 0.08,
  });

  // ── 대형 수익률 표시 ──
  const yieldBgY = cardY + 0.25;
  const yieldBgH = 1.10;
  slide.addShape('roundRect', {
    x: M + 0.25, y: yieldBgY, w: leftW - 0.50, h: yieldBgH,
    fill: { color: C.ink },
    rectRadius: 0.08,
  });

  const rawCap = typeof capRateAsIs === 'number' ? capRateAsIs : parseFloat(String(capRateAsIs));
  const numCapRate = Number.isFinite(rawCap) && rawCap > 0 ? rawCap : 0;

  slide.addText('수익률', {
    x: M + 0.50, y: yieldBgY, w: 2.5, h: yieldBgH,
    color: 'FFFFFF', fontFace: KR, fontSize: 16, bold: true, valign: 'middle',
  });
  slide.addText(`${numCapRate.toFixed(2)}%`, {
    x: M + leftW - 3.50, y: yieldBgY, w: 3.00, h: yieldBgH,
    color: C.brass, fontFace: NUM, fontSize: 28, bold: true,
    align: 'right', valign: 'middle',
  });

  // ── 핵심 재무 지표 행 ──
  let rowY = yieldBgY + yieldBgH + 0.25;
  const rowH = 0.38;
  const labelX = M + 0.35;
  const valueX = M + leftW - 2.80;

  const renderRow = (lbl: string, value: string, highlight = false) => {
    slide.addText(lbl, {
      x: labelX, y: rowY, w: 3.0, h: rowH,
      color: C.mute, fontFace: KR, fontSize: 11, valign: 'middle',
    });
    slide.addText(value, {
      x: valueX, y: rowY, w: 2.40, h: rowH,
      color: highlight ? C.brass : C.ink, fontFace: NUM, fontSize: 12, bold: highlight,
      align: 'right', valign: 'middle',
    });
    // 구분선
    slide.addShape('line', {
      x: M + 0.25, y: rowY + rowH, w: leftW - 0.50, h: 0,
      line: { color: 'E8E8E8', width: 0.5 },
    });
    rowY += rowH;
  };

  renderRow('연간 임대수입', fmtManwon(annualRent));
  renderRow('승계 보증금', fmtManwon(totalDeposit));
  renderRow('매매가', fmtManwon(askingPrice));
  renderRow('순투자금 (매매가 − 보증금)', fmtManwon(netInvestment), true);

  // 토지평당가 (공시지가 최신값이 있을 때)
  if (landPriceHistory?.latestPricePerSqm > 0) {
    const pricePerPyeong = Math.round(landPriceHistory.latestPricePerSqm * SQM_RATIO);
    renderRow('토지 공시지가 (평당)', `${Math.round(pricePerPyeong / 10000).toLocaleString()}만원`);
  }

  // 매매가 대비 토지비중
  if (landPriceHistory?.latestPricePerSqm > 0 && landAreaSqm > 0 && askingPrice > 0) {
    const landTotalValue = landPriceHistory.latestPricePerSqm * landAreaSqm;
    const landRatio = (landTotalValue / askingPrice) * 100;
    if (landRatio > 0 && landRatio < 200) {
      renderRow('매매가 대비 토지 비중', `${landRatio.toFixed(1)}%`, landRatio >= 50);
    }
  }

  // ── 안정화 수익률 하단 배지 (조건부) ──
  const hasStabilized = capRateStabilized != null && Number.isFinite(capRateStabilized) && capRateStabilized > 0;
  if (!hasStabilized) warnings.push('안정화 수익률 데이터 없음');
  if (hasStabilized) {
    rowY += 0.15;
    const stabBadgeH = 0.55;
    slide.addShape('roundRect', {
      x: M + 0.25, y: rowY, w: leftW - 0.50, h: stabBadgeH,
      fill: { color: 'F6F1E4' },
      line: { color: C.brass, width: 1.0 },
      rectRadius: 0.06,
    });
    const stabLabel = assumption ? `◇ 분석가정 (Stabilized)\n${assumption}` : '◇ 분석가정 (Stabilized)';
    slide.addText(stabLabel, {
      x: M + 0.40, y: rowY, w: 2.8, h: stabBadgeH,
      color: C.ink, fontFace: KR, fontSize: assumption ? 8.5 : 10, bold: true, valign: 'middle',
    });
    const rawStab = typeof capRateStabilized === 'number' ? capRateStabilized : parseFloat(String(capRateStabilized));
    const stabVal = Number.isFinite(rawStab) && rawStab > 0 ? rawStab : 0;
    slide.addText(`${stabVal.toFixed(2)}%`, {
      x: M + leftW - 3.00, y: rowY, w: 2.50, h: stabBadgeH,
      color: C.brass, fontFace: NUM, fontSize: 18, bold: true,
      align: 'right', valign: 'middle',
    });
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

    // 바 차트 영역
    const barAreaY = chartY + 0.60;
    const barAreaH = chartH - 1.60;
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

      // 가격 라벨 (만원 단위)
      const priceManwon = Math.round(item.pricePerSqm / 10000);
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
  // 하단 콜아웃: 투자 판단 참고 (데이터 기반 자동 생성)
  // ══════════════════════════════════════════════════════════════
  const calloutBullets: string[] = [];

  // 수익률 비교 (서울 소형빌딩 평균 4.5~5.5% 기준)
  if (numCapRate > 0) {
    if (numCapRate >= 6.0) {
      calloutBullets.push(`• 수익률 ${numCapRate.toFixed(1)}%는 서울 소형빌딩 시장 평균(4.5~5.5%) 대비 양호한 수준`);
    } else if (numCapRate >= 4.5) {
      calloutBullets.push(`• 수익률 ${numCapRate.toFixed(1)}%는 서울 소형빌딩 시장 평균 수준`);
    } else {
      calloutBullets.push(`• 수익률 ${numCapRate.toFixed(1)}%는 시장 평균 하회 — 토지가치 상승 또는 리모델링 후 임대료 증대 가능성 검토 필요`);
    }
  }

  // 공시지가 CAGR
  if (hasLandHistory && landPriceHistory.cagrPct != null) {
    if (landPriceHistory.cagrPct >= 3.0) {
      calloutBullets.push(`• ${landPriceHistory.history.length}년간 공시지가 연평균 ${landPriceHistory.cagrPct}% 상승 → 토지가치 보존력 확인`);
    } else if (landPriceHistory.cagrPct > 0) {
      calloutBullets.push(`• ${landPriceHistory.history.length}년간 공시지가 연평균 ${landPriceHistory.cagrPct}% 상승 (완만한 성장세)`);
    }
  }

  // 토지 비중
  if (landPriceHistory?.latestPricePerSqm > 0 && landAreaSqm > 0 && askingPrice > 0) {
    const landTotalValue = landPriceHistory.latestPricePerSqm * landAreaSqm;
    const landRatio = (landTotalValue / askingPrice) * 100;
    if (landRatio >= 60) {
      calloutBullets.push(`• 매매가 대비 토지비중 ${landRatio.toFixed(0)}% → 감가 리스크 낮은 토지 중심 자산`);
    }
  }

  if (calloutBullets.length > 0) {
    let calloutY = cardY + cardH + 0.15;
    const rawH = 0.20 + calloutBullets.length * 0.28;
    let calloutH = rawH;
    // 하단 안전 마진(SAFE_BOTTOM = 6.75) 클램프 가드: 푸터(6.94) 침범 및 슬라이드 바닥 이탈 방지
    if (calloutY + calloutH > SAFE_BOTTOM) {
      calloutH = Math.max(0.50, SAFE_BOTTOM - calloutY);
      if (calloutY + calloutH > SAFE_BOTTOM) {
        calloutY = SAFE_BOTTOM - calloutH;
      }
    }
    L.callout(slide, M, calloutY, CW, calloutH, 'info', '투자 판단 참고',
      calloutBullets.join('\n'));
  }

  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);

  return { slide, warnings };
}

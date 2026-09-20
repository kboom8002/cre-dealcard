import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR, NUM } from '../imlib';
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

/**
 * A23 — 투자수익률 산식 슬라이드 (Basic IM 전용)
 *
 * basic-im-guide.md §3.3 준수:
 * - 표면 임대수익률 공식 시각화 (분수식)
 * - As-Is / Stabilized 2열 비교
 * - ◇ 분석가정 배지
 * - 산출 공식을 그대로 노출 (숫자만 보여주고 끝내지 않음)
 */
export function buildA23YieldFormula(input: ArchetypeInput): ArchetypeOutput {
  const slide = L.light(input.pres);
  const warnings: string[] = [];

  L.head(slide, input.slideNum, input.data.kicker || 'YIELD', input.data.title || '투자수익률 분석');

  const d = input.data;
  const annualRent = d.annualRent ?? 0;         // 연간 임대료 (원)
  const totalDeposit = d.totalDeposit ?? 0;     // 승계 보증금 (원)
  const askingPrice = d.askingPrice ?? 0;        // 매매가 (원)
  const vacancyPct = d.vacancyPct ?? 0;          // 공실률 (%)
  const capRateAsIs = d.capRateAsIs ?? 0;        // 현재 Cap Rate (%)
  const capRateStabilized = d.capRateStabilized; // 안정화 Cap Rate (%)
  const assumption = d.stabilizedAssumption ?? '공실층을 인근 시세 수준으로 임대 가정';

  // ── 산식 (fraction) 박스 ──
  const formulaBoxY = 1.50;
  const formulaBoxH = 1.30;

  // 배경 박스
  slide.addShape('roundRect', {
    x: M, y: formulaBoxY, w: CW, h: formulaBoxH,
    fill: { color: 'F7FAFC' },
    line: { color: C.line, width: 0.75 },
    rectRadius: 0.08,
  });

  // 라벨
  slide.addText('표면 임대수익률  =', {
    x: M + 0.40, y: formulaBoxY + 0.15, w: 3.5, h: 0.90,
    color: C.ink, fontFace: KR, fontSize: 16, bold: true, valign: 'middle',
  });

  // 분자
  slide.addText('연간 임대료 합계 (관리비 제외)', {
    x: M + 4.2, y: formulaBoxY + 0.15, w: 5.0, h: 0.40,
    color: C.ink, fontFace: KR, fontSize: 13, bold: true,
    align: 'center', valign: 'bottom',
  });

  // 분수선
  slide.addShape('line', {
    x: M + 4.4, y: formulaBoxY + 0.60, w: 4.6, h: 0,
    line: { color: C.brass, width: 2.0 },
  });

  // 분모
  slide.addText('매매가  −  승계 보증금 합계', {
    x: M + 4.2, y: formulaBoxY + 0.65, w: 5.0, h: 0.40,
    color: C.ink, fontFace: KR, fontSize: 13, bold: true,
    align: 'center', valign: 'top',
  });

  // ── 0으로 나누기 및 이상치 방어 (Division by Zero Defense) ──
  if (askingPrice > 0 && totalDeposit >= askingPrice) {
    warnings.push('[A23] 승계 보증금이 매매가 이상입니다 (실질 투자금 <= 0)');
  }

  // 수치 표기 (우측) — D45: 폭 확대하여 100억+ 금액 줄바꿈 방지
  const fmtManwon = (v: number) => {
    if (!isFinite(v) || isNaN(v)) return '0원';
    if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억원`;
    return `${Math.round(v / 10000).toLocaleString()}만원`;
  };

  slide.addText([
    { text: `${fmtManwon(annualRent)}`, options: { color: C.brass, bold: true, fontSize: 11 } },
    { text: ` ÷ (${fmtManwon(askingPrice)} − ${fmtManwon(totalDeposit)})`, options: { color: C.mute, fontSize: 11 } },
  ], {
    x: M + CW - 3.10, y: formulaBoxY + 0.15, w: 2.95, h: 0.90,
    fontFace: KR, valign: 'middle', align: 'right',
  });

  // ── As-Is / Stabilized 2열 비교 카드 ──
  const cardY = 3.10;
  const cardH = 3.35;
  const hasStabilized = capRateStabilized != null && Number.isFinite(capRateStabilized) && capRateStabilized > 0;
  const cardW = hasStabilized ? (CW - 0.30) / 2 : CW;

  // Helper: 단일 수익률 카드
  const renderCard = (x: number, label: string, isStabilized: boolean, capRate: number) => {
    // 카드 배경
    slide.addShape('roundRect', {
      x, y: cardY, w: cardW, h: cardH,
      fill: { color: 'FFFFFF' },
      line: { color: isStabilized ? C.brass : C.line, width: isStabilized ? 1.5 : 1 },
      rectRadius: 0.08,
    });

    // 헤더 영역
    const badgeW = isStabilized ? 1.80 : 1.40;
    slide.addShape('roundRect', {
      x: x + 0.20, y: cardY + 0.20, w: badgeW, h: 0.36,
      fill: { color: isStabilized ? C.brassT : C.tint },
      rectRadius: 0.04,
    });
    slide.addText(label, {
      x: x + 0.20, y: cardY + 0.20, w: badgeW, h: 0.36,
      color: isStabilized ? C.brassD : C.ink,
      fontFace: KR, fontSize: 10, bold: true,
      align: 'center', valign: 'middle',
    });

    if (isStabilized) {
      slide.addText('◇ 분석가정', {
        x: x + badgeW + 0.30, y: cardY + 0.20, w: 1.50, h: 0.36,
        color: C.brass, fontFace: KR, fontSize: 9, italic: true,
        valign: 'middle',
      });
    }

    // 세부 수치 행
    let rowY = cardY + 0.75;
    const rowH = 0.44;
    const labelX = x + 0.30;
    const valueX = x + cardW - 2.30;

    const renderRow = (lbl: string, value: string) => {
      slide.addText(lbl, {
        x: labelX, y: rowY, w: 3.0, h: rowH,
        color: C.mute, fontFace: KR, fontSize: 11, valign: 'middle',
      });
      slide.addText(value, {
        x: valueX, y: rowY, w: 2.0, h: rowH,
        color: C.ink, fontFace: NUM, fontSize: 12, bold: true,
        align: 'right', valign: 'middle',
      });
      rowY += rowH;
    };

    const rawRent = isStabilized && capRateStabilized
      ? d.stabilizedRent ?? d.normalizedRent ?? ((askingPrice - totalDeposit) * (capRateStabilized / 100))
      : annualRent;
    const rentForCard = isFinite(rawRent) && !isNaN(rawRent) ? rawRent : 0;

    renderRow('연간 임대료', fmtManwon(rentForCard));
    renderRow('승계 보증금', fmtManwon(totalDeposit));
    renderRow('매매가', fmtManwon(askingPrice));

    // Cap Rate 강조
    rowY += 0.12;
    slide.addShape('roundRect', {
      x: x + 0.20, y: rowY, w: cardW - 0.40, h: 0.65,
      fill: { color: isStabilized ? C.brass : C.ink },
      rectRadius: 0.06,
    });
    slide.addText('Cap Rate', {
      x: x + 0.40, y: rowY, w: 2.5, h: 0.65,
      color: 'FFFFFF', fontFace: KR, fontSize: 12, bold: true, valign: 'middle',
    });
    const rawCapRate = typeof capRate === 'number' ? capRate : parseFloat(String(capRate));
    const numCapRate = Number.isFinite(rawCapRate) && rawCapRate > 0 ? rawCapRate : 0;
    slide.addText(`${numCapRate.toFixed(2)}%`, {
      x: x + cardW - 2.60, y: rowY, w: 2.20, h: 0.65,
      color: 'FFFFFF', fontFace: NUM, fontSize: 22, bold: true,
      align: 'right', valign: 'middle',
    });
  };

  // As-Is 카드
  renderCard(M, 'As-Is (현재)', false, capRateAsIs);

  // Stabilized 카드 (안정화 수익률이 있을 때만)
  if (capRateStabilized != null && Number.isFinite(capRateStabilized) && capRateStabilized > 0) {
    renderCard(M + cardW + 0.30, 'Stabilized (안정화)', true, capRateStabilized);
  } else {
    // Stabilized 없으면 As-Is 카드를 넓게
    warnings.push('[A23] 안정화 수익률 데이터 없음 — As-Is만 렌더링');
  }

  // ── 가정 설명 (하단) ──
  if (capRateStabilized != null && Number.isFinite(capRateStabilized) && capRateStabilized > 0) {
    slide.addText(`가정: ${assumption}`, {
      x: M, y: 6.50, w: CW, h: 0.26,
      color: C.mute, fontFace: KR, fontSize: 9, italic: true,
    });
  }

  L.foot(slide, input.slideNum, input.docno);

  return { slide, warnings };
}

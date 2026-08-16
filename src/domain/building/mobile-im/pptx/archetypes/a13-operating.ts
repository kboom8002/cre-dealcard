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

export function buildA13Operating(input: ArchetypeInput): ArchetypeOutput {
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '운영 지표 (KPI Overview)');

  const lw = 7.30;
  const gap = 0.40;
  const rx = M + lw + gap;
  const rw = CW - lw - gap;

  // 좌측: 부제목
  if (input.data.subtitle) {
    L.sub(slide, M, 1.45, lw, input.data.subtitle);
  }

  // 좌측: KPI 상세 행 목록
  const kpiRows: [string, string][] = input.data.kpiRows || [];
  if (kpiRows.length > 0) {
    L.rows(slide, M, input.data.subtitle ? 1.85 : 1.55, lw, kpiRows.slice(0, 7), { rh: 0.46, fs: 13.5 });
  }

  // 좌측 하단: 운영 하이라이트 콜아웃
  const highlightY = 5.20;
  L.callout(
    slide,
    M,
    highlightY,
    lw,
    1.35,
    'info',
    '운영 안정성 진단',
    input.data.highlight || '안정적인 장기 임차 구조와 검증된 운영사 네트워크를 기반으로 지속 가능한 고수익 운영 성과를 확보하고 있습니다.'
  );

  // 수직 구분선
  slide.addShape('line' as any, {
    x: M + lw + gap / 2,
    y: 1.50,
    w: 0,
    h: 5.2,
    line: { color: C.brass, width: 0.7 },
  });

  // 우측: 3대 핵심 KPI 스탯 카드
  const statCards = input.data.statCards || [];
  let sy = 1.68;
  const cardH = statCards.length >= 3 ? 1.45 : 1.80;
  const cardGap = 0.20;

  statCards.slice(0, 3).forEach((card: any) => {
    L.stat(slide, rx, sy, rw, card.label, card.value, card.unit || '', '', { h: cardH });
    sy += cardH + cardGap;
  });

  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}

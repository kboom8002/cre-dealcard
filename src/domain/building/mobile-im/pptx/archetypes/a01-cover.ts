import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, W, KR, NUM, CD } from '../imlib';
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
 * A1 — 표지 (dark)
 * §7 A1 스펙 정확 구현
 */
export function buildA01Cover(input: ArchetypeInput): ArchetypeOutput {
  const slide = L.dark(input.pres);
  const warnings: string[] = [];
  
  // ── 매스 3개 (우상단 장식 블록) ──
  slide.addShape('rect' as any, {
    x: 9.05, y: 0, w: 1.55, h: 4.42,
    fill: { color: 'FFFFFF', transparency: 93 },
  });
  slide.addShape('rect' as any, {
    x: 10.70, y: 0.95, w: 1.25, h: 3.47,
    fill: { color: 'FFFFFF', transparency: 95 },
  });
  slide.addShape('rect' as any, {
    x: 12.05, y: 1.85, w: 1.28, h: 2.57,
    fill: { color: C.brass, transparency: 80 },
  });
  
  // ── 워드마크: CRE(white) + DEAL(brass) ──
  slide.addText([
    { text: 'CRE', options: { color: 'FFFFFF', fontFace: NUM, fontSize: 15, bold: true } },
    { text: 'DEAL', options: { color: C.brass, fontFace: NUM, fontSize: 15, bold: true } },
  ], { x: M, y: 0.52, w: 3, h: 0.4, margin: 0 });
  
  // 회사명
  const companyName = input.data.companyName || '';
  if (companyName) {
    slide.addText(companyName, {
      x: M, y: 0.86, w: 6, h: 0.24,
      fontSize: 9.5, color: '6B7885', fontFace: KR, margin: 0,
    });
  }
  
  // ── kicker ──
  slide.addText(input.data.kicker || 'INVESTMENT MEMORANDUM', {
    x: M, y: 2.22, w: 8, h: 0.3,
    fontSize: 10, bold: true, color: C.brass,
    fontFace: NUM, charSpacing: 2.5, margin: 0,
  });
  
  // ── 대제목 (40pt bold white) ──
  slide.addText(input.data.title || '투자설명서', {
    x: M, y: 2.52, w: 8, h: 0.80,
    fontSize: 40, bold: true, color: 'FFFFFF',
    fontFace: KR, margin: 0,
  });
  
  // ── 부제 (14pt, A8B2BC) ──
  const subtitle = input.data.subtitle || input.data.assetType || '';
  if (subtitle) {
    slide.addText(subtitle, {
      x: M, y: 3.38, w: 8, h: 0.4,
      fontSize: 14, color: 'A8B2BC',
      fontFace: KR, margin: 0,
    });
  }
  
  // ── 태그 2~3개 (알약 형태) ──
  let tagX = M;
  const tags = input.data.tags || [];
  tags.forEach((tag: string) => {
    if (!tag) return;
    const tw = Math.max(1.2, tag.length * 0.16 + 0.4);
    L.tag(slide, tagX, 3.92, tw, 0.34, tag, 'FFFFFF', CD.block, 10);
    tagX += tw + 0.12;
  });
  
  // ── 강조 박스 (가격대) ──
  const priceBand = input.data.priceBand || '';
  if (priceBand) {
    slide.addShape('roundRect' as any, {
      x: M, y: 4.86, w: CW, h: 1.34,
      rectRadius: 0.04,
      fill: { color: CD.accentBg },
      line: { color: CD.accentBorder, width: 1 },
    });
    slide.addText(priceBand, {
      x: M + 0.28, y: 5.08, w: CW - 0.56, h: 0.90,
      fontSize: 22, bold: true, color: CD.accentText,
      fontFace: KR, margin: 0, valign: 'middle',
    });
  }
  
  // ── 발행 정보 ──
  const broker = input.data.brokerName || '';
  const infoText = [broker, companyName, input.docno].filter(Boolean).join('  |  ');
  slide.addText(infoText, {
    x: M, y: 6.60, w: CW, h: 0.3,
    fontSize: 8.5, color: '5A6774',
    fontFace: KR, margin: 0,
  });
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, true);
  L.foot(slide, input.slideNum, input.docno, true);

  return { slide, warnings };
}

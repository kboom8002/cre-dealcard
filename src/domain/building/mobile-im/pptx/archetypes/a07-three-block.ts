import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR, NUM, CD, THEME_META } from '../imlib';
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

export function buildA07ThreeBlock(input: ArchetypeInput): ArchetypeOutput {
  const onDark = input.data.onDark === true;
  const slide = onDark ? L.dark(input.pres) : L.light(input.pres);
  const warnings: string[] = [];
  
  if (onDark) {
    L.headD(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  } else {
    L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  }
  
  const gap = 0.30;
  const w = L.col(3, gap);
  const h = 3.95;
  const y = 1.55;
  
  const labelColor = onDark ? C.brass : C.brassD;
  const valColor = onDark ? 'FFFFFF' : C.ink;
  const descColor = onDark ? CD.body : C.body;
  
  const blocks = input.data.blocks || [];
  blocks.forEach((b: any, i: number) => {
    if (i > 2) return;
    const x = L.colX(i, w, gap);
    
    L.card(slide, x, y, w, h, { onDark });
    
    // Brass top border
    if (THEME_META.layoutStyle !== 'dramatic') {
      slide.addShape('rect' as any, { x, y, w, h: 0.05, fill: { color: C.brass } });
    }
    
    // 1. 카테고리 헤더
    const cleanLabel = (b.label || `실사 영역 ${i + 1}`).replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE00}-\u{FE0F}🟢🔵🔶💡🚇🛣️🚗🏥🏢☕⚖️📋🔒⚠️🔍🛡️]/gu, '').trim();
    slide.addText(cleanLabel, {
      x: x + 0.25, y: y + 0.22, w: w - 0.5, h: 0.32,
      fontFace: KR, fontSize: 13.5, bold: true, color: labelColor, margin: 0
    });

    // 2. 핵심 요약 / 상태 (1줄 또는 2줄)
    const rawVal = (b.value || '실사 완료').replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE00}-\u{FE0F}🟢🔵🔶💡🚇🛣️🚗🏥🏢☕⚖️📋🔒⚠️🔍🛡️]/gu, '').trim();
    const valText = rawVal.slice(0, 36);
    slide.addText(valText, {
      x: x + 0.25, y: y + 0.54, w: w - 0.5, h: 0.44,
      fontFace: KR, fontSize: 13.5, bold: true, color: valColor, margin: 0,
      fit: 'shrink' as any,
    });

    // 3. 세부 불릿 본문 (PptxGenJS 네이티브 행잉 인덴트 및 단락 간 여백 적용)
    const descText = b.description || '';
    if (descText) {
      let lines = descText.split(/\n+/).map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      if (lines.length === 1 && lines[0].length > 40 && (lines[0].includes('. ') || lines[0].includes('; '))) {
        lines = lines[0].split(/(?<=[.;])\s+/).filter(Boolean);
      }
      const textRuns = lines.map((line: string, lineIdx: number) => {
        const cleanLine = line
          .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE00}-\u{FE0F}🟢🔵🔶💡🚇🛣️🚗🏥🏢☕⚖️📋🔒⚠️🔍🛡️]/gu, '')
          .replace(/^[•·\-*]+\s*/, '')
          .trim();
        return {
          text: cleanLine,
          options: {
            bullet: { code: '2022' },
            fontSize: 12,
            color: descColor,
            fontFace: KR,
            breakLine: true,
            indentLevel: 0,
            lineSpacingMultiple: 1.25,
            paraSpaceBefore: lineIdx > 0 ? 8 : 0,
            margin: [0, 0, 0, 0],
          }
        };
      });

      if (textRuns.length > 0) {
        slide.addText(textRuns as any, {
          x: x + 0.25, y: y + 1.05, w: w - 0.5, h: h - 1.15,
          valign: 'top', margin: 0
        });
      }
    }
  });
  
  if (blocks.length === 0) {
    // I-05 fix: 빈 프레임 3개 대신 단일 informational callout 표시
    L.callout(slide, M, y, CW, 2.0, 'info', '리스크 검토',
      '현재 리스크 분석에 필요한 데이터가 충분하지 않습니다. 건축물대장, 등기부등본 등 공적 장부가 수집되면 자동으로 리스크 항목이 분석됩니다.');
    warnings.push('리스크 블록 데이터 없음 — 안내 카드 표시');
  }

  // 4. 하단 안내 바 (푸터 y: 7.05와 충돌하지 않도록 y: 5.65, h: 0.65로 컴팩트하게 배치)
  if (input.data.bottomBar) {
    const barY = 5.68;
    const barH = 0.68;
    const barBg = onDark ? CD.block : C.tint;
    const barFg = onDark ? 'FFFFFF' : C.ink;
    L.card(slide, M, barY, CW, barH, { fill: barBg, onDark });
    const cleanBottomText = (input.data.bottomBar.text || '')
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE00}-\u{FE0F}🟢🔵🔶💡🚇🛣️🚗🏥🏢☕⚖️📋🔒⚠️🔍🛡️]/gu, '')
      .trim();
    slide.addText(cleanBottomText, {
      x: M + 0.25, y: barY, w: CW - 0.5, h: barH,
      fontFace: KR, fontSize: 12, color: barFg, valign: 'middle', margin: 0
    });
  }
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, onDark);
  L.foot(slide, input.slideNum, input.docno, onDark);
  return { slide, warnings };
}

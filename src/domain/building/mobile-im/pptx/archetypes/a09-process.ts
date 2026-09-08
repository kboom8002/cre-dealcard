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

export function buildA09Process(input: ArchetypeInput): ArchetypeOutput {
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  let steps = input.data.steps || [];
  if (!Array.isArray(steps) || steps.length === 0) {
    steps = [
      { stepNum: '01', title: '관심 표명 및 상담', description: '담당 중개사를 통한 매입 의향 확인 및 기초 브리핑 자료 수령' },
      { stepNum: '02', title: '비밀유지협약(NDA)', description: '임대차 계약서 원본, 정밀 도면, 관리비 정산서 등 상세 자료 열람' },
      { stepNum: '03', title: '현장 실사(DD)', description: '건물 구조, 승강기·주차 설비, 누수 및 실사용 공간 직접 점검' },
      { stepNum: '04', title: '매수의향서(LOI) 및 계약', description: '매매 대금, 잔금 일정, 명도 특약 조율 후 최종 매매계약 체결' },
    ];
  }
  const n = Math.min(steps.length, 4);
  const gap = 0.4;
  const w = L.col(n, gap);
  const y = 1.72;
  const h = 3.5;
  
  steps.forEach((s: any, i: number) => {
    if (i >= n) return;
    const x = L.colX(i, w, gap);
    
    // Card background
    L.card(slide, x, y, w, h);
    
    // Brass numbered circle (0.48" — same as A10 closing)
    const cx = x + 0.24;
    const cy = y + 0.24;
    const circleSize = 0.48;
    slide.addShape('ellipse' as any, { x: cx, y: cy, w: circleSize, h: circleSize, fill: { color: C.brass } });
    const rawNum = s.stepNum || String(i+1).padStart(2, '0');
    const numStr = rawNum.replace(/[^0-9]/g, '').padStart(2, '0').slice(0, 2);
    slide.addText(numStr, { x: cx, y: cy, w: circleSize, h: circleSize, align: 'center', valign: 'middle', fontSize: 14, bold: true, color: 'FFFFFF', fontFace: NUM, margin: 0 });
    
    // Title (with step number prefix for clarity)
    const stepTitle = s.title || `${i + 1}단계`;
    slide.addText(`${i + 1}단계`, { x: x + 0.24, y: y + 0.8, w: w - 0.48, h: 0.4, fontFace: KR, fontSize: 16, bold: true, color: C.ink });
    
    // Description (includes original title content if different from step number)
    const descParts = [s.title && s.title !== `${i + 1}단계` ? s.title : '', s.description].filter(Boolean);
    const descText = descParts.join('\n') || '';
    slide.addText(descText, { x: x + 0.24, y: y + 1.3, w: w - 0.48, h: h - 1.5, fontFace: KR, fontSize: 11, color: C.body, valign: 'top' });
    
    // Tag
    if (s.tag) {
      L.tag(slide, x + 0.24, y + h - 0.5, 1.45, 0.28, s.tag, C.ink, C.line2, 9);
    }
    
    // Arrow between steps
    if (i < n - 1) {
      slide.addShape('rightArrow' as any, {
        x: x + w + 0.1,
        y: y + h / 2 - 0.15,
        w: 0.2,
        h: 0.3,
        fill: { color: C.line },
        line: { color: C.mute, width: 0.5 }
      });
    }
  });
  
  if (input.data.bottomInfo) {
    slide.addText(input.data.bottomInfo, { x: M, y: y + h + 0.3, w: CW, h: 0.5, fontFace: KR, fontSize: 11, color: C.mute });
  }
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}

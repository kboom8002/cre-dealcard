import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR, NUM, CD } from '../imlib';
import { MOBILE_IM_STANDARD_DISCLAIMER } from '../../guardrails';
import type { ProvenanceKind } from '../imlib';
import { optimizeImageForPptx } from '../utils/image-optimizer';

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
 * A10 — 마감 · 표기 기준 (dark)
 * §7 A10 스펙 정확 구현
 */
export async function buildA10Closing(input: ArchetypeInput): Promise<ArchetypeOutput> {
  const slide = L.dark(input.pres);
  const warnings: string[] = [];
  L.headD(slide, input.slideNum, input.data.kicker || 'DISCLAIMER', input.data.title || '표기 기준 및 면책');
  
  // ── 좌측: provenance 배지 리스트 ──
  L.sub(slide, M, 1.66, 6.0, '데이터 출처 표기', true);
  
  const badges = input.data.badges || [];
  badges.forEach((b: any, i: number) => {
    const by = 2.02 + i * 0.62;
    
    // 배지 라운드 사각형
    slide.addShape('roundRect' as any, {
      x: M, y: by, w: 1.55, h: 0.32,
      rectRadius: 0.04,
      fill: { color: CD.block },
    });
    slide.addText(b.label || '', {
      x: M, y: by, w: 1.55, h: 0.32,
      align: 'center', valign: 'middle',
      fontFace: KR, fontSize: 9.5, bold: true, color: 'FFFFFF', margin: 0,
    });
    
    // 설명
    slide.addText(b.description || '', {
      x: M + 1.72, y: by - 0.06, w: 3.90, h: 0.44,
      fontFace: KR, fontSize: 10, color: CD.body, margin: 0,
      valign: 'middle',
    });
    
    // 점수
    if (b.score) {
      slide.addText(b.score, {
        x: M + 5.66, y: by, w: 1.0, h: 0.32,
        align: 'right', valign: 'middle',
        fontFace: NUM, fontSize: 12, bold: true, color: 'FFFFFF', margin: 0,
      });
    }
  });
  
  // ── 우측: 면책 박스 ──
  const rx = 7.10;
  const rw = 5.61;
  
  L.sub(slide, rx, 1.66, rw, '면책 조항', true);
  
  // 면책 배경 카드
  slide.addShape('roundRect' as any, {
    x: rx, y: 2.02, w: rw, h: 2.86,
    rectRadius: 0.04,
    fill: { color: C.ink2 },
  });
  
  const disclaimerText = input.data.disclaimer || MOBILE_IM_STANDARD_DISCLAIMER;
  slide.addText(disclaimerText, {
    x: rx + 0.24, y: 2.20, w: rw - 0.48, h: 2.50,
    fontFace: KR, fontSize: 9.3, color: CD.mute,
    lineSpacingMultiple: 1.28, margin: 0, valign: 'top',
  });
  
  // ── 하단 푸터 바 ──
  slide.addShape('rect' as any, {
    x: M, y: 5.72, w: CW, h: 0.70,
    fill: { color: CD.accentBg },
  });
  const footerText = input.data.footerText || '본 자료의 모든 수치는 예비 검토용이며 실사 및 전문가 검증이 필요합니다.';
  slide.addText(footerText, {
    x: M + 0.24, y: 5.82, w: CW - 0.48, h: 0.50,
    fontFace: KR, fontSize: 10, color: CD.accentText, margin: 0,
    valign: 'middle',
  });
  
  // Phase 4: 로고 이미지 삽입 (푸터 바 우측)
  if (input.data?.logoUrl) {
    try {
      const logo = await optimizeImageForPptx(input.data.logoUrl as string, 200, 90);
      if (logo) {
        slide.addImage({
          data: logo.base64,
          x: M + CW - 1.44, y: 5.78,
          w: 1.20, h: 0.40,
          sizing: { type: 'contain', w: 1.20, h: 0.40 },
        });
      }
    } catch {
      warnings.push('로고 이미지 로딩 실패 (closing)');
    }
  }

  if (input.watermarkText) L.watermark(slide, input.watermarkText, true);
  L.foot(slide, input.slideNum, input.docno, true);
  return { slide, warnings };
}

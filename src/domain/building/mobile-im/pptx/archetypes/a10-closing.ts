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
 * A10 — 마감 · 표기 기준 · 다음 단계 (통합 dark 슬라이드)
 * A09 Process + A10 Closing 통합 — 깔끔한 단일 마감 슬라이드
 */
export async function buildA10Closing(input: ArchetypeInput): Promise<ArchetypeOutput> {
  const slide = L.dark(input.pres);
  const warnings: string[] = [];
  L.headD(slide, input.slideNum, input.data.kicker || 'DISCLAIMER', input.data.title || '표기 기준 및 면책');
  
  // ── 상단: 다음 단계 (프로세스 3단계 가로 바) ──
  const processSteps = [
    { num: '01', title: '관심 표명', desc: '담당 중개사에게 초기 관심 표명 및 상담 요청' },
    { num: '02', title: 'NDA 체결', desc: '비밀유지계약 후 상세 임대차·재무 자료 제공' },
    { num: '03', title: '현장 실사', desc: '건물 컨디션 및 설비 직접 확인 후 의향서(LOI) 제출' },
  ];

  const stepGap = 0.16;
  const stepW = L.col(3, stepGap);
  const stepY = 1.60;
  const stepH = 0.72;

  processSteps.forEach((s, i) => {
    const x = L.colX(i, stepW, stepGap);
    
    // 배경
    slide.addShape('roundRect' as any, {
      x, y: stepY, w: stepW, h: stepH,
      rectRadius: 0.04,
      fill: { color: CD.block },
    });
    
    // 번호 원
    slide.addShape('ellipse' as any, {
      x: x + 0.12, y: stepY + 0.12, w: 0.48, h: 0.48,
      fill: { color: C.brass },
    });
    slide.addText(s.num, {
      x: x + 0.12, y: stepY + 0.12, w: 0.48, h: 0.48,
      align: 'center', valign: 'middle',
      fontFace: NUM, fontSize: 14, bold: true, color: 'FFFFFF', margin: 0,
    });
    
    // 타이틀 + 설명 (번호 옆에 인라인)
    slide.addText(s.title, {
      x: x + 0.72, y: stepY + 0.10, w: stepW - 0.84, h: 0.26,
      fontFace: KR, fontSize: 11, bold: true, color: 'FFFFFF', margin: 0,
    });
    slide.addText(s.desc, {
      x: x + 0.72, y: stepY + 0.36, w: stepW - 0.84, h: 0.28,
      fontFace: KR, fontSize: 8.5, color: CD.mute, margin: 0, valign: 'top',
    });
    
    // 화살표 (마지막 제외)
    if (i < 2) {
      slide.addText('→', {
        x: x + stepW, y: stepY + 0.15, w: stepGap, h: 0.42,
        align: 'center', valign: 'middle',
        fontFace: KR, fontSize: 16, color: C.brass, margin: 0,
      });
    }
  });

  // ── 좌측: provenance 배지 리스트 (점수 제거, 아이콘만) ──
  const sectionY = stepY + stepH + 0.30;
  L.sub(slide, M, sectionY, 6.0, '데이터 출처 표기', true);
  
  const badges = input.data.badges || [];
  badges.forEach((b: any, i: number) => {
    const by = sectionY + 0.36 + i * 0.52;
    
    // 배지 라운드 사각형
    slide.addShape('roundRect' as any, {
      x: M, y: by, w: 1.40, h: 0.32,
      rectRadius: 0.04,
      fill: { color: CD.block },
    });
    slide.addText(b.label || '', {
      x: M, y: by, w: 1.40, h: 0.32,
      align: 'center', valign: 'middle',
      fontFace: KR, fontSize: 8.5, bold: true, color: 'FFFFFF', margin: 0,
    });
    
    // 설명 (점수 제거 — 사용자에게 불필요)
    slide.addText(b.description || '', {
      x: M + 1.56, y: by - 0.02, w: 4.20, h: 0.36,
      fontFace: KR, fontSize: 9, color: CD.body, margin: 0,
      valign: 'middle',
    });
  });
  
  // ── 우측: 면책 박스 ──
  const rx = 7.10;
  const rw = 5.61;
  
  L.sub(slide, rx, sectionY, rw, '면책 조항', true);
  
  const disclaimerText = input.data.disclaimer || MOBILE_IM_STANDARD_DISCLAIMER;
  const maxCardH = 6.20 - (sectionY + 0.36);
  const cardH = Math.max(1.80, Math.min(maxCardH, 0.5 + Math.ceil(disclaimerText.length / 55) * 0.26));

  // 면책 배경 카드
  slide.addShape('roundRect' as any, {
    x: rx, y: sectionY + 0.36, w: rw, h: cardH,
    rectRadius: 0.04,
    fill: { color: C.ink2 },
  });
  
  slide.addText(disclaimerText, {
    x: rx + 0.20, y: sectionY + 0.48, w: rw - 0.40, h: cardH - 0.24,
    fontFace: KR, fontSize: 8.5, color: CD.mute,
    lineSpacingMultiple: 1.28, margin: 0, valign: 'top',
  });
  
  // ── 하단 푸터 바 ──
  const footerY = 6.30;
  slide.addShape('rect' as any, {
    x: M, y: footerY, w: CW, h: 0.50,
    fill: { color: CD.accentBg },
  });
  const footerText = input.data.footerText || '본 자료의 모든 수치는 예비 검토용이며, 상세 실사 자료 및 비밀 상담은 담당 전문 중개사를 통해 제공됩니다.';
  slide.addText(footerText, {
    x: M + 0.20, y: footerY + 0.05, w: CW - 0.40, h: 0.40,
    fontFace: KR, fontSize: 9, color: CD.accentText, margin: 0,
    valign: 'middle',
  });
  
  // Phase 4: 로고 이미지 삽입 (푸터 바 우측)
  if (input.data?.logoUrl) {
    try {
      const logo = await optimizeImageForPptx(input.data.logoUrl as string, 200, 90);
      if (logo) {
        slide.addImage({
          data: logo.base64,
          x: M + CW - 1.44, y: footerY + 0.04,
          w: 1.20, h: 0.36,
          sizing: { type: 'contain', w: 1.20, h: 0.36 },
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

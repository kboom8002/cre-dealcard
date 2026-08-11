import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, W, KR, TITLE_KR, NUM, CD, THEME_META } from '../imlib';
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

// ═══════════════════════════════════════════════════════
// 커버 레이아웃 팩토리 — coverStyle에 따라 완전히 다른 시각 경험
// ═══════════════════════════════════════════════════════

/** institutional_masses — 우상단 매스 3개 + 황동 액센트 (golden_institutional 기본) */
function coverInstitutionalMasses(slide: any, input: ArchetypeInput): void {
  // 매스 3개 (우상단 장식 블록)
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

  // 워드마크
  slide.addText([
    { text: 'CRE', options: { color: 'FFFFFF', fontFace: NUM, fontSize: 15, bold: true } },
    { text: 'DEAL', options: { color: C.brass, fontFace: NUM, fontSize: 15, bold: true } },
  ], { x: M, y: 0.52, w: 3, h: 0.4, margin: 0 });

  renderCommonCoverContent(slide, input, 2.22);
}

/** split — 좌 콘텐츠 / 우 컬러 패널 분할 (credeal_signature) */
function coverSplit(slide: any, input: ArchetypeInput): void {
  // 우측 액센트 패널 (전체 높이)
  slide.addShape('rect' as any, {
    x: 8.50, y: 0, w: 4.833, h: 7.5,
    fill: { color: C.brass },
  });

  // 패널 내 대각 장식
  slide.addShape('rect' as any, {
    x: 9.20, y: 0.60, w: 3.60, h: 6.30,
    fill: { color: C.ink, transparency: 88 },
    rotate: 2,
  });

  // 워드마크 (좌측)
  slide.addText([
    { text: 'CRE', options: { color: 'FFFFFF', fontFace: NUM, fontSize: 15, bold: true } },
    { text: 'DEAL', options: { color: C.brass, fontFace: NUM, fontSize: 15, bold: true } },
  ], { x: M, y: 0.52, w: 3, h: 0.4, margin: 0 });

  // 우측 패널에 태그라인
  slide.addText(THEME_META.companyTagline, {
    x: 9.00, y: 5.80, w: 3.80, h: 0.4,
    fontSize: 10, color: C.ink, fontFace: KR, margin: 0, align: 'center',
  });

  renderCommonCoverContent(slide, input, 2.22);
}

/** hero_dark — 전면 다크, 골드 라인 장식, 대형 타이포 (executive_gold) */
function coverHeroDark(slide: any, input: ArchetypeInput): void {
  // 상단 액센트 라인 (3px)
  slide.addShape('rect' as any, {
    x: 0, y: 0, w: W, h: 0.05,
    fill: { color: C.brass },
  });

  // 하단 액센트 라인
  slide.addShape('rect' as any, {
    x: 0, y: 7.45, w: W, h: 0.05,
    fill: { color: C.brass },
  });

  // 중앙 대형 액센트 프레임
  slide.addShape('rect' as any, {
    x: M, y: 1.80, w: CW, h: 3.40,
    fill: { color: C.brass, transparency: 92 },
    line: { color: C.brass, width: 1.5 },
  });

  // 워드마크 (중앙 정렬)
  slide.addText([
    { text: 'CRE', options: { color: 'FFFFFF', fontFace: NUM, fontSize: 18, bold: true } },
    { text: 'DEAL', options: { color: C.brass, fontFace: NUM, fontSize: 18, bold: true } },
  ], { x: M, y: 0.40, w: CW, h: 0.5, margin: 0, align: 'center' });

  renderCommonCoverContent(slide, input, 2.10, true);
}

/** corporate_card — 중앙 카드 위에 콘텐츠 (corporate_clean) */
function coverCorporateCard(slide: any, input: ArchetypeInput): void {
  // 중앙 카드 배경
  slide.addShape('roundRect' as any, {
    x: 1.50, y: 1.20, w: 10.33, h: 5.10,
    rectRadius: 0.12,
    fill: { color: CD.card },
    line: { color: CD.border, width: 0.5 },
  });

  // 카드 상단 액센트 바
  slide.addShape('rect' as any, {
    x: 1.50, y: 1.20, w: 10.33, h: 0.06,
    fill: { color: C.brass },
  });

  // 워드마크 (카드 밖 상단)
  slide.addText([
    { text: 'CRE', options: { color: 'FFFFFF', fontFace: NUM, fontSize: 13, bold: true } },
    { text: 'DEAL', options: { color: C.brass, fontFace: NUM, fontSize: 13, bold: true } },
  ], { x: M, y: 0.40, w: 3, h: 0.4, margin: 0 });

  renderCommonCoverContent(slide, input, 1.70, false, 2.10);
}

/** obsidian_glow — 옵시디언 다크 + 글로우 원 (pro_dark_obsidian) */
function coverObsidianGlow(slide: any, input: ArchetypeInput): void {
  // 글로우 원 (중앙 우측)
  slide.addShape('ellipse' as any, {
    x: 8.00, y: 0.50, w: 6.00, h: 6.00,
    fill: { color: C.brass, transparency: 90 },
  });
  slide.addShape('ellipse' as any, {
    x: 9.00, y: 1.50, w: 4.00, h: 4.00,
    fill: { color: C.brass, transparency: 85 },
  });
  slide.addShape('ellipse' as any, {
    x: 9.80, y: 2.30, w: 2.40, h: 2.40,
    fill: { color: C.brass, transparency: 78 },
  });

  // 워드마크
  slide.addText([
    { text: 'CRE', options: { color: 'FFFFFF', fontFace: NUM, fontSize: 15, bold: true } },
    { text: 'DEAL', options: { color: C.brass, fontFace: NUM, fontSize: 15, bold: true } },
  ], { x: M, y: 0.52, w: 3, h: 0.4, margin: 0 });

  renderCommonCoverContent(slide, input, 2.22);
}

// ═══════════════════════════════════════════════════════
// 공통 커버 콘텐츠 (kicker, title, subtitle, tags, priceBand, info)
// ═══════════════════════════════════════════════════════

function renderCommonCoverContent(
  slide: any,
  input: ArchetypeInput,
  kickerY: number,
  centerAlign = false,
  contentX?: number,
): void {
  const x = contentX ?? M;
  const align = centerAlign ? 'center' as const : 'left' as const;
  const titleW = centerAlign ? CW : 8;

  // kicker
  slide.addText(input.data.kicker || 'INVESTMENT MEMORANDUM', {
    x, y: kickerY, w: titleW, h: 0.3,
    fontSize: 10, bold: true, color: C.brass,
    fontFace: NUM, charSpacing: 2.5, margin: 0, align,
  });

  // 대제목
  slide.addText(input.data.title || '투자설명서', {
    x, y: kickerY + 0.30, w: titleW, h: 0.80,
    fontSize: 40, bold: true, color: 'FFFFFF',
    fontFace: TITLE_KR, margin: 0, align,
  });

  // 부제
  const subtitle = input.data.subtitle || input.data.assetType || '';
  if (subtitle) {
    slide.addText(subtitle, {
      x, y: kickerY + 1.16, w: titleW, h: 0.4,
      fontSize: 14, color: CD.body,
      fontFace: KR, margin: 0, align,
    });
  }

  // 태그
  let tagX = x;
  const tags = input.data.tags || [];
  const tagY = kickerY + 1.70;
  tags.forEach((tag: string) => {
    if (!tag) return;
    const tw = Math.max(1.2, tag.length * 0.16 + 0.4);
    L.tag(slide, tagX, tagY, tw, 0.34, tag, 'FFFFFF', CD.block, 10);
    tagX += tw + 0.12;
  });

  // 강조 박스 (가격대)
  const priceBand = input.data.priceBand || '';
  if (priceBand) {
    slide.addShape('roundRect' as any, {
      x, y: tagY + 0.70, w: centerAlign ? CW : CW, h: 1.34,
      rectRadius: 0.04,
      fill: { color: CD.accentBg },
      line: { color: CD.accentBorder, width: 1 },
    });
    slide.addText(priceBand, {
      x: x + 0.28, y: tagY + 0.92, w: (centerAlign ? CW : CW) - 0.56, h: 0.90,
      fontSize: 22, bold: true, color: CD.accentText,
      fontFace: KR, margin: 0, valign: 'middle', align,
    });
  }

  // 회사명/발행 정보
  const companyName = input.data.companyName || '';
  if (companyName) {
    slide.addText(companyName, {
      x, y: kickerY - 1.36, w: 6, h: 0.24,
      fontSize: 9.5, color: CD.faint, fontFace: KR, margin: 0,
    });
  }

  const broker = input.data.brokerName || '';
  const infoText = [broker, companyName, input.docno].filter(Boolean).join('  |  ');
  slide.addText(infoText, {
    x: M, y: 6.60, w: CW, h: 0.3,
    fontSize: 8.5, color: CD.faint,
    fontFace: KR, margin: 0,
  });
}

// ═══════════════════════════════════════════════════════
// A1 — 표지 (dark) — coverStyle에 따라 레이아웃 분기
// ═══════════════════════════════════════════════════════

export async function buildA01Cover(input: ArchetypeInput): Promise<ArchetypeOutput> {
  const slide = L.dark(input.pres);
  const warnings: string[] = [];

  const style = THEME_META.coverStyle;

  switch (style) {
    case 'split':
      coverSplit(slide, input);
      break;
    case 'hero_dark':
      coverHeroDark(slide, input);
      break;
    case 'corporate_card':
      coverCorporateCard(slide, input);
      break;
    case 'obsidian_glow':
      coverObsidianGlow(slide, input);
      break;
    case 'institutional_masses':
    default:
      coverInstitutionalMasses(slide, input);
      break;
  }

  if (input.watermarkText) L.watermark(slide, input.watermarkText, true);
  L.foot(slide, input.slideNum, input.docno, true);

  let imgAdded = false;
  if (input.data?.coverImageUrl) {
    try {
      const img = await optimizeImageForPptx(input.data.coverImageUrl as string, 1280, 85);
      if (img) {
        const coverStyle = input.data?.coverStyle ?? THEME_META.coverStyle;
        if (coverStyle === 'split') {
          slide.addImage({ data: img.base64, x: 8.50, y: 0, w: 4.833, h: 7.5 });
        } else if (coverStyle === 'hero_dark') {
          slide.addImage({ data: img.base64, x: 0, y: 0, w: 13.333, h: 7.5 });
        } else {
          slide.addImage({ data: img.base64, x: 8.50, y: 0, w: 4.833, h: 7.5 });
        }
        imgAdded = true;
      }
    } catch {
      warnings.push('표지 이미지 최적화 실패, 기본 그래픽 폴백 사용');
    }
  }

  // Cover image fallback graphic — layered geometric pattern for visual depth
  if (!imgAdded && (THEME_META.coverStyle === 'split' || THEME_META.coverStyle === 'institutional_masses')) {
    // Base semi-transparent layer
    slide.addShape('rect' as any, {
      x: 8.50, y: 0, w: 4.833, h: 7.5,
      fill: { color: C.brass, transparency: 75 },
    });
    // Offset accent block (upper)
    slide.addShape('rect' as any, {
      x: 9.60, y: 0.80, w: 3.20, h: 2.60,
      fill: { color: C.brass, transparency: 50 },
    });
    // Offset accent block (lower)
    slide.addShape('rect' as any, {
      x: 8.90, y: 4.00, w: 3.80, h: 2.80,
      fill: { color: C.brass, transparency: 60 },
    });
    // Thin vertical accent line
    slide.addShape('line' as any, {
      x: 9.30, y: 0.40, w: 0, h: 6.70,
      line: { color: C.brass, width: 0.8 },
    });
  }

  // Phase 4: 중개법인 로고 삽입 (좌상단 브랜딩)
  if (input.data?.logoUrl) {
    try {
      const logo = await optimizeImageForPptx(input.data.logoUrl as string, 200, 90);
      if (logo) {
        // 로고: 좌상단 0.625" × 0.40" (표지 워드마크 위치)
        slide.addImage({
          data: logo.base64,
          x: M, y: 0.40,
          w: 1.20, h: 0.40,
          sizing: { type: 'contain', w: 1.20, h: 0.40 },
        });
      }
    } catch {
      warnings.push('로고 이미지 로딩 실패');
    }
  }

  return { slide, warnings };
}

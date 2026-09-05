import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, W, KR, TITLE_KR, NUM, CD, THEME_META } from '../imlib';
import type { ProvenanceKind } from '../imlib';
import { optimizeImageForPptx } from '../utils/image-optimizer';
import { coverCropRatio, CROP_WARN_THRESHOLD } from '../utils/layout-physics';

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
  suppress?: boolean;
}

// ═══════════════════════════════════════════════════════
// 커버 레이아웃 팩토리 — coverStyle에 따라 완전히 다른 시각 경험
// ═══════════════════════════════════════════════════════

/** institutional_masses — 우상단 매스 3개 + 황동 액센트 (golden_institutional 기본) */
function coverInstitutionalMasses(slide: any, input: ArchetypeInput): void {
  // 매스 3개 (우상단 장식 블록)
  slide.addShape('rect' as any, {
    x: 9.05, y: 0, w: 1.55, h: 4.42,
    fill: { color: '1A2030' },
  });
  slide.addShape('rect' as any, {
    x: 10.70, y: 0.95, w: 1.25, h: 3.47,
    fill: { color: '161D2B' },
  });
  slide.addShape('rect' as any, {
    x: 12.05, y: 1.85, w: 1.28, h: 2.57,
    fill: { color: '2E2718' },
  });

  // 워드마크
  slide.addText([
    { text: 'CRE', options: { color: 'FFFFFF', fontFace: NUM, fontSize: 15, bold: true } },
    { text: 'DEAL', options: { color: C.brass, fontFace: NUM, fontSize: 15, bold: true } },
  ], { x: M, y: 0.52, w: 3, h: 0.4, margin: 0 });

  renderCommonCoverContent(slide, input, 2.22);
}

/** split — 좌 콘텐츠 / 우 컬러 패널 분할 (credeal_signature) */
function coverSplit(slide: any, input: ArchetypeInput, imgAdded: boolean = false): void {
  if (!imgAdded) {
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
  } else {
    // 이미지가 있는 경우: 태그라인 가독성을 위해 하단에만 반투명 보호 밴드 배치
    slide.addShape('rect' as any, {
      x: 8.50, y: 5.50, w: 4.833, h: 1.20,
      fill: { color: C.ink, transparency: 40 },
    });
  }

  // 워드마크 (좌측)
  slide.addText([
    { text: 'CRE', options: { color: 'FFFFFF', fontFace: NUM, fontSize: 15, bold: true } },
    { text: 'DEAL', options: { color: C.brass, fontFace: NUM, fontSize: 15, bold: true } },
  ], { x: M, y: 0.52, w: 3, h: 0.4, margin: 0 });

  // 우측 패널에 태그라인
  slide.addText(THEME_META.companyTagline, {
    x: 9.00, y: 5.80, w: 3.80, h: 0.4,
    fontSize: 10, color: imgAdded ? 'FFFFFF' : C.ink, fontFace: KR, margin: 0, align: 'center',
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
    x: 7.33, y: 0.50, w: 6.00, h: 6.00,
    fill: { color: '0C2A30' },
  });
  slide.addShape('ellipse' as any, {
    x: 9.00, y: 1.50, w: 4.00, h: 4.00,
    fill: { color: '0E3640' },
  });
  slide.addShape('ellipse' as any, {
    x: 9.80, y: 2.30, w: 2.40, h: 2.40,
    fill: { color: '134E5E' },
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
      x, y: tagY + 0.70, w: centerAlign ? CW : Math.min(7.5, CW), h: 1.34,
      rectRadius: 0.04,
      fill: { color: CD.accentBg },
      line: { color: CD.accentBorder, width: 1 },
    });
    slide.addText(priceBand, {
      x: x + 0.28, y: tagY + 0.92, w: (centerAlign ? CW : Math.min(7.5, CW)) - 0.56, h: 0.90,
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
  const infoText = [broker, companyName].filter(Boolean).join('  |  ');
  slide.addText(infoText, {
    x: M, y: 6.60, w: CW, h: 0.3,
    fontSize: 9, color: CD.faint, // D30 m-4: 최소 캡션 9pt
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

  // ── Step 1: Cover image attempt (determines fallback need) ──
  let imgAdded = false;
  if (input.data?.coverImageUrl) {
    try {
      const img = await optimizeImageForPptx(input.data.coverImageUrl as string, 2400 /* 13.333" × 180dpi */, 85);
      if (img) {
        const coverStyle = input.data?.coverStyle ?? THEME_META.coverStyle;
        if (coverStyle === 'split') {
          slide.addImage({
            data: img.base64,
            x: 8.50, y: 0, w: 4.833, h: 7.5,
            sizing: { type: 'cover', w: 4.833, h: 7.5 },
          });
        } else if (coverStyle === 'hero_dark') {
          slide.addImage({
            data: img.base64,
            x: 0, y: 0, w: 13.333, h: 7.5,
            sizing: { type: 'cover', w: 13.333, h: 7.5 },
          });
        } else {
          slide.addImage({
            data: img.base64,
            x: 8.50, y: 0, w: 4.833, h: 7.5,
            sizing: { type: 'cover', w: 4.833, h: 7.5 },
          });
        }
        imgAdded = true;
        // D31 BL-2: 표지 배경 예외 — cover-fit 허용하되 크로핑률 25% 초과 시 경고
        const cropR = coverCropRatio(img.width, img.height, 4.833, 7.5);
        if (cropR > CROP_WARN_THRESHOLD) {
          warnings.push(`표지 사진 크로핑률 ${(cropR * 100).toFixed(0)}% — 25% 초과 주의`);
        }
      }
    } catch {
      warnings.push('표지 이미지 최적화 실패, 기본 그래픽 폴백 사용');
    }
  }

  // ── Step 2: Fallback decorative graphics (BEFORE text for correct z-order) ──
  if (!imgAdded && (style === 'split' || style === 'institutional_masses')) {
    // Primary panel — warm dark tone (avoids PptxGenJS transparency color shift)
    slide.addShape('rect' as any, {
      x: 8.50, y: 0, w: 4.833, h: 7.5,
      fill: { color: '2A2118' },
    });
    // Accent block (upper) — subtle brass tint
    slide.addShape('rect' as any, {
      x: 9.60, y: 0.80, w: 3.20, h: 2.60,
      fill: { color: '3D2E1A' },
    });
    // Accent block (lower) — slightly lighter warm tone
    slide.addShape('rect' as any, {
      x: 8.90, y: 4.00, w: 3.80, h: 2.80,
      fill: { color: '33271A' },
    });
    // Thin vertical accent line in brass
    slide.addShape('line' as any, {
      x: 9.30, y: 0.40, w: 0, h: 6.70,
      line: { color: C.brass, width: 0.8 },
    });
  }

  if (!imgAdded && style === 'hero_dark') {
    // Full-width warm gradient-like layered panels
    slide.addShape('rect' as any, {
      x: 0, y: 0, w: W, h: 7.5,
      fill: { color: '1A1510' },
    });
    slide.addShape('rect' as any, {
      x: 2.0, y: 1.2, w: 9.333, h: 5.1,
      fill: { color: '2A2118' },
    });
  }

  // ── Step 3: Cover style content (text renders ON TOP of decorations) ──
  switch (style) {
    case 'split':
      coverSplit(slide, input, imgAdded);
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

  // ── Step 4: Logo (on top of everything) ──
  if (input.data?.logoUrl) {
    try {
      const logo = await optimizeImageForPptx(input.data.logoUrl as string, 200, 90);
      if (logo) {
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

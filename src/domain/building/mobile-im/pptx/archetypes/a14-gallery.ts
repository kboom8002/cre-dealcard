import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR } from '../imlib';
import type { ProvenanceKind } from '../imlib';
import { optimizeImagesForPptx, type OptimizedImage } from '../utils/image-optimizer';

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
 * A14 — 건물 사진 갤러리 (Light)
 * 최대 6장의 사진을 2열 x 3행 그리드로 표시
 */
export async function buildA14Gallery(input: ArchetypeInput): Promise<ArchetypeOutput> {
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'GALLERY', input.data.title || '건물 사진');

  const photoUrls: string[] = input.data.photoUrls || [];
  const photos: Array<{ url: string; caption?: string }> = input.data.photos || [];
  
  // Collect all URLs
  const allUrls = photoUrls.length > 0 ? photoUrls : photos.map(p => p.url);
  const captions = photos.map(p => p.caption || '');
  
  if (allUrls.length === 0) {
    L.callout(slide, M, 2.20, CW, 1.4, 'info', '건물 사진',
      '건물 대표 사진이 등록되면 여기에 표시됩니다.');
    if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
    L.foot(slide, input.slideNum, input.docno);
    return { slide, warnings };
  }

  // Optimize images (max 6)
  const optimized = await optimizeImagesForPptx(allUrls, 6);
  
  if (optimized.length === 0) {
    L.callout(slide, M, 2.20, CW, 1.4, 'info', '사진 로딩 실패',
      '건물 사진을 로딩하지 못했습니다. 네트워크 상태를 확인해주세요.');
    warnings.push('갤러리 사진 로딩 실패');
    if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
    L.foot(slide, input.slideNum, input.docno);
    return { slide, warnings };
  }

  const count = optimized.length;
  const startY = 1.50;
  const gap = 0.12;
  
  if (count === 1) {
    // Single large image
    const imgW = CW;
    const imgH = 5.0;
    slide.addImage({
      data: optimized[0].base64,
      x: M, y: startY, w: imgW, h: imgH,
      sizing: { type: 'cover', w: imgW, h: imgH },
    });
    if (captions[0]) {
      slide.addText(captions[0], {
        x: M, y: startY + imgH + 0.08, w: imgW, h: 0.24,
        fontFace: KR, fontSize: 8.5, color: C.mute, margin: 0,
      });
    }
  } else if (count === 2) {
    // 2 images side by side
    const imgW = (CW - gap) / 2;
    const imgH = 4.5;
    optimized.forEach((img, i) => {
      const x = M + i * (imgW + gap);
      slide.addImage({
        data: img.base64,
        x, y: startY, w: imgW, h: imgH,
        sizing: { type: 'cover', w: imgW, h: imgH },
      });
      if (captions[i]) {
        slide.addText(captions[i], {
          x, y: startY + imgH + 0.08, w: imgW, h: 0.24,
          fontFace: KR, fontSize: 8.5, color: C.mute, margin: 0,
        });
      }
    });
  } else {
    // Grid: 2 columns, up to 3 rows
    const cols = 2;
    const rows = Math.min(3, Math.ceil(count / cols));
    const imgW = (CW - gap) / cols;
    const totalH = 5.2;
    const imgH = (totalH - gap * (rows - 1)) / rows;
    
    optimized.forEach((img, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      if (row >= rows) return;
      const x = M + col * (imgW + gap);
      const y = startY + row * (imgH + gap);
      
      // Photo frame
      slide.addImage({
        data: img.base64,
        x, y, w: imgW, h: imgH,
        sizing: { type: 'cover', w: imgW, h: imgH },
      });
      
      // Caption overlay at bottom
      if (captions[i]) {
        slide.addShape('rect' as any, {
          x, y: y + imgH - 0.28, w: imgW, h: 0.28,
          fill: { color: '000000', transparency: 50 },
        });
        slide.addText(captions[i], {
          x: x + 0.08, y: y + imgH - 0.28, w: imgW - 0.16, h: 0.28,
          fontFace: KR, fontSize: 7.5, color: 'FFFFFF', margin: 0,
          valign: 'middle',
        });
      }
    });
  }

  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}

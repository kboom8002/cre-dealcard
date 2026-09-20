import { NextRequest, NextResponse } from 'next/server';
import { studioService } from '@/domain/building/pptx-studio/studio-service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    let project;
    try { project = studioService.getProject(id); }
    catch { project = studioService.findProjectByDealId(id); }
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }

    // Build merged doc body from slide overrides
    const mergedBody: Record<string, any> = {
      preset: 'credeal_basic',
    };
    for (const slide of project.slides.filter(s => !s.hidden)) {
      if (slide.dataKey && Object.keys(slide.slideOverrides).length > 0) {
        mergedBody[slide.dataKey] = slide.slideOverrides;
      }
    }

    // Use PptxGenJS for a basic rendering with proper styling
    const PptxGenJS = (await import('pptxgenjs')).default;
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    pptx.title = project.title;
    pptx.author = 'CREDEAL Basic IM Studio';

    const visibleSlides = project.slides.filter(s => !s.hidden);
    for (const slideData of visibleSlides) {
      const slide = pptx.addSlide();
      // Navy theme for Basic IM
      slide.background = { color: 'FFFFFF' };

      // Kicker
      slide.addText(slideData.kicker || '', {
        x: 0.55, y: 0.35, w: 10, h: 0.25,
        fontSize: 9, color: 'B98A2E', bold: true, fontFace: 'Pretendard',
      });

      // Title
      const displayTitle = (slideData.slideOverrides as any)?.title || slideData.title || '';
      slide.addText(displayTitle, {
        x: 0.55, y: 0.6, w: 11.5, h: 0.5,
        fontSize: 16, color: '132A3A', bold: true, fontFace: 'Pretendard',
      });

      // Content area
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.55, y: 1.3, w: 12.2, h: 5.4,
        fill: { color: 'F8FAFC' },
        line: { color: 'E2E8F0', width: 0.5 },
      });

      // Overrides content
      const overrides = slideData.slideOverrides as Record<string, any>;
      const contentLines: string[] = [];
      for (const [key, val] of Object.entries(overrides || {})) {
        if (typeof val === 'string' && val.trim()) {
          contentLines.push(`${key}: ${val}`);
        }
      }
      if (contentLines.length > 0) {
        slide.addText(contentLines.join('\n'), {
          x: 0.8, y: 1.5, w: 11.7, h: 4.8,
          fontSize: 11, color: '334155', align: 'left', valign: 'top',
          fontFace: 'Pretendard', lineSpacingMultiple: 1.3,
        });
      } else {
        slide.addText(`[편집 전] ${slideData.layoutType} 슬라이드`, {
          x: 1.0, y: 3.0, w: 11.3, h: 1.0,
          fontSize: 14, color: '94A3B8', align: 'center',
        });
      }
    }

    const buffer = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
    const safeTitle = (project.title || 'Basic_IM').replace(/[^a-zA-Z0-9\u3131-\u318E\u3200-\u321E\uAC00-\uD7A3]/g, '_');

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle + '_basic_im.pptx')}`,
        'Cache-Control': 'no-cache',
        'X-Slide-Count': String(visibleSlides.length),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Failed to generate Basic IM PPTX' },
      { status: 500 }
    );
  }
}

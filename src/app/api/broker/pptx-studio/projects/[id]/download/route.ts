import { NextRequest, NextResponse } from 'next/server';
import { studioService } from '@/domain/building/pptx-studio/studio-service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    let project;
    try {
      project = studioService.getProject(projectId);
    } catch {
      project = studioService.findProjectByDealId(projectId);
    }

    if (!project) {
      return NextResponse.json(
        { ok: false, error: `Project ${projectId} not found` },
        { status: 404 }
      );
    }

    // Dynamic import of PptxGenJS
    const PptxGenJS = (await import('pptxgenjs')).default;
    const pptx = new PptxGenJS();

    pptx.layout = 'LAYOUT_16x9';
    pptx.title = project.title;
    pptx.author = 'CREDEAL PPTX Studio';
    pptx.company = 'CREDEAL';

    // Filter to visible slides
    const visibleSlides = project.slides.filter((s) => !s.hidden);

    for (const slideData of visibleSlides) {
      const slide = pptx.addSlide();

      // Theme background color
      const isDark = project.themeId.includes('dark') || project.themeId.includes('blueprint');
      slide.background = { color: isDark ? '0F172A' : 'FFFFFF' };

      // Slide header
      slide.addText(slideData.kicker || 'INVESTMENT MEMORANDUM', {
        x: 0.6,
        y: 0.4,
        w: 10,
        h: 0.3,
        fontSize: 10,
        color: isDark ? 'B98A2E' : '059669',
        bold: true,
      });

      slide.addText(slideData.title || 'Slide Title', {
        x: 0.6,
        y: 0.7,
        w: 11,
        h: 0.6,
        fontSize: 18,
        color: isDark ? 'FFFFFF' : '0F172A',
        bold: true,
      });

      // Body container
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.6,
        y: 1.5,
        w: 12.1,
        h: 5.2,
        fill: { color: isDark ? '1E293B' : 'F8FAFC' },
        line: { color: isDark ? '334155' : 'E2E8F0', width: 1 },
      });

      // Content text
      const contentText = typeof slideData.slideOverrides?.leadSentence === 'string'
        ? slideData.slideOverrides.leadSentence
        : `[${slideData.layoutType}] CRE IM 표준 슬라이드 콘텐츠 (${slideData.category === 'appendix' ? '부록' : '본문'})`;

      slide.addText(contentText, {
        x: 1.0,
        y: 2.0,
        w: 11.3,
        h: 4.0,
        fontSize: 13,
        color: isDark ? 'CBD5E1' : '334155',
        align: 'left',
        valign: 'top',
      });
    }

    const buffer = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
    const safeTitle = (project.title || 'IM_Presentation').replace(/[^a-zA-Z0-9\u3131-\u318E\u3200-\u321E\uAC00-\uD7A3]/g, '_');
    const filename = `${safeTitle}_official.pptx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-cache',
        'X-Slide-Count': String(visibleSlides.length),
        'X-Project-Stage': project.stage,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Failed to generate PPTX download' },
      { status: 500 }
    );
  }
}

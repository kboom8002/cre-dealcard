import PptxGenJS from 'pptxgenjs';
import { CREDEAL_PPTX_THEME as theme } from './pptx-theme';
import { parseMarkdownTable, stripHtml } from './utils/html-parser';
import { optimizeImagesForPptx, optimizeImageForPptx } from './utils/image-optimizer';

export type PptxTier = 'basic' | 'pro';

export interface MobileImPptxInput {
  buildingId: string;
  tier: PptxTier;
  doc: {
    title?: string;
    body: Record<string, any>;
    sections?: Array<{ title: string; markdown: string; confidence?: string; boundary_note?: string }>;
  };
  building?: {
    area_signal?: string;
    asset_type?: string;
    price_band?: string;
    owner_id?: string;
  };
  broker?: {
    display_name?: string;
    company_name?: string;
    phone?: string;
    specialty?: string;
  };
  watermark?: {
    requesterName: string;
    phoneLast4: string;
    timestamp: string;
  };
}

export interface MobileImPptxOutput {
  buffer: Buffer;
  slideCount: number;
  fileSizeBytes: number;
  generatedAt: string;
  warnings: string[];
}

export class MobileImPptxRenderer {
  async render(input: MobileImPptxInput): Promise<MobileImPptxOutput> {
    const warnings: string[] = [];
    const pptx = new PptxGenJS();
    const allSlides: any[] = [];
    
    try {
      // Slide Master
      pptx.defineSlideMaster({
        title: 'CREDEAL_MASTER',
        background: { fill: theme.background },
        objects: [
          { rect: { x: 0, y: '92%', w: '100%', h: '8%', fill: { color: theme.navy } } },
          { text: { text: theme.companyName + '  |  ' + theme.companyTagline, options: {
            x: 0.5, y: '93%', w: 8, h: 0.4, fontSize: 8, color: theme.accentColor, fontFace: theme.bodyFontFace
          }}},
        ],
      });

      // --- Slide 1: Cover Slide ---
      const coverSlide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
      allSlides.push(coverSlide);
      coverSlide.background = { fill: theme.navy };
      
      const buildingName = input.doc.title || '\ube4c\ub529 \uc815\ubcf4';
      coverSlide.addText(buildingName, {
        x: 1, y: 2, w: 8, h: 1.5,
        fontSize: 36, bold: true, color: theme.white, fontFace: theme.titleFontFace
      });

      const assetType = input.building?.asset_type || '';
      const badgeText = assetType ? '[' + assetType + '] ' : '';
      coverSlide.addText(badgeText + 'CREDEAL Data Grade', {
        x: 1, y: 1.5, w: 8, h: 0.5,
        fontSize: 14, color: theme.accentColor, fontFace: theme.bodyFontFace
      });

      const brokerDisplay = input.broker?.display_name ? input.broker.display_name + ' / ' + (input.broker.company_name || '') : '';
      if (brokerDisplay) {
        coverSlide.addText(brokerDisplay, {
          x: 1, y: 3.5, w: 8, h: 0.5,
          fontSize: 12, color: theme.slate500, fontFace: theme.bodyFontFace
        });
      }
      
      coverSlide.addText(new Date().toISOString().split('T')[0], {
        x: 1, y: 4, w: 8, h: 0.5,
        fontSize: 10, color: theme.slate500, fontFace: theme.bodyFontFace
      });

      // --- Slide 2: Hero Card Slide ---
      const heroSlide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
      allSlides.push(heroSlide);
      heroSlide.addText('Key Investment Metrics', {
        x: 0.5, y: 0.5, w: 9, h: 0.5, fontSize: 22, bold: true, color: theme.navy, fontFace: theme.titleFontFace
      });
      heroSlide.addShape(pptx.ShapeType.rect, {
        x: 0.5, y: 1.1, w: 1.5, h: 0.05, fill: { color: theme.lime }
      });

      const heroData = input.doc.body.heroCard || {};
      const heroTableData = [
        [
          { text: 'Asking Price', options: { fontSize: 10, color: theme.slate700, fontFace: theme.bodyFontFace } },
          { text: 'Cap Rate', options: { fontSize: 10, color: theme.slate700, fontFace: theme.bodyFontFace } }
        ],
        [
          { text: heroData.askingPriceDisplay || '-', options: { fontSize: 24, bold: true, color: theme.navy, fontFace: theme.titleFontFace } },
          { text: heroData.capRateBase ? heroData.capRateBase + '%' : '-', options: { fontSize: 24, bold: true, color: theme.navy, fontFace: theme.titleFontFace } }
        ],
        [
          { text: 'Area (Pyeong)', options: { fontSize: 10, color: theme.slate700, fontFace: theme.bodyFontFace, margin: [20, 0, 0, 0] as [number, number, number, number] } },
          { text: 'Vacancy', options: { fontSize: 10, color: theme.slate700, fontFace: theme.bodyFontFace, margin: [20, 0, 0, 0] as [number, number, number, number] } }
        ],
        [
          { text: heroData.areaSignal || '-', options: { fontSize: 24, bold: true, color: theme.navy, fontFace: theme.titleFontFace } },
          { text: heroData.vacancyPct !== undefined ? heroData.vacancyPct + '%' : '-', options: { fontSize: 24, bold: true, color: theme.navy, fontFace: theme.titleFontFace } }
        ]
      ];
      heroSlide.addTable(heroTableData, {
        x: 0.5, y: 1.5, w: 9, rowH: [0.3, 0.7, 0.3, 0.7], border: { type: 'none' }
      });
      heroSlide.addShape(pptx.ShapeType.rect, { x: 0.3, y: 1.5, w: 0.05, h: 2, fill: { color: theme.lime }});


      // --- Slides 3-7: Content Slides ---
      const sections = input.doc.sections || input.doc.body.sections || [];
      for (const section of sections) {
        const slide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
        allSlides.push(slide);
        slide.addText(section.title || '', {
          x: 0.5, y: 0.5, w: 7, h: 0.5, fontSize: 22, bold: true, color: theme.navy, fontFace: theme.titleFontFace
        });
        slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.1, w: 1.5, h: 0.05, fill: { color: theme.lime } });

        let badge = '';
        if (section.confidence === 'confirmed') badge = '\u2705 \uacf5\ubd80\ud655\uc778';
        else if (section.confidence === 'inferred') badge = '\u2699\ufe0f AI\ucd94\uc815';
        else if (section.confidence === 'needs_check') badge = '\u26a0\ufe0f \ud655\uc778\ud544\uc694';

        if (badge) {
          slide.addText(badge, {
            x: 7.5, y: 0.5, w: 2, h: 0.4, align: 'right', fontSize: 10, color: theme.slate500, fontFace: theme.bodyFontFace
          });
        }

        if (section.markdown) {
          if (section.markdown.includes('|')) {
            const tableData = parseMarkdownTable(section.markdown);
            if (tableData.length > 0) {
              const styledRows = tableData.map((row, rIdx) =>
                row.map(cell => ({
                  text: cell,
                  options: {
                    fontSize: 10,
                    fontFace: theme.bodyFontFace,
                    color: rIdx === 0 ? theme.tableHeaderText : theme.bodyColor,
                    bold: rIdx === 0,
                    fill: { color: rIdx === 0 ? theme.tableHeaderBg : rIdx % 2 === 0 ? theme.tableAltRowBg : theme.white },
                    border: { type: 'solid' as const, pt: 0.5, color: 'E2E8F0' },
                    valign: 'middle' as const,
                  },
                }))
              );
              slide.addTable(styledRows, {
                x: 0.5, y: 1.5, w: 9,
                colW: Array(tableData[0]?.length ?? 2).fill(9 / (tableData[0]?.length ?? 2)),
              });
            }
          } else {
            slide.addText(stripHtml(section.markdown), {
              x: 0.5, y: 1.5, w: 9, h: 3, fontSize: 12, color: theme.bodyColor, fontFace: theme.bodyFontFace, valign: 'top'
            });
          }
        }

        if (section.boundary_note) {
          slide.addText(section.boundary_note, {
            x: 0.5, y: 4.8, w: 9, h: 0.3, fontSize: 8, italic: true, color: theme.slate500, fontFace: theme.bodyFontFace
          });
        }
      }

      // --- Slide Gallery ---
      const photoUrls = input.doc.body.photoUrls || input.doc.body.photos || [];
      if (photoUrls.length > 0) {
        const slide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
        allSlides.push(slide);
        slide.addText('Photos', {
          x: 0.5, y: 0.5, w: 7, h: 0.5, fontSize: 22, bold: true, color: theme.navy, fontFace: theme.titleFontFace
        });
        slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.1, w: 1.5, h: 0.05, fill: { color: theme.lime } });
        
        const optimized = await optimizeImagesForPptx(photoUrls, 4);
        if (optimized.length > 0) {
          if (optimized.length === 1) {
            slide.addImage({ data: optimized[0].base64, x: 0.5, y: 1.3, w: 9, h: 3.5 });
          } else if (optimized.length === 2) {
            slide.addImage({ data: optimized[0].base64, x: 0.5, y: 1.3, w: 4.4, h: 3.5 });
            slide.addImage({ data: optimized[1].base64, x: 5.1, y: 1.3, w: 4.4, h: 3.5 });
          } else {
            slide.addImage({ data: optimized[0].base64, x: 0.5, y: 1.3, w: 4.4, h: 1.7 });
            if (optimized.length > 1) slide.addImage({ data: optimized[1].base64, x: 5.1, y: 1.3, w: 4.4, h: 1.7 });
            if (optimized.length > 2) slide.addImage({ data: optimized[2].base64, x: 0.5, y: 3.1, w: 4.4, h: 1.7 });
            if (optimized.length > 3) slide.addImage({ data: optimized[3].base64, x: 5.1, y: 3.1, w: 4.4, h: 1.7 });
          }
        } else {
          warnings.push('Failed to load images for gallery slide');
        }
      }

      // --- Slide Contact ---
      const contactSlide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
      allSlides.push(contactSlide);
      contactSlide.addText('Contact', {
        x: 0.5, y: 0.5, w: 7, h: 0.5, fontSize: 22, bold: true, color: theme.navy, fontFace: theme.titleFontFace
      });
      contactSlide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.1, w: 1.5, h: 0.05, fill: { color: theme.lime } });
      
      if (input.broker) {
        contactSlide.addText(input.broker.display_name || 'Broker', {
          x: 0.5, y: 1.5, w: 6, h: 0.5, fontSize: 24, bold: true, color: theme.navy, fontFace: theme.titleFontFace
        });
        contactSlide.addText(input.broker.company_name || '', {
          x: 0.5, y: 2.1, w: 6, h: 0.4, fontSize: 14, color: theme.bodyColor, fontFace: theme.bodyFontFace
        });
        contactSlide.addText(input.broker.phone || '', {
          x: 0.5, y: 2.6, w: 6, h: 0.4, fontSize: 14, color: theme.bodyColor, fontFace: theme.bodyFontFace
        });
        contactSlide.addText(input.broker.specialty || '', {
          x: 0.5, y: 3.1, w: 6, h: 0.4, fontSize: 14, color: theme.bodyColor, fontFace: theme.bodyFontFace
        });
      }

      try {
        const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://cre-dealcard.vercel.app/im-lite/' + input.buildingId;
        const qrImg = await optimizeImageForPptx(qrUrl, 150, 100);
        if (qrImg) {
          contactSlide.addImage({ data: qrImg.base64, x: 7, y: 1.5, w: 2, h: 2 });
        }
      } catch (e) {
        warnings.push('QR code generation failed');
      }

      // --- Slide Disclaimer ---
      const disclaimerSlide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
      allSlides.push(disclaimerSlide);
      disclaimerSlide.background = { fill: theme.navy };
      disclaimerSlide.addText('Disclaimer', {
        x: 0.5, y: 1.5, w: 9, h: 0.5, align: 'center', fontSize: 18, bold: true, color: theme.white, fontFace: theme.titleFontFace
      });
      disclaimerSlide.addText('\ubcf8 \ubb38\uc11c\ub294 AI\ub97c \ud65c\uc6a9\ud558\uc5ec \uc791\uc131\ub418\uc5c8\uc73c\uba70, \uc2e4\uc81c \uc815\ubcf4\uc640 \ucc28\uc774\uac00 \uc788\uc744 \uc218 \uc788\uc2b5\ub2c8\ub2e4.', {
        x: 0.5, y: 2.2, w: 9, h: 0.5, align: 'center', fontSize: 12, color: theme.slate500, fontFace: theme.bodyFontFace
      });
      disclaimerSlide.addText(theme.companyName + ' | ' + theme.companyTagline, {
        x: 0.5, y: 3, w: 9, h: 0.5, align: 'center', fontSize: 14, color: theme.accentColor, fontFace: theme.bodyFontFace
      });
      disclaimerSlide.addText('Thank You', {
        x: 0.5, y: 4, w: 9, h: 0.5, align: 'center', fontSize: 16, bold: true, color: theme.white, fontFace: theme.titleFontFace
      });


      // --- Pro Slides ---
      if (input.tier === 'pro') {
        if (input.doc.body.floorLeases) {
          const proSlide1 = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
          allSlides.push(proSlide1);
          proSlide1.addText('Rent Roll Detail', {
            x: 0.5, y: 0.5, w: 7, h: 0.5, fontSize: 22, bold: true, color: theme.navy, fontFace: theme.titleFontFace
          });
          proSlide1.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.1, w: 1.5, h: 0.05, fill: { color: theme.lime } });
          proSlide1.addText('Floor leases detail...', {
            x: 0.5, y: 1.5, w: 9, h: 3, fontSize: 12, color: theme.bodyColor, fontFace: theme.bodyFontFace, valign: 'top'
          });
        }

        if (input.doc.body.rightsAnalysis) {
          const proSlide2 = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
          allSlides.push(proSlide2);
          proSlide2.addText('Rights Analysis', {
            x: 0.5, y: 0.5, w: 7, h: 0.5, fontSize: 22, bold: true, color: theme.navy, fontFace: theme.titleFontFace
          });
          proSlide2.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.1, w: 1.5, h: 0.05, fill: { color: theme.lime } });
          proSlide2.addText(stripHtml(input.doc.body.rightsAnalysis), {
            x: 0.5, y: 1.5, w: 9, h: 3, fontSize: 12, color: theme.bodyColor, fontFace: theme.bodyFontFace, valign: 'top'
          });
        }

        if (input.doc.body.loanSimulation) {
          const proSlide3 = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
          allSlides.push(proSlide3);
          proSlide3.addText('Loan Simulation', {
            x: 0.5, y: 0.5, w: 7, h: 0.5, fontSize: 22, bold: true, color: theme.navy, fontFace: theme.titleFontFace
          });
          proSlide3.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.1, w: 1.5, h: 0.05, fill: { color: theme.lime } });
          proSlide3.addText('Loan Simulation Details...', {
            x: 0.5, y: 1.5, w: 9, h: 3, fontSize: 12, color: theme.bodyColor, fontFace: theme.bodyFontFace, valign: 'top'
          });
        }

        if (input.doc.body.taxScenarios) {
          const proSlide4 = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
          allSlides.push(proSlide4);
          proSlide4.addText('Tax Scenarios', {
            x: 0.5, y: 0.5, w: 7, h: 0.5, fontSize: 22, bold: true, color: theme.navy, fontFace: theme.titleFontFace
          });
          proSlide4.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.1, w: 1.5, h: 0.05, fill: { color: theme.lime } });
          proSlide4.addText('Tax Scenarios Comparison...', {
            x: 0.5, y: 1.5, w: 9, h: 3, fontSize: 12, color: theme.bodyColor, fontFace: theme.bodyFontFace, valign: 'top'
          });
        }

        // Watermark
        if (input.watermark) {
          const watermarkText = input.watermark.requesterName + ' \u00b7 ' + input.watermark.phoneLast4 + ' \u00b7 ' + input.watermark.timestamp;
          const positions = [
            { x: 0.5, y: 1.0 }, { x: 3.5, y: 0.5 }, { x: 6.5, y: 1.5 },
            { x: 1.0, y: 3.5 }, { x: 4.0, y: 3.0 }, { x: 7.0, y: 4.0 },
          ];
          for (const slide of allSlides) {
            for (const pos of positions) {
              slide.addText(watermarkText, {
                x: pos.x, y: pos.y, w: 4, h: 0.4,
                fontSize: 10, color: 'D0D0D0',
                fontFace: theme.bodyFontFace,
                rotate: -35,
                transparency: 85,
              });
            }
          }
        }
      }

      const buffer = await pptx.write({ outputType: 'nodebuffer', compression: true }) as Buffer;

      return {
        buffer,
        slideCount: allSlides.length,
        fileSizeBytes: buffer.length,
        generatedAt: new Date().toISOString(),
        warnings,
      };
    } catch (error) {
      throw new Error('Failed to render PPTX: ' + (error instanceof Error ? error.message : String(error)));
    }
  }
}

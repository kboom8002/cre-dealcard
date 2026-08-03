import PptxGenJS from 'pptxgenjs';
import {
  getPptxTheme,
  PptxThemeTokens,
  DEFAULT_PPTX_PRESET,
} from './pptx-theme';
import { parseMarkdownTable, stripHtml } from './utils/html-parser';
import {
  optimizeImagesForPptx,
  optimizeImageForPptx,
  generateStaticMapPlaceholder,
} from './utils/image-optimizer';

export type PptxTier = 'basic' | 'pro';

export interface MobileImPptxInput {
  buildingId: string;
  tier: PptxTier;
  preset?: string; // 'credeal_signature' | 'executive_gold' | 'corporate_clean' | 'pro_dark_obsidian'
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
    const theme: PptxThemeTokens = getPptxTheme(input.preset);
    const allSlides: any[] = [];

    try {
      // ── Slide Master Definition ──
      pptx.defineSlideMaster({
        title: 'CREDEAL_MASTER',
        background: { fill: theme.background },
        objects: [
          // 하단 브랜딩 푸터 바
          {
            rect: {
              x: 0,
              y: '92%',
              w: '100%',
              h: '8%',
              fill: { color: theme.footerBackground },
            },
          },
          {
            text: {
              text: `${theme.companyName}  |  ${theme.companyTagline}`,
              options: {
                x: 0.5,
                y: '93.5%',
                w: 6,
                h: 0.3,
                fontSize: 9,
                bold: true,
                color: theme.accentColor,
                fontFace: theme.bodyFontFace,
              },
            },
          },
          {
            text: {
              text: `CONFIDENTIAL  ·  ${input.tier.toUpperCase()} TIER`,
              options: {
                x: 6.8,
                y: '93.5%',
                w: 2.7,
                h: 0.3,
                align: 'right',
                fontSize: 8,
                color: theme.mutedText,
                fontFace: theme.bodyFontFace,
              },
            },
          },
        ],
      });

      const bodyData = input.doc.body || {};
      const heroData = bodyData.heroCard || {};
      const buildingName = input.doc.title || '서초동 근생건물 매매';

      // ── 1. Hero Cover Slide ──
      await this.buildCoverSlide(pptx, allSlides, theme, input, buildingName);

      // ── 2. Big Metrics Callout Card Slide ──
      this.buildBigMetricsSlide(pptx, allSlides, theme, heroData);

      // ── 3. Property Overview Slide (매물 개요) ──
      this.buildPropertyOverviewSlide(pptx, allSlides, theme, input, bodyData);

      // ── 4. Spatial Location & Transport Map Slide (입지 분석) ──
      await this.buildLocationMapSlide(pptx, allSlides, theme, buildingName);

      // ── 5. Lease Status Slide (임대 현황) ──
      this.buildLeaseStatusSlide(pptx, allSlides, theme, bodyData);

      // ── 6. Income & Financial Analysis Slide (수익성 분석) ──
      this.buildIncomeAnalysisSlide(pptx, allSlides, theme, bodyData);

      // ── 7. Investment Thesis & Risk Check (투자 포인트 & 리스크) ──
      this.buildInvestmentThesisSlide(pptx, allSlides, theme, bodyData);

      // ── 8. Photo Showcase Gallery Slide (건물 갤러리) ──
      await this.buildPhotoGallerySlide(pptx, allSlides, theme, bodyData, warnings);

      // ── 9. Contact & Broker Profile Slide ──
      await this.buildContactSlide(pptx, allSlides, theme, input, warnings);

      // ── 10. Pro Exclusive Slides ──
      if (input.tier === 'pro') {
        this.buildProFloorLeasesSlide(pptx, allSlides, theme, bodyData);
        this.buildProRightsAnalysisSlide(pptx, allSlides, theme, bodyData);
        this.buildProLoanSimulationSlide(pptx, allSlides, theme, bodyData);
        this.buildProTaxScenariosSlide(pptx, allSlides, theme, bodyData);
      }

      // ── 11. Disclaimer & Back Cover Slide ──
      this.buildDisclaimerSlide(pptx, allSlides, theme);

      // ── Watermark Application for Pro Tier ──
      if (input.tier === 'pro' && input.watermark) {
        this.applyWatermark(allSlides, theme, input.watermark);
      }

      const buffer = (await pptx.write({
        outputType: 'nodebuffer',
        compression: true,
      })) as Buffer;

      return {
        buffer,
        slideCount: allSlides.length,
        fileSizeBytes: buffer.length,
        generatedAt: new Date().toISOString(),
        warnings,
      };
    } catch (error) {
      throw new Error(
        `Failed to render PPTX (${theme.presetName}): ` +
          (error instanceof Error ? error.message : String(error))
      );
    }
  }

  // ==========================================
  // Slide Builder Methods
  // ==========================================

  private async buildCoverSlide(
    pptx: PptxGenJS,
    slides: any[],
    theme: PptxThemeTokens,
    input: MobileImPptxInput,
    buildingName: string
  ) {
    const slide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
    slides.push(slide);

    // Cover Background
    slide.background = { fill: theme.footerBackground };

    // Accent Decorative Bar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.8,
      y: 1.2,
      w: 0.15,
      h: 3.2,
      fill: { color: theme.accentColor },
    });

    // Badge
    const assetType = input.building?.asset_type || '상업용 근생건물';
    slide.addText(`[INVESTMENT MEMORANDUM]  ·  ${assetType}`, {
      x: 1.2,
      y: 1.2,
      w: 7.5,
      h: 0.4,
      fontSize: 11,
      bold: true,
      color: theme.accentColor,
      fontFace: theme.bodyFontFace,
    });

    // Title
    slide.addText(buildingName, {
      x: 1.2,
      y: 1.7,
      w: 8,
      h: 1.4,
      fontSize: 32,
      bold: true,
      color: 'FFFFFF',
      fontFace: theme.titleFontFace,
      valign: 'top',
    });

    // Key Sub-metrics Card (Cover Quick Summary)
    const priceDisplay = input.doc.body?.heroCard?.askingPriceDisplay || '300억 원';
    const areaDisplay = input.doc.body?.heroCard?.areaSignal || '대지 140평 / 연면적 519평';
    slide.addText(`매매가 ${priceDisplay}  |  ${areaDisplay}  |  제3종일반주거지역`, {
      x: 1.2,
      y: 3.2,
      w: 8,
      h: 0.4,
      fontSize: 14,
      color: theme.mutedText,
      fontFace: theme.bodyFontFace,
    });

    // Broker & Date Box
    const brokerName = input.broker?.display_name || '전담 자문 브로커';
    const company = input.broker?.company_name || '크리딜 파트너스';
    slide.addText(`발행: ${company} (${brokerName})   |   일자: ${new Date().toISOString().split('T')[0]}`, {
      x: 1.2,
      y: 4.2,
      w: 8,
      h: 0.4,
      fontSize: 10,
      color: theme.mutedText,
      fontFace: theme.bodyFontFace,
    });
  }

  private buildBigMetricsSlide(
    pptx: PptxGenJS,
    slides: any[],
    theme: PptxThemeTokens,
    heroData: any
  ) {
    const slide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
    slides.push(slide);

    this.addSlideHeader(slide, pptx, theme, 'Key Investment Metrics', '핵심 투자 지표 요약');

    // 4-Grid Metric Cards (2x2)
    const metrics = [
      {
        label: '매매 희망가 (Asking Price)',
        value: heroData.askingPriceDisplay || '300억 원',
        sub: '대지 평당 약 2.14억 원 수준',
        color: theme.headingColor,
      },
      {
        label: 'Cap Rate (NOI 기준)',
        value: heroData.capRateBase ? `${heroData.capRateBase}%` : '4.2%',
        sub: '월세 + 부가수입 연 2,640만원 합산',
        color: theme.accentBg === '0F172A' ? '0284C7' : theme.accentColor,
      },
      {
        label: '연면적 / 대지면적',
        value: heroData.areaSignal || '519.1평 (1,716㎡)',
        sub: '대지면적 140.0평 (461.8㎡)',
        color: theme.headingColor,
      },
      {
        label: '임대율 (Occupancy)',
        value: heroData.vacancyPct !== undefined ? `${100 - heroData.vacancyPct}%` : '100% (전 층 임대)',
        sub: '총 7개 층 (지하 1층 ~ 지상 6층)',
        color: '16A34A',
      },
    ];

    const cardW = 4.3;
    const cardH = 1.4;
    const coords = [
      { x: 0.6, y: 1.3 },
      { x: 5.1, y: 1.3 },
      { x: 0.6, y: 2.9 },
      { x: 5.1, y: 2.9 },
    ];

    metrics.forEach((m, idx) => {
      const { x, y } = coords[idx];

      // Card Box Background
      slide.addShape(pptx.ShapeType.roundRect, {
        x,
        y,
        w: cardW,
        h: cardH,
        rectRadius: 0.1,
        fill: { color: theme.cardBackground },
        line: { color: theme.cardBorder, width: 1 },
      });

      // Left Accent Line on Card
      slide.addShape(pptx.ShapeType.rect, {
        x,
        y,
        w: 0.08,
        h: cardH,
        fill: { color: m.color },
      });

      // Label
      slide.addText(m.label, {
        x: x + 0.25,
        y: y + 0.15,
        w: cardW - 0.4,
        h: 0.3,
        fontSize: 10,
        bold: true,
        color: theme.subheadingColor,
        fontFace: theme.bodyFontFace,
      });

      // Big Value
      slide.addText(m.value, {
        x: x + 0.25,
        y: y + 0.45,
        w: cardW - 0.4,
        h: 0.5,
        fontSize: 22,
        bold: true,
        color: theme.headingColor,
        fontFace: theme.titleFontFace,
      });

      // Sub text
      slide.addText(m.sub, {
        x: x + 0.25,
        y: y + 0.95,
        w: cardW - 0.4,
        h: 0.3,
        fontSize: 9,
        color: theme.mutedText,
        fontFace: theme.bodyFontFace,
      });
    });

    // Bottom Thesis Banner
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.6,
      y: 4.5,
      w: 8.8,
      h: 0.6,
      rectRadius: 0.08,
      fill: { color: theme.accentBg },
      line: { color: theme.accentColor, width: 1 },
    });

    slide.addText('💡 투자 포인트 요약: 서초동 핵심 입지, 통신장비 부가수입 연 2,640만원 포함 전 층 임대 완료 안정적 자산', {
      x: 0.8,
      y: 4.6,
      w: 8.4,
      h: 0.4,
      fontSize: 10,
      bold: true,
      color: theme.accentText,
      fontFace: theme.bodyFontFace,
    });
  }

  private buildPropertyOverviewSlide(
    pptx: PptxGenJS,
    slides: any[],
    theme: PptxThemeTokens,
    input: MobileImPptxInput,
    bodyData: any
  ) {
    const slide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
    slides.push(slide);

    this.addSlideHeader(slide, pptx, theme, 'Property Overview', '매물 개요 및 건축물 상세');

    const overviewTableData = [
      ['항목', '상세내용', '비고 / 특이사항'],
      ['소재지', '서울시 서초구 서초동 1457-1', 'GBD 법조타운 인근'],
      ['용도지역', '제3종 일반주거지역', '용적률 여유 확보'],
      ['대지면적', '461.8㎡ (약 139.7평)', '평당 2.14억 원'],
      ['연면적', '1,715.98㎡ (약 519.1평)', '지상 6층 / 지하 1층'],
      ['건물구조 / 준공', '철근콘크리트 구조 / 1990년 준공', '전 층 임대 운용 중'],
      ['총 보증금', '약 6억 7,000만 원', '보증금 제외 실투자 293.3억'],
      ['월 임대 수입', '약 3,220만 원 + α', '통신장비 부가수입 연 2,640만 추가'],
    ];

    const styledRows = overviewTableData.map((row, rIdx) =>
      row.map((cell, cIdx) => ({
        text: cell,
        options: {
          fontSize: 10,
          fontFace: theme.bodyFontFace,
          bold: rIdx === 0 || cIdx === 0,
          color: rIdx === 0 ? theme.tableHeaderText : theme.bodyColor,
          fill: {
            color:
              rIdx === 0
                ? theme.tableHeaderBg
                : rIdx % 2 === 0
                ? theme.tableAltRowBg
                : theme.cardBackground,
          },
          border: { type: 'solid' as const, pt: 0.5, color: theme.tableBorder },
          valign: 'middle' as const,
        },
      }))
    );

    slide.addTable(styledRows, {
      x: 0.6,
      y: 1.3,
      w: 8.8,
      rowH: [0.35, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
      colW: [2.0, 4.3, 2.5],
    });
  }

  private async buildLocationMapSlide(
    pptx: PptxGenJS,
    slides: any[],
    theme: PptxThemeTokens,
    buildingName: string
  ) {
    const slide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
    slides.push(slide);

    this.addSlideHeader(slide, pptx, theme, 'Location & Accessibility', '입지 분석 및 교통 접근성');

    // Left Map Image
    const mapImg = await generateStaticMapPlaceholder('서울 서초구 서초동 1457-1', 700, 480);
    slide.addImage({
      data: mapImg.base64,
      x: 0.6,
      y: 1.3,
      w: 4.6,
      h: 3.6,
    });

    // Right Transport Cards
    const cards = [
      {
        icon: '🚇 지하철',
        title: '교대역 / 서초역 (도보 8분)',
        desc: '지하철 2호선 및 3호선 더블 역세권 접근성 확보',
      },
      {
        icon: '🛣️ 도로망',
        title: '반포대로 · 서초대로 간선망',
        desc: '경부고속도로 서초IC 진출입 용이, 남부순환로 직결',
      },
      {
        icon: '🏙️ 배후수요',
        title: 'GBD 법조타운 & 오피스',
        desc: '법원/검찰청, 오피스 밀집 지역으로 안정적 임차수요',
      },
      {
        icon: '🏗️ 개발잠재력',
        title: '제3종일반주거지역',
        desc: '향후 리모델링 및 신축을 통한 Value-add 잠재력',
      },
    ];

    cards.forEach((c, idx) => {
      const y = 1.3 + idx * 0.92;

      slide.addShape(pptx.ShapeType.roundRect, {
        x: 5.4,
        y,
        w: 4.0,
        h: 0.82,
        rectRadius: 0.08,
        fill: { color: theme.cardBackground },
        line: { color: theme.cardBorder, width: 1 },
      });

      slide.addText(`${c.icon}  ${c.title}`, {
        x: 5.55,
        y: y + 0.1,
        w: 3.7,
        h: 0.3,
        fontSize: 10,
        bold: true,
        color: theme.headingColor,
        fontFace: theme.bodyFontFace,
      });

      slide.addText(c.desc, {
        x: 5.55,
        y: y + 0.4,
        w: 3.7,
        h: 0.35,
        fontSize: 9,
        color: theme.mutedText,
        fontFace: theme.bodyFontFace,
      });
    });
  }

  private buildLeaseStatusSlide(
    pptx: PptxGenJS,
    slides: any[],
    theme: PptxThemeTokens,
    bodyData: any
  ) {
    const slide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
    slides.push(slide);

    this.addSlideHeader(slide, pptx, theme, 'Lease Status', '층별 임대 현황 (B1 ~ 6F)');

    const floorRows = [
      ['층', '면적', '보증금', '월 임대료', '임대 상태'],
      ['6층', '228.8㎡ (약 69.2평)', '5,000만 원', '500만 원', '🟩 임대중'],
      ['5층', '228.8㎡ (약 69.2평)', '5,000만 원', '480만 원', '🟩 임대중'],
      ['4층', '228.8㎡ (약 69.2평)', '6,000만 원', '450만 원', '🟩 임대중'],
      ['3층', '228.8㎡ (약 69.2평)', '6,000만 원', '450만 원', '🟩 임대중'],
      ['2층', '228.8㎡ (약 69.2평)', '1억 원', '550만 원', '🟩 임대중'],
      ['1층', '180.0㎡ (약 54.5평)', '2억 원', '600만 원', '🟩 임대중'],
      ['지하 1층', '363.98㎡ (약 110.1평)', '1억 원', '190만 원', '🟩 임대중'],
    ];

    const styledTable = floorRows.map((row, rIdx) =>
      row.map((cell, cIdx) => ({
        text: cell,
        options: {
          fontSize: 9.5,
          fontFace: theme.bodyFontFace,
          bold: rIdx === 0,
          color:
            rIdx === 0
              ? theme.tableHeaderText
              : cIdx === 4
              ? theme.statusOccupiedText
              : theme.bodyColor,
          fill: {
            color:
              rIdx === 0
                ? theme.tableHeaderBg
                : rIdx % 2 === 0
                ? theme.tableAltRowBg
                : theme.cardBackground,
          },
          border: { type: 'solid' as const, pt: 0.5, color: theme.tableBorder },
          align: cIdx === 0 || cIdx === 4 ? ('center' as const) : ('left' as const),
          valign: 'middle' as const,
        },
      }))
    );

    slide.addTable(styledTable, {
      x: 0.6,
      y: 1.3,
      w: 8.8,
      rowH: [0.35, 0.38, 0.38, 0.38, 0.38, 0.38, 0.38, 0.38],
      colW: [1.2, 2.5, 1.8, 1.8, 1.5],
    });
  }

  private buildIncomeAnalysisSlide(
    pptx: PptxGenJS,
    slides: any[],
    theme: PptxThemeTokens,
    bodyData: any
  ) {
    const slide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
    slides.push(slide);

    this.addSlideHeader(slide, pptx, theme, 'Income & Yield Analysis', '수익성 분석 및 부가수입 구조');

    const incomeRows = [
      ['구분', '월 수입', '연간 수입 (원)', '비중 (%) / 출처'],
      ['임대료 수입 (월세)', '3,220만 원', '38,640만 원', '93.6% (전 층 임대료)'],
      ['통신장비 임대료', '연 1,550만 원', '1,550만 원', '3.8% (옥상 옥외안테나)'],
      ['통신장비 전기료 수입', '연 1,090만 원', '1,090만 원', '2.6% (전기료 정산수입)'],
      ['총 합계 (Gross Income)', '약 3,440만 원', '41,280만 원', '100.0%'],
      ['순영업수익 (NOI 추정)', '약 3,096만 원', '37,152만 원', 'Cap Rate 약 4.2%'],
    ];

    const styledRows = incomeRows.map((row, rIdx) =>
      row.map((cell, cIdx) => ({
        text: cell,
        options: {
          fontSize: 10,
          fontFace: theme.bodyFontFace,
          bold: rIdx === 0 || rIdx >= 4,
          color:
            rIdx === 0
              ? theme.tableHeaderText
              : rIdx >= 4
              ? theme.headingColor
              : theme.bodyColor,
          fill: {
            color:
              rIdx === 0
                ? theme.tableHeaderBg
                : rIdx >= 4
                ? theme.accentBg
                : rIdx % 2 === 0
                ? theme.tableAltRowBg
                : theme.cardBackground,
          },
          border: { type: 'solid' as const, pt: 0.5, color: theme.tableBorder },
          valign: 'middle' as const,
        },
      }))
    );

    slide.addTable(styledRows, {
      x: 0.6,
      y: 1.3,
      w: 8.8,
      rowH: [0.38, 0.42, 0.42, 0.42, 0.45, 0.45],
      colW: [2.5, 1.8, 2.0, 2.5],
    });
  }

  private buildInvestmentThesisSlide(
    pptx: PptxGenJS,
    slides: any[],
    theme: PptxThemeTokens,
    bodyData: any
  ) {
    const slide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
    slides.push(slide);

    this.addSlideHeader(slide, pptx, theme, 'Investment Thesis & Risk', '투자 포인트 및 리스크 점검');

    // Left Box: Key Investment Points
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.6,
      y: 1.3,
      w: 4.2,
      h: 3.6,
      rectRadius: 0.08,
      fill: { color: theme.cardBackground },
      line: { color: theme.cardBorder, width: 1 },
    });

    slide.addText('💡 핵심 투자 포인트', {
      x: 0.8,
      y: 1.45,
      w: 3.8,
      h: 0.3,
      fontSize: 12,
      bold: true,
      color: theme.headingColor,
      fontFace: theme.bodyFontFace,
    });

    const thesisItems = [
      '1. 서초동 법조타운 인근 우수한 임차수요 및 직주근접 입지',
      '2. 연 2,640만원 부가수입(통신장비/전기료)을 통한 수익률 보강',
      '3. 제3종일반주거지역 용적률 여유로 향후 Value-add 가능',
      '4. 전 층 100% 임대 중으로 안정적 캐시플로우 창출',
    ];
    thesisItems.forEach((item, idx) => {
      slide.addText(item, {
        x: 0.8,
        y: 1.9 + idx * 0.7,
        w: 3.8,
        h: 0.6,
        fontSize: 9.5,
        color: theme.bodyColor,
        fontFace: theme.bodyFontFace,
      });
    });

    // Right Box: Risk & Check Items
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 5.2,
      y: 1.3,
      w: 4.2,
      h: 3.6,
      rectRadius: 0.08,
      fill: { color: theme.cardBackground },
      line: { color: theme.cardBorder, width: 1 },
    });

    slide.addText('🛡️ 리스크 및 체크사항', {
      x: 5.4,
      y: 1.45,
      w: 3.8,
      h: 0.3,
      fontSize: 12,
      bold: true,
      color: theme.headingColor,
      fontFace: theme.bodyFontFace,
    });

    const riskItems = [
      '1. 준공 1990년 자산으로 향후 시설 유지보수 비용 검토 필요',
      '2. 통신장비 임대차 계약 주기 및 만기 정산 조건 사전 확인',
      '3. 매매가 300억원 대출 실행 시 LTV 50~60% 구간 권장',
      '4. 공부상 위반건축물 여부 확인 완료 (이상 없음)',
    ];
    riskItems.forEach((item, idx) => {
      slide.addText(item, {
        x: 5.4,
        y: 1.9 + idx * 0.7,
        w: 3.8,
        h: 0.6,
        fontSize: 9.5,
        color: theme.bodyColor,
        fontFace: theme.bodyFontFace,
      });
    });
  }

  private async buildPhotoGallerySlide(
    pptx: PptxGenJS,
    slides: any[],
    theme: PptxThemeTokens,
    bodyData: any,
    warnings: string[]
  ) {
    const slide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
    slides.push(slide);

    this.addSlideHeader(slide, pptx, theme, 'Property Showcase', '건물 외관 및 내부 전경');

    const photoUrls = bodyData.photoUrls || bodyData.photos || [];
    const optimized = await optimizeImagesForPptx(photoUrls, 4);

    if (optimized.length > 0) {
      if (optimized.length === 1) {
        slide.addImage({ data: optimized[0].base64, x: 0.6, y: 1.3, w: 8.8, h: 3.6 });
      } else if (optimized.length === 2) {
        slide.addImage({ data: optimized[0].base64, x: 0.6, y: 1.3, w: 4.3, h: 3.6 });
        slide.addImage({ data: optimized[1].base64, x: 5.1, y: 1.3, w: 4.3, h: 3.6 });
      } else {
        slide.addImage({ data: optimized[0].base64, x: 0.6, y: 1.3, w: 4.3, h: 1.7 });
        if (optimized.length > 1) slide.addImage({ data: optimized[1].base64, x: 5.1, y: 1.3, w: 4.3, h: 1.7 });
        if (optimized.length > 2) slide.addImage({ data: optimized[2].base64, x: 0.6, y: 3.2, w: 4.3, h: 1.7 });
        if (optimized.length > 3) slide.addImage({ data: optimized[3].base64, x: 5.1, y: 3.2, w: 4.3, h: 1.7 });
      }
    } else {
      // Photo Placeholder Box
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.6,
        y: 1.3,
        w: 8.8,
        h: 3.6,
        rectRadius: 0.1,
        fill: { color: theme.cardBackground },
        line: { color: theme.cardBorder, width: 1 },
      });
      slide.addText('📷 대표 이미지 및 현장 사진 보유 자산', {
        x: 0.6,
        y: 2.8,
        w: 8.8,
        h: 0.5,
        align: 'center',
        fontSize: 14,
        color: theme.mutedText,
        fontFace: theme.bodyFontFace,
      });
    }
  }

  private async buildContactSlide(
    pptx: PptxGenJS,
    slides: any[],
    theme: PptxThemeTokens,
    input: MobileImPptxInput,
    warnings: string[]
  ) {
    const slide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
    slides.push(slide);

    this.addSlideHeader(slide, pptx, theme, 'Advisor & Contact', '매각 전담 브로커 및 문의처');

    // Left Contact Card
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.6,
      y: 1.3,
      w: 5.5,
      h: 3.6,
      rectRadius: 0.1,
      fill: { color: theme.cardBackground },
      line: { color: theme.cardBorder, width: 1 },
    });

    const broker = input.broker || {};
    slide.addText(broker.display_name || '크리딜 전담 브로커', {
      x: 0.9,
      y: 1.6,
      w: 4.9,
      h: 0.5,
      fontSize: 22,
      bold: true,
      color: theme.headingColor,
      fontFace: theme.titleFontFace,
    });

    slide.addText(broker.company_name || '크리딜 매각자문 파트너스', {
      x: 0.9,
      y: 2.2,
      w: 4.9,
      h: 0.35,
      fontSize: 13,
      color: theme.subheadingColor,
      fontFace: theme.bodyFontFace,
    });

    slide.addText(`📞 직통 연락처: ${broker.phone || '02-1234-5678'}`, {
      x: 0.9,
      y: 2.7,
      w: 4.9,
      h: 0.35,
      fontSize: 12,
      color: theme.bodyColor,
      fontFace: theme.bodyFontFace,
    });

    slide.addText(`🏢 전문 분야: ${broker.specialty || '서초/강남 권역 근생건물 매각 전문'}`, {
      x: 0.9,
      y: 3.2,
      w: 4.9,
      h: 0.35,
      fontSize: 11,
      color: theme.mutedText,
      fontFace: theme.bodyFontFace,
    });

    // Right Mobile IM QR Card
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 6.4,
      y: 1.3,
      w: 3.0,
      h: 3.6,
      rectRadius: 0.1,
      fill: { color: theme.cardBackground },
      line: { color: theme.cardBorder, width: 1 },
    });

    slide.addText('📱 Mobile IM 바로가기', {
      x: 6.4,
      y: 1.5,
      w: 3.0,
      h: 0.3,
      align: 'center',
      fontSize: 11,
      bold: true,
      color: theme.headingColor,
      fontFace: theme.bodyFontFace,
    });

    try {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://cre-dealcard.vercel.app/im-lite/${input.buildingId}`;
      const qrImg = await optimizeImageForPptx(qrUrl, 160, 100);
      if (qrImg) {
        slide.addImage({ data: qrImg.base64, x: 7.0, y: 1.9, w: 1.8, h: 1.8 });
      }
    } catch (e) {
      warnings.push('QR code generation failed');
    }

    slide.addText('스캔 시 모바일 IM 상세 열람', {
      x: 6.4,
      y: 3.9,
      w: 3.0,
      h: 0.3,
      align: 'center',
      fontSize: 9,
      color: theme.mutedText,
      fontFace: theme.bodyFontFace,
    });
  }

  // ── Pro Exclusive Slides ──

  private buildProFloorLeasesSlide(
    pptx: PptxGenJS,
    slides: any[],
    theme: PptxThemeTokens,
    bodyData: any
  ) {
    const slide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
    slides.push(slide);

    this.addSlideHeader(slide, pptx, theme, 'Rent Roll Granular Detail (Pro)', '호실별 렌트롤 및 임차인 세부 (Pro 전용)');

    const rentRollRows = [
      ['층', '업종/용도', '보증금(만원)', '월세(만원)', '계약 만기', '상태'],
      ['6층', '업무시설 (사무실)', '5,000만', '500만', '2027.05', '🟩 정상'],
      ['5층', 'IT 오피스', '5,000만', '480만', '2026.11', '🟩 정상'],
      ['4층', '세무회계 사무소', '6,000만', '450만', '2027.02', '🟩 정상'],
      ['3층', '법률사무소', '6,000만', '450만', '2026.08', '🟩 정상'],
      ['2층', '의원 (병의원)', '10,000만', '550만', '2028.10', '🟩 장기'],
      ['1층', 'F&B (리테일)', '20,000만', '600만', '2027.12', '🟩 우량'],
      ['B1', '근생 / 창고', '10,000만', '190만', '2026.04', '🟩 정상'],
    ];

    const styledRows = rentRollRows.map((row, rIdx) =>
      row.map((cell, cIdx) => ({
        text: cell,
        options: {
          fontSize: 9,
          fontFace: theme.bodyFontFace,
          bold: rIdx === 0,
          color: rIdx === 0 ? theme.tableHeaderText : theme.bodyColor,
          fill: {
            color:
              rIdx === 0
                ? theme.tableHeaderBg
                : rIdx % 2 === 0
                ? theme.tableAltRowBg
                : theme.cardBackground,
          },
          border: { type: 'solid' as const, pt: 0.5, color: theme.tableBorder },
          align: cIdx === 0 || cIdx >= 4 ? ('center' as const) : ('left' as const),
          valign: 'middle' as const,
        },
      }))
    );

    slide.addTable(styledRows, {
      x: 0.6,
      y: 1.3,
      w: 8.8,
      rowH: [0.35, 0.38, 0.38, 0.38, 0.38, 0.38, 0.38, 0.38],
      colW: [1.0, 2.3, 1.6, 1.6, 1.2, 1.1],
    });
  }

  private buildProRightsAnalysisSlide(
    pptx: PptxGenJS,
    slides: any[],
    theme: PptxThemeTokens,
    bodyData: any
  ) {
    const slide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
    slides.push(slide);

    this.addSlideHeader(slide, pptx, theme, 'Rights & Title Analysis (Pro)', '권리분석 및 등기부 권리제한 (Pro 전용)');

    const rightsRows = [
      ['구분', '내용', '위험도 / 영향', '조치 방향'],
      ['소유권', '단독 소유 (개인/법인)', '🟢 정상', '즉시 매매 계약 가능'],
      ['근저당권', '설정액 확인 필요 (대출 미기재)', '🟡 확인 필요', '잔금 시 말소 조건 계약'],
      ['임차권 설정', '전 층 대항력 있는 임차인', '🟢 양호', '임대차 승계 승인 조건'],
      ['위반건축물', '건축물대장상 위반내역 없음', '🟢 정상', '이행강제금 리스크 없음'],
    ];

    const styledRows = rightsRows.map((row, rIdx) =>
      row.map((cell, cIdx) => ({
        text: cell,
        options: {
          fontSize: 9.5,
          fontFace: theme.bodyFontFace,
          bold: rIdx === 0,
          color: rIdx === 0 ? theme.tableHeaderText : theme.bodyColor,
          fill: {
            color:
              rIdx === 0
                ? theme.tableHeaderBg
                : rIdx % 2 === 0
                ? theme.tableAltRowBg
                : theme.cardBackground,
          },
          border: { type: 'solid' as const, pt: 0.5, color: theme.tableBorder },
          valign: 'middle' as const,
        },
      }))
    );

    slide.addTable(styledRows, {
      x: 0.6,
      y: 1.3,
      w: 8.8,
      rowH: [0.38, 0.45, 0.45, 0.45, 0.45],
      colW: [1.8, 2.5, 2.0, 2.5],
    });
  }

  private buildProLoanSimulationSlide(
    pptx: PptxGenJS,
    slides: any[],
    theme: PptxThemeTokens,
    bodyData: any
  ) {
    const slide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
    slides.push(slide);

    this.addSlideHeader(slide, pptx, theme, 'Loan Simulation (Pro)', '대출 LTV 시뮬레이션 비교 (Pro 전용)');

    const loanRows = [
      ['LTV 시나리오', '대출금액', '자기자본', '월 원리금', 'DSCR', 'CoC 수익률'],
      ['LTV 30%', '90억 원', '203.3억 원', '약 5,900만', '2.1x (안전)', '5.8%'],
      ['LTV 40%', '120억 원', '173.3억 원', '약 7,900만', '1.7x (양호)', '6.4%'],
      ['LTV 50% ✅ (권장)', '150억 원', '143.3억 원', '약 9,900만', '1.4x (적정)', '7.2%'],
      ['LTV 60%', '180억 원', '113.3억 원', '약 11,800만', '1.1x (주의)', '8.1%'],
    ];

    const styledRows = loanRows.map((row, rIdx) =>
      row.map((cell, cIdx) => ({
        text: cell,
        options: {
          fontSize: 9.5,
          fontFace: theme.bodyFontFace,
          bold: rIdx === 0 || rIdx === 3,
          color: rIdx === 0 ? theme.tableHeaderText : theme.bodyColor,
          fill: {
            color:
              rIdx === 0
                ? theme.tableHeaderBg
                : rIdx === 3
                ? theme.accentBg
                : rIdx % 2 === 0
                ? theme.tableAltRowBg
                : theme.cardBackground,
          },
          border: { type: 'solid' as const, pt: 0.5, color: theme.tableBorder },
          align: cIdx === 0 ? ('center' as const) : ('left' as const),
          valign: 'middle' as const,
        },
      }))
    );

    slide.addTable(styledRows, {
      x: 0.6,
      y: 1.3,
      w: 8.8,
      rowH: [0.38, 0.45, 0.45, 0.45, 0.45],
      colW: [2.0, 1.4, 1.4, 1.4, 1.3, 1.3],
    });
  }

  private buildProTaxScenariosSlide(
    pptx: PptxGenJS,
    slides: any[],
    theme: PptxThemeTokens,
    bodyData: any
  ) {
    const slide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
    slides.push(slide);

    this.addSlideHeader(slide, pptx, theme, 'Tax Scenarios (Pro)', '개인 vs 법인 세금 시나리오 (Pro 전용)');

    const taxRows = [
      ['구분', '개인 취득', '법인 취득 ✅ (권장)', '비고 및 전략'],
      ['취득세 (4.6%)', '13.8억 원', '13.8억 원 (중과 미적용)', '동일 조건'],
      ['연간 소득세/법인세', '누진세율 6~45%', '법인세율 9~24%', '법인이 15%p+ 절세 효과'],
      ['감가상각 비용처리', '한도 제한', '건물분 감가상각 공제', '과세표준 축소 가능'],
      ['5년 보유 총 세금', '약 28.5억 원', '약 21.2억 원', '법인 취득 시 약 7.3억 절감'],
    ];

    const styledRows = taxRows.map((row, rIdx) =>
      row.map((cell, cIdx) => ({
        text: cell,
        options: {
          fontSize: 9.5,
          fontFace: theme.bodyFontFace,
          bold: rIdx === 0 || cIdx === 2,
          color: rIdx === 0 ? theme.tableHeaderText : theme.bodyColor,
          fill: {
            color:
              rIdx === 0
                ? theme.tableHeaderBg
                : cIdx === 2
                ? theme.accentBg
                : rIdx % 2 === 0
                ? theme.tableAltRowBg
                : theme.cardBackground,
          },
          border: { type: 'solid' as const, pt: 0.5, color: theme.tableBorder },
          valign: 'middle' as const,
        },
      }))
    );

    slide.addTable(styledRows, {
      x: 0.6,
      y: 1.3,
      w: 8.8,
      rowH: [0.38, 0.45, 0.45, 0.45, 0.45],
      colW: [2.0, 2.0, 2.2, 2.6],
    });
  }

  private buildDisclaimerSlide(
    pptx: PptxGenJS,
    slides: any[],
    theme: PptxThemeTokens
  ) {
    const slide = pptx.addSlide({ masterName: 'CREDEAL_MASTER' });
    slides.push(slide);

    slide.background = { fill: theme.footerBackground };

    slide.addText('Disclaimer & Legal Notice', {
      x: 0.6,
      y: 1.5,
      w: 8.8,
      h: 0.5,
      align: 'center',
      fontSize: 18,
      bold: true,
      color: '#FFFFFF',
      fontFace: theme.titleFontFace,
    });

    slide.addText(
      '본 Investment Memorandum은 정보 제공 목적으로 AI 분석 엔진에 의해 자동 생성되었습니다.\n제시된 수치, 임대차 현황, 금융/세금 시나리오는 추정치이므로 실제 매매 계약 시 공부 및 실사를 통한 확인이 필요합니다.',
      {
        x: 0.6,
        y: 2.3,
        w: 8.8,
        h: 0.8,
        align: 'center',
        fontSize: 11,
        color: theme.mutedText,
        fontFace: theme.bodyFontFace,
      }
    );

    slide.addText(`${theme.companyName}  |  ${theme.companyTagline}`, {
      x: 0.6,
      y: 3.4,
      w: 8.8,
      h: 0.4,
      align: 'center',
      fontSize: 13,
      bold: true,
      color: theme.accentColor,
      fontFace: theme.bodyFontFace,
    });

    slide.addText('Thank You', {
      x: 0.6,
      y: 4.2,
      w: 8.8,
      h: 0.5,
      align: 'center',
      fontSize: 18,
      bold: true,
      color: '#FFFFFF',
      fontFace: theme.titleFontFace,
    });
  }

  // ── Helper Utilities ──

  private addSlideHeader(
    slide: any,
    pptx: PptxGenJS,
    theme: PptxThemeTokens,
    titleEn: string,
    titleKr: string
  ) {
    // Top Left Accent Pill
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.6,
      y: 0.45,
      w: 0.08,
      h: 0.55,
      fill: { color: theme.accentColor },
    });

    // English Category Title
    slide.addText(titleEn.toUpperCase(), {
      x: 0.8,
      y: 0.45,
      w: 7,
      h: 0.25,
      fontSize: 9,
      bold: true,
      color: theme.mutedText,
      fontFace: theme.bodyFontFace,
    });

    // Korean Section Title
    slide.addText(titleKr, {
      x: 0.8,
      y: 0.65,
      w: 7,
      h: 0.35,
      fontSize: 18,
      bold: true,
      color: theme.headingColor,
      fontFace: theme.titleFontFace,
    });
  }

  private applyWatermark(
    slides: any[],
    theme: PptxThemeTokens,
    watermark: { requesterName: string; phoneLast4: string; timestamp: string }
  ) {
    const text = `${watermark.requesterName} · ${watermark.phoneLast4} · ${watermark.timestamp}`;
    const positions = [
      { x: 0.5, y: 1.0 },
      { x: 3.5, y: 0.5 },
      { x: 6.5, y: 1.5 },
      { x: 1.0, y: 3.5 },
      { x: 4.0, y: 3.0 },
      { x: 7.0, y: 4.0 },
    ];

    for (const slide of slides) {
      for (const pos of positions) {
        slide.addText(text, {
          x: pos.x,
          y: pos.y,
          w: 4,
          h: 0.4,
          fontSize: 10,
          color: theme.watermarkColor,
          fontFace: theme.bodyFontFace,
          rotate: -35,
          transparency: 80,
        });
      }
    }
  }
}

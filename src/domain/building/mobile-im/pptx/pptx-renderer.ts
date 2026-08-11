/**
 * @file pptx-renderer.ts
 * @description CREDEAL PPTX 렌더러 — 슬림 오케스트레이터
 *
 * 기존 17개 build*Slide 메서드를 전면 교체.
 * imlib.ts 컴포넌트 + 아키타입 레지스트리 + 덱 시퀀서로 동작.
 */
import PptxGenJS from 'pptxgenjs';
import { getPptxTheme, getPptxThemeAsync, type PptxThemeTokens } from './pptx-theme';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ARCHETYPE_REGISTRY, type ArchetypeInput } from './archetypes';
import { buildDeckSequence, type DeckSequenceInput, type SlideSpec } from './deck-sequencer';
import { bindSectionData } from './data-binder';
import { validateTextBudgets } from './text-budget';
import type { ProvenanceKind } from './imlib';
import type { InvestmentPosture } from '@/domain/ontology';

import { stripMarkdown } from './data-binder';
import { M, CW, KR, NUM, C, setActiveTheme } from './imlib';

/**
 * 아키타입 빌더가 본문을 렌더링하지 못한 경우의 고품질 폴백.
 * 
 * markdown을 파싱하여:
 * - 테이블 → PptxGenJS addTable로 렌더링
 * - 불릿 리스트 → 구조화된 텍스트 블록
 * - 일반 텍스트 → 정돈된 단락
 */
function addFallbackContent(slide: any, data: any, _theme: any) {
  const shapes = slide._slideObjects || slide._shapes || [];
  const hasBodyShapes = shapes.some((s: any) => {
    const y = s?.options?.y ?? s?.y ?? 0;
    const h = s?.options?.h ?? s?.h ?? 0;
    // Only count shapes in the body area (between header and footer)
    return y >= 1.5 && y < 6.5 && h > 0.1;
  });

  if (hasBodyShapes || !data.content) return;

  const markdown: string = data.content;
  const lines = markdown.split('\n');
  let curY = 1.62;
  const maxY = 6.8;
  const bodyW = CW;
  const bodyX = M;

  // 그룹화: 테이블 블록 vs 텍스트 블록
  const blocks: Array<{type: 'table'; headers: string[]; rows: string[][]} | {type: 'text'; lines: string[]}> = [];
  let textBuf: string[] = [];
  let tableHeaders: string[] | null = null;
  let tableRows: string[][] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('|')) {
      // 테이블 행
      const cells = line.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
      if (cells.every(c => /^[-:]+$/.test(c))) continue; // 구분선
      if (!tableHeaders) {
        // 텍스트 버퍼 플러시
        if (textBuf.length > 0) { blocks.push({type: 'text', lines: [...textBuf]}); textBuf = []; }
        tableHeaders = cells;
      } else {
        tableRows.push(cells);
      }
    } else {
      // 테이블 종료
      if (tableHeaders) {
        blocks.push({type: 'table', headers: tableHeaders, rows: [...tableRows]});
        tableHeaders = null;
        tableRows = [];
      }
      if (line.length > 0) textBuf.push(line);
    }
  }
  // 잔여 플러시
  if (tableHeaders) blocks.push({type: 'table', headers: tableHeaders, rows: tableRows});
  if (textBuf.length > 0) blocks.push({type: 'text', lines: textBuf});

  for (const block of blocks) {
    if (curY >= maxY) break;

    if (block.type === 'table') {
      const tableData = [
        block.headers.map(h => stripMarkdown(h)),
        ...block.rows.map(r => r.map(c => stripMarkdown(c)))
      ];
      const rowH = 0.32;
      const tableH = tableData.length * rowH;
      if (curY + tableH > maxY) continue;

      slide.addTable(tableData, {
        x: bodyX, y: curY, w: bodyW,
        rowH,
        fontFace: KR, fontSize: 9.5,
        border: { type: 'solid', pt: 0.5, color: 'DDE3E8' },
        autoPage: true,
        autoPageRepeatHeader: true,
        autoPageLineWeight: 0.5,
        autoPageCharWeight: 0.25,
        margin: [0.05, 0.1, 0.05, 0.1],
      });
      // 헤더 행 스타일링 (첫 행)
      curY += tableH + 0.2;
    } else {
      // 텍스트 블록: 헤더, 불릿, 일반 텍스트를 구분하여 렌더링
      for (const line of block.lines) {
        if (curY >= maxY) break;

        // 헤더 (### 또는 ##)
        if (line.startsWith('#')) {
          const level = (line.match(/^#+/) || [''])[0].length;
          const text = stripMarkdown(line.replace(/^#+\s*/, ''));
          if (!text) continue;
          const fontSize = level <= 2 ? 14 : 12;
          slide.addText(text, {
            x: bodyX, y: curY, w: bodyW, h: 0.36,
            fontFace: KR, fontSize, bold: true, color: C.ink,
            margin: 0,
          });
          curY += 0.40;
          continue;
        }

        // 불릿 아이템
        if (line.startsWith('-') || line.startsWith('•') || line.startsWith('·')) {
          const text = stripMarkdown(line.replace(/^[-•·]\s*/, ''));
          if (!text) continue;
          const lineH = Math.max(0.28, Math.ceil(text.length / 70) * 0.22);
          slide.addText(text, {
            x: bodyX + 0.3, y: curY, w: bodyW - 0.3, h: lineH,
            fontFace: KR, fontSize: 10, color: C.body,
            bullet: { char: '•' },
            margin: 0, valign: 'top',
          });
          curY += lineH + 0.04;
          continue;
        }

        // blockquote (> ...)
        if (line.startsWith('>')) {
          const text = stripMarkdown(line.replace(/^>\s*/, ''));
          if (!text) continue;
          const lineH = Math.max(0.36, Math.ceil(text.length / 60) * 0.22);
          slide.addShape('rect' as any, {
            x: bodyX, y: curY, w: bodyW, h: lineH + 0.12,
            fill: { color: C.brassT }, 
          });
          slide.addShape('rect' as any, {
            x: bodyX, y: curY, w: 0.05, h: lineH + 0.12,
            fill: { color: C.brass },
          });
          slide.addText(text, {
            x: bodyX + 0.2, y: curY + 0.06, w: bodyW - 0.4, h: lineH,
            fontFace: KR, fontSize: 10, color: C.ink3,
            margin: 0, valign: 'top',
          });
          curY += lineH + 0.20;
          continue;
        }

        // 일반 텍스트
        const text = stripMarkdown(line);
        if (!text || text.length < 3) continue;
        const lineH = Math.max(0.26, Math.ceil(text.length / 70) * 0.20);
        slide.addText(text, {
          x: bodyX, y: curY, w: bodyW, h: lineH,
          fontFace: KR, fontSize: 10.5, color: C.body,
          margin: 0, valign: 'top',
        });
        curY += lineH + 0.06;
      }
    }
  }
}

export type PptxTier = 'basic' | 'pro';

export interface MobileImPptxInput {
  buildingId: string;
  tier: PptxTier;
  preset?: string;
  posture?: InvestmentPosture;
  grade?: 'A' | 'B' | 'C' | 'D';
  incomeArchetype?: 'R-INC-01' | 'R-INC-02' | 'R-INC-03' | 'R-INC-04';
  hasViolation?: boolean;
  hasJointCollateral?: boolean;
  docno?: string;
  doc: {
    title?: string;
    body: Record<string, any>;
    sections?: Array<{
      title: string;
      markdown: string;
      confidence?: string;
      boundary_note?: string;
    }>;
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
  provenance?: Record<string, ProvenanceKind>;
  supabase?: SupabaseClient;
  logoUrl?: string;  // Phase 4: 중개법인 로고 URL (Supabase Storage)
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

    // D등급: Pro만 차단, Basic은 허용
    if (input.grade === 'D' && input.tier === 'pro') {
      throw new Error('Pro IM은 B등급 이상 데이터가 필요합니다. 데이터를 보강해주세요.');
    }

    const pres = new PptxGenJS();
    // §2 — 반드시 슬라이드 추가 전에 설정
    pres.layout = 'LAYOUT_WIDE';

    const theme: PptxThemeTokens = await getPptxThemeAsync(
      input.preset ?? 'credeal_signature',
      input.supabase
    );

    // G5: 커스텀 프리셋의 logo_url을 input.logoUrl에 폴백 머지
    const resolvedLogoUrl = input.logoUrl ?? (theme as any).logoUrl;
    if (resolvedLogoUrl && !input.logoUrl) {
      input = { ...input, logoUrl: resolvedLogoUrl };
    }

    // ★ 핵심: 테마 토큰을 C/CD/KR에 주입 — 이후 모든 아키타입이 프리셋 색상 사용
    setActiveTheme(theme);

    try {
      // ── 1. 덱 시퀀스 결정 ──
      const sequenceInput: DeckSequenceInput = {
        posture: (input.posture ?? 'income') as InvestmentPosture,
        tier: input.tier,
        grade: (input.grade ?? 'B') as 'A' | 'B' | 'C',
        incomeArchetype: input.incomeArchetype,
        hasViolation: input.hasViolation,
        hasJointCollateral: input.hasJointCollateral,
        hasPhotos: (input.doc.body?.photo_urls?.length > 0) || (input.doc.body?.photos?.length > 0),
      };

      const sequence: SlideSpec[] = buildDeckSequence(sequenceInput);

      if (sequence.length === 0) {
        throw new Error('덱 시퀀스가 비어 있습니다. posture/grade 설정을 확인하세요.');
      }

      // ── 2. 섹션 데이터 바인딩 ──
      const dataMap = bindSectionData(input.doc, input.building);

      // cover/closing 데이터 보강
      const companyName = input.broker?.company_name ?? '';
      const docno = input.docno ?? '';

      dataMap['cover'] = {
        title: input.doc.title ?? '',
        content: '',
        tables: [],
        metrics: {},
        subtitle: input.building?.asset_type ?? '',
        assetType: input.building?.asset_type ?? '',
        priceBand: input.building?.price_band ?? '',
        areaSignal: input.building?.area_signal ?? '',
        brokerName: input.broker?.display_name ?? '',
        companyName,
        tags: [input.building?.asset_type, input.building?.price_band].filter(Boolean),
        docno,
        logoUrl: input.logoUrl,
        coverImageUrl: input.doc.body?.photo_urls?.[0]
          ?? input.doc.body?.photos?.[0]?.url
          ?? null,
      } as any;

      if (dataMap['location']) {
        (dataMap['location'] as any).coordinates = input.doc.body?.coordinates ?? null;
        (dataMap['location'] as any).mapImageUrl = input.doc.body?.mapImageUrl ?? null;
      }

      // 면책 조항과 provenance 배지 설명은 법적 고정 텍스트 (§10, §18)
      // 사용자 입력이 있으면 우선 적용, 없으면 기본값 사용
      const disclaimerText = input.doc.body?.disclaimer
        ?? input.doc.body?.closingDisclaimer
        ?? '본 자료는 투자 권유가 아니며, 기재된 정보의 정확성을 보증하지 않습니다.';

      dataMap['closing'] = {
        title: input.doc.body?.closingTitle ?? '표기 기준 및 면책',
        content: '',
        tables: [],
        metrics: {},
        disclaimer: disclaimerText,
        footerText: companyName ? `${companyName} · ${docno}` : docno,
        logoUrl: input.logoUrl,
        badges: input.doc.body?.provenanceBadges ?? [
          // §10 provenance 배지 — 법적 고정 라벨
          { label: '✓ 공부확인', description: '등기부·대장 등 공적 장부 직접 확인', score: '1.00' },
          { label: '★ 전문가검증', description: '세무사·감정평가사 등 전문가 확인', score: '0.95' },
          { label: '▲ 매도인고지', description: '매도인이 구두 또는 서면으로 고지', score: '0.65' },
          { label: '● 중개인입력', description: '중개인 현장 조사 및 경험 기반 입력', score: '0.60' },
          { label: '◇ AI추정·가정', description: '시나리오 분석 및 AI 모델 추정', score: '0.30' },
        ],
      } as any;

      // ── 갤러리 데이터 ──
      const photoUrls = input.doc.body?.photo_urls ?? [];
      const photos = input.doc.body?.photos ?? [];
      dataMap['gallery'] = {
        title: '건물 사진',
        content: '',
        tables: [],
        metrics: {},
        photoUrls,
        photos,
      } as any;

      // heroCard 데이터를 summary에 매핑
      const heroCard = input.doc.body?.heroCard ?? {};
      if (!dataMap['summary']) {
        dataMap['summary'] = {
          title: '핵심 투자 지표',
          content: '',
          tables: [],
          metrics: {},
          leadSentence: heroCard.hookText ?? '',
          callouts: [],
        } as any;
      }
      (dataMap['summary'] as any).heroCard = heroCard;

      // ── 3. 아키타입별 슬라이드 생성 ──
      const slides: any[] = [];
      let pageNum = 1;
      const watermarkText = input.watermark
        ? `${input.watermark.requesterName} · ${input.watermark.phoneLast4} · ${input.watermark.timestamp}`
        : undefined;

      for (const spec of sequence) {
        if (spec.suppress) continue;

        const builder = ARCHETYPE_REGISTRY[spec.archetype];
        if (!builder) {
          warnings.push(`아키타입 ${spec.archetype} 빌더를 찾을 수 없습니다.`);
          continue;
        }

        const archetypeInput: ArchetypeInput = {
          pres,
          slideNum: pageNum,
          docno,
          watermarkText: input.tier === 'pro' ? watermarkText : undefined,
          data: {
            ...(dataMap[spec.dataKey] ?? {}),
            kicker: spec.kicker,
            // cover/closing은 dataMap에 실제 제목(건물명, 마감 제목)이 있으므로 우선 사용
            title: (dataMap[spec.dataKey] as any)?.title || spec.title,
          },
          grade: (input.grade ?? 'B') as 'A' | 'B' | 'C',
          provenance: input.provenance ?? {},
        };

        try {
          const result = await Promise.resolve(builder(archetypeInput));
          addFallbackContent(result.slide, archetypeInput.data, theme);
          slides.push(result.slide);
          warnings.push(...result.warnings);
          pageNum++;
        } catch (err) {
          warnings.push(
            `슬라이드 ${spec.archetype}(${spec.title}) 생성 실패: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      if (slides.length === 0) {
        throw new Error('생성된 슬라이드가 없습니다.');
      }

      // ── 4. 텍스트 예산 검증 ──
      // 각 슬라이드의 텍스트 요소를 수집하여 검증
      const textItems: { type: string; text: string }[] = [];
      if (input.doc.title) {
        textItems.push({ type: 'slideTitle', text: input.doc.title });
      }
      const budgetWarnings = validateTextBudgets(textItems);
      warnings.push(...budgetWarnings);

      // ── 5. 출력 ──
      const buffer = (await pres.write({
        outputType: 'nodebuffer',
        compression: true,
      })) as Buffer;

      return {
        buffer,
        slideCount: slides.length,
        fileSizeBytes: buffer.length,
        generatedAt: new Date().toISOString(),
        warnings,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('D등급')) {
        throw error;
      }
      throw new Error(
        `PPTX 렌더링 실패 (프리셋: ${theme.presetName ?? input.preset}): ` +
          (error instanceof Error ? error.message : String(error))
      );
    }
  }
}

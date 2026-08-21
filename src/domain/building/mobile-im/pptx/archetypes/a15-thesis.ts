/**
 * @file a15-thesis.ts
 * @description A15 Thesis (투자 포인트) 전용 프리미엄 템플릿
 *
 * 레이아웃 구조:
 *  - 상단: Header (Kicker: THESIS, Title: 투자 포인트, Subtitle: 핵심 투자 강점)
 *  - 중앙 (Hero Area): 4대 핵심 투자 강점 2×2 그리드 카드 (또는 3열 가로 카드)
 *     * 각 카드: Accent Number Badge (01, 02..), 강점 타이틀(Bold), 상세 서술(Body)
 *  - 하단 (Secondary Takeaway): 마무리멘트 / 종합 가치 제안 전폭 리본 배너
 */

import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, CD, M, CW, KR, TITLE_KR, NUM, col, colX } from '../imlib';
import type { ProvenanceKind } from '../imlib';

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

export interface ThesisPillar {
  number?: string;
  title: string;
  body: string;
}

export function buildA15Thesis(input: ArchetypeInput): ArchetypeOutput {
  const slide = L.light(input.pres);
  const warnings: string[] = [];

  const kicker = input.data.kicker || 'THESIS';
  const title = input.data.title || '투자 포인트';
  const subtitle = input.data.subtitle || input.data.sub || input.data.leadSentence || '';

  // 1. 헤더 렌더링
  L.head(slide, input.slideNum, kicker, title, subtitle);

  // 2. 강점 포인트(Pillars) 데이터 추출
  let pillars: ThesisPillar[] = input.data.pillars || [];

  if (pillars.length === 0) {
    // right.stats 또는 content에서 파싱
    const rawStats = input.data.right?.stats || input.data.metrics || [];
    if (rawStats.length > 0) {
      pillars = rawStats.map((s: any, idx: number) => ({
        number: String(idx + 1).padStart(2, '0'),
        title: s.label || `핵심 강점 ${idx + 1}`,
        body: s.value || s.sub || '',
      }));
    } else if (input.data.content) {
      const rawLines = String(input.data.content).split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 3 && !l.startsWith('#') && !/^[-*_]{3,}$/.test(l));

      const listLines = rawLines.filter(l => l.match(/^\d+[.、)]\s*/) || l.startsWith('-') || l.startsWith('•'));
      pillars = listLines.map((l, idx) => {
        const stripped = l.replace(/^\d+[.、)]\s*/, '').replace(/^[-•·]\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1').trim();
        const parts = stripped.split(/[：:]/);
        return {
          number: String(idx + 1).padStart(2, '0'),
          title: (parts[0] || `투자 포인트 ${idx + 1}`).trim(),
          body: (parts.slice(1).join(':') || parts[0]).trim(),
        };
      });
    }
  }

  // 기본 강점 카드 (최대 4개)
  const displayPillars = pillars.slice(0, 4);
  const pillarCount = displayPillars.length;

  const startY = subtitle ? 1.62 : 1.45;
  const gridH = 3.80;

  if (pillarCount > 0) {
    if (pillarCount <= 3) {
      // 3개 이하: 가로 3단 카드 (1행 3열)
      const gap = 0.35;
      const cardW = col(pillarCount, gap);
      const cardH = gridH;

      displayPillars.forEach((p, idx) => {
        const x = colX(idx, cardW, gap);
        const y = startY;

        // 카드 배경
        slide.addShape('roundRect' as any, {
          x, y, w: cardW, h: cardH,
          rectRadius: 0.08,
          fill: { color: C.tint },
          line: { color: C.line, width: 0.8 },
        });

        // 상단 액센트 바
        slide.addShape('rect' as any, {
          x, y, w: cardW, h: 0.06,
          fill: { color: C.brass },
        });

        // 넘버 배지
        const numText = p.number || String(idx + 1).padStart(2, '0');
        slide.addShape('roundRect' as any, {
          x: x + 0.25, y: y + 0.30, w: 0.52, h: 0.32,
          rectRadius: 0.04,
          fill: { color: C.brassL },
        });
        slide.addText(numText, {
          x: x + 0.25, y: y + 0.30, w: 0.52, h: 0.32,
          fontSize: 11, bold: true, color: C.brassD, fontFace: NUM,
          align: 'center', valign: 'middle', margin: 0,
        });

        // 강점 타이틀
        slide.addText(p.title, {
          x: x + 0.25, y: y + 0.78, w: cardW - 0.50, h: 0.40,
          fontSize: 15, bold: true, color: C.ink, fontFace: TITLE_KR,
          margin: 0, valign: 'top',
        });

        // 구분선
        slide.addShape('line' as any, {
          x: x + 0.25, y: y + 1.25, w: cardW - 0.50, h: 0,
          line: { color: C.line, width: 0.5 },
        });

        // 상세 설명
        slide.addText(p.body, {
          x: x + 0.25, y: y + 1.42, w: cardW - 0.50, h: cardH - 1.65,
          fontSize: 12, color: C.body, fontFace: KR,
          margin: 0, valign: 'top', lineSpacingMultiple: 1.30,
        });
      });
    } else {
      // 4개: 2×2 그리드 카드 (Hero Emphasis)
      const gapX = 0.35;
      const gapY = 0.25;
      const cols = 2;
      const cardW = col(cols, gapX);
      const cardH = (gridH - gapY) / 2; // 약 1.80

      displayPillars.forEach((p, idx) => {
        const row = Math.floor(idx / cols);
        const colIdx = idx % cols;
        const x = colX(colIdx, cardW, gapX);
        const y = startY + row * (cardH + gapY);

        // 카드 배경
        slide.addShape('roundRect' as any, {
          x, y, w: cardW, h: cardH,
          rectRadius: 0.08,
          fill: { color: C.tint },
          line: { color: C.line, width: 0.8 },
        });

        // 좌측 액센트 스트립
        slide.addShape('rect' as any, {
          x, y, w: 0.06, h: cardH,
          fill: { color: C.brass },
        });

        // 상단: 넘버 배지 + 강점 타이틀
        const numText = p.number || String(idx + 1).padStart(2, '0');
        slide.addShape('roundRect' as any, {
          x: x + 0.25, y: y + 0.20, w: 0.46, h: 0.28,
          rectRadius: 0.04,
          fill: { color: C.brassL },
        });
        slide.addText(numText, {
          x: x + 0.25, y: y + 0.20, w: 0.46, h: 0.28,
          fontSize: 10, bold: true, color: C.brassD, fontFace: NUM,
          align: 'center', valign: 'middle', margin: 0,
        });

        slide.addText(p.title, {
          x: x + 0.80, y: y + 0.18, w: cardW - 1.05, h: 0.32,
          fontSize: 14, bold: true, color: C.ink, fontFace: TITLE_KR,
          margin: 0, valign: 'middle',
        });

        // 상세 설명 본문 (강조 가독성 확보)
        slide.addText(p.body, {
          x: x + 0.25, y: y + 0.58, w: cardW - 0.50, h: cardH - 0.72,
          fontSize: 12, color: C.ink2, fontFace: KR,
          margin: 0, valign: 'top', lineSpacingMultiple: 1.25,
        });
      });
    }
  }

  // 2-A: 벤치마크/별점 표 렌더링 (pillar 카드 아래, takeaway 위)
  const bmTable = input.data.benchmarkTable;
  let bmTableHeight = 0;
  if (bmTable && bmTable.headers?.length >= 2 && bmTable.rows?.length >= 1) {
    const bmY = startY + gridH + 0.15;
    const bmRows = bmTable.rows.slice(0, 4); // 최대 4행
    const bmColCount = bmTable.headers.length;
    const bmColW = Array(bmColCount).fill(CW / bmColCount);
    const bmBodyRows = bmRows.map((r: string[]) => r.map((c: string) => ({ t: c || '' })));
    L.table(slide, M, bmY, CW,
      bmTable.headers,
      bmBodyRows, bmColW, { rh: 0.36, bfs: 10.5, hfs: 10.5 }
    );
    bmTableHeight = 0.36 * (bmRows.length + 1) + 0.15; // header + rows + gap
  }

  // 3. 하단 마무리멘트 / 종합 가치 제안 (Secondary Takeaway Banner)
  const takeawayText = input.data.takeaway || input.data.closingRemark || input.data.leadBody || (
    subtitle && subtitle !== title
      ? `본 자산은 우수한 입지 경쟁력과 견고한 펀더멘털을 기반으로 중장기 자산 가치 상승 및 안정적인 현금흐름을 기대할 수 있는 핵심 투자 기회입니다.`
      : `자산의 안정성과 성장성을 겸비한 우량 부동산으로, 상세 실사 단계에서 구체적인 계약 조건 및 세무 검토가 진행됩니다.`
  );

  const bannerY = startY + gridH + 0.20 + bmTableHeight;
  const bannerH = 0.88;

  // 마무리멘트 배경 리본
  slide.addShape('roundRect' as any, {
    x: M, y: bannerY, w: CW, h: bannerH,
    rectRadius: 0.06,
    fill: { color: C.brassT },
    line: { color: C.brassL, width: 0.8 },
  });

  // 좌측 라벨 태그
  slide.addText('💡 종합 가치 제안', {
    x: M + 0.20, y: bannerY + 0.12, w: 1.85, h: 0.28,
    fontSize: 10.5, bold: true, color: C.brassD, fontFace: KR, margin: 0,
  });

  // 우측 마무리멘트 텍스트
  slide.addText(takeawayText, {
    x: M + 2.10, y: bannerY + 0.08, w: CW - 2.30, h: bannerH - 0.16,
    fontSize: 11, color: C.ink, fontFace: KR, bold: false,
    margin: 0, valign: 'middle', lineSpacingMultiple: 1.25,
  });

  // 4. 워터마크 & 푸터
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);

  return { slide, warnings };
}

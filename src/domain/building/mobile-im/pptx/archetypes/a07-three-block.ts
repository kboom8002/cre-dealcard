// src/domain/building/mobile-im/pptx/archetypes/a07-three-block.ts
// A07: 3-블록 리스크 실사 (Three Block Risk Assessment) 아키타입
// Spec: Phase 4.1 리스크 체크를 위한 3개의 시각적 섹션 디자인 전면 개편

import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR, CD, THEME_META } from '../imlib';
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

export function buildA07ThreeBlock(input: ArchetypeInput): ArchetypeOutput {
  const onDark = input.data.onDark === true;
  const slide = onDark ? L.dark(input.pres) : L.light(input.pres);
  const warnings: string[] = [];

  const kicker = input.data.kicker || 'DUE DILIGENCE & RISK';
  const title = input.data.title || '핵심 투자 리스크 및 권리·물리 실사 점검';

  if (onDark) {
    L.headD(slide, input.slideNum, kicker, title);
  } else {
    L.head(slide, input.slideNum, kicker, title);
  }

  const gap = 0.28;
  let blocks = input.data.blocks || [];

  // 기본 3개 시각적 리스크 섹션 기본값 제공 (데이터 부재 시에도 체계적 프레임워크 표시)
  if (blocks.length === 0) {
    blocks = [
      {
        label: '1. 법적·공법 규제',
        value: input.data.legalStatus || '위반건축물 및 규제 점검',
        description: '• 건축물대장상 위반건축물 등재 여부 확인\n• 지구단위계획 및 용도지역 행위제한 점검\n• 도로접면 및 건축선 후퇴 필요 여부',
      },
      {
        label: '2. 임대차·명도 리스크',
        value: input.data.leaseStatus || '상임법 10년 및 대항력 점검',
        description: '• 상가임대차보호법상 10년 갱신요구권 행사 현황\n• 임차인 대항력 및 우선변제권 유무 확인\n• 명도 합의 가능성 및 리모델링/재건축 타임라인',
      },
      {
        label: '3. 물리적·시설 현황',
        value: input.data.physicalStatus || '설비 노후도 및 구조 안전',
        description: '• 승강기, 기계식 주차장 정기검사 합격 여부\n• 누수, 외벽 균열 및 주요 구조체 노후도 점검\n• 전기/수도 인입 용량 및 정화조 용량 충족 여부',
      },
    ];
  }

  const blockCount = Math.min(blocks.length, 3);
  const w = L.col(blockCount, gap);
  const h = 4.00;
  const y = 1.55;

  const headerFs = 13.5;
  const valFs = 12.5;
  const descFs = 11.0;

  const labelColor = onDark ? C.brass : C.brassD;
  const valColor = onDark ? 'FFFFFF' : C.ink;
  const descColor = onDark ? CD.body : C.body;

  blocks.slice(0, blockCount).forEach((b: any, i: number) => {
    const x = L.colX(i, w, gap);

    // 카드 베이스
    L.card(slide, x, y, w, h, { onDark });

    // 상단 브라스 강조 보더
    slide.addShape('rect' as any, { x, y, w, h: 0.05, fill: { color: C.brass } });

    // 1. 카테고리 헤더
    const cleanLabel = (b.label || `실사 영역 ${i + 1}`).replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE00}-\u{FE0F}🟢🔵🔶💡🚇🛣️🚗🏥🏢☕⚖️📋🔒⚠️🔍🛡️]/gu, '').trim();
    slide.addText(cleanLabel, {
      x: x + 0.25,
      y: y + 0.22,
      w: w - 0.5,
      h: 0.32,
      fontFace: KR,
      fontSize: headerFs,
      bold: true,
      color: labelColor,
      margin: 0,
    });

    // 2. 핵심 상태/요약
    const rawVal = (b.value || '실사 완료').replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE00}-\u{FE0F}🟢🔵🔶💡🚇🛣️🚗🏥🏢☕⚖️📋🔒⚠️🔍🛡️]/gu, '').trim();
    const valText = rawVal.slice(0, 36);
    slide.addText(valText, {
      x: x + 0.25,
      y: y + 0.58,
      w: w - 0.5,
      h: 0.40,
      fontFace: KR,
      fontSize: valFs,
      bold: true,
      color: valColor,
      margin: 0,
      fit: 'shrink' as any,
    });

    // 3. 세부 불릿 본문
    const descText = b.description || '';
    if (descText) {
      let lines = descText.split(/\n+/).map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      if (lines.length === 1 && lines[0].length > 40 && (lines[0].includes('. ') || lines[0].includes('; '))) {
        lines = lines[0].split(/(?<=[.;])\s+/).filter(Boolean);
      }
      const textRuns = lines.map((line: string, lineIdx: number) => {
        const cleanLine = line
          .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE00}-\u{FE0F}🟢🔵🔶💡🚇🛣️🚗🏥🏢☕⚖️📋🔒⚠️🔍🛡️]/gu, '')
          .replace(/^[•·\-*]+\s*/, '')
          .trim();
        return {
          text: cleanLine,
          options: {
            bullet: { code: '2022' },
            fontSize: descFs,
            color: descColor,
            fontFace: KR,
            breakLine: true,
            indentLevel: 0,
            lineSpacingMultiple: 1.25,
            paraSpaceBefore: lineIdx > 0 ? 6 : 0,
            margin: [0, 0, 0, 0],
          },
        };
      });

      if (textRuns.length > 0) {
        slide.addText(textRuns as any, {
          x: x + 0.25,
          y: y + 1.05,
          w: w - 0.5,
          h: h - 1.15,
          valign: 'top',
          margin: 0,
          shrinkText: true,
        });
      }
    }
  });

  // 4. 하단 안내 바 (y: 5.68, h: 0.68)
  const barY = 5.68;
  const barH = 0.68;
  const barBg = onDark ? CD.block : C.tint;
  const barFg = onDark ? 'FFFFFF' : C.ink;
  L.card(slide, M, barY, CW, barH, { fill: barBg, onDark });

  const bottomNotice = input.data.bottomBar?.text ||
    '※ 본 리스크 체크는 공부 및 브로커 확인 기반이며, 매수 전 전문 실사팀(변호사/건축사)을 통한 정밀 실사가 필요합니다.';
  const cleanBottomText = bottomNotice
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE00}-\u{FE0F}🟢🔵🔶💡🚇🛣️🚗🏥🏢☕⚖️📋🔒⚠️🔍🛡️]/gu, '')
    .trim();

  slide.addText(cleanBottomText, {
    x: M + 0.25,
    y: barY,
    w: CW - 0.5,
    h: barH,
    fontFace: KR,
    fontSize: 11,
    color: barFg,
    valign: 'middle',
    margin: 0,
  });

  if (input.watermarkText) L.watermark(slide, input.watermarkText, onDark);
  L.foot(slide, input.slideNum, input.docno, onDark);
  return { slide, warnings };
}

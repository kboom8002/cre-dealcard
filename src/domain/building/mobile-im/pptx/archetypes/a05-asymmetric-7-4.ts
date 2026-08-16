import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR } from '../imlib';
import type { ProvenanceKind } from '../imlib';
import { stripMarkdown } from '../data-binder';

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

export function buildA05Asymmetric74(input: ArchetypeInput): ArchetypeOutput {
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  const lw = 7.5;
  const gap = 0.393;
  const rw = CW - lw - gap;
  const rx = M + lw + gap;
  
  const left = input.data.left || {};
  
  // 우측 stat 카드 존재 여부 확인
  const rightStats = input.data.right?.stats ?? [];
  const hasRightStats = rightStats.length > 0;

  // 좌측: 부제 및 리드문/서사 렌더링
  if (left.sub) {
    L.sub(slide, M, 1.45, lw, left.sub);
  }

  // 좌측 컨텐츠 처리: 우측에 이미 카드가 있을 때는 좌측에 중복 표 대신 하이라이트 요약 또는 보완 서사 배치
  if (input.data.content) {
    const rawLines = String(input.data.content).split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 3 && !l.startsWith('#') && !/^[-*_]{3,}$/.test(l));

    // 순수 서사형 문장 (리드문)과 목록/불릿형 문장 분리
    const narrativeLines = rawLines.filter(l => 
      !l.match(/^\d+[.、)]\s*/) && 
      !l.startsWith('-') && 
      !l.startsWith('•') && 
      !l.startsWith('*') && 
      !l.startsWith('|')
    );
    const listLines = rawLines.filter(l => 
      l.match(/^\d+[.、)]\s*/) || 
      l.startsWith('-') || 
      l.startsWith('•') || 
      l.startsWith('*')
    );

    if (hasRightStats) {
      // 우측에 3~4개 카드가 있는 경우: 좌측에는 종합 투자 테제 요약문과 배경 서사 렌더링
      let leadBody = narrativeLines
        .map(l => stripMarkdown(l.replace(/^[>•·-]\s*/, '')))
        .filter(Boolean)
        .join(' ');

      if (!leadBody || leadBody.length < 15 || leadBody === left.sub) {
        leadBody = '본 자산은 우수한 입지 경쟁력과 견고한 펀더멘털을 바탕으로 안정적인 현금흐름 창출과 중장기 자산 가치 상승(Capital Gain)을 동시에 실현할 수 있는 우량 투자 기회입니다.';
      }

      L.callout(
        slide,
        M,
        left.sub ? 2.00 : 1.60,
        lw,
        3.0,
        'info',
        '핵심 투자 가치 제안 (Value Proposition)',
        leadBody
      );

      // 우측 카드와 중복되지 않는 추가 보완 지표나 특이사항이 있을 때만 하단에 간결하게 표기
      const nonDuplicateRows = listLines
        .map(l => {
          const stripped = stripMarkdown(l).replace(/^[|`\[\]\s•·\-*]+/g, '').trim();
          const parts = stripped.split(/[：:]/);
          return [parts[0].trim(), parts.slice(1).join(':').trim()] as [string, string];
        })
        .filter(([k]) => k.length > 0 && !rightStats.some((s: any) => s.label && (s.label.includes(k) || k.includes(s.label))));

      if (nonDuplicateRows.length > 0) {
        L.rows(slide, M, 4.85, lw, nonDuplicateRows.slice(0, 3), { rh: 0.38, fs: 11.5 });
      }
    } else {
      // 우측에 카드가 없는 경우: 좌측에 목록 전체를 L.rows()로 렌더링
      const rowEntries: [string, string][] = [];
      for (const line of rawLines) {
        const stripped = line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/[|`\[\]]/g, '').trim();
        if (!stripped) continue;
        const parts = stripped.split(/[：:]/);
        if (parts.length >= 2) {
          rowEntries.push([parts[0].trim(), parts.slice(1).join(':').trim()]);
        } else {
          rowEntries.push([stripped.replace(/^[-•·\d+.]\s*/, ''), '']);
        }
      }
      if (rowEntries.length > 0) {
        L.rows(slide, M, left.sub ? 1.95 : 1.55, lw, rowEntries.slice(0, 8), { rh: 0.44, fs: 13 });
      }
    }
  }
  
  // Brass 수직 구분선
  slide.addShape('line' as any, {
    x: M + lw + gap / 2, y: 1.50, w: 0, h: 5.2,
    line: { color: C.brass, width: 0.7 },
  });
  
  // 우측: stat 카드 (개수에 따른 동적 높이 및 여백 배분)
  const count = rightStats.length;
  const cardH = count >= 4 ? 1.10 : count === 3 ? 1.38 : 1.60;
  const cardGap = count >= 4 ? 0.14 : count === 3 ? 0.18 : 0.24;
  let sy = count >= 4 ? 1.68 : count === 3 ? 1.76 : 2.00;

  rightStats.forEach((s: any) => {
    L.stat(slide, rx, sy, rw, s.label ?? '', s.value ?? '', s.unit ?? '', s.sub ?? '', { h: cardH });
    sy += cardH + cardGap;
  });
  
  // 우측: callouts
  const rightCallouts = input.data.right?.callouts ?? [];
  rightCallouts.forEach((c: any) => {
    const ch = Math.max(1.2, 0.55 + Math.ceil((c.body?.length ?? 0) / 25) * 0.29);
    L.callout(slide, rx, sy, rw, ch, c.kind ?? 'info', c.title ?? '', c.body ?? '');
    sy += ch + 0.18;
  });
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}

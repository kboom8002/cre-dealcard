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
  
  const left = input.data.left || {};
  
  // 부제 (서브타이틀)
  let contentY = 1.45;
  if (left.sub) {
    L.sub(slide, M, contentY, CW, left.sub);
    contentY = 1.90;
  }

  // Brass 강조선
  slide.addShape('line' as any, {
    x: M, y: contentY, w: CW, h: 0,
    line: { color: C.brass, width: 1.5 },
  });
  contentY += 0.25;

  // ── KPI 카드: 풀폭 3-column 그리드 ──
  const rightStats = input.data.right?.stats ?? [];
  const allStats = [...rightStats];
  
  // 데이터 부족 시 content에서 추출
  if (allStats.length === 0 && input.data.content) {
    const lines = String(input.data.content).split('\n').map(l => l.trim());
    for (const line of lines) {
      const match = line.match(/\*\*(.*?)\*\*\s*[：:|]\s*(.*)/);
      if (match && allStats.length < 6) {
        allStats.push({ label: match[1].trim(), value: match[2].trim() });
      }
    }
  }

  const cols = 3;
  const cardGap = 0.18;
  const cardW = L.col(cols, cardGap);
  
  if (allStats.length > 0) {
    // 핵심 카드 (상단 행) — 최대 3개
    const row1 = allStats.slice(0, 3);
    const cardH1 = 1.30;
    row1.forEach((s: any, i: number) => {
      const x = L.colX(i, cardW, cardGap);
      // 텍스트 오버플로 방지: label 16자, value 20자, sub 40자 제한
      const safeLabel = (s.label ?? '').slice(0, 16);
      const rawValue = s.value ?? '';
      // value가 서술형 장문(20자 초과 + 한글 포함)이면 핵심 수치만 추출 시도
      let safeValue = rawValue;
      if (rawValue.length > 20 && /[가-힣]/.test(rawValue)) {
        // 괄호 안의 수치나 퍼센트를 먼저 시도
        const numMatch = rawValue.match(/[\d,.]+\s*[%억만원㎡평]+/);
        safeValue = numMatch ? numMatch[0] : rawValue.slice(0, 20) + '…';
      } else if (rawValue.length > 24) {
        safeValue = rawValue.slice(0, 23) + '…';
      }
      const safeSub = (s.sub ?? '').slice(0, 40);
      L.stat(slide, x, contentY, cardW, safeLabel, safeValue, s.unit ?? '', safeSub, { h: cardH1, vs: 22 });
    });
    contentY += cardH1 + cardGap;

    // 보조 카드 (하단 행) — 최대 3개 더
    const row2 = allStats.slice(3, 6);
    if (row2.length > 0) {
      const cardH2 = 1.15;
      row2.forEach((s: any, i: number) => {
        const x = L.colX(i, cardW, cardGap);
        const safeLabel = (s.label ?? '').slice(0, 16);
        const rawValue = s.value ?? '';
        let safeValue = rawValue;
        if (rawValue.length > 20 && /[가-힣]/.test(rawValue)) {
          const numMatch = rawValue.match(/[\d,.]+\s*[%억만원㎡평]+/);
          safeValue = numMatch ? numMatch[0] : rawValue.slice(0, 20) + '…';
        } else if (rawValue.length > 24) {
          safeValue = rawValue.slice(0, 23) + '…';
        }
        const safeSub = (s.sub ?? '').slice(0, 40);
        L.stat(slide, x, contentY, cardW, safeLabel, safeValue, s.unit ?? '', safeSub, { h: cardH2, vs: 18 });
      });
      contentY += cardH2 + cardGap;
    }
  } else {
    warnings.push('Profit stat 카드 없음');
  }

  // ── 하단: 풀폭 투자 가치 제안 콜아웃 ──
  // 컨텐츠에서 리드문 추출
  let leadBody = '';
  if (input.data.content) {
    const narrativeLines = String(input.data.content).split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 10 && !l.startsWith('#') && !l.startsWith('|') && !l.startsWith('-') && !l.startsWith('•') && !/^[-*_]{3,}$/.test(l))
      .map(l => stripMarkdown(l.replace(/^[>•·-]\s*/, '')))
      .filter(Boolean);
    leadBody = narrativeLines.join(' ');
  }
  // 면책 문구는 leadBody에서 제외
  if (leadBody.includes('AI 추정값') || leadBody.includes('투자 결정의 근거')) {
    leadBody = leadBody.replace(/아래\s*수치는.*?상이합니다\.?\s*/g, '').trim();
  }
  
  if (!leadBody || leadBody.length < 15 || leadBody === left.sub) {
    leadBody = '본 자산은 우수한 입지 경쟁력과 견고한 펀더멘털을 바탕으로 안정적인 현금흐름 창출과 중장기 자산 가치 상승을 동시에 실현할 수 있는 우량 투자 기회입니다.';
  }

  // 우측 callouts가 있으면 2-column, 없으면 풀폭
  const rightCallouts = input.data.right?.callouts ?? [];
  const calloutMaxY = 6.40;
  
  if (contentY + 1.0 <= calloutMaxY) {
    const calloutH = Math.min(1.40, calloutMaxY - contentY);
    
    if (rightCallouts.length > 0) {
      // 2-column: 투자 제안 + 추가 콜아웃
      const coGap = 0.20;
      const coW = L.col(2, coGap);
      L.callout(slide, L.colX(0, coW, coGap), contentY + 0.10, coW, calloutH, 'info', '투자 가치 제안', leadBody);
      const rc = rightCallouts[0];
      L.callout(slide, L.colX(1, coW, coGap), contentY + 0.10, coW, calloutH, rc.kind ?? 'info', rc.title ?? '', rc.body ?? '');
    } else {
      // 풀폭 콜아웃
      L.callout(slide, M, contentY + 0.10, CW, calloutH, 'info', '투자 가치 제안', leadBody);
    }
  }

  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}

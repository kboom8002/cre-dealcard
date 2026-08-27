import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR, NUM } from '../imlib';
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

export function buildA02StatGrid(input: ArchetypeInput): ArchetypeOutput {
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  // Lead sentence
  const leadSentence = input.data.leadSentence || '';
  if (leadSentence) {
    slide.addText(leadSentence, {
      x: M, y: 1.30, w: CW, h: 0.5,
      color: C.ink, fontFace: KR, fontSize: 15, bold: true,
    });
    // Brass 강조선
    slide.addShape('line' as any, {
      x: M, y: 1.85, w: CW, h: 0,
      line: { color: C.brass, width: 1.5 },
    });
  }
  
  // Stat grid
  let metrics = input.data.metrics || [];

  // 1. heroCard 데이터 우선 바인딩
  const hero = input.data.heroCard;
  if (hero && (!metrics || metrics.length === 0)) {
    metrics = [];
    if (Array.isArray(hero.stats) && hero.stats.length > 0) {
      metrics = hero.stats;
    } else {
      if (hero.askingPriceDisplay) metrics.push({ label: '매매 희망가', value: hero.askingPriceDisplay });
      if (hero.equityRequiredBil) metrics.push({ label: '필요 실투자금', value: `약 ${hero.equityRequiredBil}억 원` });
      if (hero.capRateBase) metrics.push({ label: '연 수익률(Cap Rate, 기준: NOI)', value: `${hero.capRateBase}%` });
      if (hero.leveragedYieldPct) metrics.push({ label: '자기자본수익률', value: `${hero.leveragedYieldPct}%` });
      if (metrics.length < 4 && hero.landAreaM2) metrics.push({ label: '대지면적', value: `${(hero.landAreaM2 / 3.3058).toFixed(1)}평` });
      if (metrics.length < 4 && hero.totalGrossAreaM2) metrics.push({ label: '연면적', value: `${(hero.totalGrossAreaM2 / 3.3058).toFixed(1)}평` });
      if (metrics.length < 4 && hero.zoning) metrics.push({ label: '용도지역', value: hero.zoning });
    }
  }
  
  // 2. metrics가 비어있으면 tables/content에서 추출
  if (metrics.length === 0 && input.data.tables && input.data.tables.length > 0) {
    const t = input.data.tables[0];
    for (const row of (t.rows || [])) {
      if (row.length >= 2 && metrics.length < 8) {
        const label = String(row[0] || '').replace(/\*\*/g, '');
        const value = String(row[1] || '').replace(/\*\*/g, '');
        if (label && value) metrics.push({ label, value, unit: row[2] || '' });
      }
    }
  }
  
  // 3. 그래도 없으면 content에서 key:value 패턴 추출
  if (metrics.length === 0 && input.data.content) {
    const lines = String(input.data.content).split('\n');
    for (const line of lines) {
      const match = line.match(/\*\*(.*?)\*\*\s*[：:|]\s*(.*)/);
      if (match && metrics.length < 8) {
        metrics.push({ label: match[1].trim(), value: match[2].trim(), unit: '' });
      }
    }
  }
  
  const startY = leadSentence ? 2.15 : 1.50;
  
  if (metrics.length > 0) {
    // Stat cards
    const gap = 0.20;
    const cols = Math.max(2, Math.min(4, metrics.length));
    const cardW = L.col(cols, gap);
    const cardH = 1.4;
    
    for (let i = 0; i < Math.min(8, metrics.length); i++) {
      const m = metrics[i];
      if (!m) continue;
      const row = Math.floor(i / cols);
      const colIdx = i % cols;
      const x = L.colX(colIdx, cardW, gap);
      const y = startY + row * (cardH + gap);
      
      L.stat(slide, x, y, cardW,
        String(m.label || ''),
        String(m.value || ''),
        String(m.unit || ''),
        String(m.sub || ''),
        { h: cardH, vs: 20 }
      );
    }
  } else {
    // metrics도 없으면 content를 L.rows()로 렌더링
    if (input.data.content) {
      const lines = String(input.data.content).split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 5 && !l.startsWith('#') && !l.startsWith('|'));
      const rowEntries: [string, string][] = lines.slice(0, 10).map((l: string) => {
        const stripped = l.replace(/\*\*(.*?)\*\*/g, '$1').replace(/[`\[\]]/g, '');
        return [stripped, ''] as [string, string];
      });
      if (rowEntries.length > 0) {
        L.rows(slide, M, startY, CW, rowEntries, { rh: 0.36, fs: 12 });
      }
    }
  }
  
  if (metrics.length === 0 && !input.data.content) {
    // Placeholder stat cards when no data available
    const placeholders = [
      { label: '매각 희망가', value: '—', unit: '' },
      { label: '총 수익률', value: '—', unit: '' },
      { label: '연면적', value: '—', unit: '' },
      { label: '공실률', value: '—', unit: '' },
    ];
    const gap = 0.20;
    const cardW = L.col(4, gap);
    for (let i = 0; i < 4; i++) {
      const x = L.colX(i, cardW, gap);
      L.stat(slide, x, startY, cardW, placeholders[i].label, placeholders[i].value, '', '', { h: 1.4, vs: 20 });
    }
    warnings.push('Summary 메트릭 데이터 없음 — 플레이스홀더 표시');
  }

  // 투자 핵심 포인트 (KPI 카드 아래 풍부한 3대 투자 포인트 렌더링)
  const keyPoints: string[] = input.data.keyPoints || input.data.heroCard?.keyPoints || [];
  if (keyPoints.length === 0 && input.data.content) {
    const bullets = String(input.data.content).split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => (l.startsWith('•') || l.startsWith('-') || l.startsWith('·')) && l.length > 8)
      .map((l: string) => l.replace(/^[•\-·]\s*/, ''))
      .slice(0, 3);
    keyPoints.push(...bullets);
  }

  // D33 M-D G43: highlights ↔ 제원 중복 방지 — 제원 텍스트 필터링
  const SPEC_TERMS = /^(대지면적|연면적|건축규모|용적률|건폐율|지상|지하|총\s*층수|주차|승강기|엘리베이터)\s*[:：]/;
  const filteredKP = keyPoints.filter(pt => !SPEC_TERMS.test(pt.trim()));
  keyPoints.length = 0;
  keyPoints.push(...filteredKP);

  // 기본 폴백 3대 투자 포인트
  if (keyPoints.length === 0) {
    keyPoints.push(
      '입지 가치: 해당 권역 내 우수한 접근성 및 중장기 자산 가치 보존 잠재력',
      '현금흐름: 현 임대차 계약 구조를 통한 월 임대소득 창출 자산',
      '실사 점검: 상세 임대차 계약 및 공부상 권리관계 정밀 실사 권장'
    );
  }

  const kpiRows = Math.ceil(Math.min(8, metrics.length || 4) / (metrics.length > 4 ? 4 : Math.max(2, Math.min(4, metrics.length || 4))));
  const kpiEndY = startY + kpiRows * (1.35 + 0.18);
  const hlStartY = Math.max(kpiEndY + 0.15, 3.75);

  if (keyPoints.length > 0 && hlStartY < 5.8) {
    // 3대 핵심 투자 포인트 헤더
    slide.addText('3대 핵심 투자 포인트 (Investment Highlights)', {
      x: M, y: hlStartY, w: CW, h: 0.30,
      color: C.brassD, fontFace: KR, fontSize: 12.5, bold: true, margin: 0,
    });

    const numPoints = Math.min(3, keyPoints.length);
    const rowH = 0.64;
    const rowGap = 0.12;

    keyPoints.slice(0, 3).forEach((pt, idx) => {
      const ry = hlStartY + 0.36 + idx * (rowH + rowGap);
      if (ry + rowH <= 6.5) {
        // 배경 박스
        slide.addShape('roundRect' as any, {
          x: M, y: ry, w: CW, h: rowH,
          rectRadius: 0.05,
          fill: { color: 'F8F9FA' },
          line: { color: 'E2E8F0', width: 0.6 },
        });

        // 좌측 번호 태그
        slide.addShape('roundRect' as any, {
          x: M + 0.12, y: ry + 0.12, w: 0.45, h: rowH - 0.24,
          rectRadius: 0.04,
          fill: { color: C.brassT },
          line: { color: C.brassL, width: 0.5 },
        });
        slide.addText(`0${idx + 1}`, {
          x: M + 0.12, y: ry + 0.12, w: 0.45, h: rowH - 0.24,
          fontSize: 10, bold: true, color: C.brassD, fontFace: NUM,
          align: 'center', valign: 'middle', margin: 0,
        });

        // 우측 내용 텍스트
        slide.addText(pt, {
          x: M + 0.70, y: ry + 0.08, w: CW - 0.85, h: rowH - 0.16,
          color: C.ink, fontFace: KR, fontSize: 11.5,
          margin: 0, valign: 'middle',
        });
      }
    });
  } else {
    // Callouts 폴백
    const callouts = input.data.callouts || [];
    const calloutY = hlStartY;
    callouts.forEach((co: any, i: number) => {
      if (i > 1) return;
      const coGap = 0.20;
      const coW = L.col(2, coGap);
      const x = L.colX(i, coW, coGap);
      if (calloutY + 1.2 <= 6.5) {
        L.callout(slide, x, calloutY, coW, 1.2, co.kind || 'info', co.title || '투자 하이라이트', co.body || '');
      }
    });
  }
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);

  return { slide, warnings };
}

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
      if (hero.capRateBase) metrics.push({ label: '연 순수익률(Cap Rate)', value: `${hero.capRateBase}%` });
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

  // 투자 핵심 포인트 (KPI 카드 아래)
  let highlightsEndY = metrics.length > 4 ? startY + 2 * (1.4 + 0.20) : (metrics.length > 0 ? startY + 1.4 + 0.20 : startY);
  
  const keyPoints: string[] = input.data.keyPoints || input.data.heroCard?.keyPoints || [];
  // content에서 불릿 추출 폴백
  if (keyPoints.length === 0 && input.data.content) {
    const bullets = String(input.data.content).split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => (l.startsWith('•') || l.startsWith('-') || l.startsWith('·')) && l.length > 10)
      .map((l: string) => l.replace(/^[•\-·]\s*/, ''))
      .slice(0, 4);
    keyPoints.push(...bullets);
  }
  
  if (keyPoints.length > 0 && highlightsEndY + 0.30 + keyPoints.length * 0.32 <= 5.2) {
    const hlY = highlightsEndY + 0.15;
    slide.addText('📌 투자 핵심 포인트', {
      x: M, y: hlY, w: CW, h: 0.30,
      color: C.ink, fontFace: KR, fontSize: 11, bold: true,
    });
    keyPoints.forEach((pt, idx) => {
      slide.addText(`•  ${pt}`, {
        x: M + 0.10, y: hlY + 0.32 + idx * 0.30, w: CW - 0.10, h: 0.28,
        color: C.body, fontFace: KR, fontSize: 10.5,
      });
    });
    highlightsEndY = hlY + 0.32 + keyPoints.length * 0.30 + 0.10;
  }

  // Callouts (하단 2-column)
  const callouts = input.data.callouts || [];
  const calloutY = Math.max(highlightsEndY + 0.15, metrics.length > 4 ? 5.4 : (metrics.length > 0 ? startY + 1.8 : 4.5));
  callouts.forEach((co: any, i: number) => {
    if (i > 1) return;
    const coGap = 0.20;
    const coW = L.col(2, coGap);
    const x = L.colX(i, coW, coGap);
    if (calloutY + 1.2 <= 6.5) {
      L.callout(slide, x, calloutY, coW, 1.2, co.kind || 'info', co.title || '', co.body || '');
    }
  });
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);

  return { slide, warnings };
}

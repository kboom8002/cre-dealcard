import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR, NUM } from '../imlib';
import type { ProvenanceKind } from '../imlib';
import { formatPyeong } from '@/lib/utils/area-conversion';

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
  let leadSentence = input.data.leadSentence || '';
  if (leadSentence) {
    const hero = input.data.heroCard;
    const ssotManwon = hero?.asking_price_manwon ?? input.data.asking_price_manwon ?? input.data.ssot_summary?.asking_price_manwon;
    let exactAsk = ssotManwon ? `${(Number(ssotManwon) / 10000).toLocaleString()}억 원` : null;
    if (!exactAsk && Array.isArray(hero?.stats)) {
      const priceStat = hero.stats.find((s: any) => s.label?.includes('매매') || s.label?.includes('희망가') || s.label?.includes('매각'));
      if (priceStat?.value && !priceStat.value.includes('억대')) exactAsk = priceStat.value;
    }
    if (!exactAsk && hero?.askingPriceDisplay && !hero.askingPriceDisplay.includes('억대')) {
      exactAsk = hero.askingPriceDisplay;
    }
    if (!exactAsk && input.data.askingPrice && !input.data.askingPrice.includes('억대')) {
      exactAsk = input.data.askingPrice;
    }
    if (!exactAsk && Array.isArray(input.data.metrics)) {
      const mStat = input.data.metrics.find((s: any) => s.label?.includes('매매') || s.label?.includes('희망가') || s.label?.includes('매각'));
      if (mStat?.value && !mStat.value.includes('억대')) exactAsk = mStat.value;
    }
    if (exactAsk) {
      leadSentence = leadSentence.replace(/\d+\s*억\s*대/g, exactAsk);
    } else {
      // Rule 52: 실수치가 없을 경우에도 모호한 밴드(N억대) 표현은 제거
      leadSentence = leadSentence.replace(/,?\s*희망가\s*\d+\s*억\s*대/g, '').replace(/\d+\s*억\s*대/g, '');
    }
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
      metrics = [...hero.stats];
    } else {
      if (hero.askingPriceDisplay) metrics.push({ label: '매매 희망가', value: hero.askingPriceDisplay });
      if (hero.equityRequiredBil) metrics.push({ label: '필요 실투자금', value: `약 ${hero.equityRequiredBil}억 원` });
      if (hero.capRateBase) metrics.push({ label: '연 수익률(Cap Rate, 기준: NOI)', value: `${hero.capRateBase}%` });
      if (hero.leveragedYieldPct) metrics.push({ label: '자기자본수익률', value: `${hero.leveragedYieldPct}%` });
      const landM2 = parseFloat(String(hero.landAreaM2 || '').replace(/,/g, ''));
      if (metrics.length < 6 && !isNaN(landM2) && landM2 > 0) metrics.push({ label: '대지면적', value: `${formatPyeong(landM2, 1)}평` });
      const gfaM2 = parseFloat(String(hero.totalGrossAreaM2 || '').replace(/,/g, ''));
      if (metrics.length < 6 && !isNaN(gfaM2) && gfaM2 > 0) metrics.push({ label: '연면적', value: `${formatPyeong(gfaM2, 1)}평` });
      if (metrics.length < 6 && hero.zoning) metrics.push({ label: '용도지역', value: hero.zoning });
    }
  }

  // Basic IM 또는 표준 6대 핵심 지표 보충 (스펙 §2 #2)
  if (hero && metrics.length < 6) {
    if (!metrics.some((m: any) => m.label && (m.label.includes('매매') || m.label.includes('매각')))) {
      const ask = hero.askingPriceDisplay || hero.askingPrice || '-';
      metrics.unshift({ label: '매매 희망가', value: ask });
    }
    if (!metrics.some((m: any) => m.label && (m.label.includes('수익률') || m.label.includes('Cap Rate')))) {
      const cap = hero.capRateBase ? `${hero.capRateBase}%` : (hero.grossYieldDisplay ?? '-');
      metrics.push({ label: '연 수익률(Cap Rate)', value: cap });
    }
    if (!metrics.some((m: any) => m.label && m.label.includes('실투자금'))) {
      const eq = hero.equityRequiredBil ? `약 ${hero.equityRequiredBil}억 원` : '-';
      metrics.push({ label: '실투자금', value: eq });
    }
    if (!metrics.some((m: any) => m.label && m.label.includes('연면적'))) {
      const gfaM2 = parseFloat(String(hero.totalGrossAreaM2 || '').replace(/,/g, ''));
      const gfa = hero.totalGrossAreaPyeong
        ? `${hero.totalGrossAreaPyeong}평`
        : (!isNaN(gfaM2) && gfaM2 > 0 ? `${formatPyeong(gfaM2, 0)}평` : '-');
      metrics.push({ label: '연면적', value: gfa });
    }
    if (!metrics.some((m: any) => m.label && m.label.includes('대지면적'))) {
      const landM2 = parseFloat(String(hero.landAreaM2 || '').replace(/,/g, ''));
      const site = hero.landAreaPyeong
        ? `${hero.landAreaPyeong}평`
        : (!isNaN(landM2) && landM2 > 0 ? `${formatPyeong(landM2, 0)}평` : '-');
      metrics.push({ label: '대지면적', value: site });
    }
    if (!metrics.some((m: any) => m.label && m.label.includes('공실'))) {
      const vac = hero.vacancyDisplay ?? '확인 중';
      metrics.push({ label: '공실 현황', value: vac });
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
  
  // D41: 메트릭 수에 따라 카드 높이 조정 — 5개 이상이면 컴팩트 모드
  const isCompact = metrics.length > 4;
  const cardH = isCompact ? 1.05 : 1.4;

  if (metrics.length > 0) {
    // Stat cards: 6개 지표 시 3열 x 2행 최적 배분
    const gap = 0.18;
    const cols = metrics.length === 6 ? 3 : Math.max(2, Math.min(4, metrics.length));
    const cardW = L.col(cols, gap);
    
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
        { h: cardH, vs: isCompact ? 17 : 20 }
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
  // D42 SOTA: 내적 독백 및 단순 행정 체크리스트 문구 필터링 (Rule 1 & Rule 2 준수)
  const INTERNAL_MONOLOGUE = /(내적|사료됨|판단됨|실사\s*점검|정밀\s*진단|공부\s*확인|권리관계\s*정밀|검토(\s*필요)?$|안정적\s*수요\s*검토|의견으로는|자료입니다|수준의\s*가격대)/;
  // 검증 가능한 구체적 앵커(숫자, 역, 도로, 지표 등)가 있는 문장만 인정
  const VERIFIABLE_ANCHOR = /(역|도보|호선|도로|접면|대로|%|Cap|억|평|공실|만실|사옥|임대료|수익률|지분)/i;
  const filteredKP = keyPoints.filter(pt => !SPEC_TERMS.test(pt.trim()) && !INTERNAL_MONOLOGUE.test(pt.trim()) && VERIFIABLE_ANCHOR.test(pt.trim()));
  keyPoints.length = 0;
  keyPoints.push(...filteredKP);

  // 기본 폴백 3대 투자 포인트 — SOTA 중개인 투자 하이라이트 (검증 가능 수치 중심)
  if (keyPoints.length < 3) {
    const area = input.data.areaSignal || input.data.heroCard?.areaSignal || '도심 비즈니스 권역';
    const capRate = hero?.capRateBase ? `${hero.capRateBase}%` : '';
    const gfaPyeong = hero?.totalGrossAreaPyeong || (hero?.totalGrossAreaM2 ? formatPyeong(hero.totalGrossAreaM2, 0) : '');
    const landPyeong = hero?.landAreaPyeong || (hero?.landAreaM2 ? formatPyeong(hero.landAreaM2, 0) : '');

    // G5 앵커: 역명 및 도보분 동적 결합
    const locPoi = input.data.enrichment?.locationPoi ?? input.data.locationPoi;
    const nearestSt = locPoi?.nearestStation;
    const rawSt = input.data.station_name || hero?.nearestStation || nearestSt?.name || nearestSt?.stationName || '';
    const stationName = rawSt ? rawSt.replace(/\s*(?:\d+호선|신분당선|수인분당선|공항철도|경의중앙선|경춘선|GTX-?[A-Z]|우이신설선|서해선|경강선|인천\d호선).*$/i, '').replace(/\([^)]*\)$/, '').replace(/역$/, '') + '역' : '';
    const distNum = typeof nearestSt?.distanceM === 'number'
      ? nearestSt.distanceM
      : parseFloat(String(nearestSt?.distanceM || '').replace(/[^\d.]/g, ''));
    const distMin = !isNaN(distNum) && distNum > 0 ? Math.max(1, Math.round(distNum / 80)) : undefined;
    const stMin = input.data.station_walk_min ?? nearestSt?.walkMinutes ?? distMin;
    const stationPart = stationName && stMin
      ? `${stationName} 도보 ${stMin}분 역세권`
      : stationName
        ? `${stationName} 역세권`
        : '대중교통 역세권 입지';

    const fallbackPool = [
      `입지 가치: ${stationPart}, ${area} 업무·상업 중심지 배후 수요 확보`,
      capRate ? `수익 안정성: 연 순수익률(Cap Rate) ${capRate} 기반 안정적 임대수익 자산` : `수익 안정성: 안정적 임대수익 기반 투자 매물`,
      gfaPyeong && landPyeong ? `자산 규모: 대지 ${landPyeong}평·연면적 ${gfaPyeong}평 규모 단독 빌딩` : `자산 희소성: 역세권 단독 빌딩으로 사옥 및 임대수익형 최적 자산`,
    ];
    for (const fb of fallbackPool) {
      if (keyPoints.length >= 3) break;
      if (!keyPoints.some(kp => kp.startsWith(fb.substring(0, 5)))) keyPoints.push(fb);
    }
  }

  // D41: KPI 카드 높이에 따라 하이라이트 시작 위치 동적 계산
  const kpiRows = Math.ceil(Math.min(8, metrics.length || 4) / (Math.max(2, Math.min(4, metrics.length || 4))));
  const kpiEndY = startY + kpiRows * (cardH + 0.18);
  const hlStartY = Math.max(kpiEndY + 0.10, 3.50);

  // D41: 남은 공간에 따라 하이라이트 행 크기 자동 조절
  const availableH = 6.55 - hlStartY - 0.36; // 헤더(0.36) 제외
  const numPoints = Math.min(3, keyPoints.length);
  // 행 높이를 남은 공간에 맞춰 동적 계산 (최소 0.40, 최대 0.64)
  const maxRowH = Math.min(0.64, availableH / numPoints - 0.06);
  const rowH = Math.max(0.40, maxRowH);
  const rowGap = Math.max(0.04, Math.min(0.12, (availableH - numPoints * rowH) / Math.max(1, numPoints - 1)));

  if (keyPoints.length > 0 && hlStartY < 5.8) {
    // 3대 핵심 투자 포인트 헤더
    slide.addText('3대 핵심 투자 포인트 (Investment Highlights)', {
      x: M, y: hlStartY, w: CW, h: 0.30,
      color: C.brassD, fontFace: KR, fontSize: 12.5, bold: true, margin: 0,
    });

    const hlFontSize = rowH < 0.50 ? 10 : 11.5;

    keyPoints.slice(0, 3).forEach((pt, idx) => {
      const ry = hlStartY + 0.36 + idx * (rowH + rowGap);
      // D41: y 경계를 6.75까지 확장 (기존 6.5 → 6.75, 풋터 공간 0.25 확보)
      if (ry + rowH <= 6.75) {
        // 배경 박스
        slide.addShape('roundRect' as any, {
          x: M, y: ry, w: CW, h: rowH,
          rectRadius: 0.05,
          fill: { color: 'F8F9FA' },
          line: { color: 'E2E8F0', width: 0.6 },
        });

        // 좌측 번호 태그
        const tagH = Math.min(rowH - 0.16, 0.40);
        slide.addShape('roundRect' as any, {
          x: M + 0.12, y: ry + (rowH - tagH) / 2, w: 0.45, h: tagH,
          rectRadius: 0.04,
          fill: { color: C.brassT },
          line: { color: C.brassL, width: 0.5 },
        });
        slide.addText(`0${idx + 1}`, {
          x: M + 0.12, y: ry + (rowH - tagH) / 2, w: 0.45, h: tagH,
          fontSize: 10, bold: true, color: C.brassD, fontFace: NUM,
          align: 'center', valign: 'middle', margin: 0,
        });

        // 우측 내용 텍스트 (HP-05: 62자 초과 시 절삭하여 오버플로 방지)
        const ptText = pt.length > 62 ? pt.slice(0, 59) + '...' : pt;
        slide.addText(ptText, {
          x: M + 0.70, y: ry + 0.04, w: CW - 0.85, h: rowH - 0.08,
          color: C.ink, fontFace: KR, fontSize: hlFontSize,
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
        const safeKind = (['info', 'good', 'warn', 'bad', 'brass'] as const).includes(co.kind) ? co.kind : 'info';
        L.callout(slide, x, calloutY, coW, 1.2, safeKind, co.title || '투자 하이라이트', co.body || '');
      }
    });
  }
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);

  return { slide, warnings };
}

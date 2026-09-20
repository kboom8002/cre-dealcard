import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR } from '../imlib';
import type { ProvenanceKind } from '../imlib';
import { stripMarkdown } from '../data-binder';
import { optimizeImageForPptx, type OptimizedImage } from '../utils/image-optimizer';

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

export async function buildA04Asymmetric75(input: ArchetypeInput): Promise<ArchetypeOutput> {
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  const lw = 7.5;
  const gap = 0.393;
  const rw = CW - lw - gap;
  const rx = M + lw + gap;
  
  const left = input.data.left || {};
  const right = input.data.right || {};
  
  // 좌측: 부제
  if (left.sub) {
    L.sub(slide, M, 1.50, lw, left.sub);
  }
  
  // D2 Fix: right.rows(용도지역, 건폐율/용적률, 주차/승강기, 도로 등)가 있으면 left.rows와 통합 렌더링
  const rawSourceRows: any[] = [...(left.rows || [])];
  if (Array.isArray(right.rows) && right.rows.length > 0) {
    for (const r of right.rows) {
      if (Array.isArray(r) && r.length >= 2) {
        const k = stripMarkdown(String(r[0] || '')).trim();
        if (k && !rawSourceRows.some(sr => Array.isArray(sr) && stripMarkdown(String(sr[0] || '')).trim() === k)) {
          rawSourceRows.push(r);
        }
      }
    }
  }

  // 좌측: rows → L.rows() (key-value 쌍)
  if (rawSourceRows.length > 0) {
    const rowEntries: [string, string][] = (rawSourceRows.map((r: any[]) => {
      if (Array.isArray(r) && r.length >= 2) {
        const k = stripMarkdown(String(r[0] || '')).replace(/^[|:\s]+|[|:\s]+$/g, '').trim();
        let v = stripMarkdown(String(r[1] || '')).replace(/^[|:\s]+|[|:\s]+$/g, '').trim();
        if (k === v) v = '';
        return [k, v] as [string, string];
      }
      return [stripMarkdown(String(r[0] || '')), ''] as [string, string];
    }) as [string, string][]).filter(([k, v]: [string, string]) => {
      if (!k || k.includes('항목') || k.includes('내용')) return false;
      if (input.data.priceTable && (k.includes('매매') || k.includes('매각') || k.includes('희망가'))) return false;
      return true;
    });

    let renderedRowCount = 0;
    if (rowEntries.length > 0) {
      const maxRows = input.data.priceTable ? 9 : 11;
      renderedRowCount = Math.min(rowEntries.length, maxRows);
      const rowHeight = renderedRowCount > 7 ? 0.38 : 0.46;
      const fontSize = renderedRowCount > 7 ? 12 : 13.5;
      L.rows(slide, M, 1.80, lw, rowEntries.slice(0, maxRows), { rh: rowHeight, fs: fontSize });
    } else {
      const fallbackTitle = `${input.data.title || left.sub || '세부 정보'} 요약`;
      L.callout(slide, M, 1.80, lw, 2.0, 'info', fallbackTitle,
        '• 등기부등본 갑구·을구 권리관계 확인 필요\n• 건축물대장 주요 용도 및 위반건축물 여부 확인\n• 현장 실사를 통한 물리적 하자 및 하자보수 이력 점검');
      renderedRowCount = 4;
    }
  } else if (input.data.content) {
    const lines = String(input.data.content).split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0 && !l.startsWith('#') && !l.startsWith('|'));
    const contentRows: [string, string][] = [];
    for (const line of lines) {
      const stripped = stripMarkdown(line).replace(/[`\[\]]/g, '');
      const parts = stripped.split(/[：:]/);
      if (parts.length >= 2) {
        const k = parts[0].trim();
        if (input.data.priceTable && (k.includes('매매') || k.includes('매각') || k.includes('희망가'))) continue;
        contentRows.push([k, parts.slice(1).join(':').trim()]);
      } else if (stripped.startsWith('-') || stripped.startsWith('•')) {
        const k = stripped.replace(/^[-•·]\s*/, '');
        if (input.data.priceTable && (k.includes('매매') || k.includes('매각') || k.includes('희망가'))) continue;
        contentRows.push([k, '']);
      }
    }
    let renderedRowCount = 0;
    if (contentRows.length > 0) {
      const maxRows = input.data.priceTable ? 7 : 10;
      renderedRowCount = Math.min(contentRows.length, maxRows);
      L.rows(slide, M, 1.80, lw, contentRows.slice(0, maxRows), { rh: 0.48, fs: 13.5 });
    } else {
      const fallbackTitle = `${input.data.title || left.sub || '세부 정보'} 요약`;
      L.callout(slide, M, 1.80, lw, 2.0, 'info', fallbackTitle,
        '• 등기부등본 갑구·을구 권리관계 확인 필요\n• 건축물대장 주요 용도 및 위반건축물 여부 확인\n• 현장 실사를 통한 물리적 하자 및 하자보수 이력 점검');
      renderedRowCount = 4;
    }
  } else {
    const fallbackTitle = `${input.data.title || left.sub || '세부 정보'} 요약`;
    L.callout(slide, M, 1.80, lw, 2.0, 'info', fallbackTitle,
      '• 등기부등본 갑구·을구 권리관계 확인 필요\n• 건축물대장 주요 용도 및 위반건축물 여부 확인\n• 현장 실사를 통한 물리적 하자 및 하자보수 이력 점검');
  }
  
  if (input.data.priceTable) {
    const actualRows = rawSourceRows.length > 0 ? rawSourceRows.length : (left.rows?.length ?? 5);
    const rowH = actualRows > 7 ? 0.38 : 0.46;
    const finalRowCount = Math.min(Math.max(actualRows, 5), 9);
    const py = Math.min(1.80 + finalRowCount * rowH + 0.10, 5.50);

    // 매각가 테이블 (금색 테두리 박스)
    const hasPrice2 = !!input.data.priceTable2;
    const priceBoxH = hasPrice2 ? 1.10 : 0.60;
    slide.addShape('rect', {
      x: M, y: py, w: lw, h: priceBoxH,
      fill: { color: 'F6F1E4' },
      line: { color: 'B8860B', width: 1.2 }
    });

    const padX = 0.20;
    const innerW = lw - padX * 2;
    const labW = innerW * 0.42;
    const valW = innerW * 0.58;
    const labX = M + padX;
    const valX = labX + labW;

    // 첫 번째 행: 매각가
    slide.addText(input.data.priceTable.label, {
      x: labX, y: py, w: labW, h: 0.55,
      fontFace: KR, fontSize: 12, bold: true, color: C.ink, valign: 'middle', align: 'left', margin: 0
    });
    slide.addText(input.data.priceTable.value, {
      x: valX, y: py, w: valW, h: 0.55,
      fontFace: KR, fontSize: 16, bold: true, color: C.brass, valign: 'middle', align: 'right', margin: 0
    });

    // 두 번째 행: 토지평당가 (있을 경우)
    if (input.data.priceTable2) {
      const py2 = py + 0.55;
      slide.addShape('line', {
        x: M + 0.15, y: py2, w: lw - 0.30, h: 0,
        line: { color: 'D4C89A', width: 0.5 }
      });
      slide.addText(input.data.priceTable2.label, {
        x: labX, y: py2, w: labW, h: 0.50,
        fontFace: KR, fontSize: 11, bold: true, color: C.ink, valign: 'middle', align: 'left', margin: 0
      });
      slide.addText(input.data.priceTable2.value, {
        x: valX, y: py2, w: valW, h: 0.50,
        fontFace: KR, fontSize: 13, bold: false, color: C.brass, valign: 'middle', align: 'right', margin: 0
      });
    }
  }

  // Brass 수직 구분선
  slide.addShape('line', {
    x: M + lw + gap / 2, y: 1.50, w: 0, h: 5.2,
    line: { color: C.brass, width: 0.7 },
  });

  // ── 우측: 사진 + 콜아웃 (사진 우선) ──
  const photoCandidate = input.data.photoUrl || right.photoUrl;
  let photoImg: { base64: string } | null = null;
  if (photoCandidate) {
    const opt = await optimizeImageForPptx(photoCandidate, 1200, 85);
    photoImg = opt || { base64: photoCandidate };
  }
  if (!photoImg && Array.isArray(input.data.photos) && input.data.photos.length > 0) {
    const kickerLower = (input.data.kicker || '').toLowerCase();
    const titleLower = (input.data.title || '').toLowerCase();
    const isEviction = kickerLower.includes('eviction') || titleLower.includes('명도') || titleLower.includes('철거');
    const isLand = kickerLower.includes('land') || titleLower.includes('부지') || titleLower.includes('도로') || titleLower.includes('접면');

    let selectedPhoto = input.data.photos[0];
    if (isEviction) {
      selectedPhoto = input.data.photos.find((p: any) =>
        p.caption?.includes('구옥') || p.caption?.includes('철거') || p.caption?.includes('현황')
      ) || input.data.photos[2] || input.data.photos[0];
    } else if (isLand) {
      selectedPhoto = input.data.photos.find((p: any) =>
        p.caption?.includes('도로') || p.caption?.includes('접면')
      ) || input.data.photos[1] || input.data.photos[0];
    }

    const url = typeof selectedPhoto === 'string' ? selectedPhoto : selectedPhoto?.url;
    if (url) {
      const opt = await optimizeImageForPptx(url, 1200, 85);
      photoImg = opt || { base64: url };
    }
  }

  if (photoImg) {
    slide.addImage({
      data: photoImg.base64,
      x: rx, y: 1.80, w: rw, h: 3.20,
      sizing: { type: 'contain', w: rw, h: 3.20 },
    });
    // 우측 하단: 핵심 강점 콜아웃
    let calloutText = stripMarkdown(right.callouts?.[0]?.body || '');
    if (!calloutText || calloutText.length < 15) {
      const kickerLower = (input.data.kicker || '').toLowerCase();
      const titleLower = (input.data.title || '').toLowerCase();
      const isEviction = kickerLower.includes('eviction') || titleLower.includes('명도') || titleLower.includes('철거');
      const isLand = kickerLower.includes('land') || titleLower.includes('부지') || titleLower.includes('도로') || titleLower.includes('인허가');

      if (isEviction) {
        calloutText = '• 매도인/임차인 명도 현황 및 퇴거 확약 조건 확인 필요\n• 임차인 권리금·명도 분쟁 리스크 사전 실사 권고\n• 명도 완료 시 즉시 철거·착공 가능 여부 일정 확인';
      } else if (isLand) {
        calloutText = '• 필지 도로 접면 현황 및 차량 진출입 여건 현장 확인 필요\n• 건축법상 일조권·사선제한 영향 사전 검토 권고\n• 필지 결합 개발 시 대지 이용 효율 및 용적률 최적화 검토';
      } else {
        const keyPoint = input.data.keyInvestmentPoint
          || input.data.heroCard?.keyInvestmentPoint
          || input.data.keyPoint;
        if (keyPoint) {
          const parts = String(keyPoint).split(/\s*[·•\n]\s*/).filter(Boolean);
          calloutText = parts.map(p => `• ${p}`).join('\n');
        } else {
          // D42 RCA: Rule 37 준수 — 동적 데이터 기반 텍스트 (회피성 문구 금지)
          const addr = input.data.address || input.data.resolved_address || '';
          const areaStr = input.data.areaSignal || input.data.heroCard?.areaSignal || '도심 비즈니스 권역';
          const priceStr = input.data.heroCard?.askingPriceDisplay || input.data.price_display || '';
          calloutText = `• ${areaStr} 소재 ${addr ? addr.split(' ').slice(-1)[0] + ' ' : ''}핵심 입지 자산`
            + `\n• ${priceStr ? priceStr + ' 기준 ' : ''}안정적 임대수익 기반 투자 매물`
            + `\n• 대중교통 역세권 접근성 및 주변 상업 인프라 우수`;
        }
      }
    }
    const calloutTitle = (input.data.kicker || '').includes('Eviction') || (input.data.title || '').includes('명도') ? '명도 리스크 관리' : '자산 하이라이트';
    L.callout(slide, rx, 5.12, rw, 1.65, 'info', calloutTitle, calloutText);
  } else {
    // 사진이 없을 때: 2개 카드로 꽉 찬 렌더링
    let cy = 1.80;
    const rightCallouts = input.data.right?.callouts ?? [];
    if (rightCallouts.length > 0) {
      rightCallouts.slice(0, 2).forEach((c: any) => {
        let ch = Math.max(1.8, 0.7 + Math.ceil((c.body?.length ?? 0) / 25) * 0.32);
        if (cy + ch > 6.80) ch = Math.max(1.0, 6.80 - cy);
        if (cy < 6.80) {
          const safeKind = (['info', 'good', 'warn', 'bad', 'brass'] as const).includes(c.kind) ? c.kind : 'info';
          L.callout(slide, rx, cy, rw, ch, safeKind, c.title ?? '자산 평가 포인트', c.body ?? '');
          cy += ch + 0.22;
        }
      });
    } else {
      const addr2 = input.data.address || input.data.resolved_address || '';
      const area2 = input.data.areaSignal || input.data.heroCard?.areaSignal || '도심 비즈니스 권역';
      const kicker = (input.data.kicker || '').toLowerCase();
      const isLandSlide = kicker.includes('land') || (input.data.title || '').includes('토지');
      if (isLandSlide) {
        // 토지 현황 슬라이드: 토지/건축물 관련 실무 내용만 표시
        L.callout(slide, rx, 1.80, rw, 2.3, 'info', '토지 및 건축 규제 포인트',
          `• 용도지역·용도지구 기준 건폐율/용적률 상한 확인\n• 필지 형상 및 접도 조건에 따른 건축 가능 면적 검토\n• 토지이용계획 열람 및 개발행위허가 제한 여부 확인`);
        L.callout(slide, rx, 4.35, rw, 2.35, 'info', '권리관계 및 공적장부',
          `• 등기부등본 갑구 소유권 및 을구 근저당·가압류 확인\n• 건축물대장 기재 사항과 실물 현황 대조 점검\n• 개별공시지가 및 실거래가 비교 분석`);
      } else {
        L.callout(slide, rx, 1.80, rw, 2.3, 'info', '입지 및 자산 개요',
          '• 투자 검토 대상 상업용 자산\\n• 권리관계 및 임대차 현황 실사 확인 필요\\n• 상세 인접 인프라 및 입지 환경 분석 권장');
        const price2 = input.data.heroCard?.askingPriceDisplay || input.data.price_display || '';
        L.callout(slide, rx, 4.35, rw, 2.35, 'info', '투자 수익 및 운영 현황',
          '• 투자 검토 대상 자산\\n• 임대차 계약 현황 및 운영비 실사 확인 필요\\n• 매입 후 운용 계획에 따른 수익성 분석 권장');
      }
    }
  }
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}

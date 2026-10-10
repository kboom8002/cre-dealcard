import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR } from '../imlib';
import type { ProvenanceKind } from '../imlib';
import { stripMarkdown } from '../data-binder';
import { optimizeImageForPptx, type OptimizedImage } from '../utils/image-optimizer';
import { addImageFit, planImageFit } from '../utils/image-fit';
import { prioritizeSpecRows } from '../spec-row-priority';
import { verifiedLegalLimitsFromSsot } from '../binder/legal-limits';

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
  let leftContentBottom = 1.80;
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

    if (rowEntries.length > 0) {
      // D5: 행 상한 11 (매각가 박스 동반 시에도). 11행×0.30" = 3.30" → 1.80+3.30+0.12 = 5.22 → 가격박스(최대 1.10") 하단 6.32" < SAFE_BOTTOM(6.75")
      const maxRows = 11;
      const count = Math.min(rowEntries.length, maxRows);
      const rowHeight = rowEntries.length <= 6 ? 0.44 : rowEntries.length <= 9 ? 0.36 : 0.30;
      const fontSize = rowEntries.length <= 6 ? 13.5 : rowEntries.length <= 9 ? 12 : 11;
      L.rows(slide, M, 1.80, lw, prioritizeSpecRows(rowEntries, maxRows), { rh: rowHeight, fs: fontSize });
      leftContentBottom = 1.80 + count * rowHeight;
    } else {
      const fallbackTitle = `${input.data.title || left.sub || '세부 정보'} 요약`;
      L.callout(slide, M, 1.80, lw, 1.8, 'info', fallbackTitle,
        '• 등기부등본 갑구·을구 권리관계 공적장부 대조\n• 건축물대장 주요 용도 및 위반건축물 여부 확인\n• 현장 실사를 통한 물리적 하자 및 하자보수 이력 점검');
      leftContentBottom = 1.80 + 1.8;
    }
  } else if (input.data.content) {
    const lines = String(input.data.content).split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0 && !l.startsWith('#') && !l.startsWith('|')
        && !(/^\{["\s]/.test(l) && /"[^"]+"\s*:/.test(l))); // D-JSON-LEAK
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
    if (contentRows.length > 0) {
      const maxRows = input.data.priceTable ? (input.data.priceTable2 ? 8 : 9) : 11;
      const count = Math.min(contentRows.length, maxRows);
      const rowHeight = contentRows.length <= 6 ? 0.42 : contentRows.length <= 9 ? 0.36 : 0.30;
      const fontSize = contentRows.length <= 6 ? 13.5 : contentRows.length <= 9 ? 12 : 11;
      L.rows(slide, M, 1.80, lw, contentRows.slice(0, maxRows), { rh: rowHeight, fs: fontSize });
      leftContentBottom = 1.80 + count * rowHeight;
    } else {
      const fallbackTitle = `${input.data.title || left.sub || '세부 정보'} 요약`;
      L.callout(slide, M, 1.80, lw, 1.8, 'info', fallbackTitle,
        '• 등기부등본 갑구·을구 권리관계 공적장부 대조\n• 건축물대장 주요 용도 및 위반건축물 여부 확인\n• 현장 실사를 통한 물리적 하자 및 하자보수 이력 점검');
      leftContentBottom = 1.80 + 1.8;
    }
  } else {
    const fallbackTitle = `${input.data.title || left.sub || '세부 정보'} 요약`;
    L.callout(slide, M, 1.80, lw, 1.8, 'info', fallbackTitle,
      '• 등기부등본 갑구·을구 권리관계 공적장부 대조\n• 건축물대장 주요 용도 및 위반건축물 여부 확인\n• 현장 실사를 통한 물리적 하자 및 하자보수 이력 점검');
    leftContentBottom = 1.80 + 1.8;
  }
  
  // 좌측 컬럼 실제 하단 (우측 하이라이트 박스 하단 정렬 기준)
  let leftColumnBottom = leftContentBottom;
  // 매각가 박스는 우측 하이라이트 박스와 하단 정렬하기 위해 우측 레이아웃 산출 후 그린다
  let drawPriceBox: ((alignBottom?: number) => void) | null = null;
  if (input.data.priceTable) {
    const hasPrice2 = !!input.data.priceTable2;
    const priceBoxH = hasPrice2 ? 1.10 : 0.60;
    const pyDefault = Math.min(Math.max(leftContentBottom + 0.12, 4.40), 6.75 - priceBoxH);
    leftColumnBottom = pyDefault + priceBoxH;
    drawPriceBox = (alignBottom?: number) => {
    const py = alignBottom != null
      ? Math.min(6.75 - priceBoxH, Math.max(pyDefault, alignBottom - priceBoxH))
      : pyDefault;

    // 매각가 테이블 (금색 테두리 박스)
    slide.addShape('rect', {
      x: M, y: py, w: lw, h: priceBoxH,
      fill: { color: C.brassT },
      line: { color: C.brass, width: 1.2 }
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
        line: { color: C.brassS, width: 0.5 }
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
    };
  }
  let rightBottomForAlign: number | undefined;

  // Brass 수직 구분선
  slide.addShape('line', {
    x: M + lw + gap / 2, y: 1.50, w: 0, h: 5.2,
    line: { color: C.brass, width: 0.7 },
  });

  // ── 우측: 사진 + 콜아웃 (사진 우선) ──
  const photoCandidate = input.data.photoUrl || right.photoUrl;
  let photoImg: { base64: string; width?: number; height?: number } | null = null;
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
    // 우측 하단: 핵심 강점 콜아웃 문구 결정
    let calloutLines: string[] = [];
    if (Array.isArray(input.data.assetHighlights) && input.data.assetHighlights.length > 0) {
      // 2026-10-05: 렌더러가 실데이터(역·임대·대지)로 합성한 짧은 하이라이트 우선
      calloutLines = input.data.assetHighlights.map((s: unknown) => String(s ?? '').trim()).filter(Boolean).slice(0, 3);
    } else {
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
            // D42 RCA / 2026-10-05: 데이터 근거 없는 일반론 문구("핵심 입지 자산", "안정적 임대수익 기반 투자 매물" 등)는
            // 출력하지 않는다 (Rule 34/37). 하이라이트가 없으면 사진이 우측 컬럼 전체를 사용한다.
            calloutText = '';
          }
        }
      }
      calloutLines = calloutText.split('\n').map(l => l.replace(/^[•·\-*]\s*/, '').trim()).filter(Boolean).slice(0, 4);
    }
    const calloutTitle = (input.data.kicker || '').includes('Eviction') || (input.data.title || '').includes('명도') ? '명도 리스크 관리' : '자산 하이라이트';

    // ── 레이아웃: 하이라이트 박스는 내용 높이에 맞추고, 좌측 매각가 박스 하단과 정렬 ──
    const photoTop = 1.80;
    const lineH = 0.29;
    const boxH = calloutLines.length > 0 ? 0.14 + 0.26 + 0.06 + calloutLines.length * lineH + 0.10 : 0;
    const minPhotoH = 2.40;
    const boxBottom = Math.min(6.75, Math.max(leftColumnBottom, photoTop + minPhotoH + (boxH > 0 ? 0.15 + boxH : 0)));
    const boxY = boxBottom - boxH;
    const photoH = (boxH > 0 ? boxY - 0.15 : boxBottom) - photoTop;
    rightBottomForAlign = boxBottom;

    // 사진: 원본 픽셀 비율 보존 (비율 차이가 작으면 중앙 크롭, 크면 전체 보존 + 여백 배경)
    const photoBox = { x: rx, y: photoTop, w: rw, h: photoH };
    if (planImageFit(photoBox, photoImg.width, photoImg.height, 'auto').mode === 'contain') {
      // 원본 비율이 박스와 크게 다르면 전체를 보존하고 여백은 은은한 배경으로 마감 (배경 → 이미지 순)
      slide.addShape('rect', { ...photoBox, fill: { color: 'F3F1EC' }, line: { color: 'E2DED3', width: 0.75 } });
    }
    addImageFit(slide, photoImg.base64, photoBox, photoImg.width, photoImg.height, 'auto');

    if (boxH > 0) {
      // 매각가 박스와 같은 브라스 톤 팔레트 (F6F1E4 / B8860B)
      slide.addShape('roundRect', {
        x: rx, y: boxY, w: rw, h: boxH,
        rectRadius: 0.05,
        fill: { color: C.brassT },
        line: { color: C.brassS, width: 0.75 },
      });
      slide.addShape('rect', { x: rx, y: boxY + 0.08, w: 0.05, h: boxH - 0.16, fill: { color: C.brass }, line: { color: C.brass, width: 0 } });
      slide.addText(calloutTitle, {
        x: rx + 0.20, y: boxY + 0.12, w: rw - 0.32, h: 0.26,
        fontFace: KR, fontSize: 11, bold: true, color: C.brassD || '8A6A1F', margin: 0, valign: 'middle',
      });
      calloutLines.forEach((line, i) => {
        const ly = boxY + 0.14 + 0.26 + 0.06 + i * lineH;
        const fit = L.fitTextToBox(line, rw - 0.50, lineH, { minFontSize: 9, maxFontSize: 10.5, targetLines: 1, allowTruncate: false });
        slide.addShape('rect', { x: rx + 0.22, y: ly + lineH / 2 - 0.03, w: 0.06, h: 0.06, fill: { color: C.brass }, line: { color: C.brass, width: 0 } });
        slide.addText(line, {
          x: rx + 0.36, y: ly, w: rw - 0.50, h: lineH,
          fontFace: KR, fontSize: fit.fontSize, color: C.ink, margin: 0, valign: 'middle', shrinkText: true,
        });
      });
    }
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
        // Phase 4: SSoT 데이터 기반 동적 토지 규제 콜아웃 합성
        const ssot = input.data.ssot_summary ?? input.data.heroCard ?? {};
        const bldg = input.data.building ?? {};
        const bcr = Number(ssot.bcr_pct ?? bldg.bcr_pct ?? ssot.bcrPct);
        const far = Number(ssot.far_pct ?? bldg.far_pct ?? ssot.farPct);
        // 법정 상한: 공식 출처만 (legal-limits.ts — 용도지역명 추정치 숨김)
        const { bcrMax: maxBcr = NaN, farMax: maxFar = NaN } = verifiedLegalLimitsFromSsot(ssot);
        const zoning = ssot.zoning ?? bldg.zoning ?? input.data.zoning ?? '';
        const road = ssot.road_condition ?? bldg.road_condition ?? '';
        const landCat = ssot.land_category ?? bldg.land_category ?? '';
        const landM2 = Number(ssot.land_area_sqm ?? 0);
        const landPy = landM2 > 0 ? (landM2 * 0.3025).toFixed(1) : '';

        // 토지 및 건축 규제 동적 불릿
        const regBullets: string[] = [];
        if (Number.isFinite(bcr) && bcr > 0 && Number.isFinite(far) && far > 0) {
          let line = `\u2022 현행 건폐율 ${bcr}%, 용적률 ${far}%`;
          if (Number.isFinite(maxBcr) && maxBcr > 0 && Number.isFinite(maxFar) && maxFar > 0) {
            line += ` (법정 상한: ${maxBcr}% / ${maxFar}%)`;
            const farGap = maxFar - far;
            if (farGap > 5) {
              line += `\n  \u2192 잔여 용적률 ${farGap.toFixed(1)}%p`;
            }
          }
          regBullets.push(line);
        }
        if (zoning) regBullets.push(`\u2022 용도지역: ${zoning}`);
        if (landCat) regBullets.push(`\u2022 지목: ${landCat}`);
        if (road) regBullets.push(`\u2022 도로접면: ${road}`);
        if (landM2 > 0 && landPy) regBullets.push(`\u2022 대지면적: ${landM2.toLocaleString()}\u33a1 (${landPy}평)`);
        // 폴백: SSoT 데이터가 전무할 때만
        if (regBullets.length === 0) {
          regBullets.push('\u2022 토지이용계획 열람 및 건축 규제 확인 필요');
        }

        L.callout(slide, rx, 1.80, rw, 2.3, 'info', '토지 및 건축 규제',
          regBullets.join('\n'));

        // 권리관계 동적 불릿 (이 부분은 공적장부 API 없이는 일반적 실무 항목)
        L.callout(slide, rx, 4.35, rw, 2.35, 'info', '권리관계 및 공적장부',
          '\u2022 등기부등본 갑구 소유권 확인\n\u2022 건축물대장 기재 사항 실물 대조\n\u2022 개별공시지가 및 실거래가 비교');
      } else {
        L.callout(slide, rx, 1.80, rw, 2.3, 'info', '입지 및 자산 개요',
          '• 투자 검토 대상 상업용 자산\n• 권리관계 및 임대차 계약 구조 분석\n• 상세 인접 인프라 및 입지 환경 분석');
        const price2 = input.data.heroCard?.askingPriceDisplay || input.data.price_display || '';
        L.callout(slide, rx, 4.35, rw, 2.35, 'info', '투자 수익 및 운영 현황',
          '• 투자 검토 대상 자산\n• 임대차 계약 조건 및 운영비 구조 분석\n• 매입 후 운용 계획에 따른 수익성 분석');
      }
    }
  }
  
  if (drawPriceBox) drawPriceBox(rightBottomForAlign);

  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}

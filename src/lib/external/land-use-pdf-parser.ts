/**
 * @file land-use-pdf-parser.ts
 * @description 토지이음 토지이용계획확인원(확인서) PDF 텍스트/버퍼 결정론 파서 (R6)
 *
 * 추출 항목:
 *   - 토지개요: 소재지(지번), 지목, 면적(㎡), 개별공시지가(원/㎡) 및 기준연월 라벨
 *   - 토지이용계획 3행:
 *       1) 「국토의 계획 및 이용에 관한 법률」 지역·지구등
 *       2) 다른 법령 등에 따른 지역·지구등
 *       3) 「토지이용규제 기본법 시행령」 제9조제4항 각 호에 해당되는 사항
 *   - 복수 용도지역 혼재 시 면적/비율(`zoningShares`)
 */

export interface ParsedLandUseConfirmPdf {
  jibunAddress?: string;
  jimok?: string;
  areaSqm?: number;
  officialLandPricePerSqm?: number;
  officialLandPriceBaseLabel?: string;
  nationalPlanItems: string[];
  otherLawItems: string[];
  implementationRuleItems: string[];
  zoningShares?: Array<{ zoneName: string; areaSqm?: number; ratioPct: number }>;
}

const IGNORED_ITEM_RE = /^(?:해당\s*없음|없음|지정되지\s*않음|미지정|-+|―+|—+)$/;

const SPECIFIC_USE_ZONE_PATTERN =
  '(?:제[123]종전용주거지역|제[123]종일반주거지역|준주거지역|중심상업지역|일반상업지역|근린상업지역|유통상업지역|전용공업지역|일반공업지역|준공업지역|보전녹지지역|생산녹지지역|자연녹지지역|보전관리지역|생산관리지역|계획관리지역|관리지역|농림지역|자연환경보전지역)';

function normalizeBaseDateLabel(raw: string): string | undefined {
  const cleaned = raw.trim().replace(/^['"‘’“”]+|['"‘’“”]+$/g, '');
  if (!cleaned) return undefined;

  // 이미 '26년 1월 기준 형태인 경우
  const alreadyMatch = cleaned.match(/^'?(\d{2})년\s*0?(\d{1,2})월\s*기준$/);
  if (alreadyMatch) {
    return `'${alreadyMatch[1]}년 ${Number(alreadyMatch[2])}월 기준`;
  }

  // 2026/01, 2026.01, 2026-01, 2026년 1월, 2026. 1. 1 기준 등
  const ymMatch = cleaned.match(/(?:20)?(\d{2})\s*[./년-]\s*0?(\d{1,2})/);
  if (ymMatch) {
    const yy = ymMatch[1];
    const mm = Number(ymMatch[2]);
    if (mm >= 1 && mm <= 12) {
      return `'${yy}년 ${mm}월 기준`;
    }
  }

  return cleaned;
}

function splitRegulationSectionItems(sectionText: string): string[] {
  if (!sectionText) return [];
  const flattened = sectionText
    .replace(/\r\n/g, '\n')
    .replace(/^[\s:：]+/, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!flattened || IGNORED_ITEM_RE.test(flattened)) {
    return [];
  }

  const rawTokens = flattened.split(/\s*,\s*/);
  const result: string[] = [];
  const seen = new Set<string>();

  for (const tok of rawTokens) {
    const item = tok
      .replace(/^[•·\-*]\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!item || IGNORED_ITEM_RE.test(item)) continue;
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }

  return result;
}

function extractMixedZoningShares(
  text: string,
  parcelAreaSqm?: number,
): Array<{ zoneName: string; areaSqm?: number; ratioPct: number }> | undefined {
  // 1) 면적(㎡) 명시 패턴: 예) "제3종일반주거지역 420㎡, 일반상업지역 180㎡"
  const areaRe = new RegExp(
    `(${SPECIFIC_USE_ZONE_PATTERN})\\s*[:：(]?\\s*([\\d,]+(?:\\.\\d+)?)\\s*(?:㎡|m²|m2)\\s*\\)?`,
    'gi',
  );
  const areaMap = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = areaRe.exec(text)) !== null) {
    const zoneName = m[1].trim();
    const areaVal = parseFloat(m[2].replace(/,/g, ''));
    if (zoneName && Number.isFinite(areaVal) && areaVal > 0) {
      areaMap.set(zoneName, (areaMap.get(zoneName) || 0) + areaVal);
    }
  }

  if (areaMap.size >= 2) {
    const totalArea = Array.from(areaMap.values()).reduce((acc, v) => acc + v, 0);
    if (totalArea > 0) {
      return Array.from(areaMap.entries()).map(([zoneName, area]) => ({
        zoneName,
        areaSqm: Number(area.toFixed(1)),
        ratioPct: Number(((area / totalArea) * 100).toFixed(1)),
      }));
    }
  }

  // 2) 비율(%) 명시 패턴: 예) "제2종일반주거지역 70.0%, 제3종일반주거지역 30.0%"
  const pctRe = new RegExp(
    `(${SPECIFIC_USE_ZONE_PATTERN})\\s*[:：(]?\\s*([\\d,]+(?:\\.\\d+)?)\\s*%\\s*\\)?`,
    'gi',
  );
  const pctMap = new Map<string, number>();
  while ((m = pctRe.exec(text)) !== null) {
    const zoneName = m[1].trim();
    const pctVal = parseFloat(m[2].replace(/,/g, ''));
    if (zoneName && Number.isFinite(pctVal) && pctVal > 0) {
      pctMap.set(zoneName, pctVal);
    }
  }

  if (pctMap.size >= 2) {
    return Array.from(pctMap.entries()).map(([zoneName, pct]) => ({
      zoneName,
      ...(parcelAreaSqm && parcelAreaSqm > 0
        ? { areaSqm: Number(((parcelAreaSqm * pct) / 100).toFixed(1)) }
        : {}),
      ratioPct: Number(pct.toFixed(1)),
    }));
  }

  return undefined;
}

/**
 * 토지이용계획확인원(확인서) 추출 텍스트를 결정론적으로 파싱합니다.
 */
export function parseLandUseConfirmPdfText(rawText: string): ParsedLandUseConfirmPdf {
  const text = String(rawText || '').replace(/\r\n/g, '\n');
  if (!text.trim()) {
    return {
      nationalPlanItems: [],
      otherLawItems: [],
      implementationRuleItems: [],
    };
  }

  // 1. 소재지 / 지번
  let jibunAddress: string | undefined;
  const locWithJibunCell = text.match(
    /소\s*재\s*지\s*[:：]?\s*([^\n\r|]+?)\s+지\s*번\s*[:：]?\s*([산]?\s*\d+(?:-\d+)?(?:\s*번지)?)/,
  );
  if (locWithJibunCell) {
    jibunAddress = `${locWithJibunCell[1].trim()} ${locWithJibunCell[2].trim().replace(/\s+/g, '')}`;
  } else {
    const locMatch = text.match(
      /소\s*재\s*지\s*[:：]?\s*([^\n\r|]+?)(?=\s+(?:지\s*목|면\s*적|개별공시지가)|\n|$)/,
    );
    if (locMatch) {
      const candidate = locMatch[1].trim();
      if (candidate) jibunAddress = candidate;
    }
  }

  // 2. 지목
  let jimok: string | undefined;
  const jimokMatch = text.match(
    /지\s*목\s*[:：]?\s*([가-힣]{1,10}?)(?=\s+(?:면\s*적|개별공시지가|「|국토의)|\n|$)/,
  );
  if (jimokMatch && jimokMatch[1]) {
    jimok = jimokMatch[1].trim();
  }

  // 3. 면적
  let areaSqm: number | undefined;
  const areaMatch = text.match(
    /면\s*적(?:\s*\(\s*(?:㎡|m²|m2)\s*\))?\s*[:：]?\s*([\d,]+(?:\.\d+)?)\s*(?:㎡|m²|m2)?/i,
  );
  if (areaMatch && areaMatch[1]) {
    const parsedArea = parseFloat(areaMatch[1].replace(/,/g, ''));
    if (Number.isFinite(parsedArea) && parsedArea > 0) {
      areaSqm = parsedArea;
    }
  }

  // 4. 개별공시지가 및 기준연월
  let officialLandPricePerSqm: number | undefined;
  let officialLandPriceBaseLabel: string | undefined;
  const priceMatch = text.match(
    /개별공시지가(?:\s*\([^)]*\))?\s*[:：]?\s*([\d,]+)\s*(?:원\s*(?:\/\s*(?:㎡|m²|m2))?)?(?:\s*\(([^)]+)\))?/i,
  );
  if (priceMatch && priceMatch[1]) {
    const parsedPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
    if (Number.isFinite(parsedPrice) && parsedPrice > 0) {
      officialLandPricePerSqm = parsedPrice;
    }
    if (priceMatch[2]) {
      officialLandPriceBaseLabel = normalizeBaseDateLabel(priceMatch[2]);
    }
  }

  // 5. 법령별 지역·지구등 3행 추출
  const header1Re =
    /(?:「\s*)?국토의\s*계획\s*및\s*이용에\s*관한\s*법률(?:\s*」)?\s*(?:에\s*따른\s*)?지역\s*[·ㆍ.]?\s*지구\s*등/;
  const header2Re = /다른\s*법령\s*등에\s*따른\s*지역\s*[·ㆍ.]?\s*지구\s*등/;
  const header3Re =
    /(?:「\s*)?토지이용규제\s*기본법\s*시행령(?:\s*」)?\s*제9조\s*제4항(?:\s*각\s*호에\s*해당(?:되는|하는)\s*사항)?/;
  const footerBoundaryRe =
    /(?:^|\n)\s*(?:■|※|비\s*고\s*[:：]|추가입력|유의사항|확인사항|열람일시|발급일|<비고>|\[비고\])/;

  const m1 = header1Re.exec(text);
  const m2 = header2Re.exec(text);
  const m3 = header3Re.exec(text);

  const findEndIndex = (startAfter: number, nextPositions: Array<number | undefined>): number => {
    const validNext = nextPositions.filter(
      (pos): pos is number => typeof pos === 'number' && pos > startAfter,
    );
    const tail = text.slice(startAfter);
    const fMatch = footerBoundaryRe.exec(tail);
    if (fMatch) {
      validNext.push(startAfter + fMatch.index);
    }
    return validNext.length > 0 ? Math.min(...validNext) : text.length;
  };

  let nationalPlanItems: string[] = [];
  if (m1) {
    const start1 = m1.index + m1[0].length;
    const end1 = findEndIndex(start1, [m2?.index, m3?.index]);
    nationalPlanItems = splitRegulationSectionItems(text.slice(start1, end1));
  }

  let otherLawItems: string[] = [];
  if (m2) {
    const start2 = m2.index + m2[0].length;
    const end2 = findEndIndex(start2, [m1?.index, m3?.index]);
    otherLawItems = splitRegulationSectionItems(text.slice(start2, end2));
  }

  let implementationRuleItems: string[] = [];
  if (m3) {
    const start3 = m3.index + m3[0].length;
    const end3 = findEndIndex(start3, [m1?.index, m2?.index]);
    implementationRuleItems = splitRegulationSectionItems(text.slice(start3, end3));
  }

  // 6. 복수 용도지역 면적/비율 추출
  const zoningShares = extractMixedZoningShares(text, areaSqm);

  return {
    ...(jibunAddress ? { jibunAddress } : {}),
    ...(jimok ? { jimok } : {}),
    ...(areaSqm !== undefined ? { areaSqm } : {}),
    ...(officialLandPricePerSqm !== undefined ? { officialLandPricePerSqm } : {}),
    ...(officialLandPriceBaseLabel ? { officialLandPriceBaseLabel } : {}),
    nationalPlanItems,
    otherLawItems,
    implementationRuleItems,
    ...(zoningShares ? { zoningShares } : {}),
  };
}

/**
 * PDF 바이너리 버퍼로부터 토지이용계획확인원 텍스트를 추출하고 파싱합니다.
 */
export async function parseLandUseConfirmPdfBuffer(
  buffer: Buffer,
): Promise<ParsedLandUseConfirmPdf> {
  if (!buffer || buffer.length === 0) {
    return parseLandUseConfirmPdfText('');
  }

  try {
    const mod = (await import('pdf-parse')) as any;
    if (typeof mod?.PDFParse === 'function') {
      const parser = new mod.PDFParse({ data: buffer });
      try {
        const res = await parser.getText();
        return parseLandUseConfirmPdfText(String(res?.text || ''));
      } finally {
        await parser.destroy?.().catch(() => {});
      }
    }
    const fn = mod?.default ?? mod;
    if (typeof fn === 'function') {
      const res = await fn(buffer);
      return parseLandUseConfirmPdfText(String(res?.text || ''));
    }
  } catch {
    // pdf-parse 실패 시 빈 결과 반환
  }

  return parseLandUseConfirmPdfText('');
}

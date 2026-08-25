export const TEXT_LIMITS = {
  slideTitle: 32,
  kicker: 32,
  subTitle: 50,
  leadSentence: 100,
  subHeading: 35,
  statLabel: 18,
  statValue: 10,
  statSub: 27,
  calloutTitle: 30,
  tableHeader: 16,
  tableCell: 27,
  note: 140
};

export function charsPerLine(boxWidth: number, fontSize?: number): number {
  // F3 fix: CJK 문자 너비 = 약 0.19인치 @ 10pt 맑은 고딕 (기존 0.152는 Latin 기준)
  const cjkCoeff = 0.19 * (10 / (fontSize || 10));
  return Math.floor((boxWidth - 0.36) / cjkCoeff);
}

export function calcCalloutHeight(bodyText: string, boxWidth: number): number {
  const charsLine = charsPerLine(boxWidth);
  const explicitLines = (bodyText.match(/\n/g) || []).length;
  const wrappedLines = bodyText.split('\n').reduce((sum, seg) => sum + Math.ceil(seg.length / charsLine), 0);
  const totalLines = Math.max(wrappedLines, explicitLines + 1);
  return 0.55 + totalLines * 0.29;
}

export function truncateText(text: string, maxChars: number): string {
  if (text.length > maxChars) {
    return text.substring(0, maxChars - 3) + '...';
  }
  return text;
}

/**
 * 텍스트를 예산 한도 내로 강제 트렁케이션합니다.
 * 한국어 문장 단위로 자르되, 자연스럽게 끊기도록 처리합니다.
 */
export function enforceTextBudget(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf(". "),
    truncated.lastIndexOf("다. "),
    truncated.lastIndexOf("요. "),
    truncated.lastIndexOf("음. "),
    truncated.lastIndexOf("다."),
    truncated.lastIndexOf("요."),
    truncated.lastIndexOf("함."),
    truncated.lastIndexOf("임."),
    truncated.lastIndexOf("."),
  );
  if (lastSentenceEnd > maxLen * 0.5) {
    let endIdx = lastSentenceEnd + 1;
    if (['다', '요', '음', '함', '임'].includes(truncated[lastSentenceEnd]) && truncated[lastSentenceEnd + 1] === '.') {
      endIdx = lastSentenceEnd + 2;
    }
    if (truncated[endIdx] === ' ') endIdx++;
    return truncated.slice(0, endIdx).trim();
  }
  // 문장 부호가 없다면 공백(단어 경계) 기준으로 안전하게 끊기
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.65) {
    return truncated.slice(0, lastSpace).trim() + "…";
  }
  return truncated.trimEnd() + "…";
}

export function validateTextBudgets(texts: {type: keyof typeof TEXT_LIMITS | string, text: string}[]): string[] {
  const warnings: string[] = [];
  for (const {type, text} of texts) {
    const limit = TEXT_LIMITS[type as keyof typeof TEXT_LIMITS];
    if (limit && text.length > limit) {
      warnings.push(`Text budget exceeded for ${type}: length ${text.length} > limit ${limit}`);
    }
  }
  return warnings;
}

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoundsLimit {
  maxW?: number;
  maxH?: number;
  safeMarginX?: number;
  safeMarginY?: number;
}

/**
 * PPTX 객체의 좌표 및 크기가 인쇄/슬라이드 안전 영역(기본 12.713 x 6.75)을 초과하지 않는지 검증합니다.
 */
export function assertBounds(
  element: BoundingBox,
  limits: BoundsLimit = { maxW: 12.713, maxH: 6.75 }
): { valid: boolean; error?: string } {
  const maxW = limits.maxW ?? 12.713;
  const maxH = limits.maxH ?? 6.75;
  const right = element.x + element.w;
  const bottom = element.y + element.h;

  if (right > maxW + 0.05) { // 0.05 inch margin of floating error
    return {
      valid: false,
      error: `Element right edge (${right.toFixed(3)}) exceeds max safe width (${maxW.toFixed(3)})`,
    };
  }
  if (bottom > maxH + 0.05) {
    return {
      valid: false,
      error: `Element bottom edge (${bottom.toFixed(3)}) exceeds max safe height (${maxH.toFixed(3)})`,
    };
  }
  return { valid: true };
}


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
  if (!bodyText || bodyText.trim().length === 0) {
    return 0.55;
  }
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
  let result: string;
  if (lastSentenceEnd > maxLen * 0.5) {
    let endIdx = lastSentenceEnd + 1;
    if (['다', '요', '음', '함', '임'].includes(truncated[lastSentenceEnd]) && truncated[lastSentenceEnd + 1] === '.') {
      endIdx = lastSentenceEnd + 2;
    }
    if (truncated[endIdx] === ' ') endIdx++;
    result = truncated.slice(0, endIdx).trim();
  } else {
    // 문장 부호가 없다면 공백(단어 경계) 기준으로 안전하게 끊기
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > maxLen * 0.65) {
      result = truncated.slice(0, lastSpace).trim() + "…";
    } else {
      result = truncated.trimEnd() + "…";
    }
  }

  // D33 M-F: 괄호 균형 수리 — 절삭으로 열린 괄호가 닫히지 않은 경우 보정
  result = repairBracketBalance(result);
  return result;
}

/** D33 M-F: 열린 괄호를 닫아 균형을 맞춥니다 */
function repairBracketBalance(text: string): string {
  const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}', '（': '）' };
  const CLOSE_TO_OPEN: Record<string, string> = { ')': '(', ']': '[', '}': '{', '）': '（' };
  const stack: string[] = [];

  for (const ch of text) {
    if (ch in PAIRS) {
      stack.push(ch);
    } else if (ch in CLOSE_TO_OPEN) {
      if (stack.length > 0 && stack[stack.length - 1] === CLOSE_TO_OPEN[ch]) {
        stack.pop();
      }
    }
  }

  // 닫히지 않은 괄호를 역순으로 닫기
  let repaired = text;
  while (stack.length > 0) {
    const open = stack.pop()!;
    repaired += PAIRS[open];
  }
  return repaired;
}

// W-PPTX-3: 절삭 메타데이터 반환 버전
export interface TextBudgetResult {
  text: string;
  wasTruncated: boolean;
  originalLength: number;
  truncatedLength: number;
}

export function enforceTextBudgetWithMeta(text: string, maxLen: number): TextBudgetResult {
  const result = enforceTextBudget(text, maxLen);
  const wasTruncated = !!text && text !== result;
  if (wasTruncated) {
    console.warn(`[text-budget] Text truncated: ${text.length} → ${result.length} chars (limit: ${maxLen})`);
  }
  return {
    text: result,
    wasTruncated,
    originalLength: text?.length ?? 0,
    truncatedLength: result?.length ?? 0,
  };
}

export function validateTextBudgets(
  values: { type: keyof typeof TEXT_LIMITS | string; text: string }[],
  options?: { autoEnforce?: boolean }
): string[];
export function validateTextBudgets(
  values: Record<string, string>,
  options?: { autoEnforce?: boolean }
): Record<string, string>;
export function validateTextBudgets(
  values: { type: keyof typeof TEXT_LIMITS | string; text: string }[] | Record<string, string>,
  options?: { autoEnforce?: boolean }
): string[] | Record<string, string> {
  if (Array.isArray(values)) {
    const warnings: string[] = [];
    for (const { type, text } of values) {
      const limit = TEXT_LIMITS[type as keyof typeof TEXT_LIMITS];
      if (limit && text.length > limit) {
        warnings.push(`Text budget exceeded for ${type}: length ${text.length} > limit ${limit}`);
        // W-PPTX-3: 절삭 필드 경고 로그
        console.warn(`[text-budget] Field "${type}" exceeds budget: ${text.length} > ${limit} chars`);
      }
    }
    return warnings;
  } else {
    const result = { ...values };
    for (const [key, value] of Object.entries(values)) {
      const limitKey = key as keyof typeof TEXT_LIMITS;
      const limit = TEXT_LIMITS[limitKey];
      if (limit && value.length > limit) {
        console.warn(`[text-budget] ${key} 초과: ${value.length}/${limit}자`);
        if (options?.autoEnforce) {
          result[key] = enforceTextBudget(value, limit);
        }
      }
    }
    return result;
  }
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


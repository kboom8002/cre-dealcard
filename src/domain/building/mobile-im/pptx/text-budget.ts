export const TEXT_LIMITS = {
  slideTitle: 20,
  kicker: 30,
  subTitle: 40,
  leadSentence: 90,
  subHeading: 30,
  statLabel: 14,
  statValue: 6,
  statSub: 24,
  calloutTitle: 26,
  tableHeader: 8,
  tableCell: 12,
  note: 120
};

export function charsPerLine(boxWidth: number, fontSize?: number): number {
  // 한글 기준 (boxWidth - 0.40) / 0.152
  return Math.floor((boxWidth - 0.40) / 0.152);
}

export function calcCalloutHeight(bodyText: string, boxWidth: number): number {
  const charsLine = charsPerLine(boxWidth);
  const lines = Math.ceil(bodyText.length / charsLine);
  return 0.55 + lines * 0.29;
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
  const lastPeriod = Math.max(
    truncated.lastIndexOf(". "),
    truncated.lastIndexOf("다. "),
    truncated.lastIndexOf("요. "),
    truncated.lastIndexOf("음. "),
  );
  if (lastPeriod > maxLen * 0.6) {
    return truncated.slice(0, lastPeriod + 1);
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

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

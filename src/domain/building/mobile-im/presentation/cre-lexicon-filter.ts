export interface LexiconRule {
  banned: RegExp;
  replacement?: string;
  rejectionReason?: string;
}

export const CRE_LEXICON_RULES: LexiconRule[] = [
  {
    banned: /네이밍\s*라이츠|브랜딩\s*라이츠/g,
    replacement: '사옥 단독 명칭 표기(간판 설치권)',
  },
  {
    banned: /캡레이트/g,
    replacement: '연 순수익률 (Cap Rate)',
  },
  {
    banned: /\bGOP\b/g,
    replacement: '실질 영업이익 (GOP)',
  },
  {
    banned: /\bTI\b|\bRent\s*Free\b/gi,
    replacement: '인테리어 지원금(TI) / 렌트프리(무상임대)',
  },
  {
    banned: /프라임|압도적|최고|무조건/g,
    rejectionReason: '공허한 과장 수식어 금지 (한국 CRE 실무 표준)',
  },
];

export interface LexiconFilterResult {
  filteredText: string;
  appliedReplacements: Array<{ original: string; replacedWith: string }>;
  violations: string[];
}

export function applyLexiconFilter(text: string): LexiconFilterResult {
  let filteredText = text;
  const appliedReplacements: Array<{ original: string; replacedWith: string }> = [];
  const violations: string[] = [];

  for (const rule of CRE_LEXICON_RULES) {
    if (rule.rejectionReason && rule.banned.test(filteredText)) {
      violations.push(`${rule.rejectionReason} (패턴: ${rule.banned.source})`);
    }

    if (rule.replacement) {
      filteredText = filteredText.replace(rule.banned, (match) => {
        appliedReplacements.push({ original: match, replacedWith: rule.replacement! });
        return rule.replacement!;
      });
    }
  }

  return {
    filteredText,
    appliedReplacements,
    violations,
  };
}

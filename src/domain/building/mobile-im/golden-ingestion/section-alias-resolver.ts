// src/domain/building/mobile-im/golden-ingestion/section-alias-resolver.ts
// 자유 텍스트 섹션명 → MobileIMSectionType 매핑
// 3-Layer: 정확 매칭 → 유사도 매칭 → LLM 폴백

import type { MobileIMSectionType } from "../types";

// ─── Alias Map ───────────────────────────────────────────────────────────────

const SECTION_ALIAS_MAP: Record<MobileIMSectionType, string[]> = {
  property_overview: [
    '자산 개요', '자산개요', '물건개요', '건물개요', '물건 개요',
    'Property Overview', 'Asset Overview', 'Executive Summary',
    '물건 요약', '건물 소개', '대상물건', '투자 대상', '사업개요',
    '사업 개요', '건물 현황', '기본 정보', '물건 정보',
    '개요', 'Overview', 'Summary',
  ],
  location_access: [
    '입지 분석', '입지분석', '위치 분석', '위치분석',
    'Location', 'Location Analysis', 'Location & Access',
    '교통 접근성', '입지 환경', '주변 환경', '상권 분석',
    '입지', '위치', '교통', '접근성', '주변환경',
  ],
  lease_status: [
    '임대차 현황', '임대현황', '임대차현황', '렌트롤', '렌트 롤',
    'Rent Roll', 'Lease Status', 'Tenant Summary', 'Tenancy Schedule',
    '임차인 현황', '계약 현황', '임대차 계약', '임대 현황',
    '임차인', '임대 계약', '공실 현황', '임차인 구성',
  ],
  income_analysis: [
    '수익 분석', '수익분석', '수익성 분석', '수익성분석',
    'Income Analysis', 'NOI Analysis', 'Cash Flow', 'Yield Analysis',
    '캐시플로우', '현금흐름', '투자수익률', 'Cap Rate',
    'NOI', '순영업소득', '수익률', '현금흐름 분석',
    '수익 구조', 'Financial Analysis', '재무 분석',
  ],
  risk_check: [
    '리스크', '위험 분석', '리스크 분석', '리스크분석',
    'Risk', 'Risk Analysis', 'Risk Factors', 'Due Diligence',
    '실사 체크', '주요 리스크', '투자 리스크', '유의사항',
    '위험 요인', '실사', 'DD', '주의사항', '법적 리스크',
  ],
  investment_thesis: [
    '투자 포인트', '투자포인트', '핵심 투자 가치', '투자 매력도',
    'Investment Thesis', 'Key Highlights', 'Investment Highlights',
    '매수 근거', '강점 분석', '투자 가치', '핵심 가치',
    '투자 하이라이트', '매력 포인트', '투자 요약',
  ],
  next_steps: [
    '거래 일정', '진행 절차', '향후 일정', '거래 프로세스',
    'Next Steps', 'Deal Process', 'Transaction Timeline',
    '매각 절차', '투자 절차', '거래 절차', '일정',
    '프로세스', '절차', '타임라인',
  ],
};

// ─── 유사도 계산 (토큰 오버랩 + Levenshtein) ─────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function tokenOverlap(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9가-힣]/g, ' ').split(/\s+/).filter(Boolean);
  const tokensA = new Set(normalize(a));
  const tokensB = new Set(normalize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }
  return overlap / Math.max(tokensA.size, tokensB.size);
}

function combinedSimilarity(input: string, candidate: string): number {
  const normalizedInput = input.toLowerCase().trim();
  const normalizedCandidate = candidate.toLowerCase().trim();

  // 정확 일치
  if (normalizedInput === normalizedCandidate) return 1.0;

  // 포함 관계
  if (normalizedInput.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedInput)) {
    return 0.9;
  }

  // 토큰 오버랩 (70%) + Levenshtein 거리 정규화 (30%)
  const tokenScore = tokenOverlap(normalizedInput, normalizedCandidate);
  const maxLen = Math.max(normalizedInput.length, normalizedCandidate.length);
  const levScore = maxLen > 0 ? 1 - levenshtein(normalizedInput, normalizedCandidate) / maxLen : 0;

  return tokenScore * 0.7 + levScore * 0.3;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface SectionResolveResult {
  type: MobileIMSectionType;
  confidence: number;
  matchedAlias: string;
  method: 'exact' | 'fuzzy' | 'llm' | 'unknown';
}

/**
 * 자유 텍스트 섹션명을 MobileIMSectionType으로 매핑합니다.
 *
 * 3-Layer 매칭:
 * 1. 정확 매칭 (alias map에서 대소문자 무시 비교) → confidence=1.0
 * 2. 유사도 매칭 (토큰 오버랩 + Levenshtein) → confidence=유사도 점수
 * 3. 매칭 실패 → confidence=0, type 추정
 *
 * @param rawTitle - PDF/PPTX에서 추출된 원본 섹션명
 * @returns 매핑 결과 (type, confidence, matchedAlias, method)
 */
export function resolveSection(rawTitle: string): SectionResolveResult {
  const cleaned = rawTitle.trim();
  if (!cleaned) {
    return { type: 'property_overview', confidence: 0, matchedAlias: '', method: 'unknown' };
  }

  // Layer 1: 정확 매칭
  for (const [sectionType, aliases] of Object.entries(SECTION_ALIAS_MAP)) {
    for (const alias of aliases) {
      if (cleaned.toLowerCase() === alias.toLowerCase()) {
        return {
          type: sectionType as MobileIMSectionType,
          confidence: 1.0,
          matchedAlias: alias,
          method: 'exact',
        };
      }
    }
  }

  // Layer 2: 유사도 매칭
  let bestMatch: SectionResolveResult = {
    type: 'property_overview',
    confidence: 0,
    matchedAlias: '',
    method: 'fuzzy',
  };

  for (const [sectionType, aliases] of Object.entries(SECTION_ALIAS_MAP)) {
    for (const alias of aliases) {
      const score = combinedSimilarity(cleaned, alias);
      if (score > bestMatch.confidence) {
        bestMatch = {
          type: sectionType as MobileIMSectionType,
          confidence: Math.round(score * 100) / 100,
          matchedAlias: alias,
          method: 'fuzzy',
        };
      }
    }
  }

  // 신뢰도 0.5 이상이면 fuzzy 매칭 결과 반환
  if (bestMatch.confidence >= 0.5) {
    return bestMatch;
  }

  // Layer 3: 매칭 실패 — 최선 추정 반환 (confidence 그대로 낮게)
  return {
    ...bestMatch,
    method: 'unknown',
  };
}

/**
 * 여러 섹션명을 일괄 매핑합니다.
 * confidence < threshold인 항목은 needsReview=true로 표시됩니다.
 */
export function resolveSections(
  rawTitles: string[],
  confidenceThreshold: number = 0.7,
): Array<SectionResolveResult & { rawTitle: string; needsReview: boolean }> {
  return rawTitles.map(title => {
    const result = resolveSection(title);
    return {
      ...result,
      rawTitle: title,
      needsReview: result.confidence < confidenceThreshold,
    };
  });
}

/**
 * 역방향: MobileIMSectionType의 한국어 대표 이름을 반환합니다.
 */
export function getSectionDisplayName(type: MobileIMSectionType): string {
  const displayNames: Record<MobileIMSectionType, string> = {
    property_overview: '자산 개요',
    location_access: '입지 분석',
    lease_status: '임대차 현황',
    income_analysis: '수익 분석',
    risk_check: '리스크',
    investment_thesis: '투자 포인트',
    next_steps: '거래 일정',
  };
  return displayNames[type] || type;
}

// src/domain/building/mobile-im/guardrails.ts
// 가드레일 시스템 — cre-fullim의 draft-guardrails.ts 핵심 함수 이식.
// cre-dealcard의 safe-language.ts와 병용: 이 모듈은 더 구체적인 CRE 금융 패턴을 커버.
//
// P0 (즉시 차단): 투자 추천, 수익률 보장, 대출 확정, 법적 무결성 확정
// High (경고 + 치환): 가치평가 확정, 가치상승 확정, 세무 확정, 허가 확정

export type RiskSeverity = "low" | "medium" | "high" | "p0";
export type RiskStatus = "pass" | "revise" | "blocked";
export type DisclosureStatus = "pass" | "redacted" | "blocked";

export interface RiskIssue {
  issue_type: string;
  severity: RiskSeverity;
  original_text?: string;
  recommended_text?: string;
  message: string;
}

export interface RiskBoundaryResult {
  status: RiskStatus;
  issues: RiskIssue[];
  safe_text?: string;
}

// ─── 금지 패턴 테이블 ───────────────────────────────────────────────────────

interface ForbiddenPattern {
  pattern: RegExp;
  issue_type: string;
  severity: RiskSeverity;
  message: string;
  recommended_text: string;
}

const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  // P0: 투자 추천
  {
    pattern: /매수\s*(를)?\s*추천|투자\s*가치가\s*높|안전한\s*투자처|우량\s*매물|확실한\s*투자|강력히\s*추천/,
    issue_type: "investment_recommendation",
    severity: "p0",
    message: "투자 추천 또는 확정적 투자 가치 표현은 허용되지 않습니다.",
    recommended_text: "투자 적합 여부는 별도 실사와 전문가 검토를 통해 판단해야 합니다.",
  },
  // P0: 수익률 보장
  {
    pattern: /수익률\s*(이|은|가)?\s*보장|NOI\s*(가|이)?\s*확정|현금흐름\s*(이|을)?\s*보장|Cap\s*Rate\s*(가|이)?\s*안정/,
    issue_type: "financial_certainty",
    severity: "p0",
    message: "수익률/NOI/현금흐름 보장 표현은 허용되지 않습니다.",
    recommended_text: "수익률은 가정과 실사 결과에 따라 달라질 수 있습니다.",
  },
  // P0: 대출 확정
  {
    pattern: /대출\s*(이)?\s*가능합니다|LTV\s*\d+%\s*가능|금리\s*(가|이)?\s*확정|DSCR\s*(이|가)?\s*충분|대출\s*승인/,
    issue_type: "loan_certainty",
    severity: "p0",
    message: "대출 가능 확정 표현은 허용되지 않습니다.",
    recommended_text: "대출 가능성과 조건은 금융기관 심사, 담보평가, 차주 신용도, 시장금리에 따라 달라질 수 있습니다.",
  },
  // P0: 법적 무결성
  {
    pattern: /법적\s*문제\s*(없음|없습니다)|위반건축물\s*문제\s*없/,
    issue_type: "legal_certainty",
    severity: "p0",
    message: "법적 문제 없음 확정 표현은 허용되지 않습니다.",
    recommended_text: "법적 사항은 별도 법률 전문가 검토가 필요합니다.",
  },
  // High: 가치평가 확정
  {
    pattern: /적정\s*가격|저평가|시장가보다\s*저렴|가격\s*상승\s*확실/,
    issue_type: "valuation_certainty",
    severity: "high",
    message: "가치평가 확정 표현은 허용되지 않습니다.",
    recommended_text: "주변 사례와 보정 기준을 함께 검토해야 합니다.",
  },
  // High: 가치상승 확정
  {
    pattern: /리모델링하면\s*임대료\s*상승|공실\s*쉽게\s*해소|MD\s*개선으로\s*가치\s*상승/,
    issue_type: "value_add_certainty",
    severity: "high",
    message: "가치상승 확정 표현은 허용되지 않습니다.",
    recommended_text: "리모델링 및 가치상승 가능성은 공사비, 공실기간, 주변 임대사례 확인이 필요합니다.",
  },
  // High: 세무 확정
  {
    pattern: /세금상\s*유리|절세\s*가능|세금\s*(이)?\s*없/,
    issue_type: "tax_certainty",
    severity: "high",
    message: "세무상 확정 표현은 허용되지 않습니다.",
    recommended_text: "세무 사항은 전문 세무사 검토가 필요합니다.",
  },
  // High: 허가 확정
  {
    pattern: /용도변경\s*가능|증축\s*가능/,
    issue_type: "permit_certainty",
    severity: "high",
    message: "허가 가능 확정 표현은 허용되지 않습니다.",
    recommended_text: "용도변경 및 증축 가능 여부는 관할 관청 확인이 필요합니다.",
  },
];

// ─── runRiskBoundaryCheck ──────────────────────────────────────────────────

export function runRiskBoundaryCheck(
  text: string,
  _sectionType?: string
): RiskBoundaryResult {
  const issues: RiskIssue[] = [];

  for (const fp of FORBIDDEN_PATTERNS) {
    const match = text.match(fp.pattern);
    if (match) {
      issues.push({
        issue_type: fp.issue_type,
        severity: fp.severity,
        original_text: match[0],
        recommended_text: fp.recommended_text,
        message: fp.message,
      });
    }
  }

  const hasP0 = issues.some((i) => i.severity === "p0");
  const hasHigh = issues.some((i) => i.severity === "high");
  const status: RiskStatus = hasP0 ? "blocked" : hasHigh ? "revise" : "pass";

  let safeText = text;
  for (const fp of FORBIDDEN_PATTERNS) {
    if (fp.pattern.test(safeText)) {
      safeText = safeText.replace(fp.pattern, fp.recommended_text);
    }
  }

  return { status, issues, safe_text: safeText };
}

// ─── 보호 필드 감지기 ────────────────────────────────────────────────────────

interface ProtectedFieldDetector {
  field: string;
  patterns: RegExp[];
  publicBlocked: boolean;
  replacement: string;
}

const PROTECTED_FIELD_DETECTORS: ProtectedFieldDetector[] = [
  {
    field: "exact_address",
    patterns: [
      /[가-힣]+구\s+[가-힣]+동\s*\d+[-\d]*/,
      /[가-힣]+시\s+[가-힣]+구\s+[가-힣]+동/,
    ],
    publicBlocked: true,
    replacement: "[지역 신호로 대체됨]",
  },
  {
    field: "tenant_name",
    patterns: [
      /[가-힣A-Za-z0-9]+\s*(임차인|입점|세입자)/,
      /스타벅스|CU|GS25|이마트|롯데마트|올리브영/,
    ],
    publicBlocked: true,
    replacement: "[임차인 업종 정보로 대체됨]",
  },
  {
    field: "unit_rent",
    patterns: [
      /월세\s*\d+만\s*원/,
      /보증금\s*\d+억/,
      /\d+호\s*[가-힣]*\s*\d+만\s*원/,
    ],
    publicBlocked: true,
    replacement: "[임대수익 존재, 상세 내용 비공개]",
  },
  {
    field: "seller_motivation",
    patterns: [/상속\s*문제로|급매|이혼\s*매물|자금\s*압박/],
    publicBlocked: true,
    replacement: "[매도자 사정 비공개]",
  },
  {
    field: "negotiation_memo",
    patterns: [/\d+억까지\s*가능|협상가|네고\s*가능/],
    publicBlocked: true,
    replacement: "[내부 협상 메모 비공개]",
  },
];

export interface DisclosureGuardResult {
  status: DisclosureStatus;
  safe_text: string;
  redacted_fields: string[];
}

export function runDisclosureGuard(text: string): DisclosureGuardResult {
  const redactedFields: string[] = [];
  let safeText = text;
  let hasViolation = false;

  for (const detector of PROTECTED_FIELD_DETECTORS) {
    for (const pattern of detector.patterns) {
      if (pattern.test(safeText)) {
        hasViolation = true;
        if (!redactedFields.includes(detector.field)) redactedFields.push(detector.field);
        safeText = safeText.replace(pattern, detector.replacement);
        break;
      }
    }
  }

  return {
    status: hasViolation ? "redacted" : "pass",
    safe_text: safeText,
    redacted_fields: redactedFields,
  };
}

/** 표준 면책 문구 — 모든 Mobile IM에 의무 삽입 */
export const MOBILE_IM_STANDARD_DISCLAIMER =
  "본 자료는 제공자료와 공개정보를 바탕으로 한 예비 검토 자료이며, " +
  "투자 권유, 감정평가, 법률·세무·대출 가능성 판단을 목적으로 하지 않습니다. " +
  "실제 거래 여부는 별도 실사와 전문가 검토를 통해 판단해야 합니다.";

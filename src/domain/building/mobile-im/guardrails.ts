// src/domain/building/mobile-im/guardrails.ts
// 가드레일 시스템 — cre-fullim의 draft-guardrails.ts 핵심 함수 이식.
// cre-dealcard의 safe-language.ts와 병용: 이 모듈은 더 구체적인 CRE 금융 패턴을 커버.
//
// P0 (즉시 차단): 투자 추천, 수익률 보장, 대출 확정, 법적 무결성 확정
// High (경고 + 치환): 가치평가 확정, 가치상승 확정, 세무 확정, 허가 확정

import { rewriteUnsafeText } from "@/domain/guardrails/safe-language";

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
    pattern: /매수\s*(를)?\s*추천|투자\s*가치가\s*높|안전한\s*투자처|우량\s*매물|확실한\s*투자|강력히\s*추천|무조건\s*상승/,
    issue_type: "investment_recommendation",
    severity: "p0",
    message: "투자 추천 또는 확정적 투자 가치 표현은 허용되지 않습니다.",
    recommended_text: "투자 적합 여부는 별도 실사와 전문가 검토를 통해 판단해야 합니다.",
  },
  // P0: 수익률 보장
  {
    pattern: /수익률\s*(이|은|가)?\s*보장|원금\s*(이|은|가)?\s*보장|NOI\s*(가|이)?\s*확정|현금흐름\s*(이|을)?\s*보장|Cap\s*Rate\s*(가|이)?\s*안정/,
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
  // High: 임차인 안정성 확정
  {
    pattern: /임차인\s*(이|가)?\s*안정|임대차\s*문제\s*없|공실\s*위험\s*없/,
    issue_type: "tenant_certainty",
    severity: "high",
    message: "임차인 안정성 확정 표현은 허용되지 않습니다.",
    recommended_text: "임차인 현황 및 계약 조건은 별도 확인이 필요합니다.",
  },
  // High: 환경/안전 확정
  {
    pattern: /환경\s*문제\s*없|토양\s*오염\s*없|안전\s*점검\s*통과/,
    issue_type: "environmental_certainty",
    severity: "high",
    message: "환경/안전 확정 표현은 허용되지 않습니다.",
    recommended_text: "환경 및 안전 사항은 전문기관 평가가 필요합니다.",
  },
  // Medium: 개발호재 확정
  {
    pattern: /지하철\s*개통\s*확정|교통\s*호재|개발\s*예정/,
    issue_type: "development_certainty",
    severity: "medium",
    message: "개발호재 확정 표현 사용 시 출처를 명시해야 합니다.",
    recommended_text: "관련 개발 계획은 관할 기관의 공식 발표를 확인해 주세요.",
  },
  // Medium: 시세 확정
  {
    pattern: /시세\s*대비\s*\d+%\s*저렴|시세보다\s*낮/,
    issue_type: "market_price_certainty",
    severity: "medium",
    message: "시세 대비 확정 표현은 근거가 필요합니다.",
    recommended_text: "주변 거래사례 및 공시가격을 종합적으로 검토하시기 바랍니다.",
  },
  // P0/High: 미검증 결손 항목 확정 완료 단정 표현 (불변조건 13)
  {
    pattern: /(?:대장\s*오기|면적\s*오기|소재지)\s*(?:정정\s*)?확인\s*완료|동의서\s*징구\s*완료|담보\s*\d+억\s*확인\s*완료|확정적\s*수익률\s*개선|건물\s*가치\s*보장/,
    issue_type: "deficiency_falsification",
    severity: "high",
    message: "미제출/미검증 결손 항목을 확인 완료로 단정하는 표현은 금지됩니다.",
    recommended_text: "해당 사항은 원본 공부 및 서류 실사를 통해 확인이 필요한 항목입니다.",
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

  // ── safe-language.ts 공통 금지 문구 최종 검사 및 변환 ──
  safeText = rewriteUnsafeText(safeText).safeText;

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
    field: "phone_number",
    patterns: [
      /(\d{2,3})[-.\s]?(\d{3,4})[-.\s]?(\d{4})/g,
      /\(?\d{2,3}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/g,
    ],
    publicBlocked: true,
    replacement: "[연락처 비공개]",
  },
  {
    field: "email",
    patterns: [
      /[\w.-]+@[\w.-]+\.\w{2,}/g,
    ],
    publicBlocked: true,
    replacement: "[이메일 비공개]",
  },
  {
    field: "person_name",
    patterns: [
      /[가-힣]{2,4}\s*(님|씨|대표|사장|부장|과장|차장|팀장|이사|상무|전무|부사장|본부장|센터장|실장)/g,
      /담당\s*:?\s*(?!브로커|에이전트|중개사|공인중개사|담당자|전문가|매니저|팀|부서|역할)[가-힣]{2,4}/g,
    ],
    publicBlocked: true,
    replacement: "[인명 비공개]",
  },
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
  // D33 M-C: 건물명 마스킹 — 표지·본문에서 특정 건물명 노출 방지
  {
    field: "building_name",
    patterns: [
      /(?:더\s*)?[가-힣A-Za-z0-9]+(?:빌딩|타워|오피스텔|센터|플라자|스퀘어|파크|몰|아파트)/g,
    ],
    publicBlocked: false, // 건물명은 기본적으로 허용 — 워터마크 모드에서만 차단
    replacement: "[건물명 비공개]",
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

// ── AUTH-07.1: NLG Facts-Only 제약 ──────────────────────────────────────

/** NLG 요청 구조 */
export interface NLGRequest {
  facts: ReadonlyArray<{ key: string; value: string | number; source: string }>;
  mask: string;
  archetype: string;
  forbidden: string[];
}

/** D30 M-16: CATALOG_RULES §7.3 정본 금지어 (확장) */
export const NLG_FORBIDDEN_TERMS = [
  // 투자 보장 (§7.3-1)
  '확실', '보장', '반드시', '절대', '무조건',
  '급등', '폭등', '대박', '100%',
  '수익 보장', '원금 보장', '손실 없', '안전 자산',
  // 법적 확정 (§7.3-2)
  '확정', '확인 완료', '문제없', '적법 확인',
  '하자 없', '위반 없',
  // 시세 단정 (§7.3-3)
  '저렴한 가격', '파격 할인', '시세 이하',
  '최저가', '최고 수익',
  // 외래어 직역 (§7.3-4, CRE 실무 용어집)
  '네이밍 라이츠', '브랜딩 라이츠', '캡레이트',
];

/** Fact 위반 결과 */
export interface FactViolation {
  position: number;
  snippet: string;
  reason: string;
}

/**
 * AUTH-07.1: 생성된 텍스트가 facts 범위를 벗어나지 않는지 검증
 * - 금지어 탐지
 * - facts에 없는 수치 탐지 (AUTH-06.1 FAR 이중 표기 포함)
 */
export function validateFactsOnly(
  generated: string,
  facts: NLGRequest['facts'],
  forbidden?: string[],
): FactViolation[] {
  const violations: FactViolation[] = [];
  const forbiddenList = forbidden ?? NLG_FORBIDDEN_TERMS;

  // 금지어 검사
  for (const term of forbiddenList) {
    const idx = generated.indexOf(term);
    if (idx >= 0) {
      violations.push({
        position: idx,
        snippet: generated.slice(Math.max(0, idx - 20), idx + term.length + 20),
        reason: `금지어 '${term}' 사용`,
      });
    }
  }

  // AUTH-06.1: FAR(용적률) 이중 표기 검증
  const farMatches = generated.match(/용적률\s*[:\s]*[\d,.]+%/g) ?? [];
  if (farMatches.length > 0) {
    // 전체 연면적 기준과 지상 연면적 기준 구분 확인
    const hasTotal = /전체.*용적률|용적률.*전체/i.test(generated);
    const hasAbove = /지상.*용적률|용적률.*지상/i.test(generated);
    if (farMatches.length >= 2 && !hasTotal && !hasAbove) {
      violations.push({
        position: 0,
        snippet: farMatches.join(' / '),
        reason: 'FAR 이중 표기 시 전체/지상 구분 필요 (AUTH-06.1)',
      });
    }
  }

  // Facts에 없는 수치 탐지
  const factValues = new Set(facts.map(f => String(f.value)));
  const numberPattern = /(?:약\s*)?([\d,]+(?:\.\d+)?(?:억|만|%|㎡|평|원|층))/g;
  let match;
  while ((match = numberPattern.exec(generated)) !== null) {
    const numStr = match[1].replace(/[억만%㎡평원층,]/g, '');
    if (numStr && !factValues.has(numStr) && parseFloat(numStr) > 0) {
      // Allow common formatting variations
      const numVal = parseFloat(numStr);
      const isKnownFact = facts.some(f => {
        const fv = typeof f.value === 'number' ? f.value : parseFloat(String(f.value));
        return Math.abs(fv - numVal) / Math.max(fv, 1) < 0.05; // 5% tolerance
      });
      if (!isKnownFact && numVal > 100) {
        // Only flag large numbers to reduce false positives
        violations.push({
          position: match.index,
          snippet: match[0],
          reason: 'Facts에 없는 수치',
        });
      }
    }
  }

  return violations;
}

// ══════════════════════════════════════════════════════════════════════
// v0.5: 문맥 인식형 가드레일 토큰 자연어 치환 & 채널별 뷰 어댑터
// ══════════════════════════════════════════════════════════════════════

/** 출력 채널 구분 (v0.5) */
export type OutputChannel = 'public' | 'institutional' | 'internal';

/** 가드레일 토큰 → 자연어 매핑 (채널별 분기) */
const TOKEN_HUMANIZATION: Record<string, Record<OutputChannel, string>> = {
  '[인명 비공개]':            { public: '담당자',       institutional: '담당자',     internal: '(비공개)' },
  '[연락처 비공개]':          { public: '문의처',       institutional: '중개 문의',  internal: '(비공개)' },
  '[이메일 비공개]':          { public: '문의처',       institutional: '중개 문의',  internal: '(비공개)' },
  '[지역 신호로 대체됨]':     { public: '해당 권역',    institutional: '해당 권역',  internal: '(비공개)' },
  '[임차인 업종 정보로 대체됨]': { public: '주요 임차 업종', institutional: '주요 임차인', internal: '(비공개)' },
  '[임대수익 존재, 상세 내용 비공개]': { public: '임대 수익 발생 확인', institutional: '임대 수익 존재 (NDA)', internal: '(비공개)' },
  '[매도자 사정 비공개]':     { public: '매도 사유 비공개', institutional: '매도 사유 비공개', internal: '(비공개)' },
  '[내부 협상 메모 비공개]':  { public: '',              institutional: '',           internal: '(비공개)' },
};

/** 한국어 조사 보존형 치환 패턴 (토큰 뒤 조사 연결 처리) */
const KOREAN_PARTICLE_RULES: Array<{
  pattern: RegExp;
  replacement: (channel: OutputChannel) => string;
}> = [
  // [인명 비공개]에게, [인명 비공개]게
  { pattern: /\[인명\s*비공개\](에게|게)/g, replacement: () => '담당자에게' },
  // [인명 비공개]의
  { pattern: /\[인명\s*비공개\](의)/g, replacement: () => '담당자의' },
  // [인명 비공개]을, [인명 비공개]를
  { pattern: /\[인명\s*비공개\](을|를)/g, replacement: () => '담당자를' },
  // [인명 비공개]이, [인명 비공개]가
  { pattern: /\[인명\s*비공개\](이|가)/g, replacement: () => '담당자가' },
  // [인명 비공개]은, [인명 비공개]는
  { pattern: /\[인명\s*비공개\](은|는)/g, replacement: () => '담당자는' },
  // [인명 비공개]와, [인명 비공개]과
  { pattern: /\[인명\s*비공개\](와|과)/g, replacement: () => '담당자와' },
];

/**
 * v0.5: 가드레일 토큰을 채널에 맞는 자연어로 치환합니다.
 * 한국어 조사 탈락을 방지하면서 문맥에 맞는 자연스러운 문장을 생성합니다.
 */
export function humanizeGuardrailTokensForView(
  text: string,
  channel: OutputChannel = 'institutional',
): string {
  if (!text) return '';
  let result = text;

  // 1단계: 조사 보존형 치환 (우선 처리)
  for (const rule of KOREAN_PARTICLE_RULES) {
    result = result.replace(rule.pattern, rule.replacement(channel));
  }

  // 2단계: 일반 토큰 치환
  for (const [token, channelMap] of Object.entries(TOKEN_HUMANIZATION)) {
    const humanized = channelMap[channel] || channelMap.institutional;
    if (humanized) {
      result = result.replaceAll(token, humanized);
    } else {
      // 빈 문자열이면 토큰과 앞뒤 공백 제거
      result = result.replaceAll(token, '').replace(/\s{2,}/g, ' ');
    }
  }

  return result.trim();
}

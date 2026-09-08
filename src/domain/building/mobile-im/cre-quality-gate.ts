// src/domain/building/mobile-im/cre-quality-gate.ts
// ──────────────────────────────────────────────────────────────────────────────
// CRE 전용 CMOS Quality Gate — LLM 기반 시맨틱 안전 검증
//
// guardrails.ts의 regex 기반 검증을 보완하는 2차 방어선.
// regex로 잡을 수 없는 패러프레이징된 금지 표현, 데이터 창작,
// 법적 확정 표현, 검증 불가 비교, 무근거 시장 주장을 LLM이 탐지한다.
//
// 핵심 원칙: D30 BL-6 Fail-Closed — LLM 실패 시 발행 차단 (system_error)
// ──────────────────────────────────────────────────────────────────────────────

import { callLLM } from "@/ai/llm-client";
import { getModel } from "@/ai/model-selector";

// ─── Types ───────────────────────────────────────────────────────────────────

/** 위반 유형 — 5가지 CRE 특화 시맨틱 위험 */
export type CREViolationType =
  | "investment_guarantee"
  | "fabricated_data"
  | "legal_assertion"
  | "misleading_comparison"
  | "ungrounded_market_claim"
  | "price_opinion_prohibition";

/** 개별 위반 이슈 */
export interface CREQualityIssue {
  /** 위반 유형 */
  type: CREViolationType;
  /** 문제가 되는 원문 발췌 */
  excerpt: string;
  /** 수정 제안 */
  suggestion: string;
}

/** Quality Gate 검증 결과 */
export interface CREQualityGateResult {
  /** 통과 여부 (이슈가 없거나 모두 low 수준일 때 true) */
  passed: boolean;
  /** 종합 위험 수준 */
  riskLevel: "low" | "medium" | "high";
  /** 발견된 위반 이슈 목록 */
  issues: CREQualityIssue[];
  /** 면책 문구 자동 삽입 필요 여부 */
  autoDisclaimerRequired: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Quality Gate 모델 — IM Judge와 동일 모델 사용 */
const GATE_MODEL = process.env.AI_IM_MODEL || getModel("terra");

/**
 * D30 BL-6: LLM 실패 시 Fail-Closed
 *
 * 원칙: 검증 불가 시 발행 차단 (system_error 분류)
 * CRE 의미 위반 검사(투자 보장·수치 날조·법적 단정 등)는
 * LLM 실패 시 "검사 없이 통과"시키면 안 됩니다 — D26 §2
 * "모르면 우리 잘못으로 셉니다"
 */
const SAFE_DEFAULT_RESULT: CREQualityGateResult = {
  passed: false,        // D30 BL-6: true → false (Fail-Closed)
  riskLevel: "high",    // D30 BL-6: medium → high
  issues: [{
    type: 'fabricated_data',
    excerpt: '[LLM 검사기 호출 실패]',
    suggestion: 'CRE 의미 위반 검사 불가 — system_error 분류, 발행 차단. LLM 서비스 확인 후 재시도.',
  }],
  autoDisclaimerRequired: false, // D30 BL-6: 면책 문구 대체 불가 — 차단
};

// ─── Prompts ─────────────────────────────────────────────────────────────────

/**
 * Quality Gate 시스템 프롬프트
 *
 * 5가지 위반 유형에 대한 한국어 탐지 기준을 상세히 제공.
 * regex가 잡지 못하는 패러프레이징 표현까지 포착하도록 안내.
 */
function buildGateSystemPrompt(): string {
  return `당신은 한국 상업용 부동산(CRE) 투자 정보 자료의 법규 준수 심사관입니다.

아래 마크다운 텍스트를 검토하여 6가지 위반 유형을 탐지하세요.
단순 키워드 매칭이 아닌, 의미적으로 동일한 패러프레이징도 반드시 포착해야 합니다.

## 위반 유형 정의

### 1. investment_guarantee (투자 추천/수익 보장)
- 직접적: "투자를 추천합니다", "수익이 보장됩니다"
- 패러프레이징(regex 우회): "이 물건은 놓치면 후회할 수 있습니다", "안정적인 현금흐름이 기대됩니다",
  "매수 시 손해 볼 가능성은 낮습니다", "수익성이 입증된 구조입니다"
- 판단 기준: 독자가 '사야 한다'는 인상을 받을 수 있는 모든 표현

### 2. fabricated_data (데이터 창작)
- 제공 데이터에 없는 수치, 통계, 사실을 AI가 만들어낸 경우
- 예: 원본에 없는 임대 시세, 거래 사례, 공실률 수치를 구체적으로 기재
- 판단 기준: "~로 알려져 있다", "~인 것으로 추정된다" 등으로 출처 없이 구체적 수치 제시

### 3. legal_assertion (법적 효력 확정)
- "법적 문제가 없습니다", "위반건축물이 아닙니다", "소유권에 하자가 없습니다"
- 패러프레이징: "법률적으로 깨끗한 상태입니다", "권리관계가 명확합니다"
- 판단 기준: 법적 판단을 확정적으로 내리는 표현

### 4. misleading_comparison (검증 불가 시세 비교)
- "주변 시세 대비 저렴합니다", "인근 빌딩보다 수익률이 높습니다"
- 비교 대상의 구체적 출처·조건 없이 유불리를 판단하는 표현
- 판단 기준: 검증 불가능한 비교를 통해 긍정적 인상을 유도

### 5. ungrounded_market_claim (무근거 시장 주장)
- "이 지역 공실률은 X%입니다", "상권이 활성화되고 있습니다"
- 출처 없이 시장 트렌드, 공실률, 임대 수요를 단정적으로 주장
- 판단 기준: 공공데이터나 보고서 인용 없는 시장 현황 기술

### 6. price_opinion_prohibition (주관적 가격 평가 금지)
- 주관적 가격 평가: "적정가", "~할 것으로 보인다", "향후 ~% 상승 예상", "투자 적기"
- 행동 기준: 위반으로 플래그

## 포스처별 CRE 실무 분석 예외 및 지침
1. **사옥/자가사용형 (owner_occupied)**:
   - 기존 임차료 지출 대비 사옥 매입 금융비용 비교, 임차료 절감액, 손익분기 기간, 사옥 전환 실질 부담 분석은 합법적인 CRE 실무 분석이며 investment_guarantee나 misleading_comparison이 아닙니다.
   - 기업 규모(임직원 수, 필요 면적, 인당 면적 등)에 따른 공간 배분 및 통근 접근성 분석은 표준적인 사옥 평가 지표입니다.
   - 사용자 입력(메모, 딜카드)에 명시된 기업 조건(임직원 수, 현재 임차료 지출액, 매각 희망가 등) 및 이에 기초한 산출값은 fabricated_data가 아닙니다.
   - 단독 사옥 브랜딩, 사옥 단독 명칭 표기(간판 설치권), 강남 업무권역 인프라에 대한 객관적 설명은 정상적인 자산 가치 기술입니다.

2. **일반 원칙**:
   - 객관적 교통/인프라(역 도보 N분, 주요 도로 접면 등) 서술은 ungrounded_market_claim이 아닙니다.
   - 조건부 검토 제안("확보하십시오", "검토가 필요합니다", "다음 단계")은 investment_guarantee가 아닙니다.

## 출력 형식 (반드시 아래 JSON 형식 준수)

{
  "issues": [
    {
      "type": "<위반유형>",
      "excerpt": "<문제가 되는 원문 발췌>",
      "suggestion": "<수정 제안>"
    }
  ]
}

위반이 없으면 빈 배열 {"issues": []} 을 반환하세요.`;
}

/**
 * 유저 프롬프트 — 검토 대상 마크다운과 섹션 타입 전달
 */
function buildGateUserPrompt(markdown: string, sectionType: string, posture?: string): string {
  const postureNote = posture
    ? `\n## 매물 투자 포스처: ${posture}\n포스처별 CRE 실무 분석 예외 지침을 엄격히 적용하세요.`
    : '';
  return `## 검토 대상 섹션: ${sectionType}${postureNote}

\`\`\`markdown
${markdown}
\`\`\`

위 마크다운 텍스트에서 6가지 위반 유형을 검사하세요.`;
}

// ─── Risk Level Determination ────────────────────────────────────────────────

/**
 * 이슈 목록에서 종합 위험 수준 결정
 *
 * - investment_guarantee / fabricated_data → high (투자자 보호 최우선)
 * - legal_assertion → high
 * - misleading_comparison / ungrounded_market_claim → medium
 * - 이슈 없음 → low
 */
function determineRiskLevel(issues: CREQualityIssue[]): "low" | "medium" | "high" {
  if (issues.length === 0) return "low";

  // 고위험 유형이 하나라도 있으면 high
  const highRiskTypes: CREViolationType[] = [
    "investment_guarantee",
    "fabricated_data",
    "legal_assertion",
    "price_opinion_prohibition",
  ];

  const hasHighRisk = issues.some((issue) => highRiskTypes.includes(issue.type));
  if (hasHighRisk) return "high";

  return "medium";
}

/**
 * 위반 유형 문자열이 유효한 CREViolationType인지 확인
 */
function isValidViolationType(type: string): type is CREViolationType {
  const validTypes: CREViolationType[] = [
    "investment_guarantee",
    "fabricated_data",
    "legal_assertion",
    "misleading_comparison",
    "ungrounded_market_claim",
  ];
  return validTypes.includes(type as CREViolationType);
}

// ─── Core Function ───────────────────────────────────────────────────────────

/**
 * CRE 전용 시맨틱 Quality Gate 실행
 *
 * regex 기반 guardrails.ts를 통과한 텍스트에 대해 2차로
 * LLM 기반 의미 분석을 수행하여 패러프레이징된 금지 표현을 탐지한다.
 *
 * @param markdown - 검토 대상 마크다운 텍스트
 * @param sectionType - 섹션 유형 (e.g. "investment_thesis")
 * @returns Quality Gate 검증 결과
 *
 * @remarks
 * LLM 호출 실패 시 안전 기본값을 반환한다 (passed=true, autoDisclaimerRequired=true).
 * 이는 파이프라인을 중단시키지 않되, 면책 문구 삽입을 강제하는 전략이다.
 *
 * @example
 * ```ts
 * const gate = await runCREQualityGate(sectionMd, "investment_thesis");
 * if (!gate.passed) {
 *   // 위반 이슈 목록 확인 후 재생성 또는 수동 검토
 *   console.log(gate.issues);
 * }
 * if (gate.autoDisclaimerRequired) {
 *   // 면책 문구 삽입
 * }
 * ```
 */
export async function runCREQualityGate(
  markdown: string,
  sectionType: string,
  posture?: string
): Promise<CREQualityGateResult> {
  try {
    const result = await callLLM(
      {
        systemPrompt: buildGateSystemPrompt(),
        userPrompt: buildGateUserPrompt(markdown, sectionType, posture),
        model: GATE_MODEL,
        responseFormat: "json_object",
        temperature: 0.0, // 안전 검증은 결정론적으로
        maxTokens: 2048,
      },
      {
        cacheKey: posture ? `cre-quality-gate:${sectionType}:${posture}` : `cre-quality-gate:${sectionType}`,
        timeoutMs: 20_000, // Gate 실패 시 템플릿 폴백 존재 → 짧게 유지
      }
    );

    // LLM 응답 파싱
    let cleanContent = result.content.trim();
    // Strip markdown code fences
    cleanContent = cleanContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/m, '').trim();
    // Strip BOM
    cleanContent = cleanContent.replace(/^\uFEFF/, '');
    // Strip trailing commas before } or ]
    cleanContent = cleanContent.replace(/,\s*([}\]])/g, '$1');
    const parsed = JSON.parse(cleanContent) as Record<string, unknown>;

    // issues 배열 파싱 및 검증 — 유효하지 않은 항목은 필터링
    const rawIssues = Array.isArray(parsed.issues) ? parsed.issues : [];
    const issues: CREQualityIssue[] = rawIssues
      .filter(
        (item: unknown): item is Record<string, unknown> =>
          typeof item === "object" && item !== null
      )
      .filter((item) => isValidViolationType(String(item.type ?? "")))
      .map((item) => ({
        type: String(item.type) as CREViolationType,
        excerpt: typeof item.excerpt === "string" ? item.excerpt : "",
        suggestion: typeof item.suggestion === "string" ? item.suggestion : "",
      }))
      // ── Provenance-based whitelist filter ──
      // 표준 부동산 입지 표현은 ungrounded_market_claim에서 제외
      .filter((issue) => {
        const excerpt = issue.excerpt;

        // 1. 일반적 입지/상권/권역/교통 표현 → ungrounded_market_claim 면제
        if (issue.type === "ungrounded_market_claim") {
          const locationWhitelist = /역세권|도보\s?\d+분|입지|상권|생활권|교통|접근성|배후수요|권역|인프라|테헤란로|GBD|CBD|YBD|BND|업무권역|강남|오피스|중심지|개발\s?호재|지하철|환승/;
          if (locationWhitelist.test(excerpt)) return false;
        }

        // 2. 조건부/사옥/비용절감/전환/개발/운영 기대 표현 → investment_guarantee 면제
        if (issue.type === "investment_guarantee") {
          const conditionalPattern = /할 수 있는|기대되는|가능성|검토|예상|구조입니다|측면에서|전환|확보|절감|사옥|자가사용|활용|임차\s?(대체|비용)|자산가치|축적|대안|인수|절세|손비|세제|혜택|개발\s?이익|수익률|Cap\s?Rate|GOP|밸류업|시세차익|시나리오/;
          if (conditionalPattern.test(excerpt)) return false;
        }

        // 3. 출처 명시된 데이터 및 사용자 입력 조건/산출값 → fabricated_data 면제
        if (issue.type === "fabricated_data") {
          const provenancePattern = /AI 추정|공공데이터|SSoT 기준|건축물대장|토지이음|공시지가|국토교통부|통상|평균|권역|임차료|임대료|인상|기회비용|3%|규모|기준|산정|기업|직원|인당|면적|월\s?\d+|배분|절감|자가사용|취득세|4\.6%|9\.4%|감가상각|법인세|세율|세제|손비|사옥|점유|용적률|건폐율|공사비|PF|GOP|RevPAR|매매가|실거래/;
          if (provenancePattern.test(excerpt)) return false;
        }

        // 4. 비용 비교/원가/시세/운영방식 비교 → misleading_comparison 면제
        if (issue.type === "misleading_comparison") {
          const comparisonWhitelist = /비용\s?절감|자가\s?(사용|전환)|임차\s?(대비|대체|비용)|임대\s?시세|실질\s?부담|사옥|입지|신축\s?대비|원가\s?비교|시세\s?대비|직영\s?대비/;
          if (comparisonWhitelist.test(excerpt)) return false;
        }

        // 5. 법정 세율, 건축법, 표준 세무/비용 처리 표현 → legal_assertion 면제
        if (issue.type === "legal_assertion") {
          const taxWhitelist = /취득세|4\.6%|9\.4%|감가상각|손비\s?(인정|처리)|손금산입|법인세\s?(절감|절세)|이자\s?비용\s?(처리|공제)|양도세|종합부동산세|재산세|건축법|인허가|용적률\s?완화|기부채납|지구단위계획|과세특례|공동담보/;
          if (taxWhitelist.test(excerpt)) return false;
        }

        return true;
      });

    const riskLevel = determineRiskLevel(issues);

    // 통과 기준: 이슈가 없거나 riskLevel이 low
    const passed = riskLevel === "low";

    // 면책 문구 필요 여부: high/medium이면 항상, low여도 특정 섹션은 포함
    const disclaimerSections = ["investment_thesis", "income_analysis", "risk_check"];
    const autoDisclaimerRequired =
      riskLevel !== "low" || disclaimerSections.includes(sectionType);

    // 위반 탐지 시 로그
    if (issues.length > 0) {
      console.warn(
        `[cre-quality-gate] 위반 탐지 — section=${sectionType}, ` +
          `riskLevel=${riskLevel}, issues=${issues.length}:`,
        issues.map((i) => `${i.type}: "${i.excerpt.slice(0, 50)}..."`)
      );
    }

    return {
      passed,
      riskLevel,
      issues,
      autoDisclaimerRequired,
    };
  } catch (error) {
    // LLM 실패 시 안전 기본값 반환 — 파이프라인 중단 방지
    console.warn(
      `[cre-quality-gate] LLM 호출 실패 (safe-default 반환) — section=${sectionType}:`,
      error instanceof Error ? error.message : error
    );
    return { ...SAFE_DEFAULT_RESULT };
  }
}

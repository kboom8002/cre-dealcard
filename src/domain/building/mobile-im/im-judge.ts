// src/domain/building/mobile-im/im-judge.ts
// ──────────────────────────────────────────────────────────────────────────────
// LLM-as-Judge 5차원 평가 엔진 — AI가 생성한 Mobile IM 섹션을 별도 LLM 호출로 평가
//
// 꼬마빌딩 IM의 품질을 5가지 축으로 채점하여 자동 재생성 트리거,
// 경고 로그, 또는 수동 검토 큐잉에 활용한다.
// ──────────────────────────────────────────────────────────────────────────────

import { callLLM } from "@/ai/llm-client";

// ─── Types ───────────────────────────────────────────────────────────────────

/** 5차원 + 종합 점수 결과 */
export interface IMJudgeScore {
  /** SSoT/공공데이터 수치 일치도 (0-5) */
  factual_accuracy: number;
  /** Cap Rate·NOI·수익률 등 재무 논리 일관성 (0-5) */
  financial_soundness: number;
  /** 투자추천·수익보장·법적확정 금지 언어 준수 (0-5) */
  regulatory_compliance: number;
  /** 꼬마빌딩 매수자에게 유용한 정보 밀도 (0-5) */
  investor_value: number;
  /** 출처 없는 주장(교통, 임차인, 시장트렌드 등) 여부 (0-5) */
  data_grounding: number;
  /** 가중 평균 종합 점수 */
  overall: number;
  /** 심사 피드백 (개선 제안 포함) */
  feedback: string;
  /** 인용 검증 결과 — 출처 누락 또는 불일치 항목 */
  citation_check: string[];
}

/** Judge 호출 입력 — 생성된 마크다운과 원본 데이터를 함께 전달 */
export interface IMJudgeInput {
  /** 생성된 섹션 마크다운 */
  sectionMarkdown: string;
  /** 섹션 유형 (e.g. "property_overview") */
  sectionType: string;
  /** Building SSoT Lite 데이터 */
  bssotData: Record<string, unknown>;
  /** 외부 공공데이터 스냅샷 (없을 수 있음) */
  externalData: Record<string, unknown> | null;
  /** 브로커 보강 입력 등 보조 데이터 */
  supplementalData: Record<string, unknown>;
  /** 재무 분석 섹션 마크다운 (교차 검증용, 선택) */
  financialsMarkdown?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** 평가 모델 — 환경변수로 오버라이드 가능 */
const JUDGE_MODEL = process.env.AI_IM_MODEL || "gpt-5.4";

/** 5차원 가중치 — 규제 준수와 사실 정확성에 높은 비중 */
const DIMENSION_WEIGHTS: Record<keyof Omit<IMJudgeScore, "overall" | "feedback" | "citation_check">, number> = {
  factual_accuracy: 0.25,
  financial_soundness: 0.20,
  regulatory_compliance: 0.25,
  investor_value: 0.15,
  data_grounding: 0.15,
};

/** 종합 점수 경고 임계값 */
const OVERALL_WARN_THRESHOLD = 3.0;

// ─── Judge Prompt ────────────────────────────────────────────────────────────

/**
 * 평가 시스템 프롬프트 — CRE 도메인 전용 한국어 채점 기준
 *
 * 각 차원별 채점 가이드를 명시하여 LLM이 일관된 기준으로 평가하도록 한다.
 */
function buildJudgeSystemPrompt(): string {
  return `당신은 한국 상업용 부동산(CRE) 꼬마빌딩 투자 메모 품질 심사위원입니다.

아래 5가지 차원에 대해 각각 0~5점(정수)으로 채점하고, 종합 피드백과 인용 검증 결과를 JSON으로 반환하세요.

## 채점 기준

1. **factual_accuracy** (사실 정확도)
   - 제공된 SSoT/공공데이터와 AI 서사의 수치가 일치하는가?
   - 건물 면적, 준공년도, 층수, 용도지역 등 팩트가 정확한가?
   - 5점: 모든 수치 정확, 3점: 사소한 불일치 1-2건, 0점: 핵심 수치 오류

2. **financial_soundness** (재무 건전성)
   - Cap Rate, NOI, 수익률 등 재무 수치가 논리적으로 일관적인가?
   - 월세→연수입→NOI→수익률 계산 체인이 정합적인가?
   - 5점: 완벽한 논리, 3점: 경미한 추정 불일치, 0점: 계산 오류

3. **regulatory_compliance** (규제 준수)
   - 투자 추천, 수익 보장, 법적 확정 등 금지 언어가 없는가?
   - "추천합니다", "수익이 보장됩니다", "법적 문제 없음" 등 금지
   - 5점: 완벽 준수, 3점: 간접적 유도 표현 존재, 0점: 직접 금지 표현 포함

4. **investor_value** (투자자 가치)
   - 꼬마빌딩 매수자에게 유용한 정보 밀도가 충분한가?
   - 실행 가능한 인사이트(교통, 상권, 수익 구조 등)가 포함되어 있는가?
   - 5점: 높은 정보밀도+실행력, 3점: 일반적 수준, 0점: 무의미한 반복

5. **data_grounding** (데이터 근거)
   - 출처 없는 주장(교통, 임차인, 시장 트렌드 등)이 있는가?
   - 공공데이터/SSoT에서 확인 불가한 구체적 수치를 창작하지 않았는가?
   - 5점: 모든 주장 출처 명확, 3점: 일부 미확인, 0점: 다수 창작 의심

## 출력 형식 (반드시 아래 JSON 형식 준수)

{
  "factual_accuracy": <0-5>,
  "financial_soundness": <0-5>,
  "regulatory_compliance": <0-5>,
  "investor_value": <0-5>,
  "data_grounding": <0-5>,
  "feedback": "<개선 제안 포함 종합 피드백>",
  "citation_check": ["<출처 누락/불일치 항목1>", ...]
}`;
}

/**
 * 유저 프롬프트 구성 — 생성된 마크다운과 원본 데이터를 함께 제공
 */
function buildJudgeUserPrompt(input: IMJudgeInput): string {
  const parts: string[] = [
    `## 평가 대상 섹션: ${input.sectionType}`,
    "",
    "### 생성된 마크다운",
    "```markdown",
    input.sectionMarkdown,
    "```",
    "",
    "### SSoT 원본 데이터",
    "```json",
    JSON.stringify(input.bssotData, null, 2),
    "```",
    "",
    "### 보조 입력 데이터",
    "```json",
    JSON.stringify(input.supplementalData, null, 2),
    "```",
  ];

  // 외부 공공데이터가 있으면 포함
  if (input.externalData) {
    parts.push(
      "",
      "### 외부 공공데이터",
      "```json",
      JSON.stringify(input.externalData, null, 2),
      "```"
    );
  }

  // 재무 분석 마크다운이 있으면 교차 검증 참조용으로 포함
  if (input.financialsMarkdown) {
    parts.push(
      "",
      "### 재무 분석 섹션 (교차 참조용)",
      "```markdown",
      input.financialsMarkdown,
      "```"
    );
  }

  parts.push("", "위 데이터를 기반으로 5차원 채점을 수행하세요.");

  return parts.join("\n");
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * 가중 평균 종합 점수 계산
 *
 * @param scores - 5차원 개별 점수
 * @returns 가중 평균 (소수점 둘째자리)
 */
function computeOverall(
  scores: Pick<IMJudgeScore, "factual_accuracy" | "financial_soundness" | "regulatory_compliance" | "investor_value" | "data_grounding">
): number {
  const weighted =
    scores.factual_accuracy * DIMENSION_WEIGHTS.factual_accuracy +
    scores.financial_soundness * DIMENSION_WEIGHTS.financial_soundness +
    scores.regulatory_compliance * DIMENSION_WEIGHTS.regulatory_compliance +
    scores.investor_value * DIMENSION_WEIGHTS.investor_value +
    scores.data_grounding * DIMENSION_WEIGHTS.data_grounding;

  return Math.round(weighted * 100) / 100;
}

/**
 * 점수 값을 0-5 범위로 클램핑
 * LLM이 범위 밖 값을 반환할 수 있으므로 방어적으로 처리
 */
function clampScore(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (isNaN(num)) return 0;
  return Math.max(0, Math.min(5, Math.round(num)));
}

/**
 * AI 생성 IM 섹션을 5차원으로 평가한다.
 *
 * LLM-as-Judge 패턴을 사용하여 생성 품질을 채점하고,
 * 자동 재생성이나 수동 검토 큐잉 판단의 기준으로 활용한다.
 *
 * @param input - 평가 대상 섹션 마크다운 + 원본 데이터
 * @returns 5차원 점수 결과, 실패 시 null (soft-fail)
 *
 * @example
 * ```ts
 * const score = await judgeIMSection({
 *   sectionMarkdown: generatedMd,
 *   sectionType: "property_overview",
 *   bssotData: ssot,
 *   externalData: external,
 *   supplementalData: supplemental,
 * });
 * if (score && score.overall < 3.0) {
 *   // 재생성 트리거 또는 수동 검토 큐잉
 * }
 * ```
 */
export async function judgeIMSection(
  input: IMJudgeInput
): Promise<IMJudgeScore | null> {
  try {
    const result = await callLLM(
      {
        systemPrompt: buildJudgeSystemPrompt(),
        userPrompt: buildJudgeUserPrompt(input),
        model: JUDGE_MODEL,
        responseFormat: "json_object",
        temperature: 0.1, // 채점 일관성을 위해 낮은 온도 사용
        maxTokens: 2048,
      },
      {
        cacheKey: `im-judge:${input.sectionType}`,
        timeoutMs: 45_000, // 평가는 생성보다 빠르므로 45초면 충분
      }
    );

    // LLM 응답 파싱
    const parsed = JSON.parse(result.content) as Record<string, unknown>;

    const score: IMJudgeScore = {
      factual_accuracy: clampScore(parsed.factual_accuracy),
      financial_soundness: clampScore(parsed.financial_soundness),
      regulatory_compliance: clampScore(parsed.regulatory_compliance),
      investor_value: clampScore(parsed.investor_value),
      data_grounding: clampScore(parsed.data_grounding),
      overall: 0, // 아래에서 계산
      feedback: typeof parsed.feedback === "string" ? parsed.feedback : "",
      citation_check: Array.isArray(parsed.citation_check)
        ? (parsed.citation_check as string[])
        : [],
    };

    // 가중 평균 종합 점수 산출
    score.overall = computeOverall(score);

    // 종합 점수가 임계값 미달 시 경고 로그
    if (score.overall < OVERALL_WARN_THRESHOLD) {
      console.warn(
        `[im-judge] ⚠️ 낮은 품질 점수 — section=${input.sectionType}, ` +
          `overall=${score.overall}, ` +
          `details={fa:${score.factual_accuracy}, fs:${score.financial_soundness}, ` +
          `rc:${score.regulatory_compliance}, iv:${score.investor_value}, dg:${score.data_grounding}}`
      );
    }

    return score;
  } catch (error) {
    // Soft-fail: Judge 실패가 전체 IM 생성을 중단시키지 않도록 null 반환
    console.warn(
      `[im-judge] Judge 호출 실패 (soft-fail) — section=${input.sectionType}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * 신뢰도 수준에 따른 확률적 Judge 실행 여부 결정
 *
 * LLM 호출 비용 최적화를 위해 높은 신뢰도의 섹션은 낮은 확률로 샘플링하고,
 * 검증이 필요한 섹션은 반드시 평가한다.
 *
 * - `needs_check` → 100% (항상 평가)
 * - `inferred`    → 30%  (추론 데이터이므로 적절한 샘플링)
 * - `confirmed`   → 10%  (확인된 데이터, 최소한의 무작위 감사)
 *
 * @param confidence - 섹션 데이터 신뢰도 레벨
 * @returns Judge를 실행해야 하는지 여부
 */
export function shouldJudgeByConfidence(
  confidence: "confirmed" | "inferred" | "needs_check"
): boolean {
  const samplingRates: Record<typeof confidence, number> = {
    needs_check: 1.0,
    inferred: 0.3,
    confirmed: 0.1,
  };

  const rate = samplingRates[confidence];
  return Math.random() < rate;
}

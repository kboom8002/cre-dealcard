import {
  createSuccessEnvelope,
  type AgentInputEnvelope,
  type AgentOutputEnvelope,
  type MissingDataItem,
  type SourceRef,
} from "@/ai/envelope";
import {
  renderTf8Prompt,
  type MagazineCommentOutput,
  type TaskFlow8PromptSpec,
} from "@/ai/schemas/magazine-taskflow";
import {
  getPreferredChannelLabels,
  normalizePreferredChannels,
  normalizePreferredRegions,
} from "@/domain/magazine/broker-preferences";
import {
  ISSUE_CARD_COUNT,
  POST_IT_TONES,
  formatAxiosCardTitle,
  formatAxiosTwoLineBrief,
} from "@/domain/magazine/issue-clustering";
import {
  isCreRelevantArticle,
  resolveNewsChannel,
  type NewsPoolItem,
  type SpecificNewsChannelId,
} from "@/domain/magazine/news-channels";
import type { AxiosUnitIssue, PostItTone } from "@/domain/magazine/types";
import { findNumbersNotInContext } from "@/lib/magazine/ai-comment-schema";
import { sanitizeReaderText } from "@/lib/magazine/llm-guard";
import { stripUneditedFormatPlaceholders } from "@/lib/magazine/simple-format";

export const FORBIDDEN_SOLICITATION_PHRASES = [
  "100% 보장",
  "원금 보장",
  "수익 보장",
  "확정 수익",
  "무조건 상승",
  "반드시 오릅니다",
  "즉시 매수 권유",
  "절대 손해",
] as const;

export function stripForbiddenSolicitation(text: string): {
  cleaned: string;
  detected: string[];
} {
  let out = text;
  const detected: string[] = [];
  for (const phrase of FORBIDDEN_SOLICITATION_PHRASES) {
    if (out.includes(phrase)) {
      detected.push(phrase);
      out = out.split(phrase).join("면밀한 검토");
    }
  }
  return { cleaned: out, detected };
}

/**
 * M11 핀포인트 숫자 교정기:
 * 입력 FactBook(contextText)에 존재하지 않는 미출처 수치 주장(예: "전월 대비 18.4% 급증", "공실률 2.3%")이
 * 생성되었을 때 전체 텍스트를 폐기하지 않고 해당 수치 표현만 정성적 표현으로 핀포인트 치환한다.
 */
export function repairUngroundedNumbers(
  text: string,
  contextText: string,
): { repairedText: string; strippedNumbers: string[] } {
  const ungrounded = findNumbersNotInContext(text, contextText);
  if (ungrounded.length === 0) {
    return { repairedText: text, strippedNumbers: [] };
  }

  let out = text;
  const stripped: string[] = [];

  for (const numToken of ungrounded) {
    const escaped = numToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // 숫자+단위 패턴(예: "18.4%", "250억", "3.2%p", "15건")을 정성적 표현으로 치환
    const unitRegex = new RegExp(
      `${escaped}\\s*(?:%p|%|％|억\\s*원|억|만\\s*원|만원|평|㎡|건|배|개월|bp)`,
      "g",
    );
    if (unitRegex.test(out)) {
      out = out.replace(unitRegex, "주요 수준");
      stripped.push(numToken);
    }
  }

  return {
    repairedText: out.replace(/\s+/g, " ").trim(),
    strippedNumbers: stripped,
  };
}

export interface Tf8DraftPromptInput {
  monthLabel: string;
  regionFocus?: string;
  preferredRegions?: readonly string[];
  preferredChannels?: readonly SpecificNewsChannelId[];
  dealTitles?: readonly string[];
  newsTitles?: readonly string[];
  currentHeadline?: string;
  currentBriefing?: string;
}

export function buildTf8DraftPrompt(
  input: Tf8DraftPromptInput,
  envelope?: Partial<AgentInputEnvelope<Tf8DraftPromptInput>>,
): {
  spec: TaskFlow8PromptSpec;
  systemPrompt: string;
  userPrompt: string;
  factBookContext: string;
} {
  const regions = normalizePreferredRegions([
    ...(input.preferredRegions ?? []),
    ...(input.regionFocus ? [input.regionFocus] : []),
  ]);
  const channels = normalizePreferredChannels(input.preferredChannels);
  const channelLabels = getPreferredChannelLabels(channels);
  const deals = (input.dealTitles ?? []).map((d) => d.trim()).filter(Boolean);
  const news = (input.newsTitles ?? []).map((n) => n.trim()).filter(Boolean);

  const knowledgeLines = [
    `- 발행 호수/시기: ${input.monthLabel}`,
    regions.length > 0 ? `- 중개사 주력 권역: ${regions.join(", ")}` : "- 중개사 주력 권역: 서울·수도권 주요 상권",
    `- 큐레이션 관심 분야: ${channelLabels.join(", ")}`,
    deals.length > 0 ? `- 추천 매물 Fact: ${deals.join(" | ")}` : "- 추천 매물 Fact: (선택된 매물 없음 — 일반 시장 브리핑 중심)",
    news.length > 0 ? `- 핵심 뉴스 헤드라인 Fact: ${news.slice(0, 5).join(" | ")}` : "",
    input.currentHeadline ? `- 중개사 작성 제목 메모: ${input.currentHeadline}` : "",
    input.currentBriefing ? `- 중개사 작성 본문 메모: ${input.currentBriefing}` : "",
  ].filter(Boolean);

  const factBookContext = knowledgeLines.join("\n");

  const spec: TaskFlow8PromptSpec = {
    slotKey: "magazine_draft_tf8",
    version: "2.0",
    task: "상업용 부동산 전문 공인중개사가 건물주·매수 고객에게 발송할 정기 뉴스레터의 표지 제목(headline), 한 줄 요약(summary), 브리핑 소제목(briefingTitle), 시장 브리핑 본문(briefingBody)을 JSON으로 작성합니다.",
    audience:
      "50~70대 중소형 빌딩 매수 대기자, 법인 사옥 실수요 대표, 고액자산가 건물주. 과장된 수식어보다 담백하고 신뢰감 있는 전문가 브리핑 톤을 선호합니다.",
    warnings: [
      "[No-LLM-Numbers] [K] Knowledge FactBook에 없는 구체적 수치(공실률, 수익률, 매매가, 변동률, 거래건수 등)를 절대 창작하거나 추정하지 마십시오.",
      "[No-Solicitation] '원금 보장', '확정 수익', '100% 보장', '무조건 상승', '즉시 매수 권유' 등 투자 권유·단정 표현을 절대 사용하지 마십시오.",
      "[No-Internal-Labels] '핵심 팩트:', '브로커 임플리케이션:', '추천 액션:', 파이프('|'), 마크다운 코드펜스를 본문에 노출하지 마십시오.",
      "[No-Gossip] 연예인·가십·사생활·자택 경매 등 상업용 부동산 본질과 무관한 소재를 절대 언급하지 마십시오.",
    ],
    outputContract: [
      "반드시 아래 JSON 객체만 반환하십시오 (추가 설명 금지):",
      "{",
      '  "headline": "36자 이내 — 권역과 핵심 흐름이 한눈에 읽히는 표지 제목",',
      '  "summary": "80자 이내 — 독자가 얻을 핵심 시사점 1~2문장",',
      '  "briefingTitle": "30자 이내 — 브리핑 섹션 소제목",',
      '  "briefingBody": "150~380자 — 1문단(권역·시장 흐름) + 2문단(금리·세무·임차 시사점) + 3문단(매수자 체크포인트)"',
      "}",
    ].join("\n"),
    situation: [
      `발송 대상 가시성: ${envelope?.targetVisibility ?? "public_named"}`,
      `중개사 주력 권역(${regions.join(", ") || "주요 업무·상업 권역"})과 관심 큐레이션 분야(${channelLabels.join(", ")})의 관점을 녹여 작성하십시오.`,
    ].join("\n"),
    knowledge: factBookContext,
    logicChain: [
      "[K] FactBook에서 발행 시기, 주력 권역, 포함 매물, 중개사 메모의 핵심 키워드를 추출합니다.",
      "권역 특성과 관심 분야(부동산·금리·절세·상권 등)를 연결하여 36자 이내의 품격 있는 표지 제목(headline)을 확정합니다.",
      "근거가 확인된 팩트만으로 3문단 구성의 시장 브리핑 본문(briefingBody, 380자 이내)을 작성합니다.",
      "출력 전 [W] 경고 규칙(미출처 숫자 0건, 금지어 0건, 글자 수 한도)을 자체 검증합니다.",
    ],
    fallbackRepair:
      "M11 핀포인트 디버거 규칙: 특정 문장에 미출처 숫자가 감지되면 해당 수치 구절만 정성적 표현으로 교정하고, 글자 수 초과 시 어절 경계에서 안전하게 축약합니다.",
  };

  const { systemPrompt, userPrompt } = renderTf8Prompt(spec);
  return { spec, systemPrompt, userPrompt, factBookContext };
}

export interface Tf8AxiosClusterPromptInput {
  cadenceLabel?: string;
  preferredRegions?: readonly string[];
  preferredChannels?: readonly SpecificNewsChannelId[];
  dealTitles?: readonly string[];
  candidateIssues: readonly AxiosUnitIssue[];
}

export function buildTf8AxiosClusterPrompt(
  input: Tf8AxiosClusterPromptInput,
): {
  spec: TaskFlow8PromptSpec;
  systemPrompt: string;
  userPrompt: string;
  factBookContext: string;
} {
  const regions = normalizePreferredRegions(input.preferredRegions);
  const channels = normalizePreferredChannels(input.preferredChannels);
  const channelLabels = getPreferredChannelLabels(channels);

  const candidateLines = input.candidateIssues.slice(0, ISSUE_CARD_COUNT).map((issue, idx) => {
    return `[후보 #${idx + 1}] id="${issue.id}" | 채널=${issue.channel ?? "real_estate"} | 원문제목=${issue.title} | 원문요약=${issue.brief}`;
  });
  const factBookContext = [
    regions.length > 0 ? `중개사 주력 권역: ${regions.join(", ")}` : "중개사 주력 권역: 서울·수도권 핵심 권역",
    `중개사 선택 큐레이션 분야: ${channelLabels.join(", ")}`,
    ...(input.dealTitles && input.dealTitles.length > 0
      ? [`보유 추천 매물: ${input.dealTitles.join(" | ")}`]
      : []),
    ...candidateLines,
  ].join("\n");

  const spec: TaskFlow8PromptSpec = {
    slotKey: "magazine_axios_cluster_tf8",
    version: "2.0",
    task: "클러스터링된 5개 상업용 부동산·자산관리 이슈 후보를 고객 포스트잇 뷰용 'AXIOS 카드뉴스 스타일(2줄 대형 헤드라인 + 2줄 부제형 핵심 해설)'로 정밀 재작성합니다.",
    audience:
      "모바일로 뉴스레터를 열람하는 50~70대 건물주·매수 고객. 한눈에 들어오는 큼직한 2줄 제목과 짧은 2줄 부제(Subtitle)만 읽고도 시장 핵심을 파악할 수 있어야 합니다.",
    warnings: [
      "[No-LLM-Numbers] 후보 원문에 없는 숫자를 절대 추가하지 마십시오.",
      "[Card-News 2-Line Title] 각 이슈의 title은 18~48자 이내의 강렬하고 명확한 카드뉴스 헤드라인으로 작성하십시오 (줄바꿈 기호 \\n 금지, [매체명] 금지).",
      "[AXIOS 2-Line Subtitle Brief] 각 이슈의 brief는 반드시 2문장(총 50~95자)으로 짧고 밀도 있게 작성하십시오: 1문장(핵심 시장 팩트) + 1문장(매수자·건물주 시사점).",
      "[No-Internal-Labels] brief에 '핵심 팩트:', '브로커 임플리케이션:', '추천 액션:', 파이프('|')를 절대 넣지 마십시오.",
      "[No-Gossip] 연예인·가십·사생활 관련 표현을 절대 포함하지 마십시오.",
    ],
    outputContract: [
      "반드시 아래 JSON 형식으로 정확히 5개(unitIssues 배열 길이 5)를 반환하십시오:",
      "{",
      '  "unitIssues": [',
      '    { "id": "후보 id 그대로", "title": "2줄 카드뉴스형 헤드라인(18~48자)", "brief": "핵심 팩트 1문장. 매수자 시사점 1문장.(총 50~95자, 2문장)", "channel": "real_estate|economy_finance|tax_wealth|culture_lifestyle|commercial_trend", "sentiment": "bullish|bearish|neutral" }',
      "  ]",
      "}",
    ].join("\n"),
    situation: `중개사의 주력 권역(${regions.join(", ") || "주요 상권"})과 관심 분야(${channelLabels.join(", ")}) 독자에게 가장 유용한 인사이트가 드러나도록 카피라이팅을 고도화하십시오.`,
    knowledge: factBookContext,
    logicChain: [
      "5개 후보 각각의 핵심 주제와 중개사 선호 권역/채널의 접점을 파악합니다.",
      "title을 카드뉴스 헤드라인처럼 명확한 주어+핵심 변화 구조(18~48자)로 다듬습니다.",
      "brief를 AXIOS 부제(Deck) 스타일로 1문장(팩트) + 1문장(투자·자산관리 시사점), 총 50~95자 이내로 압축합니다.",
      "내부 라벨('|', '핵심 팩트:') 누출 여부와 미출처 숫자를 검증합니다.",
    ],
    fallbackRepair:
      "M11 핀포인트 블록 교정: 개별 카드가 글자 수를 초과하거나 라벨이 누출되면 해당 카드만 formatAxiosCardTitle / formatAxiosTwoLineBrief로 즉시 정밀 교정합니다.",
  };

  const { systemPrompt, userPrompt } = renderTf8Prompt(spec);
  return { spec, systemPrompt, userPrompt, factBookContext };
}

export interface Tf8CommentPromptInput {
  comment: string;
  dealTitle?: string;
  regionFocus?: string;
}

export function buildTf8CommentPrompt(input: Tf8CommentPromptInput): {
  spec: TaskFlow8PromptSpec;
  systemPrompt: string;
  userPrompt: string;
  factBookContext: string;
} {
  const factBookContext = [
    `중개사 입력 메모: ${input.comment.trim()}`,
    input.dealTitle ? `대상 매물명: ${input.dealTitle.trim()}` : "",
    input.regionFocus ? `주력 권역: ${input.regionFocus.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const spec: TaskFlow8PromptSpec = {
    slotKey: "magazine_comment_tf8",
    version: "2.0",
    task: "중개사가 입력한 짧은 매물 메모를 매수 고객에게 신뢰를 주는 1~2문장(40~110자) 추천 코멘트로 다듬습니다.",
    audience: "상업용 빌딩 매수 검토 고객 및 자산가 구독자.",
    warnings: [
      "[No-LLM-Numbers] 입력 메모에 없는 가격·수익률·면적·층수 등 숫자를 절대 추가하지 마십시오.",
      "[No-Solicitation] '원금 보장', '확정 수익', '무조건 상승' 등 과장·단정 표현을 금지합니다.",
      "[Concise] 인사말이나 부연 설명 없이 다듬어진 추천 코멘트 본문(1~2문장, 120자 이내)만 출력하십시오.",
    ],
    outputContract: "순수 한국어 추천 코멘트 문자열 (40~120자, 따옴표나 마크다운 없이 본문만 반환)",
    situation: "뉴스레터 내 추천 매물 카드 하단에 노출되는 공인중개사 한 줄 코멘트입니다.",
    knowledge: factBookContext,
    logicChain: [
      "입력 메모에 포함된 입지·용도·특장점 키워드를 추출합니다.",
      "입력에 있는 숫자만 그대로 보존하고, 어색한 구어체를 정중한 전문가 문장으로 정돈합니다.",
    ],
    fallbackRepair: "미출처 숫자가 감지되면 repairUngroundedNumbers로 해당 숫자 구절만 교정합니다.",
  };

  const { systemPrompt, userPrompt } = renderTf8Prompt(spec);
  return { spec, systemPrompt, userPrompt, factBookContext };
}

export interface DraftBlockShape {
  headline: string;
  summary: string;
  briefingTitle: string;
  briefingBody: string;
}

/**
 * M11 핀포인트 초안 블록 디버거 & AI Core Envelope 래퍼
 */
export function repairDraftOutputBlock(
  rawCandidate: Partial<DraftBlockShape>,
  factBookContext: string,
  opts: {
    monthLabel: string;
    preferredRegions?: readonly string[];
  },
): {
  result: DraftBlockShape;
  warnings: string[];
  envelope: AgentOutputEnvelope<DraftBlockShape>;
} {
  const warnings: string[] = [];
  const protectedDetected: string[] = [];
  const missingData: MissingDataItem[] = [];

  const regionLabel =
    opts.preferredRegions && opts.preferredRegions.length > 0
      ? opts.preferredRegions[0]
      : "주요 상권";

  const cleanField = (
    raw: unknown,
    maxLen: number,
    fallback: string,
    multiline = false,
  ): string => {
    const base = typeof raw === "string" ? sanitizeReaderText(raw) : "";
    const strippedPlaceholder = stripUneditedFormatPlaceholders(base);
    const { cleaned, detected } = stripForbiddenSolicitation(strippedPlaceholder);
    if (detected.length > 0) {
      protectedDetected.push(...detected);
    }
    const normalized = multiline
      ? cleaned.trim()
      : cleaned.replace(/\s+/g, " ").trim();
    if (!normalized) return fallback;

    const { repairedText, strippedNumbers } = repairUngroundedNumbers(
      normalized,
      factBookContext,
    );
    if (strippedNumbers.length > 0) {
      warnings.push(
        `입력 컨텍스트에 없는 수치(${strippedNumbers.join(", ")})를 핀포인트 교정했습니다.`,
      );
    }

    const finalStr = multiline ? repairedText.trim() : repairedText.replace(/\s+/g, " ").trim();
    if (finalStr.length <= maxLen) return finalStr;

    const sliced = finalStr.slice(0, maxLen - 1);
    const lastSpace = sliced.lastIndexOf(" ");
    return (lastSpace >= Math.floor(maxLen * 0.65) ? sliced.slice(0, lastSpace) : sliced).trim();
  };

  const headline = cleanField(
    rawCandidate.headline,
    36,
    `${opts.monthLabel} ${regionLabel} 빌딩 시장 브리핑`,
  );
  const summary = cleanField(
    rawCandidate.summary,
    80,
    `${regionLabel} 중심의 상업용 부동산 시장 흐름과 매수자 핵심 체크포인트를 정리했습니다.`,
  );
  const briefingTitle = cleanField(
    rawCandidate.briefingTitle,
    30,
    `${regionLabel} 시장 핵심 브리핑`,
  );
  const briefingBody = cleanField(
    rawCandidate.briefingBody,
    400,
    `${opts.monthLabel} ${regionLabel} 일대 중소형 빌딩 시장은 입지와 임차 안정성이 검증된 우량 자산을 중심으로 선별적인 매수 문의가 이어지고 있습니다.\n\n자금 조달 여건과 세무·임대차 구성을 사전에 점검하면 매수 협상력과 실질 수익률을 동시에 높일 수 있습니다.`,
    true,
  );

  const result: DraftBlockShape = {
    headline,
    summary,
    briefingTitle,
    briefingBody,
  };

  const sourceRefs: SourceRef[] = [
    { type: "memo", label: opts.monthLabel },
    ...(opts.preferredRegions ?? []).map((r) => ({
      type: "manual" as const,
      label: `권역:${r}`,
    })),
  ];

  const envelope = createSuccessEnvelope<DraftBlockShape>(result, {
    missing_data: missingData,
    warnings,
    protected_fields_detected: Array.from(new Set(protectedDetected)),
    boundary_note:
      "본 뉴스레터 초안은 AI 코어(TF8) 기반으로 작성되었으며, 발송 전 공인중개사의 최종 확인이 필요합니다.",
    confidence: "memo_based_inference",
    source_refs: sourceRefs,
  });

  return { result, warnings, envelope };
}

/**
 * M11 핀포인트 AXIOS 5대 이슈 클러스터 교정기 & AI Core Envelope 래퍼
 * - 개별 카드의 제목(2줄 카드뉴스 헤드라인, <= 52자) 및 해설(2줄 부제형 요약, 2문장, <= 98자)을 보장
 * - 가십/노이즈 기사 혼입 시 결정론적 클러스터 폴백 카드로 핀포인트 교체
 */
export function repairAxiosClusterOutputBlock(
  rawIssues: readonly Partial<AxiosUnitIssue>[],
  fallbackIssues: readonly AxiosUnitIssue[],
  factBookContext: string,
): {
  unitIssues: AxiosUnitIssue[];
  warnings: string[];
  envelope: AgentOutputEnvelope<AxiosUnitIssue[]>;
} {
  const warnings: string[] = [];
  const protectedDetected: string[] = [];
  const repaired: AxiosUnitIssue[] = [];

  for (let idx = 0; idx < ISSUE_CARD_COUNT; idx++) {
    const fb = fallbackIssues[idx] ?? fallbackIssues[0];
    const candidate = rawIssues[idx];
    const memoTone: PostItTone = POST_IT_TONES[idx % POST_IT_TONES.length];

    if (
      !candidate ||
      typeof candidate.title !== "string" ||
      !isCreRelevantArticle({
        title: candidate.title,
        summary: typeof candidate.brief === "string" ? candidate.brief : "",
      })
    ) {
      if (candidate?.title) {
        warnings.push(`이슈 #${idx + 1}: 비부동산/노이즈 항목을 감지하여 기본 클러스터로 핀포인트 교체했습니다.`);
      }
      repaired.push({
        ...fb,
        id: fb?.id ?? `issue-${idx + 1}`,
        memoTone,
      });
      continue;
    }

    const { cleaned: rawTitleClean, detected: titleDetected } = stripForbiddenSolicitation(
      candidate.title,
    );
    const { cleaned: rawBriefClean, detected: briefDetected } = stripForbiddenSolicitation(
      typeof candidate.brief === "string" ? candidate.brief : fb?.brief ?? "",
    );
    protectedDetected.push(...titleDetected, ...briefDetected);

    const { repairedText: groundedTitle, strippedNumbers: titleStripped } =
      repairUngroundedNumbers(rawTitleClean, `${factBookContext} ${fb?.title ?? ""}`);
    const { repairedText: groundedBrief, strippedNumbers: briefStripped } =
      repairUngroundedNumbers(rawBriefClean, `${factBookContext} ${fb?.brief ?? ""}`);

    if (titleStripped.length > 0 || briefStripped.length > 0) {
      warnings.push(
        `이슈 #${idx + 1}: 원문에 없는 수치(${[...titleStripped, ...briefStripped].join(", ")})를 핀포인트 교정했습니다.`,
      );
    }

    const channel = resolveNewsChannel({
      channel: candidate.channel ?? fb?.channel,
      topic: candidate.topic ?? fb?.topic,
      title: groundedTitle,
      summary: groundedBrief,
    });

    const title = formatAxiosCardTitle(groundedTitle, 52) || fb?.title || `핵심 부동산 이슈 #${idx + 1}`;
    const brief = formatAxiosTwoLineBrief(groundedBrief, {
      title,
      channel,
      maxTotalChars: 98,
    });

    repaired.push({
      id: candidate.id || fb?.id || `issue-${idx + 1}`,
      title,
      brief,
      memoTone,
      channel,
      topic: candidate.topic || fb?.topic || channel,
      sentiment:
        candidate.sentiment === "bullish" || candidate.sentiment === "bearish"
          ? candidate.sentiment
          : fb?.sentiment ?? "neutral",
      sources:
        Array.isArray(candidate.sources) && candidate.sources.length > 0
          ? candidate.sources
          : fb?.sources ?? [],
      ...(fb?.url ? { url: fb.url } : {}),
      articleCount: fb?.articleCount ?? 1,
    });
  }

  const envelope = createSuccessEnvelope<AxiosUnitIssue[]>(repaired, {
    warnings,
    protected_fields_detected: Array.from(new Set(protectedDetected)),
    boundary_note:
      "본 5대 핵심 이슈는 중개사 설정 권역·관심 분야 기반으로 AI 클러스터링 및 팩트 검증(TF8·M11)을 거쳤습니다.",
    confidence: "memo_based_inference",
    source_refs: [{ type: "api", label: "magazine-axios-cluster-tf8" }],
  });

  return { unitIssues: repaired, warnings, envelope };
}

/**
 * M11 핀포인트 매물 추천 코멘트 교정기 & AI Core Envelope 래퍼
 */
export function repairCommentOutputBlock(
  rawText: string,
  inputContext: string,
): {
  comment: string;
  warnings: string[];
  envelope: AgentOutputEnvelope<MagazineCommentOutput>;
} {
  const warnings: string[] = [];
  const sanitized = sanitizeReaderText(rawText)
    .replace(/^[""'']+|[""'']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const { cleaned, detected } = stripForbiddenSolicitation(sanitized);
  const { repairedText, strippedNumbers } = repairUngroundedNumbers(cleaned, inputContext);

  if (strippedNumbers.length > 0) {
    warnings.push("입력에 없는 숫자가 감지되어 핀포인트 교정되었습니다.");
  }

  const finalComment =
    repairedText.length > 150 ? `${repairedText.slice(0, 148).trim()}…` : repairedText;

  const output: MagazineCommentOutput = {
    comment: finalComment || sanitizeReaderText(inputContext).slice(0, 120),
  };

  const envelope = createSuccessEnvelope<MagazineCommentOutput>(output, {
    warnings,
    protected_fields_detected: detected,
    boundary_note: "AI가 다듬은 매물 추천 코멘트입니다.",
    confidence: "memo_based_inference",
    source_refs: [{ type: "memo", label: "broker-deal-comment" }],
  });

  return { comment: output.comment, warnings, envelope };
}

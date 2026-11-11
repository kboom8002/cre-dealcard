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
  AXIOS_BRIEF_MAX_CHARS,
  AXIOS_TITLE_MAX_CHARS,
  ISSUE_CARD_COUNT,
  POST_IT_TONES,
  charLength,
  formatAxiosCardTitle,
  formatAxiosTwoLineBrief,
  condenseKoreanParagraph,
  formatSingleLineTitle,
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
      `${escaped}\\s*(?:%p|%|％|조\\s*원|조|억\\s*원|억|만\\s*원|만원|천\\s*만\\s*원|원|평|㎡|건|배|개월|년|층|세대|호|점|명|bp)`,
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

export type Tf8Cadence = "daily" | "weekly" | "monthly" | "special";

const CADENCE_PROMPT_META: Record<Tf8Cadence, { label: string; period: string; bodyRange: string }> = {
  daily: { label: "일간", period: "오늘", bodyRange: "120~250자 (2문단)" },
  weekly: { label: "주간", period: "이번 주", bodyRange: "150~320자 (2~3문단)" },
  monthly: { label: "월간", period: "이번 달", bodyRange: "200~380자 (3문단)" },
  special: { label: "호외", period: "지금", bodyRange: "120~250자 (2문단)" },
};

function resolveCadence(raw: unknown, monthLabel?: string): Tf8Cadence {
  if (raw === "daily" || raw === "weekly" || raw === "monthly" || raw === "special") return raw;
  const label = monthLabel ?? "";
  if (/일간/.test(label)) return "daily";
  if (/주간|주차/.test(label)) return "weekly";
  return "monthly";
}

export interface Tf8DraftPromptInput {
  monthLabel: string;
  /** 발행 주기 (일간·주간·월간) — 미지정 시 monthLabel 문구로 추론 */
  cadence?: Tf8Cadence;
  regionFocus?: string;
  preferredRegions?: readonly string[];
  preferredChannels?: readonly SpecificNewsChannelId[];
  dealTitles?: readonly string[];
  newsTitles?: readonly string[];
  currentHeadline?: string;
  currentBriefing?: string;
}

/** 공통 카피 하드 제약 (모든 뉴스레터 슬롯 공용) */
const COMMON_COPY_WARNINGS = [
  "[No-LLM-Numbers] [K] Knowledge FactBook에 없는 구체적 수치(공실률, 수익률, 매매가, 변동률, 거래건수, 금리, 날짜 등)를 절대 창작·추정·반올림하지 마십시오. FactBook 숫자는 단위까지 그대로 옮기십시오.",
  "[No-Solicitation] '원금 보장', '확정 수익', '100% 보장', '무조건 상승', '반드시 오릅니다', '즉시 매수 권유', '절대 손해' 등 투자 권유·단정 표현을 절대 사용하지 마십시오.",
  "[No-Internal-Labels] '핵심 팩트:', '브로커 임플리케이션:', '추천 액션:', 'Why it matters:', 파이프('|'), 마크다운(#, **, -), 코드펜스, 이모지를 출력하지 마십시오.",
  "[No-Gossip] 연예인·정치인·사생활·자택 경매·아파트 시세 등 상업용 부동산(빌딩·근생·오피스·상가) 본질과 무관한 소재를 절대 언급하지 마십시오.",
  "[No-Truncation] 말줄임표('…', '...')로 끝내거나 조사·관형형·미완결 보조용언('~의', '~에', '~을', '~한', '~하는', '~따른', '~해선', '~해서는', '~할 수', '~하면', '~해야', '~및')으로 끝나는 잘린 문장, 또는 개조식 명사형('~있음.', '~안 됨.', '~해야 함.', '~수준임.')을 절대 출력하지 마십시오. 글자 수가 넘치면 수식어를 빼서 처음부터 완결된 문장으로 다시 쓰십시오.",
] as const;

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
  const cadence = resolveCadence(input.cadence, input.monthLabel);
  const cad = CADENCE_PROMPT_META[cadence];

  const knowledgeLines = [
    `- 발행 호수/시기: ${input.monthLabel}`,
    `- 발행 주기: ${cad.label} 뉴스레터 (기간 표현은 '${cad.period}'을 사용)`,
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
    version: "3.0",
    task: `상업용 부동산 전문 공인중개사가 건물주·매수 고객에게 발송할 ${cad.label} 뉴스레터(${input.monthLabel})의 표지 제목(headline), 한 줄 소개(summary), 브리핑 소제목(briefingTitle), 시장 브리핑 본문(briefingBody)을 JSON으로 작성합니다.`,
    audience:
      "50~70대 중소형 빌딩 매수 대기자, 법인 사옥 실수요 대표, 고액자산가 건물주. 모바일 카카오톡으로 열람하며, 과장된 수식어보다 담백하고 신뢰감 있는 전문가 브리핑 톤(존댓말 평서문 '~합니다/~입니다')을 선호합니다. 작성자 페르소나: 20년 경력 상업용 부동산 매각·임대 전문 중개사이자 뉴스레터 편집장.",
    warnings: [
      ...COMMON_COPY_WARNINGS,
      "[Char-Budget] headline 36자 이내(공백 포함), summary 80자 이내, briefingTitle 30자 이내, briefingBody " + cad.bodyRange + " — 한도를 넘기면 단어를 줄여 다시 쓰십시오.",
      `[Cadence-Consistency] ${cad.label} 뉴스레터이므로 '${cad.period}' 기간 표현만 사용하고, 다른 주기 표현(예: 일간인데 '이번 달')을 섞지 마십시오.`,
    ],
    outputContract: [
      "반드시 아래 JSON 객체만 반환하십시오 (추가 설명·코드펜스 금지):",
      "{",
      '  "headline": "36자 이내 — 권역+핵심 흐름이 한눈에 읽히는 완결된 명사구 또는 평서문 제목",',
      '  "summary": "80자 이내 — 독자가 얻을 핵심 시사점 1~2문장, \'~합니다/~입니다\'로 종결",',
      '  "briefingTitle": "30자 이내 — 브리핑 섹션 소제목(완결된 명사구)",',
      `  "briefingBody": "${cad.bodyRange} — 1문단(권역·시장 흐름) + 2문단(금리·세무·임차 시사점)${cadence === "monthly" ? " + 3문단(매수자 체크포인트)" : ""}, 문단은 빈 줄(\\n\\n)로 구분"`,
      "}",
    ].join("\n"),
    situation: [
      `발송 대상 가시성: ${envelope?.targetVisibility ?? "public_named"}`,
      `발행 주기: ${cad.label} (${input.monthLabel})`,
      `중개사 주력 권역(${regions.join(", ") || "주요 업무·상업 권역"})과 관심 큐레이션 분야(${channelLabels.join(", ")})의 관점을 녹여 작성하십시오.`,
    ].join("\n"),
    knowledge: factBookContext,
    logicChain: [
      "[K] FactBook에서 발행 시기·주기, 주력 권역, 포함 매물, 뉴스 헤드라인, 중개사 메모의 핵심 키워드와 숫자(있는 것만)를 추출합니다.",
      "권역 특성과 관심 분야(부동산·금리·절세·상권 등)를 연결해 하나의 핵심 메시지를 정합니다.",
      "핵심 메시지로 36자 이내의 완결된 표지 제목(headline)을 쓰고, 글자 수를 세어 초과하면 수식어를 빼서 다시 씁니다.",
      `근거가 확인된 팩트만으로 브리핑 본문(briefingBody, ${cad.bodyRange})을 작성합니다.`,
      "[V] 체크리스트로 글자 수·종결어미·미출처 숫자·금지어를 자체 검증한 뒤 JSON만 출력합니다.",
    ],
    examples: [
      "✅ headline: \"금리 인하 기대 속 강남 역세권 빌딩 선별 매수 확산\" (28자, 완결 명사구)",
      "❌ headline: \"금리 인하 기대감에 따른 강남·서초 역세권 중소형 빌딩 법인 사옥 매수…\" (말줄임·초과)",
      "✅ summary: \"강남·서초 우량 빌딩 중심의 매수 흐름과 자금 조달 체크포인트를 정리했습니다.\"",
      "❌ summary: \"공실률 2.1%로 하락하며 수익률 6% 확정 매물이 늘어나는\" (미출처 숫자·단정·미완결)",
    ],
    selfCheck: [
      "headline 글자 수(공백 포함) ≤ 36, summary ≤ 80, briefingTitle ≤ 30 인가?",
      "모든 문장이 '~다.'로 끝나고, 조사·관형형·말줄임표로 끝나는 문장이 0건인가?",
      "FactBook에 없는 숫자가 0건인가? (있다면 정성 표현으로 바꿈)",
      "금지어(원금 보장·확정 수익 등)·내부 라벨·마크다운·이모지가 0건인가?",
      `기간 표현이 '${cad.period}'으로 일관된가?`,
    ],
    fallbackRepair:
      "M11 핀포인트 디버거 규칙: 특정 문장에 미출처 숫자가 감지되면 해당 수치 구절만 정성적 표현으로 교정하고, 글자 수 초과 시 어절 경계 압축 + 매달린 조사 제거로 완결된 문장을 유지합니다(하드 슬라이스 금지).",
  };

  const { systemPrompt, userPrompt } = renderTf8Prompt(spec);
  return { spec, systemPrompt, userPrompt, factBookContext };
}

export interface Tf8AxiosClusterPromptInput {
  cadenceLabel?: string;
  /** 발행 주기 (일간·주간·월간) */
  cadence?: Tf8Cadence;
  preferredRegions?: readonly string[];
  preferredChannels?: readonly SpecificNewsChannelId[];
  dealTitles?: readonly string[];
  candidateIssues: readonly AxiosUnitIssue[];
  /** 후보 원문 기사(제목·요약 전문) — 있으면 압축 전 원문을 근거로 재작성 */
  sourceArticles?: readonly NewsPoolItem[];
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
  const cadence = resolveCadence(input.cadence, input.cadenceLabel);
  const cad = CADENCE_PROMPT_META[cadence];
  const sourceById = new Map(
    (input.sourceArticles ?? []).map((a) => [String(a.id ?? a.title).trim(), a] as const),
  );

  const candidateLines = input.candidateIssues.slice(0, ISSUE_CARD_COUNT).map((issue, idx) => {
    const src = sourceById.get(String(issue.id).trim());
    const rawTitle = src?.title?.trim() || issue.title;
    const rawSummary = (src?.summary ?? issue.brief ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
    return [
      `[후보 #${idx + 1}] id="${issue.id}" | 채널=${issue.channel ?? "real_estate"}`,
      `  원문제목: ${rawTitle}`,
      `  원문요약: ${rawSummary}`,
      `  현재 카드 초안: 제목="${issue.title}"(${charLength(issue.title)}자) / 해설="${issue.brief}"(${charLength(issue.brief)}자)`,
    ].join("\n");
  });
  const factBookContext = [
    `발행 주기: ${cad.label} 뉴스레터${input.cadenceLabel ? ` (${input.cadenceLabel})` : ""}`,
    regions.length > 0 ? `중개사 주력 권역: ${regions.join(", ")}` : "중개사 주력 권역: 서울·수도권 핵심 권역",
    `중개사 선택 큐레이션 분야: ${channelLabels.join(", ")}`,
    ...(input.dealTitles && input.dealTitles.length > 0
      ? [`보유 추천 매물: ${input.dealTitles.join(" | ")}`]
      : []),
    ...candidateLines,
  ].join("\n");

  const spec: TaskFlow8PromptSpec = {
    slotKey: "magazine_axios_cluster_tf8",
    version: "3.0",
    task: `클러스터링된 5개 상업용 부동산·자산관리 이슈 후보를 고객용 ${cad.label} 뉴스레터의 '카드뉴스형 글래스 카드(제목 36자 이내 + AXIOS 부제형 해설 48자 이내)'로 정밀 재작성합니다.`,
    audience:
      "모바일로 뉴스레터를 열람하는 50~70대 건물주·매수 고객. 카드 한 장에서 제목과 짧은 해설만 읽고도 '무슨 일이고 내 건물에 왜 중요한지'를 3초 안에 파악해야 합니다. 작성자 페르소나: AXIOS 스타일에 능숙한 상업용 부동산 전문 에디터.",
    warnings: [
      ...COMMON_COPY_WARNINGS,
      `[${AXIOS_TITLE_MAX_CHARS}-Char Card Title] 각 title은 공백 포함 ${AXIOS_TITLE_MAX_CHARS}자 이내(권장 18~32자)의 완결된 명사구 또는 평서문 헤드라인입니다. 주어(권역·자산·주체)+핵심 변화를 담고, [매체명]·줄바꿈·물음표·느낌표·따옴표 남발을 금지합니다.`,
      `[${AXIOS_BRIEF_MAX_CHARS}-Char AXIOS Brief] 각 brief는 공백 포함 ${AXIOS_BRIEF_MAX_CHARS}자 이내(권장 28~46자)의 1문장(최대 2문장)으로, '왜 중요한가(매수자·건물주 시사점)'를 '~합니다/~됩니다/~입니다'로 종결합니다. 제목 문구를 반복하지 마십시오.`,
      "[Card-News 2-Line Title] [AXIOS 2-Line Subtitle Brief] 고객 화면은 한 단계 작은 폰트로 2줄 안팎에 렌더링되며 잘라내지 않습니다. 따라서 글자 수 예산을 지키는 것이 '잘리지 않는 글'의 유일한 보장입니다.",
      "[Grounding] 후보의 원문제목·원문요약에 있는 사실만 사용하고, 후보 id·채널을 바꾸지 마십시오. 5개 카드의 주제가 서로 겹치지 않게 하십시오.",
    ],
    outputContract: [
      "반드시 아래 JSON 형식으로 정확히 5개(unitIssues 배열 길이 5)를 반환하십시오 (추가 설명·코드펜스 금지):",
      "{",
      '  "unitIssues": [',
      `    { "id": "후보 id 그대로", "title": "카드 제목(${AXIOS_TITLE_MAX_CHARS}자 이내, 완결 명사구)", "brief": "시사점 1문장(${AXIOS_BRIEF_MAX_CHARS}자 이내, ~다.로 종결)", "channel": "real_estate|economy_finance|tax_wealth|culture_lifestyle|commercial_trend", "sentiment": "bullish|bearish|neutral" }`,
      "  ]",
      "}",
    ].join("\n"),
    situation: `${cad.label} 뉴스레터 독자(${cad.period} 소식)에게, 중개사의 주력 권역(${regions.join(", ") || "주요 상권"})과 관심 분야(${channelLabels.join(", ")}) 관점에서 가장 유용한 인사이트가 드러나도록 카피라이팅을 고도화하십시오.`,
    knowledge: factBookContext,
    logicChain: [
      "5개 후보 각각의 원문에서 '누가/무엇이 어떻게 변했는가' 핵심 팩트 1개와 '매수자·건물주에게 왜 중요한가' 시사점 1개를 추출합니다.",
      `title: 핵심 팩트를 주어+변화 구조의 ${AXIOS_TITLE_MAX_CHARS}자 이내 헤드라인으로 씁니다. 글자 수를 세어 넘치면 수식어('본격', '관련', '~에 따른')부터 빼고 다시 씁니다.`,
      `brief: 시사점을 ${AXIOS_BRIEF_MAX_CHARS}자 이내 1문장으로 씁니다. 원문 숫자가 꼭 필요할 때만 그대로 옮깁니다.`,
      "권역·관심 분야 관련성이 높은 카드를 앞 순서로 유지하되 후보 id 집합은 그대로 둡니다.",
      "[V] 체크리스트로 5개 카드 전부를 검증하고 JSON만 출력합니다.",
    ],
    examples: [
      "✅ title: \"통화정책 전환기, 빌딩 담보대출 금리 스프레드 점검\" (28자)",
      "✅ brief: \"조달 금리가 낮아지면 자기자본수익률이 개선돼 매수 결정이 빨라집니다.\" (38자)",
      "❌ title: \"통화정책 전환기 진입에 따른 시중은행 기업·빌딩 담보대...\" (말줄임·초과·미완결)",
      "❌ title: \"일부 '공간'의 호황을 건물 전체 임대수입으로 계산해선\" (보조용언 '안 된다'가 잘린 미완결 문장 금지 → ✅ \"일부 공간 호황을 전체 임대수입으로 계산해선 안 된다\")",
      "❌ brief: \"10년 전 공사비 영수증이 꼬마빌딩 양도세를 좌우할 수 있음.\" (개조식 '~있음/~됨' 종결 금지 → ✅ \"~좌우할 수 있습니다.\")",
      "❌ brief: \"국내외 기준금리 인하 사이클 논의가 본격화되면서 우량 담보물건에 대한\" (조사로 끝나는 미완결·초과)",
      "✅ title: \"성수·한남, 플래그십·팝업이 바꾸는 리테일 지형\" / brief: \"층고 높은 저층 근생은 팝업 대관 수요가 높습니다.\"",
    ],
    selfCheck: [
      `5개 title 모두 공백 포함 ${AXIOS_TITLE_MAX_CHARS}자 이하이며 '~해선', '~할 수', '~에 따른' 같은 잘린 표현 없이 문장/명사구가 완결되었는가?`,
      `5개 brief 모두 공백 포함 ${AXIOS_BRIEF_MAX_CHARS}자 이하이며 개조식('~음.', '~됨.') 없이 완결된 평서문('~합니다.', '~됩니다.', '~입니다.')으로 끝나는가?`,
      "말줄임표·조사/관형형 종결·내부 라벨·파이프·이모지·제목 동어반복이 0건인가?",
      "원문에 없는 숫자가 0건이고, 가십·비부동산 소재가 0건인가?",
      "후보 id 5개가 모두 그대로 있고 주제가 서로 겹치지 않는가?",
    ],
    fallbackRepair:
      `M11 핀포인트 블록 교정: 개별 카드가 ${AXIOS_TITLE_MAX_CHARS}/${AXIOS_BRIEF_MAX_CHARS}자 예산을 넘거나 라벨이 누출되면 해당 카드만 formatAxiosCardTitle / formatAxiosTwoLineBrief(어절 경계 압축 + 완결 서술어 보강)로 교정하고, 가십·노이즈 카드는 결정론적 클러스터 카드로 교체합니다.`,
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
    kind: "title" | "text" = "text",
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
    if (charLength(finalStr) <= maxLen) return finalStr;

    // 하드 슬라이스 금지: 제목류는 어절 경계 압축, 문장류는 문장 단위 축약 + 완결 서술어 보강
    const repaired =
      kind === "title"
        ? formatSingleLineTitle(finalStr, maxLen)
        : condenseKoreanParagraph(finalStr, maxLen, { preserveParagraphs: multiline });
    warnings.push(`글자 수 한도(${maxLen}자)를 넘어 완결된 문장으로 축약했습니다.`);
    return repaired || fallback;
  };

  const headline = cleanField(
    rawCandidate.headline,
    36,
    formatSingleLineTitle(`${opts.monthLabel} ${regionLabel} 빌딩 시장 브리핑`, 36),
    false,
    "title",
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
    false,
    "title",
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
 * - 개별 카드의 제목(카드뉴스 헤드라인, <= 36자) 및 해설(AXIOS 부제형 요약, <= 48자)을 보장 (하드 슬라이스·말줄임 금지)
 * - LLM이 카드 순서를 바꿔도 후보 id 기준으로 근거(폴백) 카드를 매칭하고, 중복 id는 폴백으로 교체
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
  const usedIds = new Set<string>();
  const normalizeFallback = (f: AxiosUnitIssue | undefined, idx: number): AxiosUnitIssue | undefined => {
    if (!f) return f;
    const t = formatAxiosCardTitle(f.title) || f.title;
    return { ...f, title: t, brief: formatAxiosTwoLineBrief(f.brief, { title: t, channel: f.channel as SpecificNewsChannelId | undefined }), memoTone: POST_IT_TONES[idx % POST_IT_TONES.length] };
  };

  for (let idx = 0; idx < ISSUE_CARD_COUNT; idx++) {
    const candidate = rawIssues[idx];
    const candidateId = typeof candidate?.id === "string" ? candidate.id.trim() : "";
    const byId = candidateId ? fallbackIssues.find((f) => f.id === candidateId) : undefined;
    const fb = normalizeFallback(byId ?? fallbackIssues[idx] ?? fallbackIssues[0], idx);
    const memoTone: PostItTone = POST_IT_TONES[idx % POST_IT_TONES.length];
    const duplicateId = Boolean(candidateId) && usedIds.has(candidateId);

    if (
      !candidate ||
      duplicateId ||
      typeof candidate.title !== "string" ||
      !isCreRelevantArticle({
        title: candidate.title,
        summary: typeof candidate.brief === "string" ? candidate.brief : "",
      })
    ) {
      if (candidate?.title) {
        warnings.push(`이슈 #${idx + 1}: 비부동산/노이즈 항목을 감지하여 기본 클러스터로 핀포인트 교체했습니다.`);
      }
      const fbId = fb?.id && !usedIds.has(fb.id) ? fb.id : `issue-${idx + 1}`;
      usedIds.add(fbId);
      repaired.push({
        ...(fb as AxiosUnitIssue),
        id: fbId,
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

    const title = formatAxiosCardTitle(groundedTitle) || fb?.title || `핵심 부동산 이슈 #${idx + 1}`;
    const brief = formatAxiosTwoLineBrief(groundedBrief, {
      title,
      channel,
      maxTotalChars: AXIOS_BRIEF_MAX_CHARS,
    });
    if (charLength(groundedTitle) > AXIOS_TITLE_MAX_CHARS || charLength(groundedBrief) > AXIOS_BRIEF_MAX_CHARS) {
      warnings.push(
        `이슈 #${idx + 1}: 카드 글자 수 예산(제목 ${AXIOS_TITLE_MAX_CHARS}자·해설 ${AXIOS_BRIEF_MAX_CHARS}자)을 넘어 완결된 문장으로 압축했습니다.`,
      );
    }

    const finalId = candidate.id || fb?.id || `issue-${idx + 1}`;
    usedIds.add(finalId);
    repaired.push({
      id: finalId,
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

  let finalComment = repairedText.replace(/…|\.{2,}/g, "").trim();
  if (finalComment.length > 150) {
    const sliced = finalComment.slice(0, 148);
    const lastSpace = sliced.lastIndexOf(" ");
    const base = (lastSpace >= 95 ? sliced.slice(0, lastSpace) : sliced)
      .replace(/[,·:：…-]+$/, "")
      .trim();
    finalComment = /[.!?。]$/.test(base) ? base : `${base}.`;
  }

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

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
  type MarketBriefingPolishOutput,
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
  humanizeBuyerCopy,
  normalizeMarketBriefingPlain,
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
    repairedText: out.replace(/[ \t]+/g, " ").trim(),
    strippedNumbers: stripped,
  };
}

export type Tf8Cadence = "daily" | "weekly" | "monthly" | "special";

const CADENCE_PROMPT_META: Record<Tf8Cadence, { label: string; period: string; bodyRange: string }> = {
  daily: { label: "일간", period: "오늘", bodyRange: "120~300자 (3~5줄, 순수 텍스트 500자 이내)" },
  weekly: { label: "주간", period: "이번 주", bodyRange: "150~400자 (3~5줄, 순수 텍스트 500자 이내)" },
  monthly: { label: "월간", period: "이번 달", bodyRange: "180~420자 (3~5줄, 순수 텍스트 500자 이내)" },
  special: { label: "호외", period: "지금", bodyRange: "120~320자 (3~5줄, 순수 텍스트 500자 이내)" },
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
    task: `상업용 부동산 공인중개사가 70대 매수자·건물주 고객에게 발송할 ${cad.label} 뉴스레터(${input.monthLabel})의 제목(headline)과 5줄 이내 간단한 시장 브리핑(briefingBody)을 JSON으로 작성합니다.`,
    audience:
      "모바일 카카오톡으로 소식지를 열어보시는 60~70대 빌딩 매수 검토자, 법인 대표, 건물주 어르신. 어려운 금융·부동산 전문용어와 영어 약어를 빼고, 익숙한 우리말로 따뜻하고 분명하게 설명해 드리는 20년 경력 담당 공인중개사 어조(존댓말 평서문 '~합니다/~입니다')로 작성합니다.",
    warnings: [
      ...COMMON_COPY_WARNINGS,
      "[70s-Buyer-Plain-Korean] '금리 스프레드', '조달 금리', '자기자본수익률', '표면 수익률', '밸류애드', '리파이낸싱', '레버리지', '명도' 같은 어려운 전문용어·외래어 대신 '은행 대출금리 차이', '대출 이자', '내 돈 대비 실제 수익', '단순 연 월세 수익', '건물 수리·세입자 개선', '대출 갈아타기', '기존 세입자 퇴거 협의' 등 쉬운 일상어를 쓰십시오.",
      "[Char-Budget] headline 45자 이내(공백 포함), briefingBody " + cad.bodyRange + " (별도 소제목·번호·마크다운 기호 없이 최대 5줄 · 500자 이내). summary와 briefingTitle은 빈 문자열(\"\")로 두십시오.",
      `[Cadence-Consistency] ${cad.label} 뉴스레터이므로 '${cad.period}' 기간 표현만 사용하고, 다른 주기 표현(예: 일간인데 '이번 달')을 섞지 마십시오.`,
    ],
    outputContract: [
      "반드시 아래 JSON 객체만 반환하십시오 (추가 설명·코드펜스 금지):",
      "{",
      '  "headline": "45자 이내 — 권역+핵심 흐름을 쉬운 말로 담은 완결된 제목",',
      '  "summary": "",',
      '  "briefingTitle": "",',
      `  "briefingBody": "${cad.bodyRange} — 소제목(■)·강조 기호(**)·구분선(───) 없이 3~5줄 줄바꿈으로 작성하는 쉬운 시장 브리핑 (총 500자 이내)"`,
      "}",
    ].join("\n"),
    situation: [
      `발송 대상 가시성: ${envelope?.targetVisibility ?? "public_named"}`,
      `발행 주기: ${cad.label} (${input.monthLabel})`,
      `중개사 주력 권역(${regions.join(", ") || "주요 업무·상업 권역"})과 관심 큐레이션 분야(${channelLabels.join(", ")}) 관점을 담아 바로 이해되는 쉬운 글로 작성하십시오.`,
    ].join("\n"),
    knowledge: factBookContext,
    logicChain: [
      "[K] FactBook에서 발행 시기·주기, 주력 권역, 포함 매물, 뉴스 헤드라인, 중개사 메모의 핵심 키워드와 숫자(있는 것만)를 추출합니다.",
      "70대 매수자 어르신도 한 번에 뜻을 알아들을 수 있도록 전문용어를 쉬운 일상어로 바꿉니다.",
      "45자 이내의 명확한 뉴스레터 제목(headline)을 씁니다.",
      `소제목이나 꾸밈 기호 없이 최대 5줄(${cad.bodyRange}) 분량의 시장 브리핑 본문(briefingBody)을 작성합니다.`,
      "[V] 체크리스트로 글자 수·줄 수(<=5줄)·쉬운 용어·종결어미·미출처 숫자·금지어를 검증한 뒤 JSON만 출력합니다.",
    ],
    examples: [
      "✅ headline: \"금리 완화 기대 속 역세권 알짜 빌딩 선별 매수 흐름\" (29자, 쉬운 자연문)",
      "❌ headline: \"금리 인하 기대감에 따른 강남·서초 역세권 중소형 빌딩 법인 사옥 매수…\" (말줄임·초과)",
      "✅ briefingBody: \"이번 주 서울 역세권 중소형 빌딩 시장은 입지가 탄탄한 건물 위주로 매수 문의가 이어지고 있습니다.\\n대출 이자 부담이 점차 낮아질 조짐이 보이면서 실사용 사옥이나 안정적인 월세를 원하는 분들의 관심이 꾸준합니다.\\n매수 전에는 현재 세입자의 계약 기간과 건물 수리 여부를 미리 꼼꼼히 살펴보시는 것이 좋습니다.\"",
    ],
    selfCheck: [
      "headline 글자 수 ≤ 45, summary=\"\", briefingTitle=\"\", briefingBody ≤ 5줄 및 ≤ 500자 인가?",
      "전문용어·영어 약어나 '■ 소제목'·마크다운 기호가 0건이고 모든 문장이 '~다.'로 끝나는가?",
      "FactBook에 없는 숫자가 0건인가? (있다면 정성 표현으로 바꿈)",
      "금지어(원금 보장·확정 수익 등)·내부 라벨·이모지가 0건인가?",
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
    task: `클러스터링된 5개 상업용 부동산·자산관리 이슈 후보를 고객용 ${cad.label} 뉴스레터 카드(2줄 권장 제목 ${AXIOS_TITLE_MAX_CHARS}자 이내 + 제목과 자연스럽게 이어지는 3줄 상세 해설 ${AXIOS_BRIEF_MAX_CHARS}자 이내)로 정밀 재작성합니다.`,
    audience:
      "모바일 카카오톡으로 소식지를 읽으시는 70대 건물 매수자·건물주 어르신. 금융·부동산 전문용어나 영어 약어 설명 없이도, 카드 제목(2줄)과 상세 해설(3줄)만 읽고 '지금 무슨 일이 벌어졌고, 내 건물 매수·월세·세금에 어떤 유불리가 생기는지' 3초 만에 쏙 이해하셔야 합니다. 작성자 화법: 옆자리에서 20년 경력 담당 공인중개사가 차분하고 쉬운 한국어로 조근조근 짚어 주는 구어 기반 정중한 설명문.",
    warnings: [
      ...COMMON_COPY_WARNINGS,
      "[70s-Buyer-Plain-Korean] 한자식 압축 조어나 금융 외래어를 절대 그대로 쓰지 말고 쉬운 일상어로 풀어쓰십시오: '금리 스프레드→은행 대출금리 차이', '조달 금리→대출 이자', '자기자본수익률(ROE)→내 돈 대비 실제 수익률', '표면 수익률→단순 연 월세 수익률', '밸류애드→건물 수리·세입자 개선', '리파이낸싱→기존 대출 갈아타기', '레버리지→대출 활용', '명도 여건→기존 세입자 퇴거 협의', '플래그십→대표 매장', '아트테크→미술품 전시·절세', '프롭테크→디지털 건물 관리'.",
      "[No-Broker-Coaching] 중개사에게 지시하는 내부 말투('소구가 가능합니다', '성사율을 높입니다', '브리핑에 활용하세요', '안내하세요')를 절대 쓰지 말고, 오직 70대 매수자·건물주 본인에게 직접 전하는 말씀('~보시면 유리합니다', '~부담이 줄어듭니다', '~미리 챙기셔야 합니다')으로 쓰십시오.",
      `[${AXIOS_TITLE_MAX_CHARS}-Char Card Title] [Card-News 2-Line Title] 각 title은 공백 포함 24~38자 권장(최대 ${AXIOS_TITLE_MAX_CHARS}자)으로, 모바일 360~390px 화면에서 딱 2줄 안팎(3줄 절대 미초과)에 읽히게 씁니다. 한자 명사만 4개 이상 겹쳐 나열하지 말고 '무엇이 어떻게 변했는가 / 왜 살펴야 하는가'가 자연스럽게 읽히는 주어+서술형 문장으로 쓰십시오.`,
      `[${AXIOS_BRIEF_MAX_CHARS}-Char Detailed Brief] [Detailed 3-Line Subtitle Brief] 각 brief는 공백 포함 52~68자 권장(최대 ${AXIOS_BRIEF_MAX_CHARS}자)의 1~2문장으로, 모바일 화면에서 3줄 분량(4줄 절대 미초과)으로 렌더링됩니다. title과 똑같은 말을 되풀이하지 말고, (앞부분) 제목의 배경이나 이유를 이어 설명하고 + (뒷부분) 매수자·건물주에게 실제로 무엇이 유리하거나 조심할 점인지 '~합니다/~됩니다/~입니다'로 친절히 풀어 주십시오.`,
      "[Grounding] 후보의 원문제목·원문요약에 있는 사실만 사용하고, 후보 id·채널을 바꾸지 마십시오. 5개 카드의 주제가 서로 겹치지 않게 하십시오.",
    ],
    outputContract: [
      "반드시 아래 JSON 형식으로 정확히 5개(unitIssues 배열 길이 5)를 반환하십시오 (추가 설명·코드펜스 금지):",
      "{",
      '  "unitIssues": [',
      `    { "id": "후보 id 그대로", "title": "70대 매수자가 바로 이해하는 2줄 제목(24~38자 권장, 최대 ${AXIOS_TITLE_MAX_CHARS}자)", "brief": "제목과 자연스럽게 이어지는 3줄 상세 해설(52~68자 권장, 최대 ${AXIOS_BRIEF_MAX_CHARS}자, ~다.로 종결)", "channel": "real_estate|economy_finance|tax_wealth|culture_lifestyle|commercial_trend", "sentiment": "bullish|bearish|neutral" }`,
      "  ]",
      "}",
    ].join("\n"),
    situation: `${cad.label} 뉴스레터 독자(${cad.period} 소식)에게, 중개사의 주력 권역(${regions.join(", ") || "주요 상권"})과 관심 분야(${channelLabels.join(", ")}) 관점에서 70대 빌딩 매수자가 자기 상황과 연결해 즉시 이해할 수 있도록 카피를 고도화하십시오.`,
    knowledge: factBookContext,
    logicChain: [
      "5개 후보 각각의 원문에서 전문용어·외래어를 먼저 쉬운 우리말로 바꾸고 '무슨 변화인가'와 '내 건물·매수 자금·세금에 어떤 의미인가'를 뽑아냅니다.",
      `title: 전문 한자어나 약어를 빼고, 70대 매수자가 제목만 읽어도 요점이 바로 잡히는 자연스러운 2줄 제목(24~38자, 최대 ${AXIOS_TITLE_MAX_CHARS}자)으로 씁니다.`,
      `brief: title에 바로 이어져 구체적 이유와 매수자·건물주 실질 득실을 친절히 풀어 주는 3줄 분량 해설(52~68자, 최대 ${AXIOS_BRIEF_MAX_CHARS}자, ~합니다/~입니다)을 작성합니다.`,
      "권역·관심 분야 관련성이 높은 카드를 앞 순서로 유지하되 후보 id 집합은 그대로 둡니다.",
      "[V] 체크리스트로 글자 수(제목<=44, 해설<=74)·줄 수(제목 2줄/해설 3줄)·쉬운 용어·매수자 시점 화법·미출처 숫자 0건을 검증한 뒤 JSON만 출력합니다.",
    ],
    examples: [
      "✅ title (31자): \"시중은행 빌딩 담보대출 금리 완화, 매수 이자 부담 줄어드나\"",
      "✅ brief (56자): \"대출 이자가 내려가면 내 돈 대비 실제 남는 수익이 커져 매수를 결정하기가 한결 수월해집니다.\"",
      "❌ title (어려운 전문용어): \"통화정책 전환기, 빌딩 담보대출 금리 스프레드 점검\" (70대 매수자가 '스프레드' 뜻을 바로 이해하기 어려움)",
      "❌ brief (내부 코칭 화법): \"자기자본에 맞춘 레버리지 비율 안내가 거래 성사율을 높입니다.\" (중개사 내부 화법·영문 조어 노출 금지)",
      "❌ title (미완결 절단): \"일부 공간 호황을 건물 전체 임대수입으로 계산해선\" (보조용언 '안 된다' 누락 금지 → ✅ \"일부 가게 잘된다고 건물 전체 월세 수입으로 계산해선 안 된다\")",
      "❌ brief (개조식 종결): \"10년 전 공사비 영수증이 꼬마빌딩 양도세를 좌우할 수 있음.\" (~음/~됨 금지 → ✅ \"~양도세를 수천만 원 줄여 줄 수 있습니다.\")",
      "✅ title (31자): \"경기 덜 타는 최고 인기 세입자, 동네 병의원과 대형 카페\"",
      "✅ brief (54자): \"건강 관리 수요로 역세권 건물의 병원·약국 임차는 한 번 들어오면 오래 남아 월세가 밀리지 않습니다.\"",
    ],
    selfCheck: [
      `5개 title 모두 공백 포함 24~38자 권장(최대 ${AXIOS_TITLE_MAX_CHARS}자)이며 '~해선', '~할 수', '~에 따른' 같은 잘림과 어려운 금융·영문 약어가 0건인가?`,
      `5개 brief 모두 공백 포함 52~68자 권장(최대 ${AXIOS_BRIEF_MAX_CHARS}자)이며 제목을 반복하지 않고 '내 건물에 왜 중요한지'를 친절한 완결 평서문('~합니다.', '~됩니다.', '~입니다.')으로 3줄 분량 풀어썼는가?`,
      "중개사 내부 코칭 말투('소구가 가능', '성사율', '브리핑에 활용')·개조식('~음.', '~됨.')·말줄임표·이모지가 0건인가?",
      "원문에 없는 숫자가 0건이고, 가십·비부동산 소재가 0건인가?",
      "후보 id 5개가 모두 그대로 있고 주제가 서로 겹치지 않는가?",
    ],
    fallbackRepair:
      `M11 핀포인트 블록 교정: 어려운 전문용어는 humanizeBuyerCopy로 즉시 쉬운 우리말로 바꾸고, 개별 카드가 ${AXIOS_TITLE_MAX_CHARS}/${AXIOS_BRIEF_MAX_CHARS}자 예산을 넘거나 라벨이 누출되면 해당 카드만 formatAxiosCardTitle / formatAxiosTwoLineBrief로 교정합니다.`,
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
    45,
    formatSingleLineTitle(`${opts.monthLabel} ${regionLabel} 빌딩 시장 브리핑`, 45),
    false,
    "title",
  );
  const summary = rawCandidate.summary
    ? cleanField(rawCandidate.summary, 80, "")
    : "";
  const briefingTitle = rawCandidate.briefingTitle
    ? cleanField(rawCandidate.briefingTitle, 30, "", false, "title")
    : "";
  const rawBriefingBody = cleanField(
    rawCandidate.briefingBody,
    500,
    `${opts.monthLabel} ${regionLabel} 일대 중소형 빌딩 시장은 입지가 좋고 세입자가 안정적인 건물을 중심으로 실수요 문의가 이어지고 있습니다.\n자금 사정에 맞춘 대출 조건과 건물 수리 상태를 함께 점검해 두시면 좋은 매물을 고르실 때 큰 도움이 됩니다.`,
    true,
  );
  const briefingBody = normalizeMarketBriefingPlain(
    humanizeBuyerCopy(rawBriefingBody),
    500,
    5,
  ) || normalizeMarketBriefingPlain(rawBriefingBody, 500, 5);

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

export interface Tf8BriefingPolishPromptInput {
  draftText: string;
  contextText?: string;
  cadence?: Tf8Cadence;
  regionFocus?: string;
}

/**
 * 1~3줄 거친 중개인 메모 → 70대 매수자 눈높이의 5줄·500자 이내 순수 시장 브리핑 윤문 프롬프트
 */
export function buildTf8BriefingPolishPrompt(
  input: Tf8BriefingPolishPromptInput,
): {
  spec: TaskFlow8PromptSpec;
  systemPrompt: string;
  userPrompt: string;
  factBookContext: string;
} {
  const cad = CADENCE_PROMPT_META[input.cadence ?? "monthly"];
  const draft = input.draftText.trim();
  const extraContext = input.contextText?.trim() ?? "";

  const factBookContext = [
    draft ? `중개사 입력 초안(1~3줄 메모):\n${draft}` : "",
    extraContext && extraContext !== draft ? `참고 맥락(발행 호수·주력 권역·주요 이슈): ${extraContext}` : "",
    input.regionFocus ? `주력 권역: ${input.regionFocus.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const spec: TaskFlow8PromptSpec = {
    slotKey: "magazine_briefing_polish_tf8",
    version: "1.0",
    task: `중개사가 적은 1~3줄의 짧은 메모를 바탕으로, 60~70대 건물 매수자·건물주가 읽기 편한 ${cad.label} 시장 브리핑(3~5줄 · 500자 이내 순수 텍스트)으로 정중하고 자연스럽게 윤문합니다.`,
    audience:
      "모바일로 소식지를 받아보는 60~70대 빌딩 매수자·건물주. 한 번에 쏙 읽히는 쉬운 우리말 존댓말('~합니다/~입니다')을 선호하며, 별도 소제목이나 장식 기호 없이 간결한 3~5줄 브리핑을 원합니다.",
    warnings: [
      ...COMMON_COPY_WARNINGS,
      "[70s-Buyer-Plain-Korean] '스프레드', '레버리지', '자기자본수익률', '밸류애드', '리파이낸싱' 등 어려운 금융·영문 전문용어를 쉬운 일상 우리말로 풀어쓰십시오.",
      "[Strict-5-Line-500-Char] 반드시 줄바꿈 기준 3~5줄 이내, 총 글자 수 120~450자(최대 500자) 이내의 순수 텍스트로만 출력하십시오. '■ 소제목', 제목 줄, 글머리 기호(-, *), 마크다운 강조(**)를 절대 넣지 마십시오.",
      `[Cadence-Consistency] ${cad.label} 뉴스레터이므로 '${cad.period}' 흐름에 자연스럽게 맞추십시오.`,
    ],
    outputContract:
      "소제목·따옴표·마크다운 기호 없이 3~5줄 줄바꿈으로 나눈 순수 한국어 시장 브리핑 본문만 출력 (총 500자 이내).",
    situation: `${cad.label} 뉴스레터 상단 '시장 브리핑' 영역에 들어가는 중개인 직접 브리핑입니다.`,
    knowledge: factBookContext || "상업용 빌딩 시장의 전반적인 매수·임대 흐름",
    logicChain: [
      "중개사 초안의 핵심 뜻(입지, 금리 분위기, 매수·세입자 흐름, 당부 말씀)과 입력된 숫자만 그대로 추출합니다.",
      "70대 어르신이 읽기 편하도록 짧은 문장 3~5줄(한 줄 한 생각)로 다듬어 연결합니다.",
      "줄 수(<=5줄), 글자 수(<=500자), 미출처 숫자 0건, 소제목/기호 0건을 검증한 뒤 본문만 출력합니다.",
    ],
    fallbackRepair:
      "M11 핀포인트 윤문 교정: 미출처 숫자 제거 후 normalizeMarketBriefingPlain(text, 500, 5)로 5줄·500자 이내 순수 텍스트를 보장합니다.",
  };

  const { systemPrompt, userPrompt } = renderTf8Prompt(spec);
  return { spec, systemPrompt, userPrompt, factBookContext };
}

/**
 * M11 핀포인트 5줄·500자 시장 브리핑 윤문 교정기
 */
export function repairBriefingPolishOutputBlock(
  rawText: string,
  inputContext: string,
): {
  comment: string;
  warnings: string[];
  envelope: AgentOutputEnvelope<MarketBriefingPolishOutput>;
} {
  const warnings: string[] = [];
  const base = sanitizeReaderText(rawText)
    .replace(/^[""'']+|[""'']+$/g, "")
    .trim();
  const { cleaned, detected } = stripForbiddenSolicitation(base);
  const { repairedText, strippedNumbers } = repairUngroundedNumbers(cleaned, inputContext);
  if (strippedNumbers.length > 0) {
    warnings.push("입력에 없는 숫자가 감지되어 핀포인트 교정되었습니다.");
  }

  const normalized = normalizeMarketBriefingPlain(humanizeBuyerCopy(repairedText), 500, 5);
  const fallbackPlain = normalizeMarketBriefingPlain(sanitizeReaderText(inputContext), 500, 5);
  const finalComment = normalized || fallbackPlain;

  const output: MarketBriefingPolishOutput = {
    comment: finalComment,
  };

  const envelope = createSuccessEnvelope<MarketBriefingPolishOutput>(output, {
    warnings,
    protected_fields_detected: detected,
    boundary_note: "AI가 5줄·500자 이내로 다듬은 시장 브리핑입니다.",
    confidence: "memo_based_inference",
    source_refs: [{ type: "memo", label: "broker-market-briefing" }],
  });

  return { comment: output.comment, warnings, envelope };
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

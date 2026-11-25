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
  MARKET_BRIEFING_LINE_MAX_CHARS,
  POST_IT_TONES,
  charLength,
  extractArticleNumericEvidence,
  formatAxiosCardTitle,
  formatAxiosTwoLineBrief,
  condenseKoreanParagraph,
  formatMarketBriefingThreeBullets,
  formatSingleLineTitle,
} from "@/domain/magazine/issue-clustering";
import {
  TONE_STANCE_META,
  isCreRelevantArticle,
  normalizeNewsletterToneStance,
  resolveNewsChannel,
  type NewsPoolItem,
  type NewsletterToneStance,
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
    const pctRegex = new RegExp(`${escaped}\\s*(?:%p|%|％|bp)`, "g");
    const priceRegex = new RegExp(
      `${escaped}\\s*(?:조\\s*원|조|억\\s*원|억|만\\s*원|만원|천\\s*만\\s*원|원)`,
      "g",
    );
    const countRegex = new RegExp(
      `${escaped}\\s*(?:평|㎡|건|배|개월|년|층|세대|호|점|명)`,
      "g",
    );

    let matched = false;
    if (pctRegex.test(out)) {
      out = out.replace(pctRegex, "시장 평균 범위");
      matched = true;
    }
    if (priceRegex.test(out)) {
      out = out.replace(priceRegex, "합리적 수준");
      matched = true;
    }
    if (countRegex.test(out)) {
      out = out.replace(countRegex, "");
      matched = true;
    }
    if (matched) {
      stripped.push(numToken);
    }
  }

  return {
    repairedText: out.replace(/[ \t]+/g, " ").replace(/\s+([.,])/g, "$1").trim(),
    strippedNumbers: stripped,
  };
}

export type NewsletterVoicePreset = "calm_advisor" | "field_broker" | "yield_focused";
export type { NewsletterToneStance };

const TONE_STANCE_PROMPT_RULES: Readonly<
  Record<
    NewsletterToneStance,
    {
      label: string;
      headlineRule: string;
      briefingRule: string;
      clusterSoWhatRule: string;
      dealCommentRule: string;
    }
  >
> = {
  positive: {
    label: TONE_STANCE_META.positive.label,
    headlineRule:
      "회복 신호·금리 완화·실수요 유입·선점 기회 어휘를 자연스럽게 앞세우십시오(단, 원금 보장·무조건 상승 등 단정 금지어는 절대 금지).",
    briefingRule:
      "1줄차에는 매수·답사 문의 활기를, 2줄차에는 거래 회복·금리 완화·낮은 공실 등 우호적 수치·근거를 우선 배치하고, 3줄차에는 우량 조건 매물 선점 체크포인트를 명사형 개조식(줄당 44자 이내)으로 정리하십시오.",
    clusterSoWhatRule:
      "1문장은 원문 수치·사실을 왜곡 없이 그대로 적고, 2문장(매수자 시사점)은 이자 절감·임차 호조·가치 회복 등 매수·보유 기회 요인을 중심으로 밝고 긍정적으로 해석하십시오.",
    dealCommentRule:
      "상권 회복 수혜, 안정적인 현금흐름, 향후 가치 상승 및 우량 조건 선점 매력을 자신감 있고 정중하게 부각하십시오.",
  },
  neutral: {
    label: TONE_STANCE_META.neutral.label,
    headlineRule:
      "과열이나 위축 어느 한쪽으로 치우치지 않고 '옥석 가리기·선별 흐름·조건 비교' 관점의 차분한 제목으로 작성하십시오.",
    briefingRule:
      "1줄차에는 입지별 선별 검토 흐름을, 2줄차에는 회복 지표와 점검할 변수를 균형 있게 담고, 3줄차에는 임차 안정성과 수익 구조 비교 기준을 명사형 개조식(줄당 44자 이내)으로 정리하십시오.",
    clusterSoWhatRule:
      "1문장은 원문 수치·사실을 그대로 적고, 2문장은 기회 요인과 사전 확인 사항을 균형 있게 짚어 옥석 가리기 기준을 제시하십시오.",
    dealCommentRule:
      "입지·도로·임차 현황 등 객관적인 강점과 안정성을 담백하게 짚어 비교 검토를 권하십시오.",
  },
  negative: {
    label: TONE_STANCE_META.negative.label,
    headlineRule:
      "공포 조장은 피하되 '관망세·공실 양극화·수지 점검·보수적 접근·눈높이 현실화' 관점의 냉철한 전문가 제목으로 작성하십시오.",
    briefingRule:
      "1줄차에는 추격 매수를 자제하는 신중한 관망세와 까다로워진 눈높이를, 2줄차에는 공실·대출이자·세무·공사비 부담 등 리스크 수치·근거를 우선 배치하고, 3줄차에는 공실 방어력이 검증된 안전 매물 선별 및 조건 점검 기준을 명사형 개조식(줄당 44자 이내)으로 정리하십시오.",
    clusterSoWhatRule:
      "1문장은 원문 수치·사실을 왜곡 없이 그대로 적고, 2문장(매수자·건물주 시사점)은 역마진 경계·공실 방어·세무 리스크 점검·적정 호가 현실화 등 보수적 리스크 관리 관점으로 해석하십시오.",
    dealCommentRule:
      "무조건 좋다는 과장 대신 '요즘처럼 시장이 까다롭고 관망세가 짙을수록 전 층 만실·장기 우량 임차·추가 수리비 부담 없음으로 하방 위험을 꽉 잡은 방어형·알짜 조건'이라는 역발상 신뢰 소구로 작성하십시오.",
  },
};

const VOICE_PRESET_GUIDANCE: Record<NewsletterVoicePreset, { label: string; tone: string }> = {
  calm_advisor: {
    label: "담백·신뢰형",
    tone: "차분하고 정중한 1:1 자산 자문 화법으로 군더더기 없이 신뢰감을 주는 어조",
  },
  field_broker: {
    label: "현장 밀착형",
    tone: "직접 임장하며 고객과 현장에서 대화를 나누듯 생생하고 발품이 느껴지는 어조",
  },
  yield_focused: {
    label: "실속·수익형",
    tone: "월세 흐름, 은행 이자 부담, 공실 방어 같은 실질 현금흐름 포인트를 또렷이 짚어주는 어조",
  },
};

export type Tf8Cadence = "daily" | "weekly" | "monthly" | "special";

const CADENCE_PROMPT_META: Record<
  Tf8Cadence,
  { label: string; period: string; bodyRange: string; headlineFlavor: string }
> = {
  daily: {
    label: "일간",
    period: "오늘",
    bodyRange: "60~135자 (정확히 3줄 명사형 개조식, 줄당 44자 이내)",
    headlineFlavor: "오늘 현장 답사·금리·매물 체감이 살아 있는 당일 속보형 제목",
  },
  weekly: {
    label: "주간",
    period: "이번 주",
    bodyRange: "60~135자 (정확히 3줄 명사형 개조식, 줄당 44자 이내)",
    headlineFlavor: "이번 주 핵심 매수·임차 실무 판단 기준을 짚는 주간 동향 제목",
  },
  monthly: {
    label: "월간",
    period: "이번 달",
    bodyRange: "60~135자 (정확히 3줄 명사형 개조식, 줄당 44자 이내)",
    headlineFlavor: "이달 권역 거래량·공실률·수익률 흐름을 아우르는 월간 결산 제목",
  },
  special: {
    label: "호외",
    period: "지금",
    bodyRange: "60~135자 (정확히 3줄 명사형 개조식, 줄당 44자 이내)",
    headlineFlavor: "지금 즉시 챙겨야 할 정책·시장 변화를 담은 호외 제목",
  },
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
  /** 선택된 추천 매물 요약(권역·가격구간·유형·핵심 장점) */
  dealSummaries?: readonly string[];
  /** 이슈 카드에서 뽑은 수치·사실 근거 요약 */
  newsEvidence?: readonly string[];
  /** 월간 통계 그래픽 대표 수치 요약 */
  monthlyStatsSummary?: string;
  /** 중개사 화법 프리셋 */
  voicePreset?: NewsletterVoicePreset;
  /** 거래 온도 프리셋 (기본값: 'positive' 긍정적) */
  toneStance?: NewsletterToneStance;
  currentHeadline?: string;
  currentBriefing?: string;
}

/** 공통 카피 하드 제약 (모든 뉴스레터 슬롯 공용) */
const COMMON_COPY_WARNINGS = [
  "[No-LLM-Numbers] [K] Knowledge FactBook에 없는 구체적 수치(공실률, 수익률, 매매가, 변동률, 거래건수, 금리, 날짜 등)를 절대 창작·추정·반올림하지 마십시오. FactBook 숫자는 단위까지 그대로 옮기십시오.",
  "[Unit-Denominator-Lock] 수치를 쓸 때는 원문의 기준 단위·모수·대상('평당 950만원'의 '평당', '감정가 대비 55~60%'의 '감정가 대비', '전년 대비 8.5%'의 '전년 대비', '연 4.2%'의 '연', 어느 지역/유형의 공실률인지)을 절대 빼먹지 마십시오 ('공사비 950만원'처럼 단위를 생략해 총액으로 오해되게 쓰지 마십시오).",
  "[No-Solicitation] '원금 보장', '확정 수익', '100% 보장', '무조건 상승', '반드시 오릅니다', '즉시 매수 권유', '절대 손해' 등 투자 권유·단정 표현을 절대 사용하지 마십시오.",
  "[No-Internal-Labels] '핵심 팩트:', '브로커 임플리케이션:', '추천 액션:', 'Why it matters:', 파이프('|'), 마크다운(#, **, -), 코드펜스, 이모지를 출력하지 마십시오.",
  "[No-Gossip] 연예인·정치인·사생활·자택 경매·아파트 시세 등 상업용 부동산(빌딩·근생·오피스·상가) 본질과 무관한 소재를 절대 언급하지 마십시오.",
  "[No-Truncation] 말줄임표('…', '...')로 끝내거나 조사·관형형·미완결 보조용언('~의', '~에', '~을', '~한', '~하는', '~따른', '~해선', '~해서는', '~할 수', '~하면', '~해야', '~및')으로 끝나는 잘린 문장, 또는 어색한 단문('~있음.', '~안 됨.', '~해야 함.', '~수준임.')을 절대 출력하지 마십시오. 글자 수가 넘치면 수식어를 빼서 처음부터 완결된 문장으로 다시 쓰십시오.",
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
  const dealSummaries = (input.dealSummaries ?? []).map((d) => d.trim()).filter(Boolean);
  const news = (input.newsTitles ?? []).map((n) => n.trim()).filter(Boolean);
  const newsEvidence = (input.newsEvidence ?? []).map((n) => n.trim()).filter(Boolean);
  const cadence = resolveCadence(input.cadence, input.monthLabel);
  const cad = CADENCE_PROMPT_META[cadence];
  const voice = VOICE_PRESET_GUIDANCE[input.voicePreset ?? "calm_advisor"] ?? VOICE_PRESET_GUIDANCE.calm_advisor;
  const stanceKey = normalizeNewsletterToneStance(input.toneStance, "positive");
  const stance = TONE_STANCE_PROMPT_RULES[stanceKey];

  const knowledgeLines = [
    `- 발행 호수/시기: ${input.monthLabel}`,
    `- 발행 주기: ${cad.label} 뉴스레터 (기간 표현은 '${cad.period}'을 사용)`,
    `- 목표 거래 온도: ${stance.label}`,
    `- 선택 화법: ${voice.label} (${voice.tone})`,
    regions.length > 0 ? `- 중개사 주력 권역: ${regions.join(", ")}` : "- 중개사 주력 권역: 서울·수도권 주요 상권",
    `- 관심 분야: ${channelLabels.join(", ")}`,
    dealSummaries.length > 0
      ? `- 추천 매물 상세 Fact: ${dealSummaries.slice(0, 5).join(" | ")}`
      : deals.length > 0
        ? `- 추천 매물 Fact: ${deals.join(" | ")}`
        : "- 추천 매물 Fact: (선택된 매물 없음 — 일반 시장 브리핑 중심)",
    input.monthlyStatsSummary ? `- 권역 시황 통계 Fact: ${input.monthlyStatsSummary.trim()}` : "",
    newsEvidence.length > 0
      ? `- 핵심 뉴스 수치·근거 Fact: ${newsEvidence.slice(0, 5).join(" | ")}`
      : news.length > 0
        ? `- 핵심 뉴스 헤드라인 Fact: ${news.slice(0, 5).join(" | ")}`
        : "",
    input.currentHeadline ? `- 중개사 작성 제목 메모: ${input.currentHeadline}` : "",
    input.currentBriefing ? `- 중개사 작성 본문 메모: ${input.currentBriefing}` : "",
  ].filter(Boolean);

  const factBookContext = knowledgeLines.join("\n");

  const spec: TaskFlow8PromptSpec = {
    slotKey: "magazine_draft_tf8",
    version: "5.0",
    task: `한국 소형부동산(꼬마빌딩·근생빌딩) 공인중개사가 매수자·건물주 고객에게 보내는 ${cad.label} 뉴스레터(${input.monthLabel})의 제목(headline, 36자 이내)과 정확히 3줄 명사형 개조식 시장 브리핑(briefingBody, 줄당 44자 이내)을 JSON으로 작성합니다.`,
    audience:
      `모바일 카카오톡으로 소식지를 열어보시는 중소형 빌딩 매수 검토자, 법인 대표, 건물주 독자. ${voice.label}(${voice.tone}) 관점을 살리되 바쁜 고객이 3초 만에 훑어볼 수 있도록 명사로 간결하게 끝나는 3줄 개조식 뷸렛 목록으로 작성합니다.`,
    warnings: [
      ...COMMON_COPY_WARNINGS,
      `[3-Bullet-Executive-Brief] briefingBody는 줄바꿈(\\n)으로 나눈 정확히 3줄 개조식 뷸렛 목록으로 작성하십시오. 각 줄은 반드시 \`• \`로 시작하고(앞에 '현장 분위기 :' 같은 부연 라벨 절대 금지), 서술형('~합니다/~입니다/~다') 대신 간결한 명사형('~지속', '~선호', '~점검 권장', '~완화' 등, 마침표 없음)으로 끝내며, 뷸렛 기호를 제외한 줄당 본문 길이는 반드시 44자 이내로 맞추십시오:\n  1줄: '${cad.period}' 시점과 제목 권역을 일치시킨 실제 문의·매수 흐름 (명사 종결, 44자 이내)\n  2줄: FactBook의 뉴스·통계에 있는 검증 수치(평당·연·대비 등 기준 단위 필수 포함)와 변수 (명사 종결, 44자 이내)\n  3줄: 추천 매물과 연결한 매수·보유 핵심 체크포인트 (명사 종결, 44자 이내)`,
      "[Natural-Korean-Particles] 줄의 맨 끝만 명사형으로 맺고, 문장 중간의 자연스러운 조사('~을/를 위한', '~이/가 확인된', '~에 따른')는 생략하지 마십시오 ('우량 매물 선점 위한' ❌ → '우량 매물 선점을 위한' ✅, '감정평가 세금' ❌ → '상속·증여 감정평가 세액' ✅).",
      `[Cadence-Headline-Identity] 표지 제목(headline)이 천편일률적인 '~매수 검토', '~조건 비교'로만 끝나지 않도록 [${cad.headlineFlavor}] 결을 살리고, 제목에 쓴 권역명과 본문 1줄차의 권역명을 정확히 일치시키십시오.`,
      `[Tone-Temperature-Framing] 현재 설정된 거래 온도는 [${stance.label}] 입니다. 수치는 절대 왜곡하지 않되, 제목은 (${stance.headlineRule}), 본문 3줄은 (${stance.briefingRule}) 방향으로 일관되게 프레이밍하십시오.`,
      "[70s-Buyer-Plain-Korean] '금리 스프레드', '조달 금리', '자기자본수익률', '표면 수익률', '밸류애드', '리파이낸싱', '레버리지', '명도' 같은 어려운 전문용어·외래어 대신 '은행 대출금리 차이', '대출 이자', '내 돈 대비 실제 수익', '단순 연 월세 수익', '건물 수리·세입자 개선', '대출 갈아타기', '기존 세입자 퇴거 협의' 등 쉬운 일상어를 쓰십시오.",
      "[Char-Budget] headline 36자 이내(공백 포함), briefingBody " + cad.bodyRange + ". summary와 briefingTitle은 빈 문자열(\"\")로 두십시오.",
      `[Cadence-Consistency] ${cad.label} 뉴스레터이므로 '${cad.period}' 기간 표현만 사용하고, 다른 주기 표현(예: 일간인데 '이번 달')을 섞지 마십시오.`,
    ],
    outputContract: [
      "반드시 아래 JSON 객체만 반환하십시오 (추가 설명·코드펜스 금지):",
      "{",
      '  "headline": "36자 이내 — 권역+핵심 흐름을 쉬운 말로 담은 완결된 제목",',
      '  "summary": "",',
      '  "briefingTitle": "",',
      `  "briefingBody": "${cad.bodyRange} — '• 첫째 줄 명사형 요약\\n• 둘째 줄 명사형 요약\\n• 셋째 줄 명사형 요약' 3줄 개조식 순수 텍스트"`,
      "}",
    ].join("\n"),
    situation: [
      `발송 대상 가시성: ${envelope?.targetVisibility ?? "public_named"}`,
      `발행 주기: ${cad.label} (${input.monthLabel})`,
      `적용 화법: ${voice.label} (${voice.tone})`,
      `중개사 주력 권역(${regions.join(", ") || "주요 업무·상업 권역"})과 관심 분야(${channelLabels.join(", ")}) 관점을 담아 3줄 명사형 개조식(줄당 44자 이내)으로 바로 읽히게 작성하십시오.`,
    ].join("\n"),
    knowledge: factBookContext,
    logicChain: [
      "[K] FactBook에서 발행 시기·주기, 주력 권역, 추천 매물 스펙, 뉴스 수치·근거, 월간 통계, 중개사 메모를 추출합니다.",
      "일반 매수자·건물주 독자도 한 번에 뜻을 알아들을 수 있도록 전문용어를 쉬운 일상어로 바꿉니다.",
      "36자 이내의 명확한 뉴스레터 제목(headline)을 씁니다.",
      "줄바꿈(\\n)으로 구분된 정확히 3줄 `• 명사형 개조식`(각 줄 본문 44자 이내, 앞 라벨 및 마침표 없음)으로 briefingBody를 작성합니다.",
      "[V] 체크리스트로 글자 수(줄당 ≤44자)·3줄 줄바꿈·명사형 종결·쉬운 용어·미출처 숫자 0건·금지어를 검증한 뒤 JSON만 출력합니다.",
    ],
    examples: [
      "✅ headline (26자): \"역세권 알짜 빌딩, 실수요 중심 선별 매수 흐름\"",
      "✅ briefingBody (담백·신뢰형 3줄 명사형 개조식):\n\"• 강남·성수 역세권 만실 올근생 중심 실수요 매수 문의 지속\\n• 대출 금리 안정 기대 속 공실 부담 적은 코너 건물 선호\\n• 추천 매물 임대 조건 및 수리 여건 사전 비교 점검 권장\"",
      "✅ briefingBody (실속·수익형 3줄 명사형 개조식 — FactBook에 수치가 있을 때):\n\"• 성수 권역 연 4%대 안정 월세 수익형 근생 빌딩 문의 활발\\n• 3분기 거래량 14% 증가·공실률 2.8% 유지로 임대 안정성 부각\\n• 권역 평균 대비 수익 우수한 추천 매물 조건표 우선 확인 권장\"",
      "❌ briefingBody: \"■ 이번 달 동향\\n이번 주 문의가 이어지고 있습니다. 금리가 안정세입니다.\" (■ 소제목·서술형 어미·줄바꿈 누락 금지)",
    ],
    selfCheck: [
      "headline 글자 수 ≤ 36, summary=\"\", briefingTitle=\"\", briefingBody가 줄바꿈(\\n) 기준 정확히 3줄(`• ...`)이며 각 줄 본문이 44자 이내인가?",
      "전문용어·영어 약어나 '현장 분위기 :' 같은 앞 라벨, '■ 소제목'·마크다운(**) 기호가 0건이고 모든 줄이 명사로 간결하게 끝나는가?",
      "2줄차에 FactBook의 검증 수치·객관 근거를 우선 반영하고, FactBook에 없는 숫자는 0건인가?",
      "금지어(원금 보장·확정 수익 등)·내부 라벨·이모지가 0건인가?",
      `기간 표현이 '${cad.period}'으로 일관된가?`,
    ],
    fallbackRepair:
      "M11 핀포인트 디버거 규칙: 특정 문장에 미출처 숫자가 감지되면 해당 수치 구절만 자연어로 교정하고, 글자 수 초과 시 어절 경계 압축 + 매달린 조사 제거로 완결된 문장을 유지합니다(하드 슬라이스 금지).",
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
  /** 거래 온도 프리셋 (기본값: 'positive' 긍정적) */
  toneStance?: NewsletterToneStance;
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
  const stanceKey = normalizeNewsletterToneStance(input.toneStance, "positive");
  const stance = TONE_STANCE_PROMPT_RULES[stanceKey];
  const sourceById = new Map(
    (input.sourceArticles ?? []).map((a) => [String(a.id ?? a.title).trim(), a] as const),
  );

  const candidateLines = input.candidateIssues.slice(0, ISSUE_CARD_COUNT).map((issue, idx) => {
    const src = sourceById.get(String(issue.id).trim());
    const rawTitle = src?.title?.trim() || issue.title;
    const rawSummary = (src?.summary ?? issue.brief ?? "").replace(/\s+/g, " ").trim().slice(0, 650);
    const numericEvidence = extractArticleNumericEvidence({ title: rawTitle, summary: rawSummary });
    return [
      `[후보 #${idx + 1}] id="${issue.id}" | 채널=${issue.channel ?? "real_estate"}`,
      `  원문제목: ${rawTitle}`,
      `  원문요약: ${rawSummary}`,
      numericEvidence.length > 0
        ? `  검증된 원문 수치·근거(최우선 반영): ${numericEvidence.join(" | ")}`
        : "  검증된 원문 수치·근거: (원문 수치 없음 — 기관명·시점·구역 등 객관 근거 우선 기술, 숫자 창작 금지)",
      `  현재 카드 초안: 제목="${issue.title}"(${charLength(issue.title)}자) / 해설="${issue.brief}"(${charLength(issue.brief)}자)`,
    ].join("\n");
  });
  const factBookContext = [
    `발행 주기: ${cad.label} 뉴스레터${input.cadenceLabel ? ` (${input.cadenceLabel})` : ""}`,
    `목표 거래 온도: ${stance.label}`,
    regions.length > 0 ? `중개사 주력 권역: ${regions.join(", ")}` : "중개사 주력 권역: 서울·수도권 핵심 권역",
    `중개사 선택 관심 분야: ${channelLabels.join(", ")}`,
    ...(input.dealTitles && input.dealTitles.length > 0
      ? [`보유 추천 매물: ${input.dealTitles.join(" | ")}`]
      : []),
    ...candidateLines,
  ].join("\n");

  const spec: TaskFlow8PromptSpec = {
    slotKey: "magazine_axios_cluster_tf8",
    version: "4.0",
    task: `클러스터링된 5개 상업용 부동산·자산관리 이슈 후보를 고객용 ${cad.label} 뉴스레터 카드(2줄 권장 제목 ${AXIOS_TITLE_MAX_CHARS}자 이내 + 원문 수치 데이터·근거를 최우선 기술하는 2문장 해설 ${AXIOS_BRIEF_MAX_CHARS}자 이내)로 정밀 재작성합니다.`,
    audience:
      "모바일 카카오톡으로 소식지를 읽으시는 건물 매수자·건물주 독자. 막연한 분위기 설명보다 원문에 있는 정확한 수치·기관 근거를 먼저 확인한 뒤, '그래서 내 건물 매수·월세·세금에 어떤 유불리가 생기는지' 3초 만에 이해하셔야 합니다. 화법: 20년 경력 담당 공인중개사의 정중한 설명문('~합니다/~입니다').",
    warnings: [
      ...COMMON_COPY_WARNINGS,
      "[Data-Evidence-First] 각 후보의 '검증된 원문 수치·근거'에 숫자(금리·거래량·공실률·평당가·세율·시점 등)나 기관·정책 근거가 있으면 반드시 title 앞부분과 brief 첫 문장의 핵심 사실로 최우선 기술하십시오. 반대로 원문에 숫자가 아예 없는 기사는 기관명·시행 시기·대상 구역 등 객관적 근거만 먼저 쓰고, 절대 숫자를 지어내지 마십시오.",
      `[Tone-Temperature-Framing] 현재 설정된 거래 온도는 [${stance.label}] 입니다. ${stance.clusterSoWhatRule}`,
      "[70s-Buyer-Plain-Korean] 한자식 압축 조어나 금융 외래어를 절대 그대로 쓰지 말고 쉬운 일상어로 풀어쓰십시오: '금리 스프레드→은행 대출금리 차이', '조달 금리→대출 이자', '자기자본수익률(ROE)→내 돈 대비 실제 수익률', '표면 수익률→단순 연 월세 수익률', '밸류애드→건물 수리·세입자 개선', '리파이낸싱→기존 대출 갈아타기', '레버리지→대출 활용', '명도 여건→기존 세입자 퇴거 협의', '플래그십→대표 매장', '아트테크→미술품 전시·절세', '프롭테크→디지털 건물 관리'.",
      "[No-Broker-Coaching] 중개사에게 지시하는 내부 말투('소구가 가능합니다', '성사율을 높입니다', '브리핑에 활용하세요', '안내하세요')를 절대 쓰지 말고, 오직 건물 매수자·건물주 본인에게 직접 전하는 말씀('~보시면 유리합니다', '~부담이 줄어듭니다', '~미리 챙기셔야 합니다')으로 쓰십시오.",
      `[${AXIOS_TITLE_MAX_CHARS}-Char Card Title] [Card-News 2-Line Title] 각 title은 공백 포함 24~40자 권장(최대 ${AXIOS_TITLE_MAX_CHARS}자)으로, 원문 핵심 수치나 변화 포인트를 앞쪽에 담아 모바일에서 2줄 안팎으로 읽히게 씁니다.`,
      `[${AXIOS_BRIEF_MAX_CHARS}-Char Detailed Brief] [2-Sentence Data+SoWhat Brief] 각 brief는 공백 포함 64~92자 권장(최대 ${AXIOS_BRIEF_MAX_CHARS}자)의 정확히 2문장으로 작성합니다. 1문장은 원문 수치·공식 근거 핵심 사실, 2문장은 매수자·건물주가 지금 챙길 실질 유불리(So-What)를 '~합니다/~됩니다/~입니다'로 완결하십시오.`,
      "[Grounding] 후보의 원문제목·원문요약·검증된 수치·근거에 있는 사실만 사용하고, 후보 id·채널을 바꾸지 마십시오. 5개 카드의 주제가 서로 겹치지 않게 하십시오.",
    ],
    outputContract: [
      "반드시 아래 JSON 형식으로 정확히 5개(unitIssues 배열 길이 5)를 반환하십시오 (추가 설명·코드펜스 금지):",
      "{",
      '  "unitIssues": [',
      `    { "id": "후보 id 그대로", "title": "핵심 수치·변화를 앞세운 2줄 제목(24~40자 권장, 최대 ${AXIOS_TITLE_MAX_CHARS}자)", "brief": "1문장 수치·근거 핵심 사실 + 2문장 매수자 시사점(64~92자 권장, 최대 ${AXIOS_BRIEF_MAX_CHARS}자, ~합니다./~입니다.로 종결)", "channel": "real_estate|economy_finance|tax_wealth|culture_lifestyle|commercial_trend", "sentiment": "bullish|bearish|neutral" }`,
      "  ]",
      "}",
    ].join("\n"),
    situation: `${cad.label} 뉴스레터 독자(${cad.period} 소식)에게, 중개사의 주력 권역(${regions.join(", ") || "주요 상권"})과 관심 분야(${channelLabels.join(", ")}) 관점에서 정확한 수치·근거가 살아 있는 브리핑 카드를 제공합니다.`,
    knowledge: factBookContext,
    logicChain: [
      "5개 후보 각각의 '원문요약'과 '검증된 원문 수치·근거'에서 숫자·기관·시점 근거를 먼저 뽑고 전문용어를 쉬운 우리말로 바꿉니다.",
      `title: 핵심 수치나 변화 사실을 앞세워 2줄 제목(24~40자, 최대 ${AXIOS_TITLE_MAX_CHARS}자)으로 씁니다.`,
      `brief: 1문장 '원문 수치·근거 핵심 사실' + 2문장 '매수자·건물주 시사점'을 합쳐 64~92자(최대 ${AXIOS_BRIEF_MAX_CHARS}자, '~합니다/~입니다' 완결)로 작성합니다.`,
      "권역·관심 분야 관련성이 높은 카드를 앞 순서로 유지하되 후보 id 집합은 그대로 둡니다.",
      `[V] 체크리스트로 글자 수(제목<=${AXIOS_TITLE_MAX_CHARS}, 해설<=${AXIOS_BRIEF_MAX_CHARS})·수치 우선 기술·쉬운 용어·매수자 시점·미출처 숫자 0건을 검증한 뒤 JSON만 출력합니다.`,
    ],
    examples: [
      "✅ title (30자): \"상업용 담보대출 연 4.1%대 진입, 꼬마빌딩 문의 증가\"",
      "✅ brief (82자): \"시중은행 빌딩 대출 금리가 연초 대비 0.5%p 낮아진 4.1%대를 기록했습니다. 대출 이자 부담이 줄어 역세권 수익형 매수 검토가 한결 유리해졌습니다.\"",
      "✅ title (31자): \"강남 소형 오피스 공실률 2.6%·임대료 4.2% 상승\"",
      "✅ brief (80자): \"3분기 강남권 공실률이 2.6%로 낮아지며 평당 임대료가 4.2% 올랐습니다. 올리모델링 완료 역세권 근생은 재계약 수익 방어가 수월합니다.\"",
      "❌ brief (추상·정성만 나열): \"대출 부담이 줄어들면서 입지가 좋은 빌딩 위주로 관심이 높아지고 있습니다.\" (원문에 있는 구체 수치·근거 누락)",
      "❌ brief (내부 코칭 화법): \"자기자본에 맞춘 레버리지 비율 안내가 거래 성사율을 높입니다.\" (중개사 내부 화법·영문 조어 노출 금지)",
    ],
    selfCheck: [
      `5개 title 모두 공백 포함 24~40자 권장(최대 ${AXIOS_TITLE_MAX_CHARS}자)이며 '~해선', '~할 수' 같은 잘림과 어려운 약어가 0건인가?`,
      `5개 brief 모두 공백 포함 64~92자 권장(최대 ${AXIOS_BRIEF_MAX_CHARS}자)이며, 원문에 수치·근거가 있을 때 1문장에 최우선 기술하고 2문장에 매수자 시사점을 '~합니다/~입니다'로 완결했는가?`,
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
  posture?: string;
  priceBand?: string;
  area?: string;
  points?: readonly string[];
  attemptSeed?: number;
  toneStance?: NewsletterToneStance;
}

const COMMENT_ANGLES = [
  {
    key: "scarcity_location",
    label: "희소성·입지 강조",
    instruction: "이 권역과 가격대에서 왜 이 입지·도로·매물 조건이 귀한지 현장 관점에서 짚어 주십시오.",
  },
  {
    key: "cashflow_stability",
    label: "임차·수익 안정성 강조",
    instruction: "매수 후 공실 부담·임차 구성·유지 관리 측면에서 왜 마음이 놓이는지 실질적으로 설명하십시오.",
  },
  {
    key: "usage_exit",
    label: "활용성·장기 가치 강조",
    instruction: "사옥 활용이나 리모델링·향후 임차 수요 측면에서 어떤 실익이 있는지 설득력 있게 설명하십시오.",
  },
] as const;

export function buildTf8CommentPrompt(input: Tf8CommentPromptInput): {
  spec: TaskFlow8PromptSpec;
  systemPrompt: string;
  userPrompt: string;
  factBookContext: string;
} {
  const points = (input.points ?? []).map((p) => p.trim()).filter(Boolean).slice(0, 3);
  const angle = COMMENT_ANGLES[Math.abs(input.attemptSeed ?? 0) % COMMENT_ANGLES.length];
  const stanceKey = normalizeNewsletterToneStance(input.toneStance, "positive");
  const stance = TONE_STANCE_PROMPT_RULES[stanceKey];

  const factBookContext = [
    `중개사 입력 메모: ${input.comment.trim()}`,
    `목표 거래 온도: ${stance.label}`,
    input.dealTitle ? `대상 매물명: ${input.dealTitle.trim()}` : "",
    input.regionFocus ? `주력 권역/지역: ${input.regionFocus.trim()}` : "",
    input.posture ? `매물 유형: ${input.posture.trim()}` : "",
    input.priceBand ? `가격대: ${input.priceBand.trim()}` : "",
    input.area ? `면적: ${input.area.trim()}` : "",
    points.length > 0 ? `매물 핵심 장점: ${points.join(" / ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const spec: TaskFlow8PromptSpec = {
    slotKey: "magazine_comment_tf8",
    version: "3.0",
    task: "한국 소형부동산(꼬마빌딩·근생) 공인중개사가 뉴스레터 매물 카드 아래에 붙이는 '현장 한마디(추천 코멘트)'를 2문장(60~140자)의 설득력 있는 한국어 존댓말로 작성합니다.",
    audience: "상업용 빌딩 매수 검토 고객 및 법인·건물주 구독자. 과장 없이 20년 베테랑 중개사가 직접 임장해 보고 꼭 집어주는 듯한 담백하고 신뢰감 있는 말투('~합니다/~입니다')를 선호합니다.",
    warnings: [
      "[No-LLM-Numbers] [K] FactBook(메모·매물 스펙·장점)에 없는 가격·수익률·면적·층수·도보 분 등 숫자를 절대 추가하지 마십시오. FactBook에 있는 수치만 그대로 활용하십시오.",
      "[No-Solicitation] '원금 보장', '확정 수익', '100% 보장', '무조건 상승' 등 과장·단정 표현을 금지합니다.",
      "[No-Tautology] 단순 메모 번역 투('양호합니다. 문의 주세요.')를 피하고, FactBook의 입지·도로·임차·활용 근거와 매수자 실익을 자연스럽게 연결하십시오.",
      `[Tone-Temperature-Framing] 목표 거래 온도(${stance.label}): ${stance.dealCommentRule}`,
      "[Concise] 인사말이나 따옴표, 마크다운 기호 없이 추천 코멘트 본문 2문장(60~140자, 최대 150자)만 출력하십시오.",
    ],
    outputContract: "순수 한국어 추천 코멘트 문자열 (60~140자, 2문장, 따옴표나 마크다운 없이 본문만 반환)",
    situation: `뉴스레터 추천 매물 카드 하단 '중개사 한마디' 슬롯입니다. 이번 생성 강조 각도: [${angle.label}] — ${angle.instruction}\n거래 온도 지침([${stance.label}]): ${stance.dealCommentRule}`,
    knowledge: factBookContext,
    logicChain: [
      "FactBook에서 매물의 지역·가격대·유형·핵심 장점(있는 수치 포함)을 확인합니다.",
      `[${angle.label}] 각도로 첫 문장에 매물의 핵심 매력이나 희소성을 짚고, 둘째 문장에 매수자 실익(임차 안정·직접 입주·향후 활용)을 자연스럽게 연결합니다.`,
      "전문용어·미출처 숫자·금지어가 없는지 확인하고 60~140자 본문만 출력합니다.",
    ],
    examples: [
      "✅ (희소성): \"역삼역 도보 3분권에서 8m 코너를 낀 80~90억대 올근생은 최근 보기 드문 조건입니다. 전 층 공실 없이 운영 중이라 매수 직후 관리 부담이 적습니다.\"",
      "✅ (수익안정): \"1층 우량 근생 업종을 포함해 전 층 임대가 맞춰져 있어 월세 흐름이 탄탄합니다. 올리모델링까지 마친 건물이라 추가 수리 걱정 없이 운영하시기 좋습니다.\"",
      "✅ (사옥활용): \"대로변 간판 노출과 자주식 주차 여건이 돋보여 법인 사옥으로 첫손에 꼽을 만합니다. 상층부 즉시 입주가 가능해 이전 일정을 맞추기도 수월합니다.\"",
      "❌ (단순 번역 투): \"역삼동 코너 빌딩으로 접근성이 양호하며 안정적입니다. 많은 관심 부탁드립니다.\"",
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
  const defaultFallbackBullets = [
    `• ${regionLabel} 역세권 알짜 빌딩 중심 실수요 매수 문의 지속`,
    `• 세입자 계약 안정성과 대출 조건 병행 검토 흐름`,
    `• 입지·임대 현황 우수한 매물 우선 비교 점검 권장`,
  ].join("\n");
  const rawBriefingBody = cleanField(
    rawCandidate.briefingBody,
    500,
    defaultFallbackBullets,
    true,
  );
  const briefingBody =
    formatMarketBriefingThreeBullets(rawBriefingBody, MARKET_BRIEFING_LINE_MAX_CHARS) ||
    formatMarketBriefingThreeBullets(defaultFallbackBullets, MARKET_BRIEFING_LINE_MAX_CHARS);

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
  toneStance?: NewsletterToneStance;
}

/**
 * 1~3줄 거친 중개인 메모 → 일반 매수자·건물주 눈높이의 3줄 명사형 개조식(줄당 44자 이내) 순수 시장 브리핑 윤문 프롬프트
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
  const stanceKey = normalizeNewsletterToneStance(input.toneStance, "positive");
  const stance = TONE_STANCE_PROMPT_RULES[stanceKey];
  const draft = input.draftText.trim();
  const extraContext = input.contextText?.trim() ?? "";

  const factBookContext = [
    `목표 거래 온도: ${stance.label}`,
    draft ? `중개사 입력 초안(1~3줄 메모):\n${draft}` : "",
    extraContext && extraContext !== draft ? `참고 맥락(발행 호수·주력 권역·주요 이슈): ${extraContext}` : "",
    input.regionFocus ? `주력 권역: ${input.regionFocus.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const spec: TaskFlow8PromptSpec = {
    slotKey: "magazine_briefing_polish_tf8",
    version: "3.0",
    task: `중개사가 적은 짧은 메모를 바탕으로, 건물 매수자·건물주가 3초 만에 훑어보기 편한 ${cad.label} 3줄 명사형 개조식 시장 브리핑(각 줄 '• ' 시작 · 줄당 44자 이내 · 항목별 줄바꿈)으로 간결하게 다듬습니다.`,
    audience:
      "모바일로 소식지를 받아보는 빌딩 매수자·건물주. 한눈에 들어오는 쉬운 우리말과 명사형 종결('~지속', '~선호', '~점검 권장' 등)의 깔끔한 3줄 뷸렛 개조식을 선호합니다.",
    warnings: [
      ...COMMON_COPY_WARNINGS,
      "[70s-Buyer-Plain-Korean] '스프레드', '레버리지', '자기자본수익률', '밸류애드', '리파이낸싱' 등 어려운 금융·영문 전문용어를 쉬운 일상 우리말로 풀어쓰십시오.",
      "[Strict-3-Bullet-44-Char-Noun-Ending] 반드시 줄바꿈(\\n) 기준 정확히 3줄 개조식 뷸렛 목록으로만 출력하십시오. 각 줄은 '• '로 시작하고(앞에 '현장 분위기 :' 같은 라벨 금지), 서술형('~합니다/~입니다/~다') 대신 명사형('~지속', '~선호', '~완화', '~점검 권장' 등, 마침표 없음)으로 끝내며, 줄당 본문 길이는 44자 이내로 작성하십시오. 단, 줄 끝만 명사형으로 맺고 문장 중간의 조사('~을/를 위한', '~이/가 검증된')와 수치 앞 단위('평당', '감정가 대비', '연')는 생략하지 마십시오. '■ 소제목', 하이픈(-), 마크다운 강조(**), '감정평가 세금' 같은 어색한 축약어를 절대 넣지 마십시오.",
      `[Tone-Temperature-Framing] 현재 설정된 거래 온도는 [${stance.label}] 입니다. ${stance.briefingRule}`,
      `[Cadence-Consistency] ${cad.label} 뉴스레터이므로 '${cad.period}' 흐름에 자연스럽게 맞추십시오.`,
    ],
    outputContract:
      "소제목·따옴표·마크다운·앞 라벨 없이 '• 첫째 줄 명사형 요약\\n• 둘째 줄 명사형 요약\\n• 셋째 줄 명사형 요약' 형식의 3줄 개조식(줄당 44자 이내)만 출력.",
    situation: `${cad.label} 뉴스레터 상단 '시장 브리핑' 영역에 들어가는 중개인 3줄 개조식 브리핑입니다.`,
    knowledge: factBookContext || "상업용 빌딩 시장의 전반적인 매수·임대 흐름",
    logicChain: [
      "중개사 초안의 핵심 뜻(입지, 금리 분위기, 매수·세입자 흐름, 체크포인트)과 입력된 숫자만 그대로 추출합니다.",
      "줄바꿈(\\n)으로 나눈 정확히 3줄 '• 명사형 개조식'(줄당 본문 44자 이내, 마침표·앞 라벨 없음)으로 정리합니다.",
      "줄 수(3줄), 줄당 글자 수(<=44자), 명사형 종결, 미출처 숫자 0건, 소제목/마크다운 0건을 검증한 뒤 본문만 출력합니다.",
    ],
    fallbackRepair:
      "M11 핀포인트 윤문 교정: 미출처 숫자 제거 후 formatMarketBriefingThreeBullets(text, 44)로 3줄·줄당 44자 이내 명사형 개조식을 보장합니다.",
  };

  const { systemPrompt, userPrompt } = renderTf8Prompt(spec);
  return { spec, systemPrompt, userPrompt, factBookContext };
}

/**
 * M11 핀포인트 3줄·44자 명사형 개조식 시장 브리핑 윤문 교정기
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

  const normalized = formatMarketBriefingThreeBullets(
    repairedText,
    MARKET_BRIEFING_LINE_MAX_CHARS,
  );
  const fallbackPlain = formatMarketBriefingThreeBullets(
    sanitizeReaderText(inputContext),
    MARKET_BRIEFING_LINE_MAX_CHARS,
  );
  const finalComment = normalized || fallbackPlain;

  const output: MarketBriefingPolishOutput = {
    comment: finalComment,
  };

  const envelope = createSuccessEnvelope<MarketBriefingPolishOutput>(output, {
    warnings,
    protected_fields_detected: detected,
    boundary_note: "AI가 3줄·줄당 44자 이내 명사형 개조식으로 다듬은 시장 브리핑입니다.",
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

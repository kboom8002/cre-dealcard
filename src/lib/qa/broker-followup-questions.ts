/**
 * @file src/lib/qa/broker-followup-questions.ts
 * @description 중개인 감수 1차 피드백 기반 확인 질문(8문항) & 추가 질문(6문항) SSOT 및 단독 HTML 렌더러.
 *
 * - /qa-showcase?tab=questions 및 /qa-broker/showcase?tab=questions (React 패널)
 * - /qa-showcase/questions (단독 HTML 문서, 대상 이미지 + 즉시 피드백 서버 저장)
 * 양쪽 모두 동일한 SSOT와 동일한 qa-workbench 세션(qa-broker-questions-v1)을 공유합니다.
 */
import type { ShowcaseManifest } from "@/lib/qa/output-showcase-scenarios";

export const QA_BROKER_FOLLOWUP_WORKBENCH_ID =
  "qa-broker-followup-questions-v1" as const;
export const QA_BROKER_FOLLOWUP_SESSION_ID =
  "qa-broker-questions-v1" as const;

export type BrokerQuestionSection = "confirm" | "additional";

export interface BrokerSubQuestionOption {
  id: string;
  badge: string;
  label: string;
  recommended?: boolean;
}

export interface BrokerSubQuestion {
  id: string;
  prompt: string;
  options: BrokerSubQuestionOption[];
}

export interface BrokerQuestionVisualSpec {
  id: string;
  caption: string;
  badgeLabel: string;
  kind: "im_slide" | "og_card" | "diagram_svg";
  caseId?: string;
  slideIndex?: number | "last";
  staticUrl?: string;
  fallbackSvgDataUri: string;
  liveScenarioId?: string;
}

export interface BrokerFollowupQuestionSpec {
  id: string;
  numberLabel: string;
  section: BrokerQuestionSection;
  categoryTag: string;
  title: string;
  brokerQuoteTitle: string;
  brokerQuoteText: string;
  summaryQuestion: string;
  relatedScenarioIds: string[];
  visuals: BrokerQuestionVisualSpec[];
  subQuestions: BrokerSubQuestion[];
  notePlaceholder: string;
}

export interface BrokerQuestionAnswerRecord {
  status?: "PASS" | "PENDING";
  answers?: Record<string, string>;
  answerLabels?: Record<string, string>;
  note?: string;
  updatedAt?: string;
}

function encodeSvgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    svg.replace(/\s+/g, " ").trim()
  )}`;
}

function buildCardDiagramSvg(params: {
  headerBg: string;
  eyebrow: string;
  title: string;
  leftTitle: string;
  leftTone: "before" | "after" | "optionA" | "optionB";
  leftLines: string[];
  rightTitle: string;
  rightTone: "before" | "after" | "optionA" | "optionB";
  rightLines: string[];
  footerNote?: string;
}): string {
  const tonePalette = (tone: "before" | "after" | "optionA" | "optionB") => {
    if (tone === "before") {
      return { border: "#CBD5E1", bg: "#F8FAFC", title: "#475569" };
    }
    if (tone === "after") {
      return { border: "#059669", bg: "#ECFDF5", title: "#065F46" };
    }
    if (tone === "optionA") {
      return { border: "#4F46E5", bg: "#EEF2FF", title: "#312E81" };
    }
    return { border: "#0284C7", bg: "#F0F9FF", title: "#075985" };
  };
  const leftStyle = tonePalette(params.leftTone);
  const rightStyle = tonePalette(params.rightTone);
  const leftBorder = leftStyle.border;
  const leftBg = leftStyle.bg;
  const leftTitleColor = leftStyle.title;
  const rightBorder = rightStyle.border;
  const rightBg = rightStyle.bg;
  const rightTitleColor = rightStyle.title;

  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const renderLines = (lines: string[], x: number, startY: number, color: string) =>
    lines
      .slice(0, 6)
      .map(
        (line, i) =>
          `<text x="${x}" y="${startY + i * 44}" font-size="22" font-weight="600" fill="${color}" font-family="Pretendard, Malgun Gothic, Apple SD Gothic Neo, sans-serif">${esc(
            line
          )}</text>`
      )
      .join("");

  return encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="1200" height="675">
      <rect width="1200" height="675" rx="24" fill="#FFFFFF"/>
      <rect width="1200" height="122" rx="24" fill="${params.headerBg}"/>
      <rect y="98" width="1200" height="24" fill="${params.headerBg}"/>
      <text x="48" y="48" font-size="20" font-weight="700" fill="#E0E7FF" font-family="Pretendard, Malgun Gothic, sans-serif">${esc(
        params.eyebrow
      )}</text>
      <text x="48" y="92" font-size="31" font-weight="800" fill="#FFFFFF" font-family="Pretendard, Malgun Gothic, sans-serif">${esc(
        params.title
      )}</text>

      <rect x="44" y="154" width="536" height="432" rx="20" fill="${leftBg}" stroke="${leftBorder}" stroke-width="3"/>
      <text x="76" y="208" font-size="25" font-weight="800" fill="${leftTitleColor}" font-family="Pretendard, Malgun Gothic, sans-serif">${esc(
        params.leftTitle
      )}</text>
      <line x1="76" y1="228" x2="548" y2="228" stroke="${leftBorder}" stroke-width="2"/>
      ${renderLines(params.leftLines, 76, 276, "#1E293B")}

      <rect x="620" y="154" width="536" height="432" rx="20" fill="${rightBg}" stroke="${rightBorder}" stroke-width="3"/>
      <text x="652" y="208" font-size="25" font-weight="800" fill="${rightTitleColor}" font-family="Pretendard, Malgun Gothic, sans-serif">${esc(
        params.rightTitle
      )}</text>
      <line x1="652" y1="228" x2="1124" y2="228" stroke="${rightBorder}" stroke-width="2"/>
      ${renderLines(params.rightLines, 652, 276, "#0F172A")}

      ${
        params.footerNote
          ? `<text x="48" y="636" font-size="20" font-weight="700" fill="#475569" font-family="Pretendard, Malgun Gothic, sans-serif">${esc(
              params.footerNote
            )}</text>`
          : ""
      }
    </svg>
  `);
}

function buildColorIdentitySvg(): string {
  return encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="1200" height="675">
      <rect width="1200" height="675" rx="24" fill="#F8FAFC"/>
      <rect width="1200" height="116" rx="24" fill="#0F172A"/>
      <rect y="92" width="1200" height="24" fill="#0F172A"/>
      <text x="48" y="46" font-size="20" font-weight="700" fill="#94A3B8" font-family="Pretendard, Malgun Gothic, sans-serif">확인 질문 01 · 서비스별 대표 색상 시안</text>
      <text x="48" y="88" font-size="30" font-weight="800" fill="#FFFFFF" font-family="Pretendard, Malgun Gothic, sans-serif">4대 항목 아이덴티티 컬러칩 &amp; 뉴스레터 내부 배색 비교</text>

      <rect x="44" y="146" width="260" height="190" rx="18" fill="#ECFDF5" stroke="#059669" stroke-width="3"/>
      <rect x="68" y="170" width="88" height="34" rx="10" fill="#059669"/>
      <text x="86" y="194" font-size="18" font-weight="800" fill="#FFFFFF" font-family="Pretendard, Malgun Gothic, sans-serif">초록</text>
      <text x="68" y="246" font-size="27" font-weight="800" fill="#064E3B" font-family="Pretendard, Malgun Gothic, sans-serif">뉴스레터</text>
      <text x="68" y="286" font-size="20" font-weight="600" fill="#065F46" font-family="Pretendard, Malgun Gothic, sans-serif">차분한 에디토리얼 톤</text>

      <rect x="328" y="146" width="260" height="190" rx="18" fill="#FFFBEB" stroke="#D97706" stroke-width="3"/>
      <rect x="352" y="170" width="88" height="34" rx="10" fill="#D97706"/>
      <text x="370" y="194" font-size="18" font-weight="800" fill="#FFFFFF" font-family="Pretendard, Malgun Gothic, sans-serif">노랑</text>
      <text x="352" y="246" font-size="27" font-weight="800" fill="#78350F" font-family="Pretendard, Malgun Gothic, sans-serif">딜카드</text>
      <text x="352" y="286" font-size="20" font-weight="600" fill="#92400E" font-family="Pretendard, Malgun Gothic, sans-serif">핵심 매물 카톡 카드</text>

      <rect x="612" y="146" width="260" height="190" rx="18" fill="#EFF6FF" stroke="#1D4ED8" stroke-width="3"/>
      <rect x="636" y="170" width="88" height="34" rx="10" fill="#1D4ED8"/>
      <text x="654" y="194" font-size="18" font-weight="800" fill="#FFFFFF" font-family="Pretendard, Malgun Gothic, sans-serif">파랑</text>
      <text x="636" y="246" font-size="27" font-weight="800" fill="#1E3A8A" font-family="Pretendard, Malgun Gothic, sans-serif">상세 IM</text>
      <text x="636" y="286" font-size="20" font-weight="600" fill="#1E40AF" font-family="Pretendard, Malgun Gothic, sans-serif">신뢰감 있는 분석 보고서</text>

      <rect x="896" y="146" width="260" height="190" rx="18" fill="#FDF2F8" stroke="#DB2777" stroke-width="3"/>
      <rect x="920" y="170" width="88" height="34" rx="10" fill="#DB2777"/>
      <text x="938" y="194" font-size="18" font-weight="800" fill="#FFFFFF" font-family="Pretendard, Malgun Gothic, sans-serif">분홍</text>
      <text x="920" y="246" font-size="27" font-weight="800" fill="#831843" font-family="Pretendard, Malgun Gothic, sans-serif">고객 매칭</text>
      <text x="920" y="286" font-size="20" font-weight="600" fill="#9D174D" font-family="Pretendard, Malgun Gothic, sans-serif">관심 고객 소통·연결</text>

      <rect x="44" y="366" width="540" height="264" rx="18" fill="#FFFFFF" stroke="#059669" stroke-width="3"/>
      <text x="74" y="414" font-size="24" font-weight="800" fill="#065F46" font-family="Pretendard, Malgun Gothic, sans-serif">안 A · 뉴스레터 전체를 초록 단일톤 통일</text>
      <rect x="74" y="438" width="480" height="72" rx="12" fill="#ECFDF5"/>
      <text x="96" y="482" font-size="21" font-weight="700" fill="#064E3B" font-family="Pretendard, Malgun Gothic, sans-serif">시장 이슈도 초록 · 하단 추천매물도 초록 톤 유지</text>
      <text x="74" y="564" font-size="20" font-weight="600" fill="#475569" font-family="Pretendard, Malgun Gothic, sans-serif">장점: 알록달록하지 않고 신문처럼 차분한 인쇄물 느낌</text>

      <rect x="616" y="366" width="540" height="264" rx="18" fill="#FFFFFF" stroke="#D97706" stroke-width="3"/>
      <text x="646" y="414" font-size="24" font-weight="800" fill="#92400E" font-family="Pretendard, Malgun Gothic, sans-serif">안 B · 추천매물 영역만 딜카드 노랑 포인트</text>
      <rect x="646" y="438" width="232" height="72" rx="12" fill="#ECFDF5"/>
      <text x="668" y="482" font-size="20" font-weight="700" fill="#064E3B" font-family="Pretendard, Malgun Gothic, sans-serif">본문 이슈: 초록</text>
      <rect x="894" y="438" width="232" height="72" rx="12" fill="#FFFBEB" stroke="#F59E0B" stroke-width="2"/>
      <text x="914" y="482" font-size="20" font-weight="700" fill="#92400E" font-family="Pretendard, Malgun Gothic, sans-serif">추천 매물: 노랑</text>
      <text x="646" y="564" font-size="20" font-weight="600" fill="#475569" font-family="Pretendard, Malgun Gothic, sans-serif">장점: 뉴스 기사와 매물 카드가 색깔로 즉시 구분됨</text>
    </svg>
  `);
}

function buildLocationFourGradesSvg(): string {
  return encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="1200" height="675">
      <rect width="1200" height="675" rx="24" fill="#FFFFFF"/>
      <rect width="1200" height="116" rx="24" fill="#1E3A8A"/>
      <rect y="92" width="1200" height="24" fill="#1E3A8A"/>
      <text x="48" y="46" font-size="20" font-weight="700" fill="#BFDBFE" font-family="Pretendard, Malgun Gothic, sans-serif">확인 질문 07 · IM 4페이지 입지 요약 개편 시안</text>
      <text x="48" y="88" font-size="30" font-weight="800" fill="#FFFFFF" font-family="Pretendard, Malgun Gothic, sans-serif">2×2 입지 4대 등급 카드 &amp; 최하 단계('열악' vs '보완 필요') 비교</text>

      <rect x="48" y="150" width="532" height="190" rx="18" fill="#ECFDF5" stroke="#10B981" stroke-width="3"/>
      <text x="80" y="202" font-size="24" font-weight="800" fill="#065F46" font-family="Pretendard, Malgun Gothic, sans-serif">① 도보 접근성</text>
      <rect x="442" y="170" width="108" height="44" rx="12" fill="#059669"/>
      <text x="472" y="200" font-size="24" font-weight="800" fill="#FFFFFF" font-family="Pretendard, Malgun Gothic, sans-serif">우수</text>
      <text x="80" y="262" font-size="22" font-weight="700" fill="#0F172A" font-family="Pretendard, Malgun Gothic, sans-serif">홍대입구역 8번 출구 도보 3분 (210m)</text>
      <text x="80" y="304" font-size="19" font-weight="600" fill="#475569" font-family="Pretendard, Malgun Gothic, sans-serif">평지 동선 · 트리플 환승 역세권</text>

      <rect x="620" y="150" width="532" height="190" rx="18" fill="#EFF6FF" stroke="#3B82F6" stroke-width="3"/>
      <text x="652" y="202" font-size="24" font-weight="800" fill="#1E40AF" font-family="Pretendard, Malgun Gothic, sans-serif">② 광역 접근성</text>
      <rect x="1014" y="170" width="108" height="44" rx="12" fill="#2563EB"/>
      <text x="1044" y="200" font-size="24" font-weight="800" fill="#FFFFFF" font-family="Pretendard, Malgun Gothic, sans-serif">양호</text>
      <text x="652" y="262" font-size="22" font-weight="700" fill="#0F172A" font-family="Pretendard, Malgun Gothic, sans-serif">양화로·강변북로 진입 차량 6분</text>
      <text x="652" y="304" font-size="19" font-weight="600" fill="#475569" font-family="Pretendard, Malgun Gothic, sans-serif">여의도·광화문·공항철도 직결</text>

      <rect x="48" y="366" width="532" height="190" rx="18" fill="#ECFDF5" stroke="#10B981" stroke-width="3"/>
      <text x="80" y="418" font-size="24" font-weight="800" fill="#065F46" font-family="Pretendard, Malgun Gothic, sans-serif">③ 상권 활성화</text>
      <rect x="442" y="386" width="108" height="44" rx="12" fill="#059669"/>
      <text x="472" y="416" font-size="24" font-weight="800" fill="#FFFFFF" font-family="Pretendard, Malgun Gothic, sans-serif">우수</text>
      <text x="80" y="478" font-size="22" font-weight="700" fill="#0F172A" font-family="Pretendard, Malgun Gothic, sans-serif">연트럴파크·동교 핵심 리테일 상권</text>
      <text x="80" y="520" font-size="19" font-weight="600" fill="#475569" font-family="Pretendard, Malgun Gothic, sans-serif">주 7일 유동인구 풍부 · 공실 위험 낮음</text>

      <rect x="620" y="366" width="532" height="190" rx="18" fill="#FEFCE8" stroke="#EAB308" stroke-width="3"/>
      <text x="652" y="418" font-size="24" font-weight="800" fill="#854D0E" font-family="Pretendard, Malgun Gothic, sans-serif">④ 편의시설 (최하 단계 문구 확인)</text>
      <rect x="974" y="386" width="148" height="44" rx="12" fill="#CA8A04"/>
      <text x="996" y="416" font-size="22" font-weight="800" fill="#FFFFFF" font-family="Pretendard, Malgun Gothic, sans-serif">보통 / 열악?</text>
      <text x="652" y="478" font-size="21" font-weight="700" fill="#0F172A" font-family="Pretendard, Malgun Gothic, sans-serif">원안: 우수 · 양호 · 보통 · 열악</text>
      <text x="652" y="520" font-size="20" font-weight="700" fill="#B45309" font-family="Pretendard, Malgun Gothic, sans-serif">순화안: 우수 · 양호 · 보통 · 보완 필요</text>

      <text x="48" y="624" font-size="20" font-weight="700" fill="#334155" font-family="Pretendard, Malgun Gothic, sans-serif">※ 시스템 1차 자동 판정 후 중개사님이 현장 감각에 맞게 클릭 한 번으로 수정 가능하게 설계</text>
    </svg>
  `);
}

function buildFallbackSlideSvg(caseId: string, slideTitle: string, detail: string): string {
  return buildCardDiagramSvg({
    headerBg: "#1E293B",
    eyebrow: `${caseId} · 대상 산출물 화면`,
    title: slideTitle,
    leftTitle: "검수 대상 포인트",
    leftTone: "before",
    leftLines: [detail, "실물 쇼룸 매니페스트 연결 시", "실제 렌더링 슬라이드 이미지가 자동 표시됩니다."],
    rightTitle: "확인 방법",
    rightTone: "after",
    rightLines: [
      "상단 산출물 바로보기 버튼을 누르면",
      "해당 시나리오 전체 화면을 즉시 대조하실 수 있습니다.",
    ],
  });
}

export const BROKER_FOLLOWUP_QUESTIONS_14: ReadonlyArray<BrokerFollowupQuestionSpec> = [
  // ══════════════════════════════════════════════════════════════════════════
  // 5.1 [확인 질문] 남겨주신 의견의 세부 기준 확정용 (8문항: Q1 ~ Q8)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "Q1",
    numberLabel: "확인 질문 01",
    section: "confirm",
    categoryTag: "공통 · 브랜드 컬러",
    title: "항목별 대표 아이덴티티 색상 확정 및 뉴스레터 내부 배색 방식",
    brokerQuoteTitle: "NL-D1 중개인 원문 의견",
    brokerQuoteText:
      "색상별로 아이덴티티가 있는게 좋겠음 (예: 뉴스레터-초록 / 딜카드-노랑 / IM-파랑 / 매칭-분홍)",
    summaryQuestion:
      "제안해주신 4대 대표 색상으로 바로 확정할지, 그리고 뉴스레터 안에 '추천 매물'이 들어갈 때 초록으로 통일할지 노랑 포인트를 줄지 확인 부탁드립니다.",
    relatedScenarioIds: ["NL-D1", "DC-01", "IM-01"],
    visuals: [
      {
        id: "Q1-V1",
        caption: "시안 대조: 4대 항목 대표 컬러칩 & 뉴스레터 내부 추천매물 배색(안 A vs 안 B)",
        badgeLabel: "배색 비교 시안",
        kind: "diagram_svg",
        fallbackSvgDataUri: buildColorIdentitySvg(),
      },
      {
        id: "Q1-V2",
        caption: "대상 산출물: 일간 뉴스레터 카톡 공유 카드 (NL-D1)",
        badgeLabel: "NL-D1 실물 카드",
        kind: "og_card",
        caseId: "NL-D1",
        liveScenarioId: "NL-D1",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "NL-D1",
          "일간 뉴스레터 표준형 (NL-D1)",
          "시장 온도 + 이슈 2건 + 하단 추천 매물 카드 구성"
        ),
      },
    ],
    subQuestions: [
      {
        id: "Q1_1",
        prompt: "확인 1-1. 네 가지 대표 색상 조합을 어떻게 확정할까요?",
        options: [
          {
            id: "A",
            badge: "권장 A",
            label:
              "말씀하신 4색 그대로 확정 (뉴스레터=초록 · 딜카드=노랑/골드 · IM=파랑/네이비 · 매칭=분홍)",
            recommended: true,
          },
          {
            id: "B",
            badge: "선택 B",
            label:
              "구분 구조는 유지하되 조금 더 중후한 어두운 톤(짙은 청록·골드·네이비·와인)으로 톤다운",
          },
          {
            id: "C",
            badge: "선택 C",
            label: "따로 선호하는 색상 조합이 있음 (아래 메모란에 기재)",
          },
        ],
      },
      {
        id: "Q1_2",
        prompt:
          "확인 1-2. 뉴스레터 한 페이지 안에 '추천 매물'이 함께 실릴 때 색상은 어느 쪽이 좋을까요?",
        options: [
          {
            id: "A",
            badge: "안 A",
            label:
              "페이지 전체를 뉴스레터 색상(초록 계열) 하나로 차분하게 통일",
            recommended: true,
          },
          {
            id: "B",
            badge: "안 B",
            label:
              "하단 추천 매물 카드 영역만 딜카드 색상(노랑/골드 계열)으로 포인트를 줌",
          },
        ],
      },
    ],
    notePlaceholder:
      "예: 초록은 너무 형광빛 말고 짙은 청록색 느낌이면 좋겠습니다 등 편하게 적어 주세요.",
  },

  {
    id: "Q2",
    numberLabel: "확인 질문 02",
    section: "confirm",
    categoryTag: "뉴스레터 · 추천물건",
    title: "뉴스레터 하단 추천물건 카드를 '딜카드 카톡 공유 카드' 수준으로 간소화",
    brokerQuoteTitle: "DC-01 중개인 원문 의견",
    brokerQuoteText: "추천물건도 딜카드 카톡 OG 정도만 보여주기",
    summaryQuestion:
      "뉴스레터 하단 추천 매물을 긴 설명 대신 핵심 4가지(지역·용도·면적·금액대)와 한 줄 특징만 보이게 줄이고, 누르면 딜카드 상세 화면으로 넘어가게 구성하면 의도와 맞으실까요?",
    relatedScenarioIds: ["DC-01", "NL-D1"],
    visuals: [
      {
        id: "Q2-V1",
        caption: "기준 실물 화면: 딜카드 카톡 공유 카드 (DC-01 마포 동교동 근생)",
        badgeLabel: "DC-01 카톡 공유 카드",
        kind: "og_card",
        caseId: "DC-01",
        staticUrl: "/api/og/deal/5c0ca5e0-0001-4000-8000-000000000001/kakao-v2",
        liveScenarioId: "DC-01",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "DC-01",
          "딜카드 카톡 공유 카드 (DC-01)",
          "마포 동교동 · 근린생활시설 · 연면적 129평 · 70억대"
        ),
      },
      {
        id: "Q2-V2",
        caption: "개편 비교: 뉴스레터 하단 긴 매물 카드 → 핵심 4항목 미니카드 + 딜카드 연결",
        badgeLabel: "Before → After 시안",
        kind: "diagram_svg",
        fallbackSvgDataUri: buildCardDiagramSvg({
          headerBg: "#065F46",
          eyebrow: "확인 질문 02 · 뉴스레터 하단 추천매물 다이어트",
          title: "긴 매물 설명 카드 → 딜카드 요약형 미니카드 전환",
          leftTitle: "기존 화면 (정보 과밀)",
          leftTone: "before",
          leftLines: [
            "• 큰 사진 + 긴 투자 설명문 + 세부 제원 다수 노출",
            "• 뉴스레터 본문보다 매물 카드가 더 길어 보임",
            "• 독자가 스크롤 피로를 느낌",
          ],
          rightTitle: "개편 시안 (카톡 공유 카드급 요약)",
          rightTone: "after",
          rightLines: [
            "• 썸네일 + 핵심 4항목 (마포 동교동 · 근생 · 연 129평 · 70억대)",
            "• 한 줄 핵심 특징만 깔끔하게 표기",
            "• 카드 터치 시 → 딜카드 상세 화면으로 즉시 이동",
          ],
          footerNote: "고객이 관심 있을 때만 눌러서 딜카드 상세를 보도록 동선 단순화",
        }),
      },
    ],
    subQuestions: [
      {
        id: "Q2_1",
        prompt: "확인 2. 뉴스레터 내 추천 매물 카드 구성 방식을 선택해 주세요.",
        options: [
          {
            id: "A",
            badge: "권장 A",
            label:
              "핵심 4가지(지역·용도·면적·금액대) + 한 줄 특징만 미니카드로 보여주고, 누르면 딜카드 상세로 이동",
            recommended: true,
          },
          {
            id: "B",
            badge: "선택 B",
            label:
              "딜카드 카톡 공유 카드 이미지 그대로만 1장 보여주고 누르면 딜카드 상세로 이동",
          },
          {
            id: "C",
            badge: "선택 C",
            label:
              "미니카드로 줄이되 대표 수익률(예: 연 4.1%) 숫자 하나는 카드 겉면에 함께 표시",
          },
        ],
      },
    ],
    notePlaceholder: "추천 매물 카드에 꼭 남기거나 빼고 싶은 항목이 있으면 적어 주세요.",
  },

  {
    id: "Q3",
    numberLabel: "확인 질문 03",
    section: "confirm",
    categoryTag: "뉴스레터 · 이슈·구독창",
    title: "이슈 카드 출처 표기 방식 및 기구독자 발송 링크 하단 처리",
    brokerQuoteTitle: "NL-D1 중개인 원문 의견 (즉시 수정 반영 + 세부 확인)",
    brokerQuoteText:
      "호재/중립 배지 빼고 거기에 작은 글씨로 출처 표기 · AI 티 나는 문구 빼기 · 구독자한테는 뉴스레터 신청란 안 나오게",
    summaryQuestion:
      "AI 문구와 호재/중립 배지 제거, 기구독자 신청창 숨김은 즉시 반영했습니다. 출처 표기 수준과 '지인 공유 버튼' 유지 여부만 확인 부탁드립니다.",
    relatedScenarioIds: ["NL-D1", "NL-W1"],
    visuals: [
      {
        id: "Q3-V1",
        caption: "반영 화면 도해: 우측 상단 실제 기관·언론사 출처 표기 & 기구독자 하단 화면",
        badgeLabel: "개편 구조 도해",
        kind: "diagram_svg",
        fallbackSvgDataUri: buildCardDiagramSvg({
          headerBg: "#0F766E",
          eyebrow: "확인 질문 03 · AI 냄새 제거 & 기구독자 깔끔한 하단",
          title: "이슈 카드 원문 출처 표기 & 구독자 전용 링크 화면",
          leftTitle: "확인 3-1 · 이슈 카드 우측 상단 출처",
          leftTone: "optionA",
          leftLines: [
            "• 'AI 클러스터링 종합' 문구 완전 삭제 완료",
            "• 호재/중립 배지 및 좌측 장식 그라데이션 제거 완료",
            "• 우측 상단에 '국토교통부', '한국경제' 등 원문 출처만 표기",
          ],
          rightTitle: "확인 3-2 · 기구독자 발송 링크 하단",
          rightTone: "optionB",
          rightLines: [
            "• 구독자 전용 링크(?sid=) 열람 시 구독 신청창 자동 숨김",
            "• 안 A: 작은 '지인에게 뉴스레터 공유하기' 버튼 1개만 유지",
            "• 안 B: 공유 버튼도 없이 중개사 연락처에서 바로 종료",
          ],
        }),
      },
      {
        id: "Q3-V2",
        caption: "대상 산출물: 일간 뉴스레터 카드 (NL-D1)",
        badgeLabel: "NL-D1 실물 카드",
        kind: "og_card",
        caseId: "NL-D1",
        liveScenarioId: "NL-D1",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "NL-D1",
          "일간 뉴스레터 (NL-D1)",
          "우측 상단 원문 출처 표기 및 기구독자 구독창 자동 숨김 반영"
        ),
      },
    ],
    subQuestions: [
      {
        id: "Q3_1",
        prompt: "확인 3-1. 이슈 카드 우측 상단 출처는 어떻게 표기할까요?",
        options: [
          {
            id: "A",
            badge: "권장 A",
            label:
              "'국토교통부', '한국경제' 등 실제 원문 기관·언론사명만 간결하게 표기",
            recommended: true,
          },
          {
            id: "B",
            badge: "선택 B",
            label: "언론사명 옆에 날짜까지 함께 표기 (예: 한국경제 · 10.21)",
          },
          {
            id: "C",
            badge: "선택 C",
            label: "출처 표기도 모두 생략하고 기사 제목·본문만 표시",
          },
        ],
      },
      {
        id: "Q3_2",
        prompt:
          "확인 3-2. 이미 구독 중인 고객 링크 맨 아래에 '지인에게 공유하기' 작은 버튼을 둘까요?",
        options: [
          {
            id: "A",
            badge: "권장 A",
            label:
              "네, 신청 입력창은 숨기되 지인 카톡 전달용 작은 '공유하기' 버튼 하나만 유지",
            recommended: true,
          },
          {
            id: "B",
            badge: "선택 B",
            label:
              "아니요, 공유 버튼도 없이 중개사 성함·전화번호에서 깔끔하게 끝내기",
          },
        ],
      },
    ],
    notePlaceholder: "출처 표기나 구독자 하단 영역에 대한 추가 의견이 있으시면 적어 주세요.",
  },

  {
    id: "Q4",
    numberLabel: "확인 질문 04",
    section: "confirm",
    categoryTag: "뉴스레터·IM · 중개사·면책",
    title: "중개사 프로필 간소화 및 공인중개사법 표시의무·면책 최소 보호선 확인",
    brokerQuoteTitle: "NL-D1 & IM-01 9페이지 중개인 원문 의견",
    brokerQuoteText:
      "중개사는 간단하게 이름과 연락처만(누르면 전화 걸리게), 주의사항 빼기 / IM 9페이지 데이터 출처 표기·면책 조항 빼기",
    summaryQuestion:
      "본문에는 성함·전화걸기만 남기고 큰 면책 박스는 모두 삭제했습니다. 과태료·분쟁 예방용으로 맨 끝 바닥글에만 작은 접힘 안내(뉴스레터) 및 1줄 안내(IM 9p)를 두는 권장안이 괜찮으신지 확인 부탁드립니다.",
    relatedScenarioIds: ["IM-01", "NL-D1"],
    visuals: [
      {
        id: "Q4-V1",
        caption: "대상 슬라이드: IM 마지막 페이지 (IM-01 슬라이드 09 — 진행절차·담당중개사)",
        badgeLabel: "IM-01 마지막 슬라이드",
        kind: "im_slide",
        caseId: "IM-01",
        slideIndex: "last",
        liveScenarioId: "IM-01",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "IM-01",
          "IM 마지막 페이지 (진행 절차 및 문의)",
          "데이터 출처 표기·대형 면책 박스 삭제 후 담당 중개사 전체폭 카드 + 하단 8pt 1줄 안내만 유지"
        ),
      },
      {
        id: "Q4-V2",
        caption: "반영 구조: 본문 [성함 + 바로 전화걸기] + 바닥글 접힘 메뉴 법적 보호선",
        badgeLabel: "법적 보호 절충안",
        kind: "diagram_svg",
        fallbackSvgDataUri: buildCardDiagramSvg({
          headerBg: "#1E293B",
          eyebrow: "확인 질문 04 · 깔끔한 디자인 + 중개사 법적 보호 양립",
          title: "본문은 성함·전화번호만 노출 · 법정 표시는 바닥글 접힘 처리",
          leftTitle: "뉴스레터 하단 반영 구조",
          leftTone: "after",
          leftLines: [
            "• 본문 프로필: [이상은 대표중개사 | 📞 010-XXXX-XXXX 전화걸기]",
            "• 강남서초 등 지역 배지 및 긴 소개글 제거 완료",
            "• 맨 끝 바닥글: '중개사무소 법정 등록정보 및 유의사항 ▾' (접힘 상태)",
          ],
          rightTitle: "IM 마지막 페이지 반영 구조",
          rightTone: "optionB",
          rightLines: [
            "• '데이터 출처 표기' 및 '● 중개인입력' 라벨 완전 삭제",
            "• 큰 회색 '면책 조항' 박스 및 하단 장식 바 삭제",
            "• 맨 아래 8pt 회색 1줄 참고 안내만 남겨 중개사 분쟁 리스크 방어",
          ],
          footerNote: "※ 매물 광고 표시의무 미기재 시 과태료 위험을 막는 최소 안전장치입니다.",
        }),
      },
    ],
    subQuestions: [
      {
        id: "Q4_1",
        prompt: "확인 4. 중개사 표시 및 바닥글 최소 보호 문구 운영 방식을 선택해 주세요.",
        options: [
          {
            id: "A",
            badge: "권장 A",
            label:
              "현재 반영된 권장안 그대로 유지 (본문은 성함·전화걸기만, 맨 끝 접힘 바닥글·1줄 안내로 법적 보호)",
            recommended: true,
          },
          {
            id: "B",
            badge: "선택 B",
            label:
              "매물이 실리지 않는 순수 뉴스레터에서는 바닥글 접힘 메뉴도 아예 숨김",
          },
          {
            id: "C",
            badge: "선택 C",
            label: "1줄 안내 문구를 직접 지정하고 싶음 (아래 메모란에 기재)",
          },
        ],
      },
    ],
    notePlaceholder: "원하시는 1줄 안내 문구나 프로필 표기 방식이 있으시면 적어 주세요.",
  },

  {
    id: "Q5",
    numberLabel: "확인 질문 05",
    section: "confirm",
    categoryTag: "딜카드 · 장점 3줄",
    title: "딜카드 '장점 3줄'의 양호한 수익률 기준선 및 현장 장점 원클릭 태그칩",
    brokerQuoteTitle: "DC-01 중개인 원문 의견",
    brokerQuoteText:
      "장점 3줄에 '대지 41평 연 129평'은 장점이 아님 — 디자인 우수한 외관, 양호한 수익률 같은 실제 장점을 적어야 함",
    summaryQuestion:
      "단순 면적 반복은 차단하겠습니다. 몇 % 이상일 때 '양호한 수익률'로 강조할지, 그리고 외관·올수리 같은 현장 장점을 버튼으로 고르는 태그 모음이 편하실지 확인 부탁드립니다.",
    relatedScenarioIds: ["DC-01", "DC-02", "DC-03"],
    visuals: [
      {
        id: "Q5-V1",
        caption: "대상 산출물: 딜카드 대표 화면 (DC-01 마포 동교동 근생)",
        badgeLabel: "DC-01 카톡 공유 카드",
        kind: "og_card",
        caseId: "DC-01",
        staticUrl: "/api/og/deal/5c0ca5e0-0001-4000-8000-000000000001/kakao-v2",
        liveScenarioId: "DC-01",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "DC-01",
          "딜카드 (DC-01 마포 동교동)",
          "상단 제원 요약과 본문 '장점 3줄' 중복 제거 대상"
        ),
      },
      {
        id: "Q5-V2",
        caption: "개편 시안: 면적 중복 없는 '진짜 장점 3줄' & 중개사 원클릭 추천 태그칩",
        badgeLabel: "장점 3줄 개편안",
        kind: "diagram_svg",
        fallbackSvgDataUri: buildCardDiagramSvg({
          headerBg: "#B45309",
          eyebrow: "확인 질문 05 · 딜카드 '장점 3줄' 품질 고도화",
          title: "단순 면적 복붙 차단 + 현장 매력 포인트 원클릭 선택",
          leftTitle: "개선된 장점 3줄 예시",
          leftTone: "after",
          leftLines: [
            "✔ 홍대입구역 도보 3분 코너 · 가시성 뛰어난 트리플 역세권",
            "✔ 노출콘크리트 디자인 외관 및 엘리베이터 완비 우수 컨디션",
            "✔ 전 층 우량 임차인 만실 운영 중 · 연 4.1% 안정적 임대수익",
          ],
          rightTitle: "편집 화면 원클릭 현장 장점 태그칩 시안",
          rightTone: "optionB",
          rightLines: [
            "[+ 디자인 우수한 외관]  [+ 내부 최근 올수리]",
            "[+ 코너 가시성 우수]    [+ 정방형 반듯한 대지]",
            "[+ 승강기 완비]        [+ 자주식 여유 주차]",
            "→ 중개사님이 톡톡 누르면 장점 3줄에 즉시 반영",
          ],
        }),
      },
    ],
    subQuestions: [
      {
        id: "Q5_1",
        prompt:
          "확인 5-1. 임대수익률이 최소 몇 % 이상일 때 '양호한 수익률'이라고 장점으로 내세울까요?",
        options: [
          {
            id: "A",
            badge: "권장 A",
            label:
              "권역 차등 적용 — 서울 3.5% 이상 / 수도권·지방 4.5% 이상일 때 강조",
            recommended: true,
          },
          {
            id: "B",
            badge: "선택 B",
            label: "지역 구분 없이 연 4.0% 이상일 때만 '양호한 수익률' 강조",
          },
          {
            id: "C",
            badge: "선택 C",
            label: "한국은행 기준금리보다 높은 수익률일 때 강조 (그 외엔 시세·입지 장점 우선)",
          },
        ],
      },
      {
        id: "Q5_2",
        prompt:
          "확인 5-2. 서류에 안 나오는 현장 장점('외관 우수', '올수리' 등)은 어떻게 입력하는 게 편하실까요?",
        options: [
          {
            id: "A",
            badge: "권장 A",
            label:
              "추천 장점 태그 버튼 모음을 제공해 클릭으로 고르고, 직접 수정도 가능하게 구성",
            recommended: true,
          },
          {
            id: "B",
            badge: "선택 B",
            label: "태그 버튼 없이 중개사가 직접 3줄 텍스트를 타이핑하는 방식 선호",
          },
        ],
      },
    ],
    notePlaceholder:
      "자주 쓰시는 현장 장점 표현(예: 전면 넓음, 명도 용이 등)이 있으시면 알려주세요.",
  },

  {
    id: "Q6",
    numberLabel: "확인 질문 06",
    section: "confirm",
    categoryTag: "IM 1·6페이지 · 표지·렌트롤",
    title: "IM 표지 '무명 건물' 제목 표기법 및 6페이지 렌트롤 표의 층 정렬 순서",
    brokerQuoteTitle: "IM-01 1페이지 & 6페이지 중개인 원문 의견",
    brokerQuoteText:
      "1페이지 제목을 '동교동 THE PARK 빌딩 (근생, 77억)' 형태로 / 6페이지 건물 그림(왜곡됨) 빼고 표만 전체 폭으로 깔끔하게",
    summaryQuestion:
      "건물 이름이 없는 꼬마빌딩의 표지 제목 표기법과, 6페이지 건물 그림을 뺀 뒤 렌트롤 표의 층 나열 순서를 어느 기준으로 맞출지 선택 부탁드립니다.",
    relatedScenarioIds: ["IM-01", "IM-02", "IM-06"],
    visuals: [
      {
        id: "Q6-V1",
        caption: "대상 슬라이드 1: IM 1페이지 표지 (IM-01 슬라이드 01)",
        badgeLabel: "IM-01 슬라이드 01",
        kind: "im_slide",
        caseId: "IM-01",
        slideIndex: 0,
        liveScenarioId: "IM-01",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "IM-01",
          "IM 1페이지 표지 (슬라이드 01)",
          "표준안: 동교동 THE PARK 빌딩 (근생, 77억) / 무명 건물 표기 규칙 확인"
        ),
      },
      {
        id: "Q6-V2",
        caption: "대상 슬라이드 2: IM 6페이지 임대차 현황 렌트롤 (IM-01 슬라이드 06)",
        badgeLabel: "IM-01 슬라이드 06",
        kind: "im_slide",
        caseId: "IM-01",
        slideIndex: 5,
        liveScenarioId: "IM-01",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "IM-01",
          "IM 6페이지 임대차 현황 (슬라이드 06)",
          "우측 스태킹 도식 제거 → 전체 폭 단일 렌트롤 표 전환 시 층 나열 순서 확인"
        ),
      },
    ],
    subQuestions: [
      {
        id: "Q6_1",
        prompt:
          "확인 6-1. 건축물대장상 건물 이름이 없는 '무명 빌딩'은 표지 제목을 어떻게 적을까요?",
        options: [
          {
            id: "A",
            badge: "권장 A",
            label: "'동교동 근생 빌딩 (77억)' — 법정동 + 주용도 빌딩 (매매가)",
            recommended: true,
          },
          {
            id: "B",
            badge: "선택 B",
            label: "'동교동 꼬마빌딩 (근생, 77억)' — 꼬마빌딩 명칭 사용",
          },
          {
            id: "C",
            badge: "선택 C",
            label: "'동교동 양화로 빌딩 (근생, 77억)' — 법정동 + 도로명 빌딩 (용도, 매매가)",
          },
        ],
      },
      {
        id: "Q6_2",
        prompt:
          "확인 6-2. 6페이지 건물 그림 제거 후 전체 폭 렌트롤 표의 층 순서는 어떻게 정렬할까요?",
        options: [
          {
            id: "A",
            badge: "권장 A",
            label:
              "실제 건물 위에서 아래 순서대로 '지상 최고층(4F) → 1층(1F) → 지하층(B1·B2)' 정렬",
            recommended: true,
          },
          {
            id: "B",
            badge: "선택 B",
            label: "핵심 상가부터 보이게 '1층(1F) → 지상층(2F~4F) → 지하층(B1·B2)' 정렬",
          },
          {
            id: "C",
            badge: "선택 C",
            label: "아래에서 위로 '지하층(B2) → 1층(1F) → 지상 최고층(4F)' 정렬",
          },
        ],
      },
    ],
    notePlaceholder:
      "15층 이상 대형 오피스(Pro IM)에서도 건물 층별 그림을 뺄지 등 추가 의견을 적어 주세요.",
  },

  {
    id: "Q7",
    numberLabel: "확인 질문 07",
    section: "confirm",
    categoryTag: "IM 4페이지 · 입지 등급",
    title: "IM 4페이지 입지 요약 4대 등급('우수·양호·보통·열악') 운영 및 표현 수위",
    brokerQuoteTitle: "IM-01 4페이지 중개인 원문 의견",
    brokerQuoteText:
      "입지요약 4개(도보접근성, 광역접근성, 상권활성화, 편의시설)를 직관적으로 우수 - 양호 - 보통 - 열악 4단계로 표시",
    summaryQuestion:
      "4대 입지 등급 카드로 개편할 때 시스템 자동 판정 후 중개사 수동 변경을 지원할지, 그리고 매수 고객용 문서에 '열악' 단어를 그대로 쓸지 순화할지 확인 부탁드립니다.",
    relatedScenarioIds: ["IM-01"],
    visuals: [
      {
        id: "Q7-V1",
        caption: "현재 슬라이드: IM 4페이지 입지 및 상권 분석 (IM-01 슬라이드 04)",
        badgeLabel: "IM-01 슬라이드 04",
        kind: "im_slide",
        caseId: "IM-01",
        slideIndex: 3,
        liveScenarioId: "IM-01",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "IM-01",
          "현재 IM 4페이지 입지 및 상권 분석",
          "우측 입지 요약 영역을 4대 항목 등급 카드로 직관화 예정"
        ),
      },
      {
        id: "Q7-V2",
        caption: "개편 시안: 2×2 입지 4대 등급 카드 및 최하 단계 문구('열악' vs '보완 필요')",
        badgeLabel: "4대 등급 카드 시안",
        kind: "diagram_svg",
        fallbackSvgDataUri: buildLocationFourGradesSvg(),
      },
    ],
    subQuestions: [
      {
        id: "Q7_1",
        prompt: "확인 7-1. 4개 입지 등급 산정 및 수정 방식은 어떻게 할까요?",
        options: [
          {
            id: "A",
            badge: "권장 A",
            label:
              "역 거리·도로·상권 데이터로 1차 자동 등급을 매기고, 중개사가 클릭으로 직접 수정 가능하게 제공",
            recommended: true,
          },
          {
            id: "B",
            badge: "선택 B",
            label: "자동 산정 없이 중개사가 매물마다 4개 등급을 직접 선택",
          },
        ],
      },
      {
        id: "Q7_2",
        prompt:
          "확인 7-2. 고객에게 나가는 IM에 최하 등급 단어를 어떻게 표기하는 것이 좋을까요?",
        options: [
          {
            id: "A",
            badge: "순화안 A",
            label:
              "매도인·매수인 거부감을 줄이도록 '우수 - 양호 - 보통 - 보완 필요(또는 다소 아쉬움)'로 순화",
            recommended: true,
          },
          {
            id: "B",
            badge: "원안 B",
            label: "명확하고 직관적인 전달을 위해 '우수 - 양호 - 보통 - 열악' 그대로 표기",
          },
        ],
      },
    ],
    notePlaceholder: "선호하시는 등급 단어(예: 미흡, 보통 이하 등)가 있으시면 적어 주세요.",
  },

  {
    id: "Q8",
    numberLabel: "확인 질문 08",
    section: "confirm",
    categoryTag: "IM 5·7페이지 · 토지·지가차트",
    title: "IM 5페이지 토지이음 도면 구현 방식 및 7페이지 한국부동산원 지가변동률 차트 구성",
    brokerQuoteTitle: "IM-01 5페이지 & 7페이지 중개인 원문 의견",
    brokerQuoteText:
      "5페이지는 토지이음의 이음지도 활용 / 7페이지 공시지가 비교(3.22배)는 의미 없으므로 빼고 한국부동산원 지가변동률 그래프 넣기",
    summaryQuestion:
      "5페이지는 상가 상호명을 뺀 용도지역·지적도 중첩 도면 자동 생성 + 캡처 업로드를 함께 지원하고, 7페이지는 공시지가 비교를 빼고 지가변동률 그래프로 바꿀 때 하단 '합산 기대수익률' 바 유지 여부를 선택해 주세요.",
    relatedScenarioIds: ["IM-01"],
    visuals: [
      {
        id: "Q8-V1",
        caption: "대상 슬라이드 1: IM 5페이지 토지 정보 및 지적도 (IM-01 슬라이드 05)",
        badgeLabel: "IM-01 슬라이드 05",
        kind: "im_slide",
        caseId: "IM-01",
        slideIndex: 4,
        liveScenarioId: "IM-01",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "IM-01",
          "IM 5페이지 토지 정보 및 지적도 (슬라이드 05)",
          "상가 상호명 제거 후 용도지역 색상 + 필지 경계·지번 중첩 도면으로 교체 대상"
        ),
      },
      {
        id: "Q8-V2",
        caption: "대상 슬라이드 2: IM 7페이지 수익률 및 공시지가 비교 (IM-01 슬라이드 07)",
        badgeLabel: "IM-01 슬라이드 07",
        kind: "im_slide",
        caseId: "IM-01",
        slideIndex: 6,
        liveScenarioId: "IM-01",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "IM-01",
          "IM 7페이지 수익률 및 지가 비교 (슬라이드 07)",
          "공시지가 배율 비교 삭제 → 한국부동산원 해당 시·구 지가변동률 그래프로 교체 대상"
        ),
      },
    ],
    subQuestions: [
      {
        id: "Q8_1",
        prompt: "확인 8-1 (5페이지). 토지이음 스타일 도면은 어떤 방식으로 제공할까요?",
        options: [
          {
            id: "A",
            badge: "권장 A",
            label:
              "상호명을 지운 '용도지역 색상 + 지적도 경계·지번' 자동 생성을 기본으로 하고, 토지이음 캡처 직접 업로드 버튼도 함께 제공",
            recommended: true,
          },
          {
            id: "B",
            badge: "선택 B",
            label: "자동 지도 대신 중개사가 토지이음 사이트 화면을 캡처해 올리는 방식을 기본으로 사용",
          },
        ],
      },
      {
        id: "Q8_2",
        prompt:
          "확인 8-2 (7페이지). 지가변동률 그래프로 바꿀 때 맨 아래 '운영+지가상승 합산 기대수익률' 요약 바는 어떻게 할까요?",
        options: [
          {
            id: "A",
            badge: "심플안 A",
            label:
              "좌측 임대수익률 표 + 우측 최근 5개년 지가변동률 그래프 두 가지만 깔끔하게 배치 (하단 합산 바 제거)",
            recommended: true,
          },
          {
            id: "B",
            badge: "설득안 B",
            label:
              "고객 설득용으로 하단 '운영수익률 + 최근 지가상승률 = 합산 기대수익률' 요약 바도 함께 유지",
          },
        ],
      },
    ],
    notePlaceholder:
      "지가변동률 그래프 기간(최근 3년 / 5년 / 10년) 등 선호 기준이 있으시면 적어 주세요.",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 5.2 [추가 질문] 미감수 영역 및 실무 엣지케이스 선제 발굴용 (6문항: AQ1 ~ AQ6)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "AQ1",
    numberLabel: "추가 질문 01",
    section: "additional",
    categoryTag: "월간 뉴스레터 · 시장 차트",
    title: "월간 뉴스레터(NL-M1, NL-M2) 상단 시장 통계 그래프 2종 유용성 확인",
    brokerQuoteTitle: "미감수 영역 선제 확인 (NL-M1 · NL-M2)",
    brokerQuoteText:
      "월간호 상단에는 일간·주간호에 없는 ① 실거래 추이 + 한국은행 기준금리 비교 그래프(NL-M1)와 ② 금액대별 거래 비중 그래프(NL-M2)가 수록되어 있습니다.",
    summaryQuestion:
      "건물주·자산가 고객께 한 달에 한 번 보내는 월간 리포트에 이 시장 그래프 구성이 유용하신지, 혹은 더 원하시는 통계가 있으신지 의견 부탁드립니다.",
    relatedScenarioIds: ["NL-M1", "NL-M2"],
    visuals: [
      {
        id: "AQ1-V1",
        caption: "구성 비교: 월간호 상단 시장 그래프 2종 (NL-M1 금리·거래량 vs NL-M2 금액대 비중)",
        badgeLabel: "월간 차트 2종 비교",
        kind: "diagram_svg",
        fallbackSvgDataUri: buildCardDiagramSvg({
          headerBg: "#064E3B",
          eyebrow: "추가 질문 01 · 월간 뉴스레터 상단 통계 차트 감수",
          title: "월간 리포트 전용 시장 그래프 2종 구성안",
          leftTitle: "NL-M1 · 실거래 건수 + 기준금리 추이",
          leftTone: "optionA",
          leftLines: [
            "• 권역 내 최근 분기별 상업용 실거래 건수 추이",
            "• 한국은행 기준금리 흐름 동시 표기",
            "• 매수 타이밍 설명용 거시 지표",
          ],
          rightTitle: "NL-M2 · 금액대별 실거래 비중",
          rightTone: "optionB",
          rightLines: [
            "• 50억 미만 / 50~100억 / 100~300억 거래 비중",
            "• 현재 시장에서 가장 활발히 팔리는 금액대 한눈에 파악",
            "• 매도·매수 예산 설정 브리핑에 활용",
          ],
          footerNote: "쇼룸 상단 [뉴스레터 6종] 탭에서 NL-M1, NL-M2 실화면을 바로 보실 수 있습니다.",
        }),
      },
      {
        id: "AQ1-V2",
        caption: "대상 산출물: 월간 뉴스레터 카톡 공유 카드 (NL-M1)",
        badgeLabel: "NL-M1 실물 카드",
        kind: "og_card",
        caseId: "NL-M1",
        liveScenarioId: "NL-M1",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "NL-M1",
          "월간 뉴스레터 옵션 A (NL-M1)",
          "강남·서초 월간 상업용 실거래 추이 및 금리 비교 리포트"
        ),
      },
    ],
    subQuestions: [
      {
        id: "AQ1_1",
        prompt: "추가 1. 월간 뉴스레터 상단 그래프 구성을 어떻게 운영하면 좋을까요?",
        options: [
          {
            id: "A",
            badge: "선택 A",
            label:
              "현재 2종(실거래+금리 추이 / 금액대별 거래 비중) 구성이 건물주 고객 발송용으로 유익함",
            recommended: true,
          },
          {
            id: "B",
            badge: "선택 B",
            label:
              "'한국부동산원 지가변동률'이나 '권역별 평당 매매가 추이' 그래프로 교체·보강 희망",
          },
          {
            id: "C",
            badge: "선택 C",
            label: "월간호도 복잡한 그래프 없이 핵심 시장 요약 글 위주로 담백하게 구성 희망",
          },
        ],
      },
    ],
    notePlaceholder: "월간 뉴스레터에서 고객들이 가장 궁금해하는 시장 데이터가 있다면 적어 주세요.",
  },

  {
    id: "AQ2",
    numberLabel: "추가 질문 02",
    section: "additional",
    categoryTag: "사옥형·개발형 · 핵심 지표",
    title: "사옥용 건물(DC-04, IM-04) 및 신축·개발부지(DC-05, IM-05)의 최우선 강조 정보",
    brokerQuoteTitle: "실무 엣지케이스 선제 확인 (IM-04 · IM-05)",
    brokerQuoteText:
      "수익형 꼬마빌딩과 달리 법인 사옥용 매물이나 철거·신축용 부지는 현재 임대수익률보다 다른 정보가 핵심입니다.",
    summaryQuestion:
      "사옥용 건물이나 신축·개발용 부지를 브리핑하실 때 딜카드 '장점 3줄'이나 IM 앞부분에서 가장 먼저 눈에 띄어야 하는 핵심 정보 1순위는 무엇인가요?",
    relatedScenarioIds: ["IM-04", "IM-05", "DC-04", "DC-05"],
    visuals: [
      {
        id: "AQ2-V1",
        caption: "대상 산출물 1: 사옥용 빌딩 슬라이드 (IM-04 강남 테헤란로 사옥)",
        badgeLabel: "IM-04 사옥용",
        kind: "im_slide",
        caseId: "IM-04",
        slideIndex: 1,
        liveScenarioId: "IM-04",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "IM-04",
          "사옥용 빌딩 (IM-04 강남 테헤란로)",
          "직접 입주 가용 면적 · 자주식 주차 대수 · 명도 일정 중심 구성"
        ),
      },
      {
        id: "AQ2-V2",
        caption: "대상 산출물 2: 신축·개발용 부지 슬라이드 (IM-05 성수동 신축부지)",
        badgeLabel: "IM-05 신축·개발용",
        kind: "im_slide",
        caseId: "IM-05",
        slideIndex: 4,
        liveScenarioId: "IM-05",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "IM-05",
          "신축·개발용 부지 (IM-05 성수동)",
          "대지 평당가 · 건폐율/용적률 법정 한도 · 전면 도로폭 중심 구성"
        ),
      },
    ],
    subQuestions: [
      {
        id: "AQ2_1",
        prompt: "추가 2. 사옥용·개발용 매물에서 수익률 대신 가장 크게 보여줄 항목을 골라 주세요.",
        options: [
          {
            id: "A",
            badge: "권장 A",
            label:
              "유형별 맞춤 강조 — 사옥용은 '실사용 가능 면적·주차 대수·명도 일정', 개발용은 '대지 평당가·용적률 신축 연면적·전면 도로폭'",
            recommended: true,
          },
          {
            id: "B",
            badge: "선택 B",
            label:
              "매물 유형을 나누지 않고 모든 매물을 동일한 기본 제원(대지·연면적·매매가) 양식으로 통일",
          },
          {
            id: "C",
            badge: "선택 C",
            label: "실무에서 더 중요하게 보는 별도 지표가 있음 (아래 메모란에 기재)",
          },
        ],
      },
    ],
    notePlaceholder:
      "예: 사옥용은 층고와 승강기 유무, 개발용은 일조권 사선제한 여부 등 실무 포인트를 적어 주세요.",
  },

  {
    id: "AQ3",
    numberLabel: "추가 질문 03",
    section: "additional",
    categoryTag: "고객 발송 · 모바일 vs PPTX",
    title: "실제 영업 현장에서 카톡 발송 시 '모바일 웹 IM 링크' vs 'PDF/PPTX 첨부' 선호도",
    brokerQuoteTitle: "영업 현장 활용 방식 확인",
    brokerQuoteText:
      "크리딜은 PC·인쇄용 가로형 PPTX 파일과 스마트폰에서 확대 없이 읽히는 세로형 모바일 웹 IM 링크를 동시에 생성합니다.",
    summaryQuestion:
      "실제 매수 고객께 카카오톡으로 상세 자료를 보내실 때 어느 전달 방식을 가장 주력으로 쓰실 예정인가요?",
    relatedScenarioIds: ["IM-01"],
    visuals: [
      {
        id: "AQ3-V1",
        caption: "포맷 1: 가로형 PPTX / PDF 문서 (IM-01 표지)",
        badgeLabel: "PPTX / PDF 문서",
        kind: "im_slide",
        caseId: "IM-01",
        slideIndex: 0,
        liveScenarioId: "IM-01",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "IM-01",
          "가로형 PPTX / PDF 브리핑 문서",
          "대면 미팅 인쇄 및 PC 검토, 중개사 직접 편집에 최적화"
        ),
      },
      {
        id: "AQ3-V2",
        caption: "포맷 2: 스마트폰 세로 스크롤 모바일 웹 IM vs 파일 첨부 비교",
        badgeLabel: "발송 방식 3안 비교",
        kind: "diagram_svg",
        fallbackSvgDataUri: buildCardDiagramSvg({
          headerBg: "#1D4ED8",
          eyebrow: "추가 질문 03 · 카카오톡 상세 자료 전달 방식",
          title: "파일 직접 첨부 vs 모바일 웹 IM 링크 발송",
          leftTitle: "방식 ① PDF / PPTX 파일 첨부",
          leftTone: "optionA",
          leftLines: [
            "• 익숙한 전통적인 문서 파일 전달 방식",
            "• 출력해서 보거나 PC로 검토하기 편리",
            "• 단점: 휴대폰에서는 가로 글씨가 작아 확대해서 봐야 함",
          ],
          rightTitle: "방식 ② 모바일 웹 IM 링크 (또는 ③ 병행)",
          rightTone: "optionB",
          rightLines: [
            "• 카톡 링크 터치 시 휴대폰 큰 글씨로 세로 스크롤 열람",
            "• 고객 열람 여부 확인 및 필요시 링크 회수(열람 종료) 가능",
            "• 1차는 모바일 링크, 진성 고객 미팅 시 PDF/PPTX 병행 가능",
          ],
        }),
      },
    ],
    subQuestions: [
      {
        id: "AQ3_1",
        prompt: "추가 3. 고객께 카톡으로 IM을 보내실 때 가장 많이 쓰실 방식을 선택해 주세요.",
        options: [
          {
            id: "A",
            badge: "방식 ①",
            label: "PDF 또는 PPTX 문서 파일을 카톡·이메일로 직접 첨부 발송",
          },
          {
            id: "B",
            badge: "방식 ②",
            label: "휴대폰에서 바로 큰 글씨로 열리는 '모바일 웹 IM 링크' 위주로 발송",
          },
          {
            id: "C",
            badge: "방식 ③",
            label:
              "둘 다 활용 — 카톡 첫 안내엔 모바일 웹 링크, 심층 검토·미팅 시엔 PDF/PPTX 파일 전달",
            recommended: true,
          },
        ],
      },
    ],
    notePlaceholder: "현장에서 고객분들이 더 선호하시는 자료 형태가 있다면 알려주세요.",
  },

  {
    id: "AQ4",
    numberLabel: "추가 질문 04",
    section: "additional",
    categoryTag: "IM 7페이지 · 전층 공실",
    title: "전층 공실(100% 명도 완료) 매물의 수익률 페이지 숫자 표현 방식",
    brokerQuoteTitle: "실무 엣지케이스 확인 (IM-03 역삼동 전층 공실)",
    brokerQuoteText:
      "전층 명도 완료 매물은 현재 월세가 0원이므로 현황 수익률이 0.00%로 찍힙니다.",
    summaryQuestion:
      "이런 전층 공실 매물의 7페이지 수익률 슬라이드에서는 0.00% 대신 중개사님이 입력한 '예상 임대료 기준 기대 수익률(추정)'을 대표 숫자로 크게 보여주는 것이 영업에 더 도움이 되실까요?",
    relatedScenarioIds: ["IM-03"],
    visuals: [
      {
        id: "AQ4-V1",
        caption: "대상 슬라이드: 전층 공실 매물 7페이지 수익률 화면 (IM-03 슬라이드 07)",
        badgeLabel: "IM-03 슬라이드 07",
        kind: "im_slide",
        caseId: "IM-03",
        slideIndex: 6,
        liveScenarioId: "IM-03",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "IM-03",
          "전층 공실 매물 수익률 페이지 (IM-03 슬라이드 07)",
          "현재 임대료 0원(0.00%) vs 예상 임대료 기준 추정 수익률 표기 비교"
        ),
      },
      {
        id: "AQ4-V2",
        caption: "표현 비교: 현황 0.00% 표기 vs 예상 임대료 기준 기대수익률(추정) 대표 강조",
        badgeLabel: "공실 수익률 표기 비교",
        kind: "diagram_svg",
        fallbackSvgDataUri: buildCardDiagramSvg({
          headerBg: "#312E81",
          eyebrow: "추가 질문 04 · 전층 공실 매물 수익률 표현",
          title: "100% 공실(즉시 입주·임대 가능) 매물의 대표 숫자",
          leftTitle: "현재 방식 · 현황 0.00% 우선 표기",
          leftTone: "before",
          leftLines: [
            "• 현재 임대수익률: 0.00% (전층 공실)",
            "• 팩트에는 충실하나 투자 매력도가 낮아 보일 우려",
          ],
          rightTitle: "개선안 A · 예상 기대수익률(추정) 대표 강조",
          rightTone: "after",
          rightLines: [
            "• 만실 전환 시 기대 수익률: 연 4.10% (예상 임대료 기준·추정)",
            "• 하단에 '현재 전층 명도 완료 (즉시 입주·신규 임차 세팅 가능)' 병기",
            "• 중개사가 입력한 예상 보증금·임대료 근거 함께 표시",
          ],
        }),
      },
    ],
    subQuestions: [
      {
        id: "AQ4_1",
        prompt: "추가 4. 전층 공실 매물의 수익률 페이지는 어떻게 보여주는 것이 좋을까요?",
        options: [
          {
            id: "A",
            badge: "권장 A",
            label:
              "중개사가 입력한 '예상 임대료 기준 기대 수익률(추정)'을 크게 보여주고, 전층 공실(즉시 입주 가능) 상태를 병기",
            recommended: true,
          },
          {
            id: "B",
            badge: "선택 B",
            label: "현황(0.00%) 칸과 만실 전환 시 예상 수익률(추정) 칸을 좌우 1:1로 나란히 표시",
          },
          {
            id: "C",
            badge: "선택 C",
            label: "전층 공실 매물은 수익률 페이지를 빼고 사옥·리모델링 활용 포인트만 수록",
          },
        ],
      },
    ],
    notePlaceholder: "일부 층만 공실인 매물에서의 수익률 표기 노하우가 있으시면 함께 적어 주세요.",
  },

  {
    id: "AQ5",
    numberLabel: "추가 질문 05",
    section: "additional",
    categoryTag: "무사진 긴급 매물 · 대체 화면",
    title: "현장 사진을 찍기 전인 긴급 접수 매물(DC-08, IM-08)의 사진 영역 처리",
    brokerQuoteTitle: "실무 엣지케이스 확인 (DC-08 · IM-08 무사진 매물)",
    brokerQuoteText:
      "매도 의뢰 직후 현장 외관 사진을 아직 확보하지 못한 상태에서 급히 브리핑 자료를 만들어야 하는 경우입니다.",
    summaryQuestion:
      "사진이 없는 긴급 매물일 때 IM 3페이지 우측 사진 자리나 딜카드 배경에는 위성·용도지역 도면을 대신 채우는 것이 나을까요, 아니면 사진 칸 없이 제원 표만 크게 보여주는 것이 깔끔할까요?",
    relatedScenarioIds: ["IM-08", "DC-08"],
    visuals: [
      {
        id: "AQ5-V1",
        caption: "대상 슬라이드: 무사진 매물 3페이지 물건 개요 (IM-08 슬라이드 03)",
        badgeLabel: "IM-08 슬라이드 03",
        kind: "im_slide",
        caseId: "IM-08",
        slideIndex: 2,
        liveScenarioId: "IM-08",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "IM-08",
          "무사진 긴급 매물 3페이지 (IM-08 슬라이드 03)",
          "외관 사진 미등록 시 우측 영역 처리 기준 확인"
        ),
      },
      {
        id: "AQ5-V2",
        caption: "대상 카드: 무사진 매물 딜카드 카톡 공유 카드 (DC-08 용인 보정동)",
        badgeLabel: "DC-08 카톡 공유 카드",
        kind: "og_card",
        caseId: "DC-08",
        staticUrl: "/api/og/deal/5c0ca5e0-0001-4000-8000-000000000008/kakao-v2",
        liveScenarioId: "DC-08",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "DC-08",
          "무사진 매물 딜카드 (DC-08 용인 보정동)",
          "사진 미등록 시 기본 그래픽/지도 대체 여부 확인"
        ),
      },
    ],
    subQuestions: [
      {
        id: "AQ5_1",
        prompt: "추가 5. 현장 사진이 없는 긴급 매물의 빈 사진 자리는 어떻게 처리할까요?",
        options: [
          {
            id: "A",
            badge: "선택 A",
            label:
              "빈 사진 칸 대신 '위성 항공뷰 또는 용도지역 지적도 도면'을 자동으로 채워 넣기",
            recommended: true,
          },
          {
            id: "B",
            badge: "선택 B",
            label:
              "어설픈 대체 이미지 없이 사진 영역을 아예 없애고 건축물·토지 제원 표를 전체 폭으로 키우기",
          },
          {
            id: "C",
            badge: "선택 C",
            label: "깔끔한 단색 타이포 배경(지역명·용도 중심)으로 담백하게 처리",
          },
        ],
      },
    ],
    notePlaceholder: "긴급 매물 브리핑 시 사진 대신 자주 넣으시는 화면(로드뷰 캡처 등)이 있다면 적어 주세요.",
  },

  {
    id: "AQ6",
    numberLabel: "추가 질문 06",
    section: "additional",
    categoryTag: "IM 전체 표 · 글씨 크기·여백",
    title: "PPTX 내 전체 표 통일 시 선호하시는 글씨 크기 및 여백 밀도",
    brokerQuoteTitle: "IM-01 전체 의견 연계 확인 ('표 모양 하나로 통일')",
    brokerQuoteText:
      "IM 전체 표 디자인을 하나로 통일할 때 고연령 매수 고객의 가독성과 한 페이지 정보량 사이의 기준을 정하고자 합니다.",
    summaryQuestion:
      "핵심 항목 위주로 글씨를 큼직하고 시원하게 키우는 스타일(10.5~12pt)과, 세부 공부 항목까지 한 장에 촘촘히 담는 스타일(8.5~9.5pt) 중 어느 쪽을 더 선호하시나요?",
    relatedScenarioIds: ["IM-01", "IM-06"],
    visuals: [
      {
        id: "AQ6-V1",
        caption: "대상 슬라이드 1: 기본 제원 표 (IM-01 슬라이드 03 물건 개요)",
        badgeLabel: "IM-01 슬라이드 03",
        kind: "im_slide",
        caseId: "IM-01",
        slideIndex: 2,
        liveScenarioId: "IM-01",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "IM-01",
          "IM 3페이지 물건 개요 표 (슬라이드 03)",
          "핵심 토지·건물 제원 표의 글씨 크기 및 행 높이 기준"
        ),
      },
      {
        id: "AQ6-V2",
        caption: "대상 슬라이드 2: 다층 21행 임대 현황 표 (IM-06 슬라이드 06 종로 관철동)",
        badgeLabel: "IM-06 슬라이드 06",
        kind: "im_slide",
        caseId: "IM-06",
        slideIndex: 5,
        liveScenarioId: "IM-06",
        fallbackSvgDataUri: buildFallbackSlideSvg(
          "IM-06",
          "다층 21행 렌트롤 표 (IM-06 슬라이드 06)",
          "임차 호실이 많을 때 한 장 축소 vs 2페이지 분할 기준 확인"
        ),
      },
    ],
    subQuestions: [
      {
        id: "AQ6_1",
        prompt: "추가 6. IM 전체 표 스타일 통일 시 어느 방향이 가장 보기 좋으실까요?",
        options: [
          {
            id: "A",
            badge: "권장 A",
            label:
              "시원한 큰 글씨 스타일 (10.5~12pt, 넓은 줄 간격, 핵심 항목 중심 — 고연령 매수 고객 가독성 최우선)",
            recommended: true,
          },
          {
            id: "B",
            badge: "선택 B",
            label:
              "촘촘한 정보 밀도 스타일 (8.5~9.5pt, 세부 대장 항목까지 한 페이지에 빠짐없이 수록)",
          },
          {
            id: "C",
            badge: "절충 C",
            label:
              "개요·수익률 표는 큼직하게(11pt+) 통일하고, 호실이 많은 렌트롤만 2페이지 분할 또는 9.5pt 적용",
          },
        ],
      },
    ],
    notePlaceholder: "표 색상(남색 헤더 vs 연회색 헤더), 테두리 굵기 등 선호 스타일이 있으시면 적어 주세요.",
  },
];

export const BROKER_FOLLOWUP_QUESTION_IDS: ReadonlyArray<string> =
  BROKER_FOLLOWUP_QUESTIONS_14.map((q) => q.id);

export function resolveQuestionVisualUrl(
  visual: BrokerQuestionVisualSpec,
  manifest?: ShowcaseManifest | null
): string {
  if (visual.kind === "diagram_svg") {
    return visual.fallbackSvgDataUri;
  }

  if (visual.kind === "im_slide" && visual.caseId) {
    const slides = manifest?.entries?.[visual.caseId]?.pptxSlideUrls;
    if (Array.isArray(slides) && slides.length > 0) {
      if (visual.slideIndex === "last") {
        return slides[slides.length - 1] || visual.fallbackSvgDataUri;
      }
      const idx = typeof visual.slideIndex === "number" ? visual.slideIndex : 0;
      const candidate = slides[Math.min(Math.max(0, idx), slides.length - 1)];
      if (candidate) return candidate;
    }
    return visual.staticUrl || visual.fallbackSvgDataUri;
  }

  if (visual.kind === "og_card" && visual.caseId) {
    const ogUrl = manifest?.entries?.[visual.caseId]?.ogImageUrl;
    if (ogUrl) return ogUrl;
    if (visual.staticUrl) return visual.staticUrl;
    if (manifest?.brokerSlug && visual.caseId === "NL-D1") {
      return `/api/og/magazine?brokerId=${encodeURIComponent(
        manifest.brokerSlug
      )}&date=2026-10-21`;
    }
    if (manifest?.brokerSlug && visual.caseId === "NL-M1") {
      return `/api/og/magazine?brokerId=${encodeURIComponent(
        manifest.brokerSlug
      )}&date=2026-10-25`;
    }
  }

  return visual.staticUrl || visual.fallbackSvgDataUri;
}

export function isQuestionAnswered(
  question: BrokerFollowupQuestionSpec,
  record?: BrokerQuestionAnswerRecord | null
): boolean {
  if (!record) return false;
  const hasNote = Boolean(record.note && record.note.trim().length > 0);
  const answers = record.answers || {};
  const allSubsChosen = question.subQuestions.every((sq) =>
    Boolean(answers[sq.id]?.trim())
  );
  if (allSubsChosen) return true;
  const anySubChosen = question.subQuestions.some((sq) =>
    Boolean(answers[sq.id]?.trim())
  );
  return anySubChosen || hasNote;
}

export function normalizeQuestionRecordForSave(
  question: BrokerFollowupQuestionSpec,
  draft: BrokerQuestionAnswerRecord
): BrokerQuestionAnswerRecord {
  const answers = { ...(draft.answers || {}) };
  const answerLabels: Record<string, string> = {};
  for (const sq of question.subQuestions) {
    const chosenId = answers[sq.id];
    if (chosenId) {
      const opt = sq.options.find((o) => o.id === chosenId);
      if (opt) {
        answerLabels[sq.id] = `[${opt.id}] ${opt.label}`;
      }
    }
  }
  const answered = isQuestionAnswered(question, {
    ...draft,
    answers,
  });
  return {
    status: answered ? "PASS" : "PENDING",
    answers,
    answerLabels,
    note: (draft.note || "").trim(),
    updatedAt: new Date().toISOString(),
  };
}

export function buildBrokerQuestionsSummaryText(
  questions: ReadonlyArray<BrokerFollowupQuestionSpec>,
  records: Record<string, BrokerQuestionAnswerRecord>,
  responderName = "감수 중개인",
  overallComment = ""
): string {
  const lines: string[] = [
    `[CRE DealCard · 중개인 확인 및 추가 질문지 응답 요약]`,
    `응답자: ${responderName || "감수 중개인"} · 작성시각: ${new Date().toLocaleString("ko-KR")}`,
    "",
  ];

  for (const q of questions) {
    const rec = records[q.id];
    if (!isQuestionAnswered(q, rec)) continue;
    lines.push(`■ ${q.numberLabel} (${q.id}) ${q.title}`);
    for (const sq of q.subQuestions) {
      const chosenId = rec?.answers?.[sq.id];
      const opt = sq.options.find((o) => o.id === chosenId);
      if (opt) {
        lines.push(`  - ${sq.prompt} → [${opt.id}] ${opt.label}`);
      }
    }
    if (rec?.note?.trim()) {
      lines.push(`  - 추가 메모: ${rec.note.trim()}`);
    }
    lines.push("");
  }

  if (overallComment.trim()) {
    lines.push(`■ 종합 코멘트: ${overallComment.trim()}`);
  }

  return lines.join("\n").trim();
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 단독 실행형 HTML5 문서 생성 (/qa-showcase/questions 라우트용).
 * 대상 이미지(실물 슬라이드 PNG + 카톡 공유 카드 + 시안 다이어그램)를 포함하며
 * 선택 즉시 /api/public/qa-workbench 로 실시간 동기화·제출됩니다.
 */
export function renderStandaloneBrokerQuestionsHtml(): string {
  const serializedSpecs = JSON.stringify({
    workbenchId: QA_BROKER_FOLLOWUP_WORKBENCH_ID,
    sessionId: QA_BROKER_FOLLOWUP_SESSION_ID,
    questions: BROKER_FOLLOWUP_QUESTIONS_14,
  }).replace(/</g, "\\u003c");

  const renderSectionCards = (section: BrokerQuestionSection) =>
    BROKER_FOLLOWUP_QUESTIONS_14.filter((q) => q.section === section)
      .map((q) => {
        const visualsHtml = q.visuals
          .map((v) => {
            const initialSrc = v.staticUrl || v.fallbackSvgDataUri;
            return `
              <figure class="visual-card">
                <div class="visual-head">
                  <span class="visual-badge">${escapeHtml(v.badgeLabel)}</span>
                  <span class="visual-zoom-hint">🔍 클릭하면 크게 보기</span>
                </div>
                <button
                  type="button"
                  class="visual-img-btn"
                  data-lightbox-open="1"
                  data-caption="${escapeHtml(v.caption)}"
                >
                  <img
                    id="img-${escapeHtml(v.id)}"
                    data-visual-kind="${escapeHtml(v.kind)}"
                    data-case-id="${escapeHtml(v.caseId || "")}"
                    data-slide-index="${escapeHtml(String(v.slideIndex ?? ""))}"
                    data-static-url="${escapeHtml(v.staticUrl || "")}"
                    data-fallback-src="${escapeHtml(v.fallbackSvgDataUri)}"
                    src="${escapeHtml(initialSrc)}"
                    alt="${escapeHtml(v.caption)}"
                    class="visual-img"
                  />
                </button>
                <figcaption class="visual-caption">${escapeHtml(v.caption)}</figcaption>
              </figure>
            `;
          })
          .join("");

        const subsHtml = q.subQuestions
          .map((sq) => {
            const optsHtml = sq.options
              .map(
                (opt) => `
                  <button
                    type="button"
                    class="opt-btn"
                    data-question-id="${escapeHtml(q.id)}"
                    data-sub-id="${escapeHtml(sq.id)}"
                    data-option-id="${escapeHtml(opt.id)}"
                    aria-pressed="false"
                  >
                    <span class="opt-badge ${opt.recommended ? "opt-badge-rec" : ""}">${escapeHtml(
                      opt.badge
                    )}</span>
                    <span class="opt-label">${escapeHtml(opt.label)}</span>
                  </button>
                `
              )
              .join("");

            return `
              <div class="subq-block">
                <p class="subq-prompt">${escapeHtml(sq.prompt)}</p>
                <div class="opt-grid">${optsHtml}</div>
              </div>
            `;
          })
          .join("");

        const scenarioLinks = q.relatedScenarioIds
          .map(
            (sid) =>
              `<a class="scenario-pill" data-showcase-link="${escapeHtml(
                sid
              )}" href="/qa-showcase?case=${encodeURIComponent(
                sid
              )}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                sid
              )} 실화면 열기 ↗</a>`
          )
          .join("");

        return `
          <article class="q-card" id="card-${escapeHtml(q.id)}" data-question-card="${escapeHtml(
            q.id
          )}" data-section="${escapeHtml(q.section)}">
            <div class="q-top">
              <div class="q-badges">
                <span class="q-num ${
                  q.section === "confirm" ? "q-num-confirm" : "q-num-add"
                }">${escapeHtml(q.numberLabel)}</span>
                <span class="q-cat">${escapeHtml(q.categoryTag)}</span>
                <span class="q-status" id="status-${escapeHtml(q.id)}">미응답</span>
              </div>
              <div class="q-links">${scenarioLinks}</div>
            </div>

            <h3 class="q-title">${escapeHtml(q.title)}</h3>
            <div class="q-quote">
              <strong>💬 ${escapeHtml(q.brokerQuoteTitle)}:</strong>
              <span>${escapeHtml(q.brokerQuoteText)}</span>
            </div>
            <p class="q-summary">${escapeHtml(q.summaryQuestion)}</p>

            <div class="visual-grid">${visualsHtml}</div>

            <div class="subq-list">${subsHtml}</div>

            <div class="note-box">
              <label class="note-label" for="note-${escapeHtml(
                q.id
              )}">✏️ 추가 의견 / 직접 문구 지정 (선택)</label>
              <div class="note-row">
                <textarea
                  id="note-${escapeHtml(q.id)}"
                  class="note-input"
                  data-note-for="${escapeHtml(q.id)}"
                  rows="2"
                  placeholder="${escapeHtml(q.notePlaceholder)}"
                ></textarea>
                <button type="button" class="note-save-btn" data-save-note="${escapeHtml(
                  q.id
                )}">의견 저장</button>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>CRE DealCard · 중개인 확인 및 추가 질문지 (14문항 · 대상 이미지 포함)</title>
  <style>
    :root {
      color-scheme: light;
      font-family: "Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", system-ui, -apple-system, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #F8FAFC;
      color: #0F172A;
      line-height: 1.55;
      font-size: 16px;
    }
    .sticky-bar {
      position: sticky;
      top: 0;
      z-index: 40;
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid #E2E8F0;
      padding: 14px 20px;
    }
    .container {
      max-width: 1180px;
      margin: 0 auto;
      padding: 0 16px;
    }
    .top-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .brand-eyebrow {
      font-size: 14px;
      font-weight: 800;
      color: #4338CA;
      margin: 0;
    }
    .page-title {
      font-size: 22px;
      font-weight: 800;
      margin: 2px 0 0;
      color: #0F172A;
    }
    .action-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .progress-pill {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      padding: 0 14px;
      border-radius: 12px;
      background: #EEF2FF;
      border: 1px solid #A5B4FC;
      color: #1E1B4B;
      font-weight: 800;
      font-size: 15px;
    }
    .btn-primary {
      min-height: 44px;
      padding: 0 18px;
      border-radius: 12px;
      border: 0;
      background: #0F172A;
      color: #FFFFFF;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
    }
    .btn-primary:hover { background: #1E293B; }
    .btn-secondary {
      min-height: 44px;
      padding: 0 14px;
      border-radius: 12px;
      border: 1px solid #CBD5E1;
      background: #FFFFFF;
      color: #0F172A;
      font-size: 15px;
      font-weight: 700;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      cursor: pointer;
    }
    .btn-secondary:hover { background: #F1F5F9; }
    .filter-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-top: 10px;
    }
    .filter-group {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .filter-btn {
      min-height: 38px;
      padding: 0 13px;
      border-radius: 10px;
      border: 1px solid #CBD5E1;
      background: #FFFFFF;
      color: #334155;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
    }
    .filter-btn[aria-pressed="true"] {
      background: #4338CA;
      border-color: #4338CA;
      color: #FFFFFF;
    }
    .sync-banner {
      font-size: 14px;
      font-weight: 800;
      color: #065F46;
    }
    .intro-card {
      margin: 22px 0;
      padding: 20px;
      border-radius: 20px;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
    }
    .section-heading {
      margin: 28px 0 14px;
      padding: 14px 18px;
      border-radius: 16px;
      background: #0F172A;
      color: #FFFFFF;
    }
    .section-heading h2 {
      margin: 0;
      font-size: 19px;
      font-weight: 800;
    }
    .section-heading p {
      margin: 4px 0 0;
      font-size: 15px;
      color: #CBD5E1;
    }
    .q-card {
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      border-radius: 20px;
      padding: 22px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
    }
    .q-card.answered {
      border-color: #10B981;
      box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.14);
    }
    .q-top {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
    }
    .q-badges, .q-links {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .q-num {
      padding: 5px 11px;
      border-radius: 9px;
      font-size: 14px;
      font-weight: 800;
      color: #FFFFFF;
    }
    .q-num-confirm { background: #3730A3; }
    .q-num-add { background: #0F766E; }
    .q-cat {
      padding: 5px 10px;
      border-radius: 9px;
      background: #F1F5F9;
      color: #334155;
      font-size: 14px;
      font-weight: 700;
    }
    .q-status {
      padding: 5px 10px;
      border-radius: 9px;
      background: #F8FAFC;
      border: 1px solid #CBD5E1;
      color: #475569;
      font-size: 13px;
      font-weight: 800;
    }
    .q-status.done {
      background: #ECFDF5;
      border-color: #6EE7B7;
      color: #065F46;
    }
    .scenario-pill {
      padding: 6px 11px;
      border-radius: 9px;
      border: 1px solid #C7D2FE;
      background: #EEF2FF;
      color: #312E81;
      font-size: 13px;
      font-weight: 800;
      text-decoration: none;
    }
    .q-title {
      margin: 4px 0 10px;
      font-size: 20px;
      font-weight: 800;
      color: #0F172A;
    }
    .q-quote {
      padding: 12px 14px;
      border-radius: 12px;
      background: #FFFBEB;
      border: 1px solid #FDE68A;
      color: #78350F;
      font-size: 15px;
      margin-bottom: 10px;
    }
    .q-summary {
      margin: 0 0 16px;
      font-size: 16px;
      font-weight: 600;
      color: #1E293B;
    }
    .visual-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 14px;
      margin-bottom: 18px;
    }
    .visual-card {
      margin: 0;
      padding: 12px;
      border-radius: 14px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
    }
    .visual-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      gap: 8px;
    }
    .visual-badge {
      padding: 3px 9px;
      border-radius: 7px;
      background: #1E293B;
      color: #FFFFFF;
      font-size: 13px;
      font-weight: 800;
    }
    .visual-zoom-hint {
      font-size: 13px;
      font-weight: 700;
      color: #475569;
    }
    .visual-img-btn {
      display: block;
      width: 100%;
      padding: 0;
      border: 1px solid #CBD5E1;
      border-radius: 10px;
      overflow: hidden;
      background: #FFFFFF;
      cursor: zoom-in;
    }
    .visual-img {
      display: block;
      width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: contain;
      background: #FFFFFF;
    }
    .visual-caption {
      margin-top: 8px;
      font-size: 14px;
      font-weight: 700;
      color: #334155;
    }
    .subq-block {
      padding: 14px;
      border-radius: 14px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      margin-bottom: 12px;
    }
    .subq-prompt {
      margin: 0 0 10px;
      font-size: 16px;
      font-weight: 800;
      color: #0F172A;
    }
    .opt-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .opt-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 50px;
      padding: 10px 14px;
      border-radius: 12px;
      border: 2px solid #CBD5E1;
      background: #FFFFFF;
      color: #0F172A;
      text-align: left;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .opt-btn:hover {
      border-color: #6366F1;
      background: #F8FAFC;
    }
    .opt-btn[aria-pressed="true"] {
      border-color: #059669;
      background: #ECFDF5;
      color: #064E3B;
    }
    .opt-badge {
      flex-shrink: 0;
      padding: 4px 9px;
      border-radius: 8px;
      background: #E2E8F0;
      color: #1E293B;
      font-size: 13px;
      font-weight: 800;
    }
    .opt-badge-rec {
      background: #EEF2FF;
      color: #3730A3;
    }
    .opt-btn[aria-pressed="true"] .opt-badge {
      background: #059669;
      color: #FFFFFF;
    }
    .note-box {
      margin-top: 10px;
    }
    .note-label {
      display: block;
      font-size: 14px;
      font-weight: 800;
      color: #334155;
      margin-bottom: 6px;
    }
    .note-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .note-input {
      flex: 1;
      min-width: 240px;
      border-radius: 12px;
      border: 1px solid #CBD5E1;
      padding: 10px 12px;
      font-size: 15px;
      font-family: inherit;
    }
    .note-save-btn {
      min-height: 44px;
      padding: 0 16px;
      border-radius: 12px;
      border: 1px solid #4338CA;
      background: #EEF2FF;
      color: #312E81;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
    }
    .bottom-submit-card {
      margin: 28px 0 60px;
      padding: 22px;
      border-radius: 20px;
      background: #FFFFFF;
      border: 2px solid #4338CA;
    }
    .lightbox {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: rgba(15, 23, 42, 0.88);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .lightbox.open { display: flex; }
    .lightbox-inner {
      max-width: 1120px;
      width: 100%;
      background: #FFFFFF;
      border-radius: 18px;
      padding: 16px;
    }
    .lightbox-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }
    .lightbox-img {
      display: block;
      width: 100%;
      max-height: 78vh;
      object-fit: contain;
      background: #F8FAFC;
      border-radius: 10px;
    }
  </style>
</head>
<body>
  <header class="sticky-bar">
    <div class="container">
      <div class="top-row">
        <div>
          <p class="brand-eyebrow">CRE DealCard · 중개인 1차 감수 의견 후속 확인</p>
          <h1 class="page-title">확인 질문 8문항 &amp; 추가 질문 6문항 (대상 이미지 대조)</h1>
        </div>
        <div class="action-row">
          <span class="progress-pill" id="progress-pill">응답 현황: 0 / 14 완료</span>
          <button type="button" class="btn-secondary" id="copy-summary-btn">📋 응답 요약 복사</button>
          <a class="btn-secondary" id="back-showcase-link" href="/qa-showcase">← 산출물 쇼룸으로</a>
          <button type="button" class="btn-primary" id="submit-all-btn">🚀 답변 서버 최종 제출</button>
        </div>
      </div>
      <div class="filter-row">
        <div class="filter-group" role="group" aria-label="문항 필터">
          <button type="button" class="filter-btn" data-filter="all" aria-pressed="true">전체 보기 (14)</button>
          <button type="button" class="filter-btn" data-filter="confirm" aria-pressed="false">확인 질문 (8)</button>
          <button type="button" class="filter-btn" data-filter="additional" aria-pressed="false">추가 질문 (6)</button>
          <button type="button" class="filter-btn" data-filter="unanswered" aria-pressed="false">미응답만 보기</button>
        </div>
        <span class="sync-banner" id="sync-status">선택하시는 즉시 자동 저장됩니다.</span>
      </div>
    </div>
  </header>

  <main class="container">
    <section class="intro-card">
      <p style="margin:0 0 8px;font-size:16px;font-weight:800;color:#0F172A;">
        안녕하세요! 쇼룸에 남겨주신 소중한 실무 의견 중 명확한 항목(AI 문구·배지 제거, 구독자 신청창 숨김, IM 3p 하이라이트 박스 삭제, 7p 막대 간격 교정, 9p 출처·대형 면책 박스 정리 등)은 즉시 시스템에 반영했습니다.
      </p>
      <p style="margin:0;font-size:15px;color:#334155;">
        아래 <strong>확인 질문 8문항</strong>(세부 디자인·기준 확정용)과 <strong>추가 질문 6문항</strong>(미감수 월간호 및 공실·무사진 매물 기준 확인용)은 대상 이미지를 보시면서 편하게 버튼을 눌러 선택해 주시면 서버에 즉시 반영됩니다.
      </p>
    </section>

    <div class="section-heading" id="heading-confirm">
      <h2>5.1 [확인 질문] 남겨주신 의견의 세부 기준 확정용 (8문항)</h2>
      <p>각 항목의 실물 슬라이드·카드 이미지와 개편 시안을 비교하신 뒤 선호하시는 보기를 눌러 주세요.</p>
    </div>
    ${renderSectionCards("confirm")}

    <div class="section-heading" id="heading-additional">
      <h2>5.2 [추가 질문] 미감수 영역 및 실무 엣지케이스 선제 확인용 (6문항)</h2>
      <p>월간 그래프, 사옥·개발 매물, 전층 공실, 무사진 긴급 매물에 대한 현장 기준을 알려주세요.</p>
    </div>
    ${renderSectionCards("additional")}

    <section class="bottom-submit-card">
      <h2 style="margin:0 0 12px;font-size:19px;font-weight:800;">최종 의견 제출</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-bottom:12px;">
        <label style="display:block;">
          <span style="display:block;font-size:14px;font-weight:800;margin-bottom:4px;">성함 / 직함 (선택)</span>
          <input id="responder-name" type="text" value="감수 중개인" style="width:100%;min-height:44px;border-radius:10px;border:1px solid #CBD5E1;padding:0 12px;font-size:15px;" />
        </label>
        <label style="display:block;">
          <span style="display:block;font-size:14px;font-weight:800;margin-bottom:4px;">전체 추가 코멘트 (선택)</span>
          <input id="overall-comment" type="text" placeholder="미팅 시 함께 논의하고 싶은 사항을 편하게 적어 주세요." style="width:100%;min-height:44px;border-radius:10px;border:1px solid #CBD5E1;padding:0 12px;font-size:15px;" />
        </label>
      </div>
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;">
        <button type="button" class="btn-primary" id="submit-bottom-btn">🚀 작성한 답변 서버 최종 제출하기</button>
        <button type="button" class="btn-secondary" id="copy-bottom-btn">📋 답변 요약 텍스트 복사</button>
        <span id="bottom-submit-msg" style="font-size:15px;font-weight:800;color:#065F46;"></span>
      </div>
    </section>
  </main>

  <div class="lightbox" id="img-lightbox" role="dialog" aria-modal="true">
    <div class="lightbox-inner">
      <div class="lightbox-head">
        <strong id="lightbox-caption" style="font-size:16px;color:#0F172A;">대상 이미지 확대 보기</strong>
        <button type="button" class="btn-secondary" id="lightbox-close-btn">✕ 닫기 (ESC)</button>
      </div>
      <img id="lightbox-img" class="lightbox-img" src="" alt="대상 이미지 확대" />
    </div>
  </div>

  <script>
    (function () {
      var SPEC = ${serializedSpecs};
      var LOCAL_KEY = "cre_broker_followup_questions_v1";
      var params = new URLSearchParams(window.location.search);
      var urlQaKey = (params.get("qaKey") || "").trim();
      var storedKey = "";
      try {
        if (urlQaKey) {
          localStorage.setItem("credeal-qa-broker-key-v1", urlQaKey);
        }
        storedKey =
          urlQaKey ||
          localStorage.getItem("credeal-qa-broker-key-v1") ||
          localStorage.getItem("credeal-qa-access-key-v1") ||
          "";
      } catch (e) {}

      function authHeaders() {
        var h = { "Content-Type": "application/json" };
        if (storedKey) h["x-qa-access-key"] = storedKey;
        return h;
      }

      function decorateHref(baseHref) {
        if (!storedKey && params.get("qa") !== "1") return baseHref;
        var u = new URL(baseHref, window.location.origin);
        u.searchParams.set("qa", "1");
        if (storedKey) u.searchParams.set("qaKey", storedKey);
        return u.pathname + u.search;
      }

      var backLink = document.getElementById("back-showcase-link");
      if (backLink) {
        var returnTo = params.get("from") === "broker" ? "/qa-broker/showcase" : "/qa-showcase";
        backLink.setAttribute("href", decorateHref(returnTo));
      }
      document.querySelectorAll("[data-showcase-link]").forEach(function (a) {
        var sid = a.getAttribute("data-showcase-link") || "";
        var targetBase = params.get("from") === "broker" ? "/qa-broker/showcase" : "/qa-showcase";
        a.setAttribute("href", decorateHref(targetBase + "?case=" + encodeURIComponent(sid)));
      });

      var state = { records: {}, responderName: "감수 중개인", overallComment: "", filter: "all" };
      try {
        var raw = localStorage.getItem(LOCAL_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && typeof parsed.records === "object") state.records = parsed.records;
          if (parsed && parsed.responderName) state.responderName = parsed.responderName;
          if (parsed && parsed.overallComment) state.overallComment = parsed.overallComment;
        }
      } catch (e) {}

      function isAnswered(q, rec) {
        if (!rec) return false;
        var hasNote = Boolean(rec.note && String(rec.note).trim());
        var ans = rec.answers || {};
        var anySub = q.subQuestions.some(function (sq) { return Boolean(ans[sq.id]); });
        return anySub || hasNote;
      }

      function normalizeAllRecords() {
        var out = {};
        SPEC.questions.forEach(function (q) {
          var rec = state.records[q.id] || {};
          var ans = rec.answers || {};
          var labels = {};
          q.subQuestions.forEach(function (sq) {
            var cid = ans[sq.id];
            if (cid) {
              var found = sq.options.find(function (o) { return o.id === cid; });
              if (found) labels[sq.id] = "[" + found.id + "] " + found.label;
            }
          });
          var done = isAnswered(q, rec);
          if (done) {
            out[q.id] = {
              status: "PASS",
              answers: ans,
              answerLabels: labels,
              note: String(rec.note || "").trim(),
              updatedAt: rec.updatedAt || new Date().toISOString()
            };
          }
        });
        return out;
      }

      function saveLocal() {
        try {
          localStorage.setItem(LOCAL_KEY, JSON.stringify({
            records: state.records,
            responderName: state.responderName,
            overallComment: state.overallComment
          }));
        } catch (e) {}
      }

      function renderUI() {
        var doneCount = 0;
        SPEC.questions.forEach(function (q) {
          var rec = state.records[q.id] || {};
          var done = isAnswered(q, rec);
          if (done) doneCount += 1;
          var card = document.getElementById("card-" + q.id);
          var badge = document.getElementById("status-" + q.id);
          if (card) {
            card.classList.toggle("answered", done);
            var visible =
              state.filter === "all" ||
              (state.filter === "confirm" && q.section === "confirm") ||
              (state.filter === "additional" && q.section === "additional") ||
              (state.filter === "unanswered" && !done);
            card.style.display = visible ? "" : "none";
          }
          if (badge) {
            badge.textContent = done ? "✓ 응답 완료" : "미응답";
            badge.classList.toggle("done", done);
          }
          var noteEl = document.getElementById("note-" + q.id);
          if (noteEl && document.activeElement !== noteEl) {
            noteEl.value = rec.note || "";
          }
          q.subQuestions.forEach(function (sq) {
            var chosen = (rec.answers || {})[sq.id] || "";
            document.querySelectorAll('[data-question-id="' + q.id + '"][data-sub-id="' + sq.id + '"]').forEach(function (btn) {
              var oid = btn.getAttribute("data-option-id");
              btn.setAttribute("aria-pressed", oid === chosen ? "true" : "false");
            });
          });
        });
        var pill = document.getElementById("progress-pill");
        if (pill) pill.textContent = "응답 현황: " + doneCount + " / " + SPEC.questions.length + " 완료";
        var rName = document.getElementById("responder-name");
        if (rName && document.activeElement !== rName) rName.value = state.responderName || "감수 중개인";
        var oComm = document.getElementById("overall-comment");
        if (oComm && document.activeElement !== oComm) oComm.value = state.overallComment || "";
      }

      function setSyncBanner(msg, isErr) {
        var el = document.getElementById("sync-status");
        if (el) {
          el.textContent = msg;
          el.style.color = isErr ? "#B91C1C" : "#065F46";
        }
      }

      function syncServer(mode) {
        var normalized = normalizeAllRecords();
        var rNameEl = document.getElementById("responder-name");
        var oCommEl = document.getElementById("overall-comment");
        state.responderName = rNameEl ? rNameEl.value.trim() : state.responderName;
        state.overallComment = oCommEl ? oCommEl.value.trim() : state.overallComment;
        saveLocal();
        setSyncBanner(mode === "submit" ? "서버에 최종 제출 중..." : "자동 저장 중...", false);

        return fetch("/api/public/qa-workbench", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            mode: mode,
            workbenchId: SPEC.workbenchId,
            sessionId: SPEC.sessionId,
            testerName: state.responderName || "감수 중개인",
            testerOrg: "중개인 질문지",
            overallComment: state.overallComment || "",
            records: normalized
          })
        })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, json: j }; }); })
          .then(function (res) {
            if (!res.ok || !res.json || !res.json.ok) {
              setSyncBanner((res.json && res.json.error) || "브라우저에 임시 저장됨 (키 확인 필요)", true);
              return false;
            }
            var done = (res.json.summary && res.json.summary.completedCount) || Object.keys(normalized).length;
            var msg = mode === "submit"
              ? "✅ 서버 최종 제출 완료 (" + done + "/14 문항 저장됨)"
              : "✓ 서버 자동 저장 완료 (" + done + "/14)";
            setSyncBanner(msg, false);
            var bMsg = document.getElementById("bottom-submit-msg");
            if (bMsg && mode === "submit") bMsg.textContent = msg;
            return true;
          })
          .catch(function () {
            setSyncBanner("오프라인 상태 · 브라우저에 안전하게 임시 저장되었습니다.", true);
            return false;
          });
      }

      document.querySelectorAll(".opt-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var qid = btn.getAttribute("data-question-id");
          var sqid = btn.getAttribute("data-sub-id");
          var oid = btn.getAttribute("data-option-id");
          if (!qid || !sqid || !oid) return;
          var prev = state.records[qid] || { answers: {}, note: "" };
          var nextAns = Object.assign({}, prev.answers || {});
          nextAns[sqid] = nextAns[sqid] === oid ? "" : oid;
          state.records[qid] = Object.assign({}, prev, {
            answers: nextAns,
            updatedAt: new Date().toISOString()
          });
          renderUI();
          syncServer("sync");
        });
      });

      document.querySelectorAll("[data-save-note]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var qid = btn.getAttribute("data-save-note");
          var input = document.getElementById("note-" + qid);
          if (!qid || !input) return;
          var prev = state.records[qid] || { answers: {}, note: "" };
          state.records[qid] = Object.assign({}, prev, {
            note: input.value,
            updatedAt: new Date().toISOString()
          });
          renderUI();
          syncServer("sync");
        });
      });

      document.querySelectorAll("[data-note-for]").forEach(function (ta) {
        ta.addEventListener("blur", function () {
          var qid = ta.getAttribute("data-note-for");
          if (!qid) return;
          var prev = state.records[qid] || { answers: {}, note: "" };
          if ((prev.note || "") === ta.value) return;
          state.records[qid] = Object.assign({}, prev, {
            note: ta.value,
            updatedAt: new Date().toISOString()
          });
          renderUI();
          syncServer("sync");
        });
      });

      document.querySelectorAll("[data-filter]").forEach(function (fbtn) {
        fbtn.addEventListener("click", function () {
          state.filter = fbtn.getAttribute("data-filter") || "all";
          document.querySelectorAll("[data-filter]").forEach(function (b) {
            b.setAttribute("aria-pressed", b === fbtn ? "true" : "false");
          });
          renderUI();
        });
      });

      function copySummary() {
        var lines = ["[CRE DealCard · 중개인 확인 및 추가 질문지 응답 요약]"];
        SPEC.questions.forEach(function (q) {
          var rec = state.records[q.id];
          if (!isAnswered(q, rec)) return;
          lines.push("■ " + q.numberLabel + " (" + q.id + ") " + q.title);
          q.subQuestions.forEach(function (sq) {
            var cid = rec && rec.answers && rec.answers[sq.id];
            var opt = sq.options.find(function (o) { return o.id === cid; });
            if (opt) lines.push("  - " + sq.prompt + " → [" + opt.id + "] " + opt.label);
          });
          if (rec && rec.note && rec.note.trim()) {
            lines.push("  - 추가 메모: " + rec.note.trim());
          }
        });
        var text = lines.join("\\n");
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            setSyncBanner("📋 응답 요약이 클립보드에 복사되었습니다.", false);
          });
        }
      }

      document.getElementById("submit-all-btn").addEventListener("click", function () { syncServer("submit"); });
      document.getElementById("submit-bottom-btn").addEventListener("click", function () { syncServer("submit"); });
      document.getElementById("copy-summary-btn").addEventListener("click", copySummary);
      document.getElementById("copy-bottom-btn").addEventListener("click", copySummary);

      // 이미지 오류 시 내장 다이어그램 SVG로 안전 폴백
      document.querySelectorAll("img[data-fallback-src]").forEach(function (img) {
        img.addEventListener("error", function () {
          var fb = img.getAttribute("data-fallback-src");
          if (fb && img.getAttribute("src") !== fb) {
            img.setAttribute("src", fb);
          }
        });
      });

      // 라이트박스 확대 보기
      var lb = document.getElementById("img-lightbox");
      var lbImg = document.getElementById("lightbox-img");
      var lbCap = document.getElementById("lightbox-caption");
      document.querySelectorAll("[data-lightbox-open]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var innerImg = btn.querySelector("img");
          if (!innerImg || !lb || !lbImg) return;
          lbImg.setAttribute("src", innerImg.getAttribute("src") || "");
          if (lbCap) lbCap.textContent = btn.getAttribute("data-caption") || "대상 이미지 확대 보기";
          lb.classList.add("open");
        });
      });
      function closeLb() { if (lb) lb.classList.remove("open"); }
      document.getElementById("lightbox-close-btn").addEventListener("click", closeLb);
      lb.addEventListener("click", function (ev) { if (ev.target === lb) closeLb(); });
      window.addEventListener("keydown", function (ev) { if (ev.key === "Escape") closeLb(); });

      renderUI();

      // 1) 실물 쇼룸 매니페스트 로드 → 실제 PPTX 슬라이드 PNG 및 카톡 카드 이미지 바인딩
      fetch("/api/public/qa-workbench?mode=showcase", { headers: authHeaders(), cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data || !data.manifest || !data.manifest.entries) return;
          var entries = data.manifest.entries;
          var slug = data.manifest.brokerSlug || "";
          document.querySelectorAll("img[data-visual-kind]").forEach(function (img) {
            var kind = img.getAttribute("data-visual-kind");
            var cid = img.getAttribute("data-case-id");
            var sidx = img.getAttribute("data-slide-index");
            if (kind === "im_slide" && cid && entries[cid] && Array.isArray(entries[cid].pptxSlideUrls) && entries[cid].pptxSlideUrls.length > 0) {
              var arr = entries[cid].pptxSlideUrls;
              var resolved = sidx === "last" ? arr[arr.length - 1] : arr[Math.min(Math.max(0, Number(sidx || 0)), arr.length - 1)];
              if (resolved) img.setAttribute("src", resolved);
            } else if (kind === "og_card" && cid) {
              if (entries[cid] && entries[cid].ogImageUrl) {
                img.setAttribute("src", entries[cid].ogImageUrl);
              } else if (slug && cid === "NL-D1") {
                img.setAttribute("src", "/api/og/magazine?brokerId=" + encodeURIComponent(slug) + "&date=2026-10-21");
              } else if (slug && cid === "NL-M1") {
                img.setAttribute("src", "/api/og/magazine?brokerId=" + encodeURIComponent(slug) + "&date=2026-10-25");
              }
            }
          });
        })
        .catch(function () {});

      // 2) 서버에 저장된 이전 응답 복원
      fetch("/api/public/qa-workbench?sessionId=" + encodeURIComponent(SPEC.sessionId), { headers: authHeaders(), cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data || !data.found || !data.session || !data.session.records) return;
          state.records = Object.assign({}, state.records, data.session.records);
          if (data.session.testerName) state.responderName = data.session.testerName;
          if (data.session.overallComment) state.overallComment = data.session.overallComment;
          saveLocal();
          renderUI();
        })
        .catch(function () {});
    })();
  </script>
</body>
</html>`;
}

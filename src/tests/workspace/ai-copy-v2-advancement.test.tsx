// @vitest-environment jsdom
/**
 * @file src/tests/workspace/ai-copy-v2-advancement.test.tsx
 * @description 뉴스레터 & 딜카드 AI 텍스트 고도화 회귀·기능 검증 스위트
 *
 * 1. 모델 티어 gpt-6.1-terra 일괄 전환 검증
 * 2. 뉴스레터: 3줄 개조식 브리핑 · 수치·근거 최우선(extractArticleNumericEvidence) · 매물 코멘트 3-Angle
 * 3. 딜카드: 8대 구조화 팩트 추출(블라인드 유지) · 6+ 후보 도출 API · 3+3 양방향 무손실 스왑 UI
 */
import React, { act, useState } from "react";
import fs from "node:fs";
import path from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const llmCapture: {
  lastParams: { model?: string; systemPrompt?: string; userPrompt?: string } | null;
  mockContent: string;
} = {
  lastParams: null,
  mockContent: "",
};

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: async () => ({ error: null, user: { id: "broker-test-1" } }),
}));
vi.mock("@/lib/ai-quota-guard", () => ({
  enforceBrokerAiQuota: async () => null,
  buildAiUnavailable503Response: () => new Response("unavailable", { status: 503 }),
  isLLMMockNotAllowedError: () => false,
  AI_SERVER_UNAVAILABLE_KO: "AI가 잠시 쉬고 있어요.",
}));
vi.mock("@/domain/ontology/market-data-provider", () => ({
  getMarketDefaults: async () => ({
    capRateBenchmarks: { 강남구: 3.5, 성동구: 3.7 },
  }),
}));
vi.mock("@/ai/llm-client", () => {
  class LLMMockNotAllowedError extends Error {}
  return {
    LLMMockNotAllowedError,
    callLLM: async (params: { model?: string; systemPrompt?: string; userPrompt?: string }) => {
      llmCapture.lastParams = params;
      return { content: llmCapture.mockContent };
    },
  };
});

import { getModel } from "@/ai/model-selector";
import {
  AXIOS_BRIEF_MAX_CHARS,
  charLength,
  clusterArticlesIntoFiveIssues,
  extractArticleNumericEvidence,
  formatMarketBriefingThreeBullets,
  formatShortIssueSource,
  humanizeBuyerCopy,
  normalizeMarketBriefingPlain,
} from "@/domain/magazine/issue-clustering";
import { NewsletterPreviewCard } from "@/app/(broker)/broker/magazine-editor/_components/NewsletterPreviewCard";
import { AxiosIssuesEditorPanel } from "@/components/magazine-editor/AxiosIssuesEditorPanel";
import { MONTHLY_REGION_PRESETS } from "@/domain/magazine/monthly-stats-charts";
import {
  CURATED_CHANNEL_POOL,
  inferCreArticleSentiment,
  normalizeNewsletterToneStance,
} from "@/domain/magazine/news-channels";
import { buildNewsletterTitlePresets } from "@/lib/magazine/newsletter-cadence";
import {
  buildTf8AxiosClusterPrompt,
  buildTf8CommentPrompt,
  buildTf8DraftPrompt,
  repairUngroundedNumbers,
} from "@/ai/prompts/magazine-taskflow";
import { MagazineQuickDraftCard } from "@/components/broker/studio/MagazineQuickDraftCard";
import { extractMemoStructuredFacts } from "@/lib/deal-card/memo-pairing";
import { DEAL_CARD_LINE_MAX, countDealCardChars } from "@/lib/deal-card/copy-limits";
import { type Card4Data } from "@/lib/deal-card/card4-schema";
import { Card4ConfirmCard } from "@/components/broker/deal-card/Card4ConfirmCard";
import { POST as postDealCardAiCopy } from "@/app/api/broker/deal-card/ai-copy/route";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("1. gpt-6.1-terra 모델 티어 전환 검증", () => {
  it("getModel('terra') 기본값은 gpt-6.1-terra이며 4개 AI 엔드포인트가 모두 terra 티어를 사용한다", () => {
    const prevTerra = process.env.AI_MODEL_TERRA;
    const prevDefault = process.env.AI_DEFAULT_MODEL;
    delete process.env.AI_MODEL_TERRA;
    delete process.env.AI_DEFAULT_MODEL;
    try {
      expect(getModel("terra")).toBe("gpt-6.1-terra");
    } finally {
      if (prevTerra !== undefined) process.env.AI_MODEL_TERRA = prevTerra;
      if (prevDefault !== undefined) process.env.AI_DEFAULT_MODEL = prevDefault;
    }

    const routes = [
      "src/app/api/broker/studio/ai-draft/route.ts",
      "src/app/api/broker/studio/ai-comment/route.ts",
      "src/app/api/broker/studio/ai-news-cluster/route.ts",
      "src/app/api/broker/deal-card/ai-copy/route.ts",
    ];
    for (const rel of routes) {
      const src = fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
      expect(src).toMatch(/getModel\(["']terra["']\)/);
      expect(src).not.toMatch(/getModel\(["']luna["']\)/);
    }
  });
});

describe("2. 뉴스레터 3줄 개조식 & 원문 수치·근거 최우선 기술 고도화", () => {
  it("buildTf8DraftPrompt는 3줄 명사형 개조식(줄당 44자 이내)·확장 FactBook(매물 요약·뉴스 근거·화법)을 주입한다", () => {
    const built = buildTf8DraftPrompt({
      monthLabel: "2026년 11월 4주차 주간호",
      cadence: "weekly",
      preferredRegions: ["강남·서초"],
      dealSummaries: ["역삼 8m 코너 올근생 · 80~90억 · 연 4.3%"],
      newsEvidence: ["상업용 대출 금리 연 4.1%대 진입, 거래량 14% 증가"],
      monthlyStatsSummary: "강남구 거래 23건",
      voicePreset: "yield_focused",
    });

    expect(built.systemPrompt).toContain("[3-Bullet-Executive-Brief]");
    expect(built.systemPrompt).toContain("44자 이내");
    expect(built.systemPrompt).toContain("명사형");
    expect(built.systemPrompt).not.toContain("• 현장 분위기 :");
    expect(built.systemPrompt).toContain("실속·수익형");
    expect(built.userPrompt).toContain("역삼 8m 코너 올근생 · 80~90억 · 연 4.3%");
    expect(built.userPrompt).toContain("상업용 대출 금리 연 4.1%대 진입");
    expect(built.userPrompt).toContain("강남구 거래 23건");
  });

  it("humanizeBuyerCopy·normalizeMarketBriefingPlain·formatMarketBriefingThreeBullets는 줄바꿈을 보존하고 인라인 뷸렛을 3줄 명사형 개조식(<=44자)으로 정규화한다", () => {
    const rawCollapsed =
      "• 현장 분위기 : 이번 주 서초·송파·중구는 실사용과 안정 임대를 함께 보는 매수 문의와 답사 검토가 꾸준히 이어지고 있습니다. • 핵심 수치·변수 : 강남·서초 조달 금리 연 5.2%와 LTV 60% 기준 세입자 계약 상태와 수리 여건을 따져보는 흐름입니다. • 이번 주 체크 : 역세권 코너 건물을 우선 보시고 절세 검토가 필요하시면 답장 주시면 자료 정리해 드립니다.";

    // 1) humanizeBuyerCopy가 \n 줄바꿈을 절대 뭉개지 않음
    const multilineSample = "• 조달 금리 완화 기대 지속\n• 레버리지 부담 경감으로 매수세 유입";
    expect(humanizeBuyerCopy(multilineSample).split("\n")).toHaveLength(2);

    // 2) 기존 DB에 한 줄로 합쳐진 인라인 뷸렛 문자열도 3줄로 자동 분리 복원
    const restored = normalizeMarketBriefingPlain(rawCollapsed, 500, 5);
    expect(restored.split("\n")).toHaveLength(3);
    expect(restored.split("\n").every((line) => line.startsWith("• "))).toBe(true);

    // 3) AI 출력/윤문용 3줄 명사형 개조식 정규화 (앞 라벨 제거 + 명사 종결 + 본문 44자 이내)
    const threeBullets = formatMarketBriefingThreeBullets(rawCollapsed, 44);
    const lines = threeBullets.split("\n");
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line.startsWith("• ")).toBe(true);
      expect(line).not.toMatch(/현장 분위기|핵심 수치·변수|이번 주 체크/);
      expect(line).not.toMatch(/(?:입니다|합니다)\.?$/);
      const bodyOnly = line.replace(/^•\s*/, "");
      expect(charLength(bodyOnly)).toBeLessThanOrEqual(44);
    }
  });

  it("formatShortIssueSource 및 미리보기·에디터 카드가 짧은 출처와 <ul><li> 뷸렛 목록을 일관되게 표시한다", async () => {
    expect(
      formatShortIssueSource({ sources: ["한경 부동산·CRE 리포트"] }),
    ).toBe("한국경제");
    expect(
      formatShortIssueSource({
        sources: ["한국경제 금융·거시", "매일경제 부동산"],
      }),
    ).toBe("한국경제 외 1곳");
    expect(
      formatShortIssueSource({
        sources: [],
        url: "https://www.sedaily.com/NewsList/GB01",
      }),
    ).toBe("서울경제");
    expect(
      formatShortIssueSource({
        sources: ["시장 브리핑", "AI 클러스터링 종합"],
      }),
    ).toBe("");

    const sampleIssues = clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, {
      cadence: "weekly",
    });

    const localContainer = document.createElement("div");
    document.body.appendChild(localContainer);
    const localRoot: Root = createRoot(localContainer);
    try {
      await act(async () => {
        localRoot.render(
          <div>
            <NewsletterPreviewCard
              previewLifecycle="live_draft"
              activeUnitId={null}
              onFocusEditorUnit={() => {}}
              yearMonthLabel="2026년 11월 4주차 주간호"
              marketTemp={null}
              headline="서초·송파·중구 역세권 빌딩 매수 활기"
              brokerName="이상은"
              brokerOffice="크리딜중개"
              brokerPhone="010-1234-5678"
              cadence="weekly"
              monthlyRegion={MONTHLY_REGION_PRESETS[0].key}
              monthlyCharts={[]}
              formattedPreviewBriefing={
                "• 서초·송파 역세권 알짜 빌딩 실사용 문의 지속\n• 담보대출 연 5.2% 기준 우량 임차 건물 선호\n• 코너·가시성 우수 매물 임대 조건 사전 점검"
              }
              unitIssues={sampleIssues}
              selectedDeals={[]}
              dealComments={{}}
              isSectionEnabled={() => true}
            />
            <AxiosIssuesEditorPanel
              unitIssues={sampleIssues}
              onChangeUnitIssues={() => {}}
              newsPool={[...CURATED_CHANNEL_POOL]}
              cadenceLabel="2026년 11월 4주차 주간호"
            />
          </div>,
        );
      });

      const bulletList = localContainer.querySelector(
        '[data-testid="preview-market-briefing-bullets"]',
      );
      expect(bulletList).not.toBeNull();
      expect(bulletList?.querySelectorAll("li")).toHaveLength(3);

      const previewSources = localContainer.querySelectorAll(
        '[data-testid="axios-postit-source"]',
      );
      expect(previewSources.length).toBeGreaterThanOrEqual(5);
      expect(previewSources[0]?.textContent).toBeTruthy();

      const editorSource0 = localContainer.querySelector(
        '[data-testid="axios-editor-issue-source-0"]',
      );
      expect(editorSource0).not.toBeNull();
      expect(editorSource0?.textContent).toBeTruthy();
    } finally {
      act(() => localRoot.unmount());
      localContainer.remove();
    }
  });

  it("extractArticleNumericEvidence와 buildTf8AxiosClusterPrompt는 원문 수치·근거를 최우선 FactBook으로 주입한다", () => {
    const evidence = extractArticleNumericEvidence({
      title: "성수동 꼬마빌딩 평당 1.4억 돌파, 올해 거래 23건 체결",
      summary: "강남권 소형 오피스 공실률 2.6%를 유지하며 임대료가 전년 대비 4.2% 상승했습니다.",
    });
    expect(evidence.some((e) => e.includes("1.4억"))).toBe(true);
    expect(evidence.some((e) => e.includes("23건"))).toBe(true);
    expect(evidence.some((e) => e.includes("2.6%"))).toBe(true);

    const cluster = buildTf8AxiosClusterPrompt({
      cadence: "weekly",
      preferredRegions: ["성수", "강남"],
      candidateIssues: [
        {
          id: "art-num-1",
          title: "성수 빌딩 거래 23건 체결",
          brief: "성수동 빌딩 거래가 이어지고 있습니다.",
          memoTone: "amber",
          channel: "real_estate",
        },
      ],
      sourceArticles: [
        {
          id: "art-num-1",
          title: "성수동 꼬마빌딩 평당 1.4억 돌파, 올해 거래 23건 체결",
          summary: "IT·패션 법인의 사옥 매입 비중이 60% 이상을 차지하며 공실률 2.6%를 기록했습니다.",
          url: "https://example.com/1",
          source: "테스트경제",
          importance_score: 9,
        },
      ],
    });
    expect(AXIOS_BRIEF_MAX_CHARS).toBe(96);
    expect(cluster.systemPrompt).toContain("[Data-Evidence-First]");
    expect(cluster.userPrompt).toContain("검증된 원문 수치·근거(최우선 반영):");
    expect(cluster.userPrompt).toContain("1.4억");
  });

  it("repairUngroundedNumbers는 '주요 수준' 기계 치환 대신 자연어로 교정한다", () => {
    const { repairedText } = repairUngroundedNumbers(
      "금리 3.9% 수준에서 320억 매물 거래가 14건 늘었습니다.",
      "역삼동 꼬마빌딩 추천",
    );
    expect(repairedText).not.toContain("주요 수준");
    expect(repairedText).not.toContain("3.9%");
    expect(repairedText).toContain("시장 평균 범위");
    expect(repairedText).toContain("합리적 수준");
  });

  it("buildTf8CommentPrompt는 매물 메타와 attemptSeed 3-Angle 훅을 반영한다", () => {
    const a0 = buildTf8CommentPrompt({
      comment: "역삼역 도보 3분 코너",
      dealTitle: "역삼 코너 올근생",
      regionFocus: "강남구 역삼동",
      priceBand: "80~90억",
      points: ["8m 코너 입지", "전 층 만실", "2021 올리모델링"],
      attemptSeed: 0,
    });
    const a1 = buildTf8CommentPrompt({
      comment: "역삼역 도보 3분 코너",
      attemptSeed: 1,
    });
    expect(a0.userPrompt).toContain("역삼 코너 올근생");
    expect(a0.userPrompt).toContain("희소성·입지 강조");
    expect(a1.userPrompt).toContain("임차·수익 안정성 강조");
  });
});

describe("3. 딜카드 8대 팩트 추출 · 6+ 후보 생성 API · 양방향 스왑 UI", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("extractMemoStructuredFacts는 도로폭·자주식 주차·승강기·리모델링·만실·업종(블라인드)·용적률·평당가를 안전 추출한다", () => {
    const memo =
      "강남구 역삼동 123-45, 역삼역 도보 3분 8m 코너, 2021년 올리모델링 완료, 승강기 있음, 자주식 주차 6대, 1층 스타벅스 입점 전 층 만실, 수익률 4.3%, 잔여 용적률 여유, 토지 평당 9,500만원대";
    const facts = extractMemoStructuredFacts(memo);

    expect(facts.yieldPct).toBe(4.3);
    expect(facts.remodelingYear).toBe(2021);
    expect(facts.subwayWalkMinutes).toBe(3);
    expect(facts.roadWidthMeters).toBe(8);
    expect(facts.roadContact).toContain("8m");
    expect(facts.parkingCount).toBe(6);
    expect(facts.parkingType).toBe("자주식");
    expect(facts.hasElevator).toBe(true);
    expect(facts.occupancyStatus).toBe("전 층 만실");
    expect(facts.anchorCategory).toBe("대형 카페·식음료");
    expect(facts.farPotential).toContain("용적률");
    expect(facts.landUnitPriceHint).toContain("9,500");
    expect(facts.memoSummary).not.toContain("스타벅스");
    expect(facts.memoSummary).not.toContain("123-45");
  });

  it("POST /api/broker/deal-card/ai-copy는 gpt-6.1-terra로 6개 이상 후보(추천 3 + 예비 3+)를 생성·보장한다", async () => {
    llmCapture.mockContent = JSON.stringify({
      headline: "역삼 8m 코너 만실 올근생",
      points: [
        "전 층 만실·연 4.3% 권역 평균 상회",
        "역 도보 3분 8m 코너, 1층 카페 입점",
        "2021년 올리모델링, 추가 수리 불필요",
      ],
      pointCandidates: [
        { text: "전 층 만실·연 4.3% 권역 평균 상회", axis: "yield", recommended: true },
        { text: "역 도보 3분 8m 코너, 1층 카페 입점", axis: "location", recommended: true },
        { text: "2021년 올리모델링, 추가 수리 불필요", axis: "building", recommended: true },
        { text: "승강기·자주식 6대, 도심 주차 경쟁력", axis: "building", recommended: false },
      ],
    });

    const req = new NextRequest("http://localhost/api/broker/deal-card/ai-copy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "both",
        posture: "income",
        region: "강남구 역삼동",
        use: "근린생활시설",
        area: "연면적 280평",
        priceBand: "80~90억",
        facts: {
          yieldPct: 4.3,
          remodelingYear: 2021,
          subwayWalkMinutes: 3,
          roadWidthMeters: 8,
          roadContact: "8m 코너 입지",
          parkingCount: 6,
          parkingType: "자주식",
          hasElevator: true,
          occupancyStatus: "전 층 만실",
          anchorCategory: "대형 카페·식음료",
        },
      }),
    });

    const res = await postDealCardAiCopy(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(llmCapture.lastParams?.model).toBe("gpt-6.1-terra");
    expect(json.result.points).toHaveLength(3);
    expect(json.result.pointCandidates.length).toBeGreaterThanOrEqual(6);
    for (const c of json.result.pointCandidates) {
      expect(countDealCardChars(c.text)).toBeLessThanOrEqual(DEAL_CARD_LINE_MAX);
    }
  });

  it("Card4ConfirmCard는 예비 후보 트레이를 렌더링하고 교체 클릭 시 기존 장점을 후보 풀로 보존(양방향 스왑)한다", async () => {
    function SwapHarness() {
      const [card4, setCard4] = useState<Card4Data>({
        headline: "역삼 8m 코너 만실 올근생",
        posture: "income",
        region: "강남구 역삼동",
        use: "근린생활시설",
        area: "연면적 280평",
        priceBand: "80~90억",
        points: [
          "전 층 만실·연 4.3% 권역 평균 상회",
          "역 도보 3분 8m 코너 입점",
          "2021년 올리모델링 완료",
        ],
        pointCandidates: [
          { text: "전 층 만실·연 4.3% 권역 평균 상회", axis: "yield" },
          { text: "역 도보 3분 8m 코너 입점", axis: "location" },
          { text: "2021년 올리모델링 완료", axis: "building" },
          { text: "승강기·자주식 6대 주차 편리", axis: "building" },
          { text: "8m 양면 코너 간판 노출 우수", axis: "scarcity" },
          { text: "임대수익 후 사옥 전환 가능", axis: "value" },
        ],
        provenance: { points: ["ai", "ai", "ai"] },
        card4_version: 1,
      });
      return <Card4ConfirmCard card4={card4} onChange={setCard4} />;
    }

    await act(async () => {
      root.render(<SwapHarness />);
    });

    expect(container.querySelector('[data-testid="card4-ai-candidates-tray"]')).not.toBeNull();
    const swapBtn = container.querySelector('[data-testid="card4-swap-candidate-0-to-0"]') as HTMLButtonElement;
    expect(swapBtn).not.toBeNull();

    await act(async () => {
      swapBtn.click();
    });

    const slot0Input = container.querySelector('[data-testid="card4-point-input-0"]') as HTMLInputElement;
    expect(slot0Input.value).toBe("승강기·자주식 6대 주차 편리");
    // 기존 1번 장점("전 층 만실·연 4.3% 권역 평균 상회")은 삭제되지 않고 후보 트레이로 내려와 있어야 한다
    expect(container.querySelector('[data-testid="card4-ai-candidates-tray"]')?.textContent).toContain(
      "전 층 만실·연 4.3% 권역 평균 상회",
    );
  });
});

describe("4. 뉴스레터 거래 온도 3단계(긍정 기본값 · 중립 · 보수·신중) 선별 및 카피라이팅", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("기본 거래 온도는 'positive'이며 inferCreArticleSentiment가 호재·보수·중립 기사를 정확히 분류한다", () => {
    expect(normalizeNewsletterToneStance(undefined)).toBe("positive");
    expect(normalizeNewsletterToneStance("invalid-value")).toBe("positive");
    expect(normalizeNewsletterToneStance("negative")).toBe("negative");

    expect(
      inferCreArticleSentiment({
        title: "강남 역세권 꼬마빌딩 거래량 18% 증가, 시중 금리 인하 기대 확산",
        summary: "사옥 수요 유입으로 공실 해소가 빨라지고 있습니다.",
      }),
    ).toBe("bullish");

    expect(
      inferCreArticleSentiment({
        title: "상권별 공실 양극화 심화, 대출 이자 부담·역마진 점검 필수",
        summary: "이면도로 노후 건물은 임대료 정체와 공실 위험에 유의해야 합니다.",
      }),
    ).toBe("bearish");

    expect(
      inferCreArticleSentiment({
        title: "국토교통부 건축물대장 표기 기준 행정 안내 공고",
        summary: "이번 달부터 온라인 열람 서식이 개편됩니다.",
      }),
    ).toBe("neutral");
  });

  it("clusterArticlesIntoFiveIssues는 positive일 때 호재 이슈를, negative일 때 보수·점검 이슈를 우선 선별한다", () => {
    const posIssues = clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, {
      cadence: "monthly",
      toneStance: "positive",
    });
    const negIssues = clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, {
      cadence: "monthly",
      toneStance: "negative",
    });

    expect(posIssues).toHaveLength(5);
    expect(negIssues).toHaveLength(5);

    const posBearCount = posIssues.filter((u) => u.id.includes("-bear-")).length;
    const negBearCount = negIssues.filter((u) => u.id.includes("-bear-")).length;
    expect(posBearCount).toBe(0);
    expect(negBearCount).toBeGreaterThanOrEqual(4);
  });

  it("TF8 프롬프트 빌더와 제목 프리셋은 기본값 'positive'를 적용하고 negative 전환 시 보수·점검 프레이밍으로 전환한다", () => {
    const defaultDraft = buildTf8DraftPrompt({
      monthLabel: "2026년 11월호",
      cadence: "monthly",
    });
    const cautiousDraft = buildTf8DraftPrompt({
      monthLabel: "2026년 11월호",
      cadence: "monthly",
      toneStance: "negative",
    });
    const neutralCluster = buildTf8AxiosClusterPrompt({
      cadence: "weekly",
      toneStance: "neutral",
      candidateIssues: [
        {
          id: "c1",
          title: "강남 꼬마빌딩 거래 동향",
          brief: "거래 동향 점검입니다.",
          memoTone: "amber",
          channel: "real_estate",
        },
      ],
      sourceArticles: [],
    });
    const cautiousComment = buildTf8CommentPrompt({
      comment: "전 층 만실 역세권 근생",
      toneStance: "negative",
    });

    expect(defaultDraft.systemPrompt).toContain("[Tone-Temperature-Framing]");
    expect(defaultDraft.systemPrompt).toContain("긍정적 (매수 활기)");
    expect(cautiousDraft.systemPrompt).toContain("보수·신중 (조정·점검)");
    // 3줄 명사형 개조식(44자 이내) 규칙은 어느 온도에서나 불변 유지
    expect(cautiousDraft.systemPrompt).toContain("[3-Bullet-Executive-Brief]");
    expect(cautiousDraft.systemPrompt).toContain("44자 이내");
    expect(cautiousDraft.systemPrompt).not.toContain("• 현장 분위기 :");
    expect(neutralCluster.systemPrompt).toContain("중립적 (균형·선별)");
    expect(cautiousComment.systemPrompt).toContain("보수·신중 (조정·점검)");

    const posPresets = buildNewsletterTitlePresets("한결", "monthly", 11, "positive");
    const negPresets = buildNewsletterTitlePresets("한결", "monthly", 11, "negative");
    expect(posPresets[0]).toContain("한결");
    expect(negPresets[0]).toContain("한결");
    expect(posPresets[0]).not.toBe(negPresets[0]);
  });

  it("MagazineQuickDraftCard는 기본 거래 온도로 '긍정적'이 선택되어 있고 보수·신중 전환 시 API와 재선별 콜백에 반영한다", async () => {
    const captured: { body: Record<string, unknown> | null } = { body: null };
    const onReclusterWithTone = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      captured.body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            headline: "조정기 실속 급매·수익률 점검 브리핑",
            summary: "",
            briefingTitle: "",
            briefingBody:
              "• 현장 분위기 : 공실과 임대수익률을 차분히 따져보는 선별 장세입니다.\n• 핵심 수치·변수 : 대출 이자 대비 순수익 여유 폭 점검이 중요합니다.\n• 이번 주 체크 : 아래 만실 매물의 임대내역이 궁금하시면 편하게 답장해 주세요.",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    await act(async () => {
      root.render(
        <MagazineQuickDraftCard
          monthLabel="2026년 11월호"
          cadence="monthly"
          onReclusterWithTone={onReclusterWithTone}
          currentDraft={{ headline: "", summary: "", briefingTitle: "", briefingBody: "" }}
          onApplyDraft={() => {}}
        />,
      );
    });

    const posBtn = container.querySelector('[data-testid="ai-draft-tone-positive"]') as HTMLButtonElement;
    const negBtn = container.querySelector('[data-testid="ai-draft-tone-negative"]') as HTMLButtonElement;
    expect(posBtn.getAttribute("aria-pressed")).toBe("true");
    expect(negBtn.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      negBtn.click();
    });
    expect(negBtn.getAttribute("aria-pressed")).toBe("true");

    const reclusterBtn = container.querySelector('[data-testid="ai-recluster-by-tone-btn"]') as HTMLButtonElement;
    expect(reclusterBtn).not.toBeNull();
    await act(async () => {
      reclusterBtn.click();
    });
    expect(onReclusterWithTone).toHaveBeenCalledWith("negative");

    const draftBtn = container.querySelector('[data-testid="ai-draft-btn"]') as HTMLButtonElement;
    await act(async () => {
      draftBtn.click();
    });
    expect(captured.body?.toneStance).toBe("negative");
  });
});

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
  extractArticleNumericEvidence,
  normalizeMarketBriefingPlain,
} from "@/domain/magazine/issue-clustering";
import {
  buildTf8AxiosClusterPrompt,
  buildTf8CommentPrompt,
  buildTf8DraftPrompt,
  repairUngroundedNumbers,
} from "@/ai/prompts/magazine-taskflow";
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
  it("buildTf8DraftPrompt는 3줄 개조식·존댓말 통일·확장 FactBook(매물 요약·뉴스 근거·화법)을 주입한다", () => {
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
    expect(built.systemPrompt).toContain("• 현장 분위기 :");
    expect(built.systemPrompt).toContain("• 핵심 수치·변수 :");
    expect(built.systemPrompt).toContain("• 이번 주 체크 :");
    expect(built.systemPrompt).toContain("실속·수익형");
    expect(built.systemPrompt).not.toContain("모든 문장이 '~다.'로 끝나는가");
    expect(built.userPrompt).toContain("역삼 8m 코너 올근생 · 80~90억 · 연 4.3%");
    expect(built.userPrompt).toContain("상업용 대출 금리 연 4.1%대 진입");
    expect(built.userPrompt).toContain("강남구 거래 23건");
  });

  it("normalizeMarketBriefingPlain은 3줄 개조식(• ) 구조를 손상 없이 보존한다", () => {
    const bullets = [
      "• 현장 분위기 : 이번 주 강남·성수 권역은 만실 올근생 문의가 이어지고 있습니다.",
      "• 핵심 수치·변수 : 상업용 대출 금리가 연 4.1%대로 내려오며 매수 부담이 완화되었습니다.",
      "• 이번 주 체크 : 아래 추천 매물의 상세 임대내역이 필요하시면 편하게 답장해 주세요.",
    ].join("\n");
    const plain = normalizeMarketBriefingPlain(bullets, 500, 5);
    expect(plain.split("\n")).toHaveLength(3);
    expect(plain.split("\n").every((line) => line.startsWith("• "))).toBe(true);
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

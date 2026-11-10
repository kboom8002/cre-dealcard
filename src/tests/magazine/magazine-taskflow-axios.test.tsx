import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/broker/magazine-editor",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import MagazineEditorPage from "@/app/(broker)/broker/magazine-editor/page";
import { NewsSection } from "@/components/magazine/viewer-sections";
import {
  BROKER_REGION_PRESETS,
  expandRegionKeywords,
  extractRegionsFromDeals,
  normalizeBrokerPreferences,
} from "@/domain/magazine/broker-preferences";
import { isCreRelevantArticle } from "@/domain/magazine/news-channels";
import {
  ISSUE_CARD_COUNT,
  clusterArticlesIntoFiveIssues,
  formatAxiosCardTitle,
  formatAxiosTwoLineBrief,
} from "@/domain/magazine/issue-clustering";
import {
  buildTf8AxiosClusterPrompt,
  buildTf8CommentPrompt,
  buildTf8DraftPrompt,
  repairAxiosClusterOutputBlock,
  repairCommentOutputBlock,
  repairDraftOutputBlock,
  repairUngroundedNumbers,
} from "@/ai/prompts/magazine-taskflow";
import { AgentOutputEnvelopeSchema } from "@/ai/envelope";
import { CrePromptRegistry } from "@/domain/building/mobile-im/cre-prompt-registry";

describe("1. 중개인 개인 설정(권역 · 뉴스 큐레이션 분야) 및 가십 필터링 클러스터링", () => {
  it("중개인 권역 프리셋 확장 및 보유 매물 기반 권역 추출이 정확히 동작한다", () => {
    expect(BROKER_REGION_PRESETS.length).toBeGreaterThanOrEqual(8);
    const expanded = expandRegionKeywords(["강남·서초", "마포·홍대·합정"]);
    expect(expanded).toContain("역삼");
    expect(expanded).toContain("테헤란로");
    expect(expanded).toContain("동교");
    expect(expanded).toContain("연남");

    const dealRegions = extractRegionsFromDeals([
      { title: "동교동 사옥 빌딩", address: "서울시 마포구 동교동 204-28" },
      { title: "역삼동 코너 빌딩", address: "서울시 강남구 역삼동 823" },
    ]);
    expect(dealRegions).toContain("마포·홍대·합정");
    expect(dealRegions).toContain("강남·서초");

    const prefs = normalizeBrokerPreferences({
      preferredRegions: ["성수·왕십리", "강남·서초"],
      preferredChannels: ["real_estate", "tax_wealth"],
    });
    expect(prefs.preferredRegions).toEqual(["성수·왕십리", "강남·서초"]);
    expect(prefs.preferredChannels).toEqual(["real_estate", "tax_wealth"]);
  });

  it("연예인·가십성 자택 경매 기사('유명 여가수 200억짜리 집 경매 나왔다')를 100% 차단하고 선호 권역·채널 기사를 우선 클러스터링한다", () => {
    expect(
      isCreRelevantArticle({
        title: "유명 여가수 200억짜리 집 경매 나왔다",
        summary: "연예인 자택 빌라가 경매에 부쳐졌다.",
      }),
    ).toBe(false);
    expect(
      isCreRelevantArticle({
        title: "아이돌 스타 청담동 펜트하우스 낙찰 화제",
        summary: "유명 가수의 아파트 경매 소식",
      }),
    ).toBe(false);
    expect(
      isCreRelevantArticle({
        title: "마포·홍대입구역 인근 중소형 꼬마빌딩 사옥 매수 문의 증가",
        summary: "동교동·연남동 일대 근생 빌딩 리모델링 수요가 이어지고 있습니다.",
      }),
    ).toBe(true);

    const candidatePool = [
      {
        id: "gossip-1",
        title: "유명 여가수 200억짜리 집 경매 나왔다",
        summary: "연예인 자택 경매 가십 기사입니다.",
        topic: "auction",
        channel: "real_estate",
        importance_score: 10,
      },
      {
        id: "mapo-re-1",
        title: "마포·동교동 역세권 꼬마빌딩, 홍대 상권 회복에 사옥·리테일 매수세 유입",
        summary:
          "핵심 팩트: 마포구 동교동·연남동 일대 역세권 근생 빌딩에 법인 사옥 및 플래그십 임차 수요가 빠르게 유입되고 있습니다. | 브로커 임플리케이션: 대지 지분 가치가 높은 코너 건물의 리모델링 밸류애드 전략이 유효합니다.",
        source: "한경 부동산",
        topic: "transaction",
        channel: "real_estate",
        importance_score: 8,
      },
      {
        id: "tax-1",
        title: "꼬마빌딩 증여·상속 감정평가 과세 강화에 따른 사전 절세 전략 점검",
        summary:
          "핵심 팩트: 비주거용 빌딩 증여 시 시가 감정평가 기준이 강화되면서 사전 감정평가와 부담부증여 비교가 필수입니다. | 브로커 임플리케이션: 장기 보유 건물주 고객에게 세무 점검 브리핑을 제안할 시점입니다.",
        source: "매경 세무",
        topic: "tax",
        channel: "tax_wealth",
        importance_score: 8,
      },
    ];

    const clustered = clusterArticlesIntoFiveIssues(candidatePool, {
      preferredRegions: ["마포·홍대·합정"],
      preferredChannels: ["real_estate", "tax_wealth"],
    });

    expect(clustered).toHaveLength(ISSUE_CARD_COUNT);
    const allTitles = clustered.map((c) => c.title).join(" ");
    expect(allTitles).not.toContain("여가수");
    expect(clustered[0].id).toBe("mapo-re-1");
    expect(clustered.every((c) => c.channel === "real_estate" || c.channel === "tax_wealth")).toBe(
      true,
    );
  });
});

describe("2. 고객 화면 카드뉴스 글래스 뷰 (제목 36자 + 해설 48자, 잘림 0건)", () => {
  it("formatAxiosCardTitle 은 36자 이내 완결 명사구로 압축하고, formatAxiosTwoLineBrief 는 내부 라벨 없이 48자 이내 완결 문장으로 압축한다", () => {
    const title = formatAxiosCardTitle(
      "[한국경제] 강남·서초 역세권 꼬마빌딩, 금리 인하 기대감에 법인 사옥 매수세 뚜렷한 회복",
    );
    expect(title).not.toContain("[한국경제]");
    expect(Array.from(title).length).toBeLessThanOrEqual(36);
    expect(Array.from(title).length).toBeGreaterThanOrEqual(8);
    expect(title).not.toMatch(/…|\.\.\./);

    const brief = formatAxiosTwoLineBrief(
      "핵심 팩트: 기준금리 인하 기대감으로 강남·서초 중소형 빌딩 매수 문의가 빠르게 늘고 있습니다. | 브로커 임플리케이션: 대출 금리 하향 안정기에 맞춰 역세권 우량 매물을 선점하는 전략이 유리합니다. | 추천 액션: 4%대 수익형 빌딩을 검토하세요.",
      { channel: "real_estate" },
    );
    expect(brief).not.toContain("|");
    expect(brief).not.toContain("핵심 팩트:");
    expect(brief).not.toContain("브로커 임플리케이션:");
    expect(brief).not.toContain("추천 액션:");
    expect(Array.from(brief).length).toBeLessThanOrEqual(48);
    expect(brief).toMatch(/다\.$/);
  });

  it("NewsSection 이 글래스 카드(data-card-style='glass')를 line-clamp/truncate 없이 한 단계 작은 폰트로 렌더링한다", () => {
    const issues = clusterArticlesIntoFiveIssues([], {
      preferredRegions: ["강남·서초"],
      preferredChannels: ["real_estate", "economy_finance"],
    });

    const html = renderToStaticMarkup(
      <NewsSection items={[]} unitIssues={issues} cadence="monthly" />,
    );

    expect(html).toContain('data-testid="axios-postit-list"');
    expect((html.match(/data-testid="axios-postit-card"/g) ?? []).length).toBe(5);
    expect((html.match(/data-card-style="glass"/g) ?? []).length).toBe(5);
    expect(html).toContain('data-axios-headline-lines="2"');
    expect(html).toContain('data-axios-brief-lines="2"');
    expect(html).not.toMatch(/data-testid="axios-postit-title"[^>]*class="[^"]*(?:line-clamp|truncate|whitespace-nowrap)/);
    expect(html).not.toMatch(/data-testid="axios-postit-brief"[^>]*class="[^"]*(?:line-clamp|truncate|whitespace-nowrap)/);
    expect(html).toMatch(/data-testid="axios-postit-title"[^>]*class="[^"]*text-\[17px\]/);
    expect(html).toMatch(/data-testid="axios-postit-brief"[^>]*class="[^"]*text-\[14px\]/);
  });
});
describe("3. AI Core (AgentOutputEnvelope) & TaskFlow (TF8 + M11 핀포인트 교정) 프롬프트 하드닝", () => {
  it("TF8 프롬프트 빌더 3종이 [T][K][W][O][A][S][L][F] 8대 블록을 모두 포함하고 CrePromptRegistry 에 등록되어 있다", () => {
    const registry = CrePromptRegistry.getInstance();
    expect(registry.getActivePrompt("magazine_draft_tf8")?.id).toBe("magazine_draft_tf8_v3");
    expect(registry.getActivePrompt("magazine_axios_cluster_tf8")?.id).toBe(
      "magazine_axios_cluster_tf8_v3",
    );
    expect(registry.getActivePrompt("magazine_comment_tf8")?.id).toBe("magazine_comment_tf8_v2");

    const draftPrompt = buildTf8DraftPrompt({
      monthLabel: "2026년 11월호",
      preferredRegions: ["강남·서초", "마포·홍대·합정"],
      preferredChannels: ["real_estate", "tax_wealth"],
      dealTitles: ["동교동 77억 꼬마빌딩"],
    });

    const combinedDraft = `${draftPrompt.systemPrompt}\n${draftPrompt.userPrompt}`;
    for (const tag of ["[T]", "[A]", "[W]", "[O]", "[L]", "[F]", "[S]", "[K]"]) {
      expect(combinedDraft).toContain(tag);
    }
    expect(combinedDraft).toContain("강남·서초, 마포·홍대·합정");
    expect(combinedDraft).toContain("동교동 77억 꼬마빌딩");

    const clusterPrompt = buildTf8AxiosClusterPrompt({
      preferredRegions: ["강남·서초"],
      preferredChannels: ["real_estate"],
      candidateIssues: clusterArticlesIntoFiveIssues([], { preferredRegions: ["강남·서초"] }),
    });
    expect(clusterPrompt.systemPrompt).toContain("[Card-News 2-Line Title]");
    expect(clusterPrompt.systemPrompt).toContain("[AXIOS 2-Line Subtitle Brief]");

    const commentPrompt = buildTf8CommentPrompt({
      comment: "역삼역 도보 3분 코너 빌딩, 사옥 겸 임대 추천",
    });
    expect(commentPrompt.systemPrompt).toContain("[No-LLM-Numbers]");
  });

  it("M11 핀포인트 교정기(repairDraftOutputBlock, repairAxiosClusterOutputBlock, repairCommentOutputBlock)가 미출처 숫자와 금지어를 교정하고 AI Core Envelope 을 반환한다", () => {
    const numRepaired = repairUngroundedNumbers(
      "동교동 77억 빌딩 인근 공실률이 2.4%로 낮아지고 거래가 18건 발생했습니다.",
      "동교동 77억 빌딩 추천",
    );
    expect(numRepaired.repairedText).toContain("77억");
    expect(numRepaired.repairedText).not.toContain("2.4%");
    expect(numRepaired.repairedText).not.toContain("18건");
    expect(numRepaired.strippedNumbers).toEqual(["2.4", "18"]);

    const draftRepaired = repairDraftOutputBlock(
      {
        headline: "2026년 11월 강남·서초 원금 보장 빌딩 브리핑",
        summary: "수익률 9.8% 확정 수익 매물과 시장 흐름을 소개합니다.",
        briefingTitle: "■ 소제목 입력",
        briefingBody: "강남·서초 권역에서 공실률 1.9% 기록과 함께 무조건 상승 흐름이 이어지고 있습니다.",
      },
      "2026년 11월호 강남·서초 빌딩",
      { monthLabel: "2026년 11월호", preferredRegions: ["강남·서초"] },
    );

    expect(draftRepaired.result.headline).not.toContain("원금 보장");
    expect(draftRepaired.result.summary).not.toContain("확정 수익");
    expect(draftRepaired.result.summary).not.toContain("9.8%");
    expect(draftRepaired.result.briefingTitle).not.toContain("소제목 입력");
    expect(draftRepaired.result.briefingBody).not.toContain("무조건 상승");
    expect(draftRepaired.result.briefingBody).not.toContain("1.9%");
    expect(AgentOutputEnvelopeSchema.safeParse(draftRepaired.envelope).success).toBe(true);

    const fallbackIssues = clusterArticlesIntoFiveIssues([], {
      preferredRegions: ["강남·서초"],
    });
    const clusterRepaired = repairAxiosClusterOutputBlock(
      [
        {
          id: "bad-gossip",
          title: "유명 여가수 200억짜리 집 경매 나왔다",
          brief: "연예인 경매 소식입니다.",
        },
        ...fallbackIssues.slice(1),
      ],
      fallbackIssues,
      "강남·서초 빌딩 시장",
    );
    expect(clusterRepaired.unitIssues).toHaveLength(5);
    expect(clusterRepaired.unitIssues[0].title).not.toContain("여가수");
    expect(AgentOutputEnvelopeSchema.safeParse(clusterRepaired.envelope).success).toBe(true);

    const commentRepaired = repairCommentOutputBlock(
      "역삼동 85억 빌딩으로 수익률 12.5% 원금 보장 매물입니다.",
      "역삼동 85억 빌딩",
    );
    expect(commentRepaired.comment).toContain("85억");
    expect(commentRepaired.comment).not.toContain("12.5%");
    expect(commentRepaired.comment).not.toContain("원금 보장");
    expect(AgentOutputEnvelopeSchema.safeParse(commentRepaired.envelope).success).toBe(true);
  });

  it("뉴스레터 스튜디오(/broker/magazine-editor)가 중개인 권역·분야 설정 카드와 실시간 포스트잇 미리보기를 렌더링한다", () => {
    const html = renderToStaticMarkup(<MagazineEditorPage />);
    expect(html).toContain('data-testid="broker-newsletter-preferences-card"');
    expect(html).toContain('data-testid="pref-region-chip-gbd"');
    expect(html).toContain('data-testid="pref-region-chip-mapo"');
    expect(html).toContain('data-testid="pref-channel-chip-real_estate"');
    expect(html).toContain('data-testid="pref-channel-chip-tax_wealth"');
    expect(html).toContain('data-testid="preview-axios-postit-section"');
    expect(html).toContain('data-testid="preview-postit-card-0"');
  });
});

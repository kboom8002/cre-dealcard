// @vitest-environment jsdom
/**
 * 2026-11 뉴스레터 4대 개편 & 70대 매수자 눈높이 카피라이팅 회귀 방어 스위트
 *
 * 1. 5줄(500자 이내) 순수 시장 브리핑 + 통일 5단계(제목 → 시장브리핑 → 이슈 → 매물 → 연락처) +
 *    {중개인명} + {자주 쓰는 제목} 프리셋 + AI 윤문(mode="market_briefing")
 * 2. 모바일 독자 화면 하단 유틸리티 바·ROI 계산기·투표 제거 및 최소 뉴스레터 신청 옵트인만 유지
 * 3. 이슈 번호(ISSUE 01~05 / 이슈 1) 제거 및 분야 배지·드롭다운만 간결히 표기
 * 4. 70대 매수자 쉬운 우리말 카피 + 44자(2줄)/74자(3줄) 예산 + TF8 프롬프트 하드닝 + line-clamp/truncate 0건
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/broker/magazine-editor",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { IssueMetadataForm } from "@/components/magazine-editor/IssueMetadataForm";
import { AxiosIssuesEditorPanel } from "@/components/magazine-editor/AxiosIssuesEditorPanel";
import { AiCommentRecommendButton } from "@/components/broker/studio/AiCommentRecommendButton";
import { NewsSection } from "@/components/magazine/viewer-sections";
import { MagazineView } from "@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view";
import { buildNewsletterTitlePresets } from "@/lib/magazine/newsletter-cadence";
import {
  AXIOS_BRIEF_MAX_CHARS,
  AXIOS_TITLE_MAX_CHARS,
  charLength,
  clusterArticlesIntoFiveIssues,
  humanizeBuyerCopy,
  isDanglingKoreanWord,
  normalizeMarketBriefingPlain,
} from "@/domain/magazine/issue-clustering";
import { CURATED_CHANNEL_POOL } from "@/domain/magazine/news-channels";
import {
  buildTf8AxiosClusterPrompt,
  buildTf8BriefingPolishPrompt,
  repairBriefingPolishOutputBlock,
} from "@/ai/prompts/magazine-taskflow";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("요구사항 1: 제목 프리셋 + 5줄(500자) 순수 브리핑 + AI 윤문 + 통일 5단계", () => {
  it("buildNewsletterTitlePresets는 주기(daily/weekly/monthly)별 {중개인명} + {제목명} 4종을 반환하고 IssueMetadataForm이 #newsletter-summary-input 없이 렌더링한다", () => {
    const daily = buildNewsletterTitlePresets("이상은", "daily", 11);
    const weekly = buildNewsletterTitlePresets("이상은 공인중개사", "weekly", 11);
    const monthly = buildNewsletterTitlePresets("이상은", "monthly", 11);

    expect(daily).toHaveLength(4);
    expect(weekly).toHaveLength(4);
    expect(monthly).toHaveLength(4);
    for (const preset of [...daily, ...weekly, ...monthly]) {
      expect(preset).toContain("이상은 중개사의");
    }
    expect(monthly[0]).toContain("11월");

    const onChangeHeadline = vi.fn();
    render(
      <IssueMetadataForm
        year={2026}
        month={11}
        headline=""
        brokerName="이상은"
        cadence="weekly"
        onChangeHeadline={onChangeHeadline}
      />,
    );

    expect(document.querySelector("#newsletter-summary-input")).toBeNull();
    expect(screen.getByTestId("newsletter-title-presets")).toBeTruthy();
    const chip0 = screen.getByTestId("title-preset-chip-0");
    expect(chip0.textContent).toContain("이상은 중개사의");
    fireEvent.click(chip0);
    expect(onChangeHeadline).toHaveBeenCalledWith(weekly[0]);
  });

  it("normalizeMarketBriefingPlain은 소제목·마크다운·구분선을 제거하고 5줄·500자 이내 순수 텍스트로 정돈한다", () => {
    const messy = [
      "■ 강남 빌딩 핵심 동향",
      "**금리 인하 기대감**으로 우량 빌딩 문의가 늘었습니다.",
      "────────────────",
      "둘째 줄 시장 흐름입니다.",
      "셋째 줄 임차인 동향입니다.",
      "넷째 줄 세무 유의사항입니다.",
      "다섯째 줄 현장 체크포인트입니다.",
      "여섯째 줄 추가 메모입니다.",
    ].join("\n");

    const plain = normalizeMarketBriefingPlain(messy, 500, 5);
    expect(plain).not.toContain("■");
    expect(plain).not.toContain("**");
    expect(plain).not.toContain("────");
    expect(plain.split("\n").length).toBeLessThanOrEqual(5);
    expect(charLength(plain)).toBeLessThanOrEqual(500);

    const overLong = `${"서울 역세권 근린생활시설 빌딩의 실수요 매수세가 꾸준히 이어지고 있으며 세입자 업종과 계약 조건을 함께 살피셔야 유리합니다. ".repeat(6)}`;
    const clamped = normalizeMarketBriefingPlain(overLong, 500, 5);
    expect(charLength(clamped)).toBeLessThanOrEqual(500);
    expect(clamped).not.toMatch(/…|\.\.\./);
  });

  it("buildTf8BriefingPolishPrompt 및 repairBriefingPolishOutputBlock은 5줄·500자 순수 윤문을 강제하고 미출처 숫자를 차단한다", () => {
    const prompt = buildTf8BriefingPolishPrompt({
      draftText: "요즘 성수동 코너 빌딩 찾는 분이 늘었고 대출 이자 부담도 조금 덜해진 분위기",
      cadence: "weekly",
      regionFocus: "성수·강남",
    });
    expect(prompt.spec.slotKey).toBe("magazine_briefing_polish_tf8");
    expect(prompt.systemPrompt).toContain("[Strict-5-Line-500-Char]");
    expect(prompt.systemPrompt).toContain("[70s-Buyer-Plain-Korean]");

    const repaired = repairBriefingPolishOutputBlock(
      "■ AI 추천 소제목\n**성수·강남** 레버리지와 스프레드 부담이 낮아져 수익률 14.2% 확정 수익이 기대됩니다.",
      "요즘 성수동 코너 빌딩 찾는 분이 늘었고 대출 이자 부담도 조금 덜해진 분위기",
    );
    expect(repaired.comment).not.toContain("■");
    expect(repaired.comment).not.toContain("14.2%");
    expect(repaired.comment).not.toContain("확정 수익");
    expect(repaired.comment).not.toMatch(/레버리지|스프레드/);
    expect(repaired.comment.split("\n").length).toBeLessThanOrEqual(5);
    expect(charLength(repaired.comment)).toBeLessThanOrEqual(500);
  });

  it("AiCommentRecommendButton(mode='market_briefing')은 중개인 초안으로 /api/broker/studio/ai-comment를 호출해 윤문 결과를 반영한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        ok: true,
        result: {
          comment:
            "요즘 역세권 빌딩을 사옥 겸 임대용으로 찾는 분이 늘고 있습니다.\n대출 이자 부담이 줄며 자금 계획 세우기도 한결 수월해졌습니다.",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const onChangeValue = vi.fn();
    render(
      <AiCommentRecommendButton
        mode="market_briefing"
        cadence="weekly"
        currentValue="역세권 빌딩 문의 늘고 금리도 안정세"
        fallbackContext="제목: 이상은 중개사의 이번 주 빌딩 시장 브리핑"
        onChangeValue={onChangeValue}
        testId="ai-polish-briefing-btn"
        label="AI로 5줄 윤문하기"
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("ai-polish-briefing-btn"));
    });

    await waitFor(() => expect(onChangeValue).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/broker/studio/ai-comment");
    const sent = JSON.parse(String(init.body));
    expect(sent.mode).toBe("market_briefing");
    expect(sent.cadence).toBe("weekly");
    expect(sent.draftText).toBe("역세권 빌딩 문의 늘고 금리도 안정세");
    expect(onChangeValue.mock.calls[0][0]).toContain("역세권 빌딩을 사옥 겸 임대용으로");
  });

  it("MagazineView는 일간/주간/월간 모두 제목 → 시장브리핑 → 이슈 → 매물 → 연락처 → 최소 신청 순서로 렌더하고 한줄 소개·소제목 잡음을 억제한다", () => {
    const unitIssues = clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, { cadence: "monthly" });
    for (const cadence of ["daily", "weekly", "monthly"] as const) {
      const html = renderToStaticMarkup(
        <MagazineView
          brokerId="ace-realty"
          brokerSlug="ace-realty"
          date="2026-11-12"
          dateLabel="2026년 11월 12일 (목)"
          data={{
            kind: cadence,
            headline: "이상은 중개사의 빌딩 시장 브리핑",
            summary: "미노출되어야 하는 한줄소개 문구",
            briefingTitle: "미노출되어야 하는 별도 브리핑 소제목",
            briefing: "강남 역세권 근생빌딩 매수 문의가 꾸준합니다.",
            unit_issues: unitIssues,
            featured_deals: [
              { id: "d1", assetType: "근생빌딩", address: "강남구 역삼동", price: 8_500_000_000 },
            ],
            broker: { name: "이상은", company: "에이스중개", phone: "010-1234-5678" },
            sections: [
              { id: "roi_calculator", enabled: true },
              { id: "poll", enabled: true },
              { id: "market_data", enabled: true },
            ],
          }}
        />,
      );

      expect(html).not.toContain("미노출되어야 하는 한줄소개 문구");
      expect(html).not.toContain("미노출되어야 하는 별도 브리핑 소제목");
      expect(html).not.toContain("공인중개사 현장 브리핑");
      expect(html).not.toContain("주목 매물 하이라이트");

      const iHead = html.indexOf("이상은 중개사의 빌딩 시장 브리핑");
      const iBrief = html.indexOf('data-testid="viewer-market-briefing"');
      const iIssues = html.indexOf('data-testid="axios-postit-list"');
      const iDeals = html.indexOf('data-deals-carousel');
      const iProfile = html.indexOf('data-section-id="broker_profile"');
      const iOptin = html.indexOf('data-testid="minimal-subscribe-optin"');

      expect(iHead).toBeGreaterThan(0);
      expect(iHead).toBeLessThan(iBrief);
      expect(iBrief).toBeLessThan(iIssues);
      expect(iIssues).toBeLessThan(iDeals);
      expect(iDeals).toBeLessThan(iProfile);
      expect(iProfile).toBeLessThan(iOptin);
    }
  });
});

describe("요구사항 2 & 3: 하단 유틸리티 제거 + 이슈 번호 제거·분야만 표기", () => {
  it("모바일 뷰어는 하단 바·수지계산기·투표 없이 minimal-subscribe-optin만 노출하며 tracking-notice 1회를 유지한다", () => {
    const html = renderToStaticMarkup(
      <MagazineView
        brokerId="ace-realty"
        brokerSlug="ace-realty"
        date="2026-11-12"
        data={{
          headline: "이상은 중개사의 빌딩 시장 브리핑",
          briefing: "간단 브리핑입니다.",
          poll: { question: "투표 질문", options: [{ label: "예" }, { label: "아니오" }] },
          featured_deals: [
            { id: "d1", assetType: "빌딩", address: "역삼동", price: 7_000_000_000, deposit: 300_000_000, monthlyRent: 22_000_000 },
          ],
          broker: { name: "이상은", company: "에이스", phone: "010-1234-5678" },
        }}
      />,
    );

    expect(html).not.toContain("data-magazine-bottom-bar");
    expect(html).not.toContain("data-prefill-roi");
    expect(html).not.toContain("수지분석 계산기");
    expect(html).not.toContain("투표 질문");
    expect(html).toContain('data-testid="minimal-subscribe-optin"');
    expect((html.match(/data-testid="tracking-notice"/g) ?? []).length).toBe(1);
  });

  it("뷰어 NewsSection과 에디터 AxiosIssuesEditorPanel에서 ISSUE 01~05 번호를 제거하고 분야 배지·선택만 표기한다", () => {
    const issues = clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, { cadence: "weekly" });
    const viewerHtml = renderToStaticMarkup(<NewsSection items={[]} unitIssues={issues} cadence="weekly" />);
    expect(viewerHtml).not.toMatch(/ISSUE\s*0[1-5]/);
    expect(viewerHtml).not.toMatch(/이슈\s*[1-5]\s*·/);
    expect((viewerHtml.match(/data-testid="viewer-news-channel-badge"/g) ?? []).length).toBe(5);

    const editorHtml = renderToStaticMarkup(
      <AxiosIssuesEditorPanel
        unitIssues={issues}
        onChangeUnitIssues={() => {}}
        newsPool={[...CURATED_CHANNEL_POOL]}
        cadenceLabel="주간"
      />,
    );
    expect(editorHtml).not.toMatch(/ISSUE\s*0[1-5]/);
    expect(editorHtml).toContain('data-testid="axios-issue-channel-0"');
    expect(editorHtml).toContain('data-testid="axios-issue-channel-4"');
  });
});

describe("요구사항 4: 70대 매수자 쉬운 말투 + 44/74자 예산 + 잘림 0건", () => {
  it("humanizeBuyerCopy는 어려운 금융·영문 전문용어를 쉬운 우리말로 치환한다", () => {
    const raw =
      "금리 스프레드 축소로 레버리지와 리파이낸싱 부담이 줄어 자기자본수익률(ROE)과 밸류애드, 플래그십, 아트테크, 프롭테크 효과가 높아집니다.";
    const humanized = humanizeBuyerCopy(raw);
    expect(humanized).toContain("은행 대출금리 차이");
    expect(humanized).toContain("대출 활용");
    expect(humanized).toContain("기존 대출 갈아타기");
    expect(humanized).toContain("내 돈 대비 실제 수익률");
    expect(humanized).toContain("수리·임차 개선");
    expect(humanized).toContain("대표 매장");
    expect(humanized).toContain("미술품 전시·절세");
    expect(humanized).toContain("디지털 건물 관리");
  });

  it("CURATED_CHANNEL_POOL과 clusterArticlesIntoFiveIssues 5건 모두 44/74자 예산을 지키고 70대 매수자 비호환 어휘가 0건이다", () => {
    expect(AXIOS_TITLE_MAX_CHARS).toBe(44);
    expect(AXIOS_BRIEF_MAX_CHARS).toBe(74);

    const issues = clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, { cadence: "weekly" });
    expect(issues).toHaveLength(5);

    for (const item of [...CURATED_CHANNEL_POOL.map((c) => ({ title: c.cardTitle ?? c.title, brief: c.cardBrief ?? c.summary })), ...issues]) {
      expect(charLength(item.title)).toBeLessThanOrEqual(44);
      expect(charLength(item.brief)).toBeLessThanOrEqual(74);
      expect(isDanglingKoreanWord(item.title.trim().split(/\s+/).pop() ?? "")).toBe(false);
      expect(item.title).not.toMatch(/소구가 가능|성사율|브리핑에 활용|ROE|Cap Rate|스프레드|밸류애드|리파이낸싱/i);
      expect(item.brief).not.toMatch(/소구가 가능|성사율|브리핑에 활용|ROE|Cap Rate|스프레드|밸류애드|리파이낸싱/i);
    }

    const viewerHtml = renderToStaticMarkup(<NewsSection items={[]} unitIssues={issues} cadence="weekly" />);
    expect(viewerHtml).toContain('data-axios-headline-lines="2"');
    expect(viewerHtml).toContain('data-max-chars="44"');
    expect(viewerHtml).toContain('data-axios-brief-lines="3"');
    expect(viewerHtml).toContain('data-max-chars="74"');
    expect(viewerHtml).not.toMatch(/data-testid="axios-postit-(?:title|brief)"[^>]*class="[^"]*(?:line-clamp|truncate|whitespace-nowrap)/);

    const prompt = buildTf8AxiosClusterPrompt({
      cadence: "weekly",
      preferredRegions: ["강남·서초"],
      preferredChannels: ["real_estate"],
      candidateIssues: issues,
      sourceArticles: CURATED_CHANNEL_POOL,
    });
    expect(prompt.systemPrompt).toContain("[70s-Buyer-Plain-Korean]");
    expect(prompt.systemPrompt).toContain("[No-Broker-Coaching]");
    expect(prompt.systemPrompt).toContain("[44-Char Card Title]");
    expect(prompt.systemPrompt).toContain("[74-Char Detailed Brief]");
  });
});

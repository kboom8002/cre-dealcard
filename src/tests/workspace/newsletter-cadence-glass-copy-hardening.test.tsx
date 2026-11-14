// @vitest-environment jsdom
/**
 * 뉴스레터 카드 카피 예산(제목 36자 · 해설 48자) + 글래스모피즘 카드뉴스 + 일간·주간·월간 발행 주기 + TF8 프롬프트 하드닝
 *
 * 사용자 결함 리포트 (2026-11-10):
 *  1.1 이슈 제목: 폰트 한 단계 축소 + 36자 이내 생성 → 잘림 0건
 *  1.2 이슈 해설: 폰트 한 단계 축소 + 48자 이내 생성 → 잘림 0건
 *  1.3 고객 화면 포스트잇 → 글래스모피즘·그래디언트 카드뉴스 표면 + 텍스트 렌더링 효과
 *  1.4 일간·주간·월간 작성이 월간만 표시되던 회귀(monthly 하드코딩) 복원
 *  +  뉴스레터 아이템 프롬프트 TF8(AI Core) 하드닝
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/broker/magazine-editor",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// ── /api/magazine/issues 라우트용 경량 목 (주기 전달 계약만 검증) ──
const draftCalls: Array<Record<string, unknown>> = [];
vi.mock("@/lib/magazine/authz", () => ({
  requireBrokerContext: async () => ({
    ctx: {
      userId: "11111111-1111-4111-8111-111111111111",
      slug: "gangnam-ace",
      brokerKeys: ["gangnam-ace", "11111111-1111-4111-8111-111111111111"],
      displayName: "에이스 중개",
    },
    error: null,
  }),
  assertOwnsRow: vi.fn(async () => null),
  jsonError: (code: string, message: string, status: number) =>
    Response.json({ ok: false, error: { code, message } }, { status }),
}));
vi.mock("@/lib/magazine/resolve-broker", () => ({ resolveBroker: async () => null }));
vi.mock("@/lib/magazine/edition-draft", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/magazine/edition-draft")>();
  return {
    ...orig,
    getOrCreateDraftEdition: vi.fn(async (_sb: unknown, _ctx: unknown, opts: Record<string, unknown>) => {
      draftCalls.push(opts);
      return { edition: { id: "eeeeeeee-3333-4333-8333-333333333333", content: {} }, created: true };
    }),
  };
});
vi.mock("@/lib/supabase/service", () => {
  const makeChain = (): Record<string, unknown> => {
    const result = { data: [] as unknown[], error: null };
    const chain: Record<string, unknown> = {};
    const self = new Proxy(chain, {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown) => resolve(result);
        }
        if (prop === "maybeSingle" || prop === "single") {
          return async () => ({ data: { id: "eeeeeeee-3333-4333-8333-333333333333" }, error: null });
        }
        return () => self;
      },
    });
    return self as Record<string, unknown>;
  };
  return { createServiceClient: () => ({ from: () => makeChain() }) };
});

import MagazineEditorPage from "@/app/(broker)/broker/magazine-editor/page";
import { NewsSection } from "@/components/magazine/viewer-sections";
import {
  AXIOS_BRIEF_MAX_CHARS,
  AXIOS_TITLE_MAX_CHARS,
  POST_IT_TONE_META,
  charLength,
  clusterArticlesIntoFiveIssues,
  formatAxiosCardTitle,
  formatAxiosTwoLineBrief,
  isDanglingKoreanWord,
  normalizeAxiosIssueCopy,
} from "@/domain/magazine/issue-clustering";
import { CURATED_CHANNEL_POOL } from "@/domain/magazine/news-channels";
import {
  deriveCadenceIssueMeta,
  parseCadenceAnchor,
  NEWSLETTER_CADENCE_META,
} from "@/lib/magazine/newsletter-cadence";
import {
  buildTf8AxiosClusterPrompt,
  buildTf8DraftPrompt,
  repairAxiosClusterOutputBlock,
  repairDraftOutputBlock,
} from "@/ai/prompts/magazine-taskflow";
import { AxiosClusterOutputSchema } from "@/ai/schemas/magazine-taskflow";
import { AgentOutputEnvelopeSchema } from "@/ai/envelope";
import { POST as postIssuesRoute } from "@/app/api/magazine/issues/route";

const ELLIPSIS_RE = /…|\.\.\./;
const lastWord = (s: string) => s.trim().split(/\s+/).pop() ?? "";

function assertCompleteTitle(title: string) {
  expect(title.length).toBeGreaterThan(0);
  expect(charLength(title)).toBeLessThanOrEqual(AXIOS_TITLE_MAX_CHARS);
  expect(title).not.toMatch(ELLIPSIS_RE);
  expect(isDanglingKoreanWord(lastWord(title))).toBe(false);
}

function assertCompleteBrief(brief: string) {
  expect(brief.length).toBeGreaterThan(0);
  expect(charLength(brief)).toBeLessThanOrEqual(AXIOS_BRIEF_MAX_CHARS);
  expect(brief).not.toMatch(ELLIPSIS_RE);
  expect(brief).toMatch(/다\.$/);
  expect(brief).not.toMatch(/(?:의|에|을|를|은|는|하는|되는|따른|위한|및)\.$/);
  expect(brief).not.toMatch(/(?:가|이)입니다\.$/);
}

// 사용자 스크린샷에서 잘려 보였던 실제 문구
const SCREENSHOT_TITLES = [
  "통화정책 전환기 진입에 따른 시중은행 기업·빌딩 담보대출 금리 스프레드 점검",
  "신촌은 비고 명동·성수는 찼다…서울 상권 '공실 양극화' 심화로 매물 가격 조정",
  "꼬마빌딩 양도세, 10년 전 공사비 영수증이 수천만원을 가른다는 세무 전문가 조언",
  "도심 빌딩 로비와 갤러리의 만남, 자산가들이 주목하는 '아트테크·프라이빗 전시' 트렌드",
  "[한국경제] 역세권 꼬마빌딩, 수익률보다 '사옥 실수요·리모델링 밸류애드' 중심으로 매수세 재편",
];
const SCREENSHOT_BRIEFS = [
  "국내외 기준금리 인하 사이클 논의가 본격화되면서 우량 담보물건에 대한 기업시설자금 대출 조건이 완화되고 있습니다.",
  "서울 3개 상권, 신촌은 공실이 늘고 명동·성수는 만실 양극화가 이어지면서 신촌 매물은 가격 조정이 이어지고 있다.",
  "양도세는 10년 전 공사비 영수증 유무에 따라 수천만원 차이가 가능하므로 증빙 보관이 중요합니다",
  "핵심 팩트: 기업인·건물주 컬렉터가 늘며 사옥 로비에 미술품을 전시하는 사례가 확산됩니다. | 브로커 임플리케이션: 업무용 미술품 손금산입 혜택과 공간 브랜딩이 사옥 매수 고객의 호응을 얻습니다.",
  "헬스케어 수요 증가로 역세권 중소형 빌딩에 병의원·약국 장기 임차 수요가 탄탄하고 근린생활시설 용도와 승강기 스펙이 건물 가치를 결정하는",
];

describe("[1.1/1.2] 카드 카피 예산 엔진 — 제목 36자 · 해설 48자 · 잘림/말줄임/미완결 0건", () => {
  it("스크린샷에서 잘렸던 제목 5건을 36자 이내 완결 명사구로 압축한다", () => {
    for (const raw of SCREENSHOT_TITLES) {
      const t = formatAxiosCardTitle(raw);
      assertCompleteTitle(t);
      expect(t).not.toContain("[한국경제]");
    }
    // 이미 예산 이내인 제목은 원문 그대로 보존
    expect(formatAxiosCardTitle("강남 역세권 빌딩 선별 매수 확산")).toBe("강남 역세권 빌딩 선별 매수 확산");
  });

  it("스크린샷에서 잘렸던 해설 5건을 48자 이내 완결 평서문으로 압축한다", () => {
    for (const raw of SCREENSHOT_BRIEFS) {
      const b = formatAxiosTwoLineBrief(raw, { channel: "real_estate" });
      assertCompleteBrief(b);
      expect(b).not.toContain("|");
      expect(b).not.toMatch(/핵심 팩트|브로커 임플리케이션/);
    }
  });

  it("큐레이션 풀 15건 모두 36/48자 전용 카드 카피를 보유하고, 클러스터링 결과도 예산을 지킨다", () => {
    for (const item of CURATED_CHANNEL_POOL) {
      expect(item.cardTitle, item.id).toBeTruthy();
      expect(item.cardBrief, item.id).toBeTruthy();
      assertCompleteTitle(item.cardTitle!);
      assertCompleteBrief(item.cardBrief!);
    }
    for (const cadence of ["daily", "weekly", "monthly"] as const) {
      const issues = clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, {
        cadence,
        preferredRegions: ["강남·서초", "성수·왕십리"],
        preferredChannels: ["real_estate", "economy_finance", "tax_wealth", "culture_lifestyle", "commercial_trend"],
      });
      expect(issues).toHaveLength(5);
      for (const issue of issues) {
        assertCompleteTitle(issue.title);
        assertCompleteBrief(issue.brief);
      }
    }
  });

  it("normalizeAxiosIssueCopy 는 중개사 수동 입력(초과 문구)도 동일 예산으로 정규화한다", () => {
    const copy = normalizeAxiosIssueCopy({
      title: SCREENSHOT_TITLES[0],
      brief: SCREENSHOT_BRIEFS[0],
      channel: "economy_finance",
    });
    assertCompleteTitle(copy.title);
    assertCompleteBrief(copy.brief);
  });
});

function hexRelativeLuminance(hex: string): number {
  const clean = hex.replace("#", "").trim();
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function wcagContrastRatio(fgHex: string, bgHex: string): number {
  const l1 = hexRelativeLuminance(fgHex);
  const l2 = hexRelativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("[1.3] 고객 화면 카드뉴스 글래스모피즘 표면 + SOTA 시인성(WCAG AAA) + 잘림 없는 렌더링", () => {
  it("5톤 모두 루미너스 파스텔 오로라 메시 그래디언트·강조색·글로우와 WCAG AAA(7:1+) 명도비를 보장한다", () => {
    for (const tone of ["amber", "sky", "mint", "lavender", "peach"] as const) {
      const meta = POST_IT_TONE_META[tone];
      expect(meta.glassBackground).toMatch(/radial-gradient/);
      expect(meta.glassBackground).toMatch(/linear-gradient/);
      expect(meta.glassAccent).toMatch(/^#/);
      expect(meta.glassGlow).toMatch(/rgba/);

      // 고명도 파스텔 베이스(L > 0.85) + 초고대비 잉크(제목 >= 12:1, 해설 >= 10:1, 배지 >= 7:1 WCAG AAA)
      expect(hexRelativeLuminance(meta.cardBg)).toBeGreaterThan(0.85);
      expect(wcagContrastRatio(meta.titleColor, meta.cardBg)).toBeGreaterThanOrEqual(12);
      expect(wcagContrastRatio(meta.bodyColor, meta.cardBg)).toBeGreaterThanOrEqual(10);
      expect(wcagContrastRatio(meta.badgeText, meta.badgeBg)).toBeGreaterThanOrEqual(7);
    }
  });

  it("고객 뷰어 NewsSection: glass 카드 5장, backdrop-blur 글래스 패널, .broker-paper-theme 캐스케이드 충돌(text-white) 0건, line-clamp/truncate 0건", () => {
    const issues = clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, { cadence: "weekly" });
    const html = renderToStaticMarkup(<NewsSection items={[]} unitIssues={issues} cadence="weekly" />);
    expect(html).not.toContain("ISSUE 01");
    expect(html).toContain('data-testid="viewer-news-channel-badge"');
    expect((html.match(/data-card-style="glass"/g) ?? []).length).toBe(5);
    expect((html.match(/data-contrast-tier="wcag-aaa"/g) ?? []).length).toBe(5);
    expect(html).toContain("backdrop-blur-xl");
    expect(html).toMatch(/text-shadow/);
    // .broker-paper-theme 에서 #1D1D1F 로 강제 반전되는 .text-white 클래스를 카드 내부에 사용하지 않음
    expect(html).not.toMatch(/data-testid="axios-postit-title"[^>]*class="[^"]*\btext-white\b/);
    expect(html).not.toMatch(/data-testid="axios-postit-(?:title|brief)"[^>]*class="[^"]*(?:line-clamp|truncate|whitespace-nowrap)/);
    // 70대 매수자 가독성 폰트: 제목 17/18px, 상세 해설 15px
    expect(html).toMatch(/data-testid="axios-postit-title"[^>]*class="[^"]*text-\[17px\] sm:text-\[18px\]/);
    expect(html).toMatch(/data-testid="axios-postit-brief"[^>]*class="[^"]*text-\[15px\]/);
    expect(html).not.toContain("text-[21px]");
  });
});

describe("[1.4] 일간·주간·월간 발행 주기 SSOT", () => {
  it("주기별 호수 라벨·슬러그가 edition-draft 규칙과 일치하고 슬러그로 복원된다", () => {
    const monthly = deriveCadenceIssueMeta("monthly", { year: 2026, month: 11 });
    expect(monthly.slug).toBe("2026-11");
    expect(monthly.yearMonthLabel).toBe("2026년 11월호");

    const weekly = deriveCadenceIssueMeta("weekly", { dateStr: "2026-11-11" });
    expect(weekly.slug).toBe("W46-2026");
    expect(weekly.dateStr).toBe("2026-11-09");
    expect(weekly.yearMonthLabel).toBe("2026년 11월 2주차 주간호");
    expect(weekly.rangeLabel).toBe("11.9~11.15");

    const daily = deriveCadenceIssueMeta("daily", { dateStr: "2026-11-10" });
    expect(daily.slug).toBe("2026-11-10");
    expect(daily.yearMonthLabel).toBe("2026년 11월 10일(화) 일간호");

    expect(parseCadenceAnchor("W46-2026", "weekly")).toMatchObject({ cadence: "weekly", dateStr: "2026-11-09" });
    expect(parseCadenceAnchor("2026-11-10", "daily")).toMatchObject({ cadence: "daily", dateStr: "2026-11-10" });
    expect(parseCadenceAnchor("2026-11", "monthly")).toMatchObject({ cadence: "monthly", year: 2026, month: 11 });
  });

  it("발행 API는 editionType(weekly)을 그대로 초안 생성·kind 에 전달한다 (monthly 하드코딩 회귀 방지)", async () => {
    draftCalls.length = 0;
    const req = new NextRequest("http://localhost:3000/api/magazine/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        editionType: "weekly",
        slug: "W46-2026",
        headline: "강남 역세권 빌딩 선별 매수 확산",
        summary: "이번 주 강남 빌딩 시장 흐름을 정리했습니다.",
        briefingBody: "이번 주 강남 역세권 빌딩은 선별 매수가 이어지고 있습니다.",
      }),
    });
    const res = await postIssuesRoute(req);
    expect(draftCalls[0]).toMatchObject({ editionType: "weekly", editionLabel: "W46-2026" });
    if (res.status === 200) {
      const json = (await res.json()) as { content?: { kind?: string } };
      expect(json.content?.kind).toBe("weekly");
    }
  });

  describe("편집기 UI", () => {
    const fetchCalls: Array<{ url: string; body?: string }> = [];

    beforeEach(() => {
      fetchCalls.length = 0;
      window.localStorage.clear();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          fetchCalls.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
          if (url.startsWith("/api/magazine/editions")) {
            return Response.json({
              ok: true,
              brokerId: "11111111-1111-4111-8111-111111111111",
              brokerSlug: "gangnam-ace",
              brokerName: "에이스 중개",
              editions: [
                {
                  id: "ed-weekly-46",
                  edition_type: "weekly",
                  edition_label: "W46-2026",
                  status: "published",
                  title: "이번 주 강남 빌딩 브리핑",
                  content: { issueDate: "2026-11-10" },
                },
                {
                  id: "ed-monthly-11",
                  edition_type: "monthly",
                  edition_label: "2026-11",
                  status: "draft",
                  title: "11월 월간 브리핑",
                  content: {},
                },
              ],
            });
          }
          if (url.startsWith("/api/broker/buildings")) {
            return Response.json({ ok: true, buildings: [] });
          }
          if (url.startsWith("/api/magazine/issues")) {
            return Response.json({
              ok: true,
              id: "eeeeeeee-3333-4333-8333-333333333333",
              brokerSlug: "gangnam-ace",
              publicUrl: "http://localhost:3000/magazine/gangnam-ace/2026-11-10?edition=eeeeeeee-3333-4333-8333-333333333333",
            });
          }
          return Response.json({ ok: true });
        }),
      );
    });

    afterEach(() => {
      cleanup();
      vi.unstubAllGlobals();
    });

    it("일간·주간·월간 주기 선택이 노출되고, 주간 전환 시 라벨·버튼·이전 호 필터가 주간으로 바뀐다", async () => {
      render(<MagazineEditorPage />);

      expect(screen.getByTestId("quickstart-cadence-daily")).toBeTruthy();
      expect(screen.getByTestId("quickstart-cadence-weekly")).toBeTruthy();
      expect(screen.getByTestId("quickstart-cadence-monthly")).toBeTruthy();
      expect(screen.getByTestId("metadata-cadence-weekly")).toBeTruthy();
      expect(screen.getByTestId("new-newsletter-btn").textContent).toContain(
        NEWSLETTER_CADENCE_META.monthly.newButtonLabel,
      );

      await waitFor(() => expect(screen.getByTestId("edition-filter-weekly").textContent).toContain("(1)"));

      await act(async () => {
        fireEvent.click(screen.getByTestId("quickstart-cadence-weekly"));
      });
      expect(screen.getByTestId("current-issue-label").textContent).toMatch(/주차 주간호/);
      expect(screen.getByTestId("new-newsletter-btn").textContent).toContain("이번 주 주간 뉴스레터 새로 쓰기");
      expect(screen.getByTestId("newsletter-issue-date")).toBeTruthy();
      expect(screen.getByTestId("quickstart-cadence-weekly").getAttribute("aria-checked")).toBe("true");

      await act(async () => {
        fireEvent.click(screen.getByTestId("quickstart-cadence-daily"));
      });
      expect(screen.getByTestId("current-issue-label").textContent).toMatch(/일간호/);
    });

    it("이전 주간 호를 불러오면 주기가 주간으로 복원되고, 저장 시 editionType=weekly · Www-YYYY 슬러그로 발행 API를 호출한다", async () => {
      render(<MagazineEditorPage />);
      await waitFor(() => expect(screen.getByTestId("magazine-edition-item-ed-weekly-46")).toBeTruthy());
      expect(screen.getByTestId("edition-cadence-badge-ed-weekly-46").textContent).toBe("주간");

      await act(async () => {
        fireEvent.click(screen.getByTestId("magazine-edition-item-ed-weekly-46"));
      });
      expect(screen.getByTestId("current-issue-label").textContent).toMatch(/2026년 11월 2주차 주간호/);

      // 제목 수정 → 링크 복사(서버 재저장 강제)
      fireEvent.change(screen.getByLabelText("표지 제목", { selector: "input" }), {
        target: { value: "이번 주 강남 빌딩 선별 매수 확산" },
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId("step-tab-send"));
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId("copy-link-btn"));
      });

      await waitFor(() => expect(fetchCalls.some((c) => c.url.startsWith("/api/magazine/issues"))).toBe(true));
      const saveCall = fetchCalls.find((c) => c.url.startsWith("/api/magazine/issues"));
      const body = JSON.parse(saveCall?.body ?? "{}") as Record<string, unknown>;
      expect(body.editionType).toBe("weekly");
      expect(body.slug).toBe("W46-2026");
      expect(body.editionId).toBe("ed-weekly-46");
    });

    it("편집기 미리보기 카드도 글래스 카드 + 시니어 rem 스케일 폰트(text-base / text-sm) + 36/48자 예산을 지킨다", async () => {
      render(<MagazineEditorPage />);
      const card = await screen.findByTestId("preview-postit-card-0");
      expect(card.getAttribute("data-card-style")).toBe("glass");
      for (let i = 0; i < 5; i++) {
        const title = screen.getByTestId(`preview-postit-title-${i}`);
        const brief = screen.getByTestId(`preview-postit-brief-${i}`);
        expect(title.className).toContain("text-base");
        expect(title.className).not.toMatch(/line-clamp|truncate|text-lg/);
        expect(brief.className).toContain("text-sm");
        expect(brief.className).not.toMatch(/line-clamp|truncate/);
        assertCompleteTitle(title.textContent ?? "");
        assertCompleteBrief(brief.textContent ?? "");
      }
    });
  });
});

describe("[Prompt] 뉴스레터 아이템 TF8(AI Core) 프롬프트 하드닝", () => {
  it("AXIOS 클러스터 프롬프트: 36/48자 예산·원문 근거·[E] few-shot·[V] 자체검증·주기 라벨을 모두 담는다", () => {
    const candidates = clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, { cadence: "weekly" });
    const p = buildTf8AxiosClusterPrompt({
      cadence: "weekly",
      preferredRegions: ["강남·서초"],
      preferredChannels: ["real_estate"],
      candidateIssues: candidates,
      sourceArticles: CURATED_CHANNEL_POOL,
    });
    const all = `${p.systemPrompt}\n${p.userPrompt}`;
    for (const tag of ["[T]", "[A]", "[W]", "[O]", "[L]", "[E]", "[V]", "[F]", "[S]", "[K]"]) {
      expect(all).toContain(tag);
    }
    expect(p.systemPrompt).toContain("44자");
    expect(p.systemPrompt).toContain("74자");
    expect(p.systemPrompt).toContain("[70s-Buyer-Plain-Korean]");
    expect(p.systemPrompt).toContain("[No-Truncation]");
    expect(p.systemPrompt).toContain("[Grounding]");
    expect(p.systemPrompt).toContain("주간");
    expect(p.userPrompt).toContain("원문요약:");
    expect(p.spec.version).toBe("3.0");
  });

  it("초안 프롬프트: 주기(주간)별 기간 표현 일관성·글자 수·자체검증 체크리스트를 강제한다", () => {
    const p = buildTf8DraftPrompt({ monthLabel: "2026년 11월 2주차 주간호", cadence: "weekly", preferredRegions: ["강남·서초"] });
    expect(p.systemPrompt).toContain("주간 뉴스레터");
    expect(p.systemPrompt).toContain("'이번 주'");
    expect(p.systemPrompt).toContain("[Cadence-Consistency]");
    expect(p.systemPrompt).toContain("[V] Self-Verification");
    expect(p.factBookContext).toContain("발행 주기: 주간");
  });

  it("M11 교정기: 순서가 뒤섞이고 예산을 넘긴 LLM 출력도 id 기준 매칭 + 36/48자 완결 카피로 교정하고 계약 스키마를 통과한다", () => {
    const baseline = clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, { cadence: "monthly" });
    const llm = [...baseline].reverse().map((b, i) => ({
      id: b.id,
      title: SCREENSHOT_TITLES[i % SCREENSHOT_TITLES.length],
      brief: SCREENSHOT_BRIEFS[i % SCREENSHOT_BRIEFS.length],
      channel: b.channel,
    }));
    // 중복 id 1건 주입
    llm[4] = { ...llm[4], id: llm[0].id };
    const { unitIssues, warnings, envelope } = repairAxiosClusterOutputBlock(llm, baseline, "강남 빌딩 시장");
    expect(unitIssues).toHaveLength(5);
    expect(new Set(unitIssues.map((u) => u.id)).size).toBe(5);
    for (const u of unitIssues) {
      assertCompleteTitle(u.title);
      assertCompleteBrief(u.brief);
    }
    expect(warnings.some((w) => w.includes("글자 수 예산"))).toBe(true);
    expect(AxiosClusterOutputSchema.safeParse({ unitIssues }).success).toBe(true);
    expect(AgentOutputEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it("M11 초안 교정기: 예산을 넘긴 표지 제목·소개를 하드 슬라이스 없이 완결 문장으로 축약한다", () => {
    const { result } = repairDraftOutputBlock(
      {
        headline: "금리 인하 기대감에 따른 강남·서초 역세권 중소형 빌딩 법인 사옥 매수세 본격 확산과 리모델링 수요",
        summary:
          "강남·서초 권역의 역세권 중소형 빌딩을 중심으로 법인 사옥 실수요와 자산가의 선별 매수가 이어지고 있습니다. 자금 조달 여건과 세무 구조를 함께 점검해야 합니다.",
        briefingTitle: "이번 주 강남·서초 역세권 중소형 빌딩 시장 핵심 브리핑과 체크포인트",
        briefingBody: "강남·서초 역세권 빌딩은 선별 매수가 이어지고 있습니다.\n\n세무·임대차 구성을 사전에 점검하면 협상력이 높아집니다.",
      },
      "2026년 11월 2주차 주간호 강남·서초",
      { monthLabel: "2026년 11월 2주차 주간호", preferredRegions: ["강남·서초"] },
    );
    expect(charLength(result.headline)).toBeLessThanOrEqual(45);
    expect(isDanglingKoreanWord(lastWord(result.headline))).toBe(false);
    expect(charLength(result.briefingBody)).toBeLessThanOrEqual(500);
    expect(result.headline).not.toMatch(ELLIPSIS_RE);
  });

  it("[2] 라이브 스크린샷 회귀 방지: 서술어 중간 절단('~계산해선')·개조식 종결('~있음.', '~됨.')·제목 동어반복('~최대입니다.')을 100% 완결 문장으로 교정한다", () => {
    // 1. ISSUE 02 실전 절단 사례: 37~38자 서술형 헤드라인이 '계산해선'에서 잘리지 않고 '안 된다'까지 완결 유지
    const liveIssue2Variants = [
      "일부 '공간'의 호황을 건물 전체의 임대수입으로 계산해서는 안 된다",
      "[칼럼] 일부 '공간'의 호황을 건물 전체 임대수입으로 계산해선 안 된다",
      "상가 매수 시 일부 '공간'의 호황을 건물 전체 임대수입으로 계산해선 안 된다",
      "일부 '공간'의 호황을 건물 전체 임대수입으로 계산해선",
    ];
    for (const raw of liveIssue2Variants) {
      const formatted = formatAxiosCardTitle(raw);
      assertCompleteTitle(formatted);
      expect(formatted).not.toMatch(/계산해선$|계산해서는$/);
    }

    // 2. ISSUE 01 / ISSUE 02 개조식 해설('~할 수 있음.', '~계산하면 안 됨.') → 완결 평서문('~다.') 변환
    const brief1 = formatAxiosTwoLineBrief(
      "10년 전 공사비 영수증이 꼬마빌딩 양도세를 수천만원 좌우할 수 있음.",
      { title: "꼬마빌딩 양도세, 10년 전 공사비 영수증이 수천만원을 가른다", channel: "tax_wealth" },
    );
    assertCompleteBrief(brief1);
    expect(brief1).not.toMatch(/음\.$/);
    expect(brief1).toContain("좌우할 수 있습니다.");

    const brief2 = formatAxiosTwoLineBrief(
      "일부 공간 호황을 건물 전체 임대수입으로 계산하면 안 됨.",
      { title: "일부 공간 호황을 건물 전체 임대수입으로 계산해선 안 된다", channel: "real_estate" },
    );
    assertCompleteBrief(brief2);
    expect(brief2).not.toMatch(/됨\.$/);

    // 3. ISSUE 03 제목 동어반복('서울 상가 공실률 9.4%, 5년 만에 최대입니다.') 제거 후 실질 해설 채택
    const brief3 = formatAxiosTwoLineBrief(
      "서울 상가 공실률 9.4%, 5년 만에 최대입니다. 업종 재편과 임차인 유치가 수익률을 가릅니다.",
      { title: "서울 상가 공실률 9.4%, 5년 만에 최대", channel: "real_estate" },
    );
    assertCompleteBrief(brief3);
    expect(brief3).toContain("업종 재편과 임차인 유치가 수익률을 가릅니다.");
    expect(brief3).not.toContain("5년 만에 최대입니다.");

    // 4. AI Core 스키마 게이트가 잘린 제목('~계산해선')과 개조식 해설('~있음.')을 즉시 거부하는지 검증
    const badSchemaCheck = AxiosClusterOutputSchema.safeParse({
      unitIssues: [
        {
          id: "bad-1",
          title: "일부 공간의 호황을 건물 전체 임대수입으로 계산해선",
          brief: "10년 전 공사비 영수증이 양도세를 좌우할 수 있음.",
          memoTone: "sky",
          channel: "real_estate",
        },
      ],
    });
    expect(badSchemaCheck.success).toBe(false);
  });
});

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";

vi.mock("next/navigation", () => ({
  usePathname: () => "/broker/magazine-editor",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import MagazineEditorPage from "@/app/(broker)/broker/magazine-editor/page";
import {
  IssueMetadataForm,
  deriveAutoIssueMeta,
} from "@/components/magazine-editor/IssueMetadataForm";
import { BlockSelectionGrid } from "@/components/magazine-editor/BlockSelectionGrid";
import { DealSlotAssigner } from "@/components/magazine-editor/DealSlotAssigner";
import {
  MagazinePublishChecklist,
  getNextPublishHint,
} from "@/components/magazine-editor/MagazinePublishChecklist";
import { MagazineQuickDraftCard } from "@/components/broker/studio/MagazineQuickDraftCard";
import { SendListSummaryBar } from "@/components/broker/studio/SendListSummaryBar";
import { AiCommentRecommendButton } from "@/components/broker/studio/AiCommentRecommendButton";
import {
  getMonthlyChartsForRegion,
  MONTHLY_STATS_PLACEHOLDER_MESSAGE,
  MONTHLY_STATS_PREPARING_LABEL,
  resolveMonthlyChartsFromData,
} from "@/domain/magazine/monthly-stats-charts";
import { BANNED_UI_TERMS } from "@/lib/ux/lexicon";

const OWNED_FILES = [
  "src/app/(broker)/broker/magazine-editor/page.tsx",
  "src/components/magazine-editor/BlockSelectionGrid.tsx",
  "src/components/magazine-editor/DealSlotAssigner.tsx",
  "src/components/magazine-editor/IssueMetadataForm.tsx",
  "src/components/magazine-editor/MagazinePublishChecklist.tsx",
  "src/components/broker/studio/MagazineQuickDraftCard.tsx",
  "src/components/broker/studio/SendListSummaryBar.tsx",
  "src/components/broker/studio/AiCommentRecommendButton.tsx",
  "src/domain/magazine/monthly-stats-charts.ts",
  "src/lib/magazine/simple-format.ts",
  "src/app/api/broker/studio/ai-comment/route.ts",
  "src/app/api/broker/studio/ai-draft/route.ts",
] as const;

describe("W0 신뢰 결함 해소 (NL-01 ~ NL-06)", () => {
  it("NL-01: monthly-stats-charts 는 가짜 확정 수치를 기본 노출하지 않고 isPlaceholder: true 및 정직한 준비 중 안내를 반환한다", () => {
    const charts = getMonthlyChartsForRegion("gbd");
    expect(charts).toHaveLength(2);
    for (const chart of charts) {
      expect(chart.isPlaceholder).toBe(true);
      expect(chart.series).toEqual([]);
      expect(chart.asOf).toBe(MONTHLY_STATS_PREPARING_LABEL);
      expect(chart.highlightMetric.value).toBe(MONTHLY_STATS_PREPARING_LABEL);
      expect(chart.placeholderNotice).toBe(MONTHLY_STATS_PLACEHOLDER_MESSAGE);
    }

    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/domain/magazine/monthly-stats-charts.ts"),
      "utf8",
    );
    expect(src).not.toContain("14,850만/평");
    expect(src).not.toContain("공실 2.8%");
    expect(src).not.toContain("114.6 pt");

    const resolved = resolveMonthlyChartsFromData({ kind: "monthly", monthlyRegion: "seongsu" });
    expect(resolved).toHaveLength(2);
    expect(resolved[0].isPlaceholder).toBe(true);
  });

  it("NL-02 & NL-06: MagazineQuickDraftCard 는 하드코딩 초안 없이 POST /api/broker/studio/ai-draft 및 showUndoToast 를 연결한다", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/broker/studio/MagazineQuickDraftCard.tsx"),
      "utf8",
    );
    expect(src).toContain("/api/broker/studio/ai-draft");
    expect(src).toContain("showUndoToast");
    expect(src).toContain("AI가 초안을 작성했어요");

    const html = renderToStaticMarkup(
      <MagazineQuickDraftCard
        monthLabel="2026년 11월호"
        currentDraft={{ headline: "", summary: "", briefingTitle: "", briefingBody: "" }}
        onApplyDraft={() => {}}
      />,
    );
    expect(html).toContain("AI로 초안 쓰기");
    expect(html).not.toContain("AI 초안 채우기");
  });

  it("NL-03, NL-04, NL-05: page.tsx 는 setTimeout 가짜 발송이나 샘플 사진 폴백을 쓰지 않고 copyText/shareKakaoFeed/local_only 를 사용한다", () => {
    const pageSrc = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/(broker)/broker/magazine-editor/page.tsx"),
      "utf8",
    );
    expect(pageSrc).not.toContain("setTimeout(");
    expect(pageSrc).not.toContain("/test-images/01_exterior.jpg");
    expect(pageSrc).toContain("copyText");
    expect(pageSrc).toContain("COPY_FAILED_MESSAGE");
    expect(pageSrc).toContain("shareKakaoFeed");
    expect(pageSrc).toContain("/api/magazine/issues");
    expect(pageSrc).toContain("local_only");
  });
});

describe("W1 WorkspaceShell 편입 및 밝은 테마 통일 (NL-07 ~ NL-11, NL-27)", () => {
  it("MagazineEditorPage 가 WorkspaceShell(workspace='magazine') 위에 3열 슬롯과 단일 주 버튼 [구독자에게 보내기]를 렌더링한다", () => {
    const html = renderToStaticMarkup(<MagazineEditorPage />);
    expect(html).toContain('data-testid="workspace-shell"');
    expect(html).toContain('data-workspace="magazine"');
    expect(html).toContain('data-testid="magazine-list-slot"');
    expect(html).toContain('data-testid="magazine-editor-slot"');
    expect(html).toContain('data-testid="magazine-preview-slot"');
    expect(html).toContain("구독자에게 보내기");
    expect(html).toContain("이번 달 뉴스레터 새로 쓰기");
  });

  it("NL-27: 하위 컴포넌트 4종이 다크 테마(bg-slate-900, border-slate-700, text-slate-100) 대신 밝은 테마(bg-white, border-slate-200, text-slate-900)를 사용한다", () => {
    const lightComponents = [
      "src/components/magazine-editor/IssueMetadataForm.tsx",
      "src/components/magazine-editor/BlockSelectionGrid.tsx",
      "src/components/magazine-editor/DealSlotAssigner.tsx",
      "src/components/magazine-editor/MagazinePublishChecklist.tsx",
    ];
    for (const rel of lightComponents) {
      const src = fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
      expect(src).toContain("bg-white");
      expect(src).toContain("border-slate-200");
      expect(src).toContain("text-slate-900");
      expect(src).not.toContain("bg-slate-900");
      expect(src).not.toContain("border-slate-700");
      expect(src).not.toContain("text-slate-100");
    }
  });
});

describe("W2 흐름 단순화 (NL-12 ~ NL-17)", () => {
  it("NL-12: 에디터가 3단계 탭(① 제목 · ② 내용 · ③ 보내기)으로 구성된다", () => {
    const html = renderToStaticMarkup(<MagazineEditorPage />);
    expect(html).toContain("① 제목");
    expect(html).toContain("② 내용");
    expect(html).toContain("③ 보내기");
  });

  it("NL-14: IssueMetadataForm 은 발행 호수·Slug 입력칸을 숨기고 연·월에서 자동 생성하며, 글자 수 카운터 상시 노출이 없다", () => {
    const meta = deriveAutoIssueMeta(2026, 11);
    expect(meta.slug).toBe("2026-11");
    expect(meta.yearMonthLabel).toBe("2026년 11월호");
    expect(meta.issueNumber).toBeGreaterThan(0);

    const html = renderToStaticMarkup(
      <IssueMetadataForm
        year={2026}
        month={11}
        headline="11월 강남권 빌딩 매수 흐름"
        onChangeHeadline={() => {}}
        summary="핵심 요약입니다."
        onChangeSummary={() => {}}
      />,
    );
    expect(html).toContain("2026년 11월호");
    expect(html).not.toMatch(/\d+\s*\/\s*\d+\s*자/);
    expect(html).not.toContain("Slug");
    expect(html).not.toContain("slug");

    const longHtml = renderToStaticMarkup(
      <IssueMetadataForm
        year={2026}
        month={11}
        headline={"가".repeat(40)}
        onChangeHeadline={() => {}}
        summary=""
        onChangeSummary={() => {}}
      />,
    );
    expect(longHtml).toContain("제목이 길어요 – 한 줄에 들어오도록 줄여 주세요");
  });

  it("NL-17: MagazinePublishChecklist 는 완료 시 숨겨지고 미완료 시에만 1줄 안내를 표시한다", () => {
    expect(
      getNextPublishHint({ headline: "", briefingBody: "본문", dealCount: 1 })?.message,
    ).toBe("표지 제목을 입력하면 바로 보낼 수 있어요");

    expect(
      getNextPublishHint({ headline: "제목 있음", briefingBody: "본문 있음", dealCount: 1 }),
    ).toBeNull();

    const emptyHtml = renderToStaticMarkup(
      <MagazinePublishChecklist headline="" briefingBody="" dealCount={0} />,
    );
    expect(emptyHtml).toContain("표지 제목을 입력하면 바로 보낼 수 있어요");

    const readyHtml = renderToStaticMarkup(
      <MagazinePublishChecklist headline="제목 완료" briefingBody="본문 완료" dealCount={1} />,
    );
    expect(readyHtml).toBe("");
  });
});

describe("W3 UX 라이팅 및 W4 시니어 가독성·접근성 (NL-18 ~ NL-31)", () => {
  it("소유 파일 전체에서 금지 용어(콘텐츠 스튜디오, 매거진 스튜디오, 소식지, (Slug), 핫리드 등)와 14px 미만 글자 크기가 0건이다", () => {
    for (const rel of OWNED_FILES) {
      const src = fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
      const foundBanned = BANNED_UI_TERMS.filter(({ term }) => term.test(src)).map(
        ({ term }) => String(term),
      );
      expect(foundBanned, `${rel} banned terms`).toEqual([]);
      expect(src, `${rel} no 소식지`).not.toContain("소식지");
      expect(src, `${rel} no 매거진 발행`).not.toContain("매거진 발행");
      expect(src, `${rel} no text-xs`).not.toMatch(/\btext-xs\b/);
      expect(src, `${rel} no text-caption`).not.toMatch(/\btext-caption\b/);
      expect(src, `${rel} no <14px arbitrary text`).not.toMatch(
        /text-\[(?:[0-9]|1[0-3])px\]/,
      );
    }
  });

  it("NL-31: BlockSelectionGrid(role='switch' + aria-checked), DealSlotAssigner(체크박스 aria-label + AI로 추천글 쓰기), SendListSummaryBar(관심 높음) 접근성이 보장된다", () => {
    const blocksHtml = renderToStaticMarkup(
      <BlockSelectionGrid
        sections={[{ id: "field_note", enabled: true }]}
        onToggleSection={() => {}}
      />,
    );
    expect(blocksHtml).toContain('role="switch"');
    expect(blocksHtml).toContain('aria-checked="true"');

    const dealsHtml = renderToStaticMarkup(
      <DealSlotAssigner
        deals={[
          {
            id: "d1",
            title: "역삼동 코너 빌딩",
            address: "강남구 역삼동",
            price: "85억",
            yield: "4.2%",
            photoUrl: null,
          },
        ]}
        selectedDealIds={["d1"]}
        onToggleDeal={() => {}}
        dealComments={{ d1: "역세권 추천 매물" }}
        onChangeDealComment={() => {}}
      />,
    );
    expect(dealsHtml).toContain('aria-label="역삼동 코너 빌딩 매물 선택"');
    expect(dealsHtml).toContain("AI로 추천글 쓰기");

    const sendBarHtml = renderToStaticMarkup(
      <SendListSummaryBar
        targetSegment="all"
        onChangeTargetSegment={() => {}}
        totalSubscriberCount={24}
        highInterestCount={5}
      />,
    );
    expect(sendBarHtml).toContain("관심 높음 5명");
    expect(sendBarHtml).not.toContain("핫리드");

    const aiBtnHtml = renderToStaticMarkup(
      <AiCommentRecommendButton currentValue="메모" onChangeValue={() => {}} />,
    );
    expect(aiBtnHtml).toContain("AI로 추천글 쓰기");
  });
});

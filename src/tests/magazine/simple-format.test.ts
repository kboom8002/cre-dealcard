import { describe, it, expect } from "vitest";
import {
  SIMPLE_DEAL_LIMIT,
  SIMPLE_FORMAT_ACTIONS,
  SIMPLE_HIDDEN_SECTIONS,
  SIMPLE_NEWS_LIMIT,
  SIMPLE_SECTION_ORDER,
  SIMPLE_STARTER_CHIPS,
  applySimplePreset,
  applySimpleTextFormat,
  countPreservedAdvancedItems,
  deriveFallbackBriefing,
  deriveFallbackHeadline,
  isSimpleEdition,
  isSingleCommentFieldNote,
  normalizeReadableBriefingText,
  resolveEditorMode,
} from "@/lib/magazine/simple-format";
import { isSectionEnabled } from "@/lib/magazine/view-helpers";

describe("simple-format — NL-16 3버튼 서식 도구 ([소제목] [강조] [구분선])", () => {
  it("SIMPLE_FORMAT_ACTIONS 에 [소제목], [강조], [구분선] 3개 버튼이 정의되어 있다", () => {
    expect(SIMPLE_FORMAT_ACTIONS.map((a) => a.label)).toEqual([
      "소제목",
      "강조",
      "구분선",
    ]);
  });

  it("applySimpleTextFormat 은 마크다운 기호(##, **)를 노출하지 않고 읽기 쉬운 한국어 서식을 적용한다", () => {
    const subheadingRes = applySimpleTextFormat("첫 문단입니다.", "subheading");
    expect(subheadingRes.text).toContain("■ ");
    expect(subheadingRes.text).not.toContain("##");

    const emphasisRes = applySimpleTextFormat(
      "이번 달 역세권 거래량이 중요합니다.",
      "emphasis",
      { start: 5, end: 8 },
    );
    expect(emphasisRes.text).toContain("「역세권」");
    expect(emphasisRes.text).not.toContain("**");

    const dividerRes = applySimpleTextFormat("위 문단", "divider");
    expect(dividerRes.text).toContain("────────────────────");
  });

  it("normalizeReadableBriefingText 는 기존 마크다운 기호(##, **, ---)도 읽기 쉬운 서식으로 정리한다", () => {
    const raw = "## 강남권 시장 동향\n이번 달 **법인 실수요**가 꾸준합니다.\n---\n다음 문단입니다.";
    const cleaned = normalizeReadableBriefingText(raw);
    expect(cleaned).toContain("■ 강남권 시장 동향");
    expect(cleaned).toContain("「법인 실수요」");
    expect(cleaned).toContain("────────────────────");
    expect(cleaned).not.toContain("##");
    expect(cleaned).not.toContain("**");
  });
});

describe("simple-format — 기존 에디터 프리셋 및 폴백 계약 보존", () => {
  it("resolveEditorMode 기본값 및 쿼리 우선순위를 지킨다", () => {
    expect(resolveEditorMode()).toBe("simple");
    expect(resolveEditorMode({ queryMode: "full", savedMode: "simple" })).toBe("full");
    expect(resolveEditorMode({ queryTab: "outreach" })).toBe("full");
  });

  it("isSingleCommentFieldNote 가 단일 한마디 여부를 정확히 판별한다", () => {
    expect(isSingleCommentFieldNote({ comment: "한 줄 코멘트입니다." })).toBe(true);
    expect(isSingleCommentFieldNote({ comment: "한마디", question: "질문" })).toBe(false);
  });

  it("deriveFallbackHeadline 과 deriveFallbackBriefing 이 입력 사실만으로 문구를 생성한다", () => {
    expect(deriveFallbackHeadline("", "김영수")).toBe(
      "김영수 중개사의 이번 주 빌딩 시장 브리핑",
    );
    const briefing = deriveFallbackBriefing({
      comment: "실수요 문의가 꾸준합니다.",
      dealCount: 2,
      marketTemp: "선별 매수",
      newsTitles: ["강남 오피스 공실률 하락"],
    });
    expect(briefing).toContain("실수요 문의가 꾸준합니다.");
    expect(briefing).toContain("추천 매물 2건");
    expect(SIMPLE_STARTER_CHIPS).toHaveLength(3);
  });

  it("applySimplePreset 과 countPreservedAdvancedItems 가 섹션 보존 규칙을 지킨다", () => {
    const preset = applySimplePreset(
      {
        headline: "",
        field_note: { comment: "이번 주 현장에서는 급매물 위주로 문의가 이어지고 있습니다." },
        selected_news_ids: ["n1", "n2", "n3", "n4"],
        featured_deal_ids: ["d1", "d2", "d3", "d4"],
      },
      { brokerName: "김영수" },
    );
    expect(isSimpleEdition(preset)).toBe(true);
    expect(preset.selected_news_ids).toHaveLength(SIMPLE_NEWS_LIMIT);
    expect(preset.featured_deal_ids).toHaveLength(SIMPLE_DEAL_LIMIT);
    for (const id of SIMPLE_SECTION_ORDER) {
      expect(isSectionEnabled(preset.sections, id)).toBe(true);
    }
    for (const id of SIMPLE_HIDDEN_SECTIONS) {
      expect(isSectionEnabled(preset.sections, id)).toBe(false);
    }

    const preserved = countPreservedAdvancedItems({
      themeTitle: "테마 제목",
      pollQuestion: "투표 질문",
      fieldNote: { question: "요약" },
    });
    expect(preserved.count).toBe(3);
  });
});

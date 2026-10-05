/**
 * 에디터 탭 완료(✓) 진행 표시 (T1-UX-2) — 순수 함수.
 * 입력 폼으로부터 각 탭이 "작성 완료"인지 판단한다. 작성 개념이 없는 탭은 null.
 */
import type { EditorForm } from "./edition-save";

export type TabCompletion = "done" | "todo" | null;

export type EditorTabKey =
  | "cover"
  | "field_note"
  | "theme_deals"
  | "news"
  | "ai_assist"
  | "outreach"
  | "publish"
  | "analytics";

const filled = (s: string | null | undefined) => (s ?? "").trim().length > 0;

export function computeTabCompletion(
  form: Pick<
    EditorForm,
    | "headline"
    | "briefing"
    | "fieldNote"
    | "themeTitle"
    | "themeBodyMd"
    | "selectedDealIds"
    | "selectedNewsIds"
    | "pollQuestion"
    | "pollOptions"
  >,
  published = false,
): Record<EditorTabKey, TabCompletion> {
  const fn = form.fieldNote;
  const fieldNoteDone =
    !!fn &&
    [fn.question, fn.buyerReaction, fn.sellerReaction, fn.marketJudgment, fn.comment].some(filled);
  const pollOptionCount = (form.pollOptions ?? []).filter((o) => filled(o.label)).length;
  const pollOk = !filled(form.pollQuestion) || pollOptionCount >= 2;
  return {
    cover: filled(form.headline) && filled(form.briefing) ? "done" : "todo",
    field_note: fieldNoteDone ? "done" : "todo",
    theme_deals:
      filled(form.themeTitle) || filled(form.themeBodyMd) || form.selectedDealIds.length > 0
        ? "done"
        : "todo",
    news: form.selectedNewsIds.length > 0 ? "done" : "todo",
    ai_assist: null,
    outreach: null,
    // 발행 탭: 헤드라인이 있고 설문이 유효하며(질문이 있으면 선택지 2개 이상) 아직 미발행이면 준비 완료
    publish: published ? "done" : filled(form.headline) && pollOk ? "done" : "todo",
    analytics: null,
  };
}

/** 완료된 탭 수 / 대상 탭 수 (null 탭 제외) */
export function summarizeCompletion(c: Record<EditorTabKey, TabCompletion>): {
  done: number;
  total: number;
} {
  const vals = Object.values(c).filter((v): v is "done" | "todo" => v !== null);
  return { done: vals.filter((v) => v === "done").length, total: vals.length };
}

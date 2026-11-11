import { z } from "zod/v4";
import type { SpecificNewsChannelId } from "@/domain/magazine/news-channels";
import { isDanglingKoreanWord } from "@/domain/magazine/issue-clustering";

export const SPECIFIC_CHANNEL_IDS = [
  "real_estate",
  "economy_finance",
  "tax_wealth",
  "culture_lifestyle",
  "commercial_trend",
] as const satisfies readonly SpecificNewsChannelId[];

export const POST_IT_TONE_IDS = [
  "amber",
  "sky",
  "mint",
  "lavender",
  "peach",
] as const;

export const MARKET_TEMP_VALUES = [
  "적극 매수",
  "선별 매수",
  "관망",
  "조정 대기",
  "위기 경계",
] as const;

export const MagazineDraftOutputSchema = z.object({
  headline: z.string().min(6).max(36),
  summary: z.string().min(15).max(80),
  briefingTitle: z.string().min(6).max(30),
  briefingBody: z.string().min(60).max(400),
  marketTemp: z.enum(MARKET_TEMP_VALUES).optional(),
  coverKeywords: z.array(z.string().min(1).max(18)).max(5).optional(),
});

export type MagazineDraftOutput = z.infer<typeof MagazineDraftOutputSchema>;

/** 카드뉴스 이슈 제목 36자 · 해설 48자 (issue-clustering AXIOS_TITLE_MAX_CHARS / AXIOS_BRIEF_MAX_CHARS 와 동일) */
export const AxiosIssueItemSchema = z.object({
  id: z.string().min(1),
  title: z
    .string()
    .min(8)
    .max(36)
    .refine(
      (val) => {
        const words = val.trim().split(/\s+/);
        const last = words[words.length - 1] ?? "";
        return !/…|\.\.\./.test(val) && !isDanglingKoreanWord(last);
      },
      { message: "이슈 제목이 미완결 서술어·조사·말줄임으로 잘려 있습니다." },
    ),
  brief: z
    .string()
    .min(12)
    .max(48)
    .refine((val) => !/…|\.\.\./.test(val) && /(?:다|요|죠)\.$/.test(val.trim()), {
      message: "이슈 해설은 개조식(~음/~됨)이나 잘림 없이 완결된 한국어 평서문(~다.)으로 끝나야 합니다.",
    }),
  memoTone: z.enum(POST_IT_TONE_IDS),
  channel: z.enum(SPECIFIC_CHANNEL_IDS),
  topic: z.string().optional(),
  sentiment: z.enum(["bullish", "bearish", "neutral"]).optional(),
  sources: z.array(z.string()).optional(),
  url: z.string().optional(),
  articleCount: z.number().int().min(1).optional(),
});

export const AxiosClusterOutputSchema = z.object({
  unitIssues: z.array(AxiosIssueItemSchema).min(1).max(5),
});

export type AxiosClusterOutput = z.infer<typeof AxiosClusterOutputSchema>;

export const MagazineCommentOutputSchema = z.object({
  comment: z.string().min(12).max(160),
});

export type MagazineCommentOutput = z.infer<typeof MagazineCommentOutputSchema>;

/**
 * TaskFlow 8-Block (TF8) Prompt Specification:
 * [T] Task / [K] Knowledge (FactBook) / [W] Warnings & Hard Constraints /
 * [O] Output Contract / [A] Audience & Persona / [S] Situation & Broker Preferences /
 * [L] Logic Chain / [F] Fallback & M11 Pinpoint Block Repair
 */
export interface TaskFlow8PromptSpec {
  slotKey: "magazine_draft_tf8" | "magazine_axios_cluster_tf8" | "magazine_comment_tf8";
  version: string;
  task: string;
  knowledge: string;
  warnings: readonly string[];
  outputContract: string;
  audience: string;
  situation: string;
  logicChain: readonly string[];
  fallbackRepair: string;
  /** [E] 좋은 예 / 나쁜 예 Few-shot (선택) */
  examples?: readonly string[];
  /** [V] 출력 직전 자체 검증 체크리스트 (선택) */
  selfCheck?: readonly string[];
}

export function renderTf8Prompt(spec: TaskFlow8PromptSpec): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = [
    `# TaskFlow TF8 Prompt Contract (${spec.slotKey} v${spec.version})`,
    `[T] Task:\n${spec.task}`,
    `[A] Audience & Persona:\n${spec.audience}`,
    `[W] Warnings & Hard Constraints:\n${spec.warnings.map((w, i) => `${i + 1}. ${w}`).join("\n")}`,
    `[O] Output Schema & Char Budgets:\n${spec.outputContract}`,
    `[L] Logic Chain:\n${spec.logicChain.map((step, i) => `Step ${i + 1}. ${step}`).join("\n")}`,
    ...(spec.examples && spec.examples.length > 0
      ? [`[E] Examples (Good ✅ / Bad ❌):\n${spec.examples.join("\n")}`]
      : []),
    ...(spec.selfCheck && spec.selfCheck.length > 0
      ? [`[V] Self-Verification Before Output:\n${spec.selfCheck.map((c, i) => `☐ ${i + 1}. ${c}`).join("\n")}`]
      : []),
    `[F] Fallback & M11 Pinpoint Block Repair:\n${spec.fallbackRepair}`,
  ].join("\n\n");

  const userPrompt = [
    `[S] Situation & Broker Preferences:\n${spec.situation}`,
    `[K] Knowledge (FactBook — ONLY Grounded Source):\n${spec.knowledge}`,
  ].join("\n\n");

  return { systemPrompt, userPrompt };
}

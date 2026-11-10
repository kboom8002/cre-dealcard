import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { callLLM, LLMMockNotAllowedError } from "@/ai/llm-client";
import { getModel } from "@/ai/model-selector";
import {
  buildTf8AxiosClusterPrompt,
  repairAxiosClusterOutputBlock,
} from "@/ai/prompts/magazine-taskflow";
import {
  normalizePreferredChannels,
  normalizePreferredRegions,
} from "@/domain/magazine/broker-preferences";
import { clusterArticlesIntoFiveIssues } from "@/domain/magazine/issue-clustering";
import { CURATED_CHANNEL_POOL, type NewsPoolItem } from "@/domain/magazine/news-channels";
import { AxiosClusterOutputSchema } from "@/ai/schemas/magazine-taskflow";
import type { AxiosUnitIssue } from "@/domain/magazine/types";
import { requireBroker } from "@/lib/auth-guard";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("ai-news-cluster");

const articleItemSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().max(2000).optional(),
  source: z.string().trim().max(120).optional(),
  url: z.string().trim().max(500).optional(),
  sentiment: z.string().trim().max(40).optional(),
  importance_score: z.number().optional(),
  topic: z.string().trim().max(80).optional(),
  channel: z.string().trim().max(80).optional(),
});

export const aiNewsClusterRequestSchema = z.object({
  cadence: z.enum(["daily", "weekly", "monthly", "special"]).optional(),
  preferredRegions: z.array(z.string().trim().max(40)).max(8).optional(),
  preferredChannels: z.array(z.string().trim().max(40)).max(5).optional(),
  dealTitles: z.array(z.string().trim().max(200)).max(20).optional(),
  articles: z.array(articleItemSchema).max(60).optional(),
});

function extractJsonIssues(rawContent: string): Partial<AxiosUnitIssue>[] | null {
  const withoutFence = rawContent
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const tryParse = (str: string): Partial<AxiosUnitIssue>[] | null => {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) return parsed as Partial<AxiosUnitIssue>[];
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).unitIssues)) {
        return (parsed as { unitIssues: Partial<AxiosUnitIssue>[] }).unitIssues;
      }
      return null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(withoutFence);
  if (direct) return direct;

  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return tryParse(withoutFence.slice(start, end + 1));
  }
  return null;
}

/**
 * POST /api/broker/studio/ai-news-cluster
 * 중개인 개인 설정(권역 preferredRegions, 뉴스 큐레이션 분야 preferredChannels) 및 보유 매물 키워드를 바탕으로
 * 5대 핵심 이슈를 클러스터링하고, TaskFlow TF8 + M11 핀포인트 교정을 통해
 * AXIOS 카드뉴스형(2줄 제목 + 2줄 부제 해설) 포스트잇 5선을 생성한다.
 */
export async function POST(req: NextRequest) {
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_REQUEST", message: "요청 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  const parsed = aiNewsClusterRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "BAD_REQUEST",
          message: parsed.error.issues[0]?.message ?? "요청 항목이 올바르지 않습니다.",
        },
      },
      { status: 400 },
    );
  }

  const preferredRegions = normalizePreferredRegions(parsed.data.preferredRegions);
  const preferredChannels = normalizePreferredChannels(parsed.data.preferredChannels);
  const dealTitles = parsed.data.dealTitles ?? [];
  const articles: NewsPoolItem[] = parsed.data.articles ?? [];

  // 1. 결정론적 가중치 클러스터링 베이스라인 (가십 노이즈 제거 + 권역/채널 가중치 적용)
  const baselineClusters = clusterArticlesIntoFiveIssues(articles, {
    cadence: parsed.data.cadence ?? "monthly",
    preferredRegions,
    preferredChannels,
    dealKeywords: dealTitles,
  });

  // 2. TaskFlow TF8 프롬프트 생성
  const cadence = parsed.data.cadence ?? "monthly";
  const { systemPrompt, userPrompt, factBookContext } = buildTf8AxiosClusterPrompt({
    cadence,
    cadenceLabel: cadence,
    sourceArticles: [...articles, ...CURATED_CHANNEL_POOL],
    preferredRegions,
    preferredChannels,
    dealTitles,
    candidateIssues: baselineClusters,
  });

  try {
    const llmRes = await callLLM(
      {
        systemPrompt,
        userPrompt,
        model: getModel("luna"),
        temperature: 0.35,
        responseFormat: "json_object",
      },
      { allowMock: false, timeoutMs: 25_000 },
    );

    const content = typeof llmRes.content === "string" ? llmRes.content.trim() : "";
    const parsedIssues = content ? extractJsonIssues(content) : null;

    if (!parsedIssues || parsedIssues.length === 0 || (llmRes as { isMock?: boolean }).isMock) {
      const fallbackRepaired = repairAxiosClusterOutputBlock(
        baselineClusters,
        baselineClusters,
        factBookContext,
      );
      return NextResponse.json({
        ok: true,
        unitIssues: fallbackRepaired.unitIssues,
        warnings: fallbackRepaired.warnings,
        envelope: fallbackRepaired.envelope,
        usedFallback: true,
      });
    }

    const { unitIssues, warnings, envelope } = repairAxiosClusterOutputBlock(
      parsedIssues,
      baselineClusters,
      factBookContext,
    );

    // AI Core 출력 계약 검증: 교정 후에도 36/48자 카드 스키마를 위반하면 결정론적 클러스터로 안전 폴백
    const contract = AxiosClusterOutputSchema.safeParse({ unitIssues });
    if (!contract.success) {
      log.warn("[ai-news-cluster] repaired output violated card contract, using deterministic fallback", {
        issue: contract.error.issues[0]?.message,
      });
      const safe = repairAxiosClusterOutputBlock(baselineClusters, baselineClusters, factBookContext);
      return NextResponse.json({
        ok: true,
        unitIssues: safe.unitIssues,
        warnings: [...warnings, ...safe.warnings],
        envelope: safe.envelope,
        usedFallback: true,
      });
    }

    return NextResponse.json({
      ok: true,
      unitIssues,
      ...(warnings.length > 0 ? { warnings } : {}),
      envelope,
      usedFallback: false,
    });
  } catch (err) {
    if (err instanceof LLMMockNotAllowedError) {
      log.info("[ai-news-cluster] LLM mock blocked, returning TF8 deterministic AXIOS cluster");
    } else {
      log.warn("[ai-news-cluster] LLM call failed, returning TF8 deterministic AXIOS cluster:", err);
    }

    const fallbackRepaired = repairAxiosClusterOutputBlock(
      baselineClusters,
      baselineClusters,
      factBookContext,
    );

    return NextResponse.json({
      ok: true,
      unitIssues: fallbackRepaired.unitIssues,
      warnings: fallbackRepaired.warnings,
      envelope: fallbackRepaired.envelope,
      usedFallback: true,
    });
  }
}

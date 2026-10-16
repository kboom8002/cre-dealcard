import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { createServiceClient } from "@/lib/supabase/service";
import {
  requireBrokerContext,
  assertOwnsRow,
  notFoundResponse,
  jsonError,
} from "@/lib/magazine/authz";
import { GENERIC_ERROR_MESSAGE } from "@/lib/magazine/user-message";
import {
  generateSimpleEditionSummary,
  type SimpleDealInput,
  type SimpleKeyStatInput,
} from "@/domain/magazine/simple-edition-generator";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api-magazine-editions-simple-summary");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  comment: z.string().trim().min(10, "한마디를 10자 이상 입력해 주세요.").max(1000, "한마디는 1000자 이내로 입력해 주세요."),
  dealHighlights: z.array(z.unknown()).max(20).optional(),
  topNews: z.array(z.unknown()).max(20).optional(),
  marketTemp: z.string().max(40).nullable().optional(),
});

interface EditionRow {
  id: string;
  broker_id: string;
  market_temp?: string | null;
  content?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function toDeals(rawDeals: unknown[]): SimpleDealInput[] {
  const out: SimpleDealInput[] = [];
  for (const item of rawDeals) {
    if (!isRecord(item)) continue;
    const title = str(item.title) || str(item.buildingName) || str(item.name);
    const assetType = str(item.assetType) || str(item.asset_type);
    const address = str(item.address) || str(item.areaSignal) || str(item.area_signal);
    const priceRaw = item.price ?? item.priceDisplay ?? item.price_band ?? item.bandedPrice;
    const price =
      typeof priceRaw === "number" || typeof priceRaw === "string" ? priceRaw : undefined;
    out.push({
      ...(title ? { title } : {}),
      ...(assetType ? { assetType } : {}),
      ...(address ? { address } : {}),
      ...(price !== undefined ? { price } : {}),
    });
  }
  return out;
}

function toNewsTitles(rawNews: unknown[]): string[] {
  const out: string[] = [];
  for (const item of rawNews) {
    if (typeof item === "string" && item.trim()) {
      out.push(item.trim());
    } else if (isRecord(item) && str(item.title)) {
      out.push(str(item.title));
    }
  }
  return out;
}

function toKeyStats(rawStats: unknown): SimpleKeyStatInput[] {
  if (!Array.isArray(rawStats)) return [];
  const out: SimpleKeyStatInput[] = [];
  for (const item of rawStats) {
    if (!isRecord(item)) continue;
    const label = str(item.label);
    const value = str(item.value);
    if (label && value) out.push({ label, value });
  }
  return out;
}

/**
 * POST /api/magazine/editions/[id]/simple-summary
 * 간단 모드에서 중개인이 작성한 '이번 주 한마디'로 표지 헤드라인과 3줄 요약을 생성한다.
 * AI 실패·Mock·품질게이트 불합격 시에도 결정론적 폴백을 돌려주어 발행을 절대 막지 않는다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { ctx, error: authError } = await requireBrokerContext(request, { requireSlug: true });
    if (authError || !ctx || !ctx.slug) {
      return authError ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
    }

    let raw: unknown = {};
    try {
      const text = await request.text();
      raw = text ? JSON.parse(text) : {};
    } catch {
      return jsonError("INVALID_JSON", "요청 형식이 올바르지 않습니다.", 400);
    }

    const parsed = BodySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.";
      return jsonError("INVALID_INPUT", firstIssue, 400);
    }

    const supabase = createServiceClient();
    const edition = await assertOwnsRow<EditionRow>(supabase, "magazine_editions", id, ctx, {
      select: "id, broker_id, market_temp, content",
    });
    if (!edition) return notFoundResponse();

    const editionContent = isRecord(edition.content) ? edition.content : {};
    const rawDeals =
      parsed.data.dealHighlights ??
      (Array.isArray(editionContent.dealHighlights) ? editionContent.dealHighlights : []);
    const rawNews =
      parsed.data.topNews ??
      (Array.isArray(editionContent.topNews) ? editionContent.topNews : []);
    const marketTemp =
      parsed.data.marketTemp !== undefined
        ? parsed.data.marketTemp
        : str(edition.market_temp) || str(editionContent.market_temp) || null;

    const summary = await generateSimpleEditionSummary({
      comment: parsed.data.comment,
      brokerName: ctx.displayName ?? null,
      marketTemp,
      deals: toDeals(rawDeals),
      newsTitles: toNewsTitles(rawNews),
      keyStats: toKeyStats(editionContent.keyStats),
    });

    return NextResponse.json({
      ok: true,
      headline: summary.headline,
      briefing: summary.briefing,
      marketTemp: summary.marketTemp,
      keywords: summary.keywords,
      usedFallback: summary.usedFallback,
      ...(summary.reason ? { reason: summary.reason } : {}),
    });
  } catch (err: unknown) {
    log.error(
      "[api/magazine/editions/simple-summary]",
      err instanceof Error ? err.message : String(err),
    );
    return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }
}

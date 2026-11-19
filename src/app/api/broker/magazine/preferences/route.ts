import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import {
  BROKER_REGION_PRESETS,
  DEFAULT_PREFERRED_CHANNELS,
  DEFAULT_PREFERRED_REGIONS,
  getBrokerPreferencesFromMemory,
  normalizeBrokerPreferences,
  normalizePreferredChannels,
  normalizePreferredRegions,
  saveBrokerPreferencesToMemory,
  type BrokerNewsletterPreferences,
} from "@/domain/magazine/broker-preferences";
import { SPECIFIC_NEWS_CHANNELS } from "@/domain/magazine/news-channels";
import { isSchemaMissingError } from "@/domain/magazine/consent-service";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("broker-magazine-preferences");

const patchPreferencesSchema = z.object({
  preferredRegions: z.array(z.string().trim().max(40)).max(8).optional(),
  preferredChannels: z.array(z.string().trim().max(40)).max(5).optional(),
});

export async function loadBrokerNewsletterPreferences(
  supabase: ReturnType<typeof createServiceClient>,
  brokerId: string,
  opts: { throwOnDbError?: boolean } = {},
): Promise<BrokerNewsletterPreferences> {
  try {
    let profileRes = await supabase
      .from("broker_profiles")
      .select("specialty_regions, updated_at")
      .eq("user_id", brokerId)
      .maybeSingle();

    if (profileRes?.error && isSchemaMissingError(profileRes.error)) {
      // specialty_regions 미적용 DB 호환 폴백
      profileRes = await supabase
        .from("broker_profiles")
        .select("updated_at")
        .eq("user_id", brokerId)
        .maybeSingle();
    }

    const eventRes = await supabase
      .from("activity_events")
      .select("metadata, created_at")
      .eq("actor_id", brokerId)
      .in("event_type", ["newsletter_prefs_upserted", "newsletter_preferences_updated"])
      .order("created_at", { ascending: false })
      .limit(1);

    const realDbError =
      (profileRes?.error && !isSchemaMissingError(profileRes.error) ? profileRes.error : null) ||
      (eventRes?.error && !isSchemaMissingError(eventRes.error) ? eventRes.error : null);

    if (realDbError && opts.throwOnDbError) {
      throw new Error(realDbError.message || "DB query failed");
    }

    const profileRow = (profileRes?.data ?? null) as {
      specialty_regions?: unknown;
      updated_at?: string | null;
    } | null;
    const eventRows = eventRes?.data;

    const latestEvent = Array.isArray(eventRows) && eventRows.length > 0 ? eventRows[0] : null;
    const eventMeta =
      latestEvent?.metadata && typeof latestEvent.metadata === "object"
        ? (latestEvent.metadata as Record<string, unknown>)
        : {};
    const memPrefs = getBrokerPreferencesFromMemory(brokerId);

    const rawRegions =
      Array.isArray(eventMeta.preferredRegions) && eventMeta.preferredRegions.length > 0
        ? eventMeta.preferredRegions
        : Array.isArray(profileRow?.specialty_regions) && profileRow.specialty_regions.length > 0
          ? profileRow.specialty_regions
          : memPrefs.updatedAt
            ? memPrefs.preferredRegions
            : [...DEFAULT_PREFERRED_REGIONS];

    const rawChannels =
      Array.isArray(eventMeta.preferredChannels) && eventMeta.preferredChannels.length > 0
        ? eventMeta.preferredChannels
        : memPrefs.updatedAt
          ? memPrefs.preferredChannels
          : [...DEFAULT_PREFERRED_CHANNELS];

    return normalizeBrokerPreferences({
      preferredRegions: rawRegions,
      preferredChannels: rawChannels,
      updatedAt:
        typeof latestEvent?.created_at === "string"
          ? latestEvent.created_at
          : typeof profileRow?.updated_at === "string"
            ? profileRow.updated_at
            : null,
    });
  } catch (err) {
    if (opts.throwOnDbError) throw err;
    log.warn("[preferences] Failed to load broker preferences, using defaults:", err);
    return {
      preferredRegions: [...DEFAULT_PREFERRED_REGIONS],
      preferredChannels: [...DEFAULT_PREFERRED_CHANNELS],
      updatedAt: null,
    };
  }
}

/**
 * GET /api/broker/magazine/preferences
 * 공인중개사의 뉴스레터 주력 권역(preferredRegions) 및 뉴스 큐레이션 분야(preferredChannels) 설정 조회
 */
export async function GET(req: NextRequest) {
  const auth = await requireBroker(req);
  if (auth.error || !auth.user) return auth.error!;

  try {
    const supabase = createServiceClient();
    const preferences = await loadBrokerNewsletterPreferences(supabase, auth.user.id, {
      throwOnDbError: true,
    });

    return NextResponse.json({
      ok: true,
      preferences,
      regionPresets: BROKER_REGION_PRESETS,
      channelPresets: SPECIFIC_NEWS_CHANNELS,
    });
  } catch (err) {
    log.error("[preferences] GET failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: { code: "DB_ERROR", message: "설정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." } },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/broker/magazine/preferences
 * 공인중개사의 주력 권역 및 뉴스 큐레이션 분야 설정 저장 (broker_profiles + activity_events 영속화)
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireBroker(req);
  if (auth.error || !auth.user) return auth.error!;
  const brokerId = auth.user.id;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_REQUEST", message: "요청 형식이 올바르지 않습니다." } },
      { status: 400 },
    );
  }

  const parsed = patchPreferencesSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "BAD_REQUEST",
          message: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.",
        },
      },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  let current: BrokerNewsletterPreferences;
  try {
    current = await loadBrokerNewsletterPreferences(supabase, brokerId, { throwOnDbError: true });
  } catch (err) {
    log.error("[preferences] PATCH preload failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: { code: "DB_ERROR", message: "기존 설정 조회에 실패했습니다." } },
      { status: 500 },
    );
  }

  const nextRegions =
    parsed.data.preferredRegions !== undefined
      ? normalizePreferredRegions(parsed.data.preferredRegions)
      : current.preferredRegions;
  const nextChannels =
    parsed.data.preferredChannels !== undefined
      ? normalizePreferredChannels(parsed.data.preferredChannels)
      : current.preferredChannels;

  const finalRegions = nextRegions.length > 0 ? nextRegions : [...DEFAULT_PREFERRED_REGIONS];
  const nowIso = new Date().toISOString();

  try {
    let bpRes = await supabase
      .from("broker_profiles")
      .update({
        specialty_regions: finalRegions,
        updated_at: nowIso,
      })
      .eq("user_id", brokerId);

    if (bpRes?.error && isSchemaMissingError(bpRes.error)) {
      // specialty_regions 컬럼 미적용 DB 호환 폴백
      bpRes = await supabase
        .from("broker_profiles")
        .update({ updated_at: nowIso })
        .eq("user_id", brokerId);
    }

    const evRes = await supabase.from("activity_events").insert({
      actor_id: brokerId,
      actor_role: "broker",
      event_type: "newsletter_prefs_upserted",
      entity_type: "broker_profiles",
      entity_id: brokerId,
      metadata: {
        preferredRegions: finalRegions,
        preferredChannels: nextChannels,
        updatedAt: nowIso,
      },
    });

    const persistErr =
      (bpRes?.error && !isSchemaMissingError(bpRes.error) ? bpRes.error : null) ||
      evRes?.error ||
      null;

    if (persistErr) {
      log.error("[preferences] Persistence failed", {
        code: persistErr.code,
        message: persistErr.message,
      });
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "PERSISTENCE_FAILED",
            message: "설정 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
          },
        },
        { status: 500 },
      );
    }
  } catch (err) {
    log.error("[preferences] Persistence threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "PERSISTENCE_FAILED",
          message: "설정 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        },
      },
      { status: 500 },
    );
  }

  const preferences = saveBrokerPreferencesToMemory(brokerId, {
    preferredRegions: finalRegions,
    preferredChannels: nextChannels,
    updatedAt: nowIso,
  });

  return NextResponse.json({
    ok: true,
    preferences,
  });
}

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
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("broker-magazine-preferences");

const patchPreferencesSchema = z.object({
  preferredRegions: z.array(z.string().trim().max(40)).max(8).optional(),
  preferredChannels: z.array(z.string().trim().max(40)).max(5).optional(),
});

export async function loadBrokerNewsletterPreferences(
  supabase: ReturnType<typeof createServiceClient>,
  brokerId: string,
): Promise<BrokerNewsletterPreferences> {
  try {
    const [{ data: profileRow }, { data: eventRows }] = await Promise.all([
      supabase
        .from("broker_profiles")
        .select("specialty_regions, updated_at")
        .eq("user_id", brokerId)
        .maybeSingle(),
      supabase
        .from("activity_events")
        .select("metadata, created_at")
        .eq("actor_id", brokerId)
        .in("event_type", ["newsletter_prefs_upserted", "newsletter_preferences_updated"])
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

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
 * 중개인의 뉴스레터 주력 권역(preferredRegions) 및 뉴스 큐레이션 분야(preferredChannels) 설정 조회
 */
export async function GET(req: NextRequest) {
  const auth = await requireBroker(req);
  if (auth.error || !auth.user) return auth.error!;

  const supabase = createServiceClient();
  const preferences = await loadBrokerNewsletterPreferences(supabase, auth.user.id);

  return NextResponse.json({
    ok: true,
    preferences,
    regionPresets: BROKER_REGION_PRESETS,
    channelPresets: SPECIFIC_NEWS_CHANNELS,
  });
}

/**
 * PATCH /api/broker/magazine/preferences
 * 중개인의 주력 권역 및 뉴스 큐레이션 분야 설정 저장 (broker_profiles + activity_events 영속화)
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
  const current = await loadBrokerNewsletterPreferences(supabase, brokerId);

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
    await Promise.all([
      supabase
        .from("broker_profiles")
        .update({
          specialty_regions: finalRegions,
          updated_at: nowIso,
        })
        .eq("user_id", brokerId),
      supabase.from("activity_events").insert({
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
      }),
    ]);
  } catch (err) {
    log.warn("[preferences] Non-fatal persistence error:", err);
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

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { escapeIlike } from "@/lib/utils/postgrest-escape";

/**
 * P1-3 (WP-7.3A): deterministic public broker-profile resolution.
 *
 * Resolution order (all require `broker_profiles.is_public = true`):
 *  1. exact `broker_profiles.slug`
 *  2. exact `broker_profiles.user_id` when the slug is a UUID (hub fallback links)
 *  3. exact `profiles.display_name` (legacy name links; case-insensitive, wildcards
 *     escaped) — ONLY when exactly one broker has that name. The previous
 *     `ilike %name%` fallback returned an arbitrary row
 *     for partial/ambiguous names; ambiguity now resolves to 404.
 *
 * `isVerified` mirrors `broker_profiles.is_verified` (00001 schema, default false) so the
 * "Verified" badge / "검증 프로필" copy is never rendered unconditionally.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SLUG_LENGTH = 120;

export interface PublicBrokerProfile {
  profileId: string;
  displayName: string | null;
  company: string | null;
  photoUrl: string | null;
  tagline: string | null;
  bio: string | null;
  specialtyRegions: string[];
  specialtyAssets: string[];
  slug: string | null;
  isVerified: boolean;
  /** Path-only canonical URL (metadataBase supplies the origin). */
  canonicalPath: string;
}

export function safeDecodeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

interface BrokerProfileRow {
  user_id: string;
  slug: string | null;
  is_verified: boolean | null;
  bio?: string | null;
  specialty_regions?: string[] | null;
  specialty_assets?: string[] | null;
}

interface ProfileRow {
  id: string;
  role?: string | null;
  display_name: string | null;
  company?: string | null;
  photo_url?: string | null;
  tagline?: string | null;
}

function isMissingColumnError(
  err: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  return /column .* does not exist|schema cache/i.test(String(err.message || ""));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = SupabaseClient<any, any, any>;

async function findPublicBrokerRow(
  supabase: LooseClient,
  column: "slug" | "user_id",
  value: string,
): Promise<BrokerProfileRow | null> {
  const enriched = await supabase
    .from("broker_profiles")
    .select("user_id, slug, is_verified, bio, specialty_regions, specialty_assets")
    .eq(column, value)
    .eq("is_public", true)
    .limit(1)
    .maybeSingle();

  if (enriched.error && isMissingColumnError(enriched.error)) {
    const fallback = await supabase
      .from("broker_profiles")
      .select("user_id, slug, is_verified")
      .eq(column, value)
      .eq("is_public", true)
      .limit(1)
      .maybeSingle();
    return (fallback.data as BrokerProfileRow | null) ?? null;
  }

  return (enriched.data as BrokerProfileRow | null) ?? null;
}

export async function findPublicBrokerProfile(
  supabase: LooseClient,
  rawSlug: string,
): Promise<PublicBrokerProfile | null> {
  const decoded = safeDecodeSlug(String(rawSlug ?? "")).trim();
  if (!decoded || decoded.length > MAX_SLUG_LENGTH) return null;

  let bp = await findPublicBrokerRow(supabase, "slug", decoded);

  if (!bp && UUID_REGEX.test(decoded)) {
    bp = await findPublicBrokerRow(supabase, "user_id", decoded.toLowerCase());
  }

  if (!bp) {
    const candidates = Array.from(
      new Set([decoded, decoded.replace(/-/g, " ").replace(/\s+/g, " ").trim()].filter(Boolean)),
    );
    // Exact (case-insensitive, wildcard-escaped — no `%`) display-name match.
    const matchedIds = new Set<string>();
    for (const candidate of candidates) {
      let nameQuery = supabase.from("profiles").select("id");
      if (typeof nameQuery.in === "function") {
        nameQuery = nameQuery.in("role", ["broker", "admin"]);
      } else {
        nameQuery = nameQuery.eq("role", "broker");
      }
      const { data: nameMatches } = await nameQuery
        .ilike("display_name", escapeIlike(candidate))
        .limit(2);
      for (const row of (nameMatches as Array<{ id: string }> | null) ?? []) {
        if (row?.id) matchedIds.add(row.id);
      }
    }
    if (matchedIds.size !== 1) return null; // none or ambiguous → 404 (deterministic)
    bp = await findPublicBrokerRow(supabase, "user_id", [...matchedIds][0]);
  }

  if (!bp?.user_id) return null;

  const fetchProfileWithCols = async (cols: string) => {
    let q = supabase.from("profiles").select(cols).eq("id", bp.user_id);
    if (typeof q.in === "function") {
      q = q.in("role", ["broker", "admin"]);
    } else {
      q = q.eq("role", "broker");
    }
    return q.limit(1).maybeSingle();
  };

  let profRes = await fetchProfileWithCols(
    "id, display_name, role, company, photo_url, tagline",
  );
  if (profRes.error && isMissingColumnError(profRes.error)) {
    profRes = await fetchProfileWithCols("id, display_name, role, company");
  }
  if (profRes.error && isMissingColumnError(profRes.error)) {
    profRes = await fetchProfileWithCols("id, display_name, role");
  }

  const profileRow = (profRes.data as ProfileRow | null) ?? null;
  if (!profileRow) return null;
  if (profileRow.role && profileRow.role !== "broker" && profileRow.role !== "admin") {
    return null;
  }

  const canonicalKey = bp.slug && bp.slug.trim() ? bp.slug.trim() : profileRow.id;
  return {
    profileId: profileRow.id,
    displayName: profileRow.display_name ?? null,
    company: typeof profileRow.company === "string" && profileRow.company.trim() ? profileRow.company.trim() : null,
    photoUrl: typeof profileRow.photo_url === "string" && profileRow.photo_url.trim() ? profileRow.photo_url.trim() : null,
    tagline: typeof profileRow.tagline === "string" && profileRow.tagline.trim() ? profileRow.tagline.trim() : null,
    bio: typeof bp.bio === "string" && bp.bio.trim() ? bp.bio.trim() : null,
    specialtyRegions: Array.isArray(bp.specialty_regions)
      ? bp.specialty_regions.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
      : [],
    specialtyAssets: Array.isArray(bp.specialty_assets)
      ? bp.specialty_assets.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
      : [],
    slug: bp.slug ?? null,
    isVerified: bp.is_verified === true,
    canonicalPath: `/broker-profile/${encodeURIComponent(canonicalKey)}`,
  };
}

/** Request-scoped memo so generateMetadata and the page share one lookup. */
export const loadPublicBrokerProfile = cache(async (rawSlug: string) =>
  findPublicBrokerProfile(createServiceClient() as LooseClient, rawSlug),
);

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createServiceClient } from "@/lib/supabase/service";
import { escapeIlike } from "@/lib/utils/postgrest-escape";
import {
  isDemoSeedDisabledForProd,
  resolvePublicDealWorkspaceGuard,
} from "@/lib/og/deal-public-guard";
import {
  evaluateDealCardPublicVisibility,
  PUBLIC_WORKSPACE_ITEM_STATUSES,
} from "@/domain/public-projection/visibility";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/magazine/public-guard";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("route");

const BLIND_DEAL_SELECT_COLUMNS =
  "id, area_signal, asset_type, price_band, size_signal, status, updated_at, owner_id";

const LEASE_SPACE_SELECT_COLUMNS =
  "id, building_id, floor, area_sqm, space_type, deposit, monthly_rent, status, is_marketplace_listed";

const DEAL_CANDIDATE_WINDOW = 200;

const REGION_LABELS: Record<string, string> = {
  gbd: "강남",
  ybd: "여의도",
  cbd: "종로",
  seongsu: "성수",
  pangyo: "판교",
  mapo: "마포",
  jongno: "종로",
  hongdae: "홍대",
};

const SPACE_TYPE_LABELS: Record<string, string> = {
  office: "오피스",
  retail: "리테일",
  f_and_b: "F&B",
  warehouse: "물류/창고",
  other: "임대 공간",
};

const SPACE_TYPE_ALIASES: Record<string, readonly string[]> = {
  office: ["office", "오피스", "업무", "사무실"],
  retail: ["retail", "리테일", "판매", "매장"],
  f_and_b: ["f_and_b", "f&b", "fnb", "식음료", "상가", "카페", "음식점"],
  warehouse: ["warehouse", "물류", "창고", "물류/창고"],
  other: ["other", "기타", "임대 공간"],
};

const PublicSearchQuerySchema = z.object({
  type: z.enum(["deal", "space", "market", "broker"]).default("deal"),
  region: z.string().max(50).default(""),
  q: z.string().default(""),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

function sanitizePostgrestSearchTerm(raw: string): string {
  const trimmed = String(raw || "").trim().slice(0, 80);
  if (!trimmed) return "";
  const stripped = trimmed.replace(/[,()*:;"'\\\u0000-\u001F\u007F]/g, "").trim();
  return stripped ? escapeIlike(stripped) : "";
}

function clampPageNumber(rawPage: string | null | undefined): number {
  const numeric =
    rawPage !== null && rawPage !== undefined && rawPage.trim() !== ""
      ? Number(rawPage)
      : 1;
  return Math.max(1, Math.min(100, Number.isFinite(numeric) ? Math.floor(numeric) : 1));
}

function isMissingRelationError(
  err: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!err) return false;
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  return /relation .* does not exist|could not find the table/i.test(String(err.message || ""));
}

function isMissingColumnError(
  err: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  return /column .* does not exist|schema cache/i.test(String(err.message || ""));
}

function matchesSpaceRegion(regionSlug: string, haystackRaw: string): boolean {
  const reg = regionSlug.trim().toLowerCase();
  if (!reg || reg === "all") return true;
  const hay = haystackRaw.toLowerCase();
  const kor = REGION_LABELS[reg]?.toLowerCase() ?? "";
  if (hay.includes(reg) || (kor && hay.includes(kor))) return true;
  if (reg === "gbd") return /강남|서초|역삼|삼성|선릉|논현|청담/.test(hay);
  if (reg === "ybd") return /여의도|영등포/.test(hay);
  if (reg === "cbd") return /종로|을지로|광화문|중구|도심/.test(hay);
  if (reg === "seongsu") return /성수|뚝섬|성동/.test(hay);
  if (reg === "pangyo") return /판교|분당/.test(hay);
  if (reg === "mapo") return /마포|공덕|상암/.test(hay);
  if (reg === "hongdae") return /홍대|연남|합정|동교/.test(hay);
  return false;
}

function matchesSpaceQuery(
  rawQuery: string,
  fields: {
    areaSignal: string | null;
    spaceType: string | null;
    spaceTypeLabel: string | null;
    floor: string | null;
    title: string;
  },
): boolean {
  const qLower = rawQuery.trim().toLowerCase();
  if (!qLower) return true;
  const hay = [
    fields.areaSignal,
    fields.spaceType,
    fields.spaceTypeLabel,
    fields.floor,
    fields.title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (hay.includes(qLower)) return true;

  const stKey = (fields.spaceType ?? "").trim().toLowerCase();
  const aliases = SPACE_TYPE_ALIASES[stKey];
  if (aliases && aliases.some((a) => a.includes(qLower) || qLower.includes(a))) {
    return true;
  }
  return false;
}

interface BlindDealRow {
  id: string;
  area_signal?: string | null;
  asset_type?: string | null;
  price_band?: string | null;
  size_signal?: string | null;
  status?: string | null;
  updated_at?: string | null;
  owner_id?: string | null;
}

async function filterPublicVisibleDealRows(
  supabase: ReturnType<typeof createServiceClient>,
  rows: BlindDealRow[],
): Promise<Array<Omit<BlindDealRow, "owner_id">>> {
  const readyRows = rows.filter(
    (row) =>
      Boolean(row?.id) &&
      row.status === "public_signal_ready" &&
      !isDemoSeedDisabledForProd(String(row.id)),
  );
  if (readyRows.length === 0) return [];

  const candidateIds = readyRows.map((r) => String(r.id));
  const signalCardMap = new Map<string, { visibility?: string | null; status?: string | null }>();

  try {
    const scTable = supabase.from("building_signal_cards") as unknown as {
      select?: (cols: string) => {
        in?: (
          col: string,
          vals: string[],
        ) => PromiseLike<{ data?: Array<Record<string, unknown>> | null }>;
      };
    };
    const scQuery = scTable?.select?.("building_id, visibility, status");
    const scRes =
      typeof scQuery?.in === "function"
        ? await scQuery.in("building_id", candidateIds)
        : null;
    for (const sc of scRes?.data ?? []) {
      const bId = sc?.building_id ? String(sc.building_id) : "";
      if (bId && !signalCardMap.has(bId)) {
        signalCardMap.set(bId, {
          visibility: typeof sc.visibility === "string" ? sc.visibility : null,
          status: typeof sc.status === "string" ? sc.status : null,
        });
      }
    }
  } catch {
    // Non-blocking when signal cards table is absent in lightweight test harnesses
  }

  const verified = await Promise.all(
    readyRows.map(async (row) => {
      const id = String(row.id);
      const guard = await resolvePublicDealWorkspaceGuard({ id, supabase });
      if (guard.blocked) return null;
      if (guard.item && !PUBLIC_WORKSPACE_ITEM_STATUSES.includes(guard.item.status)) {
        return null;
      }

      const sig = signalCardMap.get(id);
      const vis = evaluateDealCardPublicVisibility({
        buildingStatus: row.status ?? "public_signal_ready",
        signalCardVisibility: sig?.visibility ?? null,
        signalCardStatus: sig?.status ?? null,
        workspaceItemStatus: guard.item?.status ?? guard.workspaceItemStatus ?? null,
      });
      if (!vis.isPublic) return null;

      return {
        id,
        area_signal: row.area_signal ?? null,
        asset_type: row.asset_type ?? null,
        price_band: row.price_band ?? null,
        size_signal: row.size_signal ?? null,
        status: row.status ?? "public_signal_ready",
        updated_at: row.updated_at ?? null,
      };
    }),
  );

  return verified.filter((item): item is NonNullable<typeof item> => item !== null);
}

/**
 * GET /api/public/search
 * Unified public search API for deals, spaces, market pulse, and brokers.
 */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req) ?? "anonymous";
  const allowed = await checkRateLimit(ip, "public_search", 60, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "요청 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  const parsed = PublicSearchQuerySchema.safeParse({
    type: req.nextUrl.searchParams.get("type") ?? undefined,
    region: req.nextUrl.searchParams.get("region") ?? undefined,
    q: req.nextUrl.searchParams.get("q") ?? undefined,
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "잘못된 검색 파라미터입니다.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { type, region, q, limit } = parsed.data;
  const pageNum = clampPageNumber(req.nextUrl.searchParams.get("page"));
  const trimmedQ = q.trim().slice(0, 80);
  const safeQ = sanitizePostgrestSearchTerm(q);

  if (trimmedQ.length > 0 && !safeQ) {
    return NextResponse.json({
      data: [],
      total: 0,
      page: pageNum,
      limit,
    });
  }

  const from = (pageNum - 1) * limit;
  const to = from + limit - 1;
  const supabase = createServiceClient();

  try {
    // 1. DEAL SEARCH (post-filter pagination over bounded candidate window)
    if (type === "deal") {
      let query = supabase
        .from("building_ssot_lite")
        .select(BLIND_DEAL_SELECT_COLUMNS)
        .eq("status", "public_signal_ready")
        .order("updated_at", { ascending: false });

      if (region && region !== "all") {
        const regionLabel = REGION_LABELS[region];
        if (regionLabel) {
          query = query.ilike("area_signal", `%${escapeIlike(regionLabel)}%`);
        }
      }
      if (safeQ) {
        query = query.or(`area_signal.ilike.%${safeQ}%,asset_type.ilike.%${safeQ}%`);
      }

      if (typeof query.range === "function") {
        query = query.range(0, DEAL_CANDIDATE_WINDOW - 1);
      } else if (typeof query.limit === "function") {
        query = query.limit(DEAL_CANDIDATE_WINDOW);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rawRows = (data ?? []) as BlindDealRow[];
      const visibleRows = await filterPublicVisibleDealRows(supabase, rawRows);
      const paginatedRows = visibleRows.slice(from, from + limit);

      let finalData: Array<Record<string, unknown>> = paginatedRows;
      let finalCount = visibleRows.length;

      // Fallback to MOLIT external transactions only when no internal candidates matched
      if (rawRows.length === 0 && visibleRows.length === 0 && pageNum === 1) {
        let molitQuery = supabase
          .from("external_transactions")
          .select("id, district, dong, usage_type, transaction_price, transaction_date")
          .order("transaction_date", { ascending: false })
          .limit(limit);

        if (safeQ) {
          molitQuery = molitQuery.or(
            `district.ilike.%${safeQ}%,dong.ilike.%${safeQ}%,usage_type.ilike.%${safeQ}%`,
          );
        }

        const { data: molitData, error: molitError } = await molitQuery;
        if (!molitError && molitData && molitData.length > 0) {
          finalData = molitData.map((t: Record<string, unknown>) => ({
            id: `molit-${String(t.id ?? "")}`,
            area_signal:
              `${String(t.district ?? "")} ${String(t.dong ?? "")}`.trim() || "권역 실거래",
            asset_type: String(t.usage_type || "상업용"),
            price_band:
              typeof t.transaction_price === "number" && t.transaction_price > 0
                ? `${Math.round(t.transaction_price / 10000)}억 (실거래)`
                : "비공개",
            status: "molit_transaction",
            updated_at: t.transaction_date ?? null,
            source: "MOLIT (국토교통부)",
          }));
          finalCount = finalData.length;
        }
      }

      return NextResponse.json({
        data: finalData,
        total: finalCount,
        page: pageNum,
        limit,
      });
    }

    // 2. SPACE SEARCH (LEASING — real 00021_lease_spaces schema only)
    if (type === "space") {
      let spaceQuery = supabase.from("lease_spaces").select(LEASE_SPACE_SELECT_COLUMNS);
      if (typeof spaceQuery.in === "function") {
        spaceQuery = spaceQuery.in("status", ["active", "published"]);
      } else if (typeof spaceQuery.eq === "function") {
        spaceQuery = spaceQuery.eq("status", "active");
      }
      spaceQuery = spaceQuery
        .eq("is_marketplace_listed", true)
        .order("created_at", { ascending: false });
      if (typeof spaceQuery.limit === "function") {
        spaceQuery = spaceQuery.limit(DEAL_CANDIDATE_WINDOW);
      }

      const spaceRes = await spaceQuery;
      if (spaceRes.error) {
        if (isMissingRelationError(spaceRes.error)) {
          return NextResponse.json({ data: [], total: 0, page: pageNum, limit });
        }
        throw spaceRes.error;
      }

      const candidateSpaces = ((spaceRes.data ?? []) as Array<Record<string, unknown>>).filter(
        (r) => {
          if (!r?.id || isDemoSeedDisabledForProd(String(r.id))) return false;
          if (r.building_id && isDemoSeedDisabledForProd(String(r.building_id))) return false;
          const st = String(r.status ?? "");
          if (st !== "active" && st !== "published") return false;
          if (r.is_marketplace_listed !== true) return false;
          return true;
        },
      );

      const buildingIds = Array.from(
        new Set(
          candidateSpaces
            .map((r) => (r.building_id ? String(r.building_id) : ""))
            .filter(Boolean),
        ),
      );
      const buildingAreaMap = new Map<string, string | null>();
      if (buildingIds.length > 0) {
        let bldQuery = supabase
          .from("building_ssot_lite")
          .select(BLIND_DEAL_SELECT_COLUMNS)
          .eq("status", "public_signal_ready");
        if (typeof bldQuery.in === "function") {
          bldQuery = bldQuery.in("id", buildingIds);
        }
        const { data: bldRows } = await bldQuery;
        const verifiedBlds = await filterPublicVisibleDealRows(
          supabase,
          (bldRows ?? []) as BlindDealRow[],
        );
        for (const b of verifiedBlds) {
          buildingAreaMap.set(String(b.id), b.area_signal ?? null);
        }
      }

      const enrichedSpaces = candidateSpaces
        .map((r) => {
          const mockArea =
            typeof r.area_signal === "string" && r.area_signal.trim()
              ? r.area_signal.trim()
              : null;
          const parentArea = r.building_id
            ? (buildingAreaMap.get(String(r.building_id)) ?? null)
            : null;
          const areaSignal = parentArea || mockArea || null;
          const rawSpaceType =
            typeof r.space_type === "string" && r.space_type.trim()
              ? r.space_type.trim()
              : null;
          const spaceTypeLabel = rawSpaceType
            ? (SPACE_TYPE_LABELS[rawSpaceType.toLowerCase()] ?? rawSpaceType)
            : null;
          const mockTitle =
            typeof r.title === "string" && r.title.trim() ? r.title.trim() : null;
          const title =
            mockTitle || `${areaSignal || "상업용"} ${spaceTypeLabel || "임대 공간"}`;
          const floor =
            typeof r.floor === "string" && r.floor.trim() ? r.floor.trim() : null;

          return {
            id: String(r.id),
            building_id: r.building_id ? String(r.building_id) : null,
            floor,
            area_sqm: typeof r.area_sqm === "number" ? r.area_sqm : null,
            space_type: rawSpaceType,
            deposit: typeof r.deposit === "number" ? r.deposit : null,
            monthly_rent: typeof r.monthly_rent === "number" ? r.monthly_rent : null,
            status: String(r.status ?? "active"),
            is_marketplace_listed: true,
            area_signal: areaSignal,
            title,
            _spaceTypeLabel: spaceTypeLabel,
          };
        })
        .filter((item) => {
          if (region && region !== "all") {
            const hay = `${item.area_signal ?? ""} ${item.title}`;
            if (!matchesSpaceRegion(region, hay)) return false;
          }
          if (trimmedQ) {
            if (
              !matchesSpaceQuery(trimmedQ, {
                areaSignal: item.area_signal,
                spaceType: item.space_type,
                spaceTypeLabel: item._spaceTypeLabel,
                floor: item.floor,
                title: item.title,
              })
            ) {
              return false;
            }
          }
          return true;
        })
        .map((item) => ({
          id: item.id,
          building_id: item.building_id,
          floor: item.floor,
          area_sqm: item.area_sqm,
          space_type: item.space_type,
          deposit: item.deposit,
          monthly_rent: item.monthly_rent,
          status: item.status,
          is_marketplace_listed: item.is_marketplace_listed,
          area_signal: item.area_signal,
          title: item.title,
        }));

      return NextResponse.json({
        data: enrichedSpaces.slice(from, from + limit),
        total: enrichedSpaces.length,
        page: pageNum,
        limit,
      });
    }

    // 3. MARKET PULSE SEARCH
    if (type === "market") {
      let query = supabase
        .from("cre_pulses")
        .select("region, period_type, pulse_score, trend, summary_ko, period_label, seo_slug", {
          count: "exact",
        })
        .eq("status", "published")
        .eq("period_type", "weekly")
        .order("created_at", { ascending: false });

      if (region && region !== "all") {
        query = query.eq("region", region);
      }
      if (safeQ) {
        query = query.ilike("summary_ko", `%${safeQ}%`);
      }

      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      return NextResponse.json({
        data: data ?? [],
        total: count ?? data?.length ?? 0,
        page: pageNum,
        limit,
      });
    }

    // 4. BROKER SEARCH
    if (type === "broker") {
      const buildBrokerQuery = (extendedCols: boolean) => {
        const selectExpr = extendedCols
          ? `
          id,
          role,
          display_name,
          company,
          photo_url,
          tagline,
          broker_profiles!inner (
            slug,
            specialty_regions,
            specialty_assets,
            bio,
            vibe_vti,
            vibe_trust,
            vibe_valence,
            is_public,
            seo_summary,
            is_verified
          )
        `
          : `
          id,
          role,
          display_name,
          company,
          broker_profiles!inner (
            slug,
            specialty_regions,
            specialty_assets,
            bio,
            is_public,
            is_verified
          )
        `;
        let qBuilder = supabase.from("profiles").select(selectExpr);
        if (typeof qBuilder.in === "function") {
          qBuilder = qBuilder.in("role", ["broker", "admin"]);
        } else {
          qBuilder = qBuilder.eq("role", "broker");
        }
        return qBuilder.eq("broker_profiles.is_public", true);
      };

      let brokerRes = await buildBrokerQuery(true);
      if (brokerRes.error && isMissingColumnError(brokerRes.error)) {
        brokerRes = await buildBrokerQuery(false);
      }
      if (brokerRes.error) throw brokerRes.error;

      type BrokerQueryRow = Record<string, unknown> & {
        broker_profiles?: Record<string, unknown> | Array<Record<string, unknown>> | null;
      };

      const unwrapBp = (row: BrokerQueryRow): Record<string, unknown> => {
        const raw = row.broker_profiles;
        if (Array.isArray(raw)) return (raw[0] ?? {}) as Record<string, unknown>;
        return (raw ?? {}) as Record<string, unknown>;
      };

      let filtered = ((brokerRes.data ?? []) as unknown as BrokerQueryRow[]).filter((p) => {
        const bp = unwrapBp(p);
        if (bp.is_public === false) return false;
        const r = typeof p.role === "string" ? p.role : "broker";
        return r === "broker" || r === "admin";
      });

      // A. Region filter
      if (region && region !== "all") {
        const reg = region.toLowerCase();
        filtered = filtered.filter((p) => {
          const bp = unwrapBp(p);
          const regions = Array.isArray(bp.specialty_regions)
            ? (bp.specialty_regions as string[])
            : [];
          return regions.some((r: string) => {
            const rLower = r.toLowerCase();
            return (
              rLower.includes(reg) ||
              (reg === "gbd" && (rLower.includes("강남") || rLower.includes("서초"))) ||
              (reg === "ybd" &&
                (rLower.includes("여의도") ||
                  rLower.includes("영등포") ||
                  rLower.includes("마포"))) ||
              (reg === "cbd" &&
                (rLower.includes("종로") ||
                  rLower.includes("중구") ||
                  rLower.includes("도심"))) ||
              (reg === "seongsu" && rLower.includes("성수")) ||
              (reg === "pangyo" && rLower.includes("판교"))
            );
          });
        });
      }

      // B. Keyword filter
      if (trimmedQ) {
        const qLower = trimmedQ.toLowerCase();
        filtered = filtered.filter((p) => {
          const bp = unwrapBp(p);
          const displayName = String(p.display_name ?? "").toLowerCase();
          const company = String(p.company ?? "").toLowerCase();
          const tagline = String(p.tagline ?? "").toLowerCase();
          const bio = String(bp.bio ?? "").toLowerCase();
          const seoSummary = String(bp.seo_summary ?? "").toLowerCase();
          const regions = Array.isArray(bp.specialty_regions)
            ? bp.specialty_regions.join(" ").toLowerCase()
            : "";
          const assets = Array.isArray(bp.specialty_assets)
            ? bp.specialty_assets.join(" ").toLowerCase()
            : "";
          const vti = String(bp.vibe_vti ?? "").toLowerCase();

          return (
            displayName.includes(qLower) ||
            company.includes(qLower) ||
            tagline.includes(qLower) ||
            bio.includes(qLower) ||
            seoSummary.includes(qLower) ||
            regions.includes(qLower) ||
            assets.includes(qLower) ||
            vti.includes(qLower)
          );
        });
      }

      // Compute verified public DealCard counts per broker (never unverified total_deal_count_self)
      const verifiedBrokerDealCounts = new Map<string, number>();
      const brokerIds = Array.from(
        new Set(filtered.map((p) => String(p.id ?? "")).filter(Boolean)),
      );
      if (brokerIds.length > 0) {
        let dealCountQuery = supabase
          .from("building_ssot_lite")
          .select(BLIND_DEAL_SELECT_COLUMNS)
          .eq("status", "public_signal_ready");
        if (typeof dealCountQuery.in === "function") {
          dealCountQuery = dealCountQuery.in("owner_id", brokerIds);
        }
        if (typeof dealCountQuery.limit === "function") {
          dealCountQuery = dealCountQuery.limit(500);
        }
        const { data: candidateBrokerDeals } = await dealCountQuery;
        const rawBrokerDeals = (candidateBrokerDeals ?? []) as BlindDealRow[];
        const ownerByDealId = new Map<string, string>();
        for (const r of rawBrokerDeals) {
          if (r?.id && r.owner_id) {
            ownerByDealId.set(String(r.id), String(r.owner_id));
          }
        }
        const visibleBrokerDeals = await filterPublicVisibleDealRows(supabase, rawBrokerDeals);
        const brokerIdSet = new Set(brokerIds);
        for (const d of visibleBrokerDeals) {
          const ownerId = ownerByDealId.get(String(d.id));
          if (ownerId && brokerIdSet.has(ownerId)) {
            verifiedBrokerDealCounts.set(
              ownerId,
              (verifiedBrokerDealCounts.get(ownerId) ?? 0) + 1,
            );
          }
        }
      }

      // C. Sort: Verified brokers first, then verified public deal count, then alphabetical
      filtered.sort((a, b) => {
        const aBp = unwrapBp(a);
        const bBp = unwrapBp(b);

        if (aBp.is_verified && !bBp.is_verified) return -1;
        if (!aBp.is_verified && bBp.is_verified) return 1;

        const aDeals = verifiedBrokerDealCounts.get(String(a.id ?? "")) ?? 0;
        const bDeals = verifiedBrokerDealCounts.get(String(b.id ?? "")) ?? 0;
        if (aDeals !== bDeals) return bDeals - aDeals;

        return String(a.display_name ?? "").localeCompare(String(b.display_name ?? ""));
      });

      // D. Paginate
      const start = (pageNum - 1) * limit;
      const paginated = filtered.slice(start, start + limit);

      const formatted = paginated.map((p) => {
        const uid = String(p.id ?? "");
        const bp = unwrapBp(p);
        const rawSlug = typeof bp.slug === "string" ? bp.slug.trim() : "";
        return {
          id: uid,
          displayName: String(p.display_name ?? ""),
          company: p.company ? String(p.company) : null,
          photoUrl: p.photo_url ? String(p.photo_url) : null,
          tagline: p.tagline ? String(p.tagline) : null,
          slug: rawSlug || uid,
          specialtyRegions: Array.isArray(bp.specialty_regions) ? bp.specialty_regions : [],
          specialtyAssets: Array.isArray(bp.specialty_assets) ? bp.specialty_assets : [],
          bio: bp.bio ? String(bp.bio) : null,
          vibeVti: bp.vibe_vti ? String(bp.vibe_vti) : null,
          vibeTrust: typeof bp.vibe_trust === "number" ? bp.vibe_trust : null,
          vibeValence: typeof bp.vibe_valence === "number" ? bp.vibe_valence : null,
          totalDealCount: verifiedBrokerDealCounts.get(uid) ?? 0,
          isVerified: Boolean(bp.is_verified),
          seoSummary: bp.seo_summary ? String(bp.seo_summary) : null,
        };
      });

      return NextResponse.json({
        data: formatted,
        total: filtered.length,
        page: pageNum,
        limit,
      });
    }

    return NextResponse.json({ data: [], total: 0, page: pageNum, limit });
  } catch (err: unknown) {
    log.error("Search API Endpoint Error:", err);
    return NextResponse.json(
      { error: "검색 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
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

function sanitizeOrTerm(raw: string): string {
  const trimmed = String(raw || "").trim().slice(0, 80);
  if (!trimmed) return "";
  const stripped = trimmed.replace(/[,()*:;"'\\\u0000-\u001F\u007F]/g, "").trim();
  return stripped ? escapeIlike(stripped) : "";
}

function isMissingRelationOrColumn(
  err: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!err) return false;
  if (
    err.code === "42P01" ||
    err.code === "42703" ||
    err.code === "PGRST204" ||
    err.code === "PGRST205"
  ) {
    return true;
  }
  return /does not exist|schema cache/i.test(String(err.message || ""));
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

async function filterPublicExploreDealRows(
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
  const signalCardMap = new Map<
    string,
    { visibility?: string | null; status?: string | null }
  >();

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
    // Non-blocking when signal cards lookup is unavailable in lightweight test mocks
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
 * GET /api/public/explore/search
 * Hardened legacy compatibility endpoint aligned with /api/public/search.
 */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req) ?? "anonymous";
  const allowed = await checkRateLimit(ip, "public_explore_search", 60, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "요청 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type") ?? "deal";
  const region = (searchParams.get("region") ?? "").slice(0, 50);
  const q = searchParams.get("q") ?? "";

  if (!["deal", "space", "market"].includes(type)) {
    return NextResponse.json({ data: [] });
  }

  const trimmedQ = q.trim().slice(0, 80);
  const safeQ = sanitizeOrTerm(q);
  if (trimmedQ.length > 0 && !safeQ) {
    return NextResponse.json({ data: [] });
  }

  const supabase = createServiceClient();

  try {
    if (type === "deal") {
      let query = supabase
        .from("building_ssot_lite")
        .select(BLIND_DEAL_SELECT_COLUMNS)
        .eq("status", "public_signal_ready")
        .order("updated_at", { ascending: false })
        .limit(24);

      if (region && region !== "all") {
        const regionLabel = REGION_LABELS[region];
        if (regionLabel) {
          query = query.ilike("area_signal", `%${escapeIlike(regionLabel)}%`);
        }
      }
      if (safeQ) {
        query = query.or(`area_signal.ilike.%${safeQ}%,asset_type.ilike.%${safeQ}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const visibleRows = await filterPublicExploreDealRows(
        supabase,
        (data ?? []) as BlindDealRow[],
      );
      return NextResponse.json({ data: visibleRows });
    }

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
        spaceQuery = spaceQuery.limit(200);
      }

      const spaceRes = await spaceQuery;
      if (spaceRes.error) {
        if (isMissingRelationOrColumn(spaceRes.error)) {
          return NextResponse.json({ data: [] });
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
        const verifiedBlds = await filterPublicExploreDealRows(
          supabase,
          (bldRows ?? []) as BlindDealRow[],
        );
        for (const b of verifiedBlds) {
          buildingAreaMap.set(String(b.id), b.area_signal ?? null);
        }
      }

      const matched: Array<Record<string, unknown>> = [];
      for (const r of candidateSpaces) {
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

        if (region && region !== "all") {
          if (!matchesSpaceRegion(region, `${areaSignal ?? ""} ${title}`)) continue;
        }
        if (trimmedQ) {
          if (
            !matchesSpaceQuery(trimmedQ, {
              areaSignal,
              spaceType: rawSpaceType,
              spaceTypeLabel,
              floor,
              title,
            })
          ) {
            continue;
          }
        }

        matched.push({
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
        });
        if (matched.length >= 24) break;
      }

      return NextResponse.json({ data: matched });
    }

    if (type === "market") {
      let query = supabase
        .from("cre_pulses")
        .select("region, period_type, pulse_score, trend, summary_ko, period_label, seo_slug")
        .eq("status", "published")
        .eq("period_type", "weekly")
        .order("created_at", { ascending: false })
        .limit(16);

      if (region && region !== "all") {
        query = query.eq("region", region);
      }
      if (safeQ) {
        query = query.ilike("summary_ko", `%${safeQ}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ data: data ?? [] });
    }

    return NextResponse.json({ data: [] });
  } catch (err: unknown) {
    log.error("Explore Search API Error:", err);
    return NextResponse.json(
      { error: "검색 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

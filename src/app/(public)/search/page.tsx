import { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  Store,
  BarChart3,
  User,
  ArrowRight,
  Compass,
  HelpCircle,
  AlertCircle,
} from "lucide-react";
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
import { UnifiedSearchBar } from "@/components/search/UnifiedSearchBar";
import { BrokerResultCard, type BrokerCardData } from "@/components/search/BrokerResultCard";
import { serializeJsonLd, searchResultsPage, brokerItemList } from "@/lib/schema-org";
import { sqmToPyeong } from "@/lib/utils/area-conversion";

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    type?: string;
    region?: string;
    page?: string;
  }>;
}

const BLIND_DEAL_SELECT_COLUMNS =
  "id, area_signal, asset_type, price_band, size_signal, status, updated_at, owner_id";

const LEASE_SPACE_SELECT_COLUMNS =
  "id, building_id, floor, area_sqm, space_type, deposit, monthly_rent, status, is_marketplace_listed";

const DEAL_CANDIDATE_WINDOW = 200;

const REGION_QUERY_LABELS: Record<string, string> = {
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

const REGIONS = [
  { slug: "all", label: "전체", emoji: "🌐" },
  { slug: "gbd", label: "GBD (강남)", emoji: "🏙️" },
  { slug: "ybd", label: "YBD (여의도)", emoji: "🌊" },
  { slug: "cbd", label: "CBD (도심)", emoji: "🏛️" },
  { slug: "seongsu", label: "성수", emoji: "🎨" },
  { slug: "pangyo", label: "판교", emoji: "💻" },
] as const;

const TABS = [
  {
    id: "deal",
    label: "매매",
    icon: Building2,
    desc: "블라인드 딜카드",
    activeColor: "border-blue-600 bg-blue-50 text-blue-800",
    iconColor: "text-blue-700",
  },
  {
    id: "space",
    label: "임대",
    icon: Store,
    desc: "임대 공간",
    activeColor: "border-emerald-600 bg-emerald-50 text-emerald-800",
    iconColor: "text-emerald-700",
  },
  {
    id: "market",
    label: "시세",
    icon: BarChart3,
    desc: "AI 시세 리포트",
    activeColor: "border-purple-600 bg-purple-50 text-purple-800",
    iconColor: "text-purple-700",
  },
  {
    id: "broker",
    label: "중개인",
    icon: User,
    desc: "전문 중개인",
    activeColor: "border-amber-600 bg-amber-50 text-amber-900",
    iconColor: "text-amber-700",
  },
];

function sanitizePostgrestSearchTerm(raw: string): string {
  const trimmed = String(raw || "").trim().slice(0, 80);
  if (!trimmed) return "";
  const stripped = trimmed.replace(/[,()*:;"'\\\u0000-\u001F\u007F]/g, "").trim();
  return stripped ? escapeIlike(stripped) : "";
}

function extractSpaceRegionSlug(row: SpaceSearchRow, fallbackRegion: string): string {
  const haystack = `${row.area_signal ?? ""} ${row.title ?? ""}`.toLowerCase();
  if (/gbd|강남|서초|역삼|삼성|선릉|논현|청담/.test(haystack)) return "gbd";
  if (/ybd|여의도|영등포/.test(haystack)) return "ybd";
  if (/cbd|종로|을지로|광화문|중구/.test(haystack)) return "cbd";
  if (/seongsu|성수|뚝섬|성동/.test(haystack)) return "seongsu";
  if (/pangyo|판교|분당/.test(haystack)) return "pangyo";
  if (/hongdae|홍대|연남|합정|동교/.test(haystack)) return "hongdae";
  if (/mapo|마포|공덕|상암/.test(haystack)) return "mapo";
  return fallbackRegion;
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
  const kor = REGION_QUERY_LABELS[reg]?.toLowerCase() ?? "";
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

interface BlindDealSearchRow {
  id: string;
  area_signal?: string | null;
  asset_type?: string | null;
  price_band?: string | null;
  size_signal?: string | null;
  status?: string | null;
  updated_at?: string | null;
  owner_id?: string | null;
}

interface SpaceSearchRow {
  id: string;
  building_id?: string | null;
  floor?: string | null;
  area_sqm?: number | null;
  space_type?: string | null;
  deposit?: number | null;
  monthly_rent?: number | null;
  area_signal?: string | null;
  title?: string | null;
  status?: string | null;
  is_marketplace_listed?: boolean | null;
}

interface MarketPulseSearchRow {
  region: string;
  period_type?: string | null;
  pulse_score?: number | null;
  trend?: string | null;
  summary_ko?: string | null;
  period_label: string;
  seo_slug?: string | null;
}

async function filterPublicVisibleDealRows(
  supabase: ReturnType<typeof createServiceClient>,
  rows: BlindDealSearchRow[],
): Promise<BlindDealSearchRow[]> {
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
      return vis.isPublic ? row : null;
    }),
  );

  return verified.filter((item): item is BlindDealSearchRow => item !== null);
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const { q = "", type = "deal" } = await searchParams;
  const trimmedQ = q.trim().slice(0, 80);
  const typeLabel =
    {
      deal: "매매 딜카드",
      space: "임대 공간",
      market: "시장 시세",
      broker: "전문 중개인",
    }[type] ?? "검색";

  const title = trimmedQ
    ? `"${trimmedQ}"에 대한 ${typeLabel} 검색 결과 | DealCard`
    : `상업용 부동산 통합 검색 | DealCard`;

  const description = trimmedQ
    ? `DealCard에서 "${trimmedQ}" 키워드에 상응하는 최적의 상업용 부동산 ${typeLabel} 검색 결과입니다. 빌딩 매매, 임대 오피스, 시세 정보 및 검증된 중개인 프로필을 확인해 보세요.`
    : `GBD, YBD, CBD 등 서울 주요 권역의 상업용 부동산 매매 딜카드, 임대 공간, 시장 시세 및 전문 공인중개사 프로필을 통합 검색하세요.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "ko_KR",
    },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = "", type = "deal", region = "all", page = "1" } = await searchParams;
  const parsedPage = page.trim() !== "" ? Number(page) : 1;
  const pageNum = Math.max(
    1,
    Math.min(100, Number.isFinite(parsedPage) ? Math.floor(parsedPage) : 1),
  );
  const limit = 12;

  const trimmedQ = q.trim().slice(0, 80);
  const safeQ = sanitizePostgrestSearchTerm(q);
  const skipUnsafeOnlyQuery = trimmedQ.length > 0 && !safeQ;

  const supabase = createServiceClient();
  let dealResults: BlindDealSearchRow[] = [];
  let spaceResults: SpaceSearchRow[] = [];
  let marketResults: MarketPulseSearchRow[] = [];
  let brokerResults: BrokerCardData[] = [];
  let totalCount = 0;

  const from = (pageNum - 1) * limit;
  const to = from + limit - 1;

  if (!skipUnsafeOnlyQuery) {
    try {
      if (type === "deal") {
        let query = supabase
          .from("building_ssot_lite")
          .select(BLIND_DEAL_SELECT_COLUMNS)
          .eq("status", "public_signal_ready")
          .order("updated_at", { ascending: false });

        if (region && region !== "all") {
          const regionLabel = REGION_QUERY_LABELS[region];
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
        if (!error && data) {
          const rawRows = data as BlindDealSearchRow[];
          const visibleRows = await filterPublicVisibleDealRows(supabase, rawRows);
          totalCount = visibleRows.length;
          dealResults = visibleRows.slice(from, from + limit);
        }
      } else if (type === "space") {
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
        if (!spaceRes.error && spaceRes.data) {
          const candidateSpaces = (spaceRes.data as unknown as SpaceSearchRow[]).filter(
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
              (bldRows ?? []) as BlindDealSearchRow[],
            );
            for (const b of verifiedBlds) {
              buildingAreaMap.set(String(b.id), b.area_signal ?? null);
            }
          }

          const matchedSpaces: SpaceSearchRow[] = [];
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
              const hay = `${areaSignal ?? ""} ${title}`;
              if (!matchesSpaceRegion(region, hay)) continue;
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

            matchedSpaces.push({
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
          }

          totalCount = matchedSpaces.length;
          spaceResults = matchedSpaces.slice(from, from + limit);
        }
      } else if (type === "market") {
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
        if (!error && data) {
          marketResults = data as MarketPulseSearchRow[];
          totalCount = count ?? marketResults.length;
        }
      } else if (type === "broker") {
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

        if (!brokerRes.error && brokerRes.data) {
          type BrokerQueryRow = Record<string, unknown> & {
            broker_profiles?: Record<string, unknown> | Array<Record<string, unknown>> | null;
          };

          const unwrapBp = (row: BrokerQueryRow): Record<string, unknown> => {
            const raw = row.broker_profiles;
            if (Array.isArray(raw)) return (raw[0] ?? {}) as Record<string, unknown>;
            return (raw ?? {}) as Record<string, unknown>;
          };

          let filtered = (brokerRes.data as unknown as BrokerQueryRow[]).filter((p) => {
            const bp = unwrapBp(p);
            if (bp.is_public === false) return false;
            const r = typeof p.role === "string" ? p.role : "broker";
            return r === "broker" || r === "admin";
          });

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
            const visibleBrokerDeals = await filterPublicVisibleDealRows(
              supabase,
              (candidateBrokerDeals ?? []) as BlindDealSearchRow[],
            );
            const brokerIdSet = new Set(brokerIds);
            for (const d of visibleBrokerDeals) {
              const ownerKey = d.owner_id ? String(d.owner_id) : "";
              if (ownerKey && brokerIdSet.has(ownerKey)) {
                verifiedBrokerDealCounts.set(
                  ownerKey,
                  (verifiedBrokerDealCounts.get(ownerKey) ?? 0) + 1,
                );
              }
            }
          }

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

          totalCount = filtered.length;
          const paginated = filtered.slice(from, from + limit);

          brokerResults = paginated.map((p) => {
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
              specialtyRegions: Array.isArray(bp.specialty_regions)
                ? (bp.specialty_regions as string[])
                : [],
              specialtyAssets: Array.isArray(bp.specialty_assets)
                ? (bp.specialty_assets as string[])
                : [],
              bio: bp.bio ? String(bp.bio) : null,
              vibeVti: bp.vibe_vti ? String(bp.vibe_vti) : null,
              vibeTrust: typeof bp.vibe_trust === "number" ? bp.vibe_trust : null,
              vibeValence: typeof bp.vibe_valence === "number" ? bp.vibe_valence : null,
              totalDealCount: verifiedBrokerDealCounts.get(uid) ?? 0,
              isVerified: Boolean(bp.is_verified),
              seoSummary: bp.seo_summary ? String(bp.seo_summary) : null,
            };
          });
        }
      }
    } catch (err) {
      console.error("Search Page DB Fetch Error:", err);
    }
  }

  const faqItems = [
    {
      question: `${trimmedQ ? `"${trimmedQ}" 관련 ` : ""}상업용 부동산 검색 필터는 어떻게 작동하나요?`,
      answer:
        "상단 탭을 통해 매매(블라인드 딜카드), 임대(임대 공간), 시세(권역별 요약), 중개인(전문 공인중개사 프로필)의 4개 카테고리를 이동할 수 있으며, 하단의 GBD, YBD, CBD 권역 필터를 클릭해 즉시 타겟 권역을 좁힐 수 있습니다.",
    },
    {
      question: "전문 공인중개사 검색에서는 어떤 정보를 확인할 수 있나요?",
      answer:
        "공개 프로필을 활성화한 공인중개사의 전문 권역, 주력 자산 유형, 중개 경력 및 공개 블라인드 딜카드 실적을 한눈에 확인하고 상담을 요청할 수 있습니다.",
    },
    {
      question: "블라인드 딜카드란 무엇이며 어떻게 참여하나요?",
      answer:
        "매물의 직접적인 상세 주소나 소유주 정보를 보호하면서, 빌딩의 핵심 스펙과 자산가치 신호만을 기반으로 최적의 매수 희망자들의 오퍼를 유도하는 보안 특화 딜메이킹 카드입니다. 상단 검색을 통해 원하는 매매 카드를 찾은 후 중개인 프로필을 통해 바로 상담 신청할 수 있습니다.",
    },
  ];

  const searchLd = searchResultsPage(trimmedQ || "상업용 부동산", totalCount);
  const brokerLd =
    type === "broker" && brokerResults.length > 0
      ? brokerItemList(
          brokerResults.map((r) => ({
            id: r.slug,
            display_name: r.displayName,
            company: r.company,
            specialty_regions: r.specialtyRegions,
            bio: r.seoSummary || r.bio,
          })),
        )
      : null;

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  const getSearchUrl = (newParams: {
    q?: string;
    type?: string;
    region?: string;
    page?: number;
  }) => {
    const params = new URLSearchParams();
    const nextQ = newParams.q !== undefined ? newParams.q : trimmedQ;
    if (nextQ) {
      params.set("q", nextQ);
    }
    const targetType = newParams.type !== undefined ? newParams.type : type;
    params.set("type", targetType);

    const targetRegion = newParams.region !== undefined ? newParams.region : region;
    if (targetRegion && targetRegion !== "all") {
      params.set("region", targetRegion);
    }

    const targetPage = newParams.page !== undefined ? newParams.page : 1;
    if (targetPage > 1) {
      params.set("page", targetPage.toString());
    }
    return `/search?${params.toString()}`;
  };

  const totalPages = Math.ceil(totalCount / limit);
  const hasResults =
    (type === "deal" && dealResults.length > 0) ||
    (type === "space" && spaceResults.length > 0) ||
    (type === "market" && marketResults.length > 0) ||
    (type === "broker" && brokerResults.length > 0);

  const fallbackSpaceRegion = region && region !== "all" ? region : "gbd";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Schema.org Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(searchLd) }}
      />
      {brokerLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(brokerLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqLd) }}
      />

      {/* Hero & Search Header */}
      <div className="relative border-b border-slate-200 bg-white pt-8 pb-4 shadow-xs">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center gap-2 mb-4">
            <Compass className="w-5 h-5 text-blue-700" />
            <h1 className="text-base font-bold text-slate-900">통합 시맨틱 검색</h1>
            <span className="text-sm text-slate-600 ml-auto">AEO/GEO 최적화 엔진</span>
          </div>

          <div className="w-full max-w-2xl mb-5">
            <UnifiedSearchBar initialValue={trimmedQ} type={type} />
          </div>

          {/* Tab Menu */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {TABS.map((t) => {
              const TabIcon = t.icon;
              const isActive = type === t.id;
              return (
                <Link
                  key={t.id}
                  href={getSearchUrl({ type: t.id, page: 1 })}
                  className={`flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border transition-all shrink-0 ${
                    isActive
                      ? t.activeColor
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <TabIcon className={`w-4 h-4 ${isActive ? t.iconColor : "text-slate-600"}`} />
                  <span>{t.label}</span>
                  {isActive && (
                    <span className="text-sm font-medium px-2 py-0.5 rounded-md bg-white/80 border border-slate-200 text-slate-700 ml-0.5">
                      {t.desc}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filters & Results Area */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Region Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-none mb-6 border-b border-slate-200">
          <span className="text-sm text-slate-700 font-semibold shrink-0">권역 필터:</span>
          {REGIONS.map((r) => {
            const isSelected = region === r.slug;
            return (
              <Link
                key={r.slug}
                href={getSearchUrl({ region: r.slug, page: 1 })}
                className={`shrink-0 flex min-h-[44px] items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold border transition-all ${
                  isSelected
                    ? "bg-blue-700 border-blue-700 text-white shadow-xs"
                    : "bg-white border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <span>{r.emoji}</span>
                <span>{r.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Results Heading */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-slate-700 font-bold tracking-wide">
            {trimmedQ ? `"${trimmedQ}" 검색 결과` : "전체 탐색"} ({totalCount}건)
          </p>
        </div>

        {/* Results Listing */}
        {hasResults ? (
          <>
            {type === "broker" && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {brokerResults.map((r) => (
                  <BrokerResultCard key={r.id} broker={r} />
                ))}
              </div>
            )}

            {type === "deal" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {dealResults.map((r) => (
                  <Link
                    key={r.id}
                    href={`/dc/${encodeURIComponent(r.id)}`}
                    className="flex min-h-[44px] items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-4 hover:border-blue-500 hover:shadow-md transition-all shadow-xs group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 group-hover:scale-105 transition-transform shrink-0">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-base font-bold text-slate-900 truncate group-hover:text-blue-700 transition-colors">
                          {r.area_signal || "권역 신호"} {r.asset_type || "상업 자산"}
                        </h4>
                        <p className="text-sm text-slate-600 mt-0.5">
                          {r.price_band || "가격 협의"}
                          {r.size_signal ? ` · ${r.size_signal}` : ""}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-blue-700 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </Link>
                ))}
              </div>
            )}

            {type === "space" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {spaceResults.map((r) => {
                  const targetRegionSlug = extractSpaceRegionSlug(r, fallbackSpaceRegion);
                  const spaceHref = `/space/${encodeURIComponent(targetRegionSlug)}`;
                  return (
                    <Link
                      key={r.id}
                      href={spaceHref}
                      className="flex min-h-[48px] items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-4 hover:border-emerald-500 hover:shadow-md transition-all shadow-xs group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 group-hover:scale-105 transition-transform shrink-0">
                          <Store className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-base font-bold text-slate-900 truncate group-hover:text-emerald-700 transition-colors">
                            {r.title || `${r.area_signal || "권역"} 임대 공간`}
                          </h4>
                          <p className="text-sm text-slate-600 mt-0.5">
                            {r.area_sqm ? `${Math.round(sqmToPyeong(r.area_sqm))}평 · ` : ""}
                            보증금 {r.deposit || 0}만 / 월 {r.monthly_rent || 0}만
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </Link>
                  );
                })}
              </div>
            )}

            {type === "market" && (
              <div className="space-y-3">
                {marketResults.map((r) => (
                  <Link
                    key={`${r.region}-${r.period_label}`}
                    href={`/deal/${encodeURIComponent(r.region)}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-h-[48px] bg-white border border-slate-200 rounded-2xl p-4 hover:border-purple-500 hover:shadow-md transition-all shadow-xs group"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                        <BarChart3 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-base font-bold text-slate-900 truncate group-hover:text-purple-700 transition-colors">
                          {r.region.toUpperCase()} 주간 시세 요약 ({r.period_label})
                        </h4>
                        <p className="text-sm text-slate-700 mt-0.5 leading-relaxed">
                          {r.summary_ko || "권역 시장 동향 요약"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      {r.pulse_score !== null && r.pulse_score !== undefined && (
                        <div className="text-left sm:text-right">
                          <span className="text-sm text-slate-600 block">시장 지수</span>
                          <span className="text-sm font-bold text-purple-700">
                            {r.pulse_score}점
                          </span>
                        </div>
                      )}
                      <span className="inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-purple-50 border border-purple-200 px-3 py-2 text-sm font-bold text-purple-800 group-hover:bg-purple-100 transition-colors">
                        해당 권역 매물 보기
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-10">
                {pageNum > 1 && (
                  <Link
                    href={getSearchUrl({ page: pageNum - 1 })}
                    className="flex min-h-[44px] items-center justify-center text-sm font-semibold bg-white border border-slate-200 text-slate-700 px-4 rounded-xl hover:bg-slate-100 hover:text-slate-900 transition-all"
                  >
                    이전
                  </Link>
                )}
                <span className="text-sm text-slate-700 font-medium px-3">
                  {pageNum} / {totalPages} 페이지
                </span>
                {pageNum < totalPages && (
                  <Link
                    href={getSearchUrl({ page: pageNum + 1 })}
                    className="flex min-h-[44px] items-center justify-center text-sm font-semibold bg-white border border-slate-200 text-slate-700 px-4 rounded-xl hover:bg-slate-100 hover:text-slate-900 transition-all"
                  >
                    다음
                  </Link>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <AlertCircle className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-base font-bold text-slate-900 mb-1">
              검색 결과가 존재하지 않습니다.
            </p>
            <p className="text-sm text-slate-600 max-w-sm mx-auto">
              입력하신 검색어를 확인해 보시거나, 권역 필터를 사용하거나 다른 카테고리 탭을 선택해 보세요.
            </p>
          </div>
        )}

        {/* Dynamic FAQ Section for SEO/AEO/GEO */}
        <div className="mt-14 pt-8 border-t border-slate-200">
          <div className="flex items-center gap-2 mb-6">
            <HelpCircle className="w-5 h-5 text-blue-700" />
            <h2 className="text-lg font-bold text-slate-900">자주 묻는 질문 (FAQ)</h2>
          </div>
          <div className="space-y-4">
            {faqItems.map((item, index) => (
              <div
                key={index}
                className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-slate-300 transition-all shadow-xs"
              >
                <h3 className="text-base font-bold text-slate-900 mb-2 flex items-start gap-2">
                  <span className="text-blue-700 font-extrabold shrink-0">Q.</span>
                  <span>{item.question}</span>
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed pl-6">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

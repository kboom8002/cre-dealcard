import type { Metadata } from "next";
import Link from "next/link";
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
import { sqmToPyeong } from "@/lib/utils/area-conversion";
import { getCanonicalSiteUrl } from "@/lib/site-url";

const REGION_MAP: Record<string, string> = {
  gbd: "GBD (강남권역)",
  ybd: "YBD (여의도권역)",
  cbd: "CBD (종로/을지로)",
  seongsu: "성수",
  pangyo: "판교",
  mapo: "마포/홍대",
  jongno: "종로",
  hongdae: "홍대",
  all: "전체 지역",
};

const REGION_QUERY_KEYWORDS: Record<string, string> = {
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

function normalizeSpaceCategoryKey(raw: string | null | undefined): string {
  const cleaned = String(raw ?? "").trim().toLowerCase();
  if (!cleaned || cleaned === "all" || cleaned === "전체") return "";
  for (const [key, aliases] of Object.entries(SPACE_TYPE_ALIASES)) {
    if (key === cleaned || aliases.some((a) => a.toLowerCase() === cleaned)) {
      return key;
    }
  }
  for (const [key, aliases] of Object.entries(SPACE_TYPE_ALIASES)) {
    if (aliases.some((a) => a.toLowerCase().includes(cleaned) || cleaned.includes(a.toLowerCase()))) {
      return key;
    }
  }
  return cleaned;
}

function matchesSpaceTypeFilter(
  rowSpaceType: string | null | undefined,
  filterValue: string,
): boolean {
  const targetKey = normalizeSpaceCategoryKey(filterValue);
  if (!targetKey) return true;
  const rowKey = normalizeSpaceCategoryKey(rowSpaceType);
  if (rowKey && rowKey === targetKey) return true;
  const rawLower = String(rowSpaceType ?? "").trim().toLowerCase();
  return Boolean(rawLower && rawLower.includes(targetKey));
}

const BLIND_DEAL_SELECT_COLUMNS =
  "id, area_signal, asset_type, price_band, size_signal, status, updated_at, owner_id";

interface PageProps {
  params: Promise<{ region: string }>;
  searchParams?: Promise<{
    category?: string;
    type?: string;
    q?: string;
  }>;
}

interface PublicLeaseSpaceRow {
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

interface BlindDealRegionRow {
  id: string;
  area_signal?: string | null;
  asset_type?: string | null;
  price_band?: string | null;
  size_signal?: string | null;
  status?: string | null;
  updated_at?: string | null;
  owner_id?: string | null;
}

function sanitizeRegionTerm(raw: string): string {
  const trimmed = String(raw || "").trim().slice(0, 50);
  if (!trimmed) return "";
  const stripped = trimmed.replace(/[,()*:;"'\\\u0000-\u001F\u007F]/g, "").trim();
  return stripped ? escapeIlike(stripped) : "";
}

function isMissingRelationOrColumnError(
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

async function fetchPublicLeaseSpacesForRegion(
  supabase: ReturnType<typeof createServiceClient>,
  region: string,
  regionalBuildings: BlindDealRegionRow[],
): Promise<PublicLeaseSpaceRow[]> {
  try {
    // 00021_lease_spaces schema: id, building_id, floor, area_sqm, space_type, deposit, monthly_rent, status, is_marketplace_listed
    let leaseQuery = supabase
      .from("lease_spaces")
      .select(
        "id, building_id, floor, area_sqm, space_type, deposit, monthly_rent, status, is_marketplace_listed",
      );
    if (typeof leaseQuery.in === "function") {
      leaseQuery = leaseQuery.in("status", ["active", "published"]);
    } else if (typeof leaseQuery.eq === "function") {
      leaseQuery = leaseQuery.eq("status", "active");
    }
    const fallbackRes = await leaseQuery
      .eq("is_marketplace_listed", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (fallbackRes.error) {
      if (!isMissingRelationOrColumnError(fallbackRes.error)) {
        return [];
      }
      return [];
    }

    const verifiedBuildingIds = new Set<string>();
    const buildingAreaMap = new Map<string, string>();
    for (const b of regionalBuildings) {
      if (b.id) {
        verifiedBuildingIds.add(String(b.id));
        if (b.area_signal) {
          buildingAreaMap.set(String(b.id), b.area_signal);
        }
      }
    }

    return ((fallbackRes.data ?? []) as PublicLeaseSpaceRow[])
      .filter((r) => {
        if (!r?.id || isDemoSeedDisabledForProd(String(r.id))) return false;
        if (r.building_id && isDemoSeedDisabledForProd(String(r.building_id))) return false;
        if (r.status !== "active" && r.status !== "published") return false;
        if (r.is_marketplace_listed !== true) return false;
        if (region === "all") return true;
        if (r.area_signal) {
          const kor = REGION_QUERY_KEYWORDS[region] || region;
          return (
            r.area_signal.toLowerCase().includes(region.toLowerCase()) ||
            r.area_signal.includes(kor)
          );
        }
        return Boolean(r.building_id && verifiedBuildingIds.has(String(r.building_id)));
      })
      .map((r) => ({
        ...r,
        area_signal:
          r.area_signal ??
          (r.building_id ? buildingAreaMap.get(String(r.building_id)) ?? null : null),
      }));
  } catch {
    return [];
  }
}

async function filterPublicRegionDeals(
  supabase: ReturnType<typeof createServiceClient>,
  rows: BlindDealRegionRow[],
): Promise<BlindDealRegionRow[]> {
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
    // Non-blocking fallback when signal card lookup is unavailable in unit test mocks
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

  return verified.filter((item): item is BlindDealRegionRow => item !== null);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { region } = await params;
  const label = REGION_MAP[region] || region;
  const siteUrl = getCanonicalSiteUrl();
  const title = `${label} 상업용 임대 공간`;
  const description = `${label} 권역의 오피스·리테일·F&B 임대 공간을 블라인드로 탐색하세요.`;
  const ogImageUrl = `${siteUrl}/og-default.png?v=2`;
  return {
    title,
    description,
    openGraph: {
      title: `${title} — 크리딜 허브`,
      description,
      siteName: "크리딜 (CREDEAL)",
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — 크리딜 허브`,
      description,
      images: [ogImageUrl],
    },
  };
}

export const revalidate = 3600;

export default async function SpaceRegionPage({ params, searchParams }: PageProps) {
  const { region } = await params;
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const rawCategoryFilter =
    resolvedSearch?.category ?? resolvedSearch?.type ?? resolvedSearch?.q ?? "";
  const activeCategoryKey = normalizeSpaceCategoryKey(rawCategoryFilter);
  const label = REGION_MAP[region] || region;
  const supabase = createServiceClient();

  let dealQuery = supabase
    .from("building_ssot_lite")
    .select(BLIND_DEAL_SELECT_COLUMNS)
    .eq("status", "public_signal_ready")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (region !== "all") {
    const safeRegion = sanitizeRegionTerm(region);
    const korKeyword = REGION_QUERY_KEYWORDS[region];
    if (
      safeRegion &&
      korKeyword &&
      korKeyword !== safeRegion &&
      typeof dealQuery.or === "function"
    ) {
      dealQuery = dealQuery.or(
        `area_signal.ilike.%${safeRegion}%,area_signal.ilike.%${escapeIlike(korKeyword)}%`,
      );
    } else if (safeRegion) {
      dealQuery = dealQuery.ilike("area_signal", `%${safeRegion}%`);
    }
  }

  const { data: rawDeals } = await dealQuery;
  const regionalDeals = await filterPublicRegionDeals(
    supabase,
    (rawDeals ?? []) as BlindDealRegionRow[],
  );
  const verifiedBuildingIds = new Set(regionalDeals.map((d) => String(d.id)));

  const allRegionalSpaces = await fetchPublicLeaseSpacesForRegion(
    supabase,
    region,
    regionalDeals,
  );
  const leaseSpaces = activeCategoryKey
    ? allRegionalSpaces.filter((s) => matchesSpaceTypeFilter(s.space_type, activeCategoryKey))
    : allRegionalSpaces;

  const SPACE_TYPES = [
    { icon: "🌐", label: "전체", code: "" },
    { icon: "📁", label: "오피스", code: "office" },
    { icon: "🛍️", label: "리테일", code: "retail" },
    { icon: "☕", label: "F&B", code: "f_and_b" },
    { icon: "📦", label: "물류/창고", code: "warehouse" },
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-4 shadow-xs">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-extrabold text-slate-900 flex items-center gap-1.5">
              🏪 {label} 임대 공간
            </h1>
            <p className="text-sm text-slate-600">
              {leaseSpaces.length}건의 공개 임대 공간
            </p>
          </div>
          <Link
            href="/hub"
            className="inline-flex min-h-[48px] items-center px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            ← 허브로
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Space Type Filter Links */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {SPACE_TYPES.map((st) => {
            const isSelected = activeCategoryKey === st.code;
            const chipHref = st.code
              ? `/space/${encodeURIComponent(region)}?category=${encodeURIComponent(st.code)}`
              : `/space/${encodeURIComponent(region)}`;
            return (
              <Link
                key={st.label}
                href={chipHref}
                className={`shrink-0 inline-flex min-h-[48px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold border transition-colors ${
                  isSelected
                    ? "bg-emerald-700 border-emerald-700 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span>{st.icon}</span>
                <span>{st.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Genuine Lease Space Cards */}
        {leaseSpaces.length > 0 ? (
          <section className="space-y-4">
            {leaseSpaces.map((s) => {
              const typeLabel =
                (s.space_type && SPACE_TYPE_LABELS[s.space_type.toLowerCase()]) ||
                s.space_type ||
                "임대 공간";
              const pyeong =
                typeof s.area_sqm === "number" && s.area_sqm > 0
                  ? Math.round(sqmToPyeong(s.area_sqm))
                  : null;
              const canLinkBuilding =
                Boolean(s.building_id) && verifiedBuildingIds.has(String(s.building_id));
              return (
                <div
                  key={s.id}
                  className="bg-white border border-slate-200 hover:border-emerald-500 hover:shadow-md rounded-2xl p-5 transition-all shadow-xs"
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-sm bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold">
                      {typeLabel}
                    </span>
                    <span className="text-sm text-slate-600 font-medium">
                      🟢 임대 상담 가능
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900 mt-2.5">
                    {s.title || `${s.area_signal || "상업용"} ${typeLabel}`}
                  </h2>
                  <p className="text-sm text-slate-700 mt-1">
                    📍 {s.area_signal || label}
                    {s.floor ? ` · ${s.floor}` : ""}
                    {pyeong ? ` · 전용 ${pyeong}평` : ""}
                    {` · 보증금 ${s.deposit ?? 0}만 / 월 ${s.monthly_rent ?? 0}만`}
                  </p>
                  {canLinkBuilding && s.building_id ? (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <Link
                        href={`/dc/${encodeURIComponent(s.building_id)}`}
                        className="inline-flex min-h-[48px] items-center text-sm text-emerald-700 hover:text-emerald-800 font-bold hover:underline"
                      >
                        건물 블라인드 정보 보기 →
                      </Link>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2 shadow-xs">
            <p className="text-base font-bold text-slate-900">
              현재 등록된 공개 임대 공간이 없습니다
            </p>
            <p className="text-sm text-slate-600">
              다른 권역을 선택하거나 통합 검색에서 임대 공간을 찾아보세요.
            </p>
            <Link
              href="/search?type=space"
              className="inline-flex min-h-[48px] items-center justify-center mt-3 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-sm font-semibold text-white transition-colors"
            >
              임대 공간 검색하기 →
            </Link>
          </div>
        )}

        {/* Clearly separated Regional Sale DealCards section (never mislabeled as 임대 공간) */}
        {leaseSpaces.length === 0 && regionalDeals.length > 0 && (
          <section className="space-y-3.5 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-extrabold text-slate-900">
                함께 볼 만한 권역 매각 딜카드
              </h2>
              <Link
                href={`/deal/${encodeURIComponent(region)}`}
                className="inline-flex min-h-[48px] items-center text-sm font-semibold text-blue-700 hover:text-blue-800"
              >
                매각 매물 전체 보기 →
              </Link>
            </div>
            {regionalDeals.slice(0, 6).map((d) => (
              <Link
                key={d.id}
                href={`/dc/${encodeURIComponent(d.id)}`}
                className="block min-h-[48px] bg-white border border-slate-200 hover:border-blue-500 hover:shadow-md rounded-2xl p-5 transition-all shadow-xs"
              >
                <div className="flex justify-between items-start gap-2">
                  <span className="text-sm bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-0.5 rounded-full font-semibold">
                    매각 딜카드 · {d.asset_type || "상업용 빌딩"}
                  </span>
                  <span className="text-sm text-slate-600 font-medium">
                    공개 매각 매물
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-2.5">
                  {d.area_signal || label} {d.asset_type || "상업용"} 매각
                </h3>
                <p className="text-sm text-slate-700 mt-1">
                  📍 {d.area_signal || "권역 블라인드"} · 💰 {d.price_band || "가격 협의"}
                  {d.size_signal ? ` · 📐 ${d.size_signal}` : ""}
                </p>
              </Link>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

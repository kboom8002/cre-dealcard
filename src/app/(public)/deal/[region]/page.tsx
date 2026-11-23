import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { escapeIlike } from "@/lib/utils/postgrest-escape";
import { resolvePublicDealWorkspaceGuard } from "@/lib/og/deal-public-guard";
import { evaluateDealCardPublicVisibility } from "@/domain/public-projection/visibility";
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

const BLIND_DEAL_SELECT_COLUMNS =
  "id, area_signal, asset_type, price_band, size_signal, status, updated_at, owner_id";

interface PageProps {
  params: Promise<{ region: string }>;
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
  const stripped = trimmed.replace(/[,()*:;"'\u0000-\u001F\u007F]/g, "").trim();
  return stripped ? escapeIlike(stripped) : "";
}

async function filterPublicRegionDeals(
  supabase: ReturnType<typeof createServiceClient>,
  rows: BlindDealRegionRow[],
): Promise<BlindDealRegionRow[]> {
  const readyRows = rows.filter(
    (row) => Boolean(row?.id) && row.status === "public_signal_ready",
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
    // Non-blocking fallback when signal card lookup is unavailable in unit test mocks
  }

  const verified = await Promise.all(
    readyRows.map(async (row) => {
      const id = String(row.id);
      const guard = await resolvePublicDealWorkspaceGuard({ id, supabase });
      if (guard.blocked) return null;

      const sig = signalCardMap.get(id);
      const vis = evaluateDealCardPublicVisibility({
        buildingStatus: row.status ?? "public_signal_ready",
        signalCardVisibility: sig?.visibility ?? null,
        signalCardStatus: sig?.status ?? null,
        workspaceItemStatus: guard.workspaceItemStatus,
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
  const title = `${label} 상업용 부동산 매각 매물`;
  const description = `${label} 권역의 블라인드 상업용 부동산 매각 매물을 안전하게 검토하세요. AI 딜카드 기반 매물 정보 보호.`;
  const ogImageUrl = `${siteUrl}/og-default.png?v=2`;
  return {
    title,
    description,
    openGraph: {
      title: `${label} 매각 매물 — 크리딜 허브`,
      description,
      siteName: "크리딜 (CREDEAL)",
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${label} 매각 매물 — 크리딜 허브`,
      description,
      images: [ogImageUrl],
    },
  };
}

export const revalidate = 3600;

export default async function DealRegionPage({ params }: PageProps) {
  const { region } = await params;
  const label = REGION_MAP[region] || region;
  const supabase = createServiceClient();

  let query = supabase
    .from("building_ssot_lite")
    .select(BLIND_DEAL_SELECT_COLUMNS)
    .eq("status", "public_signal_ready")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (region !== "all") {
    const safeRegion = sanitizeRegionTerm(region);
    const korKeyword = REGION_QUERY_KEYWORDS[region];
    if (safeRegion && korKeyword && korKeyword !== safeRegion && typeof query.or === "function") {
      query = query.or(
        `area_signal.ilike.%${safeRegion}%,area_signal.ilike.%${escapeIlike(korKeyword)}%`,
      );
    } else if (safeRegion) {
      query = query.ilike("area_signal", `%${safeRegion}%`);
    }
  }

  const { data: buildings } = await query;
  const items = await filterPublicRegionDeals(
    supabase,
    (buildings ?? []) as BlindDealRegionRow[],
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-4 shadow-xs">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-extrabold text-slate-900 flex items-center gap-1.5">
              🏢 {label} 매각 매물
            </h1>
            <p className="text-sm text-slate-600">{items.length}건의 블라인드 딜카드</p>
          </div>
          <Link
            href="/hub"
            className="inline-flex min-h-[44px] items-center px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            ← 허브로
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-3.5">
        {items.length > 0 ? (
          items.map((d) => (
            <Link
              key={d.id}
              href={`/dc/${encodeURIComponent(d.id)}`}
              className="block min-h-[44px] bg-white border border-slate-200 hover:border-blue-500 hover:shadow-md rounded-2xl p-5 transition-all active:scale-[0.99] shadow-xs"
            >
              <div className="flex justify-between items-start gap-2">
                <span className="text-sm bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-0.5 rounded-full font-semibold">
                  {d.asset_type || "빌딩"}
                </span>
                <span className="text-sm bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold">
                  공개 매물
                </span>
              </div>
              <h2 className="text-base font-bold text-slate-900 mt-2.5">
                {d.area_signal || label} {d.asset_type || "상업용"} 매각
              </h2>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-700">
                <span>📍 {d.area_signal || "권역 블라인드"}</span>
                <span>💰 {d.price_band || "가격대 협의"}</span>
                {d.size_signal ? <span>📐 {d.size_signal}</span> : null}
              </div>
            </Link>
          ))
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2 shadow-xs">
            <p className="text-base font-bold text-slate-900">
              이 권역에 공개된 매물이 없습니다.
            </p>
            <p className="text-sm text-slate-600">다른 권역을 탐색해 보세요.</p>
            <Link
              href="/search?type=deal"
              className="inline-flex min-h-[44px] items-center justify-center mt-3 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-sm font-semibold text-white transition-colors"
            >
              전체 권역 탐색하기 →
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

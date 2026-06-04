"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import { Search, Building2, Store, BarChart3, MapPin, ArrowRight, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "deal" | "space" | "market";
type Region = string;

const REGIONS = [
  { slug: "all", label: "전체", emoji: "🌐" },
  { slug: "gbd", label: "GBD", emoji: "🏙️" },
  { slug: "ybd", label: "YBD", emoji: "🌊" },
  { slug: "cbd", label: "CBD", emoji: "🏛️" },
  { slug: "seongsu", label: "성수", emoji: "🎨" },
  { slug: "pangyo", label: "판교", emoji: "💻" },
  { slug: "mapo", label: "마포", emoji: "📺" },
  { slug: "jongno", label: "종로", emoji: "🏯" },
  { slug: "hongdae", label: "홍대", emoji: "🎵" },
] as const;

const TABS: { id: Tab; label: string; icon: typeof Building2; desc: string; color: string }[] = [
  { id: "deal", label: "매매", icon: Building2, desc: "블라인드 딜카드", color: "text-blue-400" },
  { id: "space", label: "임대", icon: Store, desc: "즉시 입주 공간", color: "text-emerald-400" },
  { id: "market", label: "시세", icon: BarChart3, desc: "AI 시세 리포트", color: "text-purple-400" },
];

const REGION_MAP: Record<string, string> = {
  gbd: "강남·서초·역삼",
  ybd: "여의도·영등포",
  cbd: "종로·을지로·광화문",
  seongsu: "성수·뚝섬",
  pangyo: "판교·분당",
  mapo: "마포·공덕·상암",
  jongno: "종로·인사동·북촌",
  hongdae: "홍대·연남·합정",
};

interface DealResult {
  id: string;
  area_signal: string;
  asset_type: string;
  price_band: string;
  status: string;
  created_at: string;
}

interface SpaceResult {
  id: string;
  floor: string | null;
  area_sqm: number | null;
  space_type: string;
  deposit: number | null;
  monthly_rent: number | null;
  area_signal: string;
  title: string;
}

interface MarketResult {
  region: string;
  period_type: string;
  pulse_score: number;
  trend: string;
  summary_ko: string;
  period_label: string;
  seo_slug: string;
}

type AnyResult = DealResult | SpaceResult | MarketResult;

function isDeal(r: AnyResult): r is DealResult {
  return "price_band" in r;
}
function isSpace(r: AnyResult): r is SpaceResult {
  return "monthly_rent" in r;
}
function isMarket(r: AnyResult): r is MarketResult {
  return "pulse_score" in r;
}

export default function ExploreUnifiedPage() {
  const [tab, setTab] = useState<Tab>("deal");
  const [region, setRegion] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AnyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fetchResults = useCallback(async (currentTab: Tab, currentRegion: string, q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: currentTab });
      if (currentRegion && currentRegion !== "all") params.set("region", currentRegion);
      if (q.trim()) params.set("q", q.trim());

      const res = await fetch(`/api/public/explore/search?${params}`);
      if (!res.ok) throw new Error("검색 실패");
      const json = await res.json();
      setResults(json.data ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResults(tab, region, query);
  }, [tab, region, fetchResults]); // re-fetch when tab/region changes (not on keystroke)

  const handleSearch = () => fetchResults(tab, region, query);

  const handleTabChange = (t: Tab) => {
    startTransition(() => setTab(t));
  };

  const regionHref = (r: string) => {
    if (tab === "deal") return r === "all" ? "/deal/gbd" : `/deal/${r}`;
    if (tab === "space") return r === "all" ? "/space/gbd" : `/space/${r}`;
    return r === "all" ? "/market/gbd" : `/market/${r}`;
  };

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-[#0d1424]/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-amber-400" strokeWidth={2} />
            <h1 className="text-sm font-extrabold text-white">권역 탐색</h1>
            <span className="text-[10px] text-slate-500 ml-auto">매매 · 임대 · 시세 통합</span>
          </div>

          {/* Search bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="권역, 건물명, 업종 검색..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl pl-9 pr-20 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-primary/50 transition-all"
            />
            <button
              onClick={handleSearch}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-primary text-primary-foreground text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-colors hover:bg-primary/90"
            >
              검색
            </button>
          </div>

          {/* Tab selector */}
          <div className="flex gap-1.5">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleTabChange(t.id)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold border transition-all",
                    active
                      ? "bg-[#131b2e] border-primary/30 text-white"
                      : "bg-transparent border-slate-800 text-slate-500 hover:text-slate-300"
                  )}
                >
                  <Icon className={cn("w-3.5 h-3.5", active ? t.color : "")} strokeWidth={active ? 2.2 : 1.8} />
                  {t.label}
                  {active && <span className={cn("text-[9px] font-normal", t.color)}>{t.desc}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Region chip scroll */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none mb-4">
          {REGIONS.map((r) => (
            <button
              key={r.slug}
              type="button"
              onClick={() => setRegion(r.slug)}
              className={cn(
                "shrink-0 flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-semibold border transition-all",
                region === r.slug
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-[#131b2e] border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700"
              )}
            >
              <span>{r.emoji}</span>
              {r.label}
            </button>
          ))}
        </div>

        {/* Region full cards (when no search query) */}
        {!query.trim() && results.length === 0 && !loading && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            {REGIONS.filter((r) => r.slug !== "all").map((r) => {
              const Icon = TABS.find((t) => t.id === tab)?.icon ?? Building2;
              const color = TABS.find((t) => t.id === tab)?.color ?? "text-blue-400";
              return (
                <Link
                  key={r.slug}
                  href={regionHref(r.slug)}
                  className="group rounded-2xl border border-slate-800 bg-[#131b2e] p-4 hover:border-slate-700 hover:bg-[#161f33] transition-all"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{r.emoji}</span>
                    <div>
                      <p className="text-xs font-bold text-white">{r.label}</p>
                      <p className="text-[9px] text-slate-500">{REGION_MAP[r.slug]}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={cn("text-[10px] font-semibold", color)}>
                      {TABS.find((t) => t.id === tab)?.desc} →
                    </span>
                    <ArrowRight className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition-colors" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Search results */}
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
              검색 결과 ({results.length}건)
            </p>
            {results.map((r, i) => {
              if (isDeal(r)) {
                return (
                  <Link
                    key={r.id}
                    href={`/deal/${r.area_signal?.toLowerCase().replace(/[·\s]/g, "").slice(0, 4) || "gbd"}/${r.id}`}
                    className="flex items-center gap-3 bg-[#131b2e] border border-slate-800 rounded-2xl px-4 py-3.5 hover:border-blue-500/30 transition-all"
                  >
                    <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {r.area_signal} {r.asset_type}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{r.price_band}</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  </Link>
                );
              }
              if (isSpace(r)) {
                return (
                  <Link
                    key={r.id}
                    href={`/space/${r.area_signal?.toLowerCase().slice(0, 4) || "gbd"}/${r.id}`}
                    className="flex items-center gap-3 bg-[#131b2e] border border-slate-800 rounded-2xl px-4 py-3.5 hover:border-emerald-500/30 transition-all"
                  >
                    <Store className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{r.title}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {r.area_sqm ? `${Math.round(r.area_sqm / 3.3058)}평` : ""} · 월 {r.monthly_rent || "?"}만
                      </p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  </Link>
                );
              }
              if (isMarket(r)) {
                return (
                  <Link
                    key={`${r.region}-${r.period_label}`}
                    href={`/pulse/${r.region}/${r.period_label}`}
                    className="flex items-center gap-3 bg-[#131b2e] border border-slate-800 rounded-2xl px-4 py-3.5 hover:border-purple-500/30 transition-all"
                  >
                    <BarChart3 className="w-4 h-4 text-purple-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {r.region.toUpperCase()} 시세 리포트
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{r.summary_ko}</p>
                    </div>
                    <span className="text-xs font-bold text-purple-400 shrink-0">{r.pulse_score}</span>
                  </Link>
                );
              }
              return null;
            })}
          </div>
        )}

        {!loading && results.length === 0 && query.trim() && (
          <div className="text-center py-16 space-y-2">
            <p className="text-slate-500 text-sm">검색 결과가 없습니다.</p>
            <p className="text-[10px] text-slate-600">권역 칩으로 탐색하거나 다른 키워드를 시도해보세요.</p>
          </div>
        )}
      </div>
    </main>
  );
}

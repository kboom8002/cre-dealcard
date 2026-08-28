import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { MARKET_TEMP_CONFIG } from "@/domain/magazine/types";

interface PageProps {
  params: Promise<{ brokerId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { brokerId } = await params;
  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("broker_profiles")
    .select("slug, bio")
    .eq("slug", brokerId)
    .maybeSingle();

  const title = profile
    ? `${brokerId}의 주간 매거진 아카이브 | CRE DealCard`
    : "CRE 주간 매거진 아카이브 | DealCard";

  return {
    title,
    description: `${brokerId} 중개사의 CRE 주간 매거진 전체 발행 목록입니다.`,
    openGraph: { title, type: "website" },
  };
}

export const revalidate = 1800;

interface EditionRow {
  id: string;
  edition_label: string;
  title: string | null;
  market_temp: string | null;
  cover_keywords: string[] | null;
  status: string;
  view_count: number | null;
  published_at: string | null;
  created_at: string;
}

export default async function MagazineArchivePage({ params }: PageProps) {
  const { brokerId } = await params;
  const supabase = createServiceClient();

  // 브로커 프로필
  const { data: profile } = await supabase
    .from("broker_profiles")
    .select("slug, bio, logo_company_url")
    .eq("slug", brokerId)
    .maybeSingle();

  // 발행된 에디션 목록
  const { data: editions } = await supabase
    .from("magazine_editions")
    .select("id, edition_label, title, market_temp, cover_keywords, status, view_count, published_at, created_at")
    .eq("broker_id", brokerId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(50);

  const editionList: EditionRow[] = (editions || []) as EditionRow[];

  // 에디션 라벨에서 날짜 추출 (W35-2026 → 2026-08-25 근사)
  function editionToDate(edition: EditionRow): string {
    if (edition.published_at) return edition.published_at.slice(0, 10);
    return edition.created_at.slice(0, 10);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#050510] via-[#0a0a1a] to-[#080814] text-white">
      <div className="max-w-[440px] mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="mb-8 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-sm">
              📰
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-white">주간 매거진 아카이브</h1>
              <p className="text-[11px] text-slate-500">{brokerId} · 전체 발행 목록</p>
            </div>
          </div>
          {profile?.bio && (
            <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{profile.bio}</p>
          )}
        </div>

        {/* 에디션 목록 */}
        {editionList.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <p className="text-4xl">📭</p>
            <p className="text-sm font-bold text-slate-400">아직 발행된 매거진이 없습니다.</p>
            <p className="text-xs text-slate-600">중개인이 첫 매거진을 발행하면 여기에 표시됩니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {editionList.map((edition) => {
              const date = editionToDate(edition);
              const tempConfig = edition.market_temp
                ? (MARKET_TEMP_CONFIG as Record<string, any>)[edition.market_temp]
                : null;
              const keywords = Array.isArray(edition.cover_keywords)
                ? (edition.cover_keywords as string[]).filter(Boolean).slice(0, 3)
                : [];

              return (
                <Link
                  key={edition.id}
                  href={`/magazine/${brokerId}/${date}`}
                  className="block p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl hover:bg-white/[0.06] hover:border-white/[0.12] transition-all group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* 날짜 + 에디션 라벨 */}
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-slate-500">{date}</span>
                        <span className="text-slate-600 bg-slate-800/50 px-1.5 py-0.5 rounded">
                          {edition.edition_label}
                        </span>
                      </div>

                      {/* 제목 */}
                      <p className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors line-clamp-2">
                        {edition.title || `${edition.edition_label} 주간 매거진`}
                      </p>

                      {/* 키워드 태그 */}
                      {keywords.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {keywords.map((kw) => (
                            <span
                              key={kw}
                              className="text-[9px] text-indigo-300/70 bg-indigo-500/8 px-1.5 py-0.5 rounded-full"
                            >
                              #{kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 우측: 시장온도 + 조회수 */}
                    <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                      {tempConfig && (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                          style={{
                            color: tempConfig.color,
                            borderColor: `${tempConfig.color}40`,
                            background: `${tempConfig.color}15`,
                          }}
                        >
                          {tempConfig.emoji} {edition.market_temp}
                        </span>
                      )}
                      {(edition.view_count ?? 0) > 0 && (
                        <span className="text-[9px] text-slate-600">
                          👁 {edition.view_count}회
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* 하단 */}
        <div className="mt-8 pt-6 border-t border-white/5 text-center space-y-2">
          <Link
            href={`/broker-profile/${brokerId}`}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
          >
            중개인 프로필 보기 →
          </Link>
          <p className="text-[10px] text-slate-700">
            © CRE DealCard · 상업용 부동산 인텔리전스
          </p>
        </div>
      </div>
    </div>
  );
}

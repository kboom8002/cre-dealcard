import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { formatKoreanDate } from "@/lib/magazine/kst";
import {
  canonicalBrokerSlug,
  listPublishedEditions,
  resolvePublicBroker,
} from "@/lib/magazine/public-page-data";
import { MARKET_TEMP_VIEW } from "@/lib/magazine/view-helpers";
import { EmptyState } from "@/components/ui/empty-state";

interface PageProps {
  params: Promise<{ brokerId: string }>;
}

const loadBroker = cache(async (param: string) =>
  resolvePublicBroker(createServiceClient(), param, "user_id, slug, name, bio, logo_company_url"),
);

/** 발행본 목록 — metadata 와 page 가 한 요청 안에서 1회만 조회 (DB 오류는 throw). */
const loadEntries = cache(async (param: string) => {
  const profile = await loadBroker(param);
  if (!profile) return null;
  return listPublishedEditions(createServiceClient(), profile);
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { brokerId } = await params;
  const profile = await loadBroker(brokerId);

  if (!profile) {
    return { title: "CRE 주간 매거진 아카이브", robots: { index: false, follow: false } };
  }

  const label = (profile.name as string | null) || (profile.slug as string | null) || brokerId;
  const title = `${label}의 주간 매거진 아카이브`;
  const entries = await loadEntries(brokerId);

  return {
    title,
    description: `${label} 중개사의 CRE 주간 매거진 전체 발행 목록입니다.`,
    openGraph: { title, type: "website" },
    // 발행본이 하나도 없는 빈 아카이브는 색인하지 않는다.
    ...(entries && entries.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export const revalidate = 1800;

export default async function MagazineArchivePage({ params }: PageProps) {
  const { brokerId } = await params;

  // 브로커 프로필 (없으면 404, uuid 접근은 slug URL 로 308)
  const profile = await loadBroker(brokerId);
  if (!profile) notFound();
  const canonical = canonicalBrokerSlug(brokerId, profile);
  if (canonical) permanentRedirect(`/magazine/${canonical}`);

  const slug = (profile.slug as string | null) ?? brokerId;
  const displayName = (profile.name as string | null) || slug;

  // 발행된 에디션 목록 — 조회수는 독자에게 노출하지 않으므로 조회하지도 않는다 (U2-30)
  const entries = (await loadEntries(brokerId)) ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#050510] via-[#0a0a1a] to-[#080814] text-white">
      <main id="magazine-main" className="mx-auto max-w-[440px] px-4 py-8">
        {/* 헤더 */}
        <header className="mb-8 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-600/20 text-sm" aria-hidden="true">
              📰
            </div>
            <div>
              <h1 className="text-title font-extrabold text-white">주간 매거진 아카이브</h1>
              <p className="text-caption text-ink-subtle">{displayName} · 전체 발행 목록</p>
            </div>
          </div>
          {typeof profile.bio === "string" && profile.bio && (
            <p className="line-clamp-2 text-label leading-relaxed text-ink-muted">{profile.bio}</p>
          )}
        </header>

        {/* 에디션 목록 */}
        {entries.length === 0 ? (
          <div className="space-y-4">
            <EmptyState
              icon={<span className="text-4xl">📭</span>}
              title="아직 발행된 매거진이 없습니다"
              description="첫 호가 발행되면 가장 먼저 받아보세요."
            />
            <Link
              href={`/magazine/${encodeURIComponent(slug)}/subscribe`}
              className="flex min-h-11 w-full items-center justify-center rounded-xl bg-indigo-500 px-4 text-body font-bold text-white hover:bg-indigo-400"
            >
              첫 호 알림 받기
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => {
              const tempConfig = entry.marketTemp ? MARKET_TEMP_VIEW[entry.marketTemp] : null;
              const dateLabel = formatKoreanDate(entry.date);
              return (
                <li key={entry.id}>
                  <Link
                    href={`/magazine/${encodeURIComponent(slug)}/${entry.date}`}
                    className="group block min-h-11 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-white/20 hover:bg-white/[0.06]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <time dateTime={entry.date} className="block text-caption text-ink-subtle">{dateLabel}</time>
                        <p className="line-clamp-2 text-body font-bold text-slate-100 transition-colors group-hover:text-white">
                          {entry.title || `${dateLabel} 매거진`}
                        </p>
                        {entry.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {entry.keywords.map((kw) => (
                              <span key={kw} className="rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-caption text-indigo-200">
                                #{kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {tempConfig && entry.marketTemp && (
                        <span
                          className="shrink-0 rounded-full border px-2 py-0.5 text-caption font-bold"
                          style={{
                            color: tempConfig.color,
                            borderColor: `${tempConfig.color}40`,
                            background: `${tempConfig.color}15`,
                          }}
                        >
                          {tempConfig.emoji} {entry.marketTemp}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {/* 하단: 구독 CTA (존재하지 않는 프로필 링크 제거) */}
        <footer className="mt-8 space-y-2 border-t border-white/10 pt-6 text-center">
          {entries.length > 0 && (
            <Link
              href={`/magazine/${encodeURIComponent(slug)}/subscribe`}
              className="inline-flex min-h-11 items-center justify-center text-label font-semibold text-indigo-300 transition-colors hover:text-indigo-200"
            >
              다음 호 구독하기 →
            </Link>
          )}
          <p className="text-caption text-ink-subtle">© CRE DealCard · 상업용 부동산 인텔리전스</p>
        </footer>
      </main>
    </div>
  );
}

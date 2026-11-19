import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { formatKoreanDate } from "@/lib/magazine/kst";
import { isUuid } from "@/lib/magazine/slug";
import {
  canonicalBrokerSlug,
  listPublishedEntries,
  resolvePublicBroker,
  resolvePublicDisplayName,
} from "@/lib/magazine/public-page-data";
import { MARKET_TEMP_VIEW } from "@/lib/magazine/view-helpers";

interface PageProps {
  params: Promise<{ brokerId: string }>;
}

const loadBroker = cache(async (param: string) =>
  resolvePublicBroker(createServiceClient(), param, "user_id, slug, name, bio, logo_company_url"),
);

/** 발행본 목록 — published editions + 에디션 없는 레거시 published issues. metadata 와 page 가 한 요청 안에서 1회만 조회 (DB 오류는 throw). */
const loadEntries = cache(async (param: string) => {
  const profile = await loadBroker(param);
  if (!profile) return null;
  return listPublishedEntries(createServiceClient(), profile);
});

/** 공개 표시명(구독 페이지·뷰어와 동일 규칙) */
const loadDisplayName = cache(async (param: string) => {
  const profile = await loadBroker(param);
  if (!profile) return null;
  return resolvePublicDisplayName(createServiceClient(), profile);
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { brokerId } = await params;
  const profile = await loadBroker(brokerId);

  if (!profile) {
    return { title: "CRE 주간 매거진 아카이브", robots: { index: false, follow: false } };
  }

  const slug = (profile.slug as string | null) || brokerId;
  const label = (await loadDisplayName(brokerId)) || slug;
  const title = `${label}의 주간 매거진 아카이브`;
  const description = `${label} 중개사의 CRE 주간 매거진 전체 발행 목록입니다.`;
  const entries = await loadEntries(brokerId);
  const latestDate = entries?.[0]?.date;
  const ogImageUrl = latestDate
    ? `/api/og/magazine?brokerId=${encodeURIComponent(slug)}&date=${encodeURIComponent(latestDate)}`
    : `/api/og/magazine?brokerId=${encodeURIComponent(slug)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "CRE 매거진",
      type: "website",
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
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
  const displayName = (await loadDisplayName(brokerId)) || slug;

  // 발행된 에디션 목록 — 조회수는 독자에게 노출하지 않으므로 조회하지도 않는다 (U2-30)
  const entries = (await loadEntries(brokerId)) ?? [];
  const dateCounts = new Map<string, number>();
  for (const e of entries) {
    dateCounts.set(e.date, (dateCounts.get(e.date) ?? 0) + 1);
  }

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-slate-900">
      <main id="magazine-main" className="mx-auto max-w-[440px] px-4 py-8">
        {/* 헤더 */}
        <header className="mb-8 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-base" aria-hidden="true">
              📰
            </div>
            <div>
              <h1 className="text-title font-extrabold text-slate-900">주간 매거진 아카이브</h1>
              <p className="text-sm text-slate-700">{displayName} · 전체 발행 목록</p>
            </div>
          </div>
          {typeof profile.bio === "string" && profile.bio && (
            <p className="line-clamp-2 text-sm leading-relaxed text-slate-700">{profile.bio}</p>
          )}
        </header>

        {/* 에디션 목록 */}
        {entries.length === 0 ? (
          <div className="space-y-4">
            <div
              role="status"
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center"
            >
              <span className="text-4xl" aria-hidden="true">📭</span>
              <p className="text-body font-semibold text-slate-900">아직 발행된 매거진이 없습니다</p>
              <p className="text-body text-slate-700">첫 호가 발행되면 가장 먼저 받아보세요.</p>
            </div>
            <Link
              href={`/magazine/${encodeURIComponent(slug)}/subscribe`}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-indigo-700 px-4 text-body font-bold text-white hover:bg-indigo-800"
            >
              첫 호 알림 받기
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => {
              const tempConfig = entry.marketTemp ? MARKET_TEMP_VIEW[entry.marketTemp] : null;
              const dateLabel = formatKoreanDate(entry.date);
              const isEditionEntry = entry.source !== "legacy";
              const editionQueryVal =
                isEditionEntry && isUuid(entry.id)
                  ? entry.id
                  : isEditionEntry && (dateCounts.get(entry.date) ?? 0) > 1
                    ? entry.label || entry.id
                    : null;
              const entryHref = editionQueryVal
                ? `/magazine/${encodeURIComponent(slug)}/${entry.date}?edition=${encodeURIComponent(editionQueryVal)}`
                : `/magazine/${encodeURIComponent(slug)}/${entry.date}`;
              return (
                <li key={entry.id}>
                  <Link
                    href={entryHref}
                    prefetch={false}
                    className="group block min-h-12 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-indigo-300 hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <time dateTime={entry.date} className="block text-sm text-slate-700">{dateLabel}</time>
                        <p className="line-clamp-2 text-body font-bold text-slate-900 transition-colors group-hover:text-indigo-800">
                          {entry.title || `${dateLabel} 매거진`}
                        </p>
                        {entry.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {entry.keywords.map((kw) => (
                              <span key={kw} className="rounded-full bg-indigo-50 px-2 py-0.5 text-sm text-indigo-800">
                                #{kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {tempConfig && entry.marketTemp && (
                        <span
                          className="shrink-0 rounded-full border bg-white px-2.5 py-1 text-sm font-bold text-slate-900"
                          style={{
                            borderColor: `${tempConfig.color}99`,
                            background: `${tempConfig.color}1f`,
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
        <footer className="mt-8 space-y-2 border-t border-slate-200 pt-6 text-center">
          {entries.length > 0 && (
            <Link
              href={`/magazine/${encodeURIComponent(slug)}/subscribe`}
              className="inline-flex min-h-12 items-center justify-center px-4 text-sm font-semibold text-indigo-800 transition-colors hover:text-indigo-950"
            >
              다음 호 구독하기 →
            </Link>
          )}
          <p className="text-sm text-slate-700">© CRE DealCard · 상업용 부동산 인텔리전스</p>
        </footer>
      </main>
    </div>
  );
}

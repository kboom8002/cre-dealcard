import { cache } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { formatKoreanDate } from "@/lib/magazine/kst";
import {
  canonicalBrokerSlug,
  classifyIssueDate,
  findIssueForDate,
  findLatestIssueDate,
  maskPublicAddresses,
  resolvePublicBroker,
  resolvePublicDisplayName,
  type MagazineContent,
} from "@/lib/magazine/public-page-data";
import { isUnpublishedContent } from "@/lib/magazine/get-published-issue";
import { buildMagazineTitle, parseViewerTarget } from "@/lib/magazine/view-helpers";
import { UnpublishedNotice, type UnpublishedReason } from "@/components/magazine/UnpublishedNotice";
import { PreviewReceiver } from "@/components/magazine/PreviewReceiver";
import { buildPreviewSrc } from "@/lib/magazine/preview-bridge";
import { MagazineView, type MagazineData } from "./magazine-view";

interface PageProps {
  params: Promise<{ brokerId: string; date: string }>;
  /** ?target= 은 서버에서 읽어 내려준다 — 클라이언트가 location 을 읽으면 hydration 불일치 (U-05). `preview`/`edition` 은 에디터 iframe 미리보기. */
  searchParams: Promise<{ target?: string | string[]; preview?: string | string[]; edition?: string | string[] }>;
}

/** 에디터 iframe 미리보기 쿼리(`?preview=1&edition=`) 해석 — 배열이면 첫 값 */
function readPreviewParams(sp: { preview?: string | string[]; edition?: string | string[] }): { preview: boolean; edition: string | null } {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return { preview: first(sp.preview) === "1", edition: first(sp.edition) || null };
}

const BROKER_COLUMNS =
  "user_id, slug, name, vibe_vector, vibe_vti, vibe_complement, vibe_template_id, vibe_valence, vibe_trust, vibe_analyzed_at, logo_company_url, logo_partner_url, specialty_regions, specialty_assets, bio";

type PageState =
  | { kind: "no-broker" }
  | { kind: "redirect"; slug: string }
  | { kind: "unpublished"; reason: UnpublishedReason; brokerSlug: string; latestDate: string | null }
  | { kind: "ok"; data: MagazineContent; brokerSlug: string | null; brokerVibe: Record<string, unknown> };

/** metadata 와 page 가 같은 요청 안에서 1회만 조회하도록 캐시. DB 오류는 삼키지 않고 throw. */
const loadPage = cache(async (brokerParam: string, date: string): Promise<PageState> => {
  const supabase = createServiceClient();
  const broker = await resolvePublicBroker(supabase, brokerParam, BROKER_COLUMNS);
  if (!broker) return { kind: "no-broker" };

  const canonical = canonicalBrokerSlug(brokerParam, broker);
  if (canonical) return { kind: "redirect", slug: canonical };

  const linkKey = broker.slug ?? broker.user_id;

  const unpublished = async (reason: UnpublishedReason): Promise<PageState> => {
    // 안내 화면의 '최신호' 링크용 — 이 조회가 실패해도 안내 자체는 보여준다(링크만 생략, 오류는 기록).
    let latestDate: string | null = null;
    try {
      latestDate = await findLatestIssueDate(supabase, broker);
    } catch (err) {
      console.error("[magazine/viewer] latest issue lookup failed", err);
    }
    return { kind: "unpublished", reason, brokerSlug: linkKey, latestDate };
  };

  const state = classifyIssueDate(date);
  if (state.kind !== "ok") return unpublished(state.kind);

  // T3-08: 정확한 날짜의 발행본만. 다른 날짜의 최신본으로 폴백하지 않는다.
  const issue = await findIssueForDate(supabase, broker, state.date);
  if (!issue) return unpublished("missing");
  // 초안/검수대기 표시가 남은 콘텐츠는 공개하지 않는다.
  if (isUnpublishedContent(issue)) return unpublished("draft");

  // 중개사 이름 SSOT: 발행 스냅샷(data.broker.name)이 아니라 구독 페이지와 같은 공개 표시명을 쓴다.
  const displayName = await resolvePublicDisplayName(supabase, broker);
  const masked = maskPublicAddresses(issue);
  const snapshotBroker = (masked.broker && typeof masked.broker === "object" ? masked.broker : {}) as Record<string, unknown>;
  const data: MagazineContent = displayName
    ? { ...masked, broker: { ...snapshotBroker, name: displayName } }
    : masked;

  return {
    kind: "ok",
    data,
    brokerSlug: broker.slug,
    brokerVibe: broker,
  };
});

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { brokerId, date } = await params;
  // 에디터 미리보기는 항상 noindex — 공개 데이터 조회도 하지 않는다.
  if (readPreviewParams(await searchParams).preview) {
    return { title: "CRE 매거진 미리보기", robots: { index: false, follow: false } };
  }
  const state = await loadPage(brokerId, date);

  if (state.kind !== "ok") {
    return {
      title: "CRE 매거진",
      robots: { index: false, follow: false },
    };
  }

  const data = state.data;
  const broker = (data.broker ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const slug = state.brokerSlug ?? brokerId;
  // 표지 h1 과 동일한 제목 (T1-16). 루트 레이아웃 title.template 가 "| DealCard" 를 붙인다.
  const title = buildMagazineTitle(data.headline, broker.name);
  const description =
    (data.headline as string | undefined) ??
    `${broker.name ?? "중개사"} 중개사의 ${formatKoreanDate(date)} 꼬마빌딩 시장 AI 맞춤 브리핑`;
  const ogImageUrl = `/api/og/magazine?brokerId=${encodeURIComponent(slug)}&date=${encodeURIComponent(date)}`;
  const canonical = `https://credeal.net/magazine/${slug}/${date}`;

  return {
    title,
    description,
    alternates: { canonical },
    keywords: [
      "꼬마빌딩 매거진",
      "CRE 매거진",
      "부동산 시장 브리핑",
      ...(broker.name ? [broker.name as string] : []),
      ...((broker.specialtyRegions as string[] | undefined) ?? []),
      "DealCard",
    ],
    openGraph: {
      title,
      description,
      type: "article",
      url: canonical,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
      publishedTime: date,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

// 주의: `searchParams` 를 읽으므로 이 페이지는 동적 렌더링이다 (이전의 `revalidate = 1800` ISR 제거).
export default async function MagazinePage({ params, searchParams }: PageProps) {
  const { brokerId, date } = await params;
  const sp = await searchParams;
  const { preview: isPreview, edition } = readPreviewParams(sp);
  const state = await loadPage(brokerId, date);

  if (state.kind === "no-broker") notFound();
  // uuid 로 접근했고 slug 가 있으면 정규 URL(slug)로 308 (I-02) — 미리보기 쿼리는 유지
  if (state.kind === "redirect") {
    permanentRedirect(isPreview ? buildPreviewSrc(state.slug, date, edition) : `/magazine/${state.slug}/${date}`);
  }

  // 에디터 미리보기(iframe, ?preview=1&edition=): 서버는 공개 데이터를 일절 바꾸지 않는다.
  // 초안 content 는 같은 origin 의 부모(에디터) 프레임이 postMessage 로 보낼 때만 렌더된다(PreviewReceiver) —
  // 따라서 URL 만 아는 제3자에게는 초안이 노출되지 않는다. 날짜 형식이 잘못된 경우만 기존 안내 화면.
  if (isPreview && !(state.kind === "unpublished" && state.reason === "invalid")) {
    const slug = state.brokerSlug;
    return (
      <PreviewReceiver
        editionId={edition}
        brokerId={slug ?? brokerId}
        brokerSlug={slug}
        date={date}
        dateLabel={formatKoreanDate(date)}
        target={sp.target !== undefined ? parseViewerTarget(sp.target) : undefined}
      />
    );
  }

  if (state.kind === "unpublished") {
    return (
      <UnpublishedNotice
        reason={state.reason}
        brokerSlug={state.brokerSlug}
        date={date}
        latestDate={state.latestDate}
      />
    );
  }

  // 날짜·요일 표시는 서버(KST)에서 계산 — hydration 불일치 제거 (T3-40)
  const dateLabel = formatKoreanDate(date);

  return (
    <MagazineView
      data={state.data as MagazineData}
      brokerId={state.brokerSlug ?? brokerId}
      brokerSlug={state.brokerSlug}
      date={date}
      dateLabel={dateLabel}
      brokerVibe={state.brokerVibe}
      target={sp.target !== undefined ? parseViewerTarget(sp.target) : undefined}
    />
  );
}

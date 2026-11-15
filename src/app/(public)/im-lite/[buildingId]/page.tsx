/**
 * /im-lite/[buildingId]
 *
 * Public mobile-first IM Lite (7-section) viewer.
 * Accessible without login. Demo buildings show rich content.
 * Based on im-ai-methodology.md §2 Mobile IM 7-section spec.
 *
 * Data is fetched directly from Supabase (not self-fetch) to avoid
 * Vercel serverless deadlock issues.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import React, { cache, Suspense } from "react";
import { QaFeedbackPinWidget } from "@/components/workspace/QaFeedbackPinWidget";
import { DEMO_BUILDING_IDS } from "@/lib/demo/mobile-im-demo-data";
import { MobileIMViewer } from "./mobile-im-viewer";
import { fetchIMData } from "./fetch-im-data";
import { getServerViewer } from "@/lib/server-viewer";

interface Props {
  params: Promise<{ buildingId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

// P0-SEC: React cache() — generateMetadata 와 page 가 같은 요청에서 한 번만 조회
// (fetchIMData 내부 broker_profiles upsert / readWithMigration 부수효과 중복 방지).
// 요청자(viewer)를 전달해 비공개 상태 문서(?doc=)는 소유자/admin 에게만 미리보기 허용.
const loadIMData = cache(
  async (buildingId: string, docId: string | undefined, token?: string) => {
    const viewer = await getServerViewer();
    return fetchIMData(buildingId, docId, viewer, token);
  }
);

// Allow dynamic (non-demo) building IDs to be server-rendered at runtime
export const dynamicParams = true;
export const dynamic = 'force-dynamic';

export async function generateStaticParams() {
  return DEMO_BUILDING_IDS.map((id) => ({ buildingId: id }));
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { buildingId } = await params;
  const sp = await searchParams;
  const docId = typeof sp.doc === "string" ? sp.doc : undefined;
  const token = typeof sp.token === "string" ? sp.token : undefined;

  const data = await loadIMData(buildingId, docId, token);

  if (data && !(data as any).isRevoked) {
    const ogTitle = data.ogTitle || `${data.blindName} — ${data.priceBand} 투자설명서`;
    const ogDesc = data.ogDescription || `${data.areaSignal} · ${data.assetType} · 모바일 투자설명서`;
    const ogImageUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://credeal.net'}/api/og/deal/${buildingId}?type=im`;

    return {
      title: `${ogTitle} | 크리딜`,
      description: ogDesc,
      openGraph: {
        title: ogTitle,
        description: ogDesc,
        type: "article",
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: ogTitle,
        description: ogDesc,
      },
    };
  }

  return {
    title: { absolute: "모바일 투자설명서 | 크리딜" },
    description: "상업용 부동산 비공개 모바일 투자설명서 (IM Lite)",
  };
}

export default async function MobileIMLitePage({ params, searchParams }: Props) {
  const { buildingId } = await params;
  const sp = await searchParams;
  const docId = typeof sp.doc === "string" ? sp.doc : undefined;
  const token = typeof sp.token === "string" ? sp.token : undefined;

  const data = await loadIMData(buildingId, docId, token);

  if (!data) {
    if (token) {
      return (
        <main
          className="min-h-screen bg-[#FAF9F6] text-stone-900 flex items-center justify-center px-4 py-12"
          data-testid="revoked-im-screen"
        >
          <div className="max-w-md w-full bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 text-center space-y-4 shadow-sm">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-stone-100 text-stone-700 border border-stone-200 rounded-full font-bold text-sm">
              열람 종료 안내
            </div>
            <h1 className="text-xl font-extrabold text-stone-900 leading-snug break-keep">
              📋 매물 조건 업데이트 또는 거래 진행에 따라 열람이 종료된 링크입니다
            </h1>
            <p className="text-base text-stone-600 leading-relaxed break-keep">
              최신 매물 상태나 수정된 자료가 필요하시면 담당 공인중개사에게 문의해 주세요.
            </p>
            <div className="pt-1">
              <a
                href={`/dc/${buildingId}`}
                className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center rounded-xl bg-stone-900 px-5 py-3 text-base font-bold text-white hover:bg-stone-800 transition-colors cursor-pointer"
              >
                ← 매물 요약 딜카드 보기
              </a>
            </div>
          </div>
        </main>
      );
    }

    const viewer = await getServerViewer();
    const isAuthenticatedViewer = Boolean(
      viewer?.userId || (viewer as { id?: string | null } | null)?.id
    );

    return (
      <main
        className="min-h-screen bg-[#FAF9F6] text-stone-900 flex items-center justify-center px-4 py-12"
        data-testid="im-notfound-screen"
      >
        <div className="max-w-md w-full bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 text-center space-y-4 shadow-sm">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-stone-100 text-stone-700 border border-stone-200 rounded-full font-bold text-sm">
            투자설명서 준비 안내
          </div>
          <h1 className="text-xl font-extrabold text-stone-900 leading-snug break-keep">
            상세 투자설명서(IM) 준비 중인 매물입니다
          </h1>
          <p className="text-base text-stone-600 leading-relaxed break-keep">
            담당 공인중개사가 최신 임대차 및 수익 자료를 검수하고 있습니다. 매물 요약 딜카드에서 간편 문의를 남겨주시면 우선 안내해 드립니다.
          </p>
          <div className="pt-1 space-y-2">
            <a
              href={`/dc/${buildingId}`}
              className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center rounded-xl bg-stone-900 px-5 py-3 text-base font-bold text-white hover:bg-stone-800 transition-colors cursor-pointer"
            >
              ← 매물 요약 딜카드 보기
            </a>
            {isAuthenticatedViewer && (
              <div>
                <a
                  href="/broker/w/im"
                  className="inline-flex min-h-[44px] items-center justify-center text-sm font-medium text-stone-500 hover:text-stone-800 underline underline-offset-4"
                >
                  IM 작업공간으로 이동
                </a>
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  const isBroker = sp.mode === "broker" || Boolean((data as any).isOwner);

  const safeDocument = (data as any).isRevoked
    ? ({
        ...data,
        priceBand: "비공개",
        sections: [],
        rentRoll: [],
        floor_leases: [],
        basicImDocument: undefined,
        ssotSummary: undefined,
        heroCard: undefined,
      } as any)
    : data;

  const showPublicQaPin = sp.qa === "1";

  return (
    <>
      <MobileIMViewer
        document={safeDocument}
        buildingId={buildingId}
        docId={docId}
        isBroker={isBroker}
        shareToken={token}
      />
      {showPublicQaPin && (
        <Suspense fallback={null}>
          <QaFeedbackPinWidget workspace="public-im" requireExplicitQueryParam />
        </Suspense>
      )}
    </>
  );
}

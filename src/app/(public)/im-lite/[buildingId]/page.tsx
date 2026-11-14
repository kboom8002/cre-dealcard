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
import { cache, Suspense } from "react";
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
    title: "IM Lite — 모바일 투자설명서",
    description: "AI 기반 상업용 부동산 모바일 투자설명서",
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
          className="min-h-screen bg-[#F3F2EE] text-[#0F172A] flex items-center justify-center px-4 py-12"
          data-testid="revoked-im-screen"
        >
          <div className="max-w-md w-full bg-white rounded-3xl border-2 border-[#FECACA] p-6 sm:p-8 text-center space-y-4 shadow-md">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#FEE2E2] text-[#991B1B] rounded-full font-extrabold text-sm">
              🚫 열람 제한 안내 · 링크 잠김
            </div>
            <h1 className="text-xl font-black text-[#0F172A] leading-snug">
              담당 중개인에 의해 회수되었거나 잠긴 투자설명서(IM) 링크입니다
            </h1>
            <p className="text-base text-[#475569] leading-relaxed">
              매매 조건 변경 또는 보안 정책에 따라 해당 공유 링크의 열람이 제한되었습니다. 최신 투자설명서 링크는 담당 공인중개사에게 문의해 주세요.
            </p>
          </div>
        </main>
      );
    }
    return (
      <main
        className="min-h-screen bg-[#F3F2EE] text-[#0F172A] flex items-center justify-center px-4 py-12"
        data-testid="im-notfound-screen"
      >
        <div className="max-w-md w-full bg-white rounded-3xl border border-[#CBD5E1] p-6 sm:p-8 text-center space-y-4 shadow-sm">
          <div className="text-4xl">📋</div>
          <h1 className="text-xl font-extrabold text-[#0F172A] leading-snug">
            상세 투자설명서(IM)를 준비하고 있습니다
          </h1>
          <p className="text-base text-[#475569] leading-relaxed">
            요청하신 매물의 모바일 투자설명서가 아직 발행되지 않았거나 주소가 변경되었습니다. 담당 공인중개사에게 최신 링크를 문의해 주세요.
          </p>
          <a
            href="/broker/w/im"
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[#0F172A] px-5 py-3 text-base font-bold text-white hover:bg-[#1E293B] transition-colors cursor-pointer"
          >
            ← IM 작업공간으로 돌아가기
          </a>
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

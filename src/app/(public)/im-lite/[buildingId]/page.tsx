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
import { cache } from "react";
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
const loadIMData = cache(async (buildingId: string, docId: string | undefined) => {
  const viewer = await getServerViewer();
  return fetchIMData(buildingId, docId, viewer);
});

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

  const data = await loadIMData(buildingId, docId);

  if (data) {
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

  const data = await loadIMData(buildingId, docId);

  if (!data) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">📋</div>
          <h1 className="text-xl font-bold text-foreground">
            투자보고서가 아직 준비 중입니다
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            이 물건의 Investment Memorandum은 현재 생성 중이거나
            아직 발행되지 않았습니다.
          </p>
          <a href="/broker/buildings" className="inline-block text-sm text-primary underline cursor-pointer">
            ← 매물 목록으로 돌아가기
          </a>
        </div>
      </main>
    );
  }

  let isBroker = sp.mode === 'broker';
  try {
    const viewer = await getServerViewer();
    if (viewer.userId) {
      isBroker = true;
    }
  } catch {
    // Non-blocking
  }

  return <MobileIMViewer document={data} buildingId={buildingId} docId={docId} isBroker={isBroker} />;
}

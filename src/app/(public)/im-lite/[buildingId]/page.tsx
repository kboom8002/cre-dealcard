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
import { DEMO_BUILDING_IDS } from "@/lib/demo/mobile-im-demo-data";
import { MobileIMViewer } from "./mobile-im-viewer";
import { fetchIMData } from "./fetch-im-data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ buildingId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

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

  const data = await fetchIMData(buildingId, docId);

  if (data) {
    const ogTitle = data.ogTitle || `${data.blindName} — ${data.priceBand} 투자설명서`;
    const ogDesc = data.ogDescription || `${data.areaSignal} 핵심 입지 · ${data.assetType} · 투자 검토 자료`;
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

  const data = await fetchIMData(buildingId, docId);

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
          <a href="/explore" className="inline-block text-sm text-primary underline">
            다른 매물 둘러보기 →
          </a>
        </div>
      </main>
    );
  }

  let isBroker = sp.mode === 'broker';
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      isBroker = true;
    }
  } catch {
    // Non-blocking
  }

  return <MobileIMViewer document={data} buildingId={buildingId} docId={docId} isBroker={isBroker} />;
}

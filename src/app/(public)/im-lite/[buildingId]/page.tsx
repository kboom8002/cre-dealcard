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
    return {
      title: `${data.blindName} — 모바일 IM Lite | 크리딜`,
      description: `${data.priceBand} | ${data.areaSignal} | AI 자동 생성 투자설명서`,
      openGraph: {
        title: `${data.blindName} — 투자설명서 (IM Lite)`,
        description: `${data.priceBand} | ${data.areaSignal} | ${data.assetType}`,
        type: "article",
        images: [
          {
            url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://credeal.co.kr'}/api/og/deal/${buildingId}`,
            width: 1200,
            height: 630,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: `${data.blindName} IM Lite`,
        description: `${data.priceBand} | ${data.areaSignal}`,
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
    notFound();
  }

  return <MobileIMViewer document={data} buildingId={buildingId} docId={docId} />;
}

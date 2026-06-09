/**
 * /im-lite/[buildingId]
 *
 * Public mobile-first IM Lite (7-section) viewer.
 * Accessible without login. Demo buildings show rich content.
 * Based on im-ai-methodology.md §2 Mobile IM 7-section spec.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDemoMobileIM, DEMO_BUILDING_IDS } from "@/lib/demo/mobile-im-demo-data";
import { MobileIMViewer } from "./mobile-im-viewer";

interface Props {
  params: Promise<{ buildingId: string }>;
}

export async function generateStaticParams() {
  return DEMO_BUILDING_IDS.map((id) => ({ buildingId: id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { buildingId } = await params;
  const demo = getDemoMobileIM(buildingId);

  if (demo) {
    return {
      title: `${demo.blindName} — 모바일 IM Lite`,
      description: `${demo.areaSignal} ${demo.assetType} ${demo.priceBand}. AI 자동 생성 투자설명서 (7섹션). 담당 중개인: ${demo.broker.displayName}`,
      openGraph: {
        title: `${demo.blindName} — 투자설명서 (IM Lite)`,
        description: `${demo.priceBand} | ${demo.areaSignal} | ${demo.assetType}`,
        type: "article",
        images: [
          {
            url: `/api/og/vibe-card/${demo.broker.slug}`,
            width: 1200,
            height: 630,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: `${demo.blindName} IM Lite`,
        description: `${demo.priceBand} | ${demo.areaSignal}`,
      },
    };
  }

  // For real buildings: try to fetch document data for OG tags
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.credeal.net";
  try {
    const res = await fetch(`${baseUrl}/api/public/im-lite/${buildingId}`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const { data } = await res.json();
      if (data) {
        const areaSignal = data.areaSignal || "";
        const assetType = data.assetType || "";
        const priceBand = data.priceBand || "";
        return {
          title: `${areaSignal} ${assetType} — 모바일 IM Lite | 크리딜`,
          description: `${priceBand} | ${areaSignal} | AI 자동 생성 투자설명서`,
          openGraph: {
            title: `${areaSignal} ${assetType} — IM Lite`,
            description: `${priceBand} | ${areaSignal}`,
            type: "article",
            images: [
              {
                url: `/api/og/vibe-card/cre-dealcard-default`,
                width: 1200,
                height: 630,
              },
            ],
          },
          twitter: {
            card: "summary_large_image",
            title: `${areaSignal} ${assetType} IM Lite`,
            description: priceBand,
          },
        };
      }
    }
  } catch {
    // ignore
  }

  return {
    title: "IM Lite — 모바일 투자설명서",
    description: "AI 기반 상업용 부동산 모바일 투자설명서",
  };
}

export default async function MobileIMLitePage({ params }: Props) {
  const { buildingId } = await params;
  const demo = getDemoMobileIM(buildingId);

  if (!demo) {
    // For non-demo buildings, fetch from API (SSR)
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.credeal.net";
    try {
      const res = await fetch(`${baseUrl}/api/public/im-lite/${buildingId}`, {
        next: { revalidate: 3600 },
      });
      if (!res.ok) notFound();
      const { data } = await res.json();
      // Real buildings show a limited view — pass data to viewer
      return <MobileIMViewer document={null} buildingId={buildingId} ssotData={data} />;
    } catch {
      notFound();
    }
  }

  return <MobileIMViewer document={demo} buildingId={buildingId} />;
}

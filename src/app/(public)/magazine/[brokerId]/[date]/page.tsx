import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { MagazineView } from "./magazine-view";

interface PageProps {
  params: Promise<{ brokerId: string; date: string }>;
}

async function getMagazineData(brokerId: string, date: string) {
  try {
    const supabase = createServiceClient();
    const { data: cached } = await supabase
      .from("magazine_issues")
      .select("content")
      .eq("broker_id", brokerId)
      .eq("issue_date", date)
      .maybeSingle();

    if (cached?.content) return cached.content as Record<string, any>;

    // 실시간 생성
    const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
    const res = await fetch(`${BASE}/api/magazine/${brokerId}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json.data as Record<string, any>) ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { brokerId, date } = await params;
  const data = await getMagazineData(brokerId, date);

  if (!data) return { title: "CRE \ub370\uc77c\ub9ac \ub9e4\uac70\uc9c4 | DealCard" };

  const broker = data.broker as any;
  const title = `[${date}] ${broker.name}\uc758 CRE \ub370\uc77c\ub9ac \ub9e4\uac70\uc9c4 | ${broker.specialtyRegions?.[0] ?? ""} \uaf2c\ub9c8\ube4c\ub529`;
  const description =
    (data.headline as string | undefined) ??
    `${broker.name} \uc911\uac1c\uc0ac\uc758 \uc624\ub298 \uaf2c\ub9c8\ube4c\ub529 \uc2dc\uc7a5 AI \ub9de\uc2a4\ud2b8 \ube0c\ub9ac\ud551`;
  const ogImageUrl = `/api/og/magazine/route?brokerId=${brokerId}&date=${date}`;

  return {
    title,
    description,
    keywords: [
      "\uaf2c\ub9c8\ube4c\ub529 \ub9e4\uac70\uc9c4",
      "CRE \ub370\uc77c\ub9ac",
      "\ubd80\ub3d9\uc0b0 \uc2dc\uc7a5 \ube0c\ub9ac\ud551",
      broker.name,
      ...(broker.specialtyRegions ?? []),
      "DealCard",
    ],
    openGraph: {
      title,
      description,
      type: "article",
      url: `https://dealcard.kr/magazine/${brokerId}/${date}`,
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

export const revalidate = 1800;

export default async function MagazinePage({ params }: PageProps) {
  const { brokerId, date } = await params;
  const data = await getMagazineData(brokerId, date);

  if (!data) return notFound();

  return <MagazineView data={data} brokerId={brokerId} date={date} />;
}

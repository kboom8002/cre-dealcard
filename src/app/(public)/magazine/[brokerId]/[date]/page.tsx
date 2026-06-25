import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { MagazineView, type MagazineData } from "./magazine-view";

interface PageProps {
  params: Promise<{ brokerId: string; date: string }>;
}

async function getMagazineData(brokerId: string, date: string): Promise<MagazineData | null> {
  try {
    const supabase = createServiceClient();
    const { data: cached } = await supabase
      .from("magazine_issues")
      .select("content")
      .eq("broker_id", brokerId)
      .eq("issue_date", date)
      .maybeSingle();

    if (cached?.content) return cached.content as MagazineData;

    // 실시간 생성
    const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
    const res = await fetch(`${BASE}/api/magazine/${brokerId}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json.data as MagazineData) ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { brokerId, date } = await params;
  const data = await getMagazineData(brokerId, date);

  if (!data) return { title: "CRE 데일리 매거진 | DealCard" };

  const broker = data.broker;
  const title = `[${date}] ${broker.name}의 CRE 데일리 매거진 | ${broker.specialtyRegions?.[0] ?? ""} 꼬마빌딩`;
  const description =
    data.headline ??
    `${broker.name} 중개사의 오늘 꼬마빌딩 시장 AI 맞춤 브리핑`;
  const ogImageUrl = `/api/og/magazine?brokerId=${brokerId}&date=${date}`;

  return {
    title,
    description,
    keywords: [
      "꼬마빌딩 매거진",
      "CRE 데일리",
      "부동산 시장 브리핑",
      broker.name,
      ...(broker.specialtyRegions ?? []),
      "DealCard",
    ],
    openGraph: {
      title,
      description,
      type: "article",
      url: `https://credeal.net/magazine/${brokerId}/${date}`,
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

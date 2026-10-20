import { redirect } from "next/navigation";

interface LegacyDealCardPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * 레거시 단축 URL (/d/[id]) → 현행 공개 딜카드 수신자 화면 (/dc/[id]) 리다이렉트
 */
export default async function LegacyDealCardRedirectPage({
  params,
  searchParams,
}: LegacyDealCardPageProps) {
  const { id } = await params;
  const sParams = searchParams ? await searchParams : {};
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(sParams)) {
    if (typeof value === "string") {
      query.set(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) query.append(key, v);
    }
  }

  const qs = query.toString();
  redirect(`/dc/${id}${qs ? `?${qs}` : ""}`);
}

import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { todayKst } from "@/lib/magazine/kst";

interface ShortMagazinePageProps {
  params: Promise<{ slug: string }>;
}

/**
 * GET /m/[slug]
 * 뉴스레터 단축 URL (/m/2026-11 또는 /m/[editionId]) → 정식 공개 매거진 뷰어(/magazine/[brokerId]/[date])로 안전 리다이렉트 (L-01 404 방지)
 */
export default async function ShortMagazineRedirectPage({ params }: ShortMagazinePageProps) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug || "").trim();

  try {
    const supabase = createServiceClient();

    // 1. edition_label 또는 id 일치 발행본 우선 조회
    const { data: editions } = await supabase
      .from("magazine_editions")
      .select("id, broker_id, edition_label, status, published_at, created_at, content")
      .or(`edition_label.eq.${decodedSlug},id.eq.${decodedSlug}`)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(5);

    const matched = Array.isArray(editions) && editions.length > 0 ? editions[0] : null;
    if (matched && matched.broker_id) {
      const content =
        matched.content && typeof matched.content === "object"
          ? (matched.content as Record<string, unknown>)
          : {};
      const rawDate =
        typeof content.issue_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(content.issue_date)
          ? content.issue_date
          : typeof matched.published_at === "string" && matched.published_at.length >= 10
          ? matched.published_at.slice(0, 10)
          : typeof matched.created_at === "string" && matched.created_at.length >= 10
          ? matched.created_at.slice(0, 10)
          : todayKst();

      redirect(
        `/magazine/${encodeURIComponent(String(matched.broker_id))}/${encodeURIComponent(rawDate)}?edition=${encodeURIComponent(String(matched.id))}`
      );
    }

    // 2. 최신 공개 magazine_issues 조회 폴백
    const { data: latestIssue } = await supabase
      .from("magazine_issues")
      .select("broker_id, issue_date")
      .order("issue_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestIssue?.broker_id && latestIssue?.issue_date) {
      redirect(
        `/magazine/${encodeURIComponent(String(latestIssue.broker_id))}/${encodeURIComponent(String(latestIssue.issue_date))}`
      );
    }
  } catch (err: unknown) {
    // Next.js redirect() throws NEXT_REDIRECT internally — rethrow it
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest?: unknown }).digest === "string" &&
      String((err as { digest: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
  }

  redirect("/pulse");
}

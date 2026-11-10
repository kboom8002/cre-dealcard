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
  const isUuidSlug = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    decodedSlug
  );

  try {
    const supabase = createServiceClient();

    // 1. S0-5: Only match status='published', and never interpolate into .or() or compare non-UUID against id
    let edQuery: any = supabase
      .from("magazine_editions")
      .select("id, broker_id, edition_label, status, published_at, created_at, content")
      .eq("status", "published");

    if (isUuidSlug) {
      edQuery = edQuery.eq("id", decodedSlug);
    } else {
      edQuery = edQuery.eq("edition_label", decodedSlug);
    }

    const { data: editions } = await edQuery
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(5);

    const matched = Array.isArray(editions) && editions.length > 0 ? editions[0] : null;
    if (matched && matched.broker_id && matched.status === "published") {
      const content =
        matched.content && typeof matched.content === "object"
          ? (matched.content as Record<string, unknown>)
          : {};
      const candidateIssueDate =
        typeof content.issueDate === "string"
          ? content.issueDate
          : typeof content.issue_date === "string"
          ? content.issue_date
          : "";
      const rawDate =
        /^\d{4}-\d{2}-\d{2}$/.test(candidateIssueDate)
          ? candidateIssueDate
          : typeof matched.published_at === "string" && matched.published_at.length >= 10
          ? matched.published_at.slice(0, 10)
          : typeof matched.created_at === "string" && matched.created_at.length >= 10
          ? matched.created_at.slice(0, 10)
          : todayKst();

      redirect(
        `/magazine/${encodeURIComponent(String(matched.broker_id))}/${encodeURIComponent(rawDate)}?edition=${encodeURIComponent(String(matched.id))}`
      );
    }

    // If a specific edition UUID was requested and not published, do not fall back to another broker's issue
    if (isUuidSlug) {
      redirect("/pulse");
    }

    // 2. 최신 공개 magazine_issues 조회 폴백 (단축 라벨 접근 시에만)
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

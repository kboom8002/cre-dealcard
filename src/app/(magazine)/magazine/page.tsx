import Link from "next/link";
import { redirect } from "next/navigation";
import { parseIssueDate } from "@/lib/magazine/kst";
import { resolveEditionPublicDateAndHeader } from "@/lib/magazine/edition-public-date";
import { isUnpublishedContent } from "@/lib/magazine/public-page-data";
import { createServiceClient } from "@/lib/supabase/service";
import { getServerViewer } from "@/lib/server-viewer";

/**
 * GET /magazine
 * 소통함 [뉴스레터 보내기] 또는 직접 진입 시 404가 발생하지 않도록
 * 로그인한 중개사 본인의 매거진 허브(/magazine/[brokerSlug]) 또는 최신 발행호로만 연결합니다.
 * 비로그인 방문자·발행본이 없는 신규 계정을 타 중개사 뉴스레터로 교차 리다이렉트하지 않습니다.
 */
export default async function MagazineRootPage({
  searchParams,
}: {
  searchParams?: Promise<{
    sid?: string | string[];
    qa?: string | string[];
    target?: string | string[];
    edition?: string | string[];
  }>;
} = {}) {
  const sp = searchParams ? await searchParams : {};
  const firstParam = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) || "";
  const qs = new URLSearchParams();
  for (const key of ["sid", "qa", "target", "edition"] as const) {
    const val = firstParam(sp[key]).trim();
    if (val) qs.set(key, val);
  }
  const querySuffix = qs.toString() ? `?${qs.toString()}` : "";

  try {
    const viewer = await getServerViewer().catch(() => null);

    if (viewer?.userId) {
      const supabase = createServiceClient();
      const { data: profile } = await supabase
        .from("broker_profiles")
        .select("slug, user_id")
        .eq("user_id", viewer.userId)
        .maybeSingle();

      const ownSlug = profile?.slug || viewer.userId;
      const ownKeys = Array.from(new Set([ownSlug, viewer.userId].filter(Boolean)));

      const { data: myLatestEdition } = await supabase
        .from("magazine_editions")
        .select("id, broker_id, edition_type, edition_label, published_at, created_at, content")
        .in("broker_id", ownKeys)
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (myLatestEdition) {
        const edContent =
          myLatestEdition.content && typeof myLatestEdition.content === "object"
            ? (myLatestEdition.content as Record<string, unknown>)
            : null;
        const hasDateSignal = Boolean(
          myLatestEdition.published_at ||
            myLatestEdition.created_at ||
            (typeof edContent?.issueDate === "string" && parseIssueDate(edContent.issueDate)) ||
            (typeof myLatestEdition.edition_label === "string" &&
              parseIssueDate(myLatestEdition.edition_label)),
        );
        if (hasDateSignal) {
          const { canonicalUrlDate } = resolveEditionPublicDateAndHeader({
            cadence: edContent?.cadence,
            editionType: myLatestEdition.edition_type ?? edContent?.kind,
            editionLabel: myLatestEdition.edition_label ?? edContent?.weekLabel,
            issueDate: edContent?.issueDate,
            publishedAt: myLatestEdition.published_at,
            createdAt: myLatestEdition.created_at,
          });
          if (parseIssueDate(canonicalUrlDate)) {
            redirect(
              `/magazine/${encodeURIComponent(String(ownSlug))}/${encodeURIComponent(canonicalUrlDate)}${querySuffix}`,
            );
          }
        }
      }

      const { data: myLatest } = await supabase
        .from("magazine_issues")
        .select("broker_id, issue_date, content")
        .in("broker_id", ownKeys)
        .order("issue_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const myLatestContent =
        myLatest?.content && typeof myLatest.content === "object"
          ? (myLatest.content as Record<string, unknown>)
          : null;
      if (
        myLatest?.broker_id &&
        myLatest?.issue_date &&
        (!myLatestContent || !isUnpublishedContent(myLatestContent))
      ) {
        const redirectSlug = profile?.slug || String(myLatest.broker_id);
        redirect(
          `/magazine/${encodeURIComponent(redirectSlug)}/${encodeURIComponent(String(myLatest.issue_date))}${querySuffix}`,
        );
      }
      if (profile?.slug) {
        redirect(`/magazine/${encodeURIComponent(String(profile.slug))}${querySuffix}`);
      }
    }
  } catch (err: unknown) {
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

  return (
    <main className="min-h-screen bg-[#FAF9F5] text-slate-900 flex flex-col items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm space-y-4 text-center">
        <p className="text-sm font-extrabold text-blue-700">CREDEAL MAGAZINE</p>
        <h1 className="text-2xl font-extrabold text-slate-900">
          상업용 부동산 월간 시장 브리핑 &amp; 추천 매물
        </h1>
        <p className="text-base text-slate-600">
          담당 공인중개사가 발행한 최신 뉴스레터와 엄선된 추천 빌딩 정보를 확인하실 수 있습니다.
        </p>
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/broker/w/newsletter"
            className="min-h-[48px] px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-base font-extrabold flex items-center justify-center transition"
          >
            뉴스레터 작성하기
          </Link>
          <Link
            href="/hub"
            className="min-h-[48px] px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-base font-bold flex items-center justify-center transition"
          >
            시장 동향 보러가기
          </Link>
        </div>
      </div>
    </main>
  );
}

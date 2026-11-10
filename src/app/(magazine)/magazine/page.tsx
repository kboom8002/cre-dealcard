import Link from "next/link";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getServerViewer } from "@/lib/server-viewer";

/**
 * GET /magazine
 * 소통함 [뉴스레터 보내기] 또는 직접 진입 시 404가 발생하지 않도록
 * 로그인한 중개사 본인의 매거진 허브(/magazine/[brokerSlug]) 또는 최신 발행호로 연결합니다 (L-03 404 방지).
 */
export default async function MagazineRootPage() {
  try {
    const supabase = createServiceClient();
    const viewer = await getServerViewer().catch(() => null);

    if (viewer?.userId) {
      const { data: profile } = await supabase
        .from("broker_profiles")
        .select("slug, user_id")
        .eq("user_id", viewer.userId)
        .maybeSingle();

      const slug = profile?.slug || viewer.userId;
      const { data: myLatest } = await supabase
        .from("magazine_issues")
        .select("broker_id, issue_date")
        .in("broker_id", [slug, viewer.userId].filter(Boolean))
        .order("issue_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (myLatest?.broker_id && myLatest?.issue_date) {
        redirect(
          `/magazine/${encodeURIComponent(String(myLatest.broker_id))}/${encodeURIComponent(String(myLatest.issue_date))}`
        );
      }
      if (profile?.slug) {
        redirect(`/magazine/${encodeURIComponent(String(profile.slug))}`);
      }
    }

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
            href="/broker/magazine-editor"
            className="min-h-[48px] px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-base font-extrabold flex items-center justify-center transition"
          >
            뉴스레터 작성하기
          </Link>
          <Link
            href="/pulse"
            className="min-h-[48px] px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-base font-bold flex items-center justify-center transition"
          >
            시장 동향 보러가기
          </Link>
        </div>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "공실 현황 리포트 | JS 딜카드",
  description: "건물 공실 현황 및 임대 마케팅 진행 상황 리포트",
};

/**
 * P2-1: 건물주 공실 현황 리포트 자동 생성 페이지
 * building_ssot_lite + spaces + activity_events 를 종합하여
 * 건물주에게 공유할 수 있는 공실 진행 리포트를 생성.
 */
interface OwnerReportPageProps {
  params: Promise<{ id: string }>;
}

export default async function OwnerReportPage({ params }: OwnerReportPageProps) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: building } = await supabase
    .from("building_ssot_lite")
    .select(
      "id, area_signal, asset_type, price_band, vacancy_signal, matched_buyer_count, promotion_score, created_at"
    )
    .eq("id", id)
    .single();

  if (!building) return notFound();

  // 최근 활동 이벤트 (문의, 매칭 등)
  const { data: events } = await supabase
    .from("activity_events")
    .select("event_type, created_at, metadata")
    .eq("building_ssot_lite_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  // 이벤트 분류
  const matchEvents = events?.filter((e) => e.event_type === "match_computed") ?? [];
  const inquiryEvents = events?.filter((e) => e.event_type === "inquiry_received") ?? [];
  const aGradeMatches = matchEvents.filter(
    (e) => (e.metadata as Record<string, unknown>)?.grade === "A" || (e.metadata as Record<string, unknown>)?.grade === "S"
  );

  const today = new Date();
  const reportDate = today.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // 이번 주 이벤트 필터
  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const thisWeekMatches = matchEvents.filter(
    (e) => new Date(e.created_at) >= oneWeekAgo
  );
  const thisWeekInquiries = inquiryEvents.filter(
    (e) => new Date(e.created_at) >= oneWeekAgo
  );

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-24">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* 리포트 헤더 */}
        <div className="text-center space-y-2 pt-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            건물주 공실 현황 리포트
          </p>
          <h1 className="text-xl font-bold">
            {building.area_signal} {building.asset_type}
          </h1>
          <p className="text-xs text-muted-foreground">발행일: {reportDate}</p>
        </div>

        {/* 핵심 지표 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-primary">
              {thisWeekMatches.length}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">이번 주 매칭</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-green-600">
              {aGradeMatches.length}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">A등급 매수자</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">
              {thisWeekInquiries.length}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">이번 주 문의</p>
          </div>
        </div>

        {/* 매물 현황 */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <span>🏢</span> 매물 기본 현황
          </h2>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">가격대</p>
              <p className="font-medium">{building.price_band ?? "미확인"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">공실 현황</p>
              <p className="font-medium">
                {building.vacancy_signal === "없음" ? "✅ 전부 임차" : `⚠️ ${building.vacancy_signal ?? "미확인"}`}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">누적 매칭 매수자</p>
              <p className="font-medium">{building.matched_buyer_count ?? 0}명</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">노출 점수</p>
              <p className="font-medium">{Math.round(building.promotion_score ?? 0)}점</p>
            </div>
          </div>
        </div>

        {/* 진행 중인 액션 */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <span>📋</span> 진행 중인 액션
          </h2>
          <div className="space-y-2">
            {aGradeMatches.length > 0 && (
              <div className="flex items-start gap-2 text-sm">
                <span className="text-green-500 shrink-0 mt-0.5">✅</span>
                <span>
                  A등급 이상 매수자 {aGradeMatches.length}명과 매칭 완료 — 상담 일정 조율 중
                </span>
              </div>
            )}
            {building.vacancy_signal && building.vacancy_signal !== "없음" && (
              <div className="flex items-start gap-2 text-sm">
                <span className="text-blue-500 shrink-0 mt-0.5">🔵</span>
                <span>
                  공실 AI 마케팅 페이지 운영 중 (cre-aipage.vercel.app)
                </span>
              </div>
            )}
            {matchEvents.length === 0 && (
              <p className="text-sm text-muted-foreground">
                아직 매수자 매칭 이력이 없습니다.
              </p>
            )}
          </div>
        </div>

        {/* 최근 활동 타임라인 */}
        {events && events.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <span>⏱</span> 최근 활동
            </h2>
            <div className="space-y-2">
              {events.slice(0, 5).map((event, i) => {
                const eventLabels: Record<string, string> = {
                  match_computed: "매수자 매칭 완료",
                  inquiry_received: "임차 문의 접수",
                  deal_card_created: "딜카드 생성",
                  owner_readiness_checked: "준비도 확인",
                  gate_approved: "Gate 승인",
                };
                const grade = (event.metadata as Record<string, unknown>)?.grade as string;
                return (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground shrink-0">
                      {new Date(event.created_at).toLocaleDateString("ko-KR", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="flex-1 text-foreground">
                      {eventLabels[event.event_type] ?? event.event_type}
                      {grade && ` (${grade}등급)`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* AiPage 링크 CTA */}
        {building.vacancy_signal && building.vacancy_signal !== "없음" && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-3">
            <h2 className="text-base font-semibold">🌐 공실 AI 마케팅 페이지</h2>
            <p className="text-sm text-muted-foreground">
              아래 URL을 건물주에게 카카오톡으로 공유하면 실시간 마케팅 현황을 볼 수 있습니다.
            </p>
            <div className="rounded-lg bg-white border border-border px-3 py-2">
              <p className="text-xs font-mono text-muted-foreground break-all">
                cre-aipage.vercel.app/m/spaces/{building.area_signal?.replace(/\s/g, "-").toLowerCase()}
              </p>
            </div>
            <Link
              href={`https://cre-aipage.vercel.app/m/spaces/${id}`}
              target="_blank"
              className="inline-flex items-center justify-center w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              id="cta-aipage-from-report"
            >
              🏠 AI 임대 페이지 바로가기
            </Link>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center pb-4">
          이 리포트는 JS부동산중개 credeal.net 시스템이 자동 생성합니다.
        </p>
      </div>
    </main>
  );
}

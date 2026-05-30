import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { DealCuriosityReportSchema } from "@/ai/schemas/deal-curiosity-report";
import Link from "next/link";
import { ReverseOnboardingForm } from "@/components/onboarding/ReverseOnboardingForm";

export const metadata: Metadata = {
  title: "딜 리포트 | 이 건물, 딜 될까?",
  description: "AI가 분석한 건물 딜 가능성 리포트입니다.",
};

interface ResultPageProps {
  params: Promise<{ id: string }>;
}

export default async function BuildingRadarResultPage({
  params,
}: ResultPageProps) {
  const { id } = await params;
  const supabase = createServiceClient();

  // Fetch building (public-safe fields only)
  const { data: building } = await supabase
    .from("building_ssot_lite")
    .select("id, area_signal, asset_type, price_band, status")
    .eq("id", id)
    .single();

  if (!building) return notFound();

  // Fetch report
  const { data: doc } = await supabase
    .from("document_objects")
    .select("id, title, body, status, created_at")
    .eq("building_id", id)
    .eq("document_type", "deal_curiosity_report")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!doc) return notFound();

  // Parse report body with Zod (lenient — use raw if parse fails)
  let report;
  try {
    report = DealCuriosityReportSchema.parse(doc.body);
  } catch {
    report = doc.body as Record<string, unknown>;
  }

  // Type-safe access helpers
  const oneLineDiagnosis =
    typeof report.oneLineDiagnosis === "string"
      ? report.oneLineDiagnosis
      : "딜 검토 리포트";
  const score =
    typeof report.dealCuriosityScore === "number"
      ? report.dealCuriosityScore
      : 0;
  const scoreMeaning =
    typeof report.scoreMeaning === "string" ? report.scoreMeaning : "";
  const dealPoints = Array.isArray(report.dealPoints) ? report.dealPoints : [];
  const riskQuestions = Array.isArray(report.riskQuestions)
    ? report.riskQuestions
    : [];
  const buyerFitTypes = Array.isArray(report.buyerFitTypes)
    ? report.buyerFitTypes
    : [];
  const dealStories = Array.isArray(report.dealStories)
    ? report.dealStories
    : [];
  const ssotReadiness =
    typeof report.ssotReadiness === "object" && report.ssotReadiness !== null
      ? (report.ssotReadiness as Record<string, unknown>)
      : {};
  const boundaryNote =
    typeof report.boundaryNote === "string"
      ? report.boundaryNote
      : "이 리포트는 공개 데이터와 입력 정보를 바탕으로 한 예비 검토 자료입니다. 가격, 수익률, 법률, 세무, 대출 가능성을 확정하지 않습니다.";

  // Score color
  const scoreColor =
    score >= 70
      ? "text-green-600"
      : score >= 40
        ? "text-amber-600"
        : "text-red-500";

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-32">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* Top Diagnosis */}
        <div className="text-center space-y-2 pt-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            Deal Curiosity Report
          </p>
          <h1 className="text-xl font-bold leading-snug">{oneLineDiagnosis}</h1>
        </div>

        {/* Score Card */}
        <div className="rounded-xl border border-border bg-card p-5 text-center space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Deal Curiosity Score
          </p>
          <p className={`text-4xl font-bold ${scoreColor}`}>
            {score}
            <span className="text-lg text-muted-foreground font-normal">
              {" "}
              / 100
            </span>
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {scoreMeaning ||
              "이 점수는 투자 가치가 아니라, 공개 데이터와 입력 정보 기준으로 생성 가능한 딜 질문과 스토리의 풍부함을 의미합니다."}
          </p>
        </div>

        {/* Risk Questions */}
        {riskQuestions.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <span className="text-red-500">🔴</span> 먼저 확인해야 할 질문
            </h2>
            <ol className="space-y-2">
              {riskQuestions.map((q, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-muted-foreground font-medium shrink-0">
                    {i + 1}.
                  </span>
                  <span>{String(q)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Deal Points */}
        {dealPoints.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <span className="text-green-600">💡</span> 매수자에게 설명할 수
              있는 포인트
            </h2>
            <ul className="space-y-2">
              {dealPoints.map((p, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-muted-foreground">•</span>
                  <span>{String(p)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Deal Stories */}
        {dealStories.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <span>📖</span> 가능한 딜 시나리오
            </h2>
            {dealStories.map((story, i) => {
              const s = story as Record<string, unknown>;
              return (
                <div key={i} className="space-y-1">
                  <p className="text-sm font-medium">
                    {String(s.title || "")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {String(s.description || "")}
                  </p>
                  {Array.isArray(s.requiredValidation) &&
                    s.requiredValidation.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {s.requiredValidation.map((v, vi) => (
                          <span
                            key={vi}
                            className="inline-block rounded-md bg-amber-100 text-amber-800 px-2 py-0.5 text-xs"
                          >
                            {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        )}

        {/* Buyer Fit Types */}
        {buyerFitTypes.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <span>🎯</span> 적합 매수자 유형
            </h2>
            <div className="flex flex-wrap gap-2">
              {buyerFitTypes.map((t, i) => (
                <span
                  key={i}
                  className="inline-block rounded-md bg-primary/10 text-primary border border-primary/20 px-3 py-1 text-sm"
                >
                  {String(t)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* SSoT Readiness Card */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <span>📊</span> 현재 자료 준비 상태
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span>{ssotReadiness.publicSignalReady ? "✅" : "❌"}</span>
              <span>무료 딜 리포트</span>
            </div>
            <div className="flex items-center gap-2">
              <span>{ssotReadiness.teaserReady ? "✅" : "⚠️"}</span>
              <span>블라인드 딜카드</span>
            </div>
            <div className="flex items-center gap-2">
              <span>{ssotReadiness.snapshotDraftReady ? "✅" : "⚠️"}</span>
              <span>Snapshot 초안</span>
            </div>
            <div className="flex items-center gap-2">
              <span>{ssotReadiness.fullImReady ? "✅" : "❌"}</span>
              <span>Full IM</span>
            </div>
          </div>
          {Array.isArray(ssotReadiness.missingData) &&
            (ssotReadiness.missingData as string[]).length > 0 && (
              <div className="pt-2 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  부족한 자료:
                </p>
                <ul className="space-y-1">
                  {(ssotReadiness.missingData as string[]).map(
                    (d: string, i: number) => (
                      <li
                        key={i}
                        className="text-xs text-muted-foreground flex gap-1"
                      >
                        <span>-</span>
                        <span>{d}</span>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}
        </div>

        {/* Boundary Note */}
        <div className="rounded-xl bg-secondary/50 border border-border px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {boundaryNote}
          </p>
        </div>

        {/* Reverse Onboarding Form (Phase 4: F13-3) */}
        <ReverseOnboardingForm
          buildingId={building.id}
          buildingArea={building.area_signal || "서울"}
          buildingAssetType={building.asset_type || "오피스빌딩"}
        />

        {/* Document Status Badge */}
        <div className="flex items-center justify-center gap-2">
          <span className="inline-flex items-center rounded-md bg-amber-100 text-amber-800 px-2.5 py-0.5 text-xs font-medium">
            AI 초안
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(doc.created_at).toLocaleDateString("ko-KR")}
          </span>
        </div>
      </div>

      {/* Sticky CTA Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border px-4 py-3 safe-bottom">
        <div className="max-w-md mx-auto space-y-2">
          <Link
            href="/broker/deal-card/new"
            className="inline-flex items-center justify-center w-full rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 active:scale-[0.98]"
            id="cta-create-blind-teaser"
          >
            블라인드 딜카드 만들기
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/expert-note/request"
              className="inline-flex items-center justify-center rounded-xl bg-secondary px-3 py-2.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
              id="cta-expert-note"
            >
              전문가 3줄 코멘트
            </Link>
            <Link
              href="/owner-readiness"
              className="inline-flex items-center justify-center rounded-xl bg-secondary px-3 py-2.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
              id="cta-full-im"
            >
              Full IM 가능 여부
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

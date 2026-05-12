import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "매물 현황 | JS 1분 딜카드",
  description: "등록된 전체 매물의 노출 점수와 딜 파이프라인 현황을 확인하세요.",
};

/**
 * P2-2: 매물 목록 + 프로모션 스코어 대시보드 (P1-3 딜 파이프라인 뷰 포함)
 */
export default async function BuildingsPage() {
  const supabase = createServiceClient();

  const { data: buildings } = await supabase
    .from("building_ssot_lite")
    .select(
      "id, area_signal, asset_type, price_band, status, matched_buyer_count, promotion_score, vacancy_signal, created_at"
    )
    .order("promotion_score", { ascending: false, nullsFirst: false });

  const PIPELINE_STAGES: { key: string; label: string; emoji: string }[] = [
    { key: "draft", label: "입력 완료", emoji: "📋" },
    { key: "active", label: "매수자 매칭", emoji: "🎯" },
    { key: "im_ready", label: "IM 준비", emoji: "📄" },
    { key: "negotiating", label: "협상 중", emoji: "🤝" },
    { key: "closed", label: "계약 완료", emoji: "✅" },
    { key: "archived", label: "보관", emoji: "📦" },
  ];

  const stageCounts = PIPELINE_STAGES.reduce(
    (acc, s) => {
      acc[s.key] = buildings?.filter((b) => b.status === s.key).length ?? 0;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-24">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-xl font-bold">매물 현황</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              총 {buildings?.length ?? 0}건 등록됨
            </p>
          </div>
          <Link
            href="/broker/deal-card/new"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            id="cta-new-deal-card-from-buildings"
          >
            + 등록
          </Link>
        </div>

        {/* P1-3: 딜 파이프라인 현황 */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">🔄 딜 파이프라인 현황</h2>
          <div className="flex items-center gap-0 overflow-x-auto pb-1">
            {PIPELINE_STAGES.map((stage, idx) => {
              const count = stageCounts[stage.key];
              const isLast = idx === PIPELINE_STAGES.length - 1;
              return (
                <div key={stage.key} className="flex items-center shrink-0">
                  <div className="flex flex-col items-center gap-0.5 px-2">
                    <span className="text-base">{stage.emoji}</span>
                    <span
                      className={`text-xs font-bold ${
                        count > 0 ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {count}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {stage.label}
                    </span>
                  </div>
                  {!isLast && (
                    <span className="text-muted-foreground/40 text-xs shrink-0">
                      →
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* P2-2: 매물 목록 (프로모션 점수 순) */}
        {buildings && buildings.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">노출 점수 높은 순</p>
            {buildings.map((b) => {
              const score = Math.round(b.promotion_score ?? 0);
              const scoreColor =
                score >= 70
                  ? "text-green-600"
                  : score >= 40
                  ? "text-amber-600"
                  : "text-gray-400";
              const matchCount = b.matched_buyer_count ?? 0;
              const hasVacancy = b.vacancy_signal === "있음" || b.vacancy_signal === "부분";

              return (
                <Link
                  key={b.id}
                  href={`/broker/deal-card/${b.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 active:scale-[0.98]"
                  id={`building-item-${b.id}`}
                >
                  {/* 노출 점수 */}
                  <div className="flex flex-col items-center shrink-0 w-10">
                    <span className={`text-lg font-bold ${scoreColor}`}>
                      {score || "-"}
                    </span>
                    <span className="text-xs text-muted-foreground">점</span>
                  </div>

                  {/* 매물 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium truncate">
                        {b.area_signal ?? "권역 미상"} {b.asset_type ?? ""}
                      </p>
                      {hasVacancy && (
                        <span className="shrink-0 inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-xs">
                          공실
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground">
                        {b.price_band ?? "가격 미상"}
                      </p>
                      {matchCount > 0 && (
                        <span className="text-xs text-primary font-medium">
                          🎯 {matchCount}명
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="text-muted-foreground text-xs shrink-0">→</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3">
            <p className="text-4xl">🏢</p>
            <p className="text-sm font-medium">등록된 매물이 없어요.</p>
            <Link
              href="/broker/deal-card/new"
              className="inline-flex items-center justify-center mt-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              id="cta-first-building"
            >
              첫 딜카드 만들기
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

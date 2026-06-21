import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "등록된 매수자 조건 | JS 1분 딜카드",
  description: "등록된 매수자 조건 목록을 확인하세요.",
};

/**
 * P0-3: 매수자 의향서 목록 페이지 — 신규 생성
 * buyer_intent_lite 테이블의 전체 목록을 조회하여 카드로 표시.
 */
export default async function BuyerIntentsPage() {
  const supabaseAuth = await createServerSupabaseClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();

  const supabase = createServiceClient();

  const { data: intents } = await supabase
    .from("buyer_intent_lite")
    .select(
      "id, buyer_type, budget_display, budget_min, budget_max, preferred_regions, asset_types, purchase_purpose, risk_tolerance, created_at"
    )
    .eq("broker_id", user?.id)
    .order("created_at", { ascending: false });

  // 각 의향서별 매칭 건수 조회
  const matchCounts: Record<string, number> = {};
  if (intents && intents.length > 0) {
    const { data: matchRows } = await supabase
      .from("match_results")
      .select("buyer_intent_lite_id, grade")
      .in(
        "buyer_intent_lite_id",
        intents.map((i) => i.id)
      );

    for (const row of matchRows ?? []) {
      const id = row.buyer_intent_lite_id as string;
      matchCounts[id] = (matchCounts[id] ?? 0) + 1;
    }
  }

  const purposeEmoji: Record<string, string> = {
    임대수익: "💰",
    사옥: "🏛️",
    증여: "🎁",
    개발: "🏗️",
    갭투자: "📈",
  };

  const riskLabels: Record<string, string> = {
    low: "보수적",
    medium: "중간",
    high: "적극적",
    unknown: "미확인",
  };

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-24">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-xl font-bold">등록된 매수자</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              총 {intents?.length ?? 0}명의 매수자 조건이 등록되어 있습니다.
            </p>
          </div>
          <Link
            href="/broker/buyer-intents/new"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            id="cta-new-buyer-intent"
          >
            + 추가
          </Link>
        </div>

        {/* 매수자 목록 */}
        {intents && intents.length > 0 ? (
          <div className="space-y-3">
            {intents.map((intent) => {
              const regions = Array.isArray(intent.preferred_regions)
                ? (intent.preferred_regions as string[]).join(", ")
                : "미확인";
              const assets = Array.isArray(intent.asset_types)
                ? (intent.asset_types as string[]).join(", ")
                : "미확인";
              const purpose = intent.purchase_purpose ?? "";
              const emoji = purposeEmoji[purpose] ?? "🎯";
              const matchCount = matchCounts[intent.id] ?? 0;

              return (
                <Link
                  key={intent.id}
                  href={`/broker/buyer-intents/${intent.id}`}
                  className="block rounded-xl border border-border bg-card p-4 space-y-3 transition-all hover:border-primary/40 active:scale-[0.98]"
                  id={`buyer-intent-${intent.id}`}
                >
                  {/* 상단: 매수자 유형 + 매칭 배지 */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{emoji}</span>
                      <div>
                        <p className="text-sm font-semibold">
                          {intent.buyer_type || "매수자"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {intent.purchase_purpose ?? "목적 미확인"}
                        </p>
                      </div>
                    </div>
                    {matchCount > 0 && (
                      <span className="shrink-0 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        🎯 {matchCount}건 매칭
                      </span>
                    )}
                  </div>

                  {/* 조건 그리드 */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div>
                      <span className="text-muted-foreground">예산</span>
                      <span className="ml-1 font-medium">
                        {intent.budget_display ?? "미확인"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">리스크</span>
                      <span className="ml-1 font-medium">
                        {riskLabels[intent.risk_tolerance ?? "unknown"]}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">선호 지역</span>
                      <span className="ml-1 font-medium">{regions}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">선호 자산</span>
                      <span className="ml-1 font-medium">{assets}</span>
                    </div>
                  </div>

                  {/* 날짜 + 화살표 */}
                  <div className="flex items-center justify-between pt-1 border-t border-border">
                    <span className="text-xs text-muted-foreground">
                      {new Date(intent.created_at).toLocaleDateString("ko-KR")} 등록
                    </span>
                    <span className="text-xs text-primary font-medium">
                      상세 보기 →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3">
            <p className="text-4xl">🎯</p>
            <p className="text-sm font-medium">등록된 매수자 조건이 없어요.</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              매수자 상담 후 조건을 등록하면
              <br />
              적합한 매물이 생길 때 자동으로 알려드려요.
            </p>
            <Link
              href="/broker/buyer-intents/new"
              className="inline-flex items-center justify-center mt-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              id="cta-first-buyer-intent"
            >
              첫 매수자 조건 등록하기
            </Link>
          </div>
        )}
      </div>

      {/* 하단 고정 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border px-4 py-3">
        <div className="max-w-md mx-auto">
          <Link
            href="/broker/buyer-intents/new"
            className="inline-flex items-center justify-center w-full rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            id="cta-add-buyer-intent-bottom"
          >
            🎯 매수자 조건 새로 등록하기
          </Link>
        </div>
      </div>
    </main>
  );
}

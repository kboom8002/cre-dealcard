import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "JS 1분 딜카드 | 중개인 전용",
  description: "카톡 매물 메모를 붙여넣으면 1분 안에 딜카드가 생성됩니다.",
};

/**
 * Broker hub page — P0-2: 실제 딜카드 목록 + 매수자 의향서 목록 표시
 * Source: docs/05-ui-ux-spec.md section 9
 */
export default async function BrokerPage() {
  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? "좋은 아침이에요"
      : hour < 18
        ? "좋은 오후예요"
        : "수고하셨어요";

  const supabase = createServiceClient();

  // 최근 딜카드 5건 조회 (service role — RLS 없이 조회, 실제 서비스에서는 user session 기반)
  const { data: recentDeals } = await supabase
    .from("building_ssot_lite")
    .select(
      "id, area_signal, asset_type, price_band, matched_buyer_count, status, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(5);

  // 최근 매수자 의향서 3건 조회
  const { data: recentBuyers } = await supabase
    .from("buyer_intent_lite")
    .select(
      "id, buyer_type, budget_display, preferred_regions, purchase_purpose, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(3);

  const statusLabels: Record<string, { label: string; color: string }> = {
    active: { label: "활성", color: "bg-green-100 text-green-800" },
    draft: { label: "초안", color: "bg-amber-100 text-amber-800" },
    archived: { label: "보관", color: "bg-gray-100 text-gray-600" },
    pending: { label: "검토중", color: "bg-blue-100 text-blue-800" },
  };

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8">
      <div className="w-full max-w-md mx-auto space-y-8">
        {/* Greeting */}
        <div className="space-y-1 pt-4">
          <h1 className="text-2xl font-bold">{greeting}, 중개인님.</h1>
          <p className="text-sm text-muted-foreground">오늘 바로 만들기</p>
        </div>

        {/* Primary Actions */}
        <div className="space-y-3">
          <Link
            href="/broker/deal-card/new"
            className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-all hover:border-primary/40 active:scale-[0.98]"
            id="cta-new-deal-card"
          >
            <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-lg">
              📋
            </span>
            <div>
              <p className="text-sm font-semibold">카톡 매물 → 1분 딜카드</p>
              <p className="text-xs text-muted-foreground">
                매물 설명을 붙여넣으면 AI가 블라인드 딜카드를 바로 만들어드려요
              </p>
            </div>
          </Link>

          <Link
            href="/broker/buyer-intents/new"
            className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-all hover:border-primary/40 active:scale-[0.98]"
            id="cta-buyer-intent"
          >
            <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-lg">
              🎯
            </span>
            <div>
              <p className="text-sm font-semibold">매수자 조건 → 답장 문구</p>
              <p className="text-xs text-muted-foreground">
                매수자 조건을 정리하고 카카오 답장 문구를 바로 만들어요
              </p>
            </div>
          </Link>

          <Link
            href="/owner-readiness"
            className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-all hover:border-primary/40 active:scale-[0.98]"
            id="cta-owner-readiness"
          >
            <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-lg">
              📝
            </span>
            <div>
              <p className="text-sm font-semibold">건물주 상담 → 준비 메모</p>
              <p className="text-xs text-muted-foreground">
                건물주 매각 준비도를 확인하고 자료를 정리해드려요
              </p>
            </div>
          </Link>
        </div>

        {/* 최근 딜카드 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">최근 딜카드</h2>
            <Link
              href="/broker/deal-card/new"
              className="text-xs text-primary hover:underline"
            >
              + 새로 만들기
            </Link>
          </div>

          {recentDeals && recentDeals.length > 0 ? (
            <div className="space-y-2">
              {recentDeals.map((deal) => {
                const st = statusLabels[deal.status ?? "draft"] ?? statusLabels["draft"];
                const matchCount = deal.matched_buyer_count ?? 0;
                return (
                  <Link
                    key={deal.id}
                    href={`/broker/deal-card/${deal.id}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 active:scale-[0.98]"
                    id={`deal-card-item-${deal.id}`}
                  >
                    <span className="text-xl">🏢</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">
                          {deal.area_signal ?? "권역 미상"}{" "}
                          {deal.asset_type ?? ""}
                        </p>
                        <span
                          className={`shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium ${st.color}`}
                        >
                          {st.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <p className="text-xs text-muted-foreground">
                          {deal.price_band ?? "가격 미상"}
                        </p>
                        {matchCount > 0 && (
                          <span className="text-xs text-primary font-medium">
                            🎯 {matchCount}명 매칭
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {new Date(deal.created_at).toLocaleDateString("ko-KR", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                      <span className="text-xs text-muted-foreground">→</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-5 text-center">
              <p className="text-sm text-muted-foreground">
                아직 만든 딜카드가 없어요.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                카톡 매물 설명을 붙여넣으면
                <br />
                1분 만에 공유할 수 있는 딜카드를 만들어드려요.
              </p>
              <Link
                href="/broker/deal-card/new"
                className="inline-flex items-center justify-center mt-4 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                id="cta-first-deal-card"
              >
                첫 딜카드 만들기
              </Link>
            </div>
          )}
        </div>

        {/* 최근 매수자 의향서 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">등록된 매수자</h2>
            <Link
              href="/broker/buyer-intents"
              className="text-xs text-primary hover:underline"
            >
              전체 보기
            </Link>
          </div>

          {recentBuyers && recentBuyers.length > 0 ? (
            <div className="space-y-2">
              {recentBuyers.map((buyer) => {
                const regions = Array.isArray(buyer.preferred_regions)
                  ? (buyer.preferred_regions as string[]).slice(0, 2).join(", ")
                  : "미확인";
                return (
                  <Link
                    key={buyer.id}
                    href={`/broker/buyer-intents/${buyer.id}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 active:scale-[0.98]"
                    id={`buyer-item-${buyer.id}`}
                  >
                    <span className="text-xl">🎯</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {buyer.buyer_type || "매수자"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {buyer.budget_display ?? "예산 미확인"} · {regions}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">→</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
              <p className="text-sm text-muted-foreground">
                등록된 매수자 조건이 없어요.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

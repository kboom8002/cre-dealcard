import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "JS 1분 딜카드 | 중개인 전용",
  description: "카톡 매물 메모를 붙여넣으면 1분 안에 딜카드가 생성됩니다.",
};

/**
 * Broker hub page — mobile broker home focused on immediate creation tasks.
 * Source: docs/05-ui-ux-spec.md section 9
 */
export default function BrokerPage() {
  // Get time-based greeting
  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? "좋은 아침이에요"
      : hour < 18
        ? "좋은 오후예요"
        : "수고하셨어요";

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8">
      <div className="w-full max-w-md mx-auto space-y-8">
        {/* Greeting */}
        <div className="space-y-1 pt-4">
          <h1 className="text-2xl font-bold">
          {greeting}, 중개인님.
          </h1>
          <p className="text-sm text-muted-foreground">
            오늘 바로 만들기
          </p>
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

        {/* Recent Work */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            최근 작업
          </h2>
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
        </div>
      </div>
    </main>
  );
}

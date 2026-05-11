import Link from "next/link";

/**
 * Root page — landing page for JS Building SSoT MVP v0.1
 * Product name: 이 건물, 딜 될까?
 */
export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4 py-12">
      {/* Hero Section */}
      <div className="w-full max-w-md mx-auto text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            이 건물, 딜 될까?
          </h1>
          <p className="text-muted-foreground text-base">
            주소 하나, 메모 하나로
            <br />
            건물 딜 가능성을 확인하세요.
          </p>
        </div>

        {/* Primary CTA */}
        <Link
          href="/building-radar"
          className="inline-flex items-center justify-center w-full rounded-xl bg-primary px-6 py-4 text-lg font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 active:scale-[0.98]"
          id="cta-building-radar"
        >
          건물 딜 리포트 만들기
        </Link>

        {/* Secondary Actions */}
        <div className="grid grid-cols-1 gap-3 pt-4">
          <Link
            href="/broker"
            className="inline-flex items-center justify-center rounded-xl bg-secondary px-4 py-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
            id="cta-broker"
          >
            🏢 중개사 딜카드 만들기
          </Link>
          <Link
            href="/owner-readiness"
            className="inline-flex items-center justify-center rounded-xl bg-secondary px-4 py-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
            id="cta-owner-readiness"
          >
            📋 매각 준비도 체크
          </Link>
        </div>

        {/* Boundary Note */}
        <p className="text-xs text-muted-foreground pt-8 leading-relaxed">
          이 서비스는 예비 검토 자료를 생성합니다.
          <br />
          가격, 수익률, 법률, 세무, 대출 가능성을 확정하지 않습니다.
        </p>
      </div>
    </main>
  );
}

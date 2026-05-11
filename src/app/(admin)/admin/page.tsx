import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "관리자 콘솔 | JS Building SSoT",
  description: "전문가 노트, 게이트 요청, 분석 대시보드를 관리합니다.",
};

const ADMIN_SECTIONS = [
  {
    href: "/admin/analytics",
    emoji: "📊",
    title: "애널리틱스",
    desc: "핵심 이벤트 카운트, 전환율, 최근 활동",
    id: "link-admin-analytics",
  },
  {
    href: "/admin/gate-requests",
    emoji: "🔐",
    title: "Gate 요청 관리",
    desc: "G1/G2/G3 자료 요청 승인·거절",
    id: "link-admin-gate-requests",
  },
  {
    href: "/admin/expert-notes",
    emoji: "💡",
    title: "전문가 코멘트 요청",
    desc: "대기 중인 전문가 코멘트 요청 목록",
    id: "link-admin-expert-notes",
  },
];

export default function AdminPage() {
  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8">
      <div className="w-full max-w-md mx-auto space-y-6">
        <div className="space-y-1 pt-4">
          <h1 className="text-2xl font-bold">관리자 콘솔</h1>
          <p className="text-sm text-muted-foreground">
            Gate 요청, 전문가 코멘트, 이벤트 데이터를 관리합니다.
          </p>
        </div>

        <div className="space-y-3">
          {ADMIN_SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              id={section.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-all hover:border-primary/40 active:scale-[0.98]"
            >
              <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-lg shrink-0">
                {section.emoji}
              </span>
              <div>
                <p className="text-sm font-semibold">{section.title}</p>
                <p className="text-xs text-muted-foreground">{section.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        <div className="rounded-xl bg-secondary/50 border border-border px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            🔒 승인 전 보호 필드(주소, 임차 상세, 매도자 정보)는
            이 콘솔을 통해 자동으로 공개되지 않습니다.
          </p>
        </div>
      </div>
    </main>
  );
}

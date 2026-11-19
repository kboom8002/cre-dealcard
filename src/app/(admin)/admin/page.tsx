import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminRsc } from "@/lib/auth/require-admin-rsc";

export const metadata: Metadata = {
  title: { absolute: "관리자 콘솔 | 크리딜" },
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
    href: "/admin/pipeline",
    emoji: "🔍",
    title: "파이프라인 분석",
    desc: "미완료 거래 분석, 이탈 및 평균 체류일수",
    id: "link-admin-pipeline-analytics",
  },
  {
    href: "/admin/market",
    emoji: "📈",
    title: "시장 선행 지표",
    desc: "권역별 수요/공급 스냅샷 및 시세 저항선 분석",
    id: "link-admin-market-indicators",
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
  {
    href: "/admin/discrepancy-dashboard",
    emoji: "⚖️",
    title: "신/구 파이프라인 정합성 기준선",
    desc: "IM CORE v1 기준선 샘플 대조표",
    id: "link-admin-discrepancy-dashboard",
  },
];

export default async function AdminPage() {
  await requireAdminRsc();

  return (
    <main className="flex flex-col items-center min-h-screen bg-slate-50 text-slate-900 px-4 py-8">
      <div className="w-full max-w-md mx-auto space-y-6">
        <div className="space-y-1.5 pt-4">
          <h1 className="text-2xl font-bold text-slate-900">관리자 콘솔</h1>
          <p className="text-sm text-slate-600">
            Gate 요청, 전문가 코멘트, 이벤트 데이터를 관리합니다.
          </p>
        </div>

        <div className="space-y-3">
          {ADMIN_SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              id={section.id}
              className="flex min-h-[56px] items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-xs transition-all hover:border-blue-400 hover:bg-slate-50 active:scale-[0.98]"
            >
              <span className="flex items-center justify-center w-11 h-11 rounded-lg bg-blue-50 border border-blue-100 text-lg shrink-0">
                {section.emoji}
              </span>
              <div>
                <p className="text-base font-bold text-slate-900">{section.title}</p>
                <p className="text-sm text-slate-600">{section.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        <div className="rounded-xl bg-white border border-slate-200 px-4 py-3.5 shadow-xs">
          <p className="text-sm text-slate-700 leading-relaxed">
            🔒 승인 전 보호 필드(주소, 임차 상세, 매도자 정보)는
            이 콘솔을 통해 자동으로 공개되지 않습니다.
          </p>
        </div>
      </div>
    </main>
  );
}

import { Metadata } from "next";
import { CrossSystemFunnel } from "@/components/admin/cross-system-funnel";
import { requireAdminRsc } from "@/lib/auth/require-admin-rsc";

export const metadata: Metadata = {
  title: "크로스시스템 현황 | JS 1분 딜카드 어드민",
};

export default async function CrossSystemAdminPage() {
  await requireAdminRsc();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="container max-w-4xl mx-auto px-4 py-10 space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            크로스시스템 연계 현황
          </h1>
          <p className="text-sm sm:text-base text-slate-600 mt-2">
            MVP, Full IM Studio, Space AI Page 3개 시스템의 연계 데이터 흐름을 확인합니다.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <CrossSystemFunnel />
        </div>
      </div>
    </main>
  );
}

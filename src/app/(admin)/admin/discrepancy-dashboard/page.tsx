import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminRsc } from "@/lib/auth/require-admin-rsc";

export const metadata: Metadata = {
  title: "신/구 파이프라인 정합성 기준선 | 관리자",
  description: "레거시 파이프라인과 모던 IM CORE v1 정적 기준선 샘플 대조표",
};

interface DiscrepancyMetric {
  name: string;
  legacyVal: string;
  modernVal: string;
  diffPct: number;
  status: "MATCH" | "DISCREPANCY";
}

// 정적 기준선 검증용 샘플(Baseline Sample) 데이터 — 실시간 프로덕션 텔레메트리가 아님
const BASELINE_SAMPLE_METRICS: DiscrepancyMetric[] = [
  { name: "매매희망가 (asking_price)", legacyVal: "100억 원", modernVal: "100억 원", diffPct: 0.0, status: "MATCH" },
  { name: "대지면적 (land_area)", legacyVal: "330.5 ㎡", modernVal: "330.5 ㎡", diffPct: 0.0, status: "MATCH" },
  { name: "연면적 (gross_floor_area)", legacyVal: "990.2 ㎡", modernVal: "990.2 ㎡", diffPct: 0.0, status: "MATCH" },
  { name: "월임대료 총액 (monthly_rent)", legacyVal: "2,500만 원", modernVal: "2,500만 원", diffPct: 0.0, status: "MATCH" },
  { name: "공실률 (vacancy_rate)", legacyVal: "0.0%", modernVal: "0.0%", diffPct: 0.0, status: "MATCH" },
];

export default async function DiscrepancyDashboardPage() {
  await requireAdminRsc();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-sm font-semibold text-amber-900">
              <span>기준선 샘플(Baseline Sample)</span>
              <span>·</span>
              <span>정적 참조 지표</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              IM 파이프라인 신/구 기준선 정합성 대조표
            </h1>
            <p className="text-sm text-slate-600">
              레거시 파이프라인과 모던 IM CORE v1 간 허용 임계치(0.10%) 검증용 정적 기준선 샘플 지표입니다. (실시간 운영 텔레메트리 아님)
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex min-h-[44px] items-center px-3 text-sm font-semibold text-blue-700 hover:underline"
          >
            ← 관리자 콘솔
          </Link>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
            <p className="text-sm text-slate-600 font-semibold">기준선 샘플 실행 (예시)</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">1,248 건</p>
          </div>
          <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
            <p className="text-sm text-slate-600 font-semibold">기준선 정합 일치율 (샘플)</p>
            <p className="text-3xl font-bold text-emerald-700 mt-2">100.00%</p>
          </div>
          <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
            <p className="text-sm text-slate-600 font-semibold">허용 오차 초과 (샘플)</p>
            <p className="text-3xl font-bold text-emerald-700 mt-2">0 건</p>
          </div>
          <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
            <p className="text-sm text-slate-600 font-semibold">목표 P95 기준선 (참고)</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">412 ms</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-base text-slate-900">
              주요 제원 5대 지표 기준선 대조 (Baseline Sample)
            </h2>
            <span className="text-sm font-medium text-slate-600">
              정적 검증 픽스처 기준
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-100 text-sm text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">지표명</th>
                  <th className="px-4 py-3 font-semibold">구형(Legacy 샘플)</th>
                  <th className="px-4 py-3 font-semibold">신형(Modern CORE 샘플)</th>
                  <th className="px-4 py-3 font-semibold">편차율(%)</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {BASELINE_SAMPLE_METRICS.map((m) => (
                  <tr key={m.name} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{m.name}</td>
                    <td className="px-4 py-3 text-slate-700">{m.legacyVal}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{m.modernVal}</td>
                    <td className="px-4 py-3 text-slate-700">{m.diffPct.toFixed(2)}%</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded text-sm font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

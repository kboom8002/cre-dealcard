import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminRsc } from "@/lib/auth/require-admin-rsc";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "전문가 코멘트 요청 목록 | 관리자",
  description: "관리자용 전문가 코멘트 요청 현황",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  requested: { label: "요청됨", color: "bg-blue-50 text-blue-800 border border-blue-200" },
  in_review: { label: "검토 중", color: "bg-amber-50 text-amber-800 border border-amber-200" },
  completed: { label: "완료", color: "bg-emerald-50 text-emerald-800 border border-emerald-200" },
  cancelled: { label: "취소됨", color: "bg-slate-100 text-slate-700 border border-slate-200" },
};

const GOAL_LABELS: Record<string, string> = {
  my_building: "내 건물 매각",
  buy_consideration: "매입 검토",
  client_listing: "중개 매물",
  client_recommendation: "매수자 추천",
  learning: "공부",
};

type ExpertNoteRow = {
  id: string;
  user_goal: string | null;
  contact: Record<string, string>;
  status: string;
  created_at: string;
  building_id: string | null;
};

export default async function AdminExpertNotesPage() {
  await requireAdminRsc();

  let requests: ExpertNoteRow[] = [];
  let missingServiceKey = false;
  let loadFailed = false;

  try {
    const supabase = createServiceClient();
    const result = await supabase
      .from("expert_note_requests")
      .select("id, user_goal, contact, status, created_at, building_id")
      .order("created_at", { ascending: false })
      .limit(50);

    if (result.error) {
      if (result.error.message.includes("supabaseKey")) {
        missingServiceKey = true;
      } else {
        loadFailed = true;
      }
    } else {
      requests = (result.data ?? []) as ExpertNoteRow[];
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("supabaseKey")) {
      missingServiceKey = true;
    } else {
      loadFailed = true;
    }
  }

  const total = requests.length;
  const pending = requests.filter((r) => r.status === "requested").length;
  const inReview = requests.filter((r) => r.status === "in_review").length;

  return (
    <main className="flex flex-col items-center min-h-screen bg-slate-50 text-slate-900 px-4 py-8">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        <div className="space-y-1.5 pt-4">
          <h1 className="text-2xl font-bold text-slate-900">전문가 코멘트 요청</h1>
          <p className="text-sm text-slate-600">관리자 전용 리뷰 큐</p>
        </div>

        {missingServiceKey && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
            ⚠️ SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. 환경변수 설정 후 목록이 표시됩니다.
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "전체", value: total, color: "text-slate-900" },
            { label: "대기", value: pending, color: "text-blue-700" },
            { label: "검토 중", value: inReview, color: "text-amber-800" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-xs"
            >
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-sm font-medium text-slate-600 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {loadFailed ? (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-medium text-rose-800">
            요청 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </div>
        ) : requests.length > 0 ? (
          <div className="space-y-3">
            {requests.map((req) => {
              const contact = req.contact ?? {};
              const statusInfo =
                STATUS_LABELS[req.status] ?? STATUS_LABELS.requested;
              return (
                <div
                  key={req.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-sm font-semibold ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                        <span className="text-sm text-slate-600 font-medium">
                          {GOAL_LABELS[req.user_goal ?? ""] || req.user_goal}
                        </span>
                      </div>
                      <p className="text-base font-semibold text-slate-900 truncate">
                        {contact.name || "이름 없음"}{" "}
                        {contact.phone && (
                          <span className="text-slate-600 font-normal">
                            · {contact.phone}
                          </span>
                        )}
                      </p>
                      {contact.email && (
                        <p className="text-sm text-slate-600">
                          {contact.email}
                        </p>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 whitespace-nowrap shrink-0">
                      {new Date(req.created_at).toLocaleDateString("ko-KR")}
                    </p>
                  </div>
                  {req.building_id && (
                    <p className="text-sm text-slate-600 truncate">
                      건물: {req.building_id.slice(0, 12)}...
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xs">
            <p className="text-sm text-slate-600">
              {missingServiceKey
                ? "서비스 키 설정 후 요청 목록이 표시됩니다."
                : "아직 전문가 코멘트 요청이 없습니다."}
            </p>
          </div>
        )}

        <div className="flex justify-center">
          <Link
            href="/admin"
            className="inline-flex min-h-[44px] items-center px-3 text-sm font-semibold text-blue-700 hover:underline"
            id="link-admin-home"
          >
            ← 관리자 홈으로
          </Link>
        </div>
      </div>
    </main>
  );
}

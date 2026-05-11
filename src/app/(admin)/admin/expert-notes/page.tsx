import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";

export const metadata: Metadata = {
  title: "전문가 코멘트 요청 목록 | 관리자",
  description: "관리자용 전문가 코멘트 요청 현황",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  requested: { label: "요청됨", color: "bg-blue-100 text-blue-800" },
  in_review: { label: "검토 중", color: "bg-amber-100 text-amber-800" },
  completed: { label: "완료", color: "bg-green-100 text-green-800" },
  cancelled: { label: "취소됨", color: "bg-gray-100 text-gray-600" },
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
  let requests: ExpertNoteRow[] = [];
  let errorMsg: string | null = null;

  try {
    const supabase = createServiceClient();
    const result = await supabase
      .from("expert_note_requests")
      .select("id, user_goal, contact, status, created_at, building_id")
      .order("created_at", { ascending: false })
      .limit(50);

    if (result.error) {
      errorMsg = result.error.message;
    } else {
      requests = (result.data ?? []) as ExpertNoteRow[];
    }
  } catch (e) {
    errorMsg =
      e instanceof Error
        ? e.message
        : "서비스 키가 설정되지 않았습니다. SUPABASE_SERVICE_ROLE_KEY를 .env.local에 추가해주세요.";
  }

  const total = requests.length;
  const pending = requests.filter((r) => r.status === "requested").length;
  const inReview = requests.filter((r) => r.status === "in_review").length;

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-1 pt-4">
          <h1 className="text-2xl font-bold">전문가 코멘트 요청</h1>
          <p className="text-sm text-muted-foreground">관리자 전용 리뷰 큐</p>
        </div>

        {/* Config warning when service key is missing */}
        {errorMsg && errorMsg.includes("supabaseKey") && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            ⚠️ SUPABASE_SERVICE_ROLE_KEY가 .env.local에 설정되지 않았습니다.
            Supabase 대시보드에서 키를 복사해 추가해주세요.
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "전체", value: total, color: "text-foreground" },
            { label: "대기", value: pending, color: "text-blue-600" },
            { label: "검토 중", value: inReview, color: "text-amber-600" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-border bg-card p-4 text-center"
            >
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Request List */}
        {errorMsg && !errorMsg.includes("supabaseKey") ? (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            요청 목록을 불러오지 못했습니다: {errorMsg}
          </div>
        ) : requests.length > 0 ? (
          <div className="space-y-3">
            {requests.map((req) => {
              const contact = req.contact;
              const statusInfo =
                STATUS_LABELS[req.status] ?? STATUS_LABELS.requested;
              return (
                <div
                  key={req.id}
                  className="rounded-xl border border-border bg-card p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {GOAL_LABELS[req.user_goal ?? ""] || req.user_goal}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate">
                        {contact.name || "이름 없음"}{" "}
                        {contact.phone && (
                          <span className="text-muted-foreground font-normal">
                            · {contact.phone}
                          </span>
                        )}
                      </p>
                      {contact.email && (
                        <p className="text-xs text-muted-foreground">
                          {contact.email}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {new Date(req.created_at).toLocaleDateString("ko-KR")}
                    </p>
                  </div>
                  {req.building_id && (
                    <p className="text-xs text-muted-foreground truncate">
                      건물: {req.building_id.slice(0, 12)}...
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {errorMsg
                ? "서비스 키 설정 후 요청 목록이 표시됩니다."
                : "아직 전문가 코멘트 요청이 없습니다."}
            </p>
          </div>
        )}

        <div className="flex justify-center">
          <Link
            href="/admin"
            className="text-sm text-primary hover:underline"
            id="link-admin-home"
          >
            ← 관리자 홈으로
          </Link>
        </div>
      </div>
    </main>
  );
}

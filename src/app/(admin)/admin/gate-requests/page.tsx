import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { GateStatusBadge } from "@/components/gate/gate-status-badge";
import { GateLevelBadge } from "@/components/gate/gate-level-badge";
import { GateReviewButtons } from "./gate-review-buttons";

export const metadata: Metadata = {
  title: "Gate 요청 목록 | 관리자",
  description: "관리자용 Gate 요청 검토 큐",
};

type GateRow = {
  id: string;
  building_id: string;
  requested_level: string;
  requested_fields: string[];
  reason: string | null;
  status: string;
  requester_id: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const FIELD_LABELS: Record<string, string> = {
  broker_contact_request: "중개인 연결",
  lease_summary_request: "임대차 요약",
  exact_address_request: "정확한 주소",
  snapshot_request: "Snapshot",
  im_lite_request: "IM Lite",
  site_tour_request: "현장 방문",
};

export default async function AdminGateRequestsPage() {
  let requests: GateRow[] = [];
  let errorMsg: string | null = null;

  try {
    const supabase = createServiceClient();
    const result = await supabase
      .from("gate_requests")
      .select(
        "id, building_id, requested_level, requested_fields, reason, status, requester_id, reviewed_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (result.error) {
      errorMsg = result.error.message;
    } else {
      requests = (result.data ?? []) as GateRow[];
    }
  } catch (e) {
    errorMsg =
      e instanceof Error ? e.message : "SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.";
  }

  const total = requests.length;
  const pending = requests.filter((r) => r.status === "submitted").length;
  const approved = requests.filter((r) => r.status === "approved").length;
  const rejected = requests.filter((r) => r.status === "rejected").length;

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-2xl font-bold">Gate 요청 관리</h1>
            <p className="text-sm text-muted-foreground">
              승인 전 보호 필드는 절대 노출되지 않습니다.
            </p>
          </div>
        </div>

        {/* Config warning */}
        {errorMsg && errorMsg.includes("supabase") && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            ⚠️ SUPABASE_SERVICE_ROLE_KEY가 .env.local에 설정되지 않았습니다.
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "전체", value: total, color: "text-foreground" },
            { label: "대기", value: pending, color: "text-blue-600" },
            { label: "승인", value: approved, color: "text-green-600" },
            { label: "거절", value: rejected, color: "text-red-600" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-border bg-card p-3 text-center"
            >
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Disclosure Policy Note */}
        <div className="rounded-xl bg-secondary/50 border border-border px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            🔒 <span className="font-medium">보호 필드 정책:</span>{" "}
            승인 처리는 상태 변경과 다음 안내만 제공합니다.
            정확한 주소, 임차인명, 호실별 임대료, 매도자 정보는
            이 화면을 통해 요청자에게 자동으로 공개되지 않습니다.
          </p>
        </div>

        {/* Requests */}
        {errorMsg && !errorMsg.includes("supabase") ? (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            데이터를 불러오지 못했습니다: {errorMsg}
          </div>
        ) : requests.length > 0 ? (
          <div className="space-y-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="rounded-xl border border-border bg-card p-4 space-y-3"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <GateStatusBadge status={req.status} />
                      <GateLevelBadge level={req.requested_level} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      건물: {req.building_id.slice(0, 16)}...
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {new Date(req.created_at).toLocaleDateString("ko-KR")}
                  </p>
                </div>

                {/* Requested fields */}
                {req.requested_fields.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {req.requested_fields.map((f) => (
                      <span
                        key={f}
                        className="text-xs bg-secondary rounded-md px-2 py-0.5 text-muted-foreground"
                      >
                        {FIELD_LABELS[f] || f}
                      </span>
                    ))}
                  </div>
                )}

                {/* Reason */}
                {req.reason && (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">이유: </span>
                    {req.reason}
                  </p>
                )}

                {/* Review buttons — only for pending states */}
                {(req.status === "submitted" ||
                  req.status === "broker_review") && (
                  <GateReviewButtons gateRequestId={req.id} />
                )}

                {/* Reviewed info */}
                {req.reviewed_at && (
                  <p className="text-xs text-muted-foreground">
                    검토 완료:{" "}
                    {new Date(req.reviewed_at).toLocaleDateString("ko-KR")}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {errorMsg
                ? "서비스 키 설정 후 요청 목록이 표시됩니다."
                : "아직 Gate 요청이 없습니다."}
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

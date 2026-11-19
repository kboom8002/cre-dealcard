import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminRsc } from "@/lib/auth/require-admin-rsc";
import { createServiceClient } from "@/lib/supabase/service";
import { GateStatusBadge } from "@/components/gate/gate-status-badge";
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
  broker_contact_request: "공인중개사 연결",
  lease_summary_request: "임대차 요약",
  exact_address_request: "정확한 주소",
  snapshot_request: "Snapshot",
  im_lite_request: "IM Lite",
  site_tour_request: "현장 방문",
};

const LEVEL_STYLES: Record<string, { label: string; sublabel: string; cls: string }> = {
  G1: { label: "G1", sublabel: "등록 관심", cls: "bg-blue-50 text-blue-800 border-blue-200" },
  G2: { label: "G2", sublabel: "자격 요약", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  G3: { label: "G3", sublabel: "Snapshot / IM Lite", cls: "bg-rose-50 text-rose-800 border-rose-200" },
};

export default async function AdminGateRequestsPage() {
  await requireAdminRsc();

  let requests: GateRow[] = [];
  let missingServiceKey = false;
  let loadFailed = false;

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
      if (result.error.message.includes("supabase")) {
        missingServiceKey = true;
      } else {
        loadFailed = true;
      }
    } else {
      requests = (result.data ?? []) as GateRow[];
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("supabase")) {
      missingServiceKey = true;
    } else {
      loadFailed = true;
    }
  }

  const total = requests.length;
  const pending = requests.filter((r) => r.status === "submitted").length;
  const approved = requests.filter((r) => r.status === "approved").length;
  const rejected = requests.filter((r) => r.status === "rejected").length;

  return (
    <main className="flex flex-col items-center min-h-screen bg-slate-50 text-slate-900 px-4 py-8">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Gate 요청 관리</h1>
            <p className="text-sm text-slate-600 mt-0.5">
              승인 전 보호 필드는 절대 노출되지 않습니다.
            </p>
          </div>
        </div>

        {missingServiceKey && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
            ⚠️ SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "전체", value: total, color: "text-slate-900" },
            { label: "대기", value: pending, color: "text-blue-700" },
            { label: "승인", value: approved, color: "text-emerald-700" },
            { label: "거절", value: rejected, color: "text-rose-700" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-slate-200 bg-white p-3.5 text-center shadow-xs"
            >
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-sm font-medium text-slate-600 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-white border border-slate-200 px-4 py-3.5 shadow-xs">
          <p className="text-sm text-slate-700 leading-relaxed">
            🔒 <span className="font-semibold text-slate-900">보호 필드 정책:</span>{" "}
            승인 처리는 상태 변경과 다음 안내만 제공합니다.
            정확한 주소, 임차인명, 호실별 임대료, 매도자 정보는
            이 화면을 통해 요청자에게 자동으로 공개되지 않습니다.
          </p>
        </div>

        {loadFailed ? (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-medium text-rose-800">
            데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </div>
        ) : requests.length > 0 ? (
          <div className="space-y-3">
            {requests.map((req) => {
              const levelCfg = LEVEL_STYLES[req.requested_level] ?? {
                label: req.requested_level,
                sublabel: "",
                cls: "bg-slate-100 text-slate-700 border-slate-200",
              };
              return (
                <div
                  key={req.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <GateStatusBadge status={req.status} size="md" />
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm font-semibold ${levelCfg.cls}`}
                        >
                          {levelCfg.label}
                          {levelCfg.sublabel && (
                            <span className="font-normal opacity-90">· {levelCfg.sublabel}</span>
                          )}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 truncate">
                        건물: {req.building_id.slice(0, 16)}...
                      </p>
                    </div>
                    <p className="text-sm text-slate-600 whitespace-nowrap shrink-0">
                      {new Date(req.created_at).toLocaleDateString("ko-KR")}
                    </p>
                  </div>

                  {req.requested_fields.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {req.requested_fields.map((f) => (
                        <span
                          key={f}
                          className="text-sm bg-slate-100 border border-slate-200 rounded-md px-2.5 py-0.5 text-slate-700"
                        >
                          {FIELD_LABELS[f] || f}
                        </span>
                      ))}
                    </div>
                  )}

                  {req.reason && (
                    <p className="text-sm text-slate-700">
                      <span className="font-semibold text-slate-900">이유: </span>
                      {req.reason}
                    </p>
                  )}

                  {(req.status === "submitted" ||
                    req.status === "broker_review") && (
                    <GateReviewButtons gateRequestId={req.id} />
                  )}

                  {req.reviewed_at && (
                    <p className="text-sm text-slate-600">
                      검토 완료:{" "}
                      {new Date(req.reviewed_at).toLocaleDateString("ko-KR")}
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
                : "아직 Gate 요청이 없습니다."}
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

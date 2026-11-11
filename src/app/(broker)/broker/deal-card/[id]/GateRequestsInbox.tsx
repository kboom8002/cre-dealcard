"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { GateLevelBadge } from "@/components/gate/gate-level-badge";
import { GateStatusBadge } from "@/components/gate/gate-status-badge";
import { parseGateReasonDisplay } from "@/components/broker/GateRequestsInbox";
import { copyText } from "@/lib/ux/clipboard";

interface GateRequest {
  id: string;
  building_id: string;
  requester_id: string | null;
  requested_level: "G1" | "G2" | "G3";
  requested_fields: string[];
  reason: string | null;
  status: "submitted" | "broker_review" | "approved" | "rejected" | "expired";
  shareUrl?: string | null;
  created_at: string;
}

export function GateRequestsInbox({ buildingId }: { buildingId: string }) {
  const [requests, setRequests] = useState<GateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function fetchRequests() {
      try {
        const { data, error: fetchErr } = await supabase
          .from("gate_requests")
          .select("*")
          .eq("building_id", buildingId)
          .order("created_at", { ascending: false });

        if (fetchErr) throw fetchErr;
        setRequests(data || []);
      } catch {
        setError("요청 목록을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }
    fetchRequests();
  }, [buildingId]);

  async function handleStatusUpdate(
    reqItem: GateRequest,
    decision: "approve" | "reject"
  ) {
    if (busyId) return;
    setBusyId(reqItem.id);
    try {
      const res = await fetch("/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: decision === "approve" ? "approve_gate" : "reject_gate",
          threadId: reqItem.id,
          buildingId: reqItem.building_id || buildingId,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || "상태 업데이트에 실패했습니다.");
        return;
      }

      const nextStatus = decision === "approve" ? "approved" : "rejected";
      const shareUrl =
        typeof json.shareUrl === "string" && json.shareUrl
          ? json.shareUrl
          : `/im-lite/${encodeURIComponent(reqItem.building_id || buildingId)}`;

      setRequests((prev) =>
        prev.map((req) =>
          req.id === reqItem.id ? { ...req, status: nextStatus, shareUrl } : req
        )
      );

      if (decision === "approve") {
        const fullUrl =
          typeof window !== "undefined" && shareUrl.startsWith("/")
            ? `${window.location.origin}${shareUrl}`
            : shareUrl;
        const ok = await copyText(fullUrl);
        toast.success(
          ok
            ? "승인이 완료되어 서명된 전용 IM 링크가 복사되었습니다."
            : "승인이 완료되었습니다. 아래 복사 버튼으로 링크를 전달하세요."
        );
      } else {
        toast.success("열람 요청을 거절했습니다.");
      }
    } catch {
      toast.error("네트워크 오류로 상태 업데이트에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCopyIMLink(reqItem: GateRequest) {
    const pathUrl =
      reqItem.shareUrl ||
      `/im-lite/${encodeURIComponent(reqItem.building_id || buildingId)}`;
    const imUrl =
      typeof window !== "undefined" && pathUrl.startsWith("/")
        ? `${window.location.origin}${pathUrl}`
        : pathUrl;
    const ok = await copyText(imUrl);
    if (ok) {
      toast.success("모바일 IM 전용 링크가 복사되었습니다. 매수자에게 전달하세요.");
    } else {
      toast.error("복사에 실패했습니다. 브라우저 권한을 확인해 주세요.");
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground p-5">요청 목록을 불러오는 중...</div>;
  }

  if (error) {
    return <div className="text-sm text-destructive p-5">{error}</div>;
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-center space-y-2">
        <h3 className="text-sm font-semibold">아직 접수된 자료 요청이 없습니다</h3>
        <p className="text-sm text-muted-foreground">매수자가 자료를 요청하면 여기에 표시됩니다.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h2 className="text-base font-semibold flex items-center gap-2">
        <span aria-hidden>📥</span> 자료 요청 소통함
      </h2>
      <div className="space-y-3">
        {requests.map((req) => {
          const parsed = parseGateReasonDisplay({
            id: req.id,
            building_id: req.building_id,
            reason: req.reason,
            status:
              req.status === "approved"
                ? "approved"
                : req.status === "rejected"
                ? "rejected"
                : "pending",
            created_at: req.created_at,
          });

          return (
            <div key={req.id} className="border border-border rounded-lg p-3.5 space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <GateStatusBadge status={req.status} />
                    <GateLevelBadge level={req.requested_level} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(req.created_at).toLocaleString("ko-KR")}
                  </p>
                </div>
              </div>

              <div className="bg-muted/50 rounded p-2.5 text-sm text-foreground space-y-1">
                <p>
                  <span className="font-semibold">요청자:</span> {parsed.requesterName}
                  {parsed.requesterCompany ? ` (${parsed.requesterCompany})` : ""}
                </p>
                {parsed.requesterPhone && (
                  <p>
                    <span className="font-semibold">연락처:</span> {parsed.requesterPhone}
                  </p>
                )}
                <p>
                  <span className="font-semibold">요청 사유:</span> {parsed.cleanMessage}
                </p>
              </div>

              {(req.status === "submitted" || req.status === "broker_review") && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busyId === req.id}
                    onClick={() => handleStatusUpdate(req, "approve")}
                    className="flex-1 min-h-[44px] bg-primary text-primary-foreground py-2 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
                  >
                    IM 열람 승인
                  </button>
                  <button
                    type="button"
                    disabled={busyId === req.id}
                    onClick={() => handleStatusUpdate(req, "reject")}
                    className="flex-1 min-h-[44px] border border-border text-foreground py-2 rounded-md text-sm font-semibold hover:bg-muted disabled:opacity-50"
                  >
                    거절
                  </button>
                </div>
              )}

              {req.status === "approved" && (
                <div className="flex flex-col gap-2 pt-1">
                  <p className="text-sm text-green-600 dark:text-green-400 font-semibold">
                    열람이 승인되었습니다. 매수자에게 전용 모바일 IM 링크를 전달하세요.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleCopyIMLink(req)}
                    className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-md text-sm font-bold shadow-sm transition-colors"
                  >
                    모바일 IM 링크 복사
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

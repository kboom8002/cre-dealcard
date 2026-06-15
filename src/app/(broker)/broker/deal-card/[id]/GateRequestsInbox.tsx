"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GateLevelBadge } from "@/components/gate/gate-level-badge";
import { GateStatusBadge } from "@/components/gate/gate-status-badge";

interface GateRequest {
  id: string;
  building_id: string;
  requester_id: string | null;
  requested_level: "G1" | "G2" | "G3";
  requested_fields: string[];
  reason: string | null;
  status: "submitted" | "broker_review" | "approved" | "rejected" | "expired";
  created_at: string;
}

export function GateRequestsInbox({ buildingId }: { buildingId: string }) {
  const [requests, setRequests] = useState<GateRequest[]>([]);
  const [loading, setLoading] = useState(true);
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
      } catch (err) {
        setError("요청 목록을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }
    fetchRequests();
  }, [buildingId]);

  async function handleStatusUpdate(id: string, newStatus: "approved" | "rejected") {
    try {
      const { error: updateErr } = await supabase
        .from("gate_requests")
        .update({ status: newStatus })
        .eq("id", id);
      
      if (updateErr) throw updateErr;

      setRequests((prev) =>
        prev.map((req) => (req.id === id ? { ...req, status: newStatus } : req))
      );
    } catch (err) {
      alert("상태 업데이트에 실패했습니다.");
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
        <p className="text-xs text-muted-foreground">매수자가 자료를 요청하면 여기에 표시됩니다.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h2 className="text-base font-semibold flex items-center gap-2">
        <span>📥</span> 자료 요청 인박스
      </h2>
      <div className="space-y-3">
        {requests.map((req) => (
          <div key={req.id} className="border border-border rounded-lg p-3 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <GateStatusBadge status={req.status} />
                  <GateLevelBadge level={req.requested_level} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(req.created_at).toLocaleString("ko-KR")}
                </p>
              </div>
            </div>
            
            {req.reason && (
              <div className="bg-muted/50 rounded p-2 text-sm text-foreground">
                <span className="font-medium">요청 사유:</span> {req.reason}
              </div>
            )}
            
            {(req.status === "submitted" || req.status === "broker_review") && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleStatusUpdate(req.id, "approved")}
                  className="flex-1 bg-primary text-primary-foreground py-1.5 rounded-md text-xs font-semibold hover:bg-primary/90"
                >
                  승인
                </button>
                <button
                  onClick={() => handleStatusUpdate(req.id, "rejected")}
                  className="flex-1 border border-border text-foreground py-1.5 rounded-md text-xs font-semibold hover:bg-muted"
                >
                  거절
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

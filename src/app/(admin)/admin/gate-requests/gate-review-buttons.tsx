"use client";

import { useState } from "react";

interface GateReviewButtonsProps {
  gateRequestId: string;
}

export function GateReviewButtons({ gateRequestId }: GateReviewButtonsProps) {
  const [status, setStatus] = useState<
    "idle" | "loading" | "approved" | "rejected" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleReview(decision: "approved" | "rejected") {
    setStatus("loading");
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/gate-requests/${gateRequestId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || "처리에 실패했습니다.");

      setStatus(decision);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "오류가 발생했습니다.");
      setStatus("error");
    }
  }

  if (status === "approved") {
    return (
      <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
        ✅ 승인 처리됐습니다. 요청자에게 다음 안내가 전달됩니다.
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
        ❌ 거절 처리됐습니다.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {status === "error" && errorMsg && (
        <p className="text-xs text-destructive">{errorMsg}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => handleReview("approved")}
          disabled={status === "loading"}
          className="flex-1 rounded-lg bg-green-600 text-white px-3 py-2 text-xs font-semibold transition-colors hover:bg-green-700 disabled:opacity-50"
          id={`btn-approve-${gateRequestId}`}
        >
          {status === "loading" ? "처리 중..." : "승인"}
        </button>
        <button
          onClick={() => handleReview("rejected")}
          disabled={status === "loading"}
          className="flex-1 rounded-lg bg-red-50 text-red-600 border border-red-200 px-3 py-2 text-xs font-semibold transition-colors hover:bg-red-100 disabled:opacity-50"
          id={`btn-reject-${gateRequestId}`}
        >
          {status === "loading" ? "처리 중..." : "거절"}
        </button>
      </div>
    </div>
  );
}

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
      if (!json.ok) {
        const msg =
          json.error?.message ||
          (typeof json.error === "string" ? json.error : null) ||
          json.message ||
          "처리에 실패했습니다.";
        throw new Error(msg);
      }

      setStatus(decision);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "오류가 발생했습니다.");
      setStatus("error");
    }
  }

  if (status === "approved") {
    return (
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-800">
        ✅ 승인 처리됐습니다. 요청자에게 다음 안내가 전달됩니다.
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="rounded-lg bg-slate-100 border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
        ❌ 거절 처리됐습니다.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {status === "error" && errorMsg && (
        <p className="text-sm font-medium text-rose-700">{errorMsg}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleReview("approved")}
          disabled={status === "loading"}
          className="flex-1 min-h-[44px] rounded-lg bg-emerald-700 text-white px-3 py-2 text-sm font-semibold transition-colors hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
          id={`btn-approve-${gateRequestId}`}
        >
          {status === "loading" ? "처리 중..." : "승인"}
        </button>
        <button
          type="button"
          onClick={() => handleReview("rejected")}
          disabled={status === "loading"}
          className="flex-1 min-h-[44px] rounded-lg bg-rose-50 text-rose-700 border border-rose-200 px-3 py-2 text-sm font-semibold transition-colors hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
          id={`btn-reject-${gateRequestId}`}
        >
          {status === "loading" ? "처리 중..." : "거절"}
        </button>
      </div>
    </div>
  );
}

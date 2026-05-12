"use client";

import { useState } from "react";

interface FullIMHandoffButtonProps {
  buildingId: string;
  documentId?: string;
}

export function FullIMHandoffButton({ buildingId, documentId }: FullIMHandoffButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);

    try {
      const res = await fetch("/api/full-im-handoffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_building_ssot_lite_id: buildingId,
          source_document_ids: documentId ? [documentId] : [],
          requested_output: "buyer_ready_full_im",
          package_intent: "ai_expert_review",
          full_im_studio_base_url:
            process.env.NEXT_PUBLIC_FULLIM_URL ?? "https://cre-fullim.vercel.app",
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        alert(json?.error?.message ?? "핸드오프 생성에 실패했습니다.");
        return;
      }

      const token: string = json.data?.handoff_token;
      const fullImUrl =
        process.env.NEXT_PUBLIC_FULLIM_URL ?? "https://cre-fullim.vercel.app";

      // 토큰을 쿼리스트링으로 전달해 import 페이지 자동 입력 (새 탭)
      window.open(`${fullImUrl}/im-projects/import?token=${token}`, "_blank");
    } catch (err) {
      console.error("[FullIMHandoffButton]", err);
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      id="cta-full-im-handoff"
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center justify-center w-full rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 shadow-lg shadow-blue-900/30"
    >
      {loading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          핸드오프 생성 중…
        </>
      ) : (
        <>📄 Full IM Studio에서 투자각서 만들기</>
      )}
    </button>
  );
}

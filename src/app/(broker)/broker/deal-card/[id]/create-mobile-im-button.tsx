"use client";

import { useState } from "react";
import { createMobileIMAction } from "./actions";

export function CreateMobileImButton({ buildingId }: { buildingId: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      onClick={async () => {
        setLoading(true);
        try {
          await createMobileIMAction(buildingId);
        } catch (e) {
          alert("생성 중 오류가 발생했습니다.");
          setLoading(false);
        }
      }}
      disabled={loading}
      className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 w-full mt-3 shadow-md"
      id="cta-mobile-im"
    >
      {loading ? "모바일 투자설명서 만드는 중..." : "📱 모바일 투자설명서 만들기 (약 3분)"}
    </button>
  );
}

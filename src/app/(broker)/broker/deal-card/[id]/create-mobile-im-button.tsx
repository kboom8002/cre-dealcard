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
        } catch {
          alert("모바일 투자설명서 생성 중 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요.");
          setLoading(false);
        }
      }}
      disabled={loading}
      className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] w-full shadow-md shadow-blue-900/30 disabled:opacity-60"
      id="cta-mobile-im"
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          모바일 투자설명서 생성 중… (약 30초)
        </span>
      ) : (
        "📱 모바일 투자설명서 만들기 (약 3분)"
      )}
    </button>
  );
}

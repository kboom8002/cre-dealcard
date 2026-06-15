"use client";

import { useState } from "react";
import { createMobileIMAction } from "./actions";

interface CreateMobileImButtonProps {
  buildingId: string;
  // v2: 딜카드에서 직접 전달하는 데이터 (무마찰)
  areaSignal?: string;
  assetType?: string;
  priceBand?: string;
  sizeSignal?: string;
  vacancySignal?: string;
  fitSummary?: string;
  cautionSummary?: string;
}

type ButtonState = "idle" | "loading" | "success" | "error";

export function CreateMobileImButton({
  buildingId,
  areaSignal,
  assetType,
  priceBand,
  sizeSignal,
  vacancySignal,
  fitSummary,
  cautionSummary,
}: CreateMobileImButtonProps) {
  const [state, setState] = useState<ButtonState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState("");

  async function handleCreate() {
    setState("loading");
    setProgress("딜카드 정보 수집 중...");

    try {
      // 딜카드에서 보유한 데이터를 직접 전달 (DB 재조회 불필요)
      const directData: Record<string, unknown> = {};
      if (areaSignal) directData.area_signal = areaSignal;
      if (assetType) directData.asset_type = assetType;
      if (priceBand) directData.price_band = priceBand;
      if (sizeSignal) directData.size_signal = sizeSignal;
      if (fitSummary) directData.fit_summary = fitSummary;
      if (cautionSummary) directData.caution_summary = cautionSummary;

      setProgress("AI 투자설명서 생성 중... (약 15~30초)");

      const res = await createMobileIMAction(buildingId, {
        vacancy_status: vacancySignal,
        direct_data: Object.keys(directData).length > 0 ? directData : undefined,
      });

      if (res.success && res.url) {
        setState("success");
        setProgress(`✅ ${res.sections_count ?? 7}섹션 생성 완료!`);
        // 1.5초 후 이동
        setTimeout(() => {
          window.location.href = res.reviewUrl ?? res.url!;
        }, 1500);
      } else {
        setState("error");
        setErrorMsg(res.error ?? "알 수 없는 오류");
        setProgress("");
      }
    } catch (err: any) {
      setState("error");
      setErrorMsg(err?.message ?? "서버 요청 실패");
      setProgress("");
    }
  }

  if (state === "success") {
    return (
      <button
        disabled
        className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white w-full"
        id="cta-mobile-im"
      >
        <span className="flex items-center gap-2">
          ✅ 투자설명서 생성 완료! 이동 중...
        </span>
      </button>
    );
  }

  if (state === "error") {
    return (
      <div className="space-y-1.5">
        <button
          onClick={handleCreate}
          className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] w-full shadow-md shadow-blue-900/30"
          id="cta-mobile-im"
        >
          🔄 다시 시도
        </button>
        <p className="text-[10px] text-rose-400 text-center px-2 leading-relaxed">
          ⚠️ {errorMsg}
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={handleCreate}
      disabled={state === "loading"}
      className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] w-full shadow-md shadow-blue-900/30 disabled:opacity-60"
      id="cta-mobile-im"
    >
      {state === "loading" ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {progress}
        </span>
      ) : (
        "📱 모바일 투자설명서 만들기"
      )}
    </button>
  );
}

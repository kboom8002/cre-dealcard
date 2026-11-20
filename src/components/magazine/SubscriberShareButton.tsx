"use client";

import React, { useState } from "react";
import { Share2, Check } from "lucide-react";
import { copyText, COPY_FAILED_MESSAGE } from "@/lib/ux/clipboard";
import { resolvePublicBaseUrl } from "@/lib/magazine/share-urls";

export interface SubscriberShareButtonProps {
  brokerId: string;
  brokerName?: string | null;
  date?: string;
  preview?: boolean;
}

/**
 * 기구독자 전용 소형 공유 버튼 (Q3-2 확정안):
 * - 구독 신청 폼은 숨기고, 지인 카톡 전달용 작은 공유 버튼 1개만 제공.
 */
export function SubscriberShareButton({
  brokerId,
  brokerName,
  date,
  preview = false,
}: SubscriberShareButtonProps) {
  const [statusMsg, setStatusMsg] = useState<string>("");

  const handleShare = async () => {
    if (preview || typeof window === "undefined") return;
    const base = resolvePublicBaseUrl(null) ?? window.location.origin;
    const url = date
      ? `${base}/magazine/${encodeURIComponent(brokerId)}/${encodeURIComponent(date)}`
      : window.location.href;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `[${brokerName?.trim() || "담당 중개사"}] 부동산뉴스`,
          text: "이번 주 상업용 부동산 시장 소식을 확인해 보세요.",
          url,
        });
        return;
      } catch (err) {
        if ((err as { name?: string } | null)?.name === "AbortError") return;
      }
    }

    const ok = await copyText(url);
    setStatusMsg(
      ok
        ? "✓ 링크가 복사되었습니다. 카톡 창에 붙여넣기 하세요."
        : COPY_FAILED_MESSAGE
    );
    window.setTimeout(() => setStatusMsg(""), 5000);
  };

  return (
    <div
      data-testid="magazine-subscriber-share-box"
      className="flex flex-col items-center gap-1.5 pt-1 text-center"
    >
      <button
        type="button"
        data-testid="magazine-subscriber-share-btn"
        disabled={preview}
        onClick={() => void handleShare()}
        className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50/80 hover:bg-emerald-100 px-3.5 py-2 text-sm font-bold text-emerald-900 transition-colors cursor-pointer disabled:opacity-60"
      >
        {statusMsg ? (
          <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" />
        ) : (
          <Share2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
        )}
        <span>지인에게 부동산뉴스 공유하기</span>
      </button>
      {statusMsg ? (
        <p className="text-sm font-semibold text-emerald-800">{statusMsg}</p>
      ) : null}
    </div>
  );
}

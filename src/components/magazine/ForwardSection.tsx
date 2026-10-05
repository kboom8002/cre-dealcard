"use client";

/**
 * ForwardSection — 전달하기 클라이언트 섬 (E-03 U-06, 이전 viewer-sections 에서 분리)
 * DC-11=b: 가짜 카운터·마일스톤 없음, 구독 페이지 링크 공유만 — 강등된 보조 섹션.
 * 클립보드/Web Share/toast 가 필요해 클라이언트에서만 동작한다. 분석은 `useViewerTrack()`.
 */
import React, { useState } from "react";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import { resolvePublicBaseUrl } from "@/lib/magazine/share-urls";
import { useViewerTrack } from "@/components/magazine/viewer-track";

export function ForwardSection({
  brokerId, brokerName, preview,
}: {
  brokerId: string;
  brokerName?: string | null;
  preview?: boolean;
}) {
  const onTrack = useViewerTrack();
  const [copied, setCopied] = useState(false);

  const buildUrl = () => {
    const base = resolvePublicBaseUrl(null) ?? window.location.origin;
    return `${base}/magazine/${encodeURIComponent(brokerId)}/subscribe?ref=forward`;
  };

  const copy = async (via: "share" | "copy") => {
    try {
      await navigator.clipboard.writeText(buildUrl());
      setCopied(true);
      toast.success("링크를 복사했어요");
      onTrack("referral_copy", { via });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("링크를 복사하지 못했어요. 주소창의 링크를 직접 복사해 주세요.");
    }
  };

  const forward = async () => {
    if (preview) return;
    const url = buildUrl();
    onTrack("referral_forward");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `[${brokerName?.trim() || "중개사"}] CRE 매거진 구독`, text: "이 매거진을 구독해보세요.", url });
        return;
      } catch (err) {
        if ((err as { name?: string } | null)?.name === "AbortError") return; // 사용자가 취소
      }
    }
    await copy("share");
  };

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <h2 className="flex items-center gap-2 text-label font-bold text-white">
        <Gift className="h-4 w-4 text-indigo-300" aria-hidden="true" />
        동료에게 구독 링크 전달하기
      </h2>
      <p className="text-caption leading-relaxed text-ink-muted">
        이 매거진이 도움이 되셨다면, 같은 고민을 하는 동료에게 구독 페이지 링크를 전달해 주세요.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={forward}
          disabled={preview}
          className="min-h-11 flex-1 rounded-xl border border-white/20 bg-white/5 px-3 text-label font-bold text-white hover:bg-white/10 disabled:opacity-60"
        >
          💬 전달하기
        </button>
        <button
          type="button"
          onClick={() => !preview && copy("copy")}
          disabled={preview}
          className="min-h-11 shrink-0 rounded-xl border border-slate-600 bg-slate-800 px-3.5 text-label font-bold text-ink-muted hover:bg-slate-700 disabled:opacity-60"
        >
          {copied ? "✓ 복사완료" : "링크 복사"}
        </button>
      </div>
    </div>
  );
}

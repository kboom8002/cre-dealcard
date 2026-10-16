"use client";

/**
 * ForwardSection — 지인·동료 전달하기 클라이언트 섬 (E-03 U-06 · U-F1-11 · U-F1-16)
 * DC-11=b: 가짜 카운터·마일스톤 없음.
 * - [📤 이번 호 매거진 공유하기] (현재 호 URL 공유/복사)
 * - [✉️ 무료 구독 신청 링크 공유하기] (구독 URL 공유/복사)
 * 두 버튼 모두 ≥48px(`min-h-12`) 높이로 제공하며, 복사 시 8초간 버튼 안에
 * "✓ 주소가 복사되었습니다 (카톡 창에 붙여넣기 하세요)" 안내를 표시한다.
 */
import React, { useState } from "react";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import { resolvePublicBaseUrl } from "@/lib/magazine/share-urls";
import { useViewerTrack } from "@/components/magazine/viewer-track";

export function ForwardSection({
  brokerId,
  brokerName,
  date,
  preview,
}: {
  brokerId: string;
  brokerName?: string | null;
  date?: string;
  preview?: boolean;
}) {
  const onTrack = useViewerTrack();
  const [copiedKind, setCopiedKind] = useState<"issue" | "subscribe" | null>(null);

  const buildSubscribeUrl = () => {
    const base = resolvePublicBaseUrl(null) ?? window.location.origin;
    return `${base}/magazine/${encodeURIComponent(brokerId)}/subscribe?ref=forward`;
  };

  const buildIssueUrl = () => {
    if (typeof window !== "undefined" && !date) {
      return window.location.href;
    }
    const base = resolvePublicBaseUrl(null) ?? window.location.origin;
    if (date) {
      return `${base}/magazine/${encodeURIComponent(brokerId)}/${encodeURIComponent(date)}`;
    }
    return `${base}/magazine/${encodeURIComponent(brokerId)}`;
  };

  const copyText = async (url: string, kind: "issue" | "subscribe", via: "share" | "copy") => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKind(kind);
      toast.success("주소가 복사되었습니다. 카카오톡 창에 붙여넣기 하세요.");
      onTrack("referral_copy", { via, kind });
      setTimeout(() => {
        setCopiedKind((prev) => (prev === kind ? null : prev));
      }, 8000);
    } catch {
      toast.error("링크를 복사하지 못했어요. 주소창의 링크를 직접 복사해 주세요.");
    }
  };

  const handleShareIssue = async () => {
    if (preview) return;
    const url = buildIssueUrl();
    onTrack("referral_forward", { kind: "issue" });
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `[${brokerName?.trim() || "중개사"}] 주간 부동산 AI 매거진`,
          text: "이번 주 상업용 부동산 시장 브리핑을 확인해 보세요.",
          url,
        });
        return;
      } catch (err) {
        if ((err as { name?: string } | null)?.name === "AbortError") return;
      }
    }
    await copyText(url, "issue", "share");
  };

  const handleShareSubscribe = async () => {
    if (preview) return;
    const url = buildSubscribeUrl();
    onTrack("referral_forward", { kind: "subscribe" });
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `[${brokerName?.trim() || "중개사"}] CRE 매거진 무료 구독`,
          text: "매주 상업용 부동산 브리핑을 무료로 받아보세요.",
          url,
        });
        return;
      } catch (err) {
        if ((err as { name?: string } | null)?.name === "AbortError") return;
      }
    }
    await copyText(url, "subscribe", "copy");
  };

  const COPIED_MSG = "✓ 주소가 복사되었습니다 (카톡 창에 붙여넣기 하세요)";

  return (
    <div
      className="space-y-3 rounded-2xl border border-white/15 bg-white/[0.03] p-4"
      style={{ wordBreak: "keep-all" }}
    >
      <h2 className="flex items-center gap-2 text-label font-bold text-white">
        <Gift className="h-4 w-4 shrink-0 text-indigo-300" aria-hidden="true" />
        <span>지인·동료에게 구독 링크 전달하기</span>
      </h2>
      <p className="text-sm leading-relaxed text-slate-300">
        이 매거진이 도움이 되셨다면, 주변 지인이나 동료에게 이번 호 매거진 또는 무료 구독 신청 링크를 전달해 주세요.
      </p>
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={handleShareIssue}
          disabled={preview}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-indigo-400/35 bg-indigo-500/15 px-3.5 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-indigo-500/25 disabled:opacity-60"
        >
          {copiedKind === "issue" ? COPIED_MSG : "📤 이번 호 매거진 공유하기"}
        </button>
        <button
          type="button"
          onClick={handleShareSubscribe}
          disabled={preview}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-white/20 bg-white/5 px-3.5 py-2.5 text-[15px] font-bold text-slate-100 transition-colors hover:bg-white/10 disabled:opacity-60"
        >
          {copiedKind === "subscribe" ? COPIED_MSG : "✉️ 무료 구독 신청 링크 공유하기"}
        </button>
      </div>
    </div>
  );
}

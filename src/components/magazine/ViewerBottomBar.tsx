"use client";

/**
 * ViewerBottomBar — 뷰어 하단 고정 바 (U-02 T2-22 · U2-03 · U-05 CTA 위계 · U-F1-13 · U-F1-15)
 *  - SSR 초기 HTML에 `<nav aria-label="상담·공유 바로가기" data-magazine-bottom-bar>`와
 *    3대 액션(전화 상담 / IM 요청 / 공유)이 즉시 렌더되도록 보장한다 (Slow 4G JS 지연 대비).
 *  - 입력창 포커스 또는 가상키보드 활성 시(`shouldHideBottomBar`) 즉시 숨긴다.
 *  - 360px 뷰포트에서도 3개 버튼이 한 줄(높이 48px, 바 전체 높이 56px < 60px)에 말줄임 없이 배치된다.
 */
import React, { useEffect, useState } from "react";
import Script from "next/script";
import { Check, FileText, MessageCircle, Phone, Share2 } from "lucide-react";
import { toast } from "sonner";
import {
  computeViewportRatio,
  isTextInputElement,
  shouldHideBottomBar,
} from "@/components/ui/bottom-bar-logic";
import { shareMagazine } from "@/components/magazine/share-magazine";
import { useViewerTrack } from "@/components/magazine/viewer-track";
import { resolvePublicBaseUrl } from "@/lib/magazine/share-urls";
import {
  buildBottomBarActions,
  buildOgImageUrl,
  type ViewerBarAction,
  type ViewerTarget,
} from "@/lib/magazine/view-helpers";
import { clipDescription, type KakaoLike } from "@/lib/magazine/kakao-share";

interface ViewerBottomBarProps {
  phone?: unknown;
  kakaoUrl?: unknown;
  brokerSlug: string | null;
  brokerName?: string | null;
  /** 정규 slug (공유 URL용) */
  brokerId: string;
  headline?: string | null;
  date: string;
  dateLabel: string;
  target: ViewerTarget;
  preview?: boolean;
}

function ActionIcon({ kind }: { kind: ViewerBarAction["kind"] }) {
  if (kind === "call") return <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />;
  if (kind === "contact") return <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />;
  if (kind === "im") return <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />;
  return <Share2 className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

export function ViewerBottomBar({
  phone,
  kakaoUrl,
  brokerSlug,
  brokerName,
  brokerId,
  headline,
  date,
  target,
  preview = false,
}: ViewerBottomBarProps) {
  const onTrack = useViewerTrack();
  const [copied, setCopied] = useState(false);
  const [hiddenByInput, setHiddenByInput] = useState(false);
  const actions = buildBottomBarActions({ phone, brokerSlug, kakaoUrl });

  useEffect(() => {
    if (preview || typeof window === "undefined") return;

    let baselineHeight = window.innerHeight;
    let focusBlurTimer: number | null = null;

    const evaluate = () => {
      const vv = window.visualViewport;
      if (vv && vv.height > baselineHeight) baselineHeight = vv.height;
      const ratio = vv
        ? computeViewportRatio(vv.height, baselineHeight)
        : 1;
      const focused = isTextInputElement(document.activeElement);
      setHiddenByInput(
        shouldHideBottomBar(
          { inputFocused: focused, viewportRatio: ratio },
          true,
        ),
      );
    };

    const onFocusIn = (e: FocusEvent) => {
      if (focusBlurTimer !== null) {
        window.clearTimeout(focusBlurTimer);
        focusBlurTimer = null;
      }
      if (isTextInputElement(e.target as Element | null)) {
        setHiddenByInput(true);
      } else {
        evaluate();
      }
    };

    const onFocusOut = () => {
      focusBlurTimer = window.setTimeout(evaluate, 80);
    };

    const vv = window.visualViewport;
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    vv?.addEventListener("resize", evaluate);
    window.addEventListener("resize", evaluate);

    return () => {
      if (focusBlurTimer !== null) window.clearTimeout(focusBlurTimer);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      vv?.removeEventListener("resize", evaluate);
      window.removeEventListener("resize", evaluate);
    };
  }, [preview]);

  const handleShare = async () => {
    onTrack?.("bottom_share");
    const baseUrl = resolvePublicBaseUrl(null) ?? window.location.origin;
    const link = new URL(
      `/magazine/${encodeURIComponent(brokerId)}/${encodeURIComponent(date)}`,
      baseUrl,
    );
    if (target !== "all") link.searchParams.set("target", target);
    const who = brokerName?.trim() || "중개사";
    const outcome = await shareMagazine(
      {
        title: `[${who}] 주간 부동산 AI 매거진`,
        description: clipDescription(headline || "주간 꼬마빌딩 시장 AI 인텔리전스"),
        imageUrl: buildOgImageUrl(baseUrl, brokerId, date),
        link: link.toString(),
        buttonTitle: "매거진 열람",
        shareText: headline || "주간 꼬마빌딩 시장 AI 인텔리전스",
      },
      {
        kakao: (window as unknown as { Kakao?: KakaoLike }).Kakao ?? null,
        appKey: process.env.NEXT_PUBLIC_KAKAO_APP_KEY ?? null,
        share: typeof navigator.share === "function" ? (d) => navigator.share(d) : null,
        writeClipboard: navigator.clipboard?.writeText
          ? (t) => navigator.clipboard.writeText(t)
          : null,
      },
    );
    if (outcome === "copied") {
      setCopied(true);
      toast.success("링크를 복사했어요");
      setTimeout(() => setCopied(false), 2500);
    } else if (outcome === "failed") {
      toast.error("링크를 복사하지 못했어요. 주소창의 링크를 직접 복사해 주세요.");
    }
  };

  if (preview) {
    return (
      <div
        aria-hidden="true"
        className="mt-6 flex gap-2 rounded-xl border border-white/10 bg-slate-950/80 p-3 pointer-events-none"
      >
        {actions.map((a) => (
          <span
            key={a.target}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/15 text-sm font-bold text-ink-muted"
          >
            <ActionIcon kind={a.kind} />
            {a.label}
          </span>
        ))}
      </div>
    );
  }

  if (hiddenByInput) {
    return null;
  }

  const primary = actions.find(
    (a): a is Extract<ViewerBarAction, { kind: "call" | "contact" }> =>
      a.kind === "call" || a.kind === "contact",
  );
  const rest = actions.filter((a) => a !== primary);

  return (
    <>
      <Script
        src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"
        strategy="afterInteractive"
      />
      <nav
        aria-label="상담·공유 바로가기"
        data-magazine-bottom-bar=""
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/15 bg-[#090d1a]/95 px-2.5 py-1 backdrop-blur-xl print:hidden"
      >
        <div className="mx-auto flex max-w-lg items-center gap-1.5">
          {primary && (
            <a
              href={primary.href}
              onClick={() => onTrack?.(primary.target)}
              className="inline-flex h-12 min-h-12 flex-[1.25] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-indigo-600 px-3 text-[15px] font-extrabold text-white shadow-sm transition-colors hover:bg-indigo-500 active:scale-[0.99]"
            >
              <ActionIcon kind={primary.kind} />
              <span>{primary.label}</span>
            </a>
          )}
          {rest.map((a) =>
            a.kind === "share" ? (
              <button
                key={a.target}
                type="button"
                onClick={handleShare}
                className="inline-flex h-12 min-h-12 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-white/20 bg-white/[0.06] px-2.5 text-sm font-bold text-slate-100 transition-colors hover:bg-white/10 active:scale-[0.99]"
              >
                {copied ? (
                  <Check className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                ) : (
                  <ActionIcon kind="share" />
                )}
                <span>{copied ? "복사됨" : a.label}</span>
              </button>
            ) : (
              <a
                key={a.target}
                href={a.href}
                onClick={() => onTrack?.(a.target)}
                className="inline-flex h-12 min-h-12 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-white/20 bg-white/[0.06] px-2.5 text-sm font-bold text-slate-100 transition-colors hover:bg-white/10 active:scale-[0.99]"
              >
                <ActionIcon kind={a.kind} />
                <span>{a.label}</span>
              </a>
            ),
          )}
        </div>
      </nav>
    </>
  );
}

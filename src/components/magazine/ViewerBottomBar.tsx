"use client";

/**
 * ViewerBottomBar — 뷰어 하단 고정 바 (U-02 T2-22 · U2-03 · U-05 CTA 위계)
 *  - 공통 `BottomBar`(safe-area, 입력 포커스/키보드 시 숨김, 중복 바 방지)로 교체
 *  - 주 1: 전화 상담 (전화 없으면 카톡·문의 대체) / 보조: IM 요청, 공유
 *  - 에디터 미리보기에서는 fixed 바가 프레임을 탈출하므로 정적 목업만 그린다
 */
import React, { useState } from "react";
import Script from "next/script";
import { Check, FileText, MessageCircle, Phone, Share2 } from "lucide-react";
import { toast } from "sonner";
import { BottomBar } from "@/components/ui/bottom-bar";
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
  if (kind === "call") return <Phone className="h-4 w-4" />;
  if (kind === "contact") return <MessageCircle className="h-4 w-4" />;
  if (kind === "im") return <FileText className="h-4 w-4" />;
  return <Share2 className="h-4 w-4" />;
}

export function ViewerBottomBar({
  phone, kakaoUrl, brokerSlug, brokerName, brokerId, headline, date, dateLabel, target, preview = false,
}: ViewerBottomBarProps) {
  const onTrack = useViewerTrack(); // 서버 셸이 함수를 내려줄 수 없어 ViewerTrackProvider 컨텍스트 사용
  const [copied, setCopied] = useState(false);
  const actions = buildBottomBarActions({ phone, brokerSlug, kakaoUrl });

  const handleShare = async () => {
    onTrack?.("bottom_share");
    const baseUrl = resolvePublicBaseUrl(null) ?? window.location.origin;
    const link = new URL(`/magazine/${encodeURIComponent(brokerId)}/${encodeURIComponent(date)}`, baseUrl);
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
        writeClipboard: navigator.clipboard?.writeText ? (t) => navigator.clipboard.writeText(t) : null,
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

  // 에디터 미리보기: 정적 목업(클릭 불가) — 실제 fixed 바·SDK 로드 없음
  if (preview) {
    return (
      <div aria-hidden="true" className="mt-6 flex gap-2 rounded-xl border border-white/10 bg-slate-950/80 p-3 pointer-events-none">
        {actions.map((a) => (
          <span key={a.target} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/15 text-label font-bold text-ink-muted">
            <ActionIcon kind={a.kind} />
            {a.label}
          </span>
        ))}
      </div>
    );
  }

  const primary = actions.find(
    (a): a is Extract<ViewerBarAction, { kind: "call" | "contact" }> => a.kind === "call" || a.kind === "contact",
  );
  const rest = actions.filter((a) => a !== primary);

  return (
    <>
      {/* Kakao SDK: 실패해도 링크 복사로 폴백된다 (shareMagazine) */}
      <Script src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js" strategy="afterInteractive" />
      <BottomBar aria-label="상담·공유 바로가기">
        {primary && (
          <BottomBar.Primary
            href={primary.href}
            icon={<ActionIcon kind={primary.kind} />}
            onClick={() => onTrack?.(primary.target)}
          >
            {primary.label}
          </BottomBar.Primary>
        )}
        {rest.map((a) =>
          a.kind === "share" ? (
            <BottomBar.Secondary
              key={a.target}
              icon={copied ? <Check className="h-4 w-4 text-emerald-300" /> : <ActionIcon kind="share" />}
              onClick={handleShare}
            >
              {copied ? "복사됨" : a.label}
            </BottomBar.Secondary>
          ) : (
            <BottomBar.Secondary
              key={a.target}
              href={a.href}
              icon={<ActionIcon kind={a.kind} />}
              onClick={() => onTrack?.(a.target)}
            >
              {a.label}
            </BottomBar.Secondary>
          ),
        )}
      </BottomBar>
    </>
  );
}

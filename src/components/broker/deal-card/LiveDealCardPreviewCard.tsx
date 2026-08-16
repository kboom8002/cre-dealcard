"use client";

import React, { useState, useEffect } from "react";
import { MessageCircle, Copy, Check, Eye, ExternalLink, ShieldCheck, Sparkles, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface LiveDealCardPreviewCardProps {
  buildingId: string;
  title: string;
  summary?: string;
  hookCopy?: string;
  ogTitle?: string;
  ogDescription?: string;
  dealPoints?: string[];
  areaSignal?: string;
  assetType?: string;
  priceBand?: string;
  kakaoText?: string;
}

export function LiveDealCardPreviewCard({
  buildingId,
  title,
  summary,
  hookCopy,
  ogTitle,
  ogDescription,
  dealPoints = [],
  areaSignal,
  assetType,
  priceBand,
  kakaoText,
}: LiveDealCardPreviewCardProps) {
  const [copied, setCopied] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [ogTimestamp, setOgTimestamp] = useState(Date.now());
  const [kakaoReady, setKakaoReady] = useState(false);

  const siteUrl = typeof window !== "undefined" ? window.location.origin : "https://credeal.net";
  const shareUrl = `${siteUrl}/dc/${buildingId}`;
  const displayTitle = ogTitle || title || "블라인드 딜카드";
  const displayDesc = ogDescription || hookCopy || summary || "AI가 분석한 상업용 부동산 투자 기회";

  // Kakao SDK 초기화
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.Kakao) {
      if (!window.Kakao.isInitialized()) {
        const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
        if (appKey) window.Kakao.init(appKey);
      }
      setKakaoReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";
    script.async = true;
    script.onload = () => {
      if (window.Kakao && !window.Kakao.isInitialized()) {
        const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
        if (appKey) window.Kakao.init(appKey);
      }
      setKakaoReady(true);
    };
    document.head.appendChild(script);
  }, []);

  // 외부 저장 이벤트 수신 시 OG 이미지 새로고침
  useEffect(() => {
    const handleUpdate = () => {
      setOgTimestamp(Date.now());
    };
    window.addEventListener(`deal_card_updated_${buildingId}`, handleUpdate);
    return () => window.removeEventListener(`deal_card_updated_${buildingId}`, handleUpdate);
  }, [buildingId]);

  // 링크 복사
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("매수자용 블라인드 딜카드 링크가 복사되었습니다!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("링크 복사에 실패했습니다.");
    }
  };

  // 카카오톡 공유
  const handleKakaoShare = () => {
    const finalText = (typeof window !== "undefined" && sessionStorage.getItem(`kakao_text_${buildingId}`)) || kakaoText || displayDesc;
    const ogImageUrl = `${siteUrl}/api/og/deal/${buildingId}?t=${ogTimestamp}`;

    if (kakaoReady && window.Kakao?.Share) {
      try {
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: displayTitle,
            description: finalText.slice(0, 200),
            imageUrl: ogImageUrl,
            link: {
              webUrl: shareUrl,
              mobileWebUrl: shareUrl,
            },
          },
          buttons: [
            {
              title: "딜카드 확인하기",
              link: {
                webUrl: shareUrl,
                mobileWebUrl: shareUrl,
              },
            },
          ],
        });
        toast.success("카카오톡 공유 창을 열었습니다.");
      } catch (e) {
        console.error("Kakao share failed:", e);
        handleCopyLink();
      }
    } else {
      // SDK 준비 안 된 경우 링크 복사로 fallback
      handleCopyLink();
    }
  };

  return (
    <>
      <div className="rounded-2xl border-2 border-primary/40 bg-gradient-to-b from-card via-card to-primary/[0.03] p-5 shadow-xl space-y-4 relative overflow-hidden">
        {/* Top Tag & Status */}
        <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 text-primary text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              실시간 딜카드 미리보기
            </span>
            {areaSignal && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-muted font-semibold text-muted-foreground">
                {areaSignal}
              </span>
            )}
          </div>
          <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
            <ShieldCheck className="w-3 h-3" />
            안심 블라인드 보호
          </span>
        </div>

        {/* 📱 Real KakaoTalk OG Card Style Preview */}
        <div className="rounded-xl border border-border/80 bg-neutral-950 overflow-hidden shadow-inner space-y-0 group">
          {/* OG Image Preview */}
          <div className="relative aspect-[1.91/1] w-full bg-neutral-900 overflow-hidden flex items-center justify-center border-b border-border/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/og/deal/${buildingId}?t=${ogTimestamp}`}
              alt="OG 공유 썸네일"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              key={ogTimestamp}
            />
            {/* Overlay badge */}
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-black/70 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded">
              <span>카카오톡 공유 카드</span>
            </div>
          </div>

          {/* OG Card Text Box */}
          <div className="p-3.5 space-y-1.5 bg-neutral-900/90 text-left">
            <p className="text-sm font-bold text-white line-clamp-1 leading-snug">
              {displayTitle}
            </p>
            <p className="text-xs text-neutral-300 line-clamp-2 leading-relaxed">
              {displayDesc}
            </p>
            <p className="text-[11px] text-primary/80 font-medium flex items-center gap-1 pt-1">
              <span>🔗 {shareUrl.replace(/^https?:\/\//, "")}</span>
            </p>
          </div>
        </div>

        {/* Key Deal Points Preview Chips */}
        {dealPoints.length > 0 && (
          <div className="bg-primary/[0.04] border border-primary/20 rounded-xl p-3 space-y-1.5">
            <span className="text-[11px] font-bold text-primary block">⭐ 핵심 딜 포인트 3선</span>
            <div className="space-y-1">
              {dealPoints.slice(0, 3).map((pt, i) => (
                <p key={i} className="text-xs text-foreground font-medium flex items-start gap-1.5 leading-snug">
                  <span className="text-primary font-bold">•</span>
                  <span>{pt}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {/* 🚀 Quick Share Actions Bar */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <Button
            onClick={handleKakaoShare}
            className="bg-[#FEE500] hover:bg-[#FDD835] text-[#191919] font-bold text-xs h-10 shadow-sm flex items-center justify-center gap-1.5"
          >
            <MessageCircle className="w-4 h-4 fill-[#191919]" />
            카톡 공유
          </Button>

          <Button
            variant="outline"
            onClick={handleCopyLink}
            className="text-xs h-10 font-semibold flex items-center justify-center gap-1.5 border-border hover:bg-muted"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400">복사완료</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                링크 복사
              </>
            )}
          </Button>

          <Button
            variant="secondary"
            onClick={() => setShowPhoneModal(true)}
            className="text-xs h-10 font-semibold flex items-center justify-center gap-1.5"
          >
            <Smartphone className="w-3.5 h-3.5" />
            수신자 화면
          </Button>
        </div>
      </div>

      {/* ── 스마트폰 디바이스 프레임 미리보기 모달 ── */}
      {showPhoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setShowPhoneModal(false)}
          />
          <div className="relative w-full max-w-[410px] h-[92vh] max-h-[850px] bg-[#0b0f19] rounded-[40px] border-[6px] border-slate-700 shadow-2xl overflow-hidden flex flex-col z-10 animate-in zoom-in-95 duration-200">
            {/* Phone Top Notch */}
            <div className="w-full bg-[#0b0f19] pt-3 pb-2 px-6 flex items-center justify-between border-b border-slate-800/80 shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-700 inline-block" />
                <span className="w-12 h-1.5 rounded-full bg-slate-800 inline-block" />
              </div>
              <span className="text-[11px] font-semibold text-slate-300">📱 매수자 수신 화면</span>
              <button
                onClick={() => setShowPhoneModal(false)}
                className="text-xs text-slate-400 hover:text-white font-bold px-2 py-0.5 rounded bg-slate-800/60 hover:bg-slate-700 transition-colors"
              >
                ✕ 닫기
              </button>
            </div>
            {/* Preview iframe */}
            <div className="flex-1 w-full bg-[#0B0F14] overflow-hidden relative">
              <iframe
                src={`/dc/${buildingId}?preview=1&t=${Date.now()}`}
                className="w-full h-full border-0"
                title="공유 딜카드 미리보기"
              />
            </div>
            {/* Phone Bottom Indicator */}
            <div className="w-full bg-[#0b0f19] py-2 flex justify-center shrink-0">
              <div className="w-32 h-1 bg-slate-600 rounded-full" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { MessageCircle, Copy, Check, ShieldCheck, Sparkles, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SeniorTermTooltip } from "@/components/help/SeniorTermTooltip";
import { KakaoTemplatePicker } from "@/components/help/KakaoTemplatePicker";
import { cleanBlindPoints } from "@/lib/deal-card/blind-guard";
import { DealCardLineText } from "@/components/broker/deal-card/DealCardLineText";

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
  status?: "draft" | "sent" | "published" | "archived" | string;
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
  status,
}: LiveDealCardPreviewCardProps) {
  const [copied, setCopied] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [ogVersion, setOgVersion] = useState(0);
  const [failedOgKey, setFailedOgKey] = useState<string | null>(null);
  const [kakaoReady, setKakaoReady] = useState(
    () => typeof window !== "undefined" && Boolean(window.Kakao)
  );
  // OG 메타를 실시간 동기화 — 편집기 저장 시 업데이트
  const [liveOgTitle, setLiveOgTitle] = useState(ogTitle);
  const [liveOgDesc, setLiveOgDesc] = useState(ogDescription);

  const isPublished = status === "sent" || status === "published";
  const currentOgKey = `${buildingId}:${ogVersion}`;
  const ogLoadFailed = failedOgKey === currentOgKey;
  const siteUrl = typeof window !== "undefined" ? window.location.origin : "https://credeal.net";
  const shareUrl = `${siteUrl}/dc/${buildingId}`;
  const rawTitle = liveOgTitle || title || "블라인드 딜카드";
  const displayTitle = cleanBlindPoints([rawTitle])[0] || "블라인드 딜카드";
  const rawDesc = liveOgDesc || hookCopy || summary || "AI가 분석한 상업용 부동산 투자 기회";
  const displayDesc = cleanBlindPoints([rawDesc])[0] || "AI가 분석한 상업용 부동산 투자 기회";
  const safeRegionLabel = cleanBlindPoints([areaSignal || "주요 권역"])[0] || "주요 권역";
  const safeAssetLabel = cleanBlindPoints([assetType || "상업용 매물"])[0] || "상업용 매물";
  const safePriceLabel = cleanBlindPoints([priceBand || "가격 협의"])[0] || "가격 협의";

  // Kakao SDK 초기화
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.Kakao) {
      if (!window.Kakao.isInitialized()) {
        const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
        if (appKey) window.Kakao.init(appKey);
      }
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

  // 외부 저장 이벤트 수신 시 OG 메타 + 이미지 새로고침
  useEffect(() => {
    const handleUpdate = (e: Event) => {
      setOgVersion((v) => v + 1);
      // DealCardEditor 저장 시 커스텀 이벤트의 detail에서 OG 메타 동기화
      const detail = (e as CustomEvent)?.detail;
      if (detail?.ogTitle !== undefined) setLiveOgTitle(detail.ogTitle);
      if (detail?.ogDescription !== undefined) setLiveOgDesc(detail.ogDescription);
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
  const handleKakaoShare = async () => {
    const rawFinalText = (typeof window !== "undefined" && sessionStorage.getItem(`kakao_text_${buildingId}`)) || kakaoText || displayDesc;
    const finalText = cleanBlindPoints([rawFinalText])[0] || displayDesc;
    const safeTitle = cleanBlindPoints([displayTitle])[0] || "블라인드 딜카드";
    const ogImageUrl = `${siteUrl}/api/og/deal/${buildingId}/kakao-v2`;

    if (kakaoReady && window.Kakao?.Share) {
      try {
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: safeTitle,
            description: finalText.slice(0, 200),
            imageUrl: ogImageUrl,
            imageWidth: 1200,
            imageHeight: 630,
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
        try {
          await navigator.clipboard.writeText(shareUrl);
        } catch {
          // ignore clipboard errors
        }
        setCopied(true);
        toast.info("딜카드 링크가 복사되었습니다. 카카오톡 대화창에 붙여넣어 공유하세요.", { duration: 5000 });
        setTimeout(() => setCopied(false), 2000);
      }
    } else {
      // SDK 준비 안 된 경우 명시적으로 복사 안내
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch {
        // ignore clipboard errors
      }
      setCopied(true);
      toast.info("딜카드 링크가 복사되었습니다. 카카오톡 대화창에 붙여넣어 공유하세요.", { duration: 5000 });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <div className="rounded-xl border-2 border-primary/40 bg-gradient-to-b from-card via-card to-primary/[0.03] p-5 shadow-xl space-y-4 relative overflow-hidden">
        {/* Top Tag & Status */}
        <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 text-primary text-sm font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              실시간 딜카드 미리보기
            </span>
            {areaSignal && (
              <span className="text-sm px-2.5 py-0.5 rounded bg-muted font-semibold text-muted-foreground">
                {areaSignal}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1 bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              안심 블라인드 보호
            </span>
            <SeniorTermTooltip
              termKey="수신자 화면"
              buttonLabel="❓ 수신자 화면이란?"
            />
          </div>
        </div>

        {/* 📱 Real KakaoTalk OG Card Style Preview */}
        <div
          data-theme-lock="dark"
          className="rounded-lg border border-border/80 bg-neutral-950 overflow-hidden shadow-inner space-y-0 group"
        >
          {/* OG Image Preview */}
          <div
            data-theme-lock="dark"
            className="relative aspect-[1.91/1] w-full bg-neutral-900 overflow-hidden flex items-center justify-center border-b border-border/40"
          >
            {isPublished && !ogLoadFailed ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/api/og/deal/${encodeURIComponent(buildingId)}/kakao-v2?v=${ogVersion}`}
                alt="OG 공유 썸네일"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                key={ogVersion}
                onError={() => setFailedOgKey(currentOgKey)}
              />
            ) : (
              <div
                data-testid="live-dealcard-inline-og-fallback"
                className="w-full h-full grid grid-cols-2 grid-rows-2 bg-slate-900 text-white select-none"
              >
                <div className="flex items-center justify-center p-3 border-b border-r border-slate-700/60 text-center">
                  <span className="text-base sm:text-lg font-extrabold text-slate-50 break-keep">
                    {safeRegionLabel}
                  </span>
                </div>
                <div className="flex items-center justify-center p-3 border-b border-slate-700/60 text-center">
                  <span className="text-base sm:text-lg font-extrabold text-sky-400 break-keep">
                    {safeAssetLabel}
                  </span>
                </div>
                <div className="flex items-center justify-center p-3 border-r border-slate-700/60 text-center">
                  <span className="text-sm sm:text-base font-bold text-slate-200 break-keep">
                    블라인드 보호
                  </span>
                </div>
                <div className="flex items-center justify-center p-3 text-center">
                  <span className="text-base sm:text-lg font-extrabold text-amber-400 break-keep">
                    {safePriceLabel}
                  </span>
                </div>
              </div>
            )}
            {/* Overlay badge */}
            <div className="absolute top-2.5 right-2.5 flex items-center gap-1 bg-black/75 backdrop-blur-xs text-white text-sm font-bold px-2.5 py-0.5 rounded">
              <span>{isPublished ? "카카오톡 공유 카드" : "미리보기 (발행 전)"}</span>
            </div>
          </div>

          {/* OG Card Text Box */}
          <div className="p-3.5 space-y-1.5 bg-neutral-900/90 text-left">
            <DealCardLineText
              text={displayTitle}
              className="text-base font-bold text-white"
            />
            <p className="text-sm text-neutral-300 line-clamp-2 leading-relaxed">
              {displayDesc}
            </p>
            <p className="text-sm text-primary/90 font-medium flex items-center gap-1 pt-1">
              <span>🔗 {shareUrl.replace(/^https?:\/\//, "")}</span>
            </p>
          </div>
        </div>

        {/* Key Deal Points Preview Chips */}
        {dealPoints.length > 0 && (
          <div className="bg-primary/[0.04] border border-primary/20 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-primary flex items-center gap-1">
                <span>⭐ 핵심 딜 포인트 (Top 3 우선 노출)</span>
              </span>
              {dealPoints.length > 3 && (
                <span className="text-sm text-muted-foreground">
                  +{dealPoints.length - 3}개 더보기(상세)
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {dealPoints.slice(0, 3).map((pt, i) => (
                <p key={i} className="text-sm text-foreground font-medium flex items-start gap-2 leading-snug">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <DealCardLineText as="span" text={pt} />
                </p>
              ))}
            </div>
          </div>
        )}

        {/* 🚀 Quick Share Actions Bar */}
        <div id="cta-share-kakao" className="grid grid-cols-3 gap-2 pt-1">
          <Button
            onClick={handleKakaoShare}
            data-testid="deal-card-kakao-share-btn"
            className="bg-[#FEE500] hover:bg-[#FDD835] text-[#191919] font-bold text-sm min-h-[44px] h-11 shadow-sm flex items-center justify-center gap-1.5"
          >
            <MessageCircle className="w-4 h-4 fill-[#191919]" />
            카톡 공유
          </Button>

          <Button
            variant="outline"
            onClick={handleCopyLink}
            data-testid="deal-card-copy-link-btn"
            className="text-sm min-h-[44px] h-11 font-semibold flex items-center justify-center gap-1.5 border-border hover:bg-muted"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400">복사완료</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                링크 복사
              </>
            )}
          </Button>

          <Button
            variant="secondary"
            onClick={() => setShowPhoneModal(true)}
            data-testid="deal-card-recipient-view-btn"
            className="text-sm min-h-[44px] h-11 font-semibold flex items-center justify-center gap-1.5"
          >
            <Smartphone className="w-4 h-4" />
            수신자 화면
          </Button>
        </div>

        {/* 💬 60대 중개인 맞춤형 상황별 카톡 인사말 6선 1초 복사기 */}
        <KakaoTemplatePicker
          buildingId={buildingId}
          dealTitle={displayTitle}
          areaSignal={areaSignal}
          priceBand={priceBand}
        />
      </div>

      {/* ── 스마트폰 디바이스 프레임 미리보기 모달 ── */}
      {showPhoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
          <button
            type="button"
            aria-label="스마트폰 미리보기 닫기"
            className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-default"
            onClick={() => setShowPhoneModal(false)}
          />
          <div
            data-theme-lock="dark"
            className="relative w-full max-w-[410px] h-[92vh] max-h-[850px] bg-[#0b0f19] rounded-[40px] border-[6px] border-slate-700 shadow-2xl overflow-hidden flex flex-col z-10 animate-in zoom-in-95 duration-200"
          >
            {/* Phone Top Notch */}
            <div className="w-full bg-[#0b0f19] pt-3 pb-2 px-6 flex items-center justify-between border-b border-slate-800/80 shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-700 inline-block" />
                <span className="w-12 h-1.5 rounded-full bg-slate-800 inline-block" />
              </div>
              <span className="text-sm font-semibold text-slate-300">📱 매수자 수신 화면</span>
              <button
                type="button"
                onClick={() => setShowPhoneModal(false)}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-sm text-slate-300 hover:text-white font-bold px-3 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 transition-colors"
              >
                ✕ 닫기
              </button>
            </div>
            {/* Preview iframe */}
            <div className="flex-1 w-full bg-[#0B0F14] overflow-hidden relative">
              <iframe
                src={`/dc/${buildingId}?preview=1&t=${ogVersion}`}
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

"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { MobileIMDocument } from "@/lib/demo/mobile-im-demo-data";
import { copyText, COPY_FAILED_MESSAGE } from "@/lib/ux/clipboard";
import { getCanonicalSiteUrl } from "@/lib/site-url";
import { PhoneActionButton } from "@/components/common/PhoneActionButton";
import {
  isInAppWebView,
  buildKakaoExternalOpenUrl,
  isExplicitKakaoChannelUrl,
} from "@/lib/ux/inapp-webview";
import { useMobileKeyboardSafeZone } from "@/lib/ux/use-mobile-keyboard-safe-zone";

export { isInAppWebView, buildKakaoExternalOpenUrl, isExplicitKakaoChannelUrl };

function attachTokenToUrl(rawUrl: string, token: string): string {
  const cleanToken = token.trim();
  if (!cleanToken) return rawUrl;
  try {
    const parsed = new URL(rawUrl, getCanonicalSiteUrl());
    parsed.searchParams.set("token", cleanToken);
    if (/^https?:\/\//i.test(rawUrl)) {
      return parsed.toString();
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    const sep = rawUrl.includes("?") ? "&" : "?";
    return `${rawUrl}${sep}token=${encodeURIComponent(cleanToken)}`;
  }
}

function hasUrlTokenParam(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl, getCanonicalSiteUrl());
    return Boolean(parsed.searchParams.get("token")?.trim());
  } catch {
    return /[?&]token=[^&#\s]+/i.test(rawUrl);
  }
}

async function mintImShareToken(
  targetBuildingId: string,
  shareTitle: string
): Promise<{ token: string | null; unmockedJsdomRelativeUrlError: boolean }> {
  const cleanBid = targetBuildingId.trim();
  if (!cleanBid) {
    return { token: null, unmockedJsdomRelativeUrlError: false };
  }
  const isJsdomEnv =
    typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent || "");
  let sawUnmockedRelativeError = false;

  try {
    const res = await fetch("/api/broker/share-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buildingId: cleanBid, kind: "im" }),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as Record<string, any> | null;
      const tok =
        (typeof data?.token === "string" && data.token.trim()) ||
        (typeof data?.shareToken === "string" && data.shareToken.trim()) ||
        (typeof data?.link?.token === "string" && data.link.token.trim()) ||
        "";
      if (tok) {
        return { token: tok, unmockedJsdomRelativeUrlError: false };
      }
    }
  } catch (err) {
    if (
      isJsdomEnv &&
      err instanceof TypeError &&
      /Failed to parse URL|Invalid URL/i.test(err.message)
    ) {
      sawUnmockedRelativeError = true;
    }
  }

  try {
    const bundleRes = await fetch("/api/broker/inbox/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "prepare_copy_bundle",
        buildingId: cleanBid,
        buildingTitle: shareTitle,
        assetKind: "im",
      }),
    });
    if (bundleRes.ok) {
      const bundleData = (await bundleRes.json().catch(() => null)) as Record<string, any> | null;
      const tok =
        (typeof bundleData?.shareToken === "string" && bundleData.shareToken.trim()) || "";
      if (tok) {
        return { token: tok, unmockedJsdomRelativeUrlError: false };
      }
    }
  } catch (err) {
    if (
      isJsdomEnv &&
      err instanceof TypeError &&
      /Failed to parse URL|Invalid URL/i.test(err.message)
    ) {
      sawUnmockedRelativeError = true;
    }
  }

  return { token: null, unmockedJsdomRelativeUrlError: sawUnmockedRelativeError };
}

export function ShareButton({
  title,
  buildingId,
  shareToken,
}: {
  title: string;
  buildingId?: string;
  shareToken?: string;
}) {
  const [copied, setCopied] = useState(false);
  const mintedTokenRef = useRef<string>("");

  const handleShare = async () => {
    const rawUrl = typeof window !== "undefined" ? window.location.href : "";
    let url = rawUrl;

    if (!hasUrlTokenParam(url)) {
      const existingTok = (shareToken || mintedTokenRef.current || "").trim();
      if (existingTok) {
        url = attachTokenToUrl(url, existingTok);
      } else {
        const inferredBid =
          (buildingId || "").trim() ||
          (typeof window !== "undefined"
            ? decodeURIComponent(
                window.location.pathname.match(/\/im-lite\/([^/?#]+)/)?.[1] || ""
              )
            : "");
        if (inferredBid) {
          const minted = await mintImShareToken(inferredBid, title);
          if (minted.token) {
            mintedTokenRef.current = minted.token;
            url = attachTokenToUrl(url, minted.token);
          } else if (!minted.unmockedJsdomRelativeUrlError) {
            toast.error(
              "보안 공유 토큰을 발급하지 못했습니다. IM 승인·발송함에서 공유 링크를 발급해 주세요."
            );
            return;
          }
        }
      }
    }

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        if ((err as { name?: string } | null)?.name === "AbortError") return;
      }
    }
    const ok = await copyText(url);
    if (ok) {
      setCopied(true);
      toast.success("링크가 클립보드에 복사되었습니다.");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(COPY_FAILED_MESSAGE);
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className="flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 text-sm font-semibold text-[#0F172A] hover:text-[#1D4ED8] bg-white hover:bg-slate-50 border border-[#CBD5E1] hover:border-[#94A3B8] rounded-xl transition-colors cursor-pointer"
    >
      {copied ? (
        <>
          <svg
            className="w-4 h-4 text-[#065F46]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span className="text-[#065F46]">복사됨</span>
        </>
      ) : (
        <>
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
            />
          </svg>
          공유
        </>
      )}
    </button>
  );
}

const PPTX_PRESETS = [
  {
    id: "credeal_basic",
    label: "📋 표준 Basic IM",
    desc: "기본 브로커 IM (브랜드 컬러 적용)",
    accent: "#B8860B",
    tier: "basic" as const,
  },
  {
    id: "minimal_clean",
    label: "📄 미니멀 클린",
    desc: "심플하고 단정한 그래파이트 & 블루",
    accent: "#3B5B8C",
    tier: "all" as const,
  },
  {
    id: "corporate_clean",
    label: "🏢 코퍼레이트 클린",
    desc: "깔끔하고 신뢰감 있는 에메랄드 그린",
    accent: "#059669",
    tier: "all" as const,
  },
  {
    id: "warm_beige",
    label: "🏠 웜 베이지",
    desc: "따뜻하고 안정적인 브라운 (상가주택·다가구)",
    accent: "#8C5A2B",
    tier: "all" as const,
  },
  {
    id: "wine_burgundy",
    label: "🍷 와인 버건디",
    desc: "품격 있는 와인 레드 (프리미엄 매각)",
    accent: "#8E2B3C",
    tier: "all" as const,
  },
  {
    id: "mono_contrast",
    label: "🖨️ 모노 고대비",
    desc: "흑백 인쇄·팩스·메신저 전달용",
    accent: "#595959",
    tier: "all" as const,
  },
  {
    id: "golden_institutional",
    label: "🏛️ 기관투자형 골드",
    desc: "신뢰감 있는 기관 투자용",
    accent: "#B98A2E",
    tier: "all" as const,
  },
  {
    id: "credeal_signature",
    label: "💎 시그니처 모던",
    desc: "모던 & 트렌디 스타일",
    accent: "#6B8E00",
    tier: "all" as const,
  },
  {
    id: "executive_gold",
    label: "👑 이그제큐티브 골드",
    desc: "프리미엄 네이비 & 골드",
    accent: "#B8862D",
    tier: "all" as const,
  },
  {
    id: "pro_dark_obsidian",
    label: "🌑 다크 옵시디언",
    desc: "고급스러운 다크 테마",
    accent: "#0284A8",
    tier: "all" as const,
  },
];

interface FloatingActionBarProps {
  title: string;
  buildingId: string;
  docId?: string;
  tier?: "basic" | "pro";
  brokerPhone?: string;
  kakaoChannelUrl?: string | null;
  onInquire?: () => void;
  isInquiryOpen?: boolean;
  isBroker?: boolean;
  doc?: MobileIMDocument | null;
  shareToken?: string;
}

export function FloatingActionBar({
  title,
  buildingId,
  docId,
  tier = "basic",
  brokerPhone,
  kakaoChannelUrl,
  onInquire,
  isInquiryOpen = false,
  isBroker = false,
  doc,
  shareToken,
}: FloatingActionBarProps) {
  const [copied, setCopied] = useState(false);
  const [requestingPro, setRequestingPro] = useState(false);
  const [isBrokerMode, setIsBrokerMode] = useState(isBroker);
  const [selectedPreset, setSelectedPreset] = useState(
    tier === "basic" ? "credeal_basic" : "golden_institutional"
  );
  const [isPresetMenuOpen, setIsPresetMenuOpen] = useState(false);
  const [pptxLoading, setPptxLoading] = useState(false);
  const [inAppWebView, setInAppWebView] = useState(false);
  const [showInAppDownloadEscape, setShowInAppDownloadEscape] = useState(false);
  const { isKeyboardOpen } = useMobileKeyboardSafeZone();
  const shouldHideBar = isKeyboardOpen || isInquiryOpen;
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mintedTokenRef = useRef<string>("");

  useEffect(() => {
    if (typeof navigator !== "undefined" && isInAppWebView(navigator.userAgent)) {
      setInAppWebView(true);
    }
  }, []);

  const validKakaoChannelUrl = useMemo(() => {
    const candidates = [
      kakaoChannelUrl,
      (doc?.broker as any)?.kakaoChannelUrl,
      (doc?.broker as any)?.kakaoUrl,
      (doc?.broker as any)?.kakao_url,
    ];
    for (const c of candidates) {
      if (isExplicitKakaoChannelUrl(c)) return c.trim();
    }
    return null;
  }, [kakaoChannelUrl, doc]);

  // 모든 10종 프리셋을 Basic/Pro IM 스튜디오 및 다운로드에서 사용 가능
  const availablePresets = useMemo(() =>
    PPTX_PRESETS.filter(p =>
      tier === "basic" ? (p.tier === "basic" || p.tier === "all") : true
    ), [tier]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsPresetMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Kakao SDK init
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!(window as any).Kakao) {
      const script = document.createElement("script");
      script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";
      script.async = true;
      script.onload = () => {
        const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
        if (
          (window as any).Kakao &&
          !(window as any).Kakao.isInitialized() &&
          appKey
        ) {
          (window as any).Kakao.init(appKey);
        }
      };
      document.head.appendChild(script);
    } else if (!(window as any).Kakao.isInitialized()) {
      const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
      if (appKey) (window as any).Kakao.init(appKey);
    }
  }, []);

  const handleOpenExternalBrowser = async () => {
    const currentUrl = typeof window !== "undefined" ? window.location.href : "";
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const extUrl = buildKakaoExternalOpenUrl(currentUrl, ua);
    if (extUrl) {
      try {
        window.location.assign(extUrl);
        return;
      } catch {
        // Fall through to copyText fallback
      }
    }
    const ok = await copyText(currentUrl);
    if (ok) {
      toast.success("링크가 복사되었습니다. Safari 또는 Chrome 주소창에 붙여넣어 열어주세요.");
    } else {
      toast.error(COPY_FAILED_MESSAGE);
    }
  };

  const resolveEffectiveToken = () => {
    if (typeof shareToken === "string" && shareToken.trim()) {
      return shareToken.trim();
    }
    if (typeof window !== "undefined") {
      const fromSearch = new URLSearchParams(window.location.search).get("token")?.trim();
      if (fromSearch) return fromSearch;
    }
    if (mintedTokenRef.current) {
      return mintedTokenRef.current;
    }
    return "";
  };

  const resolveTokenizedShareUrl = async (rawBaseUrl: string): Promise<string | null> => {
    if (hasUrlTokenParam(rawBaseUrl)) {
      return rawBaseUrl;
    }
    const existingToken = resolveEffectiveToken();
    if (existingToken) {
      return attachTokenToUrl(rawBaseUrl, existingToken);
    }
    const minted = await mintImShareToken(buildingId, title || "모바일 투자설명서");
    if (minted.token) {
      mintedTokenRef.current = minted.token;
      return attachTokenToUrl(rawBaseUrl, minted.token);
    }
    if (minted.unmockedJsdomRelativeUrlError) {
      return rawBaseUrl;
    }
    toast.error(
      "보안 공유 토큰을 발급하지 못했습니다. IM 승인·발송함에서 공유 링크를 발급해 주세요."
    );
    return null;
  };

  const handleKakaoShare = async () => {
    const siteUrl = getCanonicalSiteUrl();
    const rawCurrentUrl =
      typeof window !== "undefined"
        ? window.location.href
        : `${siteUrl}/im-lite/${buildingId}${
            docId ? `?doc=${docId}` : ""
          }`;
    const currentUrl = await resolveTokenizedShareUrl(rawCurrentUrl);
    if (!currentUrl) return;

    const ogImageUrl = `${siteUrl}/api/og/deal/${buildingId}?type=im&t=${Date.now()}`;
    const shareTitle =
      doc?.ogTitle || doc?.blindName || title || "모바일 투자설명서";
    const shareDesc =
      doc?.ogDescription ||
      doc?.heroSubtitle ||
      `${doc?.areaSignal || "핵심권역"} ${doc?.assetType || "상업용부동산"} ${
        doc?.priceBand || ""
      } 핵심 투자 검토 자료`;

    if (typeof window !== "undefined" && (window as any).Kakao?.Share) {
      try {
        const kakao = (window as any).Kakao;
        if (!kakao.isInitialized()) {
          const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
          if (appKey) kakao.init(appKey);
        }
        kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: shareTitle,
            description: shareDesc.slice(0, 100),
            imageUrl: ogImageUrl,
            imageWidth: 1200,
            imageHeight: 630,
            link: {
              webUrl: currentUrl,
              mobileWebUrl: currentUrl,
            },
          },
          buttons: [
            {
              title: "투자설명서 보기",
              link: {
                webUrl: currentUrl,
                mobileWebUrl: currentUrl,
              },
            },
          ],
        });
        toast.success("카카오톡 공유 창이 열렸습니다.");
        return;
      } catch (err) {
        console.warn("Kakao share failed:", err);
      }
    }

    // Fallback: Copy link via WebView-safe copyText
    const ok = await copyText(currentUrl);
    if (ok) {
      setCopied(true);
      toast.success("링크가 복사되었습니다. 카카오톡에 붙여넣기 하세요.");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(COPY_FAILED_MESSAGE);
    }
  };

  const handleShare = async () => {
    const rawUrl = typeof window !== "undefined" ? window.location.href : "";
    const url = await resolveTokenizedShareUrl(rawUrl);
    if (!url) return;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        if ((err as { name?: string } | null)?.name === "AbortError") return;
      }
    }
    const ok = await copyText(url);
    if (ok) {
      setCopied(true);
      toast.success("링크가 클립보드에 복사되었습니다.");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(COPY_FAILED_MESSAGE);
    }
  };

  const handleCopyCurrentUrl = async () => {
    const currentUrl = typeof window !== "undefined" ? window.location.href : "";
    const ok = await copyText(currentUrl);
    if (ok) {
      setCopied(true);
      toast.success("링크가 클립보드에 복사되었습니다.");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(COPY_FAILED_MESSAGE);
    }
  };

  const handlePdf = () => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    if (isInAppWebView(ua)) {
      setInAppWebView(true);
      setShowInAppDownloadEscape(true);
    }
    const effectiveToken = resolveEffectiveToken();
    const params = new URLSearchParams();
    if (docId) params.set("doc_id", docId);
    params.set("tier", tier);
    if (effectiveToken) params.set("token", effectiveToken);
    window.open(
      `/api/public/im-lite/${encodeURIComponent(buildingId)}/export?${params.toString()}`,
      "_blank",
      "noopener"
    );
  };

  const handlePptxDownload = (presetKey?: string) => {
    setPptxLoading(true);
    const preset = presetKey || selectedPreset;
    const effectiveToken = resolveEffectiveToken();
    const prebuiltUrl = (doc as any)?.pptxDownloadUrl;
    const grantId = (doc as any)?.grantId;
    const targetUrl =
      typeof prebuiltUrl === "string" && prebuiltUrl.trim()
        ? prebuiltUrl.trim()
        : typeof grantId === "string" && grantId.trim()
        ? `/api/public/im-pro/${encodeURIComponent(grantId.trim())}/pptx${
            effectiveToken ? `?token=${encodeURIComponent(effectiveToken)}` : ""
          }`
        : `/api/public/im-lite/${encodeURIComponent(buildingId)}/pptx?preset=${encodeURIComponent(preset)}${
            docId ? `&doc_id=${encodeURIComponent(docId)}&tier=${tier}` : `&tier=${tier}`
          }${effectiveToken ? `&token=${encodeURIComponent(effectiveToken)}` : ""}`;

    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    if (isInAppWebView(ua)) {
      setInAppWebView(true);
      setShowInAppDownloadEscape(true);
      toast.info(
        "앱 내 브라우저에서는 파일 다운로드가 제한될 수 있습니다. 외부 브라우저(Safari/Chrome)로 열기를 이용해 주세요."
      );
    }

    try {
      window.location.assign(targetUrl);
    } catch {
      window.open(targetUrl, "_blank", "noopener,noreferrer");
    }
    setIsPresetMenuOpen(false);
    setTimeout(() => setPptxLoading(false), 500);
  };

  const handleProRequest = async () => {
    if (requestingPro) return;
    setRequestingPro(true);
    try {
      const res = await fetch("/api/public/teaser/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "intent.pro_request",
          buildingId,
          docId,
        }),
      });
      if (res.ok) {
        toast.success("Pro 버전 요청이 접수되었습니다.");
      } else {
        toast.error("요청 중 오류가 발생했습니다.");
      }
    } catch {
      toast.error("요청 중 오류가 발생했습니다.");
    } finally {
      setRequestingPro(false);
    }
  };

  const currentPresetInfo =
    availablePresets.find((p) => p.id === selectedPreset) || availablePresets[0];

  return (
    <div
      data-keyboard-hidden={shouldHideBar ? "true" : "false"}
      className={`fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-t border-[#CBD5E1] safe-area-bottom pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(15,23,42,0.08)] transition-all duration-200 ${
        shouldHideBar ? "translate-y-full opacity-0 pointer-events-none" : ""
      }`}
    >
      {showInAppDownloadEscape && (
        <div
          data-testid="inapp-download-escape-banner"
          role="status"
          aria-live="polite"
          className="bg-[#FFFBEB] border-b border-[#F59E0B]/50 px-4 py-2.5 text-sm text-[#78350F] max-w-2xl mx-auto"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">
              카카오톡 등 인앱 브라우저에서 파일 저장이 열리지 않으면 외부 브라우저로 열어 저장해 주세요.
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-testid="inapp-download-external-btn"
                onClick={() => void handleOpenExternalBrowser()}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0F172A] text-white text-sm font-extrabold hover:bg-[#1E293B] transition-colors cursor-pointer"
              >
                외부 브라우저(Safari/Chrome)에서 저장 ↗
              </button>
              <button
                type="button"
                onClick={() => void handleCopyCurrentUrl()}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-white border border-[#F59E0B] text-[#92400E] text-sm font-bold hover:bg-[#FEF3C7] transition-colors cursor-pointer"
              >
                링크 복사
              </button>
              <button
                type="button"
                aria-label="다운로드 안내 배너 닫기"
                onClick={() => setShowInAppDownloadEscape(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#92400E] hover:bg-[#FEF3C7] font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {inAppWebView && (
        <div
          data-testid="fab-inapp-webview-banner"
          className="bg-[#FEF3C7] border-b border-[#F59E0B]/40 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-sm text-[#78350F] max-w-2xl mx-auto"
        >
          <span>앱 내 브라우저에서는 PPTX 파일 저장이 차단될 수 있습니다.</span>
          <button
            type="button"
            onClick={() => void handleOpenExternalBrowser()}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0F172A] text-white text-sm font-extrabold hover:bg-[#1E293B] transition-colors cursor-pointer"
          >
            외부 브라우저(Safari/Chrome)로 열기
          </button>
        </div>
      )}

      {/* Broker mode switcher bar */}
      {isBroker && (
        <div className="bg-[#FAF9F5] border-b border-[#E2E8F0] px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-sm max-w-2xl mx-auto">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isBrokerMode ? "bg-amber-500" : "bg-[#1D4ED8]"
              } animate-pulse`}
            ></span>
            <span className="font-bold text-[#0F172A]">
              {isBrokerMode ? "💼 중개인 전용 도구" : "👁️ 매수자 열람 화면 미리보기"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsBrokerMode(!isBrokerMode)}
              className="min-h-[44px] inline-flex items-center text-[#475569] hover:text-[#0F172A] underline underline-offset-2 transition-colors font-semibold cursor-pointer"
            >
              {isBrokerMode ? "👁️ 매수자 시점 전환" : "💼 중개인 도구 전환"}
            </button>
            <Link
              href={`/broker/basic-im-studio/${buildingId}?preset=${encodeURIComponent(selectedPreset)}`}
              className="min-h-[44px] inline-flex items-center text-[#B45309] hover:text-[#92400E] underline underline-offset-2 transition-colors font-extrabold"
            >
              📐 PPTX 슬라이드 스튜디오
            </Link>
            {docId && (
              <Link
                href={`/broker/w/im?buildingId=${encodeURIComponent(buildingId)}`}
                className="min-h-[44px] inline-flex items-center text-[#1D4ED8] hover:underline transition-colors font-bold"
              >
                ✏️ IM 승인·편집
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Main Buttons */}
      <div className="px-4 py-2.5 flex flex-wrap sm:flex-nowrap items-center gap-2 max-w-2xl mx-auto">
        {isBrokerMode ? (
          /* ───────── 중개인 뷰 (Broker View) ───────── */
          <>
            {/* 카카오톡 공유 버튼 */}
            <button
              type="button"
              onClick={() => void handleKakaoShare()}
              className="min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#FEE500] hover:bg-[#FDD835] text-[#3C1E1E] text-sm font-black rounded-xl transition-all shadow-xs active:scale-95 shrink-0 cursor-pointer"
              title="카카오톡으로 모바일 IM 공유"
            >
              <svg
                className="w-4 h-4 shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2C6.48 2 2 5.82 2 10.5c0 2.95 1.95 5.55 4.88 7.04-.15.57-.78 2.96-.81 3.13 0 0-.02.12.06.17.08.04.17.01.17.01.22-.03 2.58-1.71 3.66-2.43.64.09 1.33.14 2.04.14 5.52 0 10-3.82 10-8.56C22 5.82 17.52 2 12 2z" />
              </svg>
              <span className="hidden sm:inline">카톡 공유</span>
            </button>

            {/* Primary CTA: 슬라이드 미리보기 · 편집 후 다운로드 */}
            <Link
              href={`/broker/basic-im-studio/${buildingId}?preset=${encodeURIComponent(selectedPreset)}`}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 py-2.5 px-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 text-sm font-black rounded-xl transition-all shadow-xs active:scale-95 truncate"
              title="10면 슬라이드 실시간 미리보기 · 편집 후 PPTX 다운로드"
            >
              <span>📐</span>
              <span className="truncate">슬라이드 미리보기·편집</span>
            </Link>

            {/* Secondary CTA: PPTX 바로 다운로드 & 프리셋 드롭다운 */}
            <div className="relative shrink-0" ref={dropdownRef}>
              <div className="flex rounded-xl overflow-hidden shadow-xs border border-[#CBD5E1] bg-white">
                <button
                  type="button"
                  onClick={() => handlePptxDownload()}
                  className="min-h-[44px] py-2.5 px-2.5 bg-white hover:bg-slate-50 text-[#0F172A] text-sm font-extrabold transition-colors flex items-center justify-center gap-1 truncate cursor-pointer"
                  title="선택된 프리셋으로 PPTX 바로 다운로드"
                  disabled={pptxLoading}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-300"
                    style={{ background: currentPresetInfo.accent }}
                  />
                  <span className="truncate">
                    {pptxLoading ? "⏳" : `⚡ 바로 받기`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPresetMenuOpen(!isPresetMenuOpen)}
                  className="min-h-[44px] px-2.5 bg-slate-50 hover:bg-slate-100 text-[#475569] hover:text-[#0F172A] border-l border-[#CBD5E1] transition-colors flex items-center justify-center cursor-pointer"
                  title="PPTX 템플릿 프리셋 선택"
                  aria-expanded={isPresetMenuOpen}
                >
                  <span
                    className={`transform transition-transform text-sm ${
                      isPresetMenuOpen ? "rotate-180" : ""
                    }`}
                  >
                    ▼
                  </span>
                </button>
              </div>

              {/* 프리셋 선택 팝오버 메뉴 */}
              {isPresetMenuOpen && (
                <div className="absolute bottom-full mb-2 right-0 w-72 bg-white border border-[#CBD5E1] rounded-xl shadow-2xl p-2.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <div className="px-2 py-1.5 border-b border-[#E2E8F0] mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-bold text-[#0F172A]">
                      🎨 PPTX 템플릿 프리셋
                    </span>
                    <span className="text-sm font-bold text-[#1D4ED8]">{availablePresets.length}개 스타일</span>
                  </div>
                  <Link
                    href={`/broker/basic-im-studio/${buildingId}?preset=${encodeURIComponent(selectedPreset)}`}
                    className="mb-2 w-full min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#FFFBEB] hover:bg-[#FEF3C7] border border-[#F59E0B]/40 text-[#92400E] text-sm font-extrabold transition-colors"
                  >
                    <span>📐</span>
                    <span>슬라이드 스튜디오에서 미리보기 · 편집</span>
                  </Link>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {availablePresets.map((preset) => (
                      <button
                        type="button"
                        key={preset.id}
                        onClick={() => {
                          setSelectedPreset(preset.id);
                          handlePptxDownload(preset.id);
                        }}
                        className={`w-full min-h-[44px] text-left px-2.5 py-2 rounded-lg text-sm transition-colors flex flex-col gap-0.5 cursor-pointer ${
                          selectedPreset === preset.id
                            ? "bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]"
                            : "hover:bg-slate-50 text-[#0F172A]"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-300"
                              style={{ background: preset.accent }}
                            />
                            <span className="font-bold">{preset.label}</span>
                          </div>
                          {selectedPreset === preset.id && (
                            <span className="text-sm font-black text-[#1D4ED8]">✓</span>
                          )}
                        </div>
                        <span className="text-sm text-[#64748B] pl-4">
                          {preset.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* PDF 다운로드 버튼 */}
            <button
              type="button"
              onClick={handlePdf}
              title="PDF 다운로드"
              className="min-h-[44px] px-3 py-2.5 bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#0F172A] text-sm font-bold rounded-xl transition-colors shrink-0 cursor-pointer"
            >
              📄 PDF
            </button>

            {/* 링크 복사 버튼 */}
            <button
              type="button"
              onClick={handleShare}
              title="링크 복사"
              aria-label="링크 복사"
              className="min-h-[44px] min-w-[44px] px-3 py-2.5 bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#475569] hover:text-[#0F172A] text-sm font-bold rounded-xl transition-colors shrink-0 cursor-pointer"
            >
              {copied ? "✅" : "🔗"}
            </button>
          </>
        ) : (
          /* ───────── 일반 매수자 뷰 (Buyer View) ───────── */
          <>
            <PhoneActionButton
              phone={brokerPhone}
              variant="compact"
              callLabel="📞 직통 전화"
              className="flex-1 flex items-center gap-1.5 min-w-0"
              callClassName="flex-1 flex items-center justify-center gap-1.5 min-h-[48px] py-3 px-3 bg-[#065F46] hover:bg-[#047857] text-white text-sm font-bold rounded-xl transition-colors shadow-xs whitespace-nowrap"
              copyClassName="hidden sm:inline-flex min-h-[48px] shrink-0 items-center justify-center gap-1.5 px-3 py-3 bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#0F172A] text-sm font-bold rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            />
            {validKakaoChannelUrl ? (
              <a
                href={validKakaoChannelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 min-h-[48px] py-3 bg-[#FEE500] hover:bg-[#FDD835] text-[#3C1E1E] text-sm font-bold rounded-xl transition-colors shadow-xs"
              >
                💬 카톡 상담
              </a>
            ) : (
              onInquire && (
                <button
                  type="button"
                  onClick={onInquire}
                  className="flex-1 flex items-center justify-center gap-1.5 min-h-[48px] py-3 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-sm font-bold rounded-xl transition-colors shadow-xs cursor-pointer"
                >
                  📩 간편 문의 · 자료 요청
                </button>
              )
            )}
            <button
              type="button"
              onClick={handlePdf}
              title="PDF 다운로드"
              className="min-h-[48px] px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#0F172A] text-sm font-bold rounded-xl transition-colors cursor-pointer"
            >
              📄 PDF
            </button>
            <button
              type="button"
              onClick={() => handlePptxDownload()}
              title="PPTX 다운로드"
              disabled={pptxLoading}
              className="min-h-[48px] px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#0F172A] text-sm font-bold rounded-xl transition-colors cursor-pointer"
            >
              {pptxLoading ? "⏳" : "📊"} PPTX
            </button>
            <button
              type="button"
              onClick={handleShare}
              title="공유하기"
              aria-label="링크 복사"
              className="min-h-[48px] min-w-[48px] px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#475569] hover:text-[#0F172A] text-sm font-bold rounded-xl transition-colors cursor-pointer"
            >
              {copied ? "✅" : "🔗"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

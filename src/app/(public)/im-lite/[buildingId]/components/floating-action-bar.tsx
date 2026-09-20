"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { MobileIMDocument } from "@/lib/demo/mobile-im-demo-data";

export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-lg transition-colors"
    >
      {copied ? (
        <>
          <svg
            className="w-3.5 h-3.5 text-green-400"
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
          <span className="text-green-400">복사됨</span>
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
    id: "golden_institutional",
    label: "🏛️ 기관투자형 골드",
    desc: "신뢰감 있는 기관 투자용",
  },
  {
    id: "credeal_signature",
    label: "💎 시그니처 모던",
    desc: "모던 & 트렌디 스타일",
  },
  {
    id: "executive_gold",
    label: "👑 이그제큐티브 골드",
    desc: "프리미엄 네이비 & 골드",
  },
  {
    id: "corporate_clean",
    label: "🏢 코퍼레이트 클린",
    desc: "깔끔하고 세련된 네이비",
  },
  {
    id: "pro_dark_obsidian",
    label: "🌑 다크 옵시디언",
    desc: "고급스러운 다크 테마",
  },
  {
    id: "credeal_basic",
    label: "📋 표준 Basic IM",
    desc: "기본 브로커 IM 스타일",
  },
  {
    id: "minimal_clean",
    label: "📄 미니멀 클린",
    desc: "심플하고 단정한 스타일",
  },
];

interface FloatingActionBarProps {
  title: string;
  buildingId: string;
  docId?: string;
  tier?: "basic" | "pro";
  brokerPhone?: string;
  onInquire?: () => void;
  isBroker?: boolean;
  doc?: MobileIMDocument | null;
}

export function FloatingActionBar({
  title,
  buildingId,
  docId,
  tier = "basic",
  brokerPhone,
  onInquire,
  isBroker = false,
  doc,
}: FloatingActionBarProps) {
  const [copied, setCopied] = useState(false);
  const [requestingPro, setRequestingPro] = useState(false);
  const [isBrokerMode, setIsBrokerMode] = useState(isBroker);
  const [selectedPreset, setSelectedPreset] = useState("golden_institutional");
  const [isPresetMenuOpen, setIsPresetMenuOpen] = useState(false);
  const [pptxLoading, setPptxLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const handleKakaoShare = () => {
    const currentUrl =
      typeof window !== "undefined"
        ? window.location.href
        : `https://credeal.net/im-lite/${buildingId}${
            docId ? `?doc=${docId}` : ""
          }`;
    const ogImageUrl = `https://credeal.net/api/og/deal/${buildingId}?type=im&t=${Date.now()}`;
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

    // Fallback: Copy link
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    toast.success("링크가 복사되었습니다. 카카오톡에 붙여넣기 하세요.");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Fall through
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("링크가 클립보드에 복사되었습니다.");
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePdf = () => {
    window.open(
      `/api/public/im-lite/${buildingId}/export${
        docId ? `?doc_id=${docId}&tier=${tier}` : `?tier=${tier}`
      }`,
      "_blank",
      "noopener"
    );
  };

  const handlePptxDownload = (presetKey?: string) => {
    setPptxLoading(true);
    const preset = presetKey || selectedPreset;
    const targetUrl = `/api/public/im-lite/${buildingId}/pptx?preset=${preset}${
      docId ? `&doc_id=${docId}&tier=${tier}` : `&tier=${tier}`
    }`;
    window.open(targetUrl, "_blank", "noopener");
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
    PPTX_PRESETS.find((p) => p.id === selectedPreset) || PPTX_PRESETS[0];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-900/95 backdrop-blur border-t border-neutral-800 safe-area-bottom shadow-2xl">
      {/* Broker mode switcher bar */}
      {isBroker && (
        <div className="bg-neutral-950/90 border-b border-neutral-800 px-4 py-1.5 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isBrokerMode ? "bg-amber-400" : "bg-blue-400"
              } animate-pulse`}
            ></span>
            <span className="font-bold text-neutral-300">
              {isBrokerMode ? "💼 중개인 전용 모드" : "👁️ 매수자 시점 화면"}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href={`/broker/deal-card/${buildingId}`}
              className="text-neutral-400 hover:text-white transition-colors"
            >
              딜카드
            </Link>
            <Link
              href={`/broker/matching?buildingId=${buildingId}`}
              className="text-neutral-400 hover:text-primary transition-colors"
            >
              매칭
            </Link>
            <Link
              href={`/broker/tenant-intents?buildingId=${buildingId}`}
              className="text-neutral-400 hover:text-blue-400 transition-colors"
            >
              임차의향
            </Link>
            <button
              onClick={() => setIsBrokerMode(!isBrokerMode)}
              className="text-neutral-400 hover:text-white underline underline-offset-2 transition-colors font-medium"
            >
              {isBrokerMode ? "👁️ 매수자시점" : "💼 중개인모드"}
            </button>
            {docId && (
              <Link
                href={`/broker/im-approval/${docId}`}
                className="text-primary hover:underline transition-colors font-semibold"
              >
                ✏️ IM 승인·편집
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Main Buttons */}
      <div className="px-4 py-2.5 flex items-center gap-2 max-w-2xl mx-auto">
        {isBrokerMode ? (
          /* ───────── 중개인 뷰 (Broker View) ───────── */
          <>
            {/* 카카오톡 공유 버튼 */}
            <button
              onClick={handleKakaoShare}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-[#FEE500] hover:bg-[#FDD835] text-[#3C1E1E] text-xs sm:text-sm font-black rounded-xl transition-all shadow-md active:scale-95"
              title="카카오톡으로 모바일 IM 공유"
            >
              <svg
                className="w-4 h-4 shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2C6.48 2 2 5.82 2 10.5c0 2.95 1.95 5.55 4.88 7.04-.15.57-.78 2.96-.81 3.13 0 0-.02.12.06.17.08.04.17.01.17.01.22-.03 2.58-1.71 3.66-2.43.64.09 1.33.14 2.04.14 5.52 0 10-3.82 10-8.56C22 5.82 17.52 2 12 2z" />
              </svg>
              <span>카카오톡 공유</span>
            </button>

            {/* PPTX 프리셋 드롭다운 & 다운로드 버튼 */}
            <div className="relative flex-1" ref={dropdownRef}>
              <div className="flex rounded-xl overflow-hidden shadow-sm border border-neutral-700 bg-neutral-800">
                <button
                  onClick={() => handlePptxDownload()}
                  className="flex-1 py-3 px-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1 truncate"
                  title="선택된 프리셋으로 PPTX 다운로드"
                  disabled={pptxLoading}
                >
                  <span className="truncate">
                    {pptxLoading ? "⏳ 로딩중..." : `📊 PPTX (${currentPresetInfo.label.split(" ")[1] || "다운로드"})`}
                  </span>
                </button>
                <button
                  onClick={() => setIsPresetMenuOpen(!isPresetMenuOpen)}
                  className="px-2.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 hover:text-white border-l border-neutral-600 transition-colors flex items-center justify-center"
                  title="PPTX 템플릿 프리셋 선택"
                  aria-expanded={isPresetMenuOpen}
                >
                  <span
                    className={`transform transition-transform text-xs ${
                      isPresetMenuOpen ? "rotate-180" : ""
                    }`}
                  >
                    ▼
                  </span>
                </button>
              </div>

              {/* 프리셋 선택 팝오버 메뉴 */}
              {isPresetMenuOpen && (
                <div className="absolute bottom-full mb-2 right-0 w-64 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <div className="px-2 py-1.5 border-b border-neutral-800 mb-1 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-neutral-400">
                      🎨 PPTX 템플릿 프리셋
                    </span>
                    <span className="text-[9px] text-primary">6개 스타일</span>
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {PPTX_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          setSelectedPreset(preset.id);
                          handlePptxDownload(preset.id);
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors flex flex-col gap-0.5 ${
                          selectedPreset === preset.id
                            ? "bg-primary/20 text-primary border border-primary/30"
                            : "hover:bg-neutral-800 text-neutral-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold">{preset.label}</span>
                          {selectedPreset === preset.id && (
                            <span className="text-xs">✓</span>
                          )}
                        </div>
                        <span className="text-xs text-neutral-500">
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
              onClick={handlePdf}
              title="PDF 다운로드"
              className="px-3 py-3 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl transition-colors shrink-0"
            >
              📄 PDF
            </button>

            {/* 링크 복사 버튼 */}
            <button
              onClick={handleShare}
              title="링크 복사"
              aria-label="링크 복사"
              className="px-3 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold rounded-xl transition-colors shrink-0"
            >
              {copied ? "✅" : "🔗"}
            </button>
          </>
        ) : (
          /* ───────── 일반 매수자 뷰 (Buyer View) ───────── */
          <>
            {brokerPhone && (
              <a
                href={`tel:${brokerPhone}`}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
              >
                📞 직통 전화
              </a>
            )}
            {onInquire && (
              <button
                onClick={onInquire}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-primary hover:bg-primary/90 text-black text-sm font-bold rounded-xl transition-colors shadow-sm"
              >
                💬 비밀 상담
              </button>
            )}
            <button
              onClick={handlePdf}
              title="PDF 다운로드"
              className="px-3 py-3 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl transition-colors"
            >
              📄 PDF
            </button>
            <button
              onClick={() => handlePptxDownload()}
              title="PPTX 다운로드"
              disabled={pptxLoading}
              className="px-3 py-3 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl transition-colors"
            >
              {pptxLoading ? "⏳" : "📊"} PPTX
            </button>
            <button
              onClick={handleShare}
              title="공유하기"
              aria-label="링크 복사"
              className="px-3 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold rounded-xl transition-colors"
            >
              {copied ? "✅" : "🔗"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { Link2, MessageCircle, Download, QrCode, X, Check } from "lucide-react";

/* ── 카카오 SDK 전역 타입 ── */
declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean;
      init: (key: string) => void;
      Share: {
        sendDefault: (options: Record<string, unknown>) => void;
      };
    };
  }
}

interface VibeShareSheetProps {
  slug: string;
  cardTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

interface ShareOption {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

export function VibeShareSheet({ slug, cardTitle, isOpen, onClose }: VibeShareSheetProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [kakaoReady, setKakaoReady] = useState(false);

  /* ── 카카오 SDK 로드 ── */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const initKakao = () => {
      const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
      if (window.Kakao && !window.Kakao.isInitialized() && appKey) {
        window.Kakao.init(appKey);
      }
      setKakaoReady(!!(window.Kakao?.isInitialized()));
    };

    if (window.Kakao) {
      initKakao();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";
    script.async = true;
    script.onload = initKakao;
    document.head.appendChild(script);
  }, []);

  const siteUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://credeal.net";

  const cardUrl = `${siteUrl}/vibe-card/${slug}`;
  const ogImageUrl = `${siteUrl}/api/og/vibe-card/${slug}`;
  const kakaoText = `[DealCard 명함]\n\n${cardTitle}\n\n🔗 ${cardUrl}\n\n📊 Vibe AI가 분석한 전문 중개인 프로필을 확인하세요.`;

  /* ── 클립보드 복사 ── */
  const copyToClipboard = useCallback(
    async (text: string, id: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    },
    [],
  );

  /* ── 카카오 SDK 공유 ── */
  const shareViaKakaoSDK = useCallback(() => {
    if (!kakaoReady || !window.Kakao?.Share) return false;
    try {
      window.Kakao.Share.sendDefault({
        objectType: "feed",
        content: {
          title: `🏡 ${cardTitle}`,
          description: "Vibe AI가 분석한 전문 중개인 프로필을 확인하세요.",
          imageUrl: ogImageUrl,
          link: {
            mobileWebUrl: cardUrl,
            webUrl: cardUrl,
          },
        },
        buttons: [
          {
            title: "명함 보기",
            link: {
              mobileWebUrl: cardUrl,
              webUrl: cardUrl,
            },
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  }, [kakaoReady, cardTitle, ogImageUrl, cardUrl]);

  /* ── 액션 핸들러 ── */
  const handleAction = useCallback(
    (id: string) => {
      switch (id) {
        case "url":
          copyToClipboard(cardUrl, "url");
          break;

        case "kakao":
          // SDK 사용 가능 → 리치 공유 팝업
          if (kakaoReady && shareViaKakaoSDK()) {
            setCopied("kakao");
            setTimeout(() => setCopied(null), 2000);
          } else {
            // SDK 없을 때 → Web Share API → 클립보드 복사 순서로 fallback
            if (navigator.share) {
              navigator
                .share({
                  title: cardTitle,
                  text: "Vibe AI가 분석한 전문 중개인 프로필을 확인하세요.",
                  url: cardUrl,
                })
                .catch(() => copyToClipboard(kakaoText, "kakao"));
            } else {
              copyToClipboard(kakaoText, "kakao");
            }
          }
          break;

        case "download":
          window.print();
          break;

        case "qr":
          setShowQr((p) => !p);
          break;
      }
    },
    [cardUrl, kakaoText, cardTitle, kakaoReady, shareViaKakaoSDK, copyToClipboard],
  );

  const options: ShareOption[] = [
    {
      id: "url",
      label: "URL 복사",
      description: "명함 링크를 복사합니다",
      icon: <Link2 size={20} />,
      color: "#3b82f6",
    },
    {
      id: "kakao",
      label: kakaoReady ? "카카오톡 공유" : "카톡 문구 복사",
      description: kakaoReady ? "카카오톡 공유 팝업 열기" : "전문 소개 문구를 복사합니다",
      icon: (
        <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
          <path d="M12 3C6.48 3 2 6.58 2 11c0 2.77 1.7 5.22 4.29 6.73L5.14 21l4.27-2.24A11.5 11.5 0 0 0 12 19c5.52 0 10-3.58 10-8S17.52 3 12 3z" />
        </svg>
      ),
      color: "#fbbf24",
    },
    {
      id: "download",
      label: "이미지 저장",
      description: "명함 카드를 이미지로 저장합니다",
      icon: <Download size={20} />,
      color: "#10b981",
    },
    {
      id: "qr",
      label: "QR 코드 보기",
      description: "QR 코드를 표시합니다",
      icon: <QrCode size={20} />,
      color: "#8b5cf6",
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ── Backdrop ── */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* ── Bottom Sheet ── */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
          >
            <div className="rounded-t-3xl bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
              {/* ── Handle bar ── */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              </div>

              {/* ── Header ── */}
              <div className="flex items-center justify-between px-6 pt-2 pb-4">
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    명함 공유
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {cardTitle}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800
                             transition-colors"
                  aria-label="닫기"
                >
                  <X size={18} className="text-zinc-400" />
                </button>
              </div>

              {/* ── SDK 상태 뱃지 ── */}
              {kakaoReady && (
                <div className="px-6 pb-3">
                  <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    카카오 SDK 연결됨 — 리치 공유 활성
                  </div>
                </div>
              )}

              {/* ── Share Options Grid ── */}
              <div className="px-6 pb-4 grid grid-cols-2 gap-3">
                {options.map((opt) => {
                  const isCopied = copied === opt.id;
                  return (
                    <motion.button
                      key={opt.id}
                      onClick={() => handleAction(opt.id)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-2xl",
                        "border border-zinc-100 dark:border-zinc-800",
                        "hover:border-zinc-200 dark:hover:border-zinc-700",
                        "transition-all duration-200 active:scale-[0.97]",
                        "bg-zinc-50/50 dark:bg-zinc-800/50",
                        // 카카오 버튼 강조
                        opt.id === "kakao" && kakaoReady
                          ? "border-amber-200 dark:border-amber-700/40 bg-amber-50/50 dark:bg-amber-900/10"
                          : "",
                      )}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${opt.color}18`, color: opt.color }}
                      >
                        {isCopied ? <Check size={20} /> : opt.icon}
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          {isCopied ? "완료! ✓" : opt.label}
                        </p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                          {opt.description}
                        </p>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {/* ── QR Code Display ── */}
              <AnimatePresence>
                {showQr && (
                  <motion.div
                    className="px-6 pb-6"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-100
                                    dark:border-zinc-700 p-6 flex flex-col items-center gap-3">
                      {/* QR 이미지: Google Charts API (외부 라이브러리 없이) */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${encodeURIComponent(cardUrl)}&choe=UTF-8`}
                        alt="QR Code"
                        className="w-32 h-32 rounded-xl"
                        loading="lazy"
                      />
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 text-center break-all max-w-[220px]">
                        {cardUrl}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Safe area spacer (mobile) ── */}
              <div className="h-[env(safe-area-inset-bottom,0px)]" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

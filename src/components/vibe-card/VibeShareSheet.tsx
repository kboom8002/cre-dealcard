"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { Link2, MessageCircle, Download, QrCode, X, Check } from "lucide-react";

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

  const cardUrl = typeof window !== "undefined"
    ? `${window.location.origin}/vibe-card/${slug}`
    : `/vibe-card/${slug}`;

  const kakaoText = `[DealCard 명함]\n\n${cardTitle}\n\n🔗 ${cardUrl}\n\n📊 Vibe AI가 분석한 전문 중개인 프로필을 확인하세요.`;

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
      label: "카카오톡 문구 복사",
      description: "전문 소개 문구를 복사합니다",
      icon: <MessageCircle size={20} />,
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

  const handleAction = useCallback(
    (id: string) => {
      switch (id) {
        case "url":
          copyToClipboard(cardUrl, "url");
          break;
        case "kakao":
          copyToClipboard(kakaoText, "kakao");
          break;
        case "download":
          window.print();
          break;
        case "qr":
          setShowQr((p) => !p);
          break;
      }
    },
    [cardUrl, kakaoText, copyToClipboard],
  );

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
                          {isCopied ? "복사됨! ✓" : opt.label}
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
                      {/* Simple text QR placeholder */}
                      <div
                        className="w-32 h-32 rounded-xl border-2 border-dashed border-zinc-300
                                   dark:border-zinc-600 flex items-center justify-center"
                      >
                        <div className="text-center">
                          <QrCode size={40} className="mx-auto text-zinc-400 dark:text-zinc-500 mb-1" />
                          <p className="text-[9px] text-zinc-400 dark:text-zinc-500">QR Code</p>
                        </div>
                      </div>
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

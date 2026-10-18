"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { SOTA_SPRING } from "@/components/motion/sota-motion";

const TOP_NAV_LINKS = [
  { href: "/broker", label: "🏠 홈 화면", exact: true },
  { href: "/broker/buildings", label: "🏢 내 물건 목록", exact: false },
  { href: "/broker/deal-card/new", label: "➕ 새 물건 등록", exact: true },
  { href: "/broker/magazine-editor?mode=simple", label: "📰 고객 소식지", exact: false },
] as const;

export function BrokerSeniorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isPaperMode, setIsPaperMode] = useState(true);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("credeal-broker-paper-mode");
      if (saved === "false") {
        setIsPaperMode(false);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const toggleMode = () => {
    const next = !isPaperMode;
    setIsPaperMode(next);
    try {
      window.localStorage.setItem("credeal-broker-paper-mode", String(next));
    } catch {
      // ignore storage errors
    }
  };

  return (
    <div
      className={
        isPaperMode
          ? "broker-paper-theme min-h-screen bg-[#F3F2EE] text-[#0F172A] transition-colors"
          : "min-h-screen bg-[#090D16] text-white transition-colors"
      }
    >
      {/* 60대 PC 중개인 맞춤형 상단 글로벌 내비게이션 바 */}
      <header
        id="broker-senior-topbar"
        className={
          isPaperMode
            ? "sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-300 shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
            : "sticky top-0 z-50 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 shadow-sm"
        }
      >
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {TOP_NAV_LINKS.map((item) => {
              const baseHref = item.href.split("?")[0];
              const isActive = item.exact
                ? pathname === baseHref
                : pathname.startsWith(baseHref);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    isActive
                      ? "relative px-3.5 py-2 min-h-[42px] inline-flex items-center rounded-xl text-[15px] sm:text-[16px] font-extrabold text-white transition-colors"
                      : isPaperMode
                      ? "relative px-3.5 py-2 min-h-[42px] inline-flex items-center rounded-xl text-[15px] sm:text-[16px] font-bold text-slate-800 hover:bg-slate-100 border border-slate-200/90 bg-white/80 transition-colors"
                      : "relative px-3.5 py-2 min-h-[42px] inline-flex items-center rounded-xl text-[15px] sm:text-[16px] font-bold text-slate-200 hover:bg-slate-800 border border-slate-700 transition-colors"
                  }
                >
                  {isActive && (
                    <motion.span
                      layoutId="broker-top-nav-active-pill"
                      transition={SOTA_SPRING}
                      className="absolute inset-0 rounded-xl bg-blue-700 shadow-sm"
                    />
                  )}
                  <span className="relative z-10">{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/broker/tutorial"
              id="broker-top-tutorial-btn"
              data-testid="broker-top-tutorial-btn"
              className={
                pathname.startsWith("/broker/tutorial")
                  ? "px-3.5 py-2 min-h-[42px] inline-flex items-center gap-1.5 rounded-xl text-[14px] sm:text-[15px] font-extrabold bg-emerald-700 text-white shadow-sm transition-colors"
                  : isPaperMode
                  ? "px-3.5 py-2 min-h-[42px] inline-flex items-center gap-1.5 rounded-xl text-[14px] sm:text-[15px] font-extrabold bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 transition-colors"
                  : "px-3.5 py-2 min-h-[42px] inline-flex items-center gap-1.5 rounded-xl text-[14px] sm:text-[15px] font-extrabold bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 transition-colors"
              }
              title="화면 캡처와 동영상으로 배우는 단계별 사용 설명서"
            >
              <span>📖 쉬운 사용법 안내</span>
            </Link>

            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={toggleMode}
              data-testid="broker-theme-toggle-btn"
              className={
                isPaperMode
                  ? "px-3.5 py-2 min-h-[42px] inline-flex items-center gap-1.5 rounded-xl text-[14px] font-extrabold bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 shadow-2xs transition-colors shrink-0"
                  : "px-3.5 py-2 min-h-[42px] inline-flex items-center gap-1.5 rounded-xl text-[14px] font-extrabold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 transition-colors shrink-0"
              }
              title="눈이 편안한 밝은 종이 화면과 어두운 화면을 전환합니다"
            >
              <span>{isPaperMode ? "☀️ 큰글씨 밝은 화면 (켜짐)" : "🌙 어두운 화면 (켜짐)"}</span>
            </motion.button>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}


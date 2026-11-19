"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import { SOTA_SPRING } from "@/components/motion/sota-motion";
import { SeniorHelpProvider, useSeniorHelp } from "@/components/help/SeniorHelpContext";
import { ContextualHelpDrawer } from "@/components/help/ContextualHelpDrawer";
import { QuickFeedbackReportModal } from "@/components/help/QuickFeedbackReportModal";

const TOP_NAV_LINKS = [
  { id: "home", href: "/broker", label: "🏠 홈", exact: true },
  { id: "dealcards", href: "/broker/w/dealcards", label: "📄 딜카드", exact: false },
  { id: "im", href: "/broker/w/im", label: "📊 IM", exact: false },
  { id: "magazine", href: "/broker/w/newsletter", label: "📰 뉴스레터", exact: false },
  { id: "inbox", href: "/broker/w/inbox", label: "💬 소통함", exact: false },
] as const;

function BrokerSeniorLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // D3: broker 화면은 시니어 가독성과 회귀 방지를 위해 밝은(Paper) 화면 단일 테마로 고정
  const isPaperMode = true;
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const { helperEnabled, toggleHelperEnabled, openHelpDrawer } = useSeniorHelp();

  useEffect(() => {
    const onOpenFeedback = () => setIsFeedbackOpen(true);
    window.addEventListener("credeal:open-feedback", onOpenFeedback);
    return () => window.removeEventListener("credeal:open-feedback", onOpenFeedback);
  }, []);

  return (
    <div className="broker-paper-theme min-h-screen max-w-full overflow-x-clip bg-[#F5F5F7] text-[#1D1D1F] transition-colors">
      {/* Apple iOS 18 Cupertino Daylight & Liquid Glass 상단 글로벌 내비게이션 바 */}
      {pathname !== "/broker" &&
        !pathname.startsWith("/broker/w") &&
        !pathname.startsWith("/broker/magazine-editor") && (
        <header
          id="broker-senior-topbar"
          className="sticky top-0 z-50 ios-glass-chrome bg-white/75 backdrop-blur-2xl backdrop-saturate-[190%] border-b border-slate-900/[0.075] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_4px_20px_-4px_rgba(15,23,42,0.04)]"
        >
        <div className="min-h-14 px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 max-w-full overflow-x-hidden">
          <div className="flex max-w-full items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar bg-[#767680]/[0.08] p-1 rounded-2xl border border-white/60 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)]">
            {TOP_NAV_LINKS.map((item) => {
              const baseHref = item.href.split("?")[0];
              const isActive = item.exact
                ? pathname === baseHref
                : item.id === "magazine"
                ? pathname.startsWith("/broker/w/newsletter") ||
                  pathname.startsWith("/broker/magazine-editor")
                : pathname.startsWith(baseHref);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  data-testid={`workspace-nav-${item.id}`}
                  data-active-pill={isActive ? "true" : undefined}
                  className={
                    isActive
                      ? "relative px-3.5 py-2 min-h-[44px] inline-flex items-center rounded-xl text-sm sm:text-base font-semibold text-white transition-all whitespace-nowrap"
                      : "relative px-3.5 py-2 min-h-[44px] inline-flex items-center rounded-xl text-sm sm:text-base font-semibold text-[#3A3A3C] hover:text-[#1D1D1F] hover:bg-white/60 transition-all whitespace-nowrap"
                  }
                >
                  {isActive && (
                    <motion.span
                      layoutId="broker-top-nav-active-pill"
                      transition={SOTA_SPRING}
                      className="absolute inset-0 rounded-xl bg-gradient-to-b from-[#1A88FF] to-[#007AFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_8px_rgba(0,122,255,0.28)]"
                    />
                  )}
                  <span className="relative z-10">{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 max-w-full min-w-0">
            {!pathname.startsWith("/broker/tutorial") && (
              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => openHelpDrawer()}
                data-testid="broker-contextual-help-btn"
                className="px-3 py-2 min-h-[44px] inline-flex items-center gap-1.5 rounded-xl text-sm font-semibold ios-glass-pill bg-white/78 hover:bg-white/95 text-[#1D1D1F] border border-slate-900/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.04)] transition-all cursor-pointer"
                title="페이지를 이동하지 않고 지금 보고 계신 화면의 20초 동영상과 따라하기 사진을 바로 엽니다"
              >
                <span>🎬 이 화면 20초 사용법</span>
              </motion.button>
            )}

            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setIsFeedbackOpen(true)}
              data-testid="broker-feedback-btn"
              className="px-3 py-2 min-h-[44px] inline-flex items-center gap-1.5 rounded-xl text-sm font-semibold ios-glass-pill bg-white/78 hover:bg-white/95 text-[#1D1D1F] border border-slate-900/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.04)] transition-all cursor-pointer"
              title="사용 중 불편하신 점이나 개선 건의 사항을 10초 만에 복사하여 제보합니다"
            >
              <span>🛠️ 10초 불편 제보</span>
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={toggleHelperEnabled}
              data-testid="broker-helper-toggle-btn"
              className={
                helperEnabled
                  ? "px-3 py-2 min-h-[44px] inline-flex items-center gap-1 rounded-xl text-sm font-semibold bg-[#FF9500]/12 hover:bg-[#FF9500]/18 text-[#8A4B00] border border-[#FF9500]/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition-all cursor-pointer"
                  : "px-3 py-2 min-h-[44px] inline-flex items-center gap-1 rounded-xl text-sm font-semibold ios-glass-pill bg-white/70 text-[#515154] border border-slate-900/[0.08] transition-all cursor-pointer"
              }
              title="화면 곳곳의 쉬운 용어 설명(❓)과 예시 도우미를 켜거나 끕니다"
            >
              <span>{helperEnabled ? "💡 친절 도우미 (켜짐)" : "💡 도우미 (꺼짐)"}</span>
            </motion.button>

            <Link
              href="/broker/tutorial"
              prefetch={true}
              id="broker-top-tutorial-btn"
              data-testid="broker-top-tutorial-btn"
              data-active-pill={pathname.startsWith("/broker/tutorial") ? "true" : undefined}
              className={
                pathname.startsWith("/broker/tutorial")
                  ? "px-3.5 py-2 min-h-[44px] inline-flex items-center gap-1.5 rounded-xl text-sm sm:text-base font-semibold bg-gradient-to-b from-[#24B63E] to-[#188C2C] text-white shadow-sm transition-all"
                  : "px-3.5 py-2 min-h-[44px] inline-flex items-center gap-1.5 rounded-xl text-sm sm:text-base font-semibold ios-glass-pill bg-white/78 hover:bg-white/95 text-[#1D1D1F] border border-slate-900/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.04)] transition-all"
              }
              title="화면 캡처와 동영상으로 배우는 단계별 사용 설명서"
            >
              <span>📖 전체 설명서</span>
            </Link>

            <Link
              href="/broker/profile"
              data-testid="workspace-nav-profile"
              data-active-pill={pathname.startsWith("/broker/profile") ? "true" : undefined}
              className={
                pathname.startsWith("/broker/profile")
                  ? "px-3.5 py-2 min-h-[44px] inline-flex items-center gap-1.5 rounded-xl text-sm font-semibold bg-gradient-to-b from-[#1A88FF] to-[#007AFF] text-white shadow-sm transition-all"
                  : "px-3.5 py-2 min-h-[44px] inline-flex items-center gap-1.5 rounded-xl text-sm font-semibold ios-glass-pill bg-white/78 hover:bg-white/95 text-[#1D1D1F] border border-slate-900/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.04)] transition-all"
              }
            >
              <span>👤 내 프로필</span>
            </Link>
          </div>
        </div>
      </header>
      )}

      {children}
      <ContextualHelpDrawer />
      <QuickFeedbackReportModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />
    </div>
  );
}

export function BrokerSeniorLayout({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <SeniorHelpProvider>
        <BrokerSeniorLayoutInner>{children}</BrokerSeniorLayoutInner>
      </SeniorHelpProvider>
    </MotionConfig>
  );
}


"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MotionConfig } from "motion/react";
import { SeniorHelpProvider } from "@/components/help/SeniorHelpContext";
import { ContextualHelpDrawer } from "@/components/help/ContextualHelpDrawer";
import { QuickFeedbackReportModal } from "@/components/help/QuickFeedbackReportModal";
import { FontScaleToggle } from "@/components/workspace/FontScaleToggle";
import {
  WorkspaceHelpButton,
  type HelpWorkspaceKey,
} from "@/components/workspace/WorkspaceHelpButton";
import {
  WORKSPACE_IDENTITY,
  WORKSPACE_IDENTITY_ORDER,
} from "@/lib/ux/workspace-identity";

const TOP_NAV_LINKS = [
  {
    id: "home" as const,
    href: "/broker",
    label: "🏠 홈",
    exact: true,
    activePillClass: "bg-[#1D1D1F] text-white shadow-xs",
  },
  ...WORKSPACE_IDENTITY_ORDER.map((id) => {
    const spec = WORKSPACE_IDENTITY[id];
    return {
      id: spec.id,
      href: spec.href,
      label: spec.topbarLabel,
      exact: false,
      activePillClass: spec.activePillClass,
    };
  }),
];

function resolveHelpWorkspace(pathname: string): HelpWorkspaceKey {
  if (pathname === "/broker") return "home";
  if (pathname.startsWith("/broker/w/dealcards") || pathname.startsWith("/broker/deal-card")) {
    return "dealcards";
  }
  if (pathname.startsWith("/broker/w/im") || pathname.startsWith("/broker/basic-im-studio")) {
    return "im";
  }
  if (
    pathname.startsWith("/broker/w/newsletter") ||
    pathname.startsWith("/broker/w/magazine") ||
    pathname.startsWith("/broker/magazine-editor")
  ) {
    return "magazine";
  }
  if (pathname.startsWith("/broker/w/inbox") || pathname.startsWith("/broker/inbox")) {
    return "inbox";
  }
  return "common";
}

function BrokerSeniorLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  useEffect(() => {
    const onOpenFeedback = () => setIsFeedbackOpen(true);
    window.addEventListener("credeal:open-feedback", onOpenFeedback);
    return () => window.removeEventListener("credeal:open-feedback", onOpenFeedback);
  }, []);

  const showTopbar =
    pathname !== "/broker" &&
    !pathname.startsWith("/broker/w") &&
    !pathname.startsWith("/broker/magazine-editor");

  return (
    <div className="broker-paper-theme min-h-screen max-w-full overflow-x-clip bg-[#F5F5F7] text-[#1D1D1F] transition-colors">
      {/* V2 통일 상단 내비게이션 바 (4색 플랫 공간 길찾기 + 글자 스테퍼 + 사용법 + 내 프로필) */}
      {showTopbar && (
        <header
          id="broker-senior-topbar"
          className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 print:hidden"
        >
          <div className="min-h-14 px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 max-w-full overflow-x-hidden">
            <nav
              aria-label="주요 작업 공간"
              className="flex max-w-full items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar bg-slate-100/90 p-1 rounded-2xl border border-slate-200/80"
            >
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
                        ? `px-3.5 py-2 min-h-[44px] inline-flex items-center rounded-xl text-sm sm:text-base font-semibold transition-colors whitespace-nowrap ${item.activePillClass}`
                        : "px-3.5 py-2 min-h-[44px] inline-flex items-center rounded-xl text-sm sm:text-base font-semibold text-[#3A3A3C] hover:text-[#1D1D1F] hover:bg-white transition-colors whitespace-nowrap"
                    }
                  >
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 max-w-full min-w-0">
              <FontScaleToggle variant="stepper" />
              <WorkspaceHelpButton workspace={resolveHelpWorkspace(pathname)} />
              <Link
                href="/broker/profile"
                data-testid="workspace-nav-profile"
                data-active-pill={pathname.startsWith("/broker/profile") ? "true" : undefined}
                className={
                  pathname.startsWith("/broker/profile")
                    ? "px-3.5 py-2 min-h-[44px] inline-flex items-center rounded-xl text-sm sm:text-base font-semibold bg-[#1D1D1F] text-white transition-colors whitespace-nowrap"
                    : "px-3.5 py-2 min-h-[44px] inline-flex items-center rounded-xl text-sm sm:text-base font-semibold bg-white hover:bg-slate-50 text-[#1D1D1F] border border-slate-200 transition-colors whitespace-nowrap"
                }
              >
                <span>내 프로필</span>
              </Link>
            </div>
          </div>
        </header>
      )}

      {children}

      {/* 화면 이동 없이 바로 열리는 빠른 안내 서랍 */}
      <ContextualHelpDrawer />

      {/* 10초 불편 제보 모달 */}
      <QuickFeedbackReportModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />
    </div>
  );
}

export function BrokerSeniorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <SeniorHelpProvider>
        <BrokerSeniorLayoutInner>{children}</BrokerSeniorLayoutInner>
      </SeniorHelpProvider>
    </MotionConfig>
  );
}

export default BrokerSeniorLayout;

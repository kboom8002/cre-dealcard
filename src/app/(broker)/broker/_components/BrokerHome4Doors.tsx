"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  FileSpreadsheet,
  MessageSquareMore,
  Newspaper,
  Presentation,
  Sparkles,
  UserCog,
} from "lucide-react";
import type { AggregatedBrokerHomeData } from "@/domain/broker/home-aggregated";
import { WORKSPACE_IDENTITY } from "@/lib/ux/workspace-identity";
import { FontScaleToggle } from "@/components/workspace/FontScaleToggle";
import { WorkspaceHelpButton } from "@/components/workspace/WorkspaceHelpButton";
import { QuickStatutorySetupCard } from "./QuickStatutorySetupCard";

interface BrokerHome4DoorsProps {
  data: AggregatedBrokerHomeData;
}

/** True when a 1~4 keydown must NOT trigger door navigation. */
export function shouldIgnoreDoorShortcut(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.repeat) return true;
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return true;
  if (e.isComposing || e.keyCode === 229) return true;
  const target = e.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  if (target instanceof HTMLElement) {
    if (target.isContentEditable) return true;
    const editableAncestor = target.closest(
      '[contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"]'
    );
    if (editableAncestor) return true;
  }
  return false;
}

export function BrokerHome4Doors({ data }: BrokerHome4DoorsProps) {
  const router = useRouter();
  const { doors, resumeItem, statutory } = data;
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [setupCompleted, setSetupCompleted] = useState(false);
  const needsStatutorySetup = Boolean(statutory && !statutory.isComplete && !setupCompleted);

  // Keyboard shortcuts: 1~4 in confirmed order: 1. 부동산뉴스 → 2. 딜카드 → 3. IM → 4. 고객 소통.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (shouldIgnoreDoorShortcut(e)) return;

      if (e.key === "1") {
        router.push(doors.magazine.href);
      } else if (e.key === "2") {
        router.push(doors.dealcards.href);
      } else if (e.key === "3") {
        router.push(doors.im.href);
      } else if (e.key === "4") {
        router.push(doors.inbox.href);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router, doors]);

  const neutralBadgeClass =
    "bg-[#767680]/10 text-[#3A3A3C] border-slate-900/[0.08] hover:bg-[#767680]/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]";

  const doorList = [
    {
      config: doors.magazine,
      testId: "home-task-magazine",
      aliasTestId: "quick-action-magazine",
      badgeTestId: "home-door-badge-magazine",
      glowClass: WORKSPACE_IDENTITY.magazine.doorGlowClass,
      accentBg: WORKSPACE_IDENTITY.magazine.doorAccentBgClass,
      badgeClass: doors.magazine.badge.highlight
        ? WORKSPACE_IDENTITY.magazine.doorBadgeHighlightClass
        : neutralBadgeClass,
    },
    {
      config: doors.dealcards,
      testId: "home-task-dealcards",
      aliasTestId: "quick-action-dealcard",
      badgeTestId: "home-door-badge-dealcards",
      glowClass: WORKSPACE_IDENTITY.dealcards.doorGlowClass,
      accentBg: WORKSPACE_IDENTITY.dealcards.doorAccentBgClass,
      badgeClass: doors.dealcards.badge.highlight
        ? WORKSPACE_IDENTITY.dealcards.doorBadgeHighlightClass
        : neutralBadgeClass,
    },
    {
      config: doors.im,
      testId: "home-task-im",
      aliasTestId: "quick-action-im",
      badgeTestId: "home-door-badge-im",
      glowClass: WORKSPACE_IDENTITY.im.doorGlowClass,
      accentBg: WORKSPACE_IDENTITY.im.doorAccentBgClass,
      badgeClass: doors.im.badge.highlight
        ? WORKSPACE_IDENTITY.im.doorBadgeHighlightClass
        : neutralBadgeClass,
    },
    {
      config: doors.inbox,
      testId: "home-task-inbox",
      aliasTestId: "quick-action-inbox",
      badgeTestId: "home-door-badge-inbox",
      glowClass: WORKSPACE_IDENTITY.inbox.doorGlowClass,
      accentBg: WORKSPACE_IDENTITY.inbox.doorAccentBgClass,
      badgeClass: doors.inbox.badge.highlight
        ? WORKSPACE_IDENTITY.inbox.doorBadgeHighlightClass
        : neutralBadgeClass,
    },
  ];

  const renderDoorIcon = (id: string) => {
    switch (id) {
      case "magazine":
        return <Newspaper className="w-6 h-6 text-[#059669]" strokeWidth={2.2} aria-hidden="true" />;
      case "dealcards":
        return <FileSpreadsheet className="w-6 h-6 text-[#D97706]" strokeWidth={2.2} aria-hidden="true" />;
      case "im":
        return <Presentation className="w-6 h-6 text-[#1D4ED8]" strokeWidth={2.2} aria-hidden="true" />;
      case "inbox":
        return <MessageSquareMore className="w-6 h-6 text-[#DB2777]" strokeWidth={2.2} aria-hidden="true" />;
      default:
        return <Building2 className="w-6 h-6 text-[#1D1D1F]" strokeWidth={2.2} aria-hidden="true" />;
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      {/* ── 1. Institutional CRE Studio Header ── */}
      <header className="flex flex-wrap items-end justify-between gap-4 pb-3 border-b border-slate-900/[0.07]">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#515154]">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#1D1D1F] text-white text-sm font-bold tracking-tight">
              <Building2 className="w-3.5 h-3.5 text-[#60A5FA]" aria-hidden="true" />
              <span>CREDEAL STUDIO</span>
            </span>
            <span>
              {new Intl.DateTimeFormat("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long",
              }).format(new Date())}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1D1D1F] tracking-tight pt-1">
            {data.profile.displayName} 대표님, 환영합니다
          </h1>
          <p className="text-base text-[#3A3A3C]">
            상업용 부동산 브리핑·제안서·고객 응대를 한 곳에서 관리하세요.{" "}
            <span className="text-sm font-semibold text-[#515154]">(단축키 1~4)</span>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-2.5 w-full sm:w-auto min-w-0">
          <FontScaleToggle />
          <WorkspaceHelpButton workspace="home" />
          <Link
            href={needsStatutorySetup ? "/broker/profile?focus=statutory" : "/broker/profile"}
            data-testid="home-profile-settings-btn"
            className="inline-flex w-full sm:w-auto justify-center items-center gap-2 px-4 py-2.5 min-h-[48px] rounded-xl ios-glass-pill bg-white/88 hover:bg-white border border-slate-900/[0.09] text-[#1D1D1F] font-semibold text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_8px_rgba(15,23,42,0.05)] transition-all active:scale-[0.98] whitespace-nowrap"
          >
            <UserCog className="w-4 h-4 text-[#007AFF] shrink-0" aria-hidden="true" />
            <span>내 프로필 · 사무소 설정</span>
            {needsStatutorySetup && statutory && (
              <span
                data-testid="home-profile-missing-badge"
                className="inline-flex items-center rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-sm font-extrabold text-amber-900"
              >
                미입력 ({statutory.filledCount}/{statutory.totalCount})
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* ── 2. WP-P2-05: 1-Line "이어서 하기" Spatial Glass Resume Bar ── */}
      {resumeItem && (
        <section
          data-testid="home-resume-bar"
          className="relative ios-glass-card bg-white/90 backdrop-blur-2xl border border-[#007AFF]/20 rounded-3xl p-4 sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_10px_28px_-8px_rgba(15,23,42,0.08)] transition-all"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-[#1D1D1F] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_2px_8px_rgba(15,23,42,0.18)] shrink-0">
                <Sparkles className="w-5 h-5 text-[#FFAA00]" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold px-2.5 py-0.5 bg-[#007AFF]/10 text-[#0040DD] border border-[#007AFF]/22 rounded-full">
                    이어서 하기
                  </span>
                  <span className="text-sm text-[#515154] font-medium">
                    {resumeItem.timeAgo}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-[#1D1D1F] truncate mt-0.5">
                  {resumeItem.title}
                </h2>
              </div>
            </div>

            <Link
              href={resumeItem.href}
              className="inline-flex items-center justify-center gap-1.5 px-4.5 py-2.5 min-h-[48px] rounded-2xl bg-gradient-to-b from-[#1A88FF] to-[#007AFF] hover:brightness-105 text-white font-semibold text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_12px_rgba(0,122,255,0.28)] transition-all whitespace-nowrap shrink-0"
            >
              <span>편집 계속하기</span>
              <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}

      {/* ── 2.5. 첫 시작 60초 법정 5항목 설정 카드 (미입력 시에만 노출) ── */}
      {needsStatutorySetup && !setupDismissed && statutory && (
        <QuickStatutorySetupCard
          statutory={statutory}
          onCompleted={() => setSetupCompleted(true)}
          onDismiss={() => setSetupDismissed(true)}
        />
      )}

      {setupCompleted && (
        <div
          role="status"
          data-testid="home-statutory-complete-banner"
          className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-base font-bold text-emerald-900"
        >
          ✓ 중개사무소 법정 5항목 설정 완료 — 이제 아래 4대 핵심 업무를 바로 이용하실 수 있습니다.
        </div>
      )}

      {/* ── 3. WP-P2-04: 4-Door Task Hub Grid (Spatial Liquid Glass Cards) ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
        {doorList.map((door) => (
          <div
            key={door.config.id}
            role="button"
            tabIndex={0}
            aria-label={door.config.title}
            data-testid={`home-door-card-${door.config.id}`}
            onClick={(e) => {
              const target = e.target as HTMLElement | null;
              if (target?.closest("a, button")) return;
              router.push(door.config.href);
            }}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(door.config.href);
              }
            }}
            className="relative group cursor-pointer rounded-3xl ios-glass-card bg-white/88 backdrop-blur-2xl backdrop-saturate-[180%] border border-slate-900/[0.085] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_10px_28px_-8px_rgba(15,23,42,0.06)] hover:bg-white hover:border-[#007AFF]/30 hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_18px_38px_-8px_rgba(0,122,255,0.10)] transition-all duration-200 overflow-hidden flex flex-col justify-between p-6 min-h-[196px]"
          >
            {/* Subtle Ambient Top Radial Glow */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${door.glowClass}`}
            />

            {/* Top Bar with Number Badge, Vector Module Icon & Clickable Live Status Badge */}
            <div className="relative z-20 flex items-center justify-between gap-3 mb-5 pointer-events-none">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-base ${door.accentBg}`}
                >
                  {door.config.shortcutNumber}
                </span>
                <span className="w-10 h-10 rounded-xl bg-slate-900/[0.04] border border-slate-900/[0.06] flex items-center justify-center">
                  {renderDoorIcon(door.config.id)}
                </span>
              </div>

              {/* Clickable Live Status Badge (Sibling element, NOT nested button) */}
              <Link
                href={door.config.badge.href}
                data-testid={door.badgeTestId}
                className={`pointer-events-auto relative z-20 inline-flex items-center gap-1 px-3.5 py-2 min-h-[44px] rounded-full border text-sm font-semibold transition-all backdrop-blur-md ${door.badgeClass}`}
                title={`${door.config.title} 목록 바로가기`}
              >
                <span>{door.config.badge.label}</span>
                <span className="text-sm opacity-70">›</span>
              </Link>
            </div>

            {/* Door Main Action Link (stretched across full card surface) */}
            <div className="relative z-10">
              <Link
                href={door.config.href}
                data-testid={door.testId}
                data-alias-testid={door.aliasTestId}
                onKeyDown={(e) => {
                  if (e.key === " ") {
                    e.preventDefault();
                    router.push(door.config.href);
                  }
                }}
                className="block min-h-[44px] group-hover:text-[#007AFF] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] rounded-xl after:absolute after:inset-0 after:z-10 after:rounded-3xl after:content-['']"
              >
                <h3 className="text-xl sm:text-2xl font-extrabold text-[#1D1D1F] group-hover:text-[#007AFF] transition-colors flex items-center justify-between tracking-tight">
                  <span>{door.config.title}</span>
                  <ArrowRight
                    className="w-5 h-5 text-[#515154] group-hover:text-[#007AFF] group-hover:translate-x-1 transition-all shrink-0"
                    aria-hidden="true"
                  />
                </h3>
                <p className="text-base text-[#3A3A3C] font-medium mt-1.5 leading-snug">
                  {door.config.subtitle}
                </p>
              </Link>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

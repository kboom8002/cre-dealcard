"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AggregatedBrokerHomeData } from "@/domain/broker/home-aggregated";

interface BrokerHome4DoorsProps {
  data: AggregatedBrokerHomeData;
}

export function BrokerHome4Doors({ data }: BrokerHome4DoorsProps) {
  const router = useRouter();
  const { doors, resumeItem } = data;

  // Keyboard shortcuts: 1~4 to immediately navigate to task doors
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === "1") {
        router.push(doors.dealcards.href);
      } else if (e.key === "2") {
        router.push(doors.im.href);
      } else if (e.key === "3") {
        router.push(doors.magazine.href);
      } else if (e.key === "4") {
        router.push(doors.inbox.href);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router, doors]);

  const doorList = [
    {
      config: doors.dealcards,
      testId: "home-task-dealcards",
      aliasTestId: "quick-action-dealcard",
      badgeTestId: "home-door-badge-dealcards",
      glowClass: "from-[#007AFF]/[0.07] via-transparent to-transparent",
      accentBg:
        "bg-gradient-to-b from-[#1A88FF] to-[#007AFF] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_8px_rgba(0,122,255,0.28)]",
      badgeClass: doors.dealcards.badge.highlight
        ? "bg-[#007AFF]/10 text-[#0040DD] border-[#007AFF]/22 hover:bg-[#007AFF]/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
        : "bg-[#767680]/10 text-[#3A3A3C] border-slate-900/[0.08] hover:bg-[#767680]/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]",
    },
    {
      config: doors.im,
      testId: "home-task-im",
      aliasTestId: "quick-action-im",
      badgeTestId: "home-door-badge-im",
      glowClass: "from-[#28CD41]/[0.07] via-transparent to-transparent",
      accentBg:
        "bg-gradient-to-b from-[#24B63E] to-[#188C2C] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_8px_rgba(29,158,52,0.25)]",
      badgeClass: doors.im.badge.highlight
        ? "bg-[#28CD41]/10 text-[#116B22] border-[#28CD41]/25 hover:bg-[#28CD41]/16 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
        : "bg-[#767680]/10 text-[#3A3A3C] border-slate-900/[0.08] hover:bg-[#767680]/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]",
    },
    {
      config: doors.magazine,
      testId: "home-task-magazine",
      aliasTestId: "quick-action-magazine",
      badgeTestId: "home-door-badge-magazine",
      glowClass: "from-[#5856D6]/[0.07] via-transparent to-transparent",
      accentBg:
        "bg-gradient-to-b from-[#6B69E6] to-[#4A48C4] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_8px_rgba(88,86,214,0.26)]",
      badgeClass: doors.magazine.badge.highlight
        ? "bg-[#5856D6]/10 text-[#3634A3] border-[#5856D6]/22 hover:bg-[#5856D6]/16 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
        : "bg-[#767680]/10 text-[#3A3A3C] border-slate-900/[0.08] hover:bg-[#767680]/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]",
    },
    {
      config: doors.inbox,
      testId: "home-task-inbox",
      aliasTestId: "quick-action-inbox",
      badgeTestId: "home-door-badge-inbox",
      glowClass: "from-[#FF9500]/[0.08] via-transparent to-transparent",
      accentBg:
        "bg-gradient-to-b from-[#FFAA00] to-[#E68600] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_8px_rgba(255,149,0,0.28)]",
      badgeClass: doors.inbox.badge.highlight
        ? "bg-[#FF9500]/12 text-[#8A4B00] border-[#FF9500]/26 hover:bg-[#FF9500]/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
        : "bg-[#767680]/10 text-[#3A3A3C] border-slate-900/[0.08] hover:bg-[#767680]/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]",
    },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* ── 1. Greeting Header ── */}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-2">
        <div>
          <span className="text-sm font-semibold text-[#515154]">
            {new Intl.DateTimeFormat("ko-KR", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "long",
            }).format(new Date())}
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1D1D1F] tracking-tight mt-0.5">
            {data.profile.displayName} 대표님, 환영합니다
          </h1>
          <p className="text-base text-[#3A3A3C] mt-1">
            진행하실 중개 업무를 선택하세요. (숫자키 1~4 단축키)
          </p>
        </div>

        <Link
          href="/broker/profile"
          data-testid="home-profile-settings-btn"
          className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[48px] rounded-2xl ios-glass-pill bg-white/82 hover:bg-white/95 border border-slate-900/[0.08] text-[#1D1D1F] font-semibold text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_rgba(15,23,42,0.04)] transition-all shrink-0"
        >
          <span>👤 내 프로필 · 사무소 설정</span>
        </Link>
      </header>

      {/* ── 2. WP-P2-05: 1-Line "이어서 하기" Spatial Glass Resume Bar ── */}
      {resumeItem && (
        <section
          data-testid="home-resume-bar"
          className="relative ios-glass-card bg-white/86 backdrop-blur-2xl border border-[#FF9500]/24 rounded-3xl p-4 sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_10px_28px_-6px_rgba(255,149,0,0.10)] transition-all"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-b from-[#FFAA00] to-[#FF9500] text-white font-bold text-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_8px_rgba(255,149,0,0.28)] shrink-0">
                ⚡
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold px-2.5 py-0.5 bg-[#FF9500]/12 text-[#8A4B00] border border-[#FF9500]/24 rounded-full">
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
              className="inline-flex items-center justify-center px-4.5 py-2.5 min-h-[48px] rounded-2xl bg-gradient-to-b from-[#1A88FF] to-[#007AFF] hover:brightness-105 text-white font-semibold text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_12px_rgba(0,122,255,0.28)] transition-all shrink-0"
            >
              편집 계속하기 →
            </Link>
          </div>
        </section>
      )}

      {/* ── 3. WP-P2-04: 4-Door Task Hub Grid (Spatial Liquid Glass Cards) ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
        {doorList.map((door) => (
          <div
            key={door.config.id}
            className="relative group rounded-3xl ios-glass-card bg-white/84 backdrop-blur-2xl backdrop-saturate-[180%] border border-slate-900/[0.075] shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_10px_28px_-6px_rgba(15,23,42,0.055)] hover:bg-white/95 hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_18px_38px_-8px_rgba(0,122,255,0.09)] transition-all duration-200 overflow-hidden flex flex-col justify-between p-6 min-h-[190px]"
          >
            {/* Subtle Ambient Top Radial Glow */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${door.glowClass}`}
            />

            {/* Top Bar with Number Badge & Clickable Live Status Badge */}
            <div className="relative z-10 flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-lg ${door.accentBg}`}
                >
                  {door.config.shortcutNumber}
                </span>
                <span className="text-3xl">{door.config.icon}</span>
              </div>

              {/* Clickable Live Status Badge (Sibling element, NOT nested button) */}
              <Link
                href={door.config.badge.href}
                data-testid={door.badgeTestId}
                className={`inline-flex items-center gap-1 px-3 py-1.5 min-h-[38px] rounded-full border text-sm font-semibold transition-all backdrop-blur-md ${door.badgeClass}`}
                title={`${door.config.title} 목록 바로가기`}
              >
                <span>{door.config.badge.label}</span>
                <span className="text-sm opacity-70">›</span>
              </Link>
            </div>

            {/* Door Main Action Link */}
            <div className="relative z-10">
              <Link
                href={door.config.href}
                data-testid={door.testId}
                data-alias-testid={door.aliasTestId}
                className="block group-hover:text-[#007AFF] transition-colors focus:outline-none focus:ring-2 focus:ring-[#007AFF] rounded-xl"
              >
                <h3 className="text-2xl font-bold text-[#1D1D1F] group-hover:text-[#007AFF] transition-colors flex items-center justify-between">
                  <span>{door.config.title}</span>
                  <span className="text-[#515154] group-hover:text-[#007AFF] group-hover:translate-x-1 transition-all text-xl">
                    →
                  </span>
                </h3>
                <p className="text-base text-[#3A3A3C] font-medium mt-1">
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

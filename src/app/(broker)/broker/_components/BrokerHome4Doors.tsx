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
      colorClass: "border-blue-300 hover:border-blue-500 bg-white",
      accentBg: "bg-blue-600 text-white",
      badgeClass: doors.dealcards.badge.highlight
        ? "bg-blue-100 text-blue-900 border-blue-300 hover:bg-blue-200"
        : "bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200",
    },
    {
      config: doors.im,
      testId: "home-task-im",
      aliasTestId: "quick-action-im",
      badgeTestId: "home-door-badge-im",
      colorClass: "border-emerald-300 hover:border-emerald-500 bg-white",
      accentBg: "bg-emerald-600 text-white",
      badgeClass: doors.im.badge.highlight
        ? "bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200"
        : "bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200",
    },
    {
      config: doors.magazine,
      testId: "home-task-magazine",
      aliasTestId: "quick-action-magazine",
      badgeTestId: "home-door-badge-magazine",
      colorClass: "border-indigo-300 hover:border-indigo-500 bg-white",
      accentBg: "bg-indigo-600 text-white",
      badgeClass: doors.magazine.badge.highlight
        ? "bg-indigo-100 text-indigo-900 border-indigo-300 hover:bg-indigo-200"
        : "bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200",
    },
    {
      config: doors.inbox,
      testId: "home-task-inbox",
      aliasTestId: "quick-action-inbox",
      badgeTestId: "home-door-badge-inbox",
      colorClass: "border-amber-300 hover:border-amber-500 bg-white",
      accentBg: "bg-amber-600 text-white",
      badgeClass: doors.inbox.badge.highlight
        ? "bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200"
        : "bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200",
    },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* ── 1. Greeting Header ── */}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-2">
        <div>
          <span className="text-sm font-bold text-slate-500">
            {new Intl.DateTimeFormat("ko-KR", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "long",
            }).format(new Date())}
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
            {data.profile.displayName} 대표님, 환영합니다
          </h1>
          <p className="text-base text-slate-600 mt-1">
            진행하실 중개 업무를 선택하세요. (숫자키 1~4 단축키)
          </p>
        </div>
      </header>

      {/* ── 2. WP-P2-05: 1-Line "이어서 하기" Resume Bar ── */}
      {resumeItem && (
        <section
          data-testid="home-resume-bar"
          className="relative bg-white border-2 border-amber-400 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-100 text-amber-900 font-extrabold text-lg shrink-0">
                ⚡
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md">
                    이어서 하기
                  </span>
                  <span className="text-sm text-slate-500 font-medium">
                    {resumeItem.timeAgo}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 truncate mt-0.5">
                  {resumeItem.title}
                </h2>
              </div>
            </div>

            <Link
              href={resumeItem.href}
              className="inline-flex items-center justify-center px-4 py-2.5 min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-base shadow-sm transition-colors shrink-0"
            >
              편집 계속하기 →
            </Link>
          </div>
        </section>
      )}

      {/* ── 3. WP-P2-04: 4-Door Task Hub Grid (2x2 on desktop, 1-col on mobile) ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
        {doorList.map((door) => (
          <div
            key={door.config.id}
            className={`relative group rounded-2xl border-2 ${door.colorClass} shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden flex flex-col justify-between p-6 min-h-[190px]`}
          >
            {/* Top Bar with Number Badge & Clickable Live Status Badge */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-lg ${door.accentBg}`}
                >
                  {door.config.shortcutNumber}
                </span>
                <span className="text-3xl">{door.config.icon}</span>
              </div>

              {/* Clickable Live Status Badge (Sibling element, NOT nested button) */}
              <Link
                href={door.config.badge.href}
                data-testid={door.badgeTestId}
                className={`inline-flex items-center gap-1 px-3 py-1.5 min-h-[38px] rounded-full border text-sm font-extrabold transition-colors shadow-2xs ${door.badgeClass}`}
                title={`${door.config.title} 목록 바로가기`}
              >
                <span>{door.config.badge.label}</span>
                <span className="text-xs opacity-70">›</span>
              </Link>
            </div>

            {/* Door Main Action Link */}
            <div>
              <Link
                href={door.config.href}
                data-testid={door.testId}
                data-alias-testid={door.aliasTestId}
                className="block group-hover:text-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 rounded-lg"
              >
                <h3 className="text-2xl font-extrabold text-slate-900 group-hover:text-blue-700 transition-colors flex items-center justify-between">
                  <span>{door.config.title}</span>
                  <span className="text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all text-xl">
                    →
                  </span>
                </h3>
                <p className="text-base text-slate-600 font-medium mt-1">
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

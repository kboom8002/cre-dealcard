import React from "react";

export default function DealCardsWorkspaceLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="딜카드 화면을 불러오는 중입니다"
      className="min-h-screen w-full bg-[#F7F6F2] text-slate-900 flex flex-col"
    >
      {/* Top workspace bar */}
      <header className="h-14 border-b border-slate-200 bg-white/90 px-4 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-lg bg-amber-50 border border-amber-200 px-3 py-1 text-sm font-bold text-amber-800">
            📄 딜카드
          </span>
          <span className="text-sm font-medium text-slate-600">
            매물 딜카드 목록을 불러오는 중입니다...
          </span>
        </div>
        <div aria-hidden="true" className="h-9 w-28 rounded-xl bg-slate-200/80 animate-pulse" />
      </header>

      {/* 3-column workspace skeleton */}
      <div
        aria-hidden="true"
        className="flex-1 grid grid-cols-1 xl:grid-cols-[310px_minmax(0,1fr)_390px] divide-y xl:divide-y-0 xl:divide-x divide-slate-200"
      >
        <section className="p-4 space-y-3 bg-white/70">
          <div className="h-11 w-full rounded-xl bg-slate-200/80 animate-pulse" />
          {[1, 2, 3, 4].map((idx) => (
            <div
              key={idx}
              className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 animate-pulse"
            >
              <div className="h-5 w-2/3 rounded bg-slate-200" />
              <div className="h-4 w-1/2 rounded bg-slate-100" />
            </div>
          ))}
        </section>

        <section className="p-5 sm:p-6 space-y-4 bg-[#F7F6F2]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs animate-pulse">
            <div className="h-6 w-48 rounded-lg bg-slate-200" />
            <div className="h-24 w-full rounded-xl bg-slate-100" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="h-11 rounded-xl bg-slate-100" />
              <div className="h-11 rounded-xl bg-slate-100" />
            </div>
            <div className="space-y-2.5 pt-2">
              <div className="h-11 w-full rounded-xl bg-slate-100" />
              <div className="h-11 w-full rounded-xl bg-slate-100" />
              <div className="h-11 w-full rounded-xl bg-slate-100" />
            </div>
          </div>
        </section>

        <section className="hidden xl:flex flex-col items-center p-5 bg-white/60">
          <div className="w-full max-w-[350px] h-[560px] rounded-3xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs animate-pulse">
            <div className="h-6 w-24 rounded-full bg-amber-100" />
            <div className="h-7 w-4/5 rounded-lg bg-slate-200" />
            <div className="h-28 w-full rounded-2xl bg-slate-100" />
            <div className="space-y-2.5">
              <div className="h-5 w-full rounded bg-slate-100" />
              <div className="h-5 w-5/6 rounded bg-slate-100" />
              <div className="h-5 w-4/6 rounded bg-slate-100" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

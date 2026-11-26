import React from "react";

export default function ImWorkspaceLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="IM 작성 화면을 불러오는 중입니다"
      className="min-h-screen w-full bg-[#F7F6F2] text-slate-900 flex flex-col"
    >
      {/* Top workspace bar */}
      <header className="h-14 border-b border-slate-200 bg-white/90 px-4 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-lg bg-blue-50 border border-blue-200 px-3 py-1 text-sm font-bold text-blue-800">
            📊 IM
          </span>
          <span className="text-sm font-medium text-slate-600">
            매물 IM 자료를 불러오는 중입니다...
          </span>
        </div>
        <div aria-hidden="true" className="h-9 w-32 rounded-xl bg-slate-200/80 animate-pulse" />
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
              <div className="h-5 w-3/4 rounded bg-slate-200" />
              <div className="h-4 w-1/2 rounded bg-slate-100" />
            </div>
          ))}
        </section>

        <section className="p-5 sm:p-6 space-y-4 bg-[#F7F6F2]">
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((tab) => (
              <div
                key={tab}
                className="h-11 w-24 rounded-xl bg-white border border-slate-200 animate-pulse"
              />
            ))}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs animate-pulse">
            <div className="h-6 w-52 rounded-lg bg-slate-200" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="h-16 rounded-xl bg-slate-100" />
              <div className="h-16 rounded-xl bg-slate-100" />
              <div className="h-16 rounded-xl bg-slate-100" />
            </div>
            <div className="h-44 w-full rounded-xl bg-slate-100" />
          </div>
        </section>

        <section className="hidden xl:flex flex-col items-center p-5 bg-white/60">
          <div className="w-full max-w-[350px] h-[560px] rounded-3xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs animate-pulse">
            <div className="h-6 w-28 rounded-full bg-blue-100" />
            <div className="h-36 w-full rounded-2xl bg-slate-100" />
            <div className="space-y-2.5">
              <div className="h-5 w-full rounded bg-slate-100" />
              <div className="h-5 w-5/6 rounded bg-slate-100" />
              <div className="h-5 w-2/3 rounded bg-slate-100" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function BrokerDashboardLoading() {
  return (
    <div
      role="status"
      aria-label="홈 화면을 불러오는 중입니다"
      className="flex flex-col items-center min-h-screen px-4 sm:px-6 py-6 pb-28 w-full"
    >
      <div className="w-full max-w-5xl mx-auto space-y-6">
        {/* Header Skeleton */}
        <div className="flex justify-between items-center w-full pt-2">
          <div className="space-y-2">
            <div className="h-7 w-52 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
            <div className="h-4 w-64 bg-slate-200/70 dark:bg-slate-800/60 rounded-lg animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
            <div className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
          </div>
        </div>

        {/* 3 Core Workflow Step Cards Skeleton */}
        <div className="w-full rounded-2xl border-2 border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <div className="h-6 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
              <div className="h-4 w-72 bg-slate-100 dark:bg-slate-800/60 rounded-lg animate-pulse" />
            </div>
            <div className="h-8 w-24 bg-blue-50 dark:bg-slate-800 rounded-full animate-pulse" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-36 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 p-4 space-y-3 animate-pulse"
              >
                <div className="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded-md" />
                <div className="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded-md" />
                <div className="h-4 w-full bg-slate-200/70 dark:bg-slate-700/60 rounded-md" />
              </div>
            ))}
          </div>
        </div>

        {/* Quick Memo Input Skeleton */}
        <div className="w-full h-36 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3 shadow-sm animate-pulse">
          <div className="h-5 w-56 bg-slate-200 dark:bg-slate-800 rounded-md" />
          <div className="h-16 w-full bg-slate-100 dark:bg-slate-800/60 rounded-xl" />
        </div>

        {/* KPI Summary Grid Skeleton */}
        <div className="w-full grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2 shadow-sm animate-pulse"
            >
              <div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded mx-auto" />
              <div className="h-7 w-12 bg-slate-200 dark:bg-slate-800 rounded mx-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

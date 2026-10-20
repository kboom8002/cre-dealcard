export default function BuildingsListLoading() {
  return (
    <div
      role="status"
      aria-label="내 물건 목록을 불러오는 중입니다"
      className="flex flex-col items-center min-h-screen px-4 sm:px-6 py-6 pb-28 w-full"
    >
      <div className="w-full max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between pt-2">
          <div className="space-y-2">
            <div className="h-7 w-40 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
            <div className="h-4 w-56 bg-slate-200/70 dark:bg-slate-800/60 rounded-lg animate-pulse" />
          </div>
          <div className="h-11 w-32 bg-blue-100 dark:bg-slate-800 rounded-xl animate-pulse" />
        </div>

        {/* Filter Bar Skeleton */}
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-11 w-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl animate-pulse"
            />
          ))}
        </div>

        {/* Building Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-48 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-sm animate-pulse"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="h-6 w-44 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                  <div className="h-4 w-32 bg-slate-100 dark:bg-slate-800/60 rounded-md" />
                </div>
                <div className="h-6 w-16 bg-slate-200 dark:bg-slate-800 rounded-full" />
              </div>
              <div className="h-12 w-full bg-slate-100 dark:bg-slate-800/50 rounded-xl" />
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                <div className="h-10 bg-blue-50 dark:bg-slate-800 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

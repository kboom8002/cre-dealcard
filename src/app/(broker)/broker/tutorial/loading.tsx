export default function TutorialLoading() {
  return (
    <div
      role="status"
      aria-label="쉬운 사용법 안내 화면을 불러오는 중입니다"
      className="flex flex-col items-center min-h-screen px-4 sm:px-6 py-6 pb-28 w-full"
    >
      <div className="w-full max-w-5xl mx-auto space-y-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3 shadow-sm animate-pulse">
          <div className="h-6 w-36 bg-blue-100 dark:bg-slate-800 rounded-full" />
          <div className="h-8 w-80 bg-slate-200 dark:bg-slate-800 rounded-xl" />
          <div className="h-4 w-96 max-w-full bg-slate-100 dark:bg-slate-800/60 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
            />
          ))}
        </div>
        <div className="h-64 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 animate-pulse" />
      </div>
    </div>
  );
}

export default function NewDealCardLoading() {
  return (
    <div
      role="status"
      aria-label="새 물건 등록 화면을 불러오는 중입니다"
      className="flex flex-col items-center min-h-screen px-4 sm:px-6 py-6 pb-28 w-full"
    >
      <div className="w-full max-w-2xl mx-auto space-y-5">
        <div className="space-y-2 pt-2">
          <div className="h-7 w-48 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
          <div className="h-4 w-72 bg-slate-200/70 dark:bg-slate-800/60 rounded-lg animate-pulse" />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-sm animate-pulse">
          <div className="h-6 w-40 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          <div className="h-12 w-full bg-slate-100 dark:bg-slate-800/60 rounded-xl" />
          <div className="h-28 w-full bg-slate-100 dark:bg-slate-800/60 rounded-xl" />
          <div className="h-12 w-full bg-blue-100 dark:bg-slate-800 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

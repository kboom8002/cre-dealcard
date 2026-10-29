export default function MagazineEditorLoading() {
  return (
    <div
      role="status"
      aria-label="고객 소식지 편집 화면을 불러오는 중입니다"
      className="min-h-screen bg-[#FAF9F5] px-4 sm:px-6 py-6"
    >
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex items-center justify-between shadow-sm animate-pulse">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg" />
            <div className="h-4 w-64 bg-slate-100 dark:bg-slate-800/60 rounded-md" />
          </div>
          <div className="h-11 w-28 bg-blue-100 dark:bg-slate-800 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-40 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3 shadow-sm animate-pulse"
              >
                <div className="h-6 w-44 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                <div className="h-12 w-full bg-slate-100 dark:bg-slate-800/60 rounded-xl" />
                <div className="h-12 w-full bg-slate-100 dark:bg-slate-800/60 rounded-xl" />
              </div>
            ))}
          </div>
          <div className="hidden lg:flex lg:col-span-5 items-start justify-center">
            <div className="w-[360px] h-[680px] rounded-[2.5rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

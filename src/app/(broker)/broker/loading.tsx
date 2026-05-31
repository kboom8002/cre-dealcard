export default function BrokerDashboardLoading() {
  return (
    <div className="flex flex-col items-center min-h-screen px-4 py-8 pb-24 space-y-6 w-full max-w-md mx-auto">
      {/* Header Skeleton */}
      <div className="flex justify-between items-center w-full pt-4">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-slate-800 rounded animate-pulse" />
          <div className="h-4 w-64 bg-slate-800/60 rounded animate-pulse" />
        </div>
        <div className="w-10 h-10 rounded-full bg-slate-800 animate-pulse" />
      </div>

      {/* Antifragile Mode Skeleton */}
      <div className="w-full h-40 bg-slate-900 border border-slate-800 rounded-xl p-4.5 space-y-3 animate-pulse">
        <div className="h-4 w-32 bg-slate-800 rounded" />
        <div className="h-8 w-24 bg-slate-800 rounded" />
        <div className="h-4 w-full bg-slate-800/50 rounded" />
      </div>

      {/* ROI Card Skeleton */}
      <div className="w-full h-32 bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse" />

      {/* KPI grid Skeleton */}
      <div className="w-full grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
        ))}
      </div>

      <div className="w-full grid grid-cols-2 gap-2">
        <div className="h-12 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
        <div className="h-12 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
      </div>

      {/* Market analysis skeleton */}
      <div className="w-full h-36 bg-indigo-950/10 border border-indigo-900/20 rounded-xl p-4.5 animate-pulse" />
    </div>
  );
}

export default function PublicLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero skeleton */}
      <div className="max-w-2xl mx-auto px-6 pt-14 pb-8 text-center">
        <div className="flex justify-center mb-6">
          <div className="skeleton h-7 w-48 rounded-full" />
        </div>
        <div className="skeleton h-10 w-72 rounded-xl mx-auto mb-3" />
        <div className="skeleton h-10 w-56 rounded-xl mx-auto mb-6" />
        <div className="skeleton h-5 w-60 rounded-lg mx-auto mb-2" />
        <div className="skeleton h-5 w-44 rounded-lg mx-auto mb-8" />
        <div className="flex justify-center gap-3">
          <div className="skeleton h-11 w-32 rounded-xl" />
          <div className="skeleton h-11 w-28 rounded-xl" />
        </div>
      </div>

      {/* Stats bar skeleton */}
      <div className="max-w-2xl mx-auto px-4 pb-4">
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-subtle rounded-xl p-3 text-center">
              <div className="skeleton h-4 w-4 rounded-full mx-auto mb-1" />
              <div className="skeleton h-6 w-8 rounded mx-auto mb-1" />
              <div className="skeleton h-3 w-12 rounded mx-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* Category grid skeleton */}
      <div className="max-w-2xl mx-auto px-4 pb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="skeleton h-3 w-16 rounded" />
          <div className="skeleton h-3 w-14 rounded" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="skeleton rounded-2xl h-28"
              style={{ animationDelay: `${i * 0.05}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

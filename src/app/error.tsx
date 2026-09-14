'use client';

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gray-50">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-xl font-bold text-gray-900">예상치 못한 오류가 발생했습니다</h2>
        <p className="text-gray-600 text-sm">{error.message || '잠시 후 다시 시도해 주세요.'}</p>
        <button onClick={reset} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">다시 시도</button>
      </div>
    </div>
  );
}

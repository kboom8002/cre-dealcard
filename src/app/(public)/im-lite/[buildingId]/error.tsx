'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center p-8">
        <h2 className="text-lg font-bold text-gray-900 mb-2">페이지를 불러올 수 없습니다</h2>
        <p className="text-gray-500 text-sm mb-4">잠시 후 다시 시도해 주세요.</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}

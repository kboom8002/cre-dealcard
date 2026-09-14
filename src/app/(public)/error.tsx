'use client';

import Link from 'next/link';

export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-lg text-center space-y-5">
        <h2 className="text-2xl font-semibold text-gray-800">문제가 발생했습니다</h2>
        <p className="text-gray-600">{error.message || '페이지를 불러오는 데 실패했습니다. 다시 시도해 주세요.'}</p>
        <div className="flex gap-4 justify-center">
          <button onClick={reset} className="px-5 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
            다시 시도
          </button>
          <Link href="/" className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors">
            홈으로 가기
          </Link>
        </div>
      </div>
    </div>
  );
}

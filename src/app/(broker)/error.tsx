'use client';

import Link from 'next/link';

export default function BrokerError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <div className="max-w-md text-center space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">브로커 대시보드 오류</h2>
        <p className="text-gray-600">{error.message || '요청을 처리하는 중 오류가 발생했습니다.'}</p>
        <div className="flex gap-4 justify-center">
          <button onClick={reset} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">다시 시도</button>
          <Link href="/dashboard" className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">
            대시보드로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}

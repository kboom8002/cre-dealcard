'use client';

import Link from 'next/link';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <div className="max-w-md text-center space-y-6">
        <h2 className="text-xl font-bold text-red-700">관리자 시스템 오류</h2>
        <p className="text-gray-700 text-sm font-mono bg-gray-100 p-2 rounded text-left overflow-auto max-h-32">
          {error.message || '알 수 없는 오류가 발생했습니다.'}
        </p>
        <div className="flex gap-4 justify-center">
          <button onClick={reset} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">다시 시도</button>
          <Link href="/admin" className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">
            관리자 홈
          </Link>
        </div>
      </div>
    </div>
  );
}

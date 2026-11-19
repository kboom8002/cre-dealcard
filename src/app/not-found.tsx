import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-slate-50">
      <div className="max-w-md text-center space-y-6 bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <h2 className="text-4xl font-bold text-slate-900">404</h2>
        <h3 className="text-xl font-semibold text-slate-800">페이지를 찾을 수 없습니다</h3>
        <p className="text-sm text-slate-600">요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.</p>
        <div className="pt-4">
          <Link
            href="/"
            className="inline-flex min-h-[48px] items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold text-sm transition-colors"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}

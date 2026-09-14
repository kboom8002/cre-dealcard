import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-gray-50">
      <div className="max-w-md text-center space-y-6">
        <h2 className="text-4xl font-bold text-gray-900">404</h2>
        <h3 className="text-xl font-semibold text-gray-700">페이지를 찾을 수 없습니다</h3>
        <p className="text-gray-600">요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.</p>
        <div className="pt-4">
          <Link href="/" className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}

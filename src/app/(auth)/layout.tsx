import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '크리딜 (CREDEAL) — 계정',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F7F6F2] text-slate-900 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex flex-col items-center gap-1 group min-h-[44px] justify-center">
            <span className="text-3xl font-black tracking-tight text-slate-900 group-hover:text-blue-700 transition-colors">
              크리딜 <span className="text-blue-700">CREDEAL</span>
            </span>
            <span className="text-sm text-slate-600 font-semibold tracking-wide">
              상업용 부동산 중개인 전용
            </span>
          </Link>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5" aria-label="핵심 4대 메뉴">
            {['부동산뉴스', '딜카드', 'IM', '고객 소통'].map((label) => (
              <span
                key={label}
                className="inline-flex items-center rounded-full border border-slate-300/80 bg-white/90 px-3 py-1 text-sm font-semibold text-slate-700 shadow-2xs"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

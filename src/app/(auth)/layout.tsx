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
            <span className="text-sm text-slate-600 font-mono uppercase tracking-widest">
              CRE Intelligence Platform
            </span>
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}

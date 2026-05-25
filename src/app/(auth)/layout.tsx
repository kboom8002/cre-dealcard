import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'JS 딜카드 — 계정',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex flex-col items-center gap-1 group">
            <span className="text-3xl font-black tracking-tight text-white group-hover:text-primary transition-colors">
              JS <span className="text-primary">딜카드</span>
            </span>
            <span className="text-xs text-neutral-500 font-mono uppercase tracking-widest">
              CRE Intelligence Platform
            </span>
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/service';
import { computeDataGrade } from '@/domain/building/grade-engine';
import { classifyDealArchetype } from '@/domain/building/archetype-classifier';
import { buildAttrsFromSsotLite, buildProvenanceFromSsotLite, readWithMigration } from '@/lib/ssot-adapter';

export const metadata: Metadata = {
  title: 'Deal Workspace | CREDEAL',
  description: '딜 워크스페이스 — 자산 정보, 재무 분석, 문서 발행을 한 곳에서',
};

interface DealLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function DealWorkspaceLayout({ children, params }: DealLayoutProps) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: _building } = await readWithMigration(id);
  const building = _building as any;

  if (!building) return notFound();

  const attrs = buildAttrsFromSsotLite(building);
  const provenance = buildProvenanceFromSsotLite(building);
  const gradeResult = computeDataGrade(attrs, provenance);
  const archetypeResult = classifyDealArchetype(attrs);

  // Grade color mapping
  const gradeColors: Record<string, string> = {
    A: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    B: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
    C: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
    D: 'text-red-400 border-red-500/30 bg-red-500/10',
  };

  return (
    <main className="flex flex-col min-h-screen bg-neutral-950 text-neutral-100 font-sans">
      {/* Workspace Header */}
      <header className="sticky top-0 z-30 bg-neutral-950/80 backdrop-blur-xl border-b border-neutral-800/50">
        <div className="max-w-5xl mx-auto px-4 py-3">
          {/* Back */}
          <a href="/broker" className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-white transition-colors mb-1">
            <span>←</span> <span>대시보드</span>
          </a>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-white truncate flex items-center gap-2">
                {building.area_signal || '매물'} {building.asset_type || ''}
                {/* Grade Badge */}
                <span className={`text-xs font-black px-2 py-0.5 rounded-md border ${gradeColors[gradeResult.grade] || gradeColors.D}`}>
                  {gradeResult.grade}
                </span>
                {/* Archetype Badge */}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                  {archetypeResult.primaryArchetype.replace(/_/g, ' ')}
                </span>
              </h1>
              <p className="text-xs text-neutral-400">{building.price_band || '가격대 미정'} · 완성도 {building.completeness_score ?? 0}점</p>
            </div>
            {/* Completeness Gauge */}
            <div className="shrink-0 flex items-center gap-2 bg-neutral-900/60 border border-neutral-800 rounded-xl px-3 py-2">
              <div className="relative w-10 h-10 flex items-center justify-center">
                <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-neutral-800" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-primary" strokeWidth="3"
                    strokeDasharray={`${(building.completeness_score || 0) * 0.94} 94`} strokeLinecap="round" />
                </svg>
                <span className="absolute text-[10px] font-black text-white">{building.completeness_score ?? 0}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 pb-24">
        {children}
      </div>
    </main>
  );
}

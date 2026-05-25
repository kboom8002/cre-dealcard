import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase/service';

export const metadata: Metadata = {
  title: 'B-SSoT Studio Pro | JS 딜카드',
  description: '매물 정보의 신뢰도 등급 계산 및 민감정보 공개 설정 관리 스튜디오',
};

interface StudioLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function StudioLayout({ children, params }: StudioLayoutProps) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: building } = await supabase
    .from('building_ssot_lite')
    .select('id, area_signal, asset_type, price_band, completeness_score')
    .eq('id', id)
    .single();

  if (!building) return notFound();

  return (
    <main className="flex flex-col items-center min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8 pb-24 font-sans">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        
        {/* Back Link & Title */}
        <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between pt-2">
          <div>
            <Link
              href={`/broker/deal-card/${id}`}
              className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-white transition-colors mb-2 cursor-pointer"
            >
              <span>←</span> <span>자산 딜카드 정보로 돌아가기</span>
            </Link>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>🛠️ B-SSoT Studio Pro</span>
              <span className="text-xs bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 rounded-md font-mono uppercase font-black">
                v0.2 Enterprise
              </span>
            </h1>
            <p className="text-xs text-neutral-400 mt-1">
              자산: <span className="text-neutral-200 font-semibold">{building.area_signal || '권역 미상'} {building.asset_type || ''}</span> ({building.price_band || '가격대 미정'})
            </p>
          </div>

          {/* Completeness Gauge Shell */}
          <div className="flex items-center gap-3 bg-neutral-900/60 border border-neutral-800 rounded-2xl px-4 py-3 shrink-0">
            <div className="text-right">
              <span className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                신뢰도 완성도 점수
              </span>
              <span className="text-xl font-black text-primary">
                {building.completeness_score ?? 0}<span className="text-xs font-normal text-neutral-400 ml-0.5">점</span>
              </span>
            </div>
            <div className="relative w-12 h-12 flex items-center justify-center rounded-full bg-neutral-950 border border-neutral-850">
              <div
                className="absolute inset-1 rounded-full border-2 border-primary/25"
                style={{
                  clipPath: `polygon(50% 50%, -50% -50%, ${100 + (building.completeness_score || 0)}% -50%)`,
                }}
              ></div>
              <span className="text-[10px] font-black text-neutral-200 font-mono">
                {building.completeness_score ?? 0}%
              </span>
            </div>
          </div>
        </div>

        {/* Child Views */}
        <div className="w-full">
          {children}
        </div>

      </div>
    </main>
  );
}

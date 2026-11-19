import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';
import { getWorkspaceItemByAnyId } from '@/lib/workspace/workspace-repository';
import { readWithMigration } from '@/lib/ssot-adapter';

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

  const userSupabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const role = profile?.role ?? null;

  const ownership = await assertBuildingOwner(supabase, id, user.id, {
    allowAdmin: true,
    role,
  });

  let wsFallbackItem: Awaited<ReturnType<typeof getWorkspaceItemByAnyId>> = null;
  if (!ownership.ok) {
    if (ownership.status === 404) {
      wsFallbackItem = await getWorkspaceItemByAnyId(supabase, id).catch(() => null);
      if (!wsFallbackItem || (wsFallbackItem.ownerId !== user.id && role !== 'admin')) {
        redirect('/broker');
      }
    } else {
      redirect('/broker');
    }
  }

  const { data: _building } = await readWithMigration(id);
  const building = (_building as any) ?? (wsFallbackItem
    ? {
        id: wsFallbackItem.buildingId || wsFallbackItem.id,
        area_signal: wsFallbackItem.address || '권역 미상',
        asset_type: wsFallbackItem.title || '',
        price_band: wsFallbackItem.priceBand || '가격대 미정',
        completeness_score: 0,
      }
    : null);

  if (!building) return notFound();

  const score = Number(building.completeness_score ?? 0);

  return (
    <main className="flex flex-col items-center min-h-screen bg-slate-50 text-slate-900 px-4 py-8 pb-24 font-sans">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        {/* Back Link & Title */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between pt-2">
          <div>
            <Link
              href={`/broker/deal-card/${id}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors mb-2 cursor-pointer"
            >
              <span>←</span> <span>자산 딜카드 정보로 돌아가기</span>
            </Link>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex flex-wrap items-center gap-2">
              <span>🛠️ B-SSoT Studio Pro</span>
              <span className="text-sm bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-md font-mono uppercase font-bold">
                v0.2 Enterprise
              </span>
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              자산:{' '}
              <span className="text-slate-900 font-semibold">
                {building.area_signal || '권역 미상'} {building.asset_type || ''}
              </span>{' '}
              ({building.price_band || '가격대 미정'})
            </p>
          </div>

          {/* Completeness Gauge Shell */}
          <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-xs shrink-0">
            <div className="text-right">
              <span className="block text-sm font-bold text-slate-600">
                신뢰도 완성도 점수
              </span>
              <span className="text-xl font-black text-blue-700">
                {score}
                <span className="text-sm font-normal text-slate-500 ml-0.5">점</span>
              </span>
            </div>
            <div className="relative w-12 h-12 flex items-center justify-center rounded-full bg-slate-100 border border-slate-200">
              <div
                className="absolute inset-1 rounded-full border-2 border-blue-300"
                style={{
                  clipPath: `polygon(50% 50%, -50% -50%, ${100 + score}% -50%)`,
                }}
              />
              <span className="text-sm font-black text-slate-800 font-mono">
                {score}%
              </span>
            </div>
          </div>
        </div>

        {/* Child Views */}
        <div className="w-full">{children}</div>
      </div>
    </main>
  );
}

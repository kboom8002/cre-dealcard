import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/service';
import { SubscribeFormClient } from './SubscribeFormClient';

interface PageProps {
  params: Promise<{ brokerId: string }>;
  searchParams: Promise<{ source?: string; ref?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { brokerId } = await params;
  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from('broker_profiles')
    .select('name, company, specialty_regions, specialty_assets')
    .or(`slug.eq.${brokerId},user_id.eq.${brokerId}`)
    .maybeSingle();

  const name = profile?.name || brokerId;
  const company = profile?.company || 'CRE DealCard';

  return {
    title: `${name}의 주간 부동산 매거진 구독 신청 | ${company}`,
    description: `${name} 중개사가 엄선한 실거래가, 시장 인텔리전스, 비공개 추천 매물을 매주 카카오톡으로 받아보세요.`,
    openGraph: {
      title: `[무료 구독] ${name}의 CRE 주간 매거진`,
      description: '엄선된 실거래 분석과 단독 급매 정보를 카카오톡으로 정기 발송해 드립니다.',
      type: 'website',
    },
  };
}

export const revalidate = 3600;

export default async function MagazineSubscribePage({ params, searchParams }: PageProps) {
  const { brokerId } = await params;
  const { source, ref } = await searchParams;
  const supabase = createServiceClient();

  // 1. 브로커 프로필 조회
  const { data: bp } = await supabase
    .from('broker_profiles')
    .select('user_id, slug, name, company, specialty_regions, specialty_assets, bio, magazine_title, magazine_cover_image')
    .or(`slug.eq.${brokerId},user_id.eq.${brokerId}`)
    .maybeSingle();

  let userProfile = null;
  if (bp?.user_id) {
    const { data: p } = await supabase
      .from('profiles')
      .select('display_name, photo_url, phone')
      .eq('id', bp.user_id)
      .maybeSingle();
    userProfile = p;
  }

  const brokerName = bp?.name || userProfile?.display_name || brokerId;
  const brokerCompany = bp?.company || 'CRE DealCard 파트너';
  const brokerSlug = bp?.slug || brokerId;
  const regions = bp?.specialty_regions || ['강남·서초', '성수·마포'];
  const assets = bp?.specialty_assets || ['꼬마빌딩', '상가/근생'];
  const photoUrl = userProfile?.photo_url || null;

  // 2. 최신 발행 에디션 정보 (미리보기 링크용)
  const { data: latestEd } = await supabase
    .from('magazine_editions')
    .select('published_at, created_at')
    .eq('broker_id', brokerSlug)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestDate = (latestEd?.published_at || latestEd?.created_at || new Date().toISOString()).slice(0, 10);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#070913] via-[#0d1124] to-[#080a15] text-slate-100 flex flex-col justify-between p-4 sm:p-6 font-sans">
      <div className="max-w-md w-full mx-auto space-y-6 pt-4 pb-12">
        {/* 상단 브로커 소개 배너 */}
        <div className="text-center space-y-3">
          <div className="relative inline-block">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={brokerName}
                className="w-20 h-20 rounded-full mx-auto object-cover border-2 border-indigo-500/40 shadow-xl"
              />
            ) : (
              <div className="w-20 h-20 rounded-full mx-auto bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-2xl font-bold text-white border-2 border-indigo-500/30 shadow-xl">
                {brokerName.slice(0, 1)}
              </div>
            )}
            <span className="absolute bottom-0 right-0 p-1 rounded-full bg-emerald-500 text-white shadow-md">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </span>
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-black text-white tracking-tight">
              {brokerName} <span className="text-sm font-normal text-slate-400">중개사</span>
            </h1>
            <p className="text-xs text-indigo-300 font-medium">{brokerCompany}</p>
            <div className="flex items-center justify-center gap-1.5 pt-1 flex-wrap">
              {regions.map((r: string) => (
                <span key={r} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  📍 {r}
                </span>
              ))}
              {assets.map((a: string) => (
                <span key={a} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950/40 text-indigo-300 border border-indigo-800/40">
                  🏢 {a}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 안내 카드 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-2">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
            <span>✨</span>
            <span>매주 화요일 카카오톡 무료 발송</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            포털에 공개되지 않는 알짜 실거래가 분석, 세무 팁, 권역별 급매 딜 브리핑을 가장 먼저 전달해 드립니다.
          </p>
        </div>

        {/* 클라이언트 간편 구독 폼 */}
        <SubscribeFormClient
          brokerId={brokerSlug}
          brokerName={brokerName}
          regions={regions}
          assets={assets}
          initialSource={source || 'qr_card'}
          referrer={ref || null}
          latestDate={latestDate}
        />
      </div>

      <footer className="text-center text-[10px] text-slate-600 pb-4">
        © CRE DealCard · 상업용 부동산 인텔리전스 네트워크
      </footer>
    </div>
  );
}

import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/service';
import {
  canonicalBrokerSlug,
  findIssueForDate,
  findLatestIssueDate,
  maskPublicAddresses,
  publicBrokerDisplayName,
  resolvePublicBroker,
} from '@/lib/magazine/public-page-data';
import { resolveSubscribeSource } from '@/lib/magazine/subscribe-source';
import { formatKoreanDate } from '@/lib/magazine/kst';
import { MAGAZINE_SEND_DAY_LABEL } from '@/lib/magazine/schedule-labels';
import { InitialAvatar } from '@/components/magazine/InitialAvatar';
import { SubscribeFormClient } from './SubscribeFormClient';

interface PageProps {
  params: Promise<{ brokerId: string }>;
  searchParams: Promise<{ source?: string; ref?: string }>;
}

// broker_profiles 에는 company/magazine_title 컬럼이 없다(운영 스키마) → 존재 컬럼만 select (I-01/I-02).
const BROKER_COLUMNS = 'user_id, slug, name, specialty_regions, specialty_assets, bio, photo_url';

const loadBroker = cache(async (param: string) => {
  const supabase = createServiceClient();
  const bp = await resolvePublicBroker(supabase, param, BROKER_COLUMNS);
  if (!bp) return null;
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name, photo_url, company')
    .eq('id', bp.user_id)
    .maybeSingle();
  if (error) throw new Error(`profile lookup failed: ${error.message}`);
  return { bp, profile };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { brokerId } = await params;
  const found = await loadBroker(brokerId);
  if (!found) return { title: '매거진 구독 | CRE DealCard', robots: { index: false, follow: false } };

  const name = publicBrokerDisplayName(found.bp.name, found.profile?.display_name) || '중개사';
  const company = found.profile?.company || 'CRE DealCard';

  return {
    title: `${name}의 주간 부동산 매거진 구독 신청 | ${company}`,
    description: `${name} 중개사의 실거래가, 시장 인텔리전스, 추천 매물 브리핑을 ${MAGAZINE_SEND_DAY_LABEL} 카카오톡으로 받아보세요.`,
    openGraph: {
      title: `[무료 구독] ${name}의 CRE 주간 매거진`,
      description: '실거래 분석과 시장 인텔리전스를 카카오톡으로 정기 발송해 드립니다.',
      type: 'website',
    },
  };
}

export const revalidate = 3600;

export default async function MagazineSubscribePage({ params, searchParams }: PageProps) {
  const { brokerId } = await params;
  const { source, ref } = await searchParams;

  const found = await loadBroker(brokerId);
  if (!found) notFound(); // 존재하지 않는 중개사의 가짜 폼 제거 (T2-CL-1, U2-05)

  const { bp, profile } = found;

  // uuid 로 접근했고 slug 가 있으면 slug URL 로 308 (정규 URL 1개)
  const canonical = canonicalBrokerSlug(brokerId, bp);
  if (canonical) {
    const qs = new URLSearchParams();
    if (source) qs.set('source', source);
    if (ref) qs.set('ref', ref);
    const q = qs.toString();
    permanentRedirect(`/magazine/${canonical}/subscribe${q ? `?${q}` : ''}`);
  }

  const brokerName = publicBrokerDisplayName(bp.name, profile?.display_name) || '';
  const brokerCompany = profile?.company || null;
  const brokerSlug = (bp.slug as string | null) ?? brokerId;
  const regions = Array.isArray(bp.specialty_regions) ? (bp.specialty_regions as string[]) : [];
  const assets = Array.isArray(bp.specialty_assets) ? (bp.specialty_assets as string[]) : [];
  const photoUrl = profile?.photo_url || (bp.photo_url as string | null) || null;

  // 실제 최신 발행본 날짜. 없으면 null → 링크 숨김 (오늘 날짜 폴백 금지, T2-CL-2)
  const supabase = createServiceClient();
  const latestDate = await findLatestIssueDate(supabase, bp);

  // 최근 호 미리보기 카드 (구독 전 '무엇을 받는지' 확인). 조회가 실패하면 카드만 생략하고 오류는 기록한다.
  let preview: { headline: string | null; label: string } | null = null;
  if (latestDate) {
    try {
      const issue = await findIssueForDate(supabase, bp, latestDate);
      if (issue) {
        const masked = maskPublicAddresses(issue);
        const headline = typeof masked.headline === 'string' && masked.headline.trim() ? masked.headline.trim() : null;
        preview = { headline, label: formatKoreanDate(latestDate) };
      }
    } catch (err) {
      console.error('[magazine/subscribe] latest issue preview failed', err);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#070913] via-[#0d1124] to-[#080a15] text-slate-100 flex flex-col justify-between p-4 sm:p-6 font-sans">
      <main id="magazine-main" className="max-w-md w-full mx-auto space-y-6 pt-4 pb-12">
        {/* 상단 브로커 소개 배너 */}
        <header className="text-center space-y-3">
          <div className="relative inline-block">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={`${brokerName} 중개사 사진`}
                className="w-20 h-20 rounded-full mx-auto object-cover border-2 border-indigo-500/40 shadow-xl"
              />
            ) : (
              <InitialAvatar name={brokerName} size={80} className="mx-auto" />
            )}
          </div>

          <div className="space-y-1">
            <h1 className="text-title font-black text-white tracking-tight">
              {brokerName} <span className="text-label font-normal text-ink-muted">중개사의 매거진 구독</span>
            </h1>
            {brokerCompany && <p className="text-label text-indigo-200 font-medium">{brokerCompany}</p>}
            {(regions.length > 0 || assets.length > 0) && (
              <div className="flex items-center justify-center gap-1.5 pt-1 flex-wrap">
                {regions.map((r: string) => (
                  <span key={r} className="text-caption px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700">
                    📍 {r}
                  </span>
                ))}
                {assets.map((a: string) => (
                  <span key={a} className="text-caption px-2 py-0.5 rounded-full bg-indigo-950/40 text-indigo-200 border border-indigo-800/40">
                    🏢 {a}
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* 안내 카드 */}
        <section aria-label="발송 안내" className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-2">
          <div className="flex items-center gap-2 text-amber-300 text-label font-bold">
            <span aria-hidden="true">✨</span>
            <span>{MAGAZINE_SEND_DAY_LABEL} 카카오톡 무료 발송</span>
          </div>
          <p className="text-label text-ink-muted leading-relaxed">
            실거래가 분석, 시장 인텔리전스, 권역별 매물 브리핑을 전달해 드립니다.
          </p>
        </section>

        {/* 최근 호 미리보기 */}
        {preview && latestDate && (
          <section aria-label="최근 발행 미리보기" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2" data-testid="recent-preview">
            <p className="text-caption font-bold text-ink-subtle">최근 발행 · {preview.label}</p>
            <p className="text-body font-bold text-white leading-snug line-clamp-3">
              {preview.headline ?? `${brokerName}의 CRE 매거진`}
            </p>
            <Link
              href={`/magazine/${encodeURIComponent(brokerSlug)}/${latestDate}`}
              className="inline-flex min-h-11 items-center text-label font-semibold text-indigo-300 hover:text-indigo-200"
            >
              이런 내용을 받아봐요 — 먼저 읽어보기 →
            </Link>
          </section>
        )}

        {/* 클라이언트 간편 구독 폼 */}
        <SubscribeFormClient
          brokerId={brokerSlug}
          brokerName={brokerName}
          regions={regions}
          assets={assets}
          initialSource={resolveSubscribeSource(source, ref)}
          referrer={ref || null}
          latestDate={latestDate}
        />
      </main>

      <footer className="text-center text-caption text-ink-subtle pb-4">
        © CRE DealCard · 상업용 부동산 인텔리전스 네트워크
      </footer>
    </div>
  );
}

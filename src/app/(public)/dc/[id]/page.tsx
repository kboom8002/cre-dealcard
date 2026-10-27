import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/service";
import { readWithMigration } from '@/lib/ssot-adapter';
import { TeaserEventTracker } from '@/components/teaser/TeaserEventTracker';
import { toPublicDealCard } from '@/domain/public-projection/deal-card';
import { evaluateDealCardPublicVisibility } from '@/domain/public-projection/visibility';
import { isOwnerOrAdmin } from '@/domain/public-projection/access';
import { getServerViewer } from '@/lib/server-viewer';

// v3 Goldilocks components
import { TeaserHeroHeader } from '@/components/teaser/TeaserHeroHeader';
import { PostureWidget } from '@/components/teaser/PostureWidget';
import { PublicPolicyBlock } from '@/components/teaser/PublicPolicyBlock';
import { CTALadder } from '@/components/teaser/CTALadder';
import { TrustLine } from '@/components/teaser/TrustLine';
import { PoweredByBadge } from '@/components/ui/PoweredByBadge';

interface PageProps { 
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

// ── 데이터 조회 ──
// P0-SEC: React cache() — generateMetadata 와 page 가 같은 요청에서 한 번만 조회한다
// (readWithMigration 의 lazy-write 부수효과 중복 방지).
const getDealCardData = cache(async (id: string) => {
  const supabase = createServiceClient();

  const [buildingRes, ssotMetaRes, signalCardRes, teaserDocRes, imDocRes] = await Promise.all([
    readWithMigration(id),
    // P0-SEC: owner_id / status 는 SSoT 원천(building_ssot_lite)에서 직접 조회 (assets 에는 없음)
    supabase
      .from("building_ssot_lite")
      .select("owner_id, status")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("building_signal_cards")
      .select("id, title, area_signal, asset_type, price_band, deal_points, body, status, visibility")
      .eq("building_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("document_objects")
      .select("body")
      .eq("building_id", id)
      .eq("document_type", "blind_teaser")
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // IM 문서 존재 여부 및 공식 승인 상태 확인 (im_lite, im_lite_draft, mobile_im)
    supabase
      .from("document_objects")
      .select("id, status, approval_stage, pptx_file_hash, pptx_download_url")
      .eq("building_id", id)
      .in("document_type", ["im_lite", "im_lite_draft", "mobile_im"])
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const ownerId: string | null = ssotMetaRes.data?.owner_id ?? null;
  const buildingStatus: string | null = ssotMetaRes.data?.status ?? null;

  let brokerProfile: Record<string, any> | null = null;
  if (ownerId) {
    const [{ data: bProfile }, { data: baseProfile }] = await Promise.all([
      supabase
        .from("broker_profiles")
        .select("display_name, specialty, response_guarantee_hours, closed_deals, is_licensed, slug, phone, avatar_url")
        .eq("user_id", ownerId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("display_name, phone, company, photo_url, role")
        .eq("id", ownerId)
        .maybeSingle(),
    ]);

    const avatarUrl = bProfile?.avatar_url || baseProfile?.photo_url || (baseProfile as any)?.avatar_url || null;
    const displayName = bProfile?.display_name || baseProfile?.display_name || "담당 중개사";
    const phone = bProfile?.phone || baseProfile?.phone || null;
    const specialty = bProfile?.specialty || (baseProfile?.company ? `${baseProfile.company} 소속` : "검증 공인중개사");

    brokerProfile = {
      display_name: displayName,
      phone,
      specialty,
      avatar_url: avatarUrl,
      is_licensed: bProfile?.is_licensed ?? true,
      response_guarantee_hours: bProfile?.response_guarantee_hours ?? null,
      closed_deals: bProfile?.closed_deals ?? null,
      slug: bProfile?.slug ?? null,
    };
  }

  const isPptxApproved =
    imDocRes.data?.approval_stage === 'S70_FILE_APPROVAL' ||
    (imDocRes.data?.status === 'published' && !!imDocRes.data?.pptx_file_hash);
  const pptxDownloadUrl = imDocRes.data?.pptx_download_url || `/api/public/im-lite/${id}/pptx`;

  return {
    building: buildingRes.data as Record<string, any>,
    signalCard: signalCardRes.data,
    teaserDoc: teaserDocRes.data,
    brokerProfile,
    hasImDoc: !!imDocRes.data,
    isPptxApproved,
    pptxDownloadUrl,
    ownerId,
    buildingStatus,
  };
});

type DealCardData = Awaited<ReturnType<typeof getDealCardData>>;

/** Server-only → public DTO. Only this crosses into JSX / client components. */
function projectPublic(id: string, data: DealCardData) {
  return toPublicDealCard({
    id,
    building: data.building,
    signalCard: data.signalCard,
    teaserDoc: data.teaserDoc,
    brokerProfile: data.brokerProfile,
    hasImDoc: data.hasImDoc,
    isPptxApproved: data.isPptxApproved,
    pptxDownloadUrl: data.pptxDownloadUrl,
  });
}

function isPublicDealCard(data: DealCardData): boolean {
  return evaluateDealCardPublicVisibility({
    buildingStatus: data.buildingStatus,
    signalCardVisibility: data.signalCard?.visibility,
    signalCardStatus: data.signalCard?.status,
  }).isPublic;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const data = await getDealCardData(id);

  // P0-SEC: 비공개(archived / internal_only) 딜카드는 크롤러에 어떤 내용도 노출하지 않는다.
  if (!isPublicDealCard(data)) {
    return { title: "크리딜 DealCard", robots: { index: false, follow: false } };
  }

  const { og } = projectPublic(id, data);
  const ogTitle = og.title;
  const ogDescription = og.description;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://credeal.net';
  const absoluteOgImage = `${siteUrl}/api/og/deal/${id}/kakao`;

  return {
    title: `${ogTitle} | 크리딜 DealCard`,
    description: ogDescription,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      type: "article",
      images: [
        {
          url: absoluteOgImage,
          width: 800,
          height: 400,
          alt: ogTitle,
        }
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: [absoluteOgImage],
    },
  };
}

export const revalidate = 3600;

export default async function DealCardShortPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sParams = searchParams ? await searchParams : {};
  const isPreviewMode = sParams.preview === "1" || sParams.preview === "true";
  const data = await getDealCardData(id);

  // P0-SEC: 비공개 상태(building archived / signal card internal_only·archived)는 공개 404.
  // 소유 중개사(또는 admin)는 인증 쿠키로 확인되어 계속 볼 수 있다
  // (LiveDealCardPreviewCard 의 same-origin iframe `/dc/{id}?preview=1` 포함).
  if (!isPublicDealCard(data)) {
    const viewer = await getServerViewer();
    if (!isOwnerOrAdmin(viewer, data.ownerId)) notFound();
  }

  const card = projectPublic(id, data);
  const { hero, broker, cta, policy } = card;

  // 데이터 최소성 검사
  if (!card.hasMinimalData && !isPreviewMode) {
    return (
      <main className="min-h-screen bg-[#0B0F14] text-[#E7ECF2] flex items-center justify-center p-4">
        <div className="max-w-[392px] w-full bg-[#141A21] border border-[#252E39] rounded-2xl p-6 text-center space-y-4">
          <div className="text-4xl">🚧</div>
          <h1 className="text-lg font-bold text-white">데이터 보강 필요</h1>
          <p className="text-sm text-[#9AA7B5]">
            해당 매물은 아직 필수 데이터가 충분히 입력되지 않아 딜카드를 생성할 수 없습니다. 
            중개사님의 추가 정보 입력이 필요합니다.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0B0F14] text-[#E7ECF2] pb-24">
      <TeaserEventTracker teaserConfigId={card.teaserConfigId} />

      <div className="max-w-[392px] mx-auto">
        {/* ① TeaserHeroHeader — 관점배지 + 히어로 + 적응형 4칸(최소 2개 보장) */}
        <TeaserHeroHeader
          archetype={hero.archetype ?? undefined}
          regionLabel={hero.regionLabel}
          bandedPrice={hero.bandedPrice}
          bandedCapRate={hero.bandedCapRate}
          bandedArea={hero.bandedArea}
          vacancyLabel={hero.vacancyLabel ?? undefined}
          title={hero.title}
          hookCopy={hero.hookCopy}
          posture={hero.posture}
          postureLabel={hero.postureLabel}
          postureHeroTiles={hero.postureHeroTiles}
          urgencyTag={hero.urgencyTag ?? undefined}
        />

        <div className="px-4 space-y-3.5 mt-3">
          {/* ②-b 핵심 딜포인트 (blind_teaser에서 추출) */}
          {(() => {
            const dp = card.dealPoints;
            return dp.length > 0 ? (
              <div
                data-testid="public-dealcard-points"
                className="rounded-xl bg-slate-800/70 border border-slate-700/60 p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-bold text-amber-400 tracking-wide flex items-center gap-1.5">
                    <span>⭐ 핵심 투자 포인트 ({dp.length}선)</span>
                  </p>
                  <span className="text-[12px] text-slate-300">매수 검토 핵심 요약</span>
                </div>
                <ul className="space-y-2.5">
                  {dp.map((pt: string, i: number) => (
                    <li key={i} className="flex items-start gap-2.5 text-[15px] text-slate-100 leading-relaxed break-keep">
                      <span className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null;
          })()}

          {/* ③ 포스처 특화 위젯 (결과 우선 + 접이식 슬라이더) — 최소 허용 필드만 전달 (P0-SEC SEC-5) */}
          <PostureWidget
            input={card.postureWidget}
            buildingId={id}
          />

          {/* ④ 담당 중개사 프로필 (TrustLine - 전화 연결 기능 탑재) */}
          <TrustLine
            brokerName={broker.displayName}
            brokerPhone={broker.phone ?? undefined}
            brokerSlug={broker.slug ?? undefined}
            brokerAvatarUrl={broker.avatarUrl ?? undefined}
            specialty={broker.specialty ?? undefined}
            responseGuaranteeHours={broker.responseGuaranteeHours ?? undefined}
            closedDeals={broker.closedDeals ?? undefined}
            isLicensed={broker.isLicensed}
          />

          {/* ⑤ CTALadder — Basic/Pro 이분화 & Floating Sticky Bar */}
          <CTALadder
            buildingId={id}
            teaserConfigId={card.teaserConfigId}
            brokerPhone={broker.phone ?? undefined}
            requireNda={cta.requireNda}
            hasImDoc={cta.hasImDoc}
            isPptxApproved={cta.isPptxApproved}
            pptxDownloadUrl={cta.pptxDownloadUrl}
          />


          {/* ⑥ 매도자 보호 및 비밀유지 안내 (접이식) */}
          <details className="group text-[13px] text-slate-300 border border-slate-800 rounded-xl p-3.5 bg-slate-900/50">
            <summary className="cursor-pointer font-semibold text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-2">
                🛡️ 매도자 보호 및 정보 보안 안내
                <span className="inline-flex items-center gap-1 text-[12px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  주소 비공개 보호 적용
                </span>
              </span>
              <span className="text-[12px] text-slate-400 group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="pt-2">
              <PublicPolicyBlock
                candidateCount={policy.candidateCount}
                kThreshold={policy.kThreshold}
                passed={policy.passed}
              />
            </div>
          </details>

          {/* DORMANT: ux60-focus — 공개 구매자 화면에서 중개사 전용 매칭 허브 숨김 (복원 시 docs/rollback/2026-10-18-dormant-features.md 참조)
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <span>⚡</span> 중개사 전용 매칭 허브
              </span>
              <Link href={`/broker/deal-card/${id}`} className="text-[11px] text-primary hover:underline">
                딜카드 관리 →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href={`/broker/matching?buildingId=${id}`}
                className="flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-xs font-medium text-slate-200 transition-colors"
              >
                <span>🎯 매수자 매칭</span>
              </Link>
              <Link
                href={`/broker/tenant-intents?buildingId=${id}`}
                className="flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-xs font-medium text-slate-200 transition-colors"
              >
                <span>🏢 임차의향서</span>
              </Link>
            </div>
          </div>
          */}

          {/* ⑧ Powered-by Dual Branding Badge */}
          <PoweredByBadge variant="full" context="dealcard" buildingId={id} />

          {/* Legal Disclaimer */}
          <div className="text-center px-2 pt-2 pb-4">

            <p className="text-[10px] text-slate-500 leading-relaxed">
              본 자산은 매도자 요청으로 지번 및 소유자가 블라인드 처리되었습니다.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}



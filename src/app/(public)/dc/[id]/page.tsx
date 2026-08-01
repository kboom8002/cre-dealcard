import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { projectToTeaser } from '@/domain/deal/teaser/teaser-projector';
import { buildAttrsFromSsotLite, readWithMigration } from '@/lib/ssot-adapter';
import { TeaserEventTracker } from '@/components/teaser/TeaserEventTracker';
import { classifyDealArchetype } from "@/domain/deal/archetype-classifier";
import { computeDataQualityBadge } from "@/domain/building/mobile-im/data-quality-badge";

// New v3 components
import { TeaserHeroHeader } from '@/components/teaser/TeaserHeroHeader';
import { StructureChips } from '@/components/teaser/StructureChips';
import { HookCopyCard } from '@/components/teaser/HookCopyCard';
import { BudgetSlider } from '@/components/teaser/BudgetSlider';
import { CuriosityLock } from '@/components/teaser/CuriosityLock';
import { CTALadder } from '@/components/teaser/CTALadder';
import { TrustLine } from '@/components/teaser/TrustLine';

interface PageProps { params: Promise<{ id: string }> }

// ── 데이터 조회 ──
async function getDealCardData(id: string) {
  const supabase = createServiceClient();

  const [buildingRes, signalCardRes, teaserDocRes] = await Promise.all([
    readWithMigration(id),
    supabase
      .from("building_signal_cards")
      .select("id, title, area_signal, asset_type, price_band, deal_points, body, status")
      .eq("building_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("document_objects")
      .select("body")
      .eq("building_id", id)
      .eq("document_type", "blind_teaser")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let brokerProfile = null;
  let brokerName: string | null = null;
  if (buildingRes.data?.owner_id) {
    const { data: profile } = await supabase
      .from("broker_profiles")
      .select("display_name, specialty, response_guarantee_hours, closed_deals, is_licensed, slug, phone")
      .eq("user_id", buildingRes.data.owner_id)
      .maybeSingle();
    brokerProfile = profile;

    const profileRes = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", buildingRes.data.owner_id)
      .maybeSingle();
    brokerName = profileRes.data?.display_name || brokerProfile?.display_name || null;
  }

  return {
    building: buildingRes.data as Record<string, any>,
    signalCard: signalCardRes.data,
    teaserDoc: teaserDocRes.data,
    brokerProfile,
    brokerName,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const { building, signalCard, teaserDoc } = await getDealCardData(id);

  // Read body and potential custom OG fields
  const body = (signalCard?.body || {}) as Record<string, unknown>;
  const imBodyOg = (teaserDoc?.body ?? {}) as Record<string, any>;

  const ogTitle = imBodyOg.kakaoOgTitle
    || imBodyOg.ogTitle 
    || (signalCard?.title as string)
    || `${building?.area_signal || "상업용 부동산"} ${building?.asset_type || ""} 매각`;
  
  const ogDescription = imBodyOg.kakaoOgDescription
    || imBodyOg.ogDescription 
    || (body.shortSummary as string)
    || `${building?.area_signal || ""} 권역 블라인드 매각 매물`;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://credeal.net';
  const absoluteOgImage = `${siteUrl}/api/og/deal/${id}`;

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
          width: 1200,
          height: 630,
        }
      ],
    },
  };
}

export const revalidate = 3600;

export default async function DealCardShortPage({ params }: PageProps) {
  const { id } = await params;
  const { building, signalCard, teaserDoc, brokerProfile, brokerName } = await getDealCardData(id);

  if (!building) return notFound();

  const attrs = buildAttrsFromSsotLite(building || {});
  const teaserView = projectToTeaser(attrs);
  
  // Use badge computation to handle missing fields explicitly if teaserView doesn't return grade directly
  const TIER_TO_GRADE: Record<string, 'A' | 'B' | 'C' | 'D'> = {
    verified: 'A', partial: 'B', reference: 'C', draft: 'D'
  };
  const dataGrade = teaserView.dataGrade || (() => {
    const badge = computeDataQualityBadge({
      hasAddress: !!building.area_signal,
      hasPublicData: !!(building.layers as Record<string, unknown>)?.public_data,
      hasMonthlyRent: !!(building.lease_summary as Record<string, unknown>)?.monthlyRentTotal,
      hasVacancy: !!building.vacancy_signal,
      hasPhotos: !!(building.layers as Record<string, unknown>)?.photos,
      hasAskingPrice: !!building.price_band,
    });
    return TIER_TO_GRADE[badge.tier] || 'D';
  })();
  
  if (dataGrade === 'D') {
    return (
      <main className="min-h-screen bg-[#0b0f19] text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#131b2e] border border-slate-800 rounded-2xl p-6 text-center space-y-4">
          <div className="text-4xl">🚧</div>
          <h1 className="text-lg font-bold text-white">데이터 보강 필요</h1>
          <p className="text-sm text-slate-400">
            해당 매물은 아직 필수 데이터가 충분히 입력되지 않아 딜카드를 생성할 수 없습니다. 
            중개사님의 추가 정보 입력이 필요합니다.
          </p>
        </div>
      </main>
    );
  }

  const body = (signalCard?.body || {}) as Record<string, unknown>;
  const layers = (building.layers || {}) as Record<string, unknown>;
  const imBody = (teaserDoc?.body ?? {}) as Record<string, any>;

  const hookCopy = imBody.hookCopy || body.hookCopy || teaserView.hookCopy || `${teaserView.region || "비공개 권역"} ${building.asset_type || "빌딩"} 매각`;
  const structureChips = imBody.structureChips || body.structureChips || teaserView.structuralSignals || [];
  const boundaryNote = (body.boundaryNote || body.boundary_note || "매도자 보호를 위해 일부 정보가 블라인드 처리되었습니다.") as string;

  const layerPhotos = (layers.photos as Array<{ url: string; label: string }>) || [];
  const imPhotos: Array<{ url: string; label: string }> = Array.isArray(imBody.photos)
    ? imBody.photos.filter((p: any) => p?.url).map((p: any) => ({ url: p.url, label: p.label || "건물 사진" }))
    : Array.isArray(imBody.photo_urls) && imBody.photo_urls.length > 0
    ? imBody.photo_urls.map((url: string, i: number) => ({ url, label: `건물 사진 ${i + 1}` }))
    : [];
  const photos = layerPhotos.length > 0 ? layerPhotos : imPhotos;

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100 pb-20">
      <TeaserEventTracker teaserConfigId={building?.id || id} />

      <div className="max-w-lg mx-auto">
        {/* ① TeaserHeroHeader */}
        <TeaserHeroHeader
          archetype={teaserView.archetypeResult?.primaryArchetype}
          dataGrade={dataGrade}
          regionLabel={teaserView.region || "비공개 권역"}
          bandedPrice={teaserView.bandedPrice || "가격 미공개"}
          bandedCapRate={teaserView.bandedCapRate || "수익률 확인 중"}
          bandedArea={teaserView.bandedArea || "면적 미공개"}
          vacancyLabel={teaserView.vacancyLabel || (body.vacancyLabel as string | undefined)}
          hookCopy={hookCopy}
        />

        <div className="px-4 space-y-5 mt-5">
          {/* ② Photo Gallery */}
          {photos.length > 0 && (
            <div className="relative rounded-2xl overflow-hidden border border-slate-800">
              <div className="relative w-full aspect-[16/9] bg-neutral-900">
                <Image
                  src={photos[0].url}
                  alt={photos[0].label || "건물 외관"}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 520px"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                {photos.length > 1 && (
                  <div className="absolute top-3 right-3">
                    <span className="px-2 py-0.5 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold rounded-lg">
                      +{photos.length - 1}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ③ StructureChips */}
          <StructureChips chips={structureChips} />

          {/* ④ HookCopyCard */}
          <HookCopyCard hookCopy={hookCopy} />

          {/* ⑤ BudgetSlider (only A or B) */}
          {(dataGrade === 'A' || dataGrade === 'B') && (
            <BudgetSlider
              defaultBudgetEok={Number(building.price_band?.toString().replace(/[^\d]/g, '')) || 100}
              maxBudgetEok={Math.max(Number(building.price_band?.toString().replace(/[^\d]/g, '')) * 2 || 500, 500)}
              teaserConfigId={building?.id || id}
            />
          )}

          {/* ⑥ CuriosityLock */}
          <CuriosityLock
            curiositySlot={body.curiosityHook as string || teaserView.reidentResult?.suggestion || "정밀 호가·위치는 상세 요청 후 공개됩니다"}
            candidateCount={teaserView.reidentResult?.candidateCount}
            passed={teaserView.reidentResult?.passed}
          />

          {/* ⑦ CTALadder */}
          <CTALadder
            buildingId={id}
            teaserConfigId={building?.id || id}
            brokerPhone={brokerProfile?.phone as string | undefined}
          />

          {/* ⑧ TrustLine */}
          <TrustLine
            brokerName={brokerProfile?.display_name as string || "담당 중개사"}
            brokerSlug={brokerProfile?.slug as string | undefined}
            specialty={brokerProfile?.specialty as string | undefined}
            responseGuaranteeHours={brokerProfile?.response_guarantee_hours as number | undefined}
            closedDeals={brokerProfile?.closed_deals as number | undefined}
            isLicensed={brokerProfile?.is_licensed as boolean | undefined}
          />

          {/* Disclaimer */}
          {boundaryNote && (
            <div className="text-center px-4 pt-4 border-t border-slate-800/50 mt-8">
              <p className="text-[10px] text-slate-500 leading-relaxed">{boundaryNote}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { projectToTeaser } from '@/domain/deal/teaser/teaser-projector';
import { buildAttrsFromSsotLite, readWithMigration } from '@/lib/ssot-adapter';
import { TeaserEventTracker } from '@/components/teaser/TeaserEventTracker';

// v3 Goldilocks components
import { TeaserHeroHeader } from '@/components/teaser/TeaserHeroHeader';
import { StructureChips } from '@/components/teaser/StructureChips';
import { CuriosityLock } from '@/components/teaser/CuriosityLock';
import { BudgetSlider } from '@/components/teaser/BudgetSlider';
import { RegulationScreening } from '@/components/teaser/RegulationScreening';
import { PublicPolicyBlock } from '@/components/teaser/PublicPolicyBlock';
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

  // D등급 (데이터 부족) 차단 — 내부 등급은 매수자에게 노출하지 않음
  const hasMinimalData = !!(building.area_signal && building.price_band);
  if (!hasMinimalData) {
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

  const body = (signalCard?.body || {}) as Record<string, unknown>;
  const imBody = (teaserDoc?.body ?? {}) as Record<string, any>;

  const hookCopy = imBody.hookCopy || body.hookCopy || teaserView.hookCopy || `${teaserView.region || "비공개 권역"} ${building.asset_type || "빌딩"} 매각`;
  const structureChips = imBody.structureChips || body.structureChips || teaserView.structuralSignals || [];

  // Posture-related data from teaser view
  const posture = teaserView.posture || 'income';
  const postureLabel = teaserView.postureLabel || '임대수익형';
  const postureHeroTiles = teaserView.postureHeroTiles || [
    { emoji: '💰', label: '매각가', value: teaserView.bandedPrice || '가격 미공개' },
    { emoji: '📊', label: '예상 수익률', value: teaserView.bandedCapRate || '수익률 확인 중' },
    { emoji: '📐', label: '규모', value: teaserView.bandedArea || '면적 미공개' },
    { emoji: '🏠', label: '공실', value: teaserView.vacancyLabel || '정보 없음' },
  ];

  // Curiosity slot — posture별 문장
  const curiositySlot = teaserView.curiositySlot || body.curiosityHook as string || "정밀 호가·위치는 상세 요청 후 공개됩니다";

  // Slider axis2 config from projector
  const sliderAxis2Config = teaserView.sliderAxis2;

  // Regulation data
  const permits = (imBody.permits || body.permits || []) as Array<{ kind: string; status: 'required' | 'cleared' | 'risk'; label: string; estimatedMonths?: number }>;
  const landUseZone = (attrs.zoningRegion || '') as string;
  const isTransactionPermitArea = !!(attrs.isTransactionPermitArea);

  // Budget slider config
  const defaultBudgetEok = Number(building.price_band?.toString().replace(/[^\d]/g, '')) || 100;
  const maxBudgetEok = Math.max(defaultBudgetEok * 2, 500);

  return (
    <main className="min-h-screen bg-[#0B0F14] text-[#E7ECF2] pb-20">
      <TeaserEventTracker teaserConfigId={building?.id || id} />

      <div className="max-w-[392px] mx-auto">
        {/* ① TeaserHeroHeader — 관점배지 + 히어로 + 적응형 4칸 */}
        <TeaserHeroHeader
          archetype={teaserView.archetypeResult?.primaryArchetype}
          regionLabel={teaserView.region || "비공개 권역"}
          bandedPrice={teaserView.bandedPrice || "가격 미공개"}
          bandedCapRate={teaserView.bandedCapRate || "수익률 확인 중"}
          bandedArea={teaserView.bandedArea || "면적 미공개"}
          vacancyLabel={teaserView.vacancyLabel || (body.vacancyLabel as string | undefined)}
          hookCopy={hookCopy}
          posture={posture}
          postureLabel={postureLabel}
          postureHeroTiles={postureHeroTiles}
        />

        <div className="px-4 space-y-4 mt-4">
          {/* ② StructureChips — 특징 칩 */}
          <StructureChips chips={structureChips} />

          {/* ③ CuriosityLock — curiosity 인용 (posture별 문장) */}
          <CuriosityLock
            curiositySlot={curiositySlot}
            candidateCount={teaserView.reidentResult?.candidateCount}
            passed={teaserView.reidentResult?.passed}
          />

          {/* ④ BudgetSlider — 조건 슬라이더 (posture별 축2) */}
          <BudgetSlider
            defaultBudgetEok={defaultBudgetEok}
            maxBudgetEok={maxBudgetEok}
            teaserConfigId={building?.id || id}
            posture={posture}
            sliderAxis2Config={sliderAxis2Config}
          />

          {/* ⑤ RegulationScreening — 규제 스크리닝 (해당 시) */}
          <RegulationScreening
            permits={permits}
            landUseZone={landUseZone}
            isTransactionPermitArea={isTransactionPermitArea}
          />

          {/* ⑥ PublicPolicyBlock — 공개 정책 (항상 표시) */}
          <PublicPolicyBlock
            candidateCount={teaserView.reidentResult?.candidateCount || 0}
            kThreshold={teaserView.reidentResult?.kThreshold || 20}
            passed={teaserView.reidentResult?.passed ?? true}
          />

          {/* ⑦ CTALadder — CTA 3단 */}
          <CTALadder
            buildingId={id}
            teaserConfigId={building?.id || id}
            brokerPhone={brokerProfile?.phone as string | undefined}
          />

          {/* ⑧ TrustLine — 중개인 프로필 */}
          <TrustLine
            brokerName={brokerProfile?.display_name as string || "담당 중개사"}
            brokerSlug={brokerProfile?.slug as string | undefined}
            specialty={brokerProfile?.specialty as string | undefined}
            responseGuaranteeHours={brokerProfile?.response_guarantee_hours as number | undefined}
            closedDeals={brokerProfile?.closed_deals as number | undefined}
            isLicensed={brokerProfile?.is_licensed as boolean | undefined}
          />

          {/* Disclaimer */}
          <div className="text-center px-4 pt-4 border-t border-[#252E39]/50 mt-6">
            <p className="text-[10px] text-[#6B7987] leading-relaxed">
              매도자 보호를 위해 일부 정보가 블라인드 처리되었습니다.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}


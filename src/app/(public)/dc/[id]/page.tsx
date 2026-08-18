import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { projectToTeaser } from '@/domain/deal/teaser/teaser-projector';
import { buildAttrsFromSsotLite, readWithMigration } from '@/lib/ssot-adapter';
import { TeaserEventTracker } from '@/components/teaser/TeaserEventTracker';

// v3 Goldilocks components
import { TeaserHeroHeader } from '@/components/teaser/TeaserHeroHeader';
import { PostureWidget } from '@/components/teaser/PostureWidget';
import { PublicPolicyBlock } from '@/components/teaser/PublicPolicyBlock';
import { CTALadder } from '@/components/teaser/CTALadder';
import { TrustLine } from '@/components/teaser/TrustLine';

interface PageProps { 
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

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

  let brokerProfile: Record<string, any> | null = null;
  if (buildingRes.data?.owner_id) {
    const { data: profile } = await supabase
      .from("broker_profiles")
      .select("display_name, specialty, response_guarantee_hours, closed_deals, is_licensed, slug, phone")
      .eq("user_id", buildingRes.data.owner_id)
      .maybeSingle();
    brokerProfile = profile;

    // Fallback to basic profiles table if broker_profiles record does not exist
    if (!brokerProfile) {
      const { data: baseProfile } = await supabase
        .from("profiles")
        .select("display_name, phone, company")
        .eq("id", buildingRes.data.owner_id)
        .maybeSingle();

      if (baseProfile) {
        brokerProfile = {
          display_name: baseProfile.display_name || "담당 중개사",
          phone: baseProfile.phone,
          specialty: baseProfile.company ? `${baseProfile.company} 소속` : "검증 공인중개사",
          is_licensed: true,
          response_guarantee_hours: null,
          closed_deals: null,
          slug: null,
        };
      }
    }
  }

  return {
    building: buildingRes.data as Record<string, any>,
    signalCard: signalCardRes.data,
    teaserDoc: teaserDocRes.data,
    brokerProfile,
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
    || `${building?.area_signal || "상업용 부동산"} ${building?.asset_type || "매물"} 매각`;
  
  const ogDescription = imBodyOg.kakaoOgDescription
    || imBodyOg.ogDescription 
    || (body.shortSummary as string)
    || `${building?.area_signal || "서울 주요"} 권역 블라인드 매각 딜카드`;

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

export default async function DealCardShortPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sParams = searchParams ? await searchParams : {};
  const isPreviewMode = sParams.preview === "1" || sParams.preview === "true";
  const { building, signalCard, teaserDoc, brokerProfile } = await getDealCardData(id);

  if (!building && !isPreviewMode) return notFound();

  const safeBuilding = building || { id, area_signal: "비공개 권역", asset_type: "근린생활시설", price_band: "가격 협의" };
  const attrs = buildAttrsFromSsotLite(safeBuilding || {});
  const teaserView = projectToTeaser(attrs);

  // 데이터 최소성 검사
  const hasMinimalData = !!(safeBuilding.area_signal || safeBuilding.price_band || safeBuilding.asset_type || teaserDoc);
  if (!hasMinimalData && !isPreviewMode) {
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

  const hookCopy = imBody.hookCopy || body.hookCopy || teaserView.hookCopy || `${teaserView.region || "비공개 권역"} ${safeBuilding.asset_type || "빌딩"} 매각`;
  const posture = teaserView.posture || 'income';
  const postureLabel = teaserView.postureLabel || '임대수익형';
  const postureHeroTiles = teaserView.postureHeroTiles;
  const requireNda = safeBuilding.disclosure?.requireNda === true;

  return (
    <main className="min-h-screen bg-[#0B0F14] text-[#E7ECF2] pb-24">
      <TeaserEventTracker teaserConfigId={safeBuilding?.id || id} />

      <div className="max-w-[392px] mx-auto">
        {/* ① TeaserHeroHeader — 관점배지 + 히어로 + 적응형 4칸(최소 2개 보장) */}
        <TeaserHeroHeader
          archetype={teaserView.archetypeResult?.primaryArchetype}
          regionLabel={teaserView.region}
          bandedPrice={teaserView.bandedPrice}
          bandedCapRate={teaserView.bandedCapRate}
          bandedArea={teaserView.bandedArea}
          vacancyLabel={teaserView.vacancyLabel}
          hookCopy={hookCopy}
          posture={posture}
          postureLabel={postureLabel}
          postureHeroTiles={postureHeroTiles}
          urgencyTag={teaserView.urgencyTag || (body.urgencyTag as any)}
        />

        <div className="px-4 space-y-3.5 mt-3">
          {/* ② 핵심 하이라이트 (대출 승계 정보 포함) */}
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5">
            <p className="text-xs font-bold text-amber-200 flex items-start gap-2 leading-relaxed">
              <span className="shrink-0 text-amber-400">⚡</span>
              <span>{hookCopy || teaserView.highlightText}</span>
            </p>
          </div>

          {/* ②-b 핵심 딜포인트 (blind_teaser에서 추출) */}
          {(() => {
            const dp = Array.isArray(imBody.dealPoints) ? imBody.dealPoints.filter(Boolean) : [];
            return dp.length > 0 ? (
              <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold text-amber-400 tracking-wide flex items-center gap-1.5">
                    <span>⭐ 핵심 딜 포인트 ({dp.length}선)</span>
                  </p>
                  <span className="text-[10px] text-slate-400">매수 검토 핵심 요약</span>
                </div>
                <ul className="space-y-2">
                  {dp.map((pt: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-200 leading-relaxed">
                      <span className="w-4 h-4 rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null;
          })()}

          {/* ③ 포스처 특화 위젯 (결과 우선 + 접이식 슬라이더) */}
          <PostureWidget
            posture={posture}
            attrs={attrs}
            teaserView={teaserView}
            buildingId={id}
          />

          {/* ④ 담당 중개사 프로필 (TrustLine - 전화 연결 기능 탑재) */}
          <TrustLine
            brokerName={brokerProfile?.display_name || "담당 중개사"}
            brokerPhone={brokerProfile?.phone}
            brokerSlug={brokerProfile?.slug}
            specialty={brokerProfile?.specialty}
            responseGuaranteeHours={brokerProfile?.response_guarantee_hours}
            closedDeals={brokerProfile?.closed_deals}
            isLicensed={brokerProfile?.is_licensed ?? true}
          />

          {/* ⑤ CTALadder — Basic/Pro 이분화 & Floating Sticky Bar */}
          <CTALadder
            buildingId={id}
            teaserConfigId={safeBuilding?.id || id}
            brokerPhone={brokerProfile?.phone}
            requireNda={requireNda}
          />

          {/* ⑥ 매도자 보호 및 비밀유지 안내 (접이식) */}
          <details className="group text-xs text-slate-400 border border-slate-800 rounded-xl p-3 bg-slate-900/50">
            <summary className="cursor-pointer font-semibold text-slate-300 flex items-center justify-between">
              <span>🛡️ 매도자 보호 및 정보 보안 정책</span>
              <span className="text-[10px] text-slate-500 group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="pt-2">
              <PublicPolicyBlock
                candidateCount={teaserView.reidentResult?.candidateCount || 0}
                kThreshold={teaserView.reidentResult?.kThreshold || 20}
                passed={teaserView.reidentResult?.passed ?? true}
              />
            </div>
          </details>

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



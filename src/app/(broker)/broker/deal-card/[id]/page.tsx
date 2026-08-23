import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { readWithMigration, buildAttrsFromSsotLite, buildProvenanceFromSsotLite } from '@/lib/ssot-adapter';
import { computeDataGrade } from '@/domain/asset/grade-engine';
import { BlindTeaserOutputSchema } from "@/ai/schemas/broker-deal-card";
import Link from "next/link";
import Image from "next/image";
import { MatchedBuyersSection } from "./matched-buyers-section";
import { DealPredictionSection } from "./deal-prediction-section";
import { GateRequestsInbox } from "./GateRequestsInbox";
import { DealCardPipelineContainer } from "./DealCardPipelineContainer";
import { IdealBuyerPersonaSection } from "./ideal-buyer-persona-section";
import { KakaoShareButton } from "./kakao-share-button";
import { CreateMobileImButton } from "./create-mobile-im-button";
import { AiMatchCtaButton } from "./ai-match-cta-button";
import { ImManagementPanel } from "./im-management-panel";
import { DealCardEditor } from "./DealCardEditor";
import { ScheduleSection } from "./ScheduleSection";
import { DealCardActionsMenu } from "./DealCardActionsMenu";
import { DealCardTabs } from "@/components/broker/deal-card/DealCardTabs";
import { LiveDealCardPreviewCard } from "@/components/broker/deal-card/LiveDealCardPreviewCard";
import { BlindDealCardPreview } from "@/components/broker/deal-card/BlindDealCardPreview";
import BrokerBottomNav from "@/components/layout/BrokerBottomNav";
import BuildingSignalEditor from "@/components/broker/deal-card/BuildingSignalEditor";
import { extractCleanKoreanAddress } from "@/domain/verification/address-resolver";


export async function generateMetadata({ params }: DealCardResultPageProps): Promise<Metadata> {
  const { id } = await params;
  const { data: _building } = await readWithMigration(id);
  const building = _building as any;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://credeal.net";
  const bMeta = (building?.attrs || {}) as Record<string, any>;
  const title = building
    ? `${building.area_signal ?? bMeta.areaSignal ?? ''} ${building.asset_type ?? bMeta.assetType ?? ''} ${building.price_band ?? bMeta.priceBand ?? ''} 딜카드`.trim()
    : "딜카드 결과";

  return {
    title: `${title} | DealCard`,
    description: "AI 기반 블라인드 딜카드 — 상업용 부동산 투자 기회",
    openGraph: {
      title,
      description: "AI가 분석한 상업용 부동산 딜카드",
      images: [{ url: `${siteUrl}/api/og/deal/${id}`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: "AI가 분석한 상업용 부동산 딜카드",
      images: [`${siteUrl}/api/og/deal/${id}`],
    },
  };
}

interface DealCardResultPageProps {
  params: Promise<{ id: string }>;
}

export default async function BrokerDealCardResultPage({
  params,
}: DealCardResultPageProps) {
  const { id } = await params;
  const supabase = createServiceClient();

  // Fetch building
  const { data: _building2 } = await readWithMigration(id);
  const building = _building2 as any;

  // assets 테이블에서 온 데이터는 raw_input, raw_address가 없으므로 building_ssot_lite에서 직접 조회
  if (building && !building.raw_input) {
    const { data: ssotRow } = await supabase
      .from("building_ssot_lite")
      .select("raw_input, raw_address, area_signal")
      .eq("id", id)
      .maybeSingle();
    if (ssotRow) {
      building.raw_input = ssotRow.raw_input;
      if (!building.raw_address && ssotRow.raw_address) building.raw_address = ssotRow.raw_address;
      if (!building.area_signal && ssotRow.area_signal) building.area_signal = ssotRow.area_signal;
    }
  }

  // Flatten attrs for assets table compatibility
  const bAttrs = (building?.attrs || {}) as Record<string, any>;
  const sig = (key: string, snakeKey: string) => building?.[snakeKey] ?? bAttrs[key] ?? bAttrs[snakeKey] ?? null;

  if (!building) return notFound();

  // Fetch broker slug for OG image
  const brokerSlug = await (async () => {
    if (!building.owner_id) return "js-realty";
    const { data: bp } = await supabase
      .from("broker_profiles")
      .select("slug")
      .eq("user_id", building.owner_id)
      .maybeSingle();
    return bp?.slug ?? "js-realty";
  })();

  // Fetch signal card (for curiosity score or other signals)
  const { data: signalCard } = await supabase
    .from("building_signal_cards")
    .select("deal_curiosity_score")
    .eq("building_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Signal card data is available via building_signal_cards table
  // but the teaser body already contains all display data

  // Fetch blind teaser document (optional — may not exist yet)
  const { data: teaserDoc } = await supabase
    .from("document_objects")
    .select("id, title, body, markdown, status, created_at")
    .eq("building_id", id)
    .eq("document_type", "blind_teaser")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fetch IM Lite document to check if basic IM exists
  const { data: imLiteDoc } = await supabase
    .from("document_objects")
    .select("id")
    .eq("building_id", id)
    .eq("document_type", "im_lite")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const hasBasicIM = !!imLiteDoc;

  // Fetch match results for count & top grade badge
  const { data: matchResults } = await supabase
    .from("match_results")
    .select("grade")
    .eq("building_ssot_lite_id", id);

  const matchCount = matchResults?.length ?? 0;
  const topGrade = matchResults
    ?.sort((a, b) => ['S', 'A', 'B', 'C'].indexOf(a.grade) - ['S', 'A', 'B', 'C'].indexOf(b.grade))[0]
    ?.grade;

  // Parse teaser body with robust fallback
  const body = (teaserDoc?.body ?? {}) as Record<string, unknown>;
  let teaser: Record<string, any>;
  try {
    teaser = BlindTeaserOutputSchema.parse(body) as Record<string, any>;
  } catch {
    teaser = body as Record<string, any>;
  }

  // snake_case / camelCase 양방향 지원
  const pick = (camel: string, snake: string, fallback: string = "") => {
    const v = teaser[camel] ?? teaser[snake] ?? body[camel] ?? body[snake];
    return typeof v === "string" ? v : fallback;
  };
  const pickArr = (camel: string, snake: string): string[] => {
    const v = teaser[camel] ?? teaser[snake] ?? body[camel] ?? body[snake];
    return Array.isArray(v) ? v.map(String) : [];
  };

  const title = pick("title", "title", `${building.area_signal || ""} ${building.asset_type || ""} 딜카드`.trim() || "블라인드 딜카드");
  const shortSummary = pick("shortSummary", "short_summary", building.fit_summary || "");
  const dealPoints = pickArr("dealPoints", "deal_points");
  const cautionPoints = pickArr("cautionPoints", "caution_points");
  const hiddenInfoNotice = pickArr("hiddenInfoNotice", "hidden_info_notice");
  const gateMessage = pick("gateMessage", "gate_message");
  const kakaoText = pick("kakaoText", "kakao_text", teaserDoc?.markdown || "");
  const boundaryNote = pick("boundaryNote", "boundary_note", "이 자료는 공개 데이터와 입력 정보를 바탕으로 한 예비 검토 자료입니다.");

  // 사진 데이터: 여러 출처에서 fallback
  const layers = (building.layers as Record<string, any>) || {};
  const layerPhotos: string[] = Array.isArray(layers.photos)
    ? layers.photos.filter((p: any) => p?.url).map((p: any) => p.url)
    : [];

  // IM 문서에서 사진 가져오기 (body.photos 또는 body.photo_urls)
  const imBody = (teaserDoc?.body ?? {}) as Record<string, any>;
  const imPhotos: string[] = Array.isArray(imBody.photos)
    ? imBody.photos.filter((p: any) => p?.url).map((p: any) => p.url)
    : Array.isArray(imBody.photo_urls) && imBody.photo_urls.length > 0
    ? imBody.photo_urls
    : [];

  // 우선순위: layers.photos → IM body.photos
  const photoUrls: string[] = layerPhotos.length > 0 ? layerPhotos : imPhotos;

  // v3 assets 테이블에서는 주소가 attrs JSONB에 저장됨
  // building_ssot_lite에서는 raw_address, layers.location 에 저장됨
  // 양쪽 모두에서 안전하게 추출

  // 실제 주소인지 판별 (권역 시그널 등 배제)
  const looksLikeRealAddress = (addr: string | null | undefined): string | null => {
    if (!addr) return null;
    if (addr.includes("권역") || addr.endsWith("권")) return null;
    return extractCleanKoreanAddress(addr);
  };

  const attrsAddress = bAttrs.address || bAttrs.rawAddress || bAttrs.raw_address;
  const attrsAreaSignal = bAttrs.areaSignal || bAttrs.area_signal;
  // raw_input은 building_ssot_lite에만 있고 assets에는 없으므로 양쪽 확인
  const rawInput = building.raw_input || bAttrs.rawInput || bAttrs.raw_input || "";

  const rawAddressCandidate = looksLikeRealAddress(building.raw_address)
    || looksLikeRealAddress(attrsAddress)
    || looksLikeRealAddress(layers?.location?.raw_address)
    || looksLikeRealAddress(layers?.location?.exact_address)
    || looksLikeRealAddress(layers?.location?.address);

  const cleanMemoAddress = extractCleanKoreanAddress(rawInput);

  const extractedAddress = rawAddressCandidate
    || cleanMemoAddress
    || looksLikeRealAddress(attrsAddress)
    || building.area_signal
    || attrsAreaSignal
    || "";

  // PNU 추출: assets.pnu → attrs.pnu → layers.pnu → layers.location.pnu
  const extractedPnu = building.pnu || bAttrs.pnu || layers?.pnu || layers?.location?.pnu || "";

  const hiddenFields = Array.isArray(building.hidden_fields)
    ? (building.hidden_fields as string[])
    : [];

  const hiddenFieldLabels: Record<string, string> = {
    exact_address: "정확한 주소",
    tenant_name: "임차인명",
    unit_rent: "호실별 임대료",
    seller_motivation: "매도자 사정",
    negotiation_memo: "협상 관련 메모",
    owner_identity: "건물주 정보",
    buyer_identity: "매수자 정보",
    registry_detail: "등기 상세",
    lease_contract_raw_text: "임대차 원문",
  };

  // v3: 바텀시트 선제적 데이터 주입을 위한 값 추출
  // 우선순위: building.lease_summary > layers.lease_summary > layers.finance > bAttrs
  const finance = layers.finance || {};
  const layersLeaseSum = layers.lease_summary || {};
  const askingPriceKrw = Number(finance.asking_price_krw || building.asking_price || bAttrs.askingPriceKrw || 0);
  const loanAmountKrw = Number(finance.loan_amount_krw || building.loan_amount || bAttrs.loanAmountKrw || 0);
  
  const leaseSum = building.lease_summary || {};
  const totalDepositKrw = Number(leaseSum.total_deposit_krw || layersLeaseSum.total_deposit_krw || finance.total_deposit_krw || bAttrs.totalDepositKrw || 0);
  const monthlyRentKrw = Number(leaseSum.monthly_rent_krw || layersLeaseSum.monthly_rent_krw || finance.monthly_rent_krw || bAttrs.monthlyRentKrw || 0);
  const mgmtFeeKrw = Number(leaseSum.mgmt_fee_krw || finance.mgmt_fee_krw || 0);
  const vacancyPct = Number(leaseSum.vacancy_pct || finance.vacancy_pct || bAttrs.vacancyPct || 0);
  const investmentPosture = building.investment_posture || layers.investment_posture || "income";

  const gradeAttrs = buildAttrsFromSsotLite({
    ...building,
    lease_summary: {},
    layers: building.layers,
  });
  const gradeProvenance = buildProvenanceFromSsotLite({
    ...building,
    lease_summary: {},
  });
  const gradeResult = computeDataGrade(gradeAttrs, gradeProvenance);
  const currentGrade = gradeResult.grade as 'A' | 'B' | 'C' | 'D';
  const currentScore = gradeResult.scorePct;

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-6 pb-40">
      <div className="w-full max-w-md mx-auto space-y-4">
        {/* Top nav bar: Back + Actions */}
        <div className="flex items-center justify-between pt-2">
          <Link
            href="/broker/buildings"
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            내 딜카드
          </Link>
          <DealCardActionsMenu buildingId={id} />
        </div>

        {/* Top Message Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-0.5">
            <span className="inline-block w-2 h-2 rounded-full bg-primary" />
            <span className="text-xs font-semibold text-primary">블라인드 딜카드</span>
          </div>
          <h1 className="text-xl font-black leading-tight text-foreground">
            {title || "딜카드가 준비됐습니다."}
          </h1>
          <p className="text-xs text-muted-foreground">
            주소와 민감정보는 매수자 보호를 위해 숨겨져 있습니다.
          </p>
        </div>

        {/* 📱 [1. 핵심 딜카드 & OG 공유 실시간 미리보기 카드] */}
        <LiveDealCardPreviewCard
          buildingId={id}
          title={title}
          summary={shortSummary}
          hookCopy={teaser?.hookCopy || teaser?.ogDescription}
          ogTitle={teaser?.ogTitle}
          ogDescription={teaser?.ogDescription}
          dealPoints={dealPoints.length > 0 ? dealPoints : ["안정적인 임대 수익 및 자산 가치", "우수한 대중교통 및 도로 접근성", "주변 시세 대비 경쟁력 있는 매각가"]}
          areaSignal={building.area_signal || bAttrs.areaSignal || undefined}
          assetType={building.asset_type || bAttrs.assetType || undefined}
          priceBand={building.price_band || bAttrs.priceBand || undefined}
          kakaoText={kakaoText}
        />

        {/* ✏️ [2. 딜카드 문구 & OG 메타 실시간 편집기] */}
        <DealCardEditor
          buildingId={id}
          initialTitle={title}
          initialSummary={shortSummary}
          initialDealPoints={dealPoints}
          initialCautionPoints={cautionPoints}
          initialKakaoText={kakaoText}
          initialOgTitle={teaser?.ogTitle || title || ""}
          initialOgDescription={teaser?.ogDescription || teaser?.shortSummary || building.fit_summary || ""}
          initialHookCopy={teaser?.hookCopy || building.fit_summary || ""}
          initialStructureChips={teaser?.structureChips || []}
          initialVacancyLabel={teaser?.vacancyLabel || ""}
          initialCuriosityHook={teaser?.curiosityHook || ""}
        />

        {/* 🏢 [3. 세부 4-Tab 영역] */}
        <div className="pt-2">
          <DealCardTabs
            buyersBadge={matchCount > 0 ? { count: matchCount, topGrade } : undefined}
            overviewContent={
              <div className="space-y-4 pt-2">
                {/* Pipeline State Machine Progress */}
                <DealCardPipelineContainer buildingId={id} />

                {/* Photo Gallery */}
                {photoUrls.length > 0 && (
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-4 py-2 bg-muted/30 border-b border-border">
                      <h2 className="text-xs font-semibold text-muted-foreground">📷 매물 사진 ({photoUrls.length}장)</h2>
                    </div>
                    <div className="flex gap-2 overflow-x-auto p-3 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
                      {photoUrls.map((url: string, i: number) => (
                        <div key={i} className="relative shrink-0 w-40 h-28 rounded-lg overflow-hidden border border-border bg-muted">
                          <Image
                            src={url}
                            alt={`매물 사진 ${i + 1}`}
                            fill
                            className="object-cover"
                            sizes="160px"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Extracted Info Card — Inline Editable */}
                <BuildingSignalEditor
                  buildingId={building.id}
                  areaSignal={sig('areaSignal', 'area_signal')}
                  assetType={sig('assetType', 'asset_type')}
                  priceBand={sig('priceBand', 'price_band')}
                  currentUseSignal={sig('currentUseSignal', 'current_use_signal')}
                  confidence={(building.confidence ?? bAttrs.confidence ?? {}) as Record<string, string>}
                  fitSummary={sig('fitSummary', 'fit_summary')}
                  cautionSummary={sig('cautionSummary', 'caution_summary')}
                />

                {/* Risk / Caution Points */}
                {cautionPoints.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4 space-y-2.5 shadow-sm">
                    <h2 className="text-sm font-semibold flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                      <span>⚠️</span> 실사 검토 필요 사항 ({cautionPoints.length}건)
                    </h2>
                    <ul className="space-y-1.5">
                      {cautionPoints.map((point, idx) => (
                        <li key={idx} className="text-xs text-muted-foreground flex gap-1.5">
                          <span className="text-amber-500 font-bold">•</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Hidden Fields Card */}
                {hiddenFields.length > 0 && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 space-y-2">
                    <h2 className="text-xs font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                      <span>🔒</span> 비공개 안전 처리 항목 ({hiddenFields.length}개)
                    </h2>
                    <div className="flex flex-wrap gap-1.5">
                      {hiddenFields.map((field) => (
                        <span key={field} className="text-[10px] bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded">
                          {hiddenFieldLabels[field] || field}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            }
          imContent={
            <div className="space-y-6 pt-2">
              <ImManagementPanel
                buildingId={id}
                currentGrade={currentGrade}
                currentScore={currentScore}
              />
              <div className="rounded-xl bg-muted/60 dark:bg-muted/40 border border-border px-4 py-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {boundaryNote}
                </p>
              </div>
            </div>
          }
          buyersContent={
            <div className="space-y-6 pt-2">
              {/* ① Ideal Buyer Personas (Persona Feature promoted to top) */}
              <IdealBuyerPersonaSection
                buildingId={id}
                areaSignal={building.area_signal || ""}
                assetType={building.asset_type || ""}
                priceBand={building.price_band || ""}
                sizeSignal={building.size_signal || ""}
                vacancyStatus={building.vacancy_signal || ""}
                currentUseSignal={building.current_use_signal || ""}
                rawInput={building.raw_input || ""}
                fitSummary={building.fit_summary || ""}
                cautionSummary={building.caution_summary || ""}
                curiosityScore={signalCard?.deal_curiosity_score ?? 50}
              />

              {/* ② Matched Buyers Scorecard */}
              <MatchedBuyersSection buildingId={id} />

              {/* ③ Gate Requests Inbox */}
              <GateRequestsInbox buildingId={id} />
            </div>
          }
          analyticsContent={
            <div className="space-y-6 pt-2">
              <DealPredictionSection buildingId={id} />
              <ScheduleSection buildingId={id} />
              <div className="rounded-xl border border-border bg-card p-4 text-center space-y-2">
                <p className="text-xs text-muted-foreground">건물주 보고서 생성</p>
                <Link
                  href={`/broker/buildings/${id}/owner-report`}
                  className="inline-flex items-center justify-center rounded-xl bg-secondary px-4 py-2 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                >
                  📊 건물주 보고서 이동
                </Link>
              </div>
            </div>
          }
        />
        </div>
      </div>

      {/* Streamlined 3-Column Sticky CTA Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-sm border-t border-border px-4 pt-2.5 pb-[calc(65px+env(safe-area-inset-bottom,0px))]">
        <div className="max-w-md mx-auto">
          <div className="grid grid-cols-3 gap-2">
            <KakaoShareButton
              text={kakaoText}
              buildingId={id}
              dealTitle={title}
              brokerSlug={brokerSlug}
              variant="compact"
            />
            <CreateMobileImButton
              buildingId={id}
              hasBasicIM={hasBasicIM}
              areaSignal={building.area_signal ?? bAttrs.areaSignal ?? undefined}
              assetType={building.asset_type ?? bAttrs.assetType ?? undefined}
              priceBand={building.price_band ?? bAttrs.priceBand ?? undefined}
              sizeSignal={building.size_signal ?? undefined}
              vacancySignal={building.vacancy_signal ?? bAttrs.vacancySignal ?? undefined}
              fitSummary={building.fit_summary ?? undefined}
              cautionSummary={building.caution_summary ?? undefined}
              existingPhotoUrls={photoUrls}
              initialAddress={extractedAddress}
              initialPnu={extractedPnu}
              currentGrade={currentGrade}
              prefillAskingPrice={askingPriceKrw > 0 ? askingPriceKrw / 10000 : undefined}
              prefillLoanAmount={loanAmountKrw > 0 ? loanAmountKrw / 10000 : undefined}
              prefillTotalDeposit={totalDepositKrw > 0 ? totalDepositKrw / 10000 : undefined}
              prefillMonthlyRent={monthlyRentKrw > 0 ? monthlyRentKrw / 10000 : undefined}
              prefillMgmtFee={mgmtFeeKrw > 0 ? mgmtFeeKrw / 10000 : undefined}
              prefillVacancyPct={vacancyPct > 0 ? vacancyPct : undefined}
              initialInvestmentPosture={investmentPosture}
            />
            <AiMatchCtaButton buildingId={id} matchCount={matchCount} topGrade={topGrade} />
          </div>
        </div>
        <BrokerBottomNav />
      </div>
    </main>
  );
}


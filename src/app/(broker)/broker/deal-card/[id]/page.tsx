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
import BrokerBottomNav from "@/components/layout/BrokerBottomNav";


export async function generateMetadata({ params }: DealCardResultPageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data: _building } = await readWithMigration(id);
  const building = _building as any;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://credeal.net";
  const title = building
    ? `${building.area_signal} ${building.asset_type} ${building.price_band ?? ""} 딜카드`
    : "딜카드 결과";

  return {
    title: `${title} | DealCard`,
    description: "AI 기반 블라인드 딜카드 — 상업용 부동산 투자 기회",
    openGraph: {
      title,
      description: "AI가 분석한 상업용 부동산 딜카드",
      images: [{ url: `${siteUrl}/api/og/deal/${id}`, width: 1200, height: 630 }],
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

  const extractedAddress = layers?.location?.address
    || building.area_signal
    || (building.raw_input?.match(/([가-힣]{2,4}[시도]\s*[가-힣]{2,4}[시군구]\s*[가-힣]{2,6}[읍면동](?:\s*\d+[가-힣]?)?)/) || [])[1]
    || "";

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

        {/* Top Message */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1">
            <span className="inline-block w-2 h-2 rounded-full bg-primary" />
            <span className="text-sm font-semibold text-primary">블라인드 딜카드</span>
          </div>
          <h1 className="text-2xl font-black leading-tight">
            {title || "딜카드가 준비됐습니다."}
          </h1>
          <p className="text-sm text-muted-foreground">
            주소와 민감정보는 매수자 보호를 위해 숨겨져 있습니다.
          </p>
        </div>

        {/* Pipeline State Machine Progress */}
        <DealCardPipelineContainer buildingId={id} />

        {/* 4-Tab Content Router */}
        <DealCardTabs
          overviewContent={
            <div className="space-y-6 pt-2">
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

              {/* Extracted Info Card */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <h2 className="text-base font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-2"><span>🏢</span> 건물 신호 요약</span>
                  <span className="text-[11px] font-normal text-muted-foreground">확언형 표기 · 뱃지 검토 안내</span>
                </h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: "권역", value: building.area_signal, confKey: "areaSignal" },
                    { label: "자산 유형", value: building.asset_type, confKey: "assetType" },
                    { label: "가격대", value: building.price_band, confKey: "priceBand" },
                    { label: "현재 사용", value: building.current_use_signal, confKey: "currentUseSignal" },
                  ].map((item) => {
                    const conf = ((building.confidence as Record<string, string>) || {})[item.confKey];
                    return (
                      <div key={item.label} className={`rounded-lg p-2.5 ${item.value ? 'bg-muted/30' : 'bg-muted/10 border border-dashed border-muted-foreground/20'}`}>
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="text-xs text-muted-foreground">{item.label}</p>
                          {conf === 'ai_hypothesis' && (
                            <span
                              className="text-[10px] px-1 py-0.2 rounded bg-amber-500/15 text-amber-500 font-medium cursor-help"
                              title="AI가 파싱한 분류입니다. 클릭하여 직접 수정할 수 있습니다."
                            >
                              AI분류
                            </span>
                          )}
                          {conf === 'needs_verification' && (
                            <span
                              className="text-[10px] px-1 py-0.2 rounded bg-red-500/15 text-red-500 font-medium cursor-help"
                              title="정보가 불충분합니다. 추가 공부확인 또는 실사가 필요합니다."
                            >
                              확인필요
                            </span>
                          )}
                        </div>
                        <p className={`font-semibold ${item.value ? '' : 'text-muted-foreground/50 text-xs'}`}>
                          {item.value || "미입력 ✏️"}
                        </p>
                      </div>
                    );
                  })}
                </div>
                {building.fit_summary && (
                  <div className="text-sm text-muted-foreground pt-1 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground">🎯 적합 매수자</span>
                    </div>
                    <p className="leading-relaxed">{building.fit_summary}</p>
                  </div>
                )}
                {building.caution_summary && (
                  <div className="text-sm text-muted-foreground pt-1 space-y-0.5">
                    <p className="font-medium text-amber-500 dark:text-amber-400">⚠️ 실사 확인 필요 사항</p>
                    <p className="leading-relaxed">{building.caution_summary}</p>
                  </div>
                )}
              </div>

              {/* Risk / Caution Points */}
              {cautionPoints.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm">
                  <h2 className="text-base font-semibold flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <span>⚠️</span> 검토 필요 사항
                  </h2>
                  <ul className="space-y-2">
                    {cautionPoints.map((point, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground flex gap-2">
                        <span className="text-amber-500 font-bold">•</span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Raw Broker Notes Summary */}
              {building.fit_summary && (
                <div className="rounded-xl border border-border bg-muted/40 p-5 space-y-2">
                  <h2 className="text-xs font-semibold text-muted-foreground">
                    📝 브로커 노트 요약
                  </h2>
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    {building.fit_summary}
                  </p>
                  {building.caution_summary && (
                    <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                      ⚠️ {building.caution_summary}
                    </p>
                  )}
                </div>
              )}

              {/* Hidden Fields Card */}
              {hiddenFields.length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
                  <h2 className="text-xs font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                    <span>🔒</span> 비공개 처리 항목 ({hiddenFields.length}개)
                  </h2>
                  <div className="flex flex-wrap gap-1.5">
                    {hiddenFields.map((field) => (
                      <span key={field} className="text-[11px] bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded">
                        {hiddenFieldLabels[field] || field}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Unified Deal Card Editor */}
              <DealCardEditor
                buildingId={id}
                initialTitle={title}
                initialSummary={shortSummary}
                initialDealPoints={dealPoints}
                initialCautionPoints={cautionPoints}
                initialKakaoText={kakaoText}
                initialOgTitle={teaser?.ogTitle || ""}
                initialOgDescription={teaser?.ogDescription || ""}
                initialHookCopy={teaser?.hookCopy || ""}
                initialStructureChips={teaser?.structureChips || []}
                initialVacancyLabel={teaser?.vacancyLabel || ""}
                initialCuriosityHook={teaser?.curiosityHook || ""}
              />
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
              <div className="flex items-center justify-center gap-2">
                <span className="inline-flex items-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2.5 py-0.5 text-xs font-medium">
                  AI 초안
                </span>
                <span className="text-xs text-muted-foreground">
                  {teaserDoc ? new Date(teaserDoc.created_at).toLocaleDateString("ko-KR") : ""}
                </span>
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
              areaSignal={building.area_signal ?? undefined}
              assetType={building.asset_type ?? undefined}
              priceBand={building.price_band ?? undefined}
              sizeSignal={building.size_signal ?? undefined}
              vacancySignal={building.vacancy_signal ?? undefined}
              fitSummary={building.fit_summary ?? undefined}
              cautionSummary={building.caution_summary ?? undefined}
              existingPhotoUrls={photoUrls}
              initialAddress={extractedAddress}
              currentGrade={currentGrade}
            />
            <AiMatchCtaButton buildingId={id} />
          </div>
        </div>
        <BrokerBottomNav />
      </div>
    </main>
  );
}


import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { BlindTeaserOutputSchema } from "@/ai/schemas/broker-deal-card";
import Link from "next/link";
import { MatchedBuyersSection } from "./matched-buyers-section";
import { DealPredictionSection } from "./deal-prediction-section";
import { KakaoPreviewSection } from "./KakaoPreviewSection";
import { GateRequestsInbox } from "./GateRequestsInbox";
import { DealCardPipelineContainer } from "./DealCardPipelineContainer";
import { IdealBuyerPersonaSection } from "./ideal-buyer-persona-section";
import { KakaoShareButton } from "./kakao-share-button";
import { CreateMobileImButton } from "./create-mobile-im-button";
import { BlindTeaserPreviewSection } from "./BlindTeaserPreviewSection";
import { ScheduleSection } from "./ScheduleSection";
import { DealCardActionsMenu } from "./DealCardActionsMenu";
import BrokerBottomNav from "@/components/layout/BrokerBottomNav";


export async function generateMetadata({ params }: DealCardResultPageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data: building } = await supabase
    .from("building_ssot_lite")
    .select("area_signal, asset_type, price_band")
    .eq("id", id)
    .single();

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
  const { data: building } = await supabase
    .from("building_ssot_lite")
    .select(
      "id, area_signal, asset_type, price_band, size_signal, current_use_signal, vacancy_signal, fit_summary, caution_summary, hidden_fields, status, owner_id, raw_input",
    )
    .eq("id", id)
    .single();

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

  // Fetch blind teaser document
  const { data: teaserDoc } = await supabase
    .from("document_objects")
    .select("id, title, body, markdown, status, created_at")
    .eq("building_id", id)
    .eq("document_type", "blind_teaser")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!teaserDoc) return notFound();

  // Parse teaser body
  let teaser;
  try {
    teaser = BlindTeaserOutputSchema.parse(teaserDoc.body);
  } catch {
    teaser = teaserDoc.body as Record<string, unknown>;
  }

  const title =
    typeof teaser.title === "string" ? teaser.title : "블라인드 딜카드";
  const shortSummary =
    typeof teaser.shortSummary === "string" ? teaser.shortSummary : "";
  const dealPoints = Array.isArray(teaser.dealPoints) ? teaser.dealPoints : [];
  const cautionPoints = Array.isArray(teaser.cautionPoints)
    ? teaser.cautionPoints
    : [];
  const hiddenInfoNotice = Array.isArray(teaser.hiddenInfoNotice)
    ? teaser.hiddenInfoNotice
    : [];
  const gateMessage =
    typeof teaser.gateMessage === "string" ? teaser.gateMessage : "";
  const kakaoText =
    typeof teaser.kakaoText === "string"
      ? teaser.kakaoText
      : teaserDoc.markdown || "";
  const boundaryNote =
    typeof teaser.boundaryNote === "string"
      ? teaser.boundaryNote
      : "이 자료는 공개 데이터와 입력 정보를 바탕으로 한 예비 검토 자료입니다.";

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

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-40">
      <div className="w-full max-w-md mx-auto space-y-6">
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
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            블라인드 딜카드
          </p>
          <h1 className="text-xl font-bold">
            딜카드가 준비됐습니다.
          </h1>
          <p className="text-sm text-muted-foreground">
            주소와 민감정보는 숨겼어요.
          </p>
        </div>

        {/* Pipeline State Machine Progress */}
        <DealCardPipelineContainer buildingId={id} />

        {/* Extracted Info Card */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <span>🏢</span> 건물 신호 요약
          </h2>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">권역</p>
              <p className="font-medium">
                {building.area_signal || "확인 필요"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">자산 유형</p>
              <p className="font-medium">
                {building.asset_type || "확인 필요"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">가격대</p>
              <p className="font-medium">
                {building.price_band || "확인 필요"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">현재 사용</p>
              <p className="font-medium">
                {building.current_use_signal || "확인 필요"}
              </p>
            </div>
          </div>
          {building.fit_summary && (
            <p className="text-sm text-muted-foreground pt-1">
              <span className="font-medium text-foreground">적합 매수자:</span>{" "}
              {building.fit_summary}
            </p>
          )}
          {building.caution_summary && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">확인 필요:</span>{" "}
              {building.caution_summary}
            </p>
          )}
        </div>

        {/* Hidden Fields Card */}
        {hiddenFields.length > 0 && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-5 space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2 text-warning">
              <span>🔒</span> 숨긴 정보
            </h2>
            <div className="space-y-1">
              {hiddenFields.map((field) => (
                <p key={field} className="text-sm text-warning/90 flex gap-2">
                  <span>•</span>
                  <span>{hiddenFieldLabels[field] || field}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Blind Teaser Preview */}
        <BlindTeaserPreviewSection
          buildingId={id}
          initialTitle={title}
          initialSummary={shortSummary}
          initialDealPoints={dealPoints.map(String)}
          initialCautionPoints={cautionPoints.map(String)}
        />

        {/* Kakao Message Preview (Editable) */}
        <KakaoPreviewSection
          initialText={kakaoText}
          buildingId={id}
          dealTitle={title}
          brokerSlug={brokerSlug}
        />

        {/* Boundary Note */}
        <div className="rounded-xl bg-muted/60 dark:bg-muted/40 border border-border px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {boundaryNote}
          </p>
        </div>

        {/* Document Status */}
        <div className="flex items-center justify-center gap-2">
          <span className="inline-flex items-center rounded-md bg-warning/10 text-warning border border-warning/20 px-2.5 py-0.5 text-xs font-medium">
            AI 초안
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(teaserDoc.created_at).toLocaleDateString("ko-KR")}
          </span>
        </div>

        {/* P0-3: Matched Buyers */}
        <MatchedBuyersSection buildingId={id} />

        {/* Schedule Section */}
        <ScheduleSection buildingId={id} />

        {/* P1-1: Deal Prediction */}
        <DealPredictionSection buildingId={id} />

        {/* AI Ideal Buyer Persona Section */}
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

        {/* Gate Requests Inbox (Replaces Request Form in Broker View) */}
        <GateRequestsInbox buildingId={id} />
      </div>

      {/* Sticky CTA Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border px-4 pt-3 safe-bottom">
        <div className="max-w-md mx-auto space-y-2">
          {/* 1순위: 카톡으로 전송 (문구 + 딜카드 링크) */}
          <KakaoShareButton text={kakaoText} buildingId={id} dealTitle={title} brokerSlug={brokerSlug} areaSignal={building.area_signal ?? undefined} variant="primary" />
          {/* 2순위: 모바일 투자설명서 (딜카드 데이터 직접 전달 — 무마찰) */}
          <CreateMobileImButton
            buildingId={id}
            areaSignal={building.area_signal ?? undefined}
            assetType={building.asset_type ?? undefined}
            priceBand={building.price_band ?? undefined}
            sizeSignal={building.size_signal ?? undefined}
            vacancySignal={building.vacancy_signal ?? undefined}
            fitSummary={building.fit_summary ?? undefined}
            cautionSummary={building.caution_summary ?? undefined}
          />
          {/* 3순위: 매수자 보기 / 건물주 리포트 */}
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/broker/buyer-intents"
              className="inline-flex items-center justify-center rounded-xl bg-secondary px-3 py-2.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
              id="cta-connect-buyer"
            >
              🎯 매수자 전체 보기
            </Link>
            <Link
              href={`/broker/buildings/${id}/owner-report`}
              className="inline-flex items-center justify-center rounded-xl bg-secondary px-3 py-2.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
              id="cta-owner-report"
            >
              📊 건물주 리포트
            </Link>
          </div>
        </div>
        <BrokerBottomNav />
      </div>
    </main>
  );
}


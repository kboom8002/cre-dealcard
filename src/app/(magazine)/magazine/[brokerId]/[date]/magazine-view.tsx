/**
 * MagazineView — 매거진 뷰어 **Server Component 셸** (E-03 U-06)
 *
 * - 훅/'use client' 없음: 본문(표지·브리핑·현장노트·테마·매물·시장데이터 …)은 서버에서 HTML 로 렌더되고
 *   클라이언트 번들에는 상호작용 섬만 들어간다.
 *     · ViewerTrackProvider  — 분석(섹션 노출/체류) + `[data-track]` 클릭 위임
 *     · SubscribeCard (variant="minimal") — 하단 최소형 뉴스레터 신청 옵트인
 *     · DealInquirySheet                  — 매물 문의 바텀시트
 * - 섬에는 직렬화 가능한 최소 props 만 내려준다(함수·Set 금지). 클릭 추적은 `data-track*` 속성으로 위임한다.
 * - 에디터 미리보기(클라이언트 페이지)에서 import 해도 동작하도록 훅을 쓰지 않는다.
 * - M2-20(테마 LLM 중복 호출)은 뷰어가 읽기 전용 GET 이라 LLM 호출 자체가 없어 해당 없음(N/A).
 */
import React from "react";
import { Building2, Newspaper } from "lucide-react";
import { SubscribeCard } from "@/components/magazine/SubscribeCard";
import { MonthlyGlassStatCard } from "@/components/magazine/MonthlyGlassStatCard";
import { ActionCardView } from "@/components/im/action-card-view";
import { PoweredByBadge } from "@/components/ui/PoweredByBadge";
import { EmptyState } from "@/components/ui/empty-state";
import { InitialAvatar } from "@/components/magazine/InitialAvatar";
import { TrackingNotice } from "@/components/magazine/TrackingNotice";
import { DealInquirySheet } from "@/components/magazine/DealInquirySheet";
import { ViewerTrackProvider } from "@/components/magazine/viewer-track";
import { Section, RichBriefing } from "@/components/magazine/viewer-primitives";
import {
  FieldNoteSection,
  NewsSection,
  BrokerProfileSection,
  BrokerStatutoryFooter,
} from "@/components/magazine/viewer-sections";
import type { AxiosUnitIssue, MonthlyRegionalChart } from "@/domain/magazine/types";
import { formatKoreanDate } from "@/lib/magazine/kst";
import { sanitizeStatutoryField } from "@/lib/legal/broker-statutory-disclosure";
import {
  buildMagazineTitle,
  cleanScoreText,
  formatPriceKo,
  hasAnyViewerContent,
  hasScoreEvidence,
  isSectionEnabled,
  parseViewerTarget,
  pickTopNews,
  sanitizeDealAddress,
} from "@/lib/magazine/view-helpers";

// ── Types ────────────────────────────────────────────────────────────
interface MagazineViewProps {
  data: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** 정규(canonical) slug — 분석·설문·공유·구독에 사용 */
  brokerId: string;
  /** 서버가 해석한 broker slug (없으면 null → slug 의존 버튼 숨김). T3-07 */
  brokerSlug?: string | null;
  date: string;
  /** 서버에서 formatKoreanDate 로 계산한 표시용 날짜 (hydration 일치) */
  dateLabel?: string;
  brokerVibe?: Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** 에디터 미리보기: 분석 비콘/설문/구독 제출 비활성 */
  preview?: boolean;
  /**
   * 독자 타깃(all|buyer|seller). 서버가 `searchParams.target` 을 읽어 내려준다 (hydration 불일치 제거).
   * 에디터 미리보기처럼 전달하지 않으면 'all'.
   */
  target?: string;
  /** 발송 링크(?sid=) 검증으로 확인된 기존 활성 구독자 여부 — true 시 하단 신청 폼 숨김 */
  isSubscribedViewer?: boolean;
}

export type MagazineData = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const DEAL_FALLBACK_BG = "linear-gradient(135deg, #1e1b4b, #312e81)";
const UUID_PREFIX_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
const PYEONG_RATIO = 0.3025;

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

// ── Main Component ───────────────────────────────────────────────────
export function MagazineView({
  data, brokerId, brokerSlug = null, date, dateLabel: dateLabelProp, brokerVibe, preview = false, target: targetProp, isSubscribedViewer = false,
}: MagazineViewProps) {
  const broker = (data.broker as Record<string, any>) ?? {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  const brokerName: string = typeof broker.name === "string" && broker.name.trim() ? broker.name : "중개사";
  const brokerCompany =
    sanitizeStatutoryField(broker.company, "officeName") ||
    sanitizeStatutoryField(broker.officeName, "officeName") ||
    sanitizeStatutoryField(brokerVibe?.company, "officeName") ||
    sanitizeStatutoryField(brokerVibe?.office_name, "officeName");
  const brokerOfficeAddress =
    sanitizeStatutoryField(broker.officeAddress, "address") ||
    sanitizeStatutoryField(broker.office_address, "address") ||
    sanitizeStatutoryField(brokerVibe?.office_address, "address") ||
    sanitizeStatutoryField(brokerVibe?.officeAddress, "address");
  const brokerOfficeRegNumber =
    sanitizeStatutoryField(broker.officeRegNumber, "regNo") ||
    sanitizeStatutoryField(broker.office_reg_number, "regNo") ||
    sanitizeStatutoryField(broker.registrationNo, "regNo") ||
    sanitizeStatutoryField(brokerVibe?.office_reg_number, "regNo") ||
    sanitizeStatutoryField(brokerVibe?.officeRegNumber, "regNo");
  const brokerRepresentativeName =
    sanitizeStatutoryField(broker.representativeName, "name") ||
    sanitizeStatutoryField(broker.representative_name, "name") ||
    sanitizeStatutoryField(brokerVibe?.representative_name, "name") ||
    sanitizeStatutoryField(brokerVibe?.representativeName, "name");
  const brokerPhone =
    sanitizeStatutoryField(broker.phone, "phone") ||
    sanitizeStatutoryField(brokerVibe?.phone, "phone");
  const dateLabel = dateLabelProp ?? formatKoreanDate(date);
  const target = targetProp !== undefined ? parseViewerTarget(targetProp) : parseViewerTarget(data.target_segment);
  const scoreEvidence = hasScoreEvidence(data);
  const title = buildMagazineTitle(cleanScoreText(data.headline as string | null | undefined, scoreEvidence), broker.name);

  const briefingText = cleanScoreText((data.briefing as string | undefined) ?? "", scoreEvidence);
  const accent = (data.themeColor as string | undefined) || (data.theme_color as string | undefined) || "#6366f1";
  const coverImageUrl = data.cover_image_url as string | null | undefined;

  // ── Field note (ai_briefing이 없을 때만 폴백으로 표시) ──
  const rawFieldNote = (data.field_note as Record<string, string> | null | undefined) ?? {};
  const fieldNote: Record<string, string> = Object.fromEntries(
    Object.entries(rawFieldNote).map(([k, v]) => [k, typeof v === "string" ? (cleanScoreText(v, scoreEvidence) as string) : v]),
  );
  const normBriefing = briefingText.replace(/\s+/g, " ").trim();
  const hasFieldNote =
    !normBriefing &&
    !!(fieldNote.question || fieldNote.buyerReaction || fieldNote.sellerReaction || fieldNote.marketJudgment || fieldNote.comment);

  // ── Deals ──
  const featuredDeals: any[] = Array.isArray(data.featured_deals) ? data.featured_deals : Array.isArray(data.dealHighlights) ? data.dealHighlights : []; // eslint-disable-line @typescript-eslint/no-explicit-any

  // ── Cadence Kind & AXIOS Unit Issues ──
  const editionKind =
    typeof data.kind === "string"
      ? data.kind
      : typeof data.edition_type === "string"
      ? data.edition_type
      : "weekly";
  const unitIssues: AxiosUnitIssue[] = Array.isArray(data.unit_issues)
    ? data.unit_issues
    : Array.isArray(data.unitIssues)
    ? data.unitIssues
    : [];

  // ── Monthly Top-2 Charts (월간 전용 + 유효한 시계열이 있을 때만 노출) ──
  const rawMonthlyCharts = Array.isArray(data.monthlyCharts)
    ? data.monthlyCharts
    : Array.isArray(data.monthly_charts)
    ? data.monthly_charts
    : [];
  const validMonthlyCharts: MonthlyRegionalChart[] =
    editionKind === "monthly"
      ? (rawMonthlyCharts as MonthlyRegionalChart[])
          .filter(
            (c) =>
              c &&
              typeof c === "object" &&
              typeof c.title === "string" &&
              c.isPlaceholder !== true &&
              Array.isArray(c.series) &&
              c.series.length > 0,
          )
          .slice(0, 2)
      : [];

  // ── News ──
  const topNews = pickTopNews(data);
  const hasNewsOrUnitIssues = topNews.length > 0 || unitIssues.length > 0;

  // ═══════════════════════════════════════════════════════════════════
  //  섹션 렌더러 (제목 + 시장브리핑 + 이슈 + 매물 + 연락처 + 뉴스레터 신청)
  // ═══════════════════════════════════════════════════════════════════

  const renderAiBriefing = () => (
    <Section>
      <div
        data-testid="viewer-market-briefing"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <RichBriefing text={briefingText} />
      </div>
    </Section>
  );

  const renderFieldNote = () => (
    <Section>
      <FieldNoteSection fieldNote={fieldNote} brokerName={brokerName} company={broker.company ?? null} />
    </Section>
  );

  const renderFeaturedDeals = () => (
    <Section>
      <div className="space-y-3">
        {featuredDeals.length > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span
              data-deals-counter=""
              data-deals-total={featuredDeals.length}
              className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-sm font-bold text-rose-800"
            >
              1 / {featuredDeals.length}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-carousel-dir="prev"
                aria-label="이전 매물 보기"
                className="inline-flex h-12 min-h-12 min-w-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
              >
                ◀ 이전
              </button>
              <button
                type="button"
                data-carousel-dir="next"
                aria-label="다음 매물 보기"
                className="inline-flex h-12 min-h-12 min-w-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
              >
                다음 ▶
              </button>
            </div>
          </div>
        )}
        <ul
          data-deals-carousel=""
          className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2"
        >
          {featuredDeals.map((deal, i) => {
            const safeAddress = sanitizeDealAddress(deal.address);
            const rawPriceWon =
              typeof deal.priceWon === "number" && deal.priceWon > 0
                ? deal.priceWon
                : typeof deal.price === "number" && deal.price > 0
                ? deal.price
                : null;
            const priceLabel = formatPriceKo(rawPriceWon || deal.price);
            const priceDisplay =
              priceLabel === "-" ||
              priceLabel.endsWith("원") ||
              /(?:억대|만대|협의|문의|확인)/.test(priceLabel)
                ? priceLabel
                : `${priceLabel} 원`;

            // 실질 수익률 (보증금 차감)
            const yieldVal =
              typeof deal.grossYieldNetOfDeposit === "number" && deal.grossYieldNetOfDeposit > 0
                ? deal.grossYieldNetOfDeposit
                : typeof deal.netYieldOnDeposit === "number" && deal.netYieldOnDeposit > 0
                ? deal.netYieldOnDeposit
                : typeof deal.grossYieldOnPrice === "number" && deal.grossYieldOnPrice > 0
                ? deal.grossYieldOnPrice
                : null;
            const yieldLabel = yieldVal !== null ? `${yieldVal.toFixed(2)}%` : null;

            // 대지 및 연면적 (평) - PYEONG_RATIO = 0.3025
            const landPyeong =
              typeof deal.landAreaPyeong === "number"
                ? deal.landAreaPyeong
                : typeof deal.landAreaM2 === "number"
                ? Math.round(deal.landAreaM2 * PYEONG_RATIO * 10) / 10
                : null;
            const gfaPyeong =
              typeof deal.grossFloorAreaPyeong === "number"
                ? deal.grossFloorAreaPyeong
                : typeof deal.grossFloorAreaM2 === "number"
                ? Math.round(deal.grossFloorAreaM2 * PYEONG_RATIO * 10) / 10
                : null;
            const areaDisplay =
              landPyeong !== null && gfaPyeong !== null
                ? `대지 ${landPyeong}평 · 연 ${gfaPyeong}평`
                : gfaPyeong !== null
                ? `연면적 ${gfaPyeong}평`
                : landPyeong !== null
                ? `대지 ${landPyeong}평`
                : null;

            // 용도지역 및 층수
            const zoning = deal.zoning ? String(deal.zoning) : null;
            const floorsStr = deal.floors
              ? String(deal.floors)
              : typeof deal.totalFloors === "number"
              ? `지상 ${deal.totalFloors}층`
              : null;
            const specLine = [zoning, floorsStr].filter(Boolean).join(" · ");

            // 1줄 핵심 투자 포인트
            const investmentPoint = deal.investmentPoint || deal.point || null;

            // IM URL / 직결 여부
            const dealIdStr = String(deal.id ?? i);
            const isUuidDeal = UUID_PREFIX_RE.test(String(deal.id ?? ""));
            const directImUrl = deal.imUrl || (isUuidDeal ? `/im-lite/${encodeURIComponent(String(deal.id))}` : null);

            const inquiryProps = {
              "data-deal-inquiry": "true",
              "data-deal-id": String(deal.id ?? ""),
              "data-deal-asset": String(deal.assetType ?? "상업용 부동산"),
              "data-deal-address": safeAddress,
              "data-deal-price": priceLabel,
              "data-deal-signal": String(deal.areaSignal ?? ""),
            };

            return (
              <li
                key={i}
                className="block w-[300px] sm:w-[320px] shrink-0 snap-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:border-slate-300"
              >
                <a
                  href={`#deal-inquiry-${encodeURIComponent(dealIdStr)}`}
                  {...inquiryProps}
                  data-track-click="featured_deal"
                  data-track="listing_click"
                  data-track-listing-id={deal.id}
                  data-track-from="featured"
                  className="block min-h-12"
                >
                  <div className="relative h-[145px] w-full overflow-hidden" style={{ background: DEAL_FALLBACK_BG }}>
                    {deal.photoUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={deal.photoUrl} alt="" width={320} height={145} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                      : <div className="flex h-full w-full items-center justify-center"><Building2 className="h-8 w-8 text-indigo-300/60" aria-hidden="true" /></div>}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                    <div className="absolute bottom-2 left-2.5 right-2.5 flex items-end justify-between gap-1.5">
                      {yieldLabel ? (
                        <span className="rounded-lg bg-emerald-950 border border-emerald-400/40 px-2 py-0.5 text-sm font-extrabold text-emerald-200 shadow">
                          실질 {yieldLabel}
                        </span>
                      ) : deal.areaSignal ? (
                        <span className="rounded-lg bg-slate-900/90 px-2 py-0.5 text-sm font-bold text-white">
                          {deal.areaSignal}
                        </span>
                      ) : <span />}
                      {deal.buyerInterestCount > 0 && (
                        <span className="rounded-lg border border-rose-400/40 bg-rose-950 px-2 py-0.5 text-sm font-bold text-rose-100">
                          관심 {deal.buyerInterestCount}명
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="line-clamp-1 text-body font-bold text-slate-900 leading-tight">
                          {deal.title || deal.assetType || "상업용 빌딩"}
                        </h3>
                        {deal.title && deal.assetType && deal.title !== deal.assetType && (
                          <span className="mt-0.5 inline-block text-sm font-semibold text-indigo-700">
                            {deal.assetType}
                          </span>
                        )}
                        <p className="mt-0.5 line-clamp-1 text-sm text-slate-700">{safeAddress}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm text-slate-700 block font-medium">매매가</span>
                        <span className="text-reader font-extrabold font-mono text-indigo-800">
                          {priceDisplay}
                        </span>
                      </div>
                    </div>

                    {/* 스펙 그리드: 면적(평) / 용도·층수 */}
                    {(areaDisplay || specLine) && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-1 text-sm">
                        {areaDisplay && (
                          <div className="flex items-center justify-between gap-2 text-slate-900">
                            <span className="text-slate-700 shrink-0 text-sm font-medium">면적</span>
                            <span className="font-semibold truncate text-sm">{areaDisplay}</span>
                          </div>
                        )}
                        {specLine && (
                          <div className="flex items-center justify-between gap-2 text-slate-900">
                            <span className="text-slate-700 shrink-0 text-sm font-medium">용도·층수</span>
                            <span className="font-semibold truncate text-sm">{specLine}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 1줄 핵심 투자 포인트 */}
                    {investmentPoint && (
                      <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1.5 text-sm text-indigo-900 font-medium line-clamp-2">
                        💡 {investmentPoint}
                      </div>
                    )}
                  </div>
                </a>

                {/* Primary CTAs: [📄 모바일 IM 열람] + [🧮 이 매물 수지분석] */}
                <div className="flex flex-col gap-2 px-3.5 pb-3.5 pt-1">
                  <div className="flex gap-2">
                    {directImUrl ? (
                      <a
                        href={directImUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-track="im_request"
                        data-track-click="featured_deal_im"
                        data-track-listing-id={deal.id}
                        data-track-from="featured"
                        className="flex min-h-12 flex-1 items-center justify-center gap-1 rounded-xl bg-indigo-700 hover:bg-indigo-800 px-2 text-center text-sm font-extrabold text-white transition-colors shadow-sm"
                      >
                        <span aria-hidden="true">📄</span>
                        <span>모바일 IM 열람</span>
                      </a>
                    ) : (
                      <a
                        href={`#deal-inquiry-im-${encodeURIComponent(dealIdStr)}`}
                        {...inquiryProps}
                        data-track="im_request"
                        data-track-click="featured_deal_im"
                        data-track-listing-id={deal.id}
                        data-track-from="featured"
                        className="flex min-h-12 flex-1 items-center justify-center gap-1 rounded-xl bg-indigo-700 hover:bg-indigo-800 px-2 text-center text-sm font-extrabold text-white transition-colors shadow-sm"
                      >
                        <span aria-hidden="true">📄</span>
                        <span>모바일 IM 열람</span>
                      </a>
                    )}
                  </div>

                  <a
                    href={`#deal-inquiry-detail-${encodeURIComponent(dealIdStr)}`}
                    {...inquiryProps}
                    data-track="listing_click"
                    data-track-listing-id={deal.id}
                    data-track-from="featured_detail"
                    className="flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-2 text-center text-sm font-semibold text-slate-800 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                  >
                    상세 정보 · 문의
                  </a>
                </div>

                {deal.actionCard && (
                  <div className="border-t border-slate-200 px-3.5 pb-3.5 pt-2">
                    <ActionCardView actionCard={deal.actionCard} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );

  const specialties = [
    ...strArray(brokerVibe?.specialty_regions ?? broker.specialtyRegions),
    ...strArray(brokerVibe?.specialty_assets ?? broker.specialtyAssets),
  ];

  const sectionNode = (id: string): React.ReactNode => {
    switch (id) {
      case "market_data":
        return editionKind === "monthly" && validMonthlyCharts.length > 0 ? (
          <Section>
            <div
              data-testid="monthly-regional-charts-section"
              className="space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-extrabold text-slate-900">
                  이달의 주요 시장 그래프 {validMonthlyCharts.length}선
                </h2>
                <span className="text-sm font-semibold text-slate-700">
                  {validMonthlyCharts[0]?.regionLabel ?? "주요 권역"}
                </span>
              </div>
              <div className="space-y-3.5">
                {validMonthlyCharts.map((chart, idx) => (
                  <MonthlyGlassStatCard
                    key={chart.id || idx}
                    index={idx}
                    chart={chart}
                    size="viewer"
                    cardTestId={`viewer-monthly-chart-card-${idx}`}
                    sourceTestId={`viewer-monthly-chart-source-${idx}`}
                  />
                ))}
              </div>
            </div>
          </Section>
        ) : null;
      case "ai_briefing":
        return normBriefing ? renderAiBriefing() : null;
      case "field_note":
        return !normBriefing && hasFieldNote ? renderFieldNote() : null;
      case "news_curation":
        return hasNewsOrUnitIssues ? (
          <Section>
            <NewsSection items={topNews} unitIssues={unitIssues} cadence={editionKind} />
          </Section>
        ) : null;
      case "featured_deals":
        return featuredDeals.length > 0 ? renderFeaturedDeals() : null;
      case "broker_profile":
        return (
          <Section>
            <BrokerProfileSection
              name={brokerName}
              company={brokerCompany ?? null}
              photoUrl={broker.photoUrl ?? null}
              specialties={specialties}
              slug={brokerVibe?.slug ?? brokerSlug}
              dealCount={broker.totalDeals ?? 0}
              listingCount={broker.activeDeals ?? 0}
              phone={brokerPhone ?? null}
              officeAddress={brokerOfficeAddress ?? null}
              officeRegNumber={brokerOfficeRegNumber ?? null}
              representativeName={brokerRepresentativeName ?? null}
            />
          </Section>
        );
      case "subscribe_cta":
        if (isSubscribedViewer) return null;
        return (
          <Section>
            <div className={preview ? "pointer-events-none select-none" : undefined} aria-hidden={preview || undefined}>
              <SubscribeCard brokerId={brokerId} source="magazine" accentColor={accent} variant="minimal" />
            </div>
          </Section>
        );
      default:
        return null;
    }
  };

  // 통일 5단계 + 월간 상단 그래프 2선 + 최소 옵트인 구조
  const UNIFIED_VIEWER_ORDER: readonly string[] = [
    "market_data",
    "ai_briefing",
    "field_note",
    "news_curation",
    "featured_deals",
    "broker_profile",
    "subscribe_cta",
  ];
  const BUYER_VIEWER_ORDER: readonly string[] = [
    "market_data",
    "ai_briefing",
    "field_note",
    "featured_deals",
    "news_curation",
    "broker_profile",
    "subscribe_cta",
  ];
  const SELLER_VIEWER_ORDER: readonly string[] = [
    "market_data",
    "ai_briefing",
    "field_note",
    "news_curation",
    "featured_deals",
    "broker_profile",
    "subscribe_cta",
  ];
  const targetSectionOrder =
    target === "buyer"
      ? BUYER_VIEWER_ORDER
      : target === "seller"
      ? SELLER_VIEWER_ORDER
      : UNIFIED_VIEWER_ORDER;

  const order = targetSectionOrder.filter((id) =>
    isSectionEnabled(data.sections, id)
  );
  const rendered = order
    .map((id) => ({ id, node: sectionNode(id) }))
    .filter((s): s is { id: string; node: React.ReactNode } => s.node !== null && s.node !== undefined);

  const renderedIdSet = new Set(rendered.map((r) => r.id));

  // 본문 섹션(구독·프로필 제외)이 하나도 그려지지 않으면 빈 상태
  const CHROME_ONLY = new Set(["subscribe_cta", "broker_profile"]);
  const isEmpty = !hasAnyViewerContent(data) || !rendered.some((s) => !CHROME_ONLY.has(s.id));
  const Wrapper = preview ? "div" : "main";

  // ═══════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <ViewerTrackProvider
      editionId={data.id ?? `${brokerId}-${date}`}
      brokerId={brokerId}
      preview={preview}
      className="min-h-screen w-full bg-[#FAF9F5] text-slate-900"
      style={{ "--accent": accent, "--foreground": "#0F172A" } as React.CSSProperties}
    >
      <Wrapper id={preview ? undefined : "magazine-main"} className="mx-auto max-w-[440px] px-4 pb-12">

        {/* ── HERO / COVER (깔끔한 발행인 · 날짜 · 자연 줄바꿈 제목) ─────────────────── */}
        <header
          className={
            coverImageUrl
              ? "relative mb-4 overflow-hidden rounded-2xl bg-slate-900 px-4 pb-5 pt-8 text-white"
              : "relative overflow-hidden bg-[#FAF9F5] px-1 pb-5 pt-8 text-slate-900"
          }
          data-section-id="cover"
        >
          {coverImageUrl && (
            <>
              {/* 표지는 첫 화면(LCP) — 우선 로드, 크기 명시로 레이아웃 이동 방지. 임의 외부 URL 이라 next/image 대신 <img>. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverImageUrl} alt="" width={440} height={320} decoding="async" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(15,23,42,0.78) 0%, rgba(15,23,42,0.92) 100%)" }} />
            </>
          )}

          {/* Broker row */}
          <div className="relative mb-5 flex items-center gap-2.5">
            <InitialAvatar name={brokerName} size={40} decorative />
            <div>
              <p className={coverImageUrl ? "text-sm font-bold text-white" : "text-sm font-bold text-slate-900"}>
                {brokerName}
              </p>
              {broker.company && (
                <p className={coverImageUrl ? "text-sm text-slate-200" : "text-sm text-slate-700"}>
                  {broker.company}
                </p>
              )}
            </div>
          </div>

          {/* Date + Clean Break-Keep Title */}
          <div className="relative">
            <p
              className={
                coverImageUrl
                  ? "mb-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-200"
                  : "mb-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-700"
              }
            >
              <time dateTime={date}>{dateLabel}</time>
            </p>
            <h1
              data-single-line-title="true"
              title={title}
              className={
                coverImageUrl
                  ? "mb-1.5 break-keep text-xl sm:text-2xl font-extrabold leading-snug tracking-tight text-white"
                  : "mb-1.5 break-keep text-xl sm:text-2xl font-extrabold leading-snug tracking-tight text-slate-900"
              }
            >
              {title}
            </h1>
          </div>
        </header>

        {/* ── SECTIONS ──────────────────────────────────────────── */}
        {isEmpty ? (
          <div className="space-y-5">
            <EmptyState
              icon={<Newspaper className="h-8 w-8 text-slate-600" />}
              title="아직 게시된 내용이 없습니다"
              description="이번 호에는 표시할 콘텐츠가 없어요. 구독하시면 다음 호를 보내드립니다."
              className="border-slate-300 bg-white [&_p]:text-slate-800"
            />
            <div data-section-id="subscribe_cta">{sectionNode("subscribe_cta")}</div>
          </div>
        ) : (
          <div className="space-y-5">
            {rendered.map(({ id, node }) => (
              <div key={id} id={`section-${id}`} data-section-id={id}>{node}</div>
            ))}
          </div>
        )}

        {/* ── Footer: 법정 표시의무(접힘) + 추적·개인정보 고지 + 브랜딩 ───────────────── */}
        <footer className="mt-6 space-y-3">
          <BrokerStatutoryFooter
            company={brokerCompany}
            officeAddress={brokerOfficeAddress}
            officeRegNumber={brokerOfficeRegNumber}
            representativeName={brokerRepresentativeName}
            displayName={brokerName}
            phone={brokerPhone}
          />
          {!renderedIdSet.has("subscribe_cta") && <TrackingNotice />}
          <div className="pt-1">
            <PoweredByBadge
              variant="subtle"
              context="magazine"
              brokerId={brokerId}
              hasVerifiedLedger={
                featuredDeals.length > 0 ||
                validMonthlyCharts.some((c) => c.sourceMode === "public_db")
              }
            />
          </div>
        </footer>
      </Wrapper>

      {!preview && (
        <DealInquirySheet
          brokerName={brokerName}
          brokerPhone={brokerPhone ?? null}
          brokerSlug={brokerVibe?.slug ?? brokerSlug ?? brokerId}
        />
      )}
    </ViewerTrackProvider>
  );
}

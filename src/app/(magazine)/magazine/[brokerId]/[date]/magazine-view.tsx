/**
 * MagazineView — 매거진 뷰어 **Server Component 셸** (E-03 U-06)
 *
 * - 훅/'use client' 없음: 본문(표지·브리핑·현장노트·테마·매물·시장데이터 …)은 서버에서 HTML 로 렌더되고
 *   클라이언트 번들에는 상호작용 섬만 들어간다.
 *     · ViewerTrackProvider  — 분석(섹션 노출/체류) + `[data-track]` 클릭 위임
 *     · SectionCard          — 아코디언          · GlossaryTerm / BrokerAvatar — 용어 설명 / 사진 폴백
 *     · PollSection          — 설문             · SubscribeCard                — 구독 폼
 *     · LazyRoiCalculator / LazyForwardSection  — next/dynamic 지연 로드 (LazyIslands 클라이언트 래퍼)
 *     · ViewerBottomBar      — 하단 고정 바(공유·Kakao SDK)
 * - 섬에는 직렬화 가능한 최소 props 만 내려준다(함수·Set 금지). 클릭 추적은 `data-track*` 속성으로 위임한다.
 * - 에디터 미리보기(클라이언트 페이지)에서 import 해도 동작하도록 훅을 쓰지 않는다.
 * - M2-20(테마 LLM 중복 호출)은 뷰어가 읽기 전용 GET 이라 LLM 호출 자체가 없어 해당 없음(N/A).
 */
import React from "react";
import {
  Building2, ArrowRight, Sparkles, PenLine, Target, Calculator, Newspaper,
} from "lucide-react";
import { SubscribeCard } from "@/components/magazine/SubscribeCard";
import { ActionCardView } from "@/components/im/action-card-view";
import { PoweredByBadge } from "@/components/ui/PoweredByBadge";
import { EmptyState } from "@/components/ui/empty-state";
import { InitialAvatar } from "@/components/magazine/InitialAvatar";
import { TrackingNotice } from "@/components/magazine/TrackingNotice";
import { PollSection } from "@/components/magazine/PollSection";
import { ViewerBottomBar } from "@/components/magazine/ViewerBottomBar";
import { ViewerTrackProvider } from "@/components/magazine/viewer-track";
import { LazyRoiCalculator, LazyForwardSection } from "@/components/magazine/LazyIslands";
import { Section, DataBadge, SectionCard, RichBriefing } from "@/components/magazine/viewer-primitives";
import {
  MarketDataSection, NewsSection, AuctionSection, ReportsSection, SentimentSection,
  TaxClinicSection, BrokerProfileSection,
} from "@/components/magazine/viewer-sections";
import { formatKoreanDate } from "@/lib/magazine/kst";
import { normalizePoll } from "@/lib/magazine/poll-helpers";
import {
  buildMagazineTitle, estimateReadMinutes, formatPriceKo, hasAnyViewerContent, isSectionEnabled,
  MARKET_TEMP_VIEW, parseViewerTarget, pickTopNews, resolveSectionOrder,
  taxVisibleForTarget, toTelHref, type ViewerTarget,
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
}

export type MagazineData = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const STAT_TONE: Record<string, string> = {
  emerald: "text-emerald-300 border-emerald-500/20 bg-emerald-500/10",
  indigo: "text-indigo-300 border-indigo-500/20 bg-indigo-500/10",
  rose: "text-rose-300 border-rose-500/20 bg-rose-500/10",
  amber: "text-amber-300 border-amber-500/20 bg-amber-500/10",
  slate: "text-ink-muted border-slate-500/20 bg-slate-500/10",
};

const DEAL_FALLBACK_BG = "linear-gradient(135deg, #1e1b4b, #312e81)";

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

// ── Main Component ───────────────────────────────────────────────────
export function MagazineView({
  data, brokerId, brokerSlug = null, date, dateLabel: dateLabelProp, brokerVibe, preview = false, target: targetProp,
}: MagazineViewProps) {
  const broker = (data.broker as Record<string, any>) ?? {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  const brokerName: string = typeof broker.name === "string" && broker.name.trim() ? broker.name : "중개사";
  // 날짜 표시는 서버에서 formatKoreanDate 로 계산한 값을 사용 (hydration 불일치 제거, T3-40).
  const dateLabel = dateLabelProp ?? formatKoreanDate(date);
  // URL 의 ?target= 이 우선, 없으면 에디션의 target_segment(발송 대상)를 기본 순서로 존중한다.
  const target: ViewerTarget = targetProp !== undefined ? parseViewerTarget(targetProp) : parseViewerTarget(data.target_segment);
  const title = buildMagazineTitle(data.headline, broker.name);
  const telHref = toTelHref(broker.phone);

  // 투자 심리: 실제 숫자 점수가 있을 때만 표시 (고정 기본값 금지, M2-03)
  const sentiment = (data.sentiment as { score?: unknown; status?: string; asOf?: string } | null) ?? null;
  const sentimentScore = typeof sentiment?.score === "number" && Number.isFinite(sentiment.score) ? sentiment.score : null;
  const accent = (data.themeColor as string | undefined) || (data.theme_color as string | undefined) || "#6366f1";

  // ── Cover data ──
  const marketTemp = data.market_temp as string | null | undefined;
  const tempConfig = marketTemp ? MARKET_TEMP_VIEW[marketTemp] : null;
  const coverKeywords = strArray(data.cover_keywords).slice(0, 3);
  const coverImageUrl = data.cover_image_url as string | null | undefined;

  // ── Field note ──
  const fieldNote = (data.field_note as Record<string, string> | null | undefined) ?? {};
  const hasFieldNote = !!(fieldNote.question || fieldNote.buyerReaction || fieldNote.sellerReaction || fieldNote.marketJudgment || fieldNote.comment);

  // ── Theme of week ──
  const themeTitle = data.theme_title as string | null | undefined;
  const themeBodyMd = data.theme_body_md as string | null | undefined;
  const themeAssetTypes = strArray(data.theme_asset_types);

  // ── Deals ──
  const featuredDeals: any[] = Array.isArray(data.featured_deals) ? data.featured_deals : Array.isArray(data.dealHighlights) ? data.dealHighlights : []; // eslint-disable-line @typescript-eslint/no-explicit-any

  // ── Market data ── (더미 폴백 금지: 데이터가 없으면 섹션을 숨긴다 — P0-05 T3-03)
  const recentTxs: any[] = Array.isArray(data.recentTransactions) ? data.recentTransactions : []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const rentalTrend = data.rentalTrend || null;
  const commercialDistrict = data.commercialDistrict || null;
  const monthlySummary = data.monthlySummary || null;
  const hasMarketData = recentTxs.length > 0 || !!rentalTrend || !!commercialDistrict || !!monthlySummary;

  // ── News / extras ──
  const topNews = pickTopNews(data);
  const auctionPicks: any[] = Array.isArray(data.auctionPicks) ? data.auctionPicks : []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const reports: any[] = Array.isArray(data.reports) ? data.reports : []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const taxClinic = (data.tax_clinic as Record<string, any> | null | undefined) ?? null; // eslint-disable-line @typescript-eslint/no-explicit-any
  const hasTaxClinic = !!(taxClinic && (taxClinic.question || taxClinic.title));
  const hasPoll = normalizePoll(data.poll) !== null;

  const readTimeMin = estimateReadMinutes([
    data.briefing, data.headline, themeBodyMd,
    fieldNote.question, fieldNote.buyerReaction, fieldNote.sellerReaction, fieldNote.marketJudgment, fieldNote.comment,
    ...topNews.map((n) => `${n.title} ${n.summary}`),
  ]);

  // ── Theme-matched deals ──
  const themeDeals = !themeTitle || featuredDeals.length === 0 || themeAssetTypes.length === 0
    ? []
    : featuredDeals
      .filter((deal) => themeAssetTypes.some((t) => String(deal.assetType ?? "").includes(t)))
      .slice(0, 3);

  // ═══════════════════════════════════════════════════════════════════
  //  섹션 렌더러
  // ═══════════════════════════════════════════════════════════════════

  const renderAiBriefing = () => (
    <Section>
      <div className="overflow-hidden rounded-2xl border border-indigo-500/15" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.07) 0%, rgba(15,15,35,0.8) 100%)" }}>
        <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
          <Sparkles className="h-4 w-4 text-indigo-300" aria-hidden="true" />
          <h2 className="text-label font-bold text-indigo-200">AI 마켓 에디터 브리핑</h2>
          <div className="ml-auto"><DataBadge type="ai" /></div>
        </div>
        <div className="p-4">
          <RichBriefing text={(data.briefing as string) ?? ""} />
        </div>
      </div>
    </Section>
  );

  const fieldRow = (emoji: string, label: string, text?: string) => !text ? null : (
    <div className="flex items-start gap-2">
      <span className="shrink-0 text-base" aria-hidden="true">{emoji}</span>
      <div>
        <h3 className="mb-0.5 text-caption font-bold text-ink-subtle">{label}</h3>
        <p className="text-reader text-ink-muted">{text}</p>
      </div>
    </div>
  );

  const renderFieldNote = () => (
    <Section>
      <div className="overflow-hidden rounded-2xl border border-violet-500/20" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.08), rgba(15,15,35,0.9))" }}>
        <div className="flex items-center gap-2 border-b border-violet-500/10 px-4 py-3">
          <PenLine className="h-4 w-4 text-violet-300" aria-hidden="true" />
          <h2 className="text-label font-bold text-violet-200">{brokerName}의 현장 노트</h2>
          <div className="ml-auto"><DataBadge type="ai" /></div>
        </div>
        <div className="space-y-3.5 p-4">
          {fieldRow("💬", "이번 주 시장", fieldNote.question)}
          {fieldRow("📈", "매수 반응", fieldNote.buyerReaction)}
          {fieldRow("📉", "매도 반응", fieldNote.sellerReaction)}
          {fieldRow("🌡️", "시장 판단", fieldNote.marketJudgment)}
          {fieldNote.comment && (
            <div className="mt-1 rounded-xl border border-violet-500/15 p-3" style={{ background: "rgba(139,92,246,0.06)" }}>
              <div className="flex items-start gap-2">
                <span className="shrink-0 text-base" aria-hidden="true">💡</span>
                <div>
                  <h3 className="mb-0.5 text-caption font-bold text-violet-300">중개인 한마디</h3>
                  <p className="text-reader font-bold text-white">{fieldNote.comment}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Section>
  );

  const renderThemeOfWeek = () => (
    <Section>
      <div className="overflow-hidden rounded-2xl border border-amber-500/15" style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.06), rgba(15,15,35,0.9))" }}>
        <div className="flex items-center gap-2 border-b border-amber-500/10 px-4 py-3">
          <Target className="h-4 w-4 text-amber-300" aria-hidden="true" />
          <h2 className="text-label font-bold text-amber-200">금주의 테마</h2>
          <div className="ml-auto"><DataBadge type="ai" /></div>
        </div>
        <div className="p-4">
          <h3 className="mb-3 text-title font-extrabold leading-snug text-white">{themeTitle}</h3>
          {themeBodyMd && <RichBriefing text={themeBodyMd} />}
          {themeAssetTypes.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {themeAssetTypes.map((t, i) => (
                <span key={i} className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-caption font-bold text-amber-300">{t}</span>
              ))}
            </div>
          )}
        </div>
        {themeDeals.length > 0 && (
          <div className="space-y-2 px-4 pb-4">
            <h3 className="mb-1 text-caption font-bold text-ink-subtle">테마 관련 매물</h3>
            {themeDeals.map((deal, i) => (
              <a
                key={i}
                href={`/building/${deal.id}`}
                data-track-click="theme_deal"
                data-track="listing_click"
                data-track-listing-id={deal.id}
                data-track-from="theme"
                className="group flex min-h-11 items-center gap-3 rounded-xl border border-white/10 p-3 transition-all duration-300 hover:border-amber-500/25"
                style={{ background: "rgba(255,255,255,0.025)" }}
              >
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ background: DEAL_FALLBACK_BG }}>
                  {deal.photoUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={deal.photoUrl} alt="" width={48} height={48} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                    : <Building2 className="h-5 w-5 text-indigo-300/60" aria-hidden="true" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-label font-bold text-white">{deal.assetType} · {deal.address}</p>
                  <p className="text-body font-extrabold" style={{ color: accent }}>{formatPriceKo(deal.price)}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-subtle transition-colors group-hover:text-amber-300" aria-hidden="true" />
              </a>
            ))}
          </div>
        )}
      </div>
    </Section>
  );

  const renderFeaturedDeals = () => (
    <Section>
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Building2 className="h-4 w-4 text-rose-300" aria-hidden="true" />
          <h2 className="text-label font-bold text-white">주목 매물 하이라이트</h2>
          <span className="ml-auto rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-caption font-bold text-rose-200">{featuredDeals.length}건</span>
        </div>
        <ul className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
          {featuredDeals.map((deal, i) => (
            <li
              key={i}
              className="block w-[260px] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 transition-all duration-300 hover:border-white/20"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <a
                href={`/building/${deal.id}`}
                data-track-click="featured_deal"
                data-track="listing_click"
                data-track-listing-id={deal.id}
                data-track-from="featured"
                className="block"
              >
                <div className="relative h-[130px] w-full overflow-hidden" style={{ background: DEAL_FALLBACK_BG }}>
                  {deal.photoUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={deal.photoUrl} alt="" width={260} height={130} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                    : <div className="flex h-full w-full items-center justify-center"><Building2 className="h-8 w-8 text-indigo-300/50" aria-hidden="true" /></div>}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-2 left-2.5 right-2.5 flex items-end justify-between">
                    {deal.areaSignal ? <span className="rounded-lg bg-black/50 px-1.5 py-0.5 text-caption font-bold text-white">{deal.areaSignal}</span> : <span />}
                    {deal.buyerInterestCount > 0 && <span className="rounded-lg border border-rose-500/30 bg-rose-950/70 px-1.5 py-0.5 text-caption font-bold text-rose-200">관심 {deal.buyerInterestCount}명</span>}
                  </div>
                </div>
                <div className="p-3">
                  <h3 className="mb-0.5 line-clamp-1 text-label font-bold text-white">{deal.assetType}</h3>
                  <p className="mb-2 line-clamp-1 text-caption text-ink-subtle">{deal.address}</p>
                  <p className="text-body font-extrabold" style={{ color: accent }}>{formatPriceKo(deal.price)}</p>
                </div>
              </a>
              <div className="flex gap-2 px-3 pb-3 pt-1">
                <a
                  href={`/im-lite/${deal.id}`}
                  data-track-click="featured_deal_im"
                  data-track="im_request"
                  data-track-listing-id={deal.id}
                  data-track-from="featured"
                  className="flex min-h-11 flex-1 items-center justify-center rounded-lg border text-center text-caption font-bold transition-colors"
                  style={{ background: `${accent}15`, color: accent, borderColor: `${accent}30` }}
                >
                  투자설명서
                </a>
                <a
                  href={`/building/${deal.id}`}
                  data-track="listing_click"
                  data-track-listing-id={deal.id}
                  data-track-from="featured_detail"
                  className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-center text-caption font-bold text-white"
                >
                  상세 정보
                </a>
              </div>
              {deal.actionCard && (
                <div className="border-t border-white/5 px-3 pb-3 pt-2">
                  <ActionCardView actionCard={deal.actionCard} />
                </div>
              )}
            </li>
          ))}
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
      case "ai_briefing": return data.briefing || data.headline ? renderAiBriefing() : null;
      case "field_note": return hasFieldNote ? renderFieldNote() : null;
      case "theme_of_week": return themeTitle ? renderThemeOfWeek() : null;
      case "featured_deals": return featuredDeals.length > 0 ? renderFeaturedDeals() : null;
      case "poll":
        return hasPoll ? (
          <Section>
            <PollSection brokerId={brokerId} date={date} poll={data.poll} preview={preview} telHref={telHref} />
          </Section>
        ) : null;
      case "subscribe_cta":
        return (
          <Section>
            <div className={preview ? "pointer-events-none select-none" : undefined} aria-hidden={preview || undefined}>
              <SubscribeCard brokerId={brokerId} source="magazine" accentColor={accent} />
            </div>
          </Section>
        );
      case "broker_profile":
        return (
          <Section>
            <BrokerProfileSection
              name={brokerName}
              company={broker.company ?? null}
              photoUrl={broker.photoUrl ?? null}
              specialties={specialties}
              slug={brokerVibe?.slug ?? brokerSlug}
              dealCount={broker.totalDeals ?? 0}
              listingCount={broker.activeDeals ?? 0}
            />
          </Section>
        );
      case "market_data":
        return hasMarketData ? (
          <Section>
            <MarketDataSection
              recentTxs={recentTxs}
              rentalTrend={rentalTrend}
              commercialDistrict={commercialDistrict}
              monthlySummary={monthlySummary}
              dateLabel={dateLabel}
              defaultOpen={target === "seller"}
            />
          </Section>
        ) : null;
      case "news_curation":
        return topNews.length > 0 ? <Section><NewsSection items={topNews} /></Section> : null;
      case "auction_picks":
        return auctionPicks.length > 0 ? <Section><AuctionSection picks={auctionPicks} /></Section> : null;
      case "reports":
        return reports.length > 0 ? <Section><ReportsSection reports={reports} /></Section> : null;
      case "sentiment_index":
        return sentimentScore !== null ? (
          <Section>
            <SentimentSection sentiment={{ score: sentimentScore, status: sentiment?.status, asOf: sentiment?.asOf }} />
          </Section>
        ) : null;
      case "roi_calculator":
        return (
          <Section>
            <SectionCard title="수지분석 계산기" icon={<Calculator className="h-4 w-4 text-emerald-300" aria-hidden="true" />} defaultOpen>
              <LazyRoiCalculator accentColor={accent} />
            </SectionCard>
          </Section>
        );
      case "tax_clinic":
        return hasTaxClinic && taxVisibleForTarget(target) ? (
          <Section>
            <TaxClinicSection taxClinic={taxClinic} telHref={telHref} />
          </Section>
        ) : null;
      case "referral":
        return (
          <Section>
            <LazyForwardSection brokerId={brokerId} brokerName={broker.name} preview={preview} />
          </Section>
        );
      default:
        return null;
    }
  };

  const order = resolveSectionOrder(target, data.section_order).filter((id) => isSectionEnabled(data.sections, id));
  const rendered = order
    .map((id) => ({ id, node: sectionNode(id) }))
    .filter((s): s is { id: string; node: React.ReactNode } => s.node !== null && s.node !== undefined);

  // 본문 섹션(구독·프로필·계산기·전달하기 제외)이 하나도 그려지지 않으면 빈 상태 — 데이터 부재뿐 아니라 섹션 off/빈 설문도 포함.
  const CHROME_ONLY = new Set(["subscribe_cta", "broker_profile", "roi_calculator", "referral"]);
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
      className="min-h-screen w-full"
      style={{ background: "linear-gradient(180deg, #050510 0%, #0a0a1a 40%, #080814 100%)", "--accent": accent } as React.CSSProperties}
    >
      <Wrapper id={preview ? undefined : "magazine-main"} className="mx-auto max-w-[440px] px-4 pb-28">

        {/* ── HERO / COVER ───────────────────────────────────── */}
        <header
          className="relative overflow-hidden px-1 pb-8 pt-10"
          data-section-id="cover"
          style={{ background: coverImageUrl ? undefined : `linear-gradient(160deg, ${accent}18 0%, transparent 55%)` }}
        >
          {coverImageUrl && (
            <>
              {/* 표지는 첫 화면(LCP) — 우선 로드, 크기 명시로 레이아웃 이동 방지. 임의 외부 URL 이라 next/image 대신 <img>. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverImageUrl} alt="" width={440} height={320} decoding="async" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(5,5,16,0.75) 0%, rgba(5,5,16,0.95) 100%)" }} />
            </>
          )}
          <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full opacity-20 blur-3xl" style={{ background: `radial-gradient(circle, ${accent}, transparent)` }} />

          {/* Broker row */}
          <div className="relative mb-6 flex items-center gap-2.5">
            <InitialAvatar name={brokerName} size={40} decorative />
            <div>
              <p className="text-label font-bold text-white">{brokerName}</p>
              {broker.company && <p className="text-caption text-ink-subtle">{broker.company}</p>}
            </div>
          </div>

          {/* Date + Title */}
          <div className="relative">
            <p className="mb-1.5 flex flex-wrap items-center gap-2 text-caption text-ink-subtle">
              <time dateTime={date}>{dateLabel}</time>
              <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-caption text-indigo-200">⏱ {readTimeMin}분 완독</span>
            </p>
            <h1 className="mb-2 text-display font-extrabold leading-tight tracking-tight text-white">{title}</h1>

            {tempConfig && (
              <div className="mb-3 inline-flex flex-wrap items-center gap-1.5 rounded-2xl border px-3 py-1.5" style={{ background: `${tempConfig.color}15`, borderColor: `${tempConfig.color}30` }}>
                <span className="text-sm" aria-hidden="true">{tempConfig.emoji}</span>
                <span className="text-caption font-extrabold" style={{ color: tempConfig.color }}>시장 온도 {marketTemp}</span>
                <span className="text-caption text-ink-muted">· {tempConfig.description}</span>
              </div>
            )}

            {coverKeywords.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {coverKeywords.map((kw, i) => (
                  <span key={i} className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-caption font-bold text-white"># {kw}</span>
                ))}
              </div>
            )}

            {strArray(broker.specialtyRegions).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {strArray(broker.specialtyRegions).map((r, i) => (
                  <span key={i} className="rounded-full px-2.5 py-0.5 text-caption font-bold" style={{ color: accent, background: `${accent}15`, border: `1px solid ${accent}30` }}>{r}</span>
                ))}
              </div>
            )}
          </div>

          {/* Key stats */}
          {Array.isArray(data.keyStats) && data.keyStats.length > 0 && (
            <ul className="relative mt-5 grid grid-cols-3 gap-2">
              {(data.keyStats as Array<{ value: string; label: string; accent?: string }>).map((stat, i) => (
                <li key={i} className={`rounded-xl border p-2.5 text-center ${STAT_TONE[stat.accent ?? ""] ?? "text-ink-muted border-white/10 bg-white/5"}`}>
                  <div className="mb-1 text-body font-extrabold leading-none">{stat.value}</div>
                  <div className="text-caption text-ink-muted">{stat.label}</div>
                </li>
              ))}
            </ul>
          )}

          {/* Broker quote from field_note.comment */}
          {fieldNote.comment && (
            <figure className="relative mt-4 rounded-xl border border-violet-500/15 px-3 py-2.5" style={{ background: "rgba(139,92,246,0.06)" }}>
              <blockquote className="text-label italic leading-relaxed text-violet-200">&ldquo;{fieldNote.comment}&rdquo;</blockquote>
              <figcaption className="mt-1 text-caption text-ink-subtle">— {brokerName}</figcaption>
            </figure>
          )}
        </header>

        {/* ── SECTIONS ──────────────────────────────────────────── */}
        {isEmpty ? (
          <div className="space-y-5">
            <EmptyState
              icon={<Newspaper className="h-8 w-8" />}
              title="아직 게시된 내용이 없습니다"
              description="이번 호에는 표시할 콘텐츠가 없어요. 구독하시면 다음 호를 보내드립니다."
            />
            <div data-section-id="subscribe_cta">{sectionNode("subscribe_cta")}</div>
          </div>
        ) : (
          <div className="space-y-5">
            {rendered.map(({ id, node }) => (
              <div key={id} data-section-id={id}>{node}</div>
            ))}
          </div>
        )}

        {/* ── Footer: 추적·개인정보 고지 + 브랜딩 ───────────────── */}
        <footer className="mt-6 space-y-3">
          <TrackingNotice />
          <div className="pt-1">
            <PoweredByBadge variant="full" context="magazine" brokerId={brokerId} />
          </div>
        </footer>
      </Wrapper>

      <ViewerBottomBar
        phone={broker.phone}
        kakaoUrl={broker.kakaoUrl ?? broker.kakao_url}
        brokerSlug={brokerSlug}
        brokerName={broker.name}
        brokerId={brokerId}
        headline={typeof data.headline === "string" ? data.headline : null}
        date={date}
        dateLabel={dateLabel}
        target={target}
        preview={preview}
      />
    </ViewerTrackProvider>
  );
}

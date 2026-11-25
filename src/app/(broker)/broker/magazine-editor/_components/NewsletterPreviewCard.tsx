"use client";

import React from "react";
import { Building2 } from "lucide-react";
import {
  PreviewEditableUnit,
  type PreviewLifecycleState,
} from "@/components/workspace/preview-sync";
import type { AssignableDealItem } from "@/components/magazine-editor/DealSlotAssigner";
import { AxiosGlassIssueCard } from "@/components/magazine/AxiosGlassIssueCard";
import { MonthlyGlassStatCard } from "@/components/magazine/MonthlyGlassStatCard";
import {
  MONTHLY_REGION_PRESETS,
  type MonthlyRegionKey,
} from "@/domain/magazine/monthly-stats-charts";
import {
  formatShortIssueSource,
  normalizeAxiosIssueCopy,
  parseMarketBriefingBullets,
} from "@/domain/magazine/issue-clustering";
import {
  NEWS_CHANNEL_MAP,
  type NewsChannelId,
} from "@/domain/magazine/news-channels";
import type {
  AxiosUnitIssue,
  MarketTemperature,
  MonthlyRegionalChart,
} from "@/domain/magazine/types";
import type { NewsletterCadence } from "@/lib/magazine/newsletter-cadence";
import {
  formatDotDate,
  resolveEditionPublicDateAndHeader,
} from "@/lib/magazine/edition-public-date";
import { resolveCanonicalDealSummary } from "@/lib/deal-card/canonical-summary";

export interface NewsletterPreviewCardProps {
  previewLifecycle: PreviewLifecycleState;
  activeUnitId: string | null;
  onFocusEditorUnit: (unitId: string) => void;
  yearMonthLabel: string;
  editionLabel?: string | null;
  issueDate?: string | null;
  publishedAt?: string | null;
  marketTemp: MarketTemperature | null;
  showMarketTempBadge?: boolean;
  headline: string;
  brokerName: string;
  brokerOffice: string;
  brokerPhone: string;
  cadence: NewsletterCadence;
  monthlyRegion: MonthlyRegionKey;
  monthlyCharts: MonthlyRegionalChart[];
  formattedPreviewBriefing: string;
  unitIssues: AxiosUnitIssue[];
  selectedDeals: AssignableDealItem[];
  dealComments: Record<string, string>;
  isSectionEnabled: (id: string) => boolean;
}

export function NewsletterPreviewCard({
  previewLifecycle,
  activeUnitId,
  onFocusEditorUnit,
  yearMonthLabel,
  editionLabel,
  issueDate,
  publishedAt,
  marketTemp,
  showMarketTempBadge = false,
  headline,
  brokerName,
  brokerOffice,
  brokerPhone,
  cadence,
  monthlyRegion,
  monthlyCharts,
  formattedPreviewBriefing,
  unitIssues,
  selectedDeals,
  dealComments,
  isSectionEnabled,
}: NewsletterPreviewCardProps) {
  const resolvedDateHeader = resolveEditionPublicDateAndHeader({
    cadence,
    editionLabel: editionLabel ?? yearMonthLabel,
    issueDate,
    publishedAt,
  });
  const dotDate = formatDotDate(
    resolvedDateHeader.publishedKstDate || resolvedDateHeader.canonicalUrlDate,
  );
  const issueBadgeLabel = yearMonthLabel.trim()
    ? dotDate
      ? `${yearMonthLabel.trim()} · ${dotDate} 발행`
      : yearMonthLabel.trim()
    : resolvedDateHeader.displayDateLabel;

  return (
    <article
      aria-label="실시간 뉴스레터 미리보기"
      className={`rounded-2xl bg-white p-5 shadow-2xs space-y-5 transition-opacity ${
        previewLifecycle === "pre_generation"
          ? "border-2 border-dashed border-slate-300 opacity-80"
          : "border border-slate-200"
      }`}
    >
      <header className="border-b border-slate-200 pb-4 space-y-3">
        <PreviewEditableUnit
          unitId="nl-unit-issue-meta"
          label="발행 호수 및 주기"
          isActive={activeUnitId === "nl-unit-issue-meta"}
          onActivate={onFocusEditorUnit}
          className="rounded-xl px-2.5 pt-3.5 pb-2 -mx-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-extrabold text-blue-900">
              {issueBadgeLabel} 뉴스레터
            </span>
            {showMarketTempBadge && marketTemp && (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-sm font-bold text-slate-800">
                시장 분위기: {marketTemp}
              </span>
            )}
          </div>
        </PreviewEditableUnit>

        <PreviewEditableUnit
          unitId="nl-unit-cover"
          label="미리보기 대표 헤드라인"
          isActive={activeUnitId === "nl-unit-cover"}
          onActivate={onFocusEditorUnit}
          className="rounded-xl px-2.5 pt-3.5 pb-2 -mx-2.5"
        >
          <h2
            data-single-line-title="true"
            className="break-keep leading-snug text-xl font-extrabold text-slate-900"
          >
            {headline.trim() || "표지 제목을 입력하면 이곳에 바로 표시됩니다"}
          </h2>
        </PreviewEditableUnit>

        {brokerName && (
          <p className="text-sm font-bold text-slate-600">
            발행인: {brokerName}
          </p>
        )}
      </header>

      {cadence === "monthly" && isSectionEnabled("market_data") && (
        <section
          data-testid="preview-monthly-stats-section"
          className="space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-extrabold text-slate-900">
              이달의 주요 시장 통계 2선
            </h3>
            <span className="text-sm font-bold text-slate-600">
              {MONTHLY_REGION_PRESETS.find((p) => p.key === monthlyRegion)?.shortLabel ??
                "강남·서초"}{" "}
              기준
            </span>
          </div>
          <div className="pt-2 space-y-4">
            {monthlyCharts.slice(0, 2).map((chart, idx) => (
              <PreviewEditableUnit
                key={chart.id || idx}
                unitId={`nl-unit-stats-${idx}`}
                label={`주요 통계 그래픽 ${idx + 1}번`}
                isActive={activeUnitId === `nl-unit-stats-${idx}`}
                onActivate={onFocusEditorUnit}
                className="rounded-2xl"
              >
                <MonthlyGlassStatCard
                  index={idx}
                  chart={chart}
                  size="preview"
                  cardTestId={`preview-monthly-chart-card-${idx}`}
                />
              </PreviewEditableUnit>
            ))}
          </div>
        </section>
      )}

      {isSectionEnabled("field_note") &&
        formattedPreviewBriefing.trim().length > 0 && (() => {
          const parsedBriefing = parseMarketBriefingBullets(formattedPreviewBriefing);
          const showAsBullets =
            parsedBriefing.isBulleted || parsedBriefing.items.length > 1;
          return (
            <PreviewEditableUnit
              as="section"
              testId="preview-market-briefing-section"
              unitId="nl-unit-briefing"
              label="시장 브리핑"
              isActive={activeUnitId === "nl-unit-briefing"}
              onActivate={onFocusEditorUnit}
              className="rounded-xl px-2.5 pt-2 pb-2 -mx-2.5"
            >
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-base font-medium text-slate-800 leading-relaxed">
                {showAsBullets ? (
                  <ul
                    data-testid="preview-market-briefing-bullets"
                    className="list-none m-0 p-0 space-y-2"
                  >
                    {parsedBriefing.items.map((item, bIdx) => (
                      <li key={bIdx} className="flex items-start gap-2">
                        <span
                          aria-hidden="true"
                          className="font-extrabold text-[#1D4ED8] shrink-0"
                        >
                          •
                        </span>
                        <span className="break-keep">{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="whitespace-pre-line break-keep">
                    {formattedPreviewBriefing.trim()}
                  </p>
                )}
              </div>
            </PreviewEditableUnit>
          );
        })()}

      {isSectionEnabled("news_curation") && unitIssues.length > 0 && (
        <section
          data-testid="preview-axios-postit-section"
          className="space-y-3"
        >
          <div className="space-y-4">
            {unitIssues.slice(0, 5).map((issue, idx) => {
              const chMeta =
                issue.channel && NEWS_CHANNEL_MAP[issue.channel as NewsChannelId]
                  ? NEWS_CHANNEL_MAP[issue.channel as NewsChannelId]
                  : NEWS_CHANNEL_MAP.real_estate;
              const copy = normalizeAxiosIssueCopy({
                title: issue.title,
                brief: issue.brief,
                channel: chMeta.id === "all" ? "real_estate" : chMeta.id,
              });
              const shortSource = formatShortIssueSource({
                sources: issue.sources,
                url: issue.url,
              });
              return (
                <PreviewEditableUnit
                  key={issue.id || idx}
                  unitId={`nl-unit-issue-${idx}`}
                  label={`${chMeta.shortLabel} 이슈 수정`}
                  isActive={activeUnitId === `nl-unit-issue-${idx}`}
                  onActivate={onFocusEditorUnit}
                  className="rounded-2xl"
                >
                  <ul className="list-none m-0 p-0">
                    <AxiosGlassIssueCard
                      index={idx}
                      tone={issue.memoTone}
                      title={copy.title || issue.title}
                      brief={copy.brief}
                      size="preview"
                      channelEmoji={chMeta.emoji}
                      channelLabel={
                        chMeta.shortLabel || NEWS_CHANNEL_MAP.real_estate.shortLabel
                      }
                      source={shortSource}
                      cardTestId={`preview-postit-card-${idx}`}
                      titleTestId={`preview-postit-title-${idx}`}
                      briefTestId={`preview-postit-brief-${idx}`}
                      titleAs="h4"
                    />
                  </ul>
                </PreviewEditableUnit>
              );
            })}
          </div>
        </section>
      )}

      {isSectionEnabled("featured_deals") && (
        <PreviewEditableUnit
          as="section"
          testId="preview-featured-deals-section"
          unitId="nl-unit-deals"
          label="추천 매물 고르기"
          isActive={activeUnitId === "nl-unit-deals"}
          onActivate={onFocusEditorUnit}
          className="rounded-xl space-y-3 px-2.5 pt-2 pb-2 -mx-2.5"
        >
          {selectedDeals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-medium text-slate-600">
              선택된 추천 매물이 아직 없습니다.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {selectedDeals.map((deal) => {
                const quadRegion =
                  (deal.areaSignal && deal.areaSignal.trim()) ||
                  (deal.address && deal.address !== "주소 미입력" ? deal.address : "서울 주요권역");
                const summary = resolveCanonicalDealSummary({
                  region: quadRegion,
                  assetType: deal.assetType,
                  explicitAreaLabel: deal.areaLabel,
                });
                const quadUse = summary.use;
                const quadArea = summary.areaLabel || "규모 상세확인";
                const quadPrice =
                  (deal.priceBand && deal.priceBand.trim()) ||
                  (deal.price && deal.price !== "-" ? deal.price : "가격 협의");
                return (
                  <li key={deal.id}>
                    <PreviewEditableUnit
                      unitId={`nl-unit-deal-${deal.id}`}
                      label={`${deal.title} 추천글`}
                      isActive={activeUnitId === `nl-unit-deal-${deal.id}`}
                      onActivate={onFocusEditorUnit}
                      className="overflow-hidden rounded-2xl border-2 border-amber-300 bg-white"
                    >
                      <div
                        data-testid={`preview-deal-blind-grid-${deal.id}`}
                        className="grid grid-cols-2 grid-rows-2 bg-[#0F172A] text-white"
                      >
                        <div className="flex items-center justify-center border-b border-r border-slate-400/25 px-3 py-2 text-center">
                          <span className="line-clamp-1 text-sm font-extrabold text-slate-50">
                            {quadRegion}
                          </span>
                        </div>
                        <div className="flex items-center justify-center border-b border-slate-400/25 px-3 py-2 text-center">
                          <span className="line-clamp-1 text-sm font-extrabold text-sky-400">
                            {quadUse}
                          </span>
                        </div>
                        <div className="flex items-center justify-center border-r border-slate-400/25 px-3 py-2 text-center">
                          <span className="line-clamp-1 text-sm font-extrabold text-slate-200">
                            {quadArea}
                          </span>
                        </div>
                        <div className="flex items-center justify-center px-3 py-2 text-center">
                          <span className="line-clamp-1 text-sm font-extrabold text-amber-400">
                            {quadPrice}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 bg-amber-50/90 px-3.5 py-2.5 border-t border-amber-200">
                        <p className="min-w-0 flex-1 line-clamp-1 text-sm font-extrabold text-slate-900">
                          {dealComments[deal.id]?.trim() ||
                            (deal.yield && deal.yield !== "-"
                              ? `연 수익률 ${deal.yield} · 핵심 상권 추천 매물`
                              : "핵심 상권 매물 · 딜카드에서 세부 특징 확인")}
                        </p>
                        <span className="shrink-0 rounded-lg bg-amber-500 px-2.5 py-1 text-sm font-extrabold text-slate-950">
                          {deal.hasIm === true ? "IM · 딜카드" : "딜카드 보기"}
                        </span>
                      </div>
                    </PreviewEditableUnit>
                  </li>
                );
              })}
            </ul>
          )}
        </PreviewEditableUnit>
      )}

      <PreviewEditableUnit
        as="section"
        testId="preview-broker-contact-section"
        unitId="nl-unit-broker"
        label="담당 중개사 정보"
        isActive={activeUnitId === "nl-unit-broker"}
        onActivate={onFocusEditorUnit}
        className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 space-y-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900">
                {brokerName.trim() || "담당 공인중개사"}
              </h3>
              <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-sm font-bold text-blue-900">
                문의 · 상담
              </span>
            </div>
            {brokerOffice.trim() && (
              <p className="text-sm font-bold text-slate-700">
                {brokerOffice.trim()}
              </p>
            )}
          </div>
          {brokerPhone.trim() && (
            <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-extrabold text-emerald-900">
              전화 {brokerPhone.trim()}
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-slate-600 leading-relaxed">
          추천 매물 상세 자료(IM) 열람이나 매수·임대·자산관리 상담이 필요하시면 언제든 편하게 문의해 주세요.
        </p>
      </PreviewEditableUnit>

      {previewLifecycle === "pre_generation" && (
        <div
          data-testid="preview-sample-framing-banner"
          className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-bold text-slate-700"
        >
          기본 예시 구성 · 제목을 입력하면 내 뉴스레터로 전환됩니다
        </div>
      )}
    </article>
  );
}

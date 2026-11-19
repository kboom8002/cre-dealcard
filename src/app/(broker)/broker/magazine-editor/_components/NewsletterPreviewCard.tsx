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
import { normalizeAxiosIssueCopy } from "@/domain/magazine/issue-clustering";
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

export interface NewsletterPreviewCardProps {
  previewLifecycle: PreviewLifecycleState;
  activeUnitId: string | null;
  onFocusEditorUnit: (unitId: string) => void;
  yearMonthLabel: string;
  marketTemp: MarketTemperature | null;
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
  marketTemp,
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
              {yearMonthLabel} 뉴스레터
            </span>
            {marketTemp && (
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
        formattedPreviewBriefing.trim().length > 0 && (
          <PreviewEditableUnit
            as="section"
            testId="preview-market-briefing-section"
            unitId="nl-unit-briefing"
            label="시장 브리핑"
            isActive={activeUnitId === "nl-unit-briefing"}
            onActivate={onFocusEditorUnit}
            className="rounded-xl px-2.5 pt-2 pb-2 -mx-2.5"
          >
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-base font-medium text-slate-800 whitespace-pre-line leading-relaxed">
              {formattedPreviewBriefing.trim()}
            </div>
          </PreviewEditableUnit>
        )}

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
              {selectedDeals.map((deal) => (
                <li key={deal.id}>
                  <PreviewEditableUnit
                    unitId={`nl-unit-deal-${deal.id}`}
                    label={`${deal.title} 추천글`}
                    isActive={activeUnitId === `nl-unit-deal-${deal.id}`}
                    onActivate={onFocusEditorUnit}
                    className="rounded-xl border border-slate-200 bg-white p-3.5 flex items-start gap-3"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                      {deal.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={deal.photoUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Building2 className="h-6 w-6 text-slate-500" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-base font-extrabold text-slate-900 truncate">
                        {deal.title}
                      </p>
                      <p className="text-sm font-medium text-slate-600">
                        {deal.address} · 매매가 {deal.price}
                      </p>
                      {dealComments[deal.id]?.trim() && (
                        <p className="text-sm font-bold text-blue-900 bg-blue-50 rounded-lg px-2.5 py-1.5">
                          {dealComments[deal.id]}
                        </p>
                      )}
                    </div>
                  </PreviewEditableUnit>
                </li>
              ))}
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

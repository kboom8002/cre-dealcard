"use client";

import React from "react";
import { ArrowLeft, ArrowRight, RotateCcw, Sparkles } from "lucide-react";
import { BlockSelectionGrid } from "@/components/magazine-editor/BlockSelectionGrid";
import {
  DealSlotAssigner,
  type AssignableDealItem,
} from "@/components/magazine-editor/DealSlotAssigner";
import { AxiosIssuesEditorPanel } from "@/components/magazine-editor/AxiosIssuesEditorPanel";
import { AiCommentRecommendButton } from "@/components/broker/studio/AiCommentRecommendButton";
import {
  MONTHLY_REGION_PRESETS,
  type MonthlyRegionKey,
} from "@/domain/magazine/monthly-stats-charts";
import {
  MONTHLY_GRAPHIC_PAIR_PRESETS,
  type MonthlyChartPairId,
} from "@/domain/magazine/monthly-stats-hydration";
import { normalizeMarketBriefingPlain } from "@/domain/magazine/issue-clustering";
import type {
  NewsChannelId,
  NewsPoolItem,
  SpecificNewsChannelId,
} from "@/domain/magazine/news-channels";
import type {
  AxiosUnitIssue,
  MonthlyRegionalChart,
} from "@/domain/magazine/types";
import type { NewsletterCadence } from "@/lib/magazine/newsletter-cadence";

export interface NewsletterContentStepPanelProps {
  cadence: NewsletterCadence;
  yearMonthLabel: string;
  regionFocus: string;
  headline: string;
  sections: { id: string; enabled: boolean }[];
  isSectionEnabled: (id: string) => boolean;
  onToggleSection: (sectionId: string, nextEnabled?: boolean) => void;
  monthlyRegion: MonthlyRegionKey;
  monthlyPairId: MonthlyChartPairId;
  monthlyCharts: MonthlyRegionalChart[];
  monthlyLiveDbAvailable: boolean;
  onChangeMonthlyRegion: (nextRegion: MonthlyRegionKey) => void;
  onChangeMonthlyPair: (nextPair: MonthlyChartPairId) => void;
  onUpdateMonthlyChartField: (
    chartIndex: number,
    patch: { highlightValue?: string; buyerImplication?: string },
  ) => void;
  onResetMonthlyCharts: () => void;
  statTuneOpen?: boolean;
  onToggleStatTune?: (next?: boolean) => void;
  briefingBody: string;
  onChangeBriefingBody: (val: string) => void;
  unitIssues: AxiosUnitIssue[];
  onChangeUnitIssues: (next: AxiosUnitIssue[]) => void;
  newsPool: NewsPoolItem[];
  preferredRegions: string[];
  preferredChannels: SpecificNewsChannelId[];
  deals: AssignableDealItem[];
  selectedDeals: AssignableDealItem[];
  selectedDealIds: string[];
  onToggleDeal: (dealId: string) => void;
  dealComments: Record<string, string>;
  onChangeDealComment: (dealId: string, comment: string) => void;
  isAiClustering: boolean;
  onAiClusterIssues: () => void;
  onRefreshLiveChannel: (channel: NewsChannelId) => Promise<void>;
  canUndoRecluster: boolean;
  onUndoRecluster: () => void;
  onOpenPreferences: () => void;
  onNotifyEditorFocus: (unitId: string) => void;
  onBackToTitle: () => void;
  onNextToSend: () => void;
}

export function NewsletterContentStepPanel({
  cadence,
  yearMonthLabel,
  regionFocus,
  headline,
  sections,
  isSectionEnabled,
  onToggleSection,
  monthlyRegion,
  monthlyPairId,
  monthlyCharts,
  monthlyLiveDbAvailable,
  onChangeMonthlyRegion,
  onChangeMonthlyPair,
  onUpdateMonthlyChartField,
  onResetMonthlyCharts,
  statTuneOpen,
  onToggleStatTune,
  briefingBody,
  onChangeBriefingBody,
  unitIssues,
  onChangeUnitIssues,
  newsPool,
  preferredRegions,
  preferredChannels,
  deals,
  selectedDeals,
  selectedDealIds,
  onToggleDeal,
  dealComments,
  onChangeDealComment,
  isAiClustering,
  onAiClusterIssues,
  onRefreshLiveChannel,
  canUndoRecluster,
  onUndoRecluster,
  onOpenPreferences,
  onNotifyEditorFocus,
  onBackToTitle,
  onNextToSend,
}: NewsletterContentStepPanelProps) {
  const [localStatTuneOpen, setLocalStatTuneOpen] = React.useState<boolean>(() =>
    monthlyCharts.some((c) => c.sourceMode === "broker_custom"),
  );
  const isStatTuneOpen =
    statTuneOpen !== undefined ? statTuneOpen : localStatTuneOpen;
  const handleToggleStatTune = () => {
    const next = !isStatTuneOpen;
    if (onToggleStatTune) onToggleStatTune(next);
    else setLocalStatTuneOpen(next);
  };

  return (
    <div
      id="newsletter-panel-content"
      role="tabpanel"
      aria-labelledby="newsletter-tab-content"
      className="space-y-5"
    >
      <BlockSelectionGrid
        sections={sections}
        onToggleSection={onToggleSection}
        cadence={cadence}
      />

      {cadence === "monthly" && isSectionEnabled("market_data") && (
        <section
          data-testid="monthly-stats-authoring-card"
          aria-label="월간 상단 주요 통계 그래픽 2선 설정"
          className="rounded-2xl border border-blue-200 bg-white p-5 text-slate-900 shadow-2xs space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-slate-900">
                월간 상단 주요 통계 그래픽 2선
              </h3>
              <p className="text-sm font-medium text-slate-600">
                월간 뉴스레터 맨 위에 카드뉴스형 막대 그래픽 2개가 표시됩니다. 권역과 지표 구성을 고르거나 수치를 직접 다듬을 수 있습니다.
              </p>
            </div>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-extrabold text-blue-900">
              {monthlyCharts.some((c) => c.sourceMode === "broker_custom")
                ? "중개사 직접 입력"
                : monthlyLiveDbAvailable ||
                    monthlyCharts.some((c) => c.sourceMode === "public_db")
                  ? "공공 DB 실측 집계"
                  : "시장 기준 참고치"}
            </span>
          </div>

          <div
            className="space-y-2"
            onFocusCapture={() => onNotifyEditorFocus("nl-unit-stats-0")}
          >
            <p className="text-sm font-extrabold text-slate-800">
              기준 권역 선택
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="월간 통계 권역 선택">
              {MONTHLY_REGION_PRESETS.map((preset) => {
                const selected = monthlyRegion === preset.key;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    data-testid={`monthly-stat-region-${preset.key}`}
                    aria-pressed={selected}
                    onClick={() => onChangeMonthlyRegion(preset.key)}
                    className={`min-h-[44px] rounded-xl border px-3.5 py-2 text-sm font-extrabold transition ${
                      selected
                        ? "border-blue-500 bg-blue-50/90 text-blue-950 shadow-2xs"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {preset.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="space-y-2"
            onFocusCapture={() => onNotifyEditorFocus("nl-unit-stats-0")}
          >
            <p className="text-sm font-extrabold text-slate-800">
              상단 그래픽 2선 조합 선택
            </p>
            <div className="grid grid-cols-1 gap-2.5" role="group" aria-label="통계 그래픽 2선 조합">
              {MONTHLY_GRAPHIC_PAIR_PRESETS.map((pairPreset) => {
                const selected = monthlyPairId === pairPreset.id;
                return (
                  <button
                    key={pairPreset.id}
                    type="button"
                    data-testid={`monthly-stat-pair-${pairPreset.id}`}
                    aria-pressed={selected}
                    onClick={() => onChangeMonthlyPair(pairPreset.id)}
                    className={`min-h-[48px] w-full rounded-xl border p-3.5 text-left transition whitespace-normal ${
                      selected
                        ? "border-blue-600 bg-blue-50 text-blue-950"
                        : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-extrabold break-keep">{pairPreset.shortLabel}</span>
                      <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-sm font-bold text-slate-700">
                        {pairPreset.badge}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-extrabold text-slate-800">
                대표 수치 · 매수자 체크포인트 다듬기 (선택)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {monthlyCharts.some((c) => c.sourceMode === "broker_custom") && (
                  <button
                    type="button"
                    data-testid="monthly-stat-reset-btn"
                    onClick={onResetMonthlyCharts}
                    className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>기준치 복원</span>
                  </button>
                )}
                <button
                  type="button"
                  data-testid="monthly-stat-tune-toggle"
                  aria-expanded={isStatTuneOpen}
                  onClick={handleToggleStatTune}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
                >
                  <span>{isStatTuneOpen ? "직접 다듬기 접기" : "대표 수치·해설 직접 다듬기"}</span>
                </button>
              </div>
            </div>

            {isStatTuneOpen && (
              <div className="grid grid-cols-1 gap-3">
                {monthlyCharts.slice(0, 2).map((chart, idx) => (
                  <div
                    key={chart.id || idx}
                    onFocusCapture={() => onNotifyEditorFocus(`nl-unit-stats-${idx}`)}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5"
                  >
                    <p className="text-sm font-extrabold text-slate-900">
                      그래픽 0{idx + 1} · {chart.title}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="space-y-1">
                        <label
                          htmlFor={`monthly-stat-val-${idx}`}
                          className="block text-sm font-bold text-slate-700"
                        >
                          대표 수치 강조
                        </label>
                        <input
                          id={`monthly-stat-val-${idx}`}
                          data-testid={`monthly-stat-highlight-input-${idx}`}
                          type="text"
                          value={chart.highlightMetric?.value ?? ""}
                          onChange={(e) =>
                            onUpdateMonthlyChartField(idx, {
                              highlightValue: e.target.value,
                            })
                          }
                          className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-base font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
                        />
                      </div>
                      <div className="sm:col-span-2 space-y-1">
                        <label
                          htmlFor={`monthly-stat-imp-${idx}`}
                          className="block text-sm font-bold text-slate-700"
                        >
                          매수자 체크포인트 한 줄 해설
                        </label>
                        <input
                          id={`monthly-stat-imp-${idx}`}
                          data-testid={`monthly-stat-implication-input-${idx}`}
                          type="text"
                          value={chart.buyerImplication ?? ""}
                          onChange={(e) =>
                            onUpdateMonthlyChartField(idx, {
                              buyerImplication: e.target.value,
                            })
                          }
                          className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-base font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {!isSectionEnabled("field_note") && (
        <div
          data-testid="briefing-section-disabled-notice"
          role="status"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950 flex flex-wrap items-center justify-between gap-3"
        >
          <span>
            현재 &apos;시장 브리핑&apos; 코너가 꺼져 있어 발행본에 표시되지 않습니다.
          </span>
          <button
            type="button"
            data-testid="enable-briefing-section-btn"
            onClick={() => onToggleSection("field_note", true)}
            className="min-h-[44px] rounded-xl border border-amber-400 bg-white px-3.5 py-2 text-sm font-extrabold text-amber-950 hover:bg-amber-100"
          >
            코너 켜기
          </button>
        </div>
      )}

      <section
        data-testid="market-briefing-editor"
        aria-label="시장 브리핑 작성"
        onFocusCapture={() => onNotifyEditorFocus("nl-unit-briefing")}
        className={`rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xs space-y-4 ${
          !isSectionEnabled("field_note") ? "opacity-75" : ""
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-700" aria-hidden="true" />
              <h3 className="text-base font-extrabold text-slate-900">
                시장 브리핑
              </h3>
            </div>
            <p className="text-sm text-slate-600">
              {isSectionEnabled("field_note")
                ? "1~3줄만 간단히 적고 [AI로 5줄 윤문하기]를 누르면 매수자·건물주도 한눈에 읽기 쉽게 다듬어 드립니다."
                : "코너가 꺼져 있어 입력칸을 접어 두었습니다. 위 [코너 켜기]를 누르면 바로 작성할 수 있습니다."}
            </p>
          </div>
          <div
            className={
              isSectionEnabled("field_note")
                ? "flex flex-wrap items-center gap-2"
                : "hidden"
            }
          >
            <AiCommentRecommendButton
              mode="market_briefing"
              cadence={cadence}
              testId="ai-polish-briefing-btn"
              currentValue={briefingBody}
              fallbackContext={
                [
                  yearMonthLabel,
                  regionFocus,
                  headline,
                  ...unitIssues.slice(0, 3).map((u) => u.title),
                ]
                  .filter(Boolean)
                  .join(" / ") || "이번 호 상업용 빌딩 시장 분위기"
              }
              onChangeValue={(next) => {
                const clean = normalizeMarketBriefingPlain(next, 500, 5);
                onChangeBriefingBody(clean);
              }}
              label="AI로 5줄 윤문하기"
            />
          </div>
        </div>

        <div
          data-testid="market-briefing-editor-body"
          className={isSectionEnabled("field_note") ? "space-y-2" : "hidden"}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="newsletter-briefing-body"
              className="block text-sm font-extrabold text-slate-800"
            >
              브리핑 내용 (5줄 · 500자 이내)
            </label>
            <span
              data-testid="briefing-length-counter"
              className={`text-sm font-bold ${
                Array.from(briefingBody).length > 500 ||
                briefingBody.split(/\r?\n/).filter((l) => l.trim()).length > 5
                  ? "text-rose-700"
                  : "text-slate-600"
              }`}
            >
              {Array.from(briefingBody).length}/500자 ·{" "}
              {briefingBody.trim()
                ? briefingBody.split(/\r?\n/).filter((l) => l.trim()).length
                : 0}
              /5줄
            </span>
          </div>

          <textarea
            id="newsletter-briefing-body"
            rows={5}
            maxLength={500}
            value={briefingBody}
            onChange={(e) => onChangeBriefingBody(e.target.value)}
            onBlur={() => {
              const clean = normalizeMarketBriefingPlain(briefingBody, 500, 5);
              if (clean !== briefingBody) {
                onChangeBriefingBody(clean);
              }
            }}
            placeholder={
              "예) 이번 주 강남 꼬마빌딩은 금리 안정 기대감으로 문의가 늘고 있습니다.\n급매물 위주로 현장 답사가 활발하니 조건 좋은 매물은 서둘러 살펴보시길 권합니다."
            }
            className="w-full rounded-xl border border-slate-300 bg-white p-4 text-base font-medium leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none resize-y"
          />
        </div>
      </section>

      {isSectionEnabled("news_curation") && (
        <div
          onFocusCapture={(e) => {
            const target = e.target as HTMLElement | null;
            const cardEl = target?.closest("[data-testid^='axios-issue-card-editor-']");
            const testId = cardEl?.getAttribute("data-testid") ?? "";
            const idxStr = testId.replace("axios-issue-card-editor-", "");
            if (idxStr !== "") {
              onNotifyEditorFocus(`nl-unit-issue-${idxStr}`);
            }
          }}
        >
          <AxiosIssuesEditorPanel
            unitIssues={unitIssues}
            onChangeUnitIssues={onChangeUnitIssues}
            newsPool={newsPool}
            cadenceLabel={yearMonthLabel}
            preferredRegions={preferredRegions}
            preferredChannels={preferredChannels}
            dealTitles={selectedDeals.map((d) => `${d.title} ${d.address}`)}
            onAiClusterIssues={onAiClusterIssues}
            isAiClustering={isAiClustering}
            onRefreshLiveChannel={onRefreshLiveChannel}
            canUndoRecluster={canUndoRecluster}
            onUndoRecluster={onUndoRecluster}
            onOpenPreferences={onOpenPreferences}
          />
        </div>
      )}

      <div
        onFocusCapture={(e) => {
          const target = e.target as HTMLElement | null;
          const itemEl = target?.closest("[data-testid^='deal-slot-item-']");
          const testId = itemEl?.getAttribute("data-testid") ?? "";
          const dealId = testId.replace("deal-slot-item-", "");
          if (dealId) {
            onNotifyEditorFocus(`nl-unit-deal-${dealId}`);
          } else {
            onNotifyEditorFocus("nl-unit-deals");
          }
        }}
      >
        <DealSlotAssigner
          deals={deals}
          selectedDealIds={selectedDealIds}
          onToggleDeal={onToggleDeal}
          dealComments={dealComments}
          onChangeDealComment={onChangeDealComment}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToTitle}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-bold text-slate-800 hover:bg-slate-50"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          <span>이전: ① 제목</span>
        </button>
        <button
          type="button"
          data-testid="next-to-send-btn"
          onClick={onNextToSend}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#1D1D1F] px-5 py-3 text-base font-extrabold text-white transition hover:bg-[#2C2C2E]"
        >
          <span>다음: ③ 보내기</span>
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

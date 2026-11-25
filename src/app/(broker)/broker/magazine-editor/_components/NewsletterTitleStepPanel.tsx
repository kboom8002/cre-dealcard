"use client";

import React from "react";
import { ArrowRight } from "lucide-react";
import {
  IssueMetadataForm,
  type AutoIssueMetadata,
} from "@/components/magazine-editor/IssueMetadataForm";
import {
  MagazineQuickDraftCard,
  type MagazineDraftSnapshot,
} from "@/components/broker/studio/MagazineQuickDraftCard";
import type { SpecificNewsChannelId } from "@/domain/magazine/news-channels";
import type { MarketTemperature } from "@/domain/magazine/types";
import type { NewsletterCadence } from "@/lib/magazine/newsletter-cadence";
import { BrokerPreferencesSection } from "./BrokerPreferencesSection";

export interface NewsletterTitleStepPanelProps {
  issueYear: number;
  issueMonth: number;
  cadence: NewsletterCadence;
  issueDateStr: string;
  yearMonthLabel: string;
  brokerName: string;
  headline: string;
  summary: string;
  briefingTitle: string;
  briefingBody: string;
  marketTemp: MarketTemperature | null;
  regionFocus: string;
  onChangeRegionFocus: (next: string) => void;
  preferredRegions: string[];
  preferredChannels: SpecificNewsChannelId[];
  selectedDealTitles: string[];
  unitIssueTitles: string[];
  selectedDealSummaries?: string[];
  unitIssueEvidence?: string[];
  monthlyStatsSummary?: string;
  isPrefsOpen: boolean;
  onTogglePrefsOpen: () => void;
  canUndoRecluster: boolean;
  onUndoRecluster: () => void;
  savingPrefs: boolean;
  isAiClustering: boolean;
  onSavePreferencesAndCluster: () => void;
  onTogglePreferredRegion: (regionLabel: string) => void;
  onTogglePreferredChannel: (channelId: SpecificNewsChannelId) => void;
  onChangeCadence: (next: NewsletterCadence) => void;
  onChangeIssueDate: (nextDate: string) => void;
  onChangeYearMonth: (meta: AutoIssueMetadata) => void;
  onChangeHeadline: (val: string) => void;
  onChangeMarketTemp: (nextTemp: MarketTemperature | null) => void;
  onApplyDraft: (next: MagazineDraftSnapshot) => void;
  onNotifyEditorFocus: (unitId: string) => void;
  onNextToContent: () => void;
}

export function NewsletterTitleStepPanel({
  issueYear,
  issueMonth,
  cadence,
  issueDateStr,
  yearMonthLabel,
  brokerName,
  headline,
  summary,
  briefingTitle,
  briefingBody,
  marketTemp,
  regionFocus,
  onChangeRegionFocus,
  preferredRegions,
  preferredChannels,
  selectedDealTitles,
  unitIssueTitles,
  selectedDealSummaries,
  unitIssueEvidence,
  monthlyStatsSummary,
  isPrefsOpen,
  onTogglePrefsOpen,
  canUndoRecluster,
  onUndoRecluster,
  savingPrefs,
  isAiClustering,
  onSavePreferencesAndCluster,
  onTogglePreferredRegion,
  onTogglePreferredChannel,
  onChangeCadence,
  onChangeIssueDate,
  onChangeYearMonth,
  onChangeHeadline,
  onChangeMarketTemp,
  onApplyDraft,
  onNotifyEditorFocus,
  onNextToContent,
}: NewsletterTitleStepPanelProps) {
  return (
    <div
      id="newsletter-panel-title"
      role="tabpanel"
      aria-labelledby="newsletter-tab-title"
      className="space-y-4"
    >
      <div
        onFocusCapture={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.id === "newsletter-headline-input") {
            onNotifyEditorFocus("nl-unit-cover");
          } else {
            onNotifyEditorFocus("nl-unit-issue-meta");
          }
        }}
      >
        <IssueMetadataForm
          year={issueYear}
          month={issueMonth}
          cadence={cadence}
          onChangeCadence={onChangeCadence}
          issueDate={issueDateStr}
          onChangeIssueDate={onChangeIssueDate}
          brokerName={brokerName}
          onChangeYearMonth={onChangeYearMonth}
          headline={headline}
          onChangeHeadline={onChangeHeadline}
          marketTemp={marketTemp}
          onChangeMarketTemp={onChangeMarketTemp}
        />
      </div>

      <div onFocusCapture={() => onNotifyEditorFocus("nl-unit-ai-draft")}>
        <MagazineQuickDraftCard
          monthLabel={yearMonthLabel}
          cadence={cadence}
          regionFocus={regionFocus}
          onChangeRegionFocus={onChangeRegionFocus}
          preferredRegions={preferredRegions}
          preferredChannels={preferredChannels}
          dealTitles={selectedDealTitles}
          newsTitles={unitIssueTitles}
          dealSummaries={selectedDealSummaries}
          newsEvidence={unitIssueEvidence}
          monthlyStatsSummary={monthlyStatsSummary}
          currentDraft={{
            headline,
            summary,
            briefingTitle,
            briefingBody,
          }}
          onApplyDraft={onApplyDraft}
        />
      </div>

      <BrokerPreferencesSection
        preferredRegions={preferredRegions}
        preferredChannels={preferredChannels}
        isPrefsOpen={isPrefsOpen}
        onTogglePrefsOpen={onTogglePrefsOpen}
        canUndoRecluster={canUndoRecluster}
        onUndoRecluster={onUndoRecluster}
        savingPrefs={savingPrefs}
        isAiClustering={isAiClustering}
        onSavePreferencesAndCluster={onSavePreferencesAndCluster}
        onTogglePreferredRegion={onTogglePreferredRegion}
        onTogglePreferredChannel={onTogglePreferredChannel}
      />

      <div className="flex justify-end">
        <button
          type="button"
          data-testid="next-to-content-btn"
          onClick={onNextToContent}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#1D1D1F] px-5 py-3 text-base font-extrabold text-white transition hover:bg-[#2C2C2E]"
        >
          <span>다음: 내용 작성하기</span>
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

"use client";

import React from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import { BROKER_REGION_PRESETS } from "@/domain/magazine/broker-preferences";
import {
  SPECIFIC_NEWS_CHANNELS,
  type SpecificNewsChannelId,
} from "@/domain/magazine/news-channels";

export interface BrokerPreferencesSectionProps {
  preferredRegions: string[];
  preferredChannels: SpecificNewsChannelId[];
  isPrefsOpen: boolean;
  onTogglePrefsOpen: () => void;
  canUndoRecluster: boolean;
  onUndoRecluster: () => void;
  savingPrefs: boolean;
  isAiClustering: boolean;
  onSavePreferencesAndCluster: () => void;
  onTogglePreferredRegion: (regionLabel: string) => void;
  onTogglePreferredChannel: (channelId: SpecificNewsChannelId) => void;
}

export function BrokerPreferencesSection({
  preferredRegions,
  preferredChannels,
  isPrefsOpen,
  onTogglePrefsOpen,
  canUndoRecluster,
  onUndoRecluster,
  savingPrefs,
  isAiClustering,
  onSavePreferencesAndCluster,
  onTogglePreferredRegion,
  onTogglePreferredChannel,
}: BrokerPreferencesSectionProps) {
  const preferredRegionsSummary =
    preferredRegions.length === 0
      ? "미선택"
      : preferredRegions.length <= 2
        ? preferredRegions.join(" · ")
        : `${preferredRegions.slice(0, 2).join(" · ")} 외 ${preferredRegions.length - 2}곳`;

  return (
    <section
      data-testid="broker-newsletter-preferences-card"
      aria-label="내 주력 권역 및 맞춤 뉴스 분야 설정"
      className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-900 shadow-2xs space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-extrabold text-slate-900 break-keep">
          맞춤 상권·분야: {preferredRegionsSummary} · {preferredChannels.length}개 분야
        </p>
        <button
          type="button"
          data-testid="toggle-broker-prefs-btn"
          aria-expanded={isPrefsOpen}
          onClick={onTogglePrefsOpen}
          className="min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-extrabold text-slate-800 hover:bg-slate-100 transition cursor-pointer shrink-0"
        >
          {isPrefsOpen ? "접기 ▴" : "설정 바꾸기 ▾"}
        </button>
      </div>

      <div className={isPrefsOpen ? "space-y-4 pt-3 border-t border-slate-200" : "hidden"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm font-medium text-slate-600">
            선택한 권역과 관심 분야를 바탕으로 맞춤형 핵심 이슈 5선과 초안을 구성합니다.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {canUndoRecluster && (
              <button
                type="button"
                data-testid="prefs-undo-recluster-btn"
                onClick={onUndoRecluster}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-sm font-extrabold text-amber-950 hover:bg-amber-100"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span>이전 이슈 복원</span>
              </button>
            )}
            <button
              type="button"
              data-testid="save-broker-prefs-btn"
              disabled={savingPrefs || isAiClustering}
              onClick={onSavePreferencesAndCluster}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-extrabold text-blue-900 hover:bg-blue-100 disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4 text-blue-700" aria-hidden="true" />
              <span>
                {savingPrefs || isAiClustering
                  ? "맞춤 설정 반영 중…"
                  : "내 설정 저장 · 맞춤 이슈 갱신"}
              </span>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-extrabold text-slate-800">
            주력 상권 · 권역 선택 (복수 선택 가능)
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="주력 권역 선택">
            {BROKER_REGION_PRESETS.map((preset) => {
              const active = preferredRegions.includes(preset.label);
              return (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`pref-region-chip-${preset.id}`}
                  data-active-pill={active ? "true" : undefined}
                  aria-pressed={active}
                  onClick={() => onTogglePreferredRegion(preset.label)}
                  className={`min-h-[44px] rounded-xl border px-3.5 py-2 text-sm font-extrabold transition ${
                    active
                      ? "border-blue-500 bg-blue-50/90 text-blue-950 shadow-2xs"
                      : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  <span>{preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-extrabold text-slate-800">
            관심 분야 맞춤 뉴스 선택 (복수 선택 가능)
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="맞춤 뉴스 분야 선택">
            {SPECIFIC_NEWS_CHANNELS.map((ch) => {
              const active = preferredChannels.includes(ch.id);
              return (
                <button
                  key={ch.id}
                  type="button"
                  data-testid={`pref-channel-chip-${ch.id}`}
                  data-active-pill={active ? "true" : undefined}
                  aria-pressed={active}
                  onClick={() => onTogglePreferredChannel(ch.id)}
                  style={{
                    backgroundColor: active ? "#1D4ED8" : "#F8FAFC",
                    borderColor: active ? "#1E40AF" : "#CBD5E1",
                    color: active ? "#FFFFFF" : "#1E293B",
                  }}
                  className={`min-h-[44px] rounded-xl border px-3.5 py-2 text-sm font-extrabold transition flex items-center gap-1.5 ${
                    active
                      ? "border-blue-700 bg-blue-700 text-white shadow-xs"
                      : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  <span aria-hidden="true">{ch.emoji}</span>
                  <span style={{ color: active ? "#FFFFFF" : "#1E293B" }}>
                    {ch.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

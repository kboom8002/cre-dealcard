"use client";

import React from "react";
import { Calendar, FileText } from "lucide-react";
import type { MarketTemperature } from "@/domain/magazine/types";
import { MARKET_TEMP_CONFIG } from "@/domain/magazine/types";
import { formatSingleLineTitle } from "@/domain/magazine/issue-clustering";

export interface AutoIssueMetadata {
  year: number;
  month: number;
  yearMonthLabel: string;
  slug: string;
  issueNumber: number;
}

/**
 * NL-14: 발행 호수와 주소 이름 입력칸을 기본 화면에서 숨기고,
 * 선택한 연·월(예: 2026년 11월)로부터 자동 생성한다.
 */
export function deriveAutoIssueMeta(
  year: number,
  month: number,
  baseYear = 2024,
): AutoIssueMetadata {
  const safeYear = Number.isFinite(year) && year >= 2020 ? Math.floor(year) : 2026;
  const safeMonth = Number.isFinite(month) ? Math.max(1, Math.min(12, Math.floor(month))) : 11;
  const mm = String(safeMonth).padStart(2, "0");
  const slug = `${safeYear}-${mm}`;
  const yearMonthLabel = `${safeYear}년 ${safeMonth}월호`;
  const issueNumber = Math.max(1, (safeYear - baseYear) * 12 + safeMonth);
  return {
    year: safeYear,
    month: safeMonth,
    yearMonthLabel,
    slug,
    issueNumber,
  };
}

export function parseYearMonthFromSlug(
  editionLabel?: string | null,
  fallbackDate: Date = new Date("2026-11-08T00:00:00+09:00"),
): { year: number; month: number } {
  if (typeof editionLabel === "string") {
    const match = editionLabel.trim().match(/^(\d{4})-(\d{2})/);
    if (match) {
      return {
        year: Number(match[1]),
        month: Math.max(1, Math.min(12, Number(match[2]))),
      };
    }
  }
  return {
    year: fallbackDate.getFullYear(),
    month: fallbackDate.getMonth() + 1,
  };
}

export interface IssueMetadataFormProps {
  year?: number;
  month?: number;
  onChangeYearMonth?: (meta: AutoIssueMetadata) => void;
  headline: string;
  onChangeHeadline: (value: string) => void;
  summary: string;
  onChangeSummary: (value: string) => void;
  marketTemp?: MarketTemperature | null;
  onChangeMarketTemp?: (value: MarketTemperature | null) => void;
}

const YEAR_OPTIONS = [2025, 2026, 2027] as const;
const MONTH_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const MARKET_TEMP_LIST: readonly MarketTemperature[] = [
  "적극 매수",
  "선별 매수",
  "관망",
  "조정 대기",
  "위기 경계",
] as const;

export function IssueMetadataForm({
  year = 2026,
  month = 11,
  onChangeYearMonth,
  headline,
  onChangeHeadline,
  summary,
  onChangeSummary,
  marketTemp = null,
  onChangeMarketTemp,
}: IssueMetadataFormProps) {
  const autoMeta = deriveAutoIssueMeta(year, month);
  const headlineTooLong = headline.trim().length > 36;
  const summaryTooLong = summary.trim().length > 80;

  const handleYearChange = (nextYear: number) => {
    const nextMeta = deriveAutoIssueMeta(nextYear, month);
    onChangeYearMonth?.(nextMeta);
  };

  const handleMonthChange = (nextMonth: number) => {
    const nextMeta = deriveAutoIssueMeta(year, nextMonth);
    onChangeYearMonth?.(nextMeta);
  };

  return (
    <section
      data-testid="issue-metadata-form"
      aria-label="뉴스레터 표지 기본 정보"
      className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xs space-y-5"
    >
      {/* 1. 연·월 선택 (발행 호수·주소 자동 생성, 입력칸 미노출) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-700" aria-hidden="true" />
            <span className="text-base font-extrabold text-slate-900">발행 연·월 선택</span>
          </div>
          <span
            data-testid="auto-issue-badge"
            className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-bold text-blue-900"
          >
            {autoMeta.yearMonthLabel} · 제{autoMeta.issueNumber}호 자동 지정
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="newsletter-issue-year"
              className="block text-sm font-bold text-slate-700 mb-1"
            >
              발행 연도
            </label>
            <select
              id="newsletter-issue-year"
              value={autoMeta.year}
              onChange={(e) => handleYearChange(Number(e.target.value))}
              className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base font-bold text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="newsletter-issue-month"
              className="block text-sm font-bold text-slate-700 mb-1"
            >
              발행 월
            </label>
            <select
              id="newsletter-issue-month"
              value={autoMeta.month}
              onChange={(e) => handleMonthChange(Number(e.target.value))}
              className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base font-bold text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 2. 표지 제목 */}
      <div className="space-y-2">
        <label
          htmlFor="newsletter-headline-input"
          className="flex items-center gap-2 text-base font-extrabold text-slate-900"
        >
          <FileText className="h-5 w-5 text-blue-700" aria-hidden="true" />
          <span>표지 제목</span>
        </label>
        <input
          id="newsletter-headline-input"
          type="text"
          value={headline}
          onChange={(e) => onChangeHeadline(formatSingleLineTitle(e.target.value, 80))}
          placeholder="예: 금리 인하 기대감 속 강남 중소형 빌딩 매수 흐름"
          className="w-full min-h-[48px] whitespace-nowrap overflow-hidden text-ellipsis rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-bold text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        {headlineTooLong && (
          <p
            role="status"
            data-testid="headline-length-hint"
            className="text-sm font-bold text-amber-800"
          >
            제목이 길어요 – 한 줄에 들어오도록 줄여 주세요
          </p>
        )}
      </div>

      {/* 3. 한 줄 소개 */}
      <div className="space-y-2">
        <label
          htmlFor="newsletter-summary-input"
          className="block text-base font-extrabold text-slate-900"
        >
          한 줄 소개
        </label>
        <textarea
          id="newsletter-summary-input"
          rows={2}
          value={summary}
          onChange={(e) => onChangeSummary(e.target.value)}
          placeholder="예: 이번 달 고객님께 꼭 전해드리고 싶은 시장 분위기와 추천 매물을 담았습니다."
          className="w-full rounded-xl border border-slate-300 bg-white p-3.5 text-base font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-y"
        />
        {summaryTooLong && (
          <p
            role="status"
            data-testid="summary-length-hint"
            className="text-sm font-bold text-amber-800"
          >
            한 줄 소개가 조금 길어요 – 핵심만 짧게 줄여 주세요
          </p>
        )}
      </div>

      {/* 4. 시장 분위기 배지 선택 (선택 사항) */}
      {onChangeMarketTemp && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-extrabold text-slate-800">
              이번 달 시장 분위기 (선택 사항)
            </span>
            {marketTemp && (
              <button
                type="button"
                onClick={() => onChangeMarketTemp(null)}
                className="min-h-[48px] rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                선택 해제
              </button>
            )}
          </div>
          <div
            role="group"
            aria-label="이번 달 시장 분위기 선택"
            className="grid grid-cols-2 sm:grid-cols-5 gap-2"
          >
            {MARKET_TEMP_LIST.map((temp) => {
              const cfg = MARKET_TEMP_CONFIG[temp];
              const isSelected = marketTemp === temp;
              return (
                <button
                  key={temp}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onChangeMarketTemp(isSelected ? null : temp)}
                  className={`min-h-[48px] rounded-xl border px-3 py-2 text-sm font-extrabold transition-all flex items-center justify-center gap-1.5 ${
                    isSelected
                      ? "border-blue-600 bg-blue-50 text-blue-950 shadow-2xs"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span aria-hidden="true">{cfg.emoji}</span>
                  <span>{temp}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

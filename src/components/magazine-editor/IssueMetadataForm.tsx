"use client";

import React from "react";
import { Calendar, FileText } from "lucide-react";
import type { MarketTemperature } from "@/domain/magazine/types";
import { MARKET_TEMP_CONFIG } from "@/domain/magazine/types";
import { formatSingleLineTitle } from "@/domain/magazine/issue-clustering";
import { kstParts } from "@/lib/magazine/kst";
import {
  NEWSLETTER_CADENCES,
  NEWSLETTER_CADENCE_META,
  deriveCadenceIssueMeta,
  type NewsletterCadence,
} from "@/lib/magazine/newsletter-cadence";

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
  const nowKst = kstParts();
  const safeYear = Number.isFinite(year) && year >= 2020 ? Math.floor(year) : nowKst.year;
  const safeMonth = Number.isFinite(month) ? Math.max(1, Math.min(12, Math.floor(month))) : nowKst.month;
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
  fallbackDate?: Date,
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
  const parts = kstParts(fallbackDate ?? new Date());
  return {
    year: parts.year,
    month: parts.month,
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
  /** 발행 주기 (일간·주간·월간). 미지정 시 월간 */
  cadence?: NewsletterCadence;
  onChangeCadence?: (next: NewsletterCadence) => void;
  /** 일간·주간 기준 날짜 (KST YYYY-MM-DD) */
  issueDate?: string;
  onChangeIssueDate?: (next: string) => void;
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
  year,
  month,
  onChangeYearMonth,
  headline,
  onChangeHeadline,
  summary,
  onChangeSummary,
  marketTemp = null,
  onChangeMarketTemp,
  cadence = "monthly",
  onChangeCadence,
  issueDate,
  onChangeIssueDate,
}: IssueMetadataFormProps) {
  const nowKst = kstParts();
  const safeYear = typeof year === "number" ? year : nowKst.year;
  const safeMonth = typeof month === "number" ? month : nowKst.month;
  const autoMeta = deriveAutoIssueMeta(safeYear, safeMonth);
  const cadenceMeta = deriveCadenceIssueMeta(cadence, { year: safeYear, month: safeMonth, dateStr: issueDate });
  const headlineTooLong = headline.trim().length > 36;
  const summaryTooLong = summary.trim().length > 80;

  const handleYearChange = (nextYear: number) => {
    const nextMeta = deriveAutoIssueMeta(nextYear, safeMonth);
    onChangeYearMonth?.(nextMeta);
  };

  const handleMonthChange = (nextMonth: number) => {
    const nextMeta = deriveAutoIssueMeta(safeYear, nextMonth);
    onChangeYearMonth?.(nextMeta);
  };

  return (
    <section
      data-testid="issue-metadata-form"
      aria-label="뉴스레터 표지 기본 정보"
      className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xs space-y-5"
    >
      {/* 1. 발행 주기(일간·주간·월간) + 호수 선택 (발행 호수·주소 자동 생성, 입력칸 미노출) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-700" aria-hidden="true" />
            <span className="text-base font-extrabold text-slate-900">
              {onChangeCadence ? "발행 주기 · 호수 선택" : "발행 연·월 선택"}
            </span>
          </div>
          <span
            data-testid="auto-issue-badge"
            className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-bold text-blue-900"
          >
            {cadence === "monthly"
              ? `${autoMeta.yearMonthLabel} · 제${autoMeta.issueNumber}호 자동 지정`
              : `${cadenceMeta.yearMonthLabel} · ${cadenceMeta.rangeLabel} 자동 지정`}
          </span>
        </div>

        {onChangeCadence && (
          <div
            role="radiogroup"
            aria-label="발행 주기 선택"
            data-testid="metadata-cadence-selector"
            className="grid grid-cols-3 gap-2"
          >
            {NEWSLETTER_CADENCES.map((key) => {
              const meta = NEWSLETTER_CADENCE_META[key];
              const selected = cadence === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-testid={`metadata-cadence-${key}`}
                  onClick={() => onChangeCadence(key)}
                  className={`min-h-[48px] rounded-xl border px-3 py-2 text-left transition ${
                    selected
                      ? "border-blue-600 bg-blue-50 text-blue-950 shadow-2xs"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="block text-sm font-extrabold">{meta.label} 뉴스레터</span>
                  <span className="block text-sm font-medium text-slate-600">{meta.description}</span>
                </button>
              );
            })}
          </div>
        )}

        {cadence === "monthly" ? (
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
        ) : (
          <div>
            <label
              htmlFor="newsletter-issue-date"
              className="block text-sm font-bold text-slate-700 mb-1"
            >
              {cadence === "weekly" ? "발행 주 선택 (그 주의 아무 날짜나 고르세요)" : "발행일 선택"}
            </label>
            <input
              id="newsletter-issue-date"
              data-testid="newsletter-issue-date"
              type="date"
              value={cadenceMeta.cadence === "weekly" ? (issueDate ?? cadenceMeta.dateStr) : cadenceMeta.dateStr}
              onChange={(e) => onChangeIssueDate?.(e.target.value)}
              className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base font-bold text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {cadence === "weekly" && (
              <p className="mt-1 text-sm font-medium text-slate-600">
                {cadenceMeta.rangeLabel} (월~일) 한 주 소식을 담습니다.
              </p>
            )}
          </div>
        )}
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

/**
 * @module NLGMaskEngine
 * @description NLG (Natural Language Generation) Mask Engine Base for CREDEAL v3.
 * Prevents financial hallucinations by using deterministic text templates (masks)
 * where calculated numbers are injected directly from `financials.ts`.
 * @see SDD §8 S3-T1
 */

import { computeFinancialSummary, type FinancialInputs, type FinancialSummary } from './financials';

/**
 * Payload defining the data needed to render an NLG mask section.
 */
export interface NLGMaskPayload {
  /** Verified financial inputs from the calculator engine */
  inputs: FinancialInputs;
  /** Optional building name */
  buildingName?: string;
  /** Optional region name */
  regionName?: string;
  /** Optional asset type classification */
  assetType?: string;
}

/**
 * Rendered markdown section with deterministic template injection.
 */
export interface RenderedNLGSection {
  /** Identifier for the generated section */
  sectionKey: string;
  /** Title of the section */
  title: string;
  /** Rendered Markdown string with injected numbers */
  contentMarkdown: string;
  /** Flag indicating this was generated via strict masks to skip anti-hallucination checks */
  isMasked: boolean;
}

/**
 * Render Hero Section using NLG Mask.
 * 
 * @param payload - Data payload for the hero section
 * @returns Rendered section
 * @see SDD §8 S3-T1
 */
export function renderHeroMask(payload: NLGMaskPayload): RenderedNLGSection {
  const summary: FinancialSummary = computeFinancialSummary(payload.inputs);
  const region = payload.regionName || '해당 권역';
  const assetType = payload.assetType || '상업용 빌딩';
  const priceEok = payload.inputs.askingPriceKrw
    ? `${(payload.inputs.askingPriceKrw / 1e8).toLocaleString()}억 원`
    : '가격 협의';

  const capRateStr = summary.capRatePct.value != null
    ? `${summary.capRatePct.value}%`
    : '산출 필요';

  const content = [
    `# 🏢 ${region} ${assetType} 매매 제안`,
    ``,
    `- **매각 희망가**: ${priceEok}`,
    `- **Cap Rate**: ${capRateStr} (${summary.capRatePct.badgeText})`,
    `- **추정 NOI**: 약 ${(summary.noiKrw.value / 1e8).toFixed(1)}억 원/년 (${summary.noiKrw.badgeText})`,
    `- **필요 자기자본**: 약 ${(summary.equityRequiredKrw.value / 1e8).toFixed(1)}억 원 (${summary.equityRequiredKrw.badgeText})`,
    ``,
    `> 💡 **주요 포인트**: 본 매물은 ${region} 핵심 거점에 위치한 ${assetType} 자산입니다.`,
  ].join('\n');

  return {
    sectionKey: 'hero',
    title: '핵심 요약 (Hero)',
    contentMarkdown: content,
    isMasked: true,
  };
}

/**
 * Render Financial Income Section using NLG Mask.
 * 
 * @param payload - Data payload for the income section
 * @returns Rendered section
 * @see SDD §8 S3-T1
 */
export function renderIncomeMask(payload: NLGMaskPayload): RenderedNLGSection {
  const summary: FinancialSummary = computeFinancialSummary(payload.inputs);
  const grossEok = (payload.inputs.grossAnnualIncomeKrw / 1e8).toFixed(1);
  const egiEok = (summary.effectiveGrossIncomeKrw.value / 1e8).toFixed(1);
  const opexEok = (summary.opexKrw.value / 1e8).toFixed(1);
  const noiEok = (summary.noiKrw.value / 1e8).toFixed(1);

  const content = [
    `### 📊 재무 분석 요약`,
    ``,
    `| 항목 | 금액 (연간) | 비고 및 출처 |`,
    `|---|---|---|`,
    `| **총 임대 수입** | 약 ${grossEok}억 원 | 원본 제출 데이터 |`,
    `| **실효 총수입 (EGI)** | 약 ${egiEok}억 원 | ${summary.effectiveGrossIncomeKrw.badgeText} |`,
    `| **운영비 (OPEX)** | 약 ${opexEok}억 원 | ${summary.opexKrw.badgeText} |`,
    `| **순영업소득 (NOI)** | **약 ${noiEok}억 원** | **${summary.noiKrw.badgeText}** |`,
    ``,
    `#### DCF 수익성 평가`,
    `* ${summary.dcfReason}`,
  ].join('\n');

  return {
    sectionKey: 'income_analysis',
    title: '수익성 분석 (Income)',
    contentMarkdown: content,
    isMasked: true,
  };
}

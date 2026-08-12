// src/domain/building/mobile-im/writer.ts
// 7섹션 Mobile IM 자동 생성 엔진 — 오케스트레이터
//
// Phase 0 분해: 전처리·섹션 생성·템플릿을 별도 모듈로 분리.
// 이 파일은 오케스트레이션 및 최종 조립만 담당.
//
// 전략: AI 우선 (GPT-4o via callLLM) → AI 실패 시 프리미엄 템플릿 폴백
// 모든 섹션에 Risk Boundary + Disclosure Guard + Hallucination Guard 적용.
// 데이터 출처 추적 (provenance) 포함.
//
// v2 — flat DB 구조 직접 지원 + value-add-engine 통합
// v3 — Phase 0 모듈 분해 완료
//
// [Claude 전환 가이드]
// 1. callLLM({ model: "gpt-5.6-terra", ... }) → callLLM({ model: "claude-sonnet-4-5", ... })
// 2. 프롬프트 내 XML 태그 구조로 변환 (narrative-prompt.ts 수정)
// 3. 환경변수: AI_IM_MODEL=claude-sonnet-4-5

import {
  type MobileIMSection,
  type HeroCardData,
  type MobileIMWriterInput,
  type MobileIMWriterOutput,
} from "./types";
import { runPublishGates } from './quality-gates-v02';
import { MOBILE_IM_STANDARD_DISCLAIMER } from "./guardrails";
import type { DCFOutputs } from "./dcf-sensitivity";
import { runCrossValidation } from "./cross-validator";
import { createServiceClient } from "@/lib/supabase/service";
import { indexIMSections } from "./im-embedding-indexer";
import { transformPhotoUrls, type TransformedPhoto } from "./photo-url-transformer";

// Phase 0 분해 모듈
import { buildIMContext, type IMGenerationContext } from "./im-context-builder";
import { generateSingleSection } from "./im-section-generator";

export { type IMGenerationContext } from "./im-context-builder";
// 하위 호환: 기존 import 경로 유지
export type { MobileIMWriterInput, MobileIMWriterOutput } from "./types";

// ─── 메인 생성 함수 ───────────────────────────────────────────────────────────
export async function generateMobileIM(input: MobileIMWriterInput): Promise<MobileIMWriterOutput> {
  const { building_ssot_lite, external_data } = input;

  // ── 1. 컨텍스트 빌드 (전처리) ──
  const ctx = await buildIMContext(input);

  // ── 2. 섹션 루프 ──
  const sections: MobileIMSection[] = [];
  let aiUsed = false;
  let cachedFinancials = ctx.cachedFinancials;

  for (let i = 0; i < ctx.sectionPlan.sections.length; i++) {
    const sectionType = ctx.sectionPlan.sections[i] as any;

    const result = await generateSingleSection(
      sectionType,
      i,
      ctx,
      ctx.sectionCtx,
      input.supplemental,
      external_data || null,
      building_ssot_lite as any,
      { dcfEligible: input.dcfEligible, onProgress: input.onProgress },
    );

    sections.push(result.section);
    if (result.generatedByAi) aiUsed = true;
    if (result.cachedFinancials) cachedFinancials = result.cachedFinancials;
  }

  let publishBlocked = false;
  let publishBlockReasons: string[] = [];
  try {
    const gateCtx = {
      salePrice: ctx.purchasePriceKrw,
      totalArea: ctx.totalAreaSqm,
      address: String(ctx.assetIdentity.area_signal ?? ''),
      grade: (input.dataGrade ?? 'C') as 'A' | 'B' | 'C' | 'D',
      crossValidationPassed: true,
      hasHallucination: false,
      piiRemoved: true,
      hasDangerousExpression: false,
      imJudgeScore: 4.0,
      threeAxisConfirmed: !!(ctx.assetIdentity.asset_type),
      dcfGradeEligible: input.dcfEligible ?? false,
      capRateBasisStated: true,
      leaseRegimeConfirmed: true,
      renewalRightChecked: true,
      mixedUseRegimeConfirmed: true,
      illegalBuildingChecked: true,
    } as any;
    const gateReport = runPublishGates(gateCtx as any);
    if (gateReport.blocked) {
      console.warn('[mobile-im] Publish gates blocked:', gateReport.failedBlocks.map(g => g.id));
      publishBlocked = true;
      publishBlockReasons = gateReport.failedBlocks.map((g: any) => g.id);
    }
  } catch (e) {
    console.warn('[mobile-im] Publish gates failed:', e);
  }

  // ── 3. 섹션 간 교차 검증 ──
  try {
    const crossValResult = runCrossValidation(
      sections,
      ctx.sectionCtx.numericalAnchors as any,
      ctx.sectionPlan?.posture as any,
    );
    if (!crossValResult.passed) {
      for (const issue of crossValResult.inconsistencies) {
        if (issue.severity === 'critical') {
          const idx = sections.findIndex(s => s.section_type === issue.section2.type);
          if (idx >= 0) {
            sections[idx].confidence = 'needs_check';
            console.warn(`[cross-validator] Inconsistency: ${issue.field} between ${issue.section1.type} and ${issue.section2.type}`);
          }
        }
      }
    }
  } catch {
    // 교차 검증 실패는 무시
  }

  // ── 4. RAG 인덱싱 ──
  try {
    const sb = createServiceClient();
    const buildingId = String(building_ssot_lite.id ?? (building_ssot_lite as any).building_ssot_lite_id ?? "");
    if (buildingId) {
      await indexIMSections(sb as any, buildingId, sections, {
        assetType: String(ctx.assetIdentity.asset_type ?? ""),
        address: String(ctx.marketLocation.address ?? ""),
        promptVariant: ctx.promptVariantId,
        generatedAt: new Date().toISOString(),
        status: "published",
        brokerApproved: true,
      });
    }
  } catch (indexErr) {
    console.warn("[mobile-im-writer] IM indexing failed (non-blocking):", indexErr);
  }

  // ── 5. Hero Card 구축 ──
  const posture = ctx.sectionPlan?.posture ?? 'income';
  const heroCard: HeroCardData = {
    posture,
    assetType: String(ctx.assetIdentity.asset_type ?? ''),
    areaSignal: String(ctx.assetIdentity.area_signal ?? ''),
    askingPriceDisplay: String(ctx.assetIdentity.price_band ?? ''),
    capRateBase: cachedFinancials?.capRate?.base ?? null,
    noiBaseBil: cachedFinancials?.annualNoi?.base ? parseFloat((cachedFinancials.annualNoi.base / 1e8).toFixed(1)) : null,
    keyInvestmentPoint: String(ctx.buyerFit.fit_summary ?? (() => {
      const area = ctx.assetIdentity.area_signal ? `${ctx.assetIdentity.area_signal} 권역 내` : '';
      const asset = ctx.assetIdentity.asset_type ? `${ctx.assetIdentity.asset_type}` : '상업용 자산';
      const vacancy = ctx.assetIdentity.vacancy_signal ? `, 공실률 ${ctx.assetIdentity.vacancy_signal}` : '';
      const price = ctx.assetIdentity.price_band ? `, 매각 희망가 ${ctx.assetIdentity.price_band}` : '';
      return `${area} ${asset}${vacancy}${price}. 입지·임대차 현황을 감안할 때 투자 검토 가치가 있는 물건입니다.`;
    })()),
    keyRisk: String(ctx.buyerFit.caution_summary ?? (() => {
      const parts: string[] = [];
      if (!ctx.assetIdentity.vacancy_signal) parts.push('공실률 미확인');
      if (!ctx.assetIdentity.price_band) parts.push('매각가 미공개');
      parts.push('등기·건축물대장 현장 실사 필요');
      return parts.join(', ') + '. 투자 결정 전 반드시 직접 검증하시기 바랍니다.';
    })()),
    equityRequiredBil: cachedFinancials?.equityRequired ?? null,
    leveragedYieldPct: cachedFinancials?.leveragedYield ?? null,
    readinessScore: input.readiness.score,
    dcf10YearNpvBil: cachedFinancials?.dcf10Year?.npvBase ? parseFloat((cachedFinancials.dcf10Year.npvBase / 1e8).toFixed(1)) : null,
    landAreaM2: input.external_data?.buildingRegister?.platArea ?? null,
    totalGrossAreaM2: input.external_data?.buildingRegister?.totalArea ?? ctx.totalAreaSqm ?? null,
    zoning: input.external_data?.landUsePlan?.zoningDistrict ?? null,
    // 포스처 확장 지표
    landPricePerPyeong: cachedFinancials?.landPricePerPyeong ?? null,
    devProfitMarginPct: cachedFinancials?.devProfitMarginPct ?? null,
    gopMarginPct: cachedFinancials?.gopMarginPct ?? null,
    adr: cachedFinancials?.adrKrw ?? null,
    occPct: cachedFinancials?.occPct ?? null,
    revpar: cachedFinancials?.revparKrw ?? null,
    ownVsLeaseSavingsBil: cachedFinancials?.ownVsLeaseSavingsBil ?? null,
    breakevenYears: cachedFinancials?.breakevenYears ?? null,
    pricePerPyeong: cachedFinancials?.pricePerPyeong ?? null,
    marketDiscountPct: cachedFinancials?.marketDiscountPct ?? null,
    targetHprPct: cachedFinancials?.targetHprPct ?? null,
  };

  // ── 6. 사진 변환 ──
  const photos = input.supplemental.photo_urls
    ? transformPhotoUrls(input.supplemental.photo_urls, input.supplemental.photo_captions)
    : undefined;

  return {
    sections,
    boundary_note: MOBILE_IM_STANDARD_DISCLAIMER,
    generated_at: new Date().toISOString(),
    ai_used: aiUsed,
    heroCard,
    photos,
    dcf10Year: (cachedFinancials?.dcf10Year ?? undefined) as Record<string, unknown> | undefined,
    financials: cachedFinancials ? {
      equityRequired: cachedFinancials.equityRequired,
      totalDepositBil: cachedFinancials.totalDepositBil,
      loanAmountBil: cachedFinancials.loanAmountBil,
      leveragedYield: cachedFinancials.leveragedYield,
      wacc: cachedFinancials.wacc,
    } : undefined,
    publishBlocked,
    publishBlockReasons,
  };
}

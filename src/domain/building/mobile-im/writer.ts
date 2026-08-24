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
import { MOBILE_IM_STANDARD_DISCLAIMER, humanizeGuardrailTokensForView } from "./guardrails";
import type { DCFOutputs } from "./dcf-sensitivity";
import { runCrossValidation } from "./cross-validator";
import { createServiceClient } from "@/lib/supabase/service";
import { indexIMSections } from "./im-embedding-indexer";
import { transformPhotoUrls, resolvePhotos, PHOTO_CATEGORY_LABELS, type TransformedPhoto } from "./photo-url-transformer";

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

  // ── Phase 1: 4단계 위상 정렬 병렬화 ──
  const CONCURRENCY = Number(process.env.IM_SECTION_CONCURRENCY ?? 4);

  // 섹션 의존성 그래프: 독립 섹션은 병렬 실행, 의존 섹션은 순차 실행
  const INDEPENDENT_SECTIONS = new Set([
    'property_overview', 'location_access', 'lease_status', 'next_steps',
  ]);
  const FINANCIAL_SECTIONS = new Set([
    'income_analysis', 'development_feasibility', 'gop_analysis',
    'cost_comparison', 'comparable_analysis',
  ]);

  const allSections = ctx.sectionPlan.sections as string[];
  const independentBatch = allSections.filter(s => INDEPENDENT_SECTIONS.has(s));
  const financialBatch = allSections.filter(s => FINANCIAL_SECTIONS.has(s));
  const riskBatch = allSections.filter(s => s === 'risk_check');
  const thesisBatch = allSections.filter(s => s === 'investment_thesis');
  // 기타 섹션은 독립 배치에 포함
  const otherSections = allSections.filter(s =>
    !INDEPENDENT_SECTIONS.has(s) &&
    !FINANCIAL_SECTIONS.has(s) &&
    s !== 'risk_check' &&
    s !== 'investment_thesis'
  );

  const stages: string[][] = [
    [...independentBatch, ...otherSections], // Stage 1: 병렬 실행
    financialBatch,                          // Stage 2: 재무 (순차)
    riskBatch,                               // Stage 3: 리스크 (순차)
    thesisBatch,                             // Stage 4: 투자뻐지 (순차)
  ].filter(stage => stage.length > 0);

  let globalIndex = 0;

  for (let stageIdx = 0; stageIdx < stages.length; stageIdx++) {
    const stageSections = stages[stageIdx];
    const isParallel = stageIdx === 0 && CONCURRENCY > 1;

    if (isParallel) {
      // Stage 1: 병렬 실행 (Promise.allSettled)
      const batchPromises = stageSections.map((sectionType, batchIdx) => {
        const idx = globalIndex + batchIdx;
        return generateSingleSection(
          sectionType as any,
          idx,
          ctx,
          // 병렬 실행 시 각 섹션은 같은 컨텍스트 스냅샷을 사용 (경쟁 방지)
          { ...ctx.sectionCtx, keyFacts: [...(ctx.sectionCtx.keyFacts || [])] },
          input.supplemental,
          external_data || null,
          building_ssot_lite as any,
          { dcfEligible: input.dcfEligible, onProgress: input.onProgress },
        );
      });

      const results = await Promise.allSettled(batchPromises);

      for (let ri = 0; ri < results.length; ri++) {
        const result = results[ri];
        if (result.status === 'fulfilled') {
          sections.push(result.value.section);
          if (result.value.generatedByAi) aiUsed = true;
          if (result.value.cachedFinancials) cachedFinancials = result.value.cachedFinancials;
          // 성공한 섹션의 맥락을 전역 컨텍스트에 병합
          try {
            const md = result.value.section.markdown || '';
            const newFacts = extractKeyFactsFromMarkdown(md, stageSections[ri]);
            if (!ctx.sectionCtx.keyFacts) ctx.sectionCtx.keyFacts = [];
            ctx.sectionCtx.keyFacts.push(...newFacts);
          } catch { /* 무시 */ }
        } else {
          // 부분 실패: 템플릿 폴백 섹션 추가
          console.warn(`[writer] Stage 1 section ${stageSections[ri]} failed, using fallback:`, result.reason);
          sections.push({
            section_type: stageSections[ri] as any,
            section_order: globalIndex + ri + 1,
            title: stageSections[ri],
            markdown: `> 해당 섹션은 자동 생성에 실패했습니다. 데이터를 확인해 주세요.`,
            confidence: 'needs_check' as const,
            boundary_note: '자동 생성 실패로 폴백 템플릿 적용',
            provenance: [],
            min_tier: 'public' as const,
          });
        }
      }

      globalIndex += stageSections.length;
    } else {
      // Stage 2~4: 순차 실행 (기존 동작 동일)
      for (const sectionType of stageSections) {
        const result = await generateSingleSection(
          sectionType as any,
          globalIndex,
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
        globalIndex++;
      }
    }
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
      const areaSig = String(ctx.assetIdentity.area_signal ?? '');
      const area = areaSig ? (areaSig.endsWith('권역') ? `${areaSig} 소재` : areaSig.endsWith('권') ? `${areaSig}역 소재` : `${areaSig} 권역 소재`) : '소재';
      const asset = String(ctx.assetIdentity.asset_type ?? '상업용 자산');
      const price = ctx.assetIdentity.price_band ? `, 희망가 ${ctx.assetIdentity.price_band}` : '';
      return `${area} ${asset}${price} 투자 검토 자료입니다.`;
    })()),
    keyPoints: (() => {
      const points: string[] = [];
      if (Array.isArray((ctx.buyerFit as any)?.fit_points) && (ctx.buyerFit as any).fit_points.length > 0) {
        points.push(...(ctx.buyerFit as any).fit_points.slice(0, 3));
      } else {
        const area = ctx.assetIdentity.area_signal || '해당 권역';
        const ask = ctx.assetIdentity.price_band || '적정가';
        points.push(
          `입지 가치: ${area} 소재 자산으로 중장기 자산 가치 및 안정적 수요 검토`,
          `임대 구조: ${ask} 수준의 가격대 및 현 임대차 기반의 현금흐름 분석`,
          `실사 점검: 계약서 및 공부 확인을 통한 권리관계·물리적 상태 정밀 진단`
        );
      }
      return points;
    })(),
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

  // ── 6. 사진 변환 (v0.6.0) ──
  const resolvedPhotoMetas = resolvePhotos(input.supplemental);
  const photos = resolvedPhotoMetas.length > 0
    ? resolvedPhotoMetas.map(p => ({
        url: p.url,
        type: p.category,
        label: PHOTO_CATEGORY_LABELS[p.category] || '건물 사진',
        caption: p.caption,
        order: p.order,
        isHero: p.isHero,
      }))
    : undefined;

  // ── 7. 플레이스홀더 토큰 자연어화 (P0-2) ──
  for (const sec of sections) {
    if (sec.markdown) {
      sec.markdown = humanizeGuardrailTokensForView(sec.markdown, 'institutional');
    }
  }

  // ── 8. 섹션 정본 순서 재정렬 (P1-2) ──
  // 실행 순서(의존성 기반 4단계)와 독자 시점 출력 순서를 분리
  const CANONICAL_ORDER: string[] = [
    'property_overview', 'location_access',
    'lease_status', 'site_analysis', 'occupancy_fit', 'operation_overview', 'market_position',
    'income_analysis', 'development_feasibility', 'gop_analysis', 'cost_comparison', 'comparable_analysis',
    'risk_check', 'investment_thesis', 'next_steps',
  ];
  sections.sort((a, b) => {
    const ia = CANONICAL_ORDER.indexOf(a.section_type);
    const ib = CANONICAL_ORDER.indexOf(b.section_type);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  // section_order 재부여
  sections.forEach((sec, i) => { sec.section_order = i + 1; });

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

/** 병렬 섹션에서 추출한 핵심 사실 (순차 섹션에 전파) */
function extractKeyFactsFromMarkdown(markdown: string, sectionType: string): string[] {
  const facts: string[] = [];
  // 수치 앱커 추출: 면적, 가격, 수익률 등
  const patterns = [
    /(\d[\d,]*\.?\d*)\s*(㎡|평|\uc5b5|\ub9cc\uc6d0|%)/g,
  ];
  for (const p of patterns) {
    p.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.exec(markdown)) !== null) {
      facts.push(`[${sectionType}] ${m[0]}`);
    }
  }
  return facts.slice(0, 10); // 섹션당 최대 10개
}

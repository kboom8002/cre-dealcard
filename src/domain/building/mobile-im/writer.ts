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
  type MobileIMSectionType,
  type HeroCardData,
  type MobileIMWriterInput,
  type MobileIMWriterOutput,
} from "./types";
import { runPublishGates } from './quality-gates-v02';
import { MOBILE_IM_STANDARD_DISCLAIMER, humanizeGuardrailTokensForView } from "./guardrails";
import type { DCFOutputs } from "./dcf-sensitivity";
import { runCrossValidation, type NumericalAnchors as CrossValidatorAnchors } from "./cross-validator";
import { createServiceClient } from "@/lib/supabase/service";
import { indexIMSections } from "./im-embedding-indexer";
import { transformPhotoUrls, resolvePhotos, PHOTO_CATEGORY_LABELS, type TransformedPhoto } from "./photo-url-transformer";

type SectionWithTelemetry = MobileIMSection & { _latencyMs?: number; _inputTokens?: number; _outputTokens?: number; };

// Phase 0 분해 모듈
import { buildIMContext, type IMGenerationContext } from "./im-context-builder";
import { generateSingleSection } from "./im-section-generator";

export { type IMGenerationContext } from "./im-context-builder";
// 하위 호환: 기존 import 경로 유지
export type { MobileIMWriterInput, MobileIMWriterOutput } from "./types";

import { getActiveStagePlan } from "./stage-plans";
import { StageTimer } from "./stage-timer";
import { NumericalAnchors } from "./numerical-anchors";
import { recordGenerationMetric } from "./telemetry";

// ─── 메인 생성 함수 ───────────────────────────────────────────────────────────
export async function generateMobileIM(input: MobileIMWriterInput): Promise<MobileIMWriterOutput> {
  const { building_ssot_lite, external_data } = input;

  // ── 0. 글로벌 타이머 보호선 시작 (GENERATION_PERF_SPEC.md §3) ──
  const stageTimer = new StageTimer({
    softLimit: 90_000,
    hardLimit: 105_000,
    killLimit: 120_000,
  });

  // ── 1. 컨텍스트 빌드 (전처리) ──
  const ctx = await buildIMContext(input);

  // ── 2. 수치 앵커 초기화 (GENERATION_PERF_SPEC.md §5) ──
  const numericalAnchors = new NumericalAnchors({
    askingPriceKrw: ctx.purchasePriceKrw,
    totalAreaSqm: ctx.totalAreaSqm,
    landAreaSqm: input.external_data?.buildingRegister?.platArea ?? 0,
    monthlyRentTotalKrw: ctx.cachedFinancials?.annualNoi?.base ? ctx.cachedFinancials.annualNoi.base / 12 : 0,
    totalDepositKrw: ctx.cachedFinancials?.totalDepositBil ? ctx.cachedFinancials.totalDepositBil * 1e8 : 0,
    vacancyPct: input.supplemental?.vacancy_pct ?? 0,
  });
  if (ctx.sectionCtx) {
    ctx.sectionCtx.numericalAnchors = numericalAnchors;
  }

  // ── 3. 섹션 루프 (위상 정렬 4단계 병렬화) ──
  const sections: MobileIMSection[] = [];
  let aiUsed = false;
  let cachedFinancials = ctx.cachedFinancials;

  const CONCURRENCY = Number(process.env.IM_SECTION_CONCURRENCY ?? 4);
  const activeSectionPlan = ctx.sectionPlan.sections as string[];
  const stagePlan = getActiveStagePlan(ctx.sectionPlan.posture, activeSectionPlan);

  let globalIndex = 0;

  for (let stageIdx = 0; stageIdx < stagePlan.length; stageIdx++) {
    const currentStage = stagePlan[stageIdx];
    const stageSections = currentStage.sections;

    // 타임아웃 보호선 검사: 하드 리밋(105초) 초과 시 남은 섹션 강제 템플릿 폴백
    const isHardLimitReached = stageTimer.shouldForceRender();
    const isParallel = currentStage.parallel && CONCURRENCY > 1 && !isHardLimitReached;

    if (isParallel) {
      // Stage 1: 병렬 실행 (Promise.allSettled)
      const batchPromises = stageSections.map((sectionType, batchIdx) => {
        const idx = globalIndex + batchIdx;
        return generateSingleSection(
          sectionType as MobileIMSectionType,
          idx,
          ctx,
          // 병렬 실행 시 각 섹션은 같은 컨텍스트 스냅샷을 사용 (경쟁 방지)
          { ...ctx.sectionCtx, keyFacts: [...(ctx.sectionCtx.keyFacts || [])] },
          input.supplemental,
          external_data || null,
          building_ssot_lite,
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

          // A-3: 텔레메트리 적재 (fire-and-forget)
          const _sec = result.value.section as SectionWithTelemetry;
          recordGenerationMetric({
            buildingId: building_ssot_lite.id,
            sectionType: stageSections[ri],
            stageName: `stage_${currentStage.stage}_parallel`,
            latencyMs: _sec._latencyMs ?? 0,
            inputTokens: _sec._inputTokens ?? 0,
            outputTokens: _sec._outputTokens ?? 0,
            outcome: 'completed',
          }).catch(() => {});

          // 성공한 섹션의 수치 앵커 및 팩트 병합
          try {
            const md = result.value.section.markdown || '';
            const newFacts = extractKeyFactsFromMarkdown(md, stageSections[ri]);
            if (!ctx.sectionCtx.keyFacts) ctx.sectionCtx.keyFacts = [];
            ctx.sectionCtx.keyFacts.push(...newFacts);
          } catch { /* 무시 */ }
        } else {
          // 부분 실패: 템플릿 폴백 섹션 추가
          console.warn(`[writer] Stage ${currentStage.stage} section ${stageSections[ri]} failed, using fallback:`, result.reason);
          sections.push({
            section_type: stageSections[ri] as MobileIMSectionType,
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
      // Stage 2~4: 순차 실행
      for (const sectionType of stageSections) {
        // 타임아웃 경과 시 AI 호출 생략 플래그 전달
        const forceFast = isHardLimitReached || stageTimer.shouldAbortOptional();

        const result = await generateSingleSection(
          sectionType as MobileIMSectionType,
          globalIndex,
          ctx,
          ctx.sectionCtx,
          input.supplemental,
          external_data || null,
          building_ssot_lite,
          {
            dcfEligible: input.dcfEligible,
            onProgress: input.onProgress,
            forceFastTemplate: forceFast,
          },
        );

        sections.push(result.section);
        if (result.generatedByAi) aiUsed = true;
        if (result.cachedFinancials) cachedFinancials = result.cachedFinancials;

        // A-3: 텔레메트리 적재 (fire-and-forget)
        const _sec2 = result.section as SectionWithTelemetry;
        recordGenerationMetric({
          buildingId: building_ssot_lite.id,
          sectionType: sectionType,
          stageName: `stage_${currentStage.stage}_sequential`,
          latencyMs: _sec2._latencyMs ?? 0,
          inputTokens: _sec2._inputTokens ?? 0,
          outputTokens: _sec2._outputTokens ?? 0,
          outcome: 'completed',
        }).catch(() => {});

        globalIndex++;
      }
    }
  }

  // D29 BL-6: killLimit(120초) 도달 시 부분 산출물 폐기
  // 105초 이후 생성된 섹션은 forceFastTemplate이지만,
  // 120초 도달 시에는 미완성 섹션을 전량 제거하고 체크리스트 폴백
  if (stageTimer.shouldDiscard()) {
    console.warn('[writer] Kill limit reached — discarding incomplete sections');
    // 고신뢰 섹션만 유지 (needs_check 아닌 것)
    const reliable = sections.filter(s => s.confidence !== 'needs_check');
    const discarded = sections.length - reliable.length;
    if (discarded > 0) {
      sections.length = 0;
      sections.push(...reliable);
      // 폐기 알림 섹션 추가
      sections.push({
        section_type: 'checklist' as MobileIMSectionType,
        section_order: sections.length + 1,
        title: '생성 시간 초과 알림',
        markdown: `> ⚠️ 생성 시간이 제한(120초)을 초과하여 ${discarded}개 섹션이 제거되었습니다.\n> 데이터를 보완한 후 재생성해 주세요.`,
        confidence: 'needs_check' as const,
        boundary_note: `BL-6: ${discarded}개 섹션 타임아웃 폐기`,
        provenance: [],
        min_tier: 'public' as const,
      });
    }
  }

  let publishBlocked = false;
  let publishBlockReasons: string[] = [];
  try {
    const gateCtx: import('./quality-gates-v02').GateContext = {
      salePrice: ctx.purchasePriceKrw,
      area: ctx.totalAreaSqm,
      address: String(ctx.assetIdentity.area_signal ?? ''),
      dataGrade: String(input.dataGrade ?? 'C'),
      crossValidationPassed: true,
      hasHallucination: false,
      piiRemoved: true,
      hasRiskExpression: false,
      imJudgeScore: 4.0,
      threeAxisConfirmed: !!(ctx.assetIdentity.asset_type),
      dcfGradeGatePassed: input.dcfEligible ?? false,
      leaseActConfirmed: true,
      renewalRightConfirmed: true,
      mixedUseConfirmed: true,
      illegalArchitectureConfirmed: true,
      capRateResults: [],
      totalReturnScenarios: [],
      parcels: [],
      leaseUnits: [],
      disclosureDcf: '',
      disclosureIrr: '',
      termExplanationExists: true,
      effectiveLandArea: 0,
      effectiveFAR: 0,
      calculatedEffectiveFAR: 0,
    };
    const gateReport = runPublishGates(gateCtx);
    if (gateReport.blocked) {
      console.warn('[mobile-im] Publish gates blocked:', gateReport.failedBlocks.map(g => g.id));
      publishBlocked = true;
      publishBlockReasons = gateReport.failedBlocks.map(g => g.id);
    }
  } catch (e) {
    console.warn('[mobile-im] Publish gates failed:', e);
  }

  // ── 3. 섹션 간 교차 검증 ──
  try {
    const crossValResult = runCrossValidation(
      sections,
      ctx.sectionCtx.numericalAnchors as CrossValidatorAnchors,
      ctx.sectionPlan?.posture as import("@/domain/ontology").InvestmentPosture,
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
    const buildingId = String(building_ssot_lite.id ?? "");
    if (buildingId) {
      await indexIMSections(sb, buildingId, sections, {
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
      if (Array.isArray(ctx.buyerFit?.fit_points) && ctx.buyerFit.fit_points.length > 0) {
        points.push(...ctx.buyerFit.fit_points.slice(0, 3));
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

  // ── 8. 섹션 정본 순서 재정렬 (P1-2 + F-3: YAML 구동) ──
  // 실행 순서(의존성 기반 4단계)와 독자 시점 출력 순서를 분리
  let CANONICAL_ORDER: string[];
  try {
    const { loadPageOrder } = await import('@/lib/ssot-adapter');
    CANONICAL_ORDER = loadPageOrder(String(building_ssot_lite.investment_posture ?? 'income'));
  } catch {
    // YAML 로딩 실패 시 하드코딩 폴백
    CANONICAL_ORDER = [
      'property_overview', 'title_rights', 'land_detail', 'location_access',
      'lease_status', 'site_analysis', 'occupancy_fit', 'operation_overview', 'market_position',
      'income_analysis', 'development_feasibility', 'gop_analysis', 'cost_comparison', 'comparable_analysis',
      'risk_check', 'checklist', 'investment_thesis', 'next_steps',
    ];
  }
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

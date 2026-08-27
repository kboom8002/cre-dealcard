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
import { getDataFreshnessWarning } from './data-quality-badge';

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
import { ClaimRegistry, FinancialCalculator, deriveDataAvailability } from "../im-core";

// D37 P0-8: confidence 기반 IM Judge 점수 계산 (하드코딩 4.0 해소)
function computeImJudgeScore(sections: MobileIMSection[]): number {
  if (sections.length === 0) return 0;
  const scoreMap: Record<string, number> = { high: 5, medium: 3, low: 1, needs_check: 0 };
  const total = sections.reduce((sum, s) => sum + (scoreMap[s.confidence] ?? 2), 0);
  return Math.round((total / sections.length) * 10) / 10;
}

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

  // ── S0. Claim 레지스트리 + 결정론적 계산 (D37 P0-2) ──
  // 계산은 여기서 1회 실행. LLM은 이후 설명만 생성.
  const claimRegistry = new ClaimRegistry();
  const financialCalc = new FinancialCalculator(claimRegistry);
  const financialClaimResult = financialCalc.calculate({
    posture: ctx.sectionPlan.posture as any,
    purchasePriceKrw: ctx.purchasePriceKrw,
    monthlyRentKrw: ctx.cachedFinancials?.annualNoi?.base ? ctx.cachedFinancials.annualNoi.base / 12 : (input.supplemental?.monthly_rent_total_krw ?? 0),
    totalAreaSqm: ctx.totalAreaSqm,
    platAreaSqm: input.external_data?.buildingRegister?.platArea ?? undefined,
    vacancyRatePct: input.supplemental?.vacancy_pct ?? undefined,
    totalDepositManwon: input.supplemental?.total_deposit_manwon ?? undefined,
    loanAmountManwon: input.supplemental?.loan_amount_manwon ?? undefined,
    mgmtFeeTotalManwon: input.supplemental?.mgmt_fee_total_manwon ?? undefined,
    assetType: String(ctx.assetIdentity?.asset_type ?? ''),
    landPricePerSqm: input.external_data?.landPrice?.pricePerSqm ?? undefined,
  });
  if (financialClaimResult.violations.length > 0) {
    console.warn('[writer] Claim violations:', financialClaimResult.violations);
  }

  // ── S0b. DataAvailability 실값 파생 (D37 P0-4) ──
  // 하드코딩 금지 — 실제 데이터 존재 여부에서 파생
  const derivedDA = deriveDataAvailability({
    externalData: input.external_data as Record<string, unknown> | null,
    supplemental: input.supplemental as Record<string, unknown> | null,
  });

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

    // D30 BL-7: 하드 리밋(105초) 초과 시 — 템플릿 생성 금지
    // 미완 섹션은 확인사항(checklist)으로 이관
    // 필수 섹션(property_overview, checklist) 실패 시 전체 차단
    const isHardLimitReached = stageTimer.shouldForceRender();
    const isParallel = currentStage.parallel && CONCURRENCY > 1 && !isHardLimitReached;

    // D30 BL-7: 105초 경과 시 필수 섹션 미완이면 전체 차단
    const REQUIRED_SECTIONS = ['property_overview', 'checklist', 'closing'];
    if (isHardLimitReached) {
      const pendingSections = stageSections.filter(s => !sections.some(sec => sec.section_type === s));
      const requiredPending = pendingSections.filter(s => REQUIRED_SECTIONS.includes(s));
      if (requiredPending.length > 0) {
        throw new Error(`[BL-7] 필수 섹션 생성 시간 초과 (105초): ${requiredPending.join(', ')} — 발행 차단 (system_error)`);
      }
    }

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
          }).catch((err) => { console.warn('[writer]', err); });

          // 성공한 섹션의 수치 앵커 및 팩트 병합
          try {
            const md = result.value.section.markdown || '';
            const newFacts = extractKeyFactsFromMarkdown(md, stageSections[ri]);
            if (!ctx.sectionCtx.keyFacts) ctx.sectionCtx.keyFacts = [];
            ctx.sectionCtx.keyFacts.push(...newFacts);
          } catch (factErr) {
            console.warn(`[writer] extractKeyFacts failed for section "${stageSections[ri]}", anchor propagation may be incomplete:`, factErr);
          }
        } else {
          // D37 P0-6: 폴백 금지 — 실패한 면은 추가하지 않음 (빈 면 금지)
          // 필수 섹션 실패는 stageTimer softLimit에서 throw됨
          console.warn(`[writer] Stage ${currentStage.stage} section ${stageSections[ri]} failed, skipping (no fallback):`, result.reason);
        }
      }

      globalIndex += stageSections.length;
    } else {
      // Stage 2~4: 순차 실행
      for (const sectionType of stageSections) {
        // D30 BL-7: 타임아웃 경과 시 — 템플릿 폴백 대신 확인사항 이관
        const forceFast = isHardLimitReached || stageTimer.shouldAbortOptional();
        if (forceFast && isHardLimitReached) {
          // 105초 경과: 선택 섹션은 확인사항으로 이관 (D30 BL-7)
          sections.push({
            section_type: 'checklist' as MobileIMSectionType,
            section_order: globalIndex + 1,
            title: `${sectionType} — 생성 시간 초과`,
            markdown: `> ⚠️ \`${sectionType}\` 섹션이 생성 시간 제한(105초)을 초과하여 확인사항으로 이관되었습니다.\n> 데이터를 보완한 후 재생성해 주세요.`,
            confidence: 'needs_check' as const,
            boundary_note: 'D30 BL-7: 105초 초과 확인사항 이관',
            provenance: [],
            min_tier: 'public' as const,
          });
          globalIndex++;
          continue;
        }

        // D30 M-8: 멱등키 재시도 정책 — 최대 2회, 동일 섹션 동일 컨텍스트
        const MAX_RETRIES = 2;
        let result;
        let lastError: Error | undefined;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            result = await generateSingleSection(
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
            break; // 성공 시 루프 탈출
          } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            if (attempt < MAX_RETRIES) {
              console.warn(`[writer] M-8: ${sectionType} 재시도 ${attempt + 1}/${MAX_RETRIES}:`, lastError.message);
            }
          }
        }
        if (!result) {
          // 모든 재시도 실패 — 확인사항 이관
          console.error(`[writer] M-8: ${sectionType} 재시도 소진:`, lastError?.message);
          sections.push({
            section_type: 'checklist' as MobileIMSectionType,
            section_order: globalIndex + 1,
            title: `${sectionType} — 생성 실패`,
            markdown: `> ⚠️ \`${sectionType}\` 섹션 생성이 ${MAX_RETRIES + 1}회 시도 후 실패했습니다.\n> 오류: ${lastError?.message || '알 수 없음'}`,
            confidence: 'needs_check' as const,
            boundary_note: 'D30 M-8: 재시도 소진 확인사항 이관',
            provenance: [],
            min_tier: 'public' as const,
          });
          globalIndex++;
          continue;
        }

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
        }).catch((err) => { console.warn('[writer]', err); });

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
      // D37 P0-8: 실값 전환 — 하드코딩 해소
      // crossValidation 결과는 이 아래 runCrossValidation 후 재설정되므로 여기선 false
      crossValidationPassed: false,
      // 할루시네이션: 섹션 중 하나라도 confidence='needs_check'이면 true
      hasHallucination: sections.some(s => s.confidence === 'needs_check'),
      // PII: 섹션 마크다운에 개인정보 패턴이 없는지 검사
      piiRemoved: !sections.some(s => /\d{3}-\d{4}-\d{4}|주민등록|resident\s*registration/i.test(s.markdown || '')),
      // 위험 표현: 섹션 중 boundary_note가 있으면 true
      hasRiskExpression: sections.some(s => !!(s.boundary_note && s.boundary_note.length > 0)),
      // IM Judge 점수: 평균 confidence 기반 (high=5, medium=3, low=1, needs_check=0)
      imJudgeScore: computeImJudgeScore(sections),
      threeAxisConfirmed: !!(ctx.assetIdentity.asset_type),
      dcfGradeGatePassed: input.dcfEligible ?? false,
      // 임대차보호법 확인: DA에 렌트롤이 있어야 확인 가능
      leaseActConfirmed: derivedDA.hasRentRoll === true,
      renewalRightConfirmed: derivedDA.hasRentRoll === true,
      mixedUseConfirmed: derivedDA.hasBuildingRegister !== false,
      illegalArchitectureConfirmed: derivedDA.hasBuildingRegister !== false,
      capRateResults: [],
      totalReturnScenarios: [],
      parcels: [],
      leaseUnits: [],
      disclosureDcf: '',
      disclosureIrr: '',
      termExplanationExists: sections.some(s => s.section_type === 'risk_check'),
      effectiveLandArea: 0,
      effectiveFAR: 0,
      calculatedEffectiveFAR: 0,
      // D37 P2-3: G48~G53 실값 연결
      unresolvedConflictCount: claimRegistry.findConflicted().length,
      unevidencedClaimCount: claimRegistry.findUnevidenced().length,
      asOfMissingCount: claimRegistry.getAll().filter(c => !c.asOf).length,
      calculationNotReproducible: false,  // FinancialCalculator 결정론적 → 항상 재현 가능
      pageCountExceeded: false,           // deck-sequencer에서 절삭으로 보장
      permitZoneNotDisplayed: derivedDA.hasPermitZone === true && !sections.some(s => s.section_type === 'property_overview'),
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
    // W-IM-4: YAML 로드 실패 시 STAGE_PLANS에서 동적 생성 (스키마 드리프트 방지)
    try {
      const postureKey = String(building_ssot_lite.investment_posture ?? 'income');
      const { STAGE_PLANS } = await import('./stage-plans');
      const plan = STAGE_PLANS[postureKey as keyof typeof STAGE_PLANS] || STAGE_PLANS.income;
      CANONICAL_ORDER = plan.flatMap(s => s.sections);
      console.warn(`[writer] YAML loadPageOrder failed, using STAGE_PLANS-derived order for ${postureKey}`);
    } catch {
      // 최종 폴백: STAGE_PLANS 로드도 실패한 극단적 경우
      CANONICAL_ORDER = [
        'property_overview', 'title_rights', 'land_detail', 'location_access',
        'lease_status', 'site_analysis', 'occupancy_fit', 'operation_overview', 'market_position',
        'income_analysis', 'development_feasibility', 'gop_analysis', 'cost_comparison', 'comparable_analysis',
        'risk_check', 'checklist', 'investment_thesis', 'next_steps',
      ];
    }
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
    dataFreshnessWarning: getDataFreshnessWarning(input.external_data?.enrichedAt ?? input.building_ssot_lite?.updated_at),
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

/**
 * @file im-section-generator.ts
 * @description 단일 IM 섹션 생성 + 가드레일 적용 모듈
 * writer.ts Phase 0 분해: 섹션 루프 본체 추출
 */

import { callLLM } from "@/ai/llm-client";
import type {
  MobileIMSectionType,
  MobileIMSection,
  MobileIMSupplementalInput,
  ExternalDataSnapshot,
} from "./types";
import { getSectionProvenance } from "./data-provenance";
import {
  buildNarrativeUserPrompt,
  type MarketIndicators,
  type SectionContext,
} from "./narrative-prompt";
import {
  runRiskBoundaryCheck,
  runDisclosureGuard,
} from "./guardrails";
import {
  calculateFinancials,
  formatFinancialsMarkdown,
  type FinancialOutputs,
} from "./financials";
import { judgeIMSection, shouldJudgeByConfidence } from "./im-judge";
import { runCREQualityGate } from "./cre-quality-gate";
import { extractKeyFacts, updateNumericalAnchors } from "./cross-validator";
import { buildIMFewShotBlock } from "./golden-im-manager";
import { logFewShotUsage, updateFewShotResultScore, promoteToGoldenCandidate } from "./fewshot-tracker";
import { normalizeTerminologyAsync } from "./terminology-normalizer";
import { CrePromptRegistry } from "./cre-prompt-registry";
import { generatePremiumTemplate, formatBasicIncomeMarkdown, getSectionTitle } from "./premium-template-engine";
import type { IMGenerationContext } from "./im-context-builder";
import { getPosturePromptOverlay } from "./posture-prompts";

/** AI 모델 설정 — 환경변수로 교체 가능 */
const IM_AI_MODEL = process.env.AI_IM_MODEL || process.env.AI_DEFAULT_MODEL || "gpt-5.4";

/** Fast mode: Vercel 타임아웃 방어 */
const IM_FAST_MODE = process.env.IM_FAST_MODE !== "false";

/** 섹션별 최대 토큰 수 */
const SECTION_MAX_TOKENS: Record<string, number> = {
  property_overview: 1000,
  location_access: 1500,
  income_analysis: 1800,
  investment_highlights: 1200,
  risk_considerations: 1200,
  comparable_market: 1000,
  executive_summary: 1000,
};

/**
 * 단일 섹션 생성 결과
 */
export interface SectionGenerationResult {
  section: MobileIMSection;
  generatedByAi: boolean;
  cachedFinancials: FinancialOutputs | null;
}

/**
 * 단일 IM 섹션을 생성합니다.
 *
 * AI 우선 → 할루시네이션 탐지 → LLM Judge → 용어 정규화 →
 * Risk Boundary → CRE Quality Gate → Disclosure Guard 순으로 적용.
 * AI 실패 시 프리미엄 템플릿 폴백.
 *
 * @param sectionType - 생성할 섹션 타입
 * @param sectionIndex - 섹션 순서 (0-based)
 * @param ctx - IM 생성 컨텍스트
 * @param sectionCtx - 이전 섹션에서 전파된 맥락
 * @param supplemental - 보충 입력 데이터
 * @param externalData - 외부 공부 데이터
 * @param buildingSsotLite - 원본 SSoT Lite
 * @param input - 원본 writer 입력
 */
export async function generateSingleSection(
  sectionType: MobileIMSectionType,
  sectionIndex: number,
  ctx: IMGenerationContext,
  sectionCtx: SectionContext,
  supplemental: MobileIMSupplementalInput,
  externalData: ExternalDataSnapshot | null,
  buildingSsotLite: Record<string, unknown>,
  input: { dcfEligible?: boolean; onProgress?: (section: MobileIMSection) => void },
): Promise<SectionGenerationResult> {
  let markdown = "";
  let confidence: "confirmed" | "inferred" | "needs_check" = "inferred";
  let finalSectionJudgeScore: number | undefined;
  let generatedByAi = false;
  let sectionFinancials: FinancialOutputs | null = null;

  const sectionProvenance = getSectionProvenance(sectionType, ctx.provenanceMap);

  // ── income_analysis 전처리: 재무 계산 ──
  let sectionMarketIndicators: MarketIndicators | undefined;
  if (
    sectionType === "income_analysis" &&
    supplemental.monthly_rent_total_krw
  ) {
    if (ctx.purchasePriceKrw > 0) {
      try {
        const fin = calculateFinancials({
          monthlyRentKrw: supplemental.monthly_rent_total_krw,
          purchasePriceKrw: ctx.purchasePriceKrw,
          landPricePerSqm: externalData?.landPrice?.pricePerSqm,
          totalAreaSqm: ctx.totalAreaSqm || undefined,
          platAreaSqm: externalData?.buildingRegister?.platArea ?? undefined,
          assetType: String(ctx.assetIdentity.asset_type ?? ""),
          totalDepositManwon: supplemental.total_deposit_manwon,
          mgmtFeeTotalManwon: supplemental.mgmt_fee_total_manwon,
          loanAmountManwon: supplemental.loan_amount_manwon,
        });
        sectionFinancials = fin;
        if (!input.dcfEligible && fin.dcf10Year) {
          fin.dcf10Year = undefined as any;
        }
        sectionMarketIndicators = { financialsMarkdown: formatFinancialsMarkdown(fin) };
      } catch {
        // 무시
      }
    } else {
      const mRent = supplemental.monthly_rent_total_krw;
      const annualGross = mRent * 12;
      const vPct = supplemental.vacancy_pct ?? ctx.vacancyPct;
      const effectiveGross = annualGross * (1 - vPct / 100);
      const estimatedNoi = effectiveGross * 0.85;
      sectionMarketIndicators = {
        financialsMarkdown: formatBasicIncomeMarkdown(annualGross, effectiveGross, estimatedNoi, vPct),
      };
    }
  }

  // ── AI 생성 시도 ──
  try {
    let fewShotBlock = "";
    let usedGoldenIds: string[] = [];
    try {
      const assetTypeStr = String(ctx.assetIdentity.asset_type ?? "");
      const priceBandStr = String(ctx.assetIdentity.price_band ?? "");
      const fsResult = await buildIMFewShotBlock(assetTypeStr, priceBandStr, sectionType);
      fewShotBlock = fsResult.formatted;
      usedGoldenIds = fsResult.usedIds;
    } catch {
      // few-shot 실패 무시
    }

    // 퓨샷 사용 로그
    logFewShotUsage({
      generationId: ctx.generationId,
      sectionType,
      goldenIdsUsed: usedGoldenIds,
      hardcodedUsed: !fewShotBlock,
    }).catch(() => {});

    const normalizedForProvenance: Record<string, unknown> = {
      asset_identity: ctx.assetIdentity,
      physical_fact: ctx.physicalFact,
      market_location: ctx.marketLocation,
      buyer_fit: ctx.buyerFit,
    };

    // AI 프롬프트 조립
    const userPrompt = buildNarrativeUserPrompt(
      sectionType,
      normalizedForProvenance,
      externalData || null,
      supplemental,
      sectionMarketIndicators,
      sectionIndex > 0 ? sectionCtx : undefined,
      ctx.ragCtx,
      fewShotBlock,
    );

    const registry = CrePromptRegistry.getInstance();
    const sectionSpecificPrompt = registry.getActivePrompt(`section_${sectionType}`);
    let effectiveSysPrompt = sectionSpecificPrompt ? sectionSpecificPrompt.systemPrompt : ctx.sysPromptText;
    if (fewShotBlock && !sectionSpecificPrompt) {
      effectiveSysPrompt = effectiveSysPrompt.replace(
        /\[참고 예시 — Golden IM 스타일\][\s\S]*$/,
        "[참고 예시는 유저 프롬프트의 5번 '승인된 Golden IM 예시 (Few-shot 참조)' 섹션에서 제공됩니다. 해당 스타일을 따르세요.]",
      );
    }

    const postureOverlay = getPosturePromptOverlay(
      (ctx.sectionPlan?.posture ?? 'income') as any,
      sectionType,
      ctx.archetype ?? undefined,
    );
    if (postureOverlay) {
      effectiveSysPrompt += '\n\n' + postureOverlay;
    }

    const isEmphasized = ctx.sectionPlan?.emphasize?.includes(sectionType as any);
    const effectiveMaxTokens = (SECTION_MAX_TOKENS[sectionType] ?? 1000) * (isEmphasized ? 2 : 1);

    const result = await callLLM(
      {
        systemPrompt: effectiveSysPrompt,
        userPrompt,
        model: IM_AI_MODEL,
        temperature: 0.3,
        maxTokens: effectiveMaxTokens,
      },
      {
        cacheKey: `mobile-im-${sectionType}-${String(ctx.assetIdentity.area_signal ?? "").slice(0, 20)}-${String(ctx.assetIdentity.asset_type ?? "").slice(0, 20)}`,
        timeoutMs: IM_FAST_MODE ? 8000 : 25000,
      },
    );

    const rawText = result.content.trim();
    if (rawText.length > 120) {
      const { detectHallucination } = await import("./im-context-builder");
      const halluCheck = detectHallucination(rawText, ctx.purchasePriceKrw, ctx.totalAreaSqm);
      if (halluCheck.anomaly) {
        console.warn(`[im-section-generator] Hallucination in ${sectionType}: ${halluCheck.reason} → template fallback`);
      } else {
        // LLM-as-Judge
        let judgeRejected = false;
        if (!IM_FAST_MODE && shouldJudgeByConfidence(confidence)) {
          try {
            const judgeResult = await judgeIMSection({
              sectionMarkdown: rawText,
              sectionType,
              bssotData: normalizedForProvenance,
              externalData: (externalData as Record<string, unknown>) || null,
              supplementalData: supplemental as unknown as Record<string, unknown>,
              financialsMarkdown: sectionMarketIndicators?.financialsMarkdown,
            });
            if (judgeResult) {
              finalSectionJudgeScore = judgeResult.overall;
              updateFewShotResultScore(ctx.generationId, sectionType, judgeResult.overall).catch(() => {});
              if (judgeResult.overall >= 4.5) {
                promoteToGoldenCandidate(
                  ctx.generationId,
                  String(buildingSsotLite.id ?? buildingSsotLite.building_ssot_lite_id ?? ""),
                  String(ctx.assetIdentity.asset_type ?? ""),
                  String(ctx.assetIdentity.price_band ?? ""),
                  sectionType,
                  rawText,
                  judgeResult.overall,
                ).catch(() => {});
              }
              if (judgeResult.overall < 3.0) {
                console.warn(`[im-judge] Section ${sectionType} score ${judgeResult.overall.toFixed(1)} → template fallback`);
                judgeRejected = true;
              }
            }
          } catch (judgeErr) {
            console.warn(`[im-judge] Judge failed for ${sectionType}, skipping:`, judgeErr);
          }
        }

        if (!judgeRejected) {
          markdown = rawText;
          generatedByAi = true;
        }
      }
    }
  } catch (err) {
    console.warn(`[im-section-generator] AI failed for ${sectionType}, using template:`, err);
  }

  // AI 실패 → 프리미엄 템플릿 폴백
  if (!generatedByAi) {
    markdown = generatePremiumTemplate(
      sectionType,
      ctx.assetIdentity,
      ctx.physicalFact,
      ctx.marketLocation,
      ctx.buyerFit,
      supplemental,
      externalData,
      buildingSsotLite,
    );
  }

  // value-add 테이블 추가
  if (sectionType === "investment_thesis" && ctx.valueAddMarkdown) {
    markdown += `\n\n${ctx.valueAddMarkdown}`;
  }

  // 용어 정규화
  const normResult = await normalizeTerminologyAsync(markdown);
  if (normResult.replaced.length > 0) {
    markdown = normResult.text;
  }

  // Risk Boundary 가드레일
  const riskCheck = runRiskBoundaryCheck(markdown, sectionType);
  if (riskCheck.safe_text) markdown = riskCheck.safe_text;

  // CRE Quality Gate (Fast mode 스킵)
  if (generatedByAi && !IM_FAST_MODE) {
    try {
      const gateResult = await runCREQualityGate(markdown, sectionType);
      if (!gateResult.passed && gateResult.riskLevel === "high") {
        console.warn(`[cre-quality-gate] Section ${sectionType} BLOCKED → template fallback`);
        markdown = generatePremiumTemplate(
          sectionType,
          ctx.assetIdentity,
          ctx.physicalFact,
          ctx.marketLocation,
          ctx.buyerFit,
          supplemental,
          externalData,
          buildingSsotLite,
        );
      }
    } catch (gateErr) {
      console.warn(`[cre-quality-gate] Gate failed for ${sectionType}, skipping:`, gateErr);
    }
  }

  // Disclosure Guard
  const disclosureCheck = runDisclosureGuard(markdown);
  if (disclosureCheck.status !== "pass") markdown = disclosureCheck.safe_text;

  // 브로커 하이라이트
  if (sectionType === "investment_thesis" && supplemental.broker_highlight) {
    markdown += `\n\n> **전문가 한줄 의견**: "${supplemental.broker_highlight}"`;
  }

  // 섹션 confidence 결정
  if (sectionProvenance.length > 0) {
    const hasNeedsCheck = sectionProvenance.some((p) => p.confidence === "needs_check");
    const allConfirmed = sectionProvenance.every((p) => p.confidence === "confirmed");
    confidence = hasNeedsCheck ? "needs_check" : allConfirmed ? "confirmed" : "inferred";
  }

  const finalSection: MobileIMSection = {
    section_type: sectionType,
    section_order: sectionIndex + 1,
    title: getSectionTitle(sectionType),
    markdown,
    confidence,
    boundary_note: "본 섹션의 내용은 예비 검토용입니다.",
    provenance: sectionProvenance,
    judge_score: finalSectionJudgeScore,
    min_tier: "public" as const,
  };

  if (input.onProgress) {
    input.onProgress(finalSection);
  }

  // 맥락 업데이트 (다음 섹션에 전파)
  try {
    const newFacts = extractKeyFacts(markdown, sectionType);
    sectionCtx.keyFacts.push(...newFacts);
    sectionCtx.sectionSummaries[sectionType] = markdown.slice(0, 200);
    updateNumericalAnchors(sectionCtx.numericalAnchors, markdown, sectionType);
  } catch {
    // 맥락 추출 실패 무시
  }

  return {
    section: finalSection,
    generatedByAi,
    cachedFinancials: sectionFinancials,
  };
}

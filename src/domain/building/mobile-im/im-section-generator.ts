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
import { calculateNetCashFlow, formatNetCashFlowMarkdown } from "./net-cash-flow-calculator";
import { judgeIMSection, shouldJudgeByConfidence } from "./im-judge";
import { runCREQualityGate } from "./cre-quality-gate";
import { extractKeyFacts, updateNumericalAnchors } from "./cross-validator";
import { buildIMFewShotBlock } from "./golden-im-manager";
import { logFewShotUsage, updateFewShotResultScore, promoteToGoldenCandidate } from "./fewshot-tracker";
import { normalizeTerminologyAsync } from "./terminology-normalizer";
import { CrePromptRegistry } from "./cre-prompt-registry";
import { generatePremiumTemplate, formatBasicIncomeMarkdown, getSectionTitle } from "./premium-template-engine";
import { normalizeFloorLeases, formatRentRollMarkdown, formatRentRollSummary } from "./lease-adapter";
import type { IMGenerationContext } from "./im-context-builder";
import { getPosturePromptOverlay } from "./posture-prompts";
import { getModel } from "@/ai/model-selector";

/** AI 모델 설정 — 환경변수로 교체 가능 */
const IM_AI_MODEL = process.env.AI_IM_MODEL || getModel("terra");

/** Fast mode: Vercel 타임아웃 방어 */
/** Fast mode: 명시적으로 "true"로 설정할 때만 활성화 (기본 false — Vercel Edge 환경에서만 opt-in) */
const IM_FAST_MODE = process.env.IM_FAST_MODE === "true";

/** 섹션별 최대 토큰 수 */
const SECTION_MAX_TOKENS: Record<string, number> = {
  property_overview: 1000,
  location_access: 1500,
  income_analysis: 1800,
  investment_highlights: 1200,
  risk_considerations: 1200,
  comparable_market: 1000,
  executive_summary: 1000,
  // owner_occupied
  occupancy_fit: 1200,
  cost_comparison: 1500,
  // development
  site_analysis: 1200,
  development_feasibility: 1500,
  // operating
  operation_overview: 1200,
  gop_analysis: 1500,
  // trading
  market_position: 1200,
  comparable_analysis: 1500,
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
  buildingSsotLite: Record<string, unknown> | import('../building-ssot-lite.types').BuildingSSoTLite,
  input: { dcfEligible?: boolean; onProgress?: (section: MobileIMSection) => void; forceFastTemplate?: boolean },
): Promise<SectionGenerationResult> {
  let markdown = "";
  let confidence: "confirmed" | "inferred" | "needs_check" = "inferred";
  let finalSectionJudgeScore: number | undefined;
  let generatedByAi = false;
  let sectionFinancials: FinancialOutputs | null = null;

  const sectionProvenance = getSectionProvenance(sectionType, ctx.provenanceMap);

  // ── 포스처별 재무 계산 라우팅 ──
  let sectionMarketIndicators: MarketIndicators | undefined;
  const posture = (ctx.sectionPlan?.posture ?? 'income') as any;
  const shouldCalculateFinancials = (() => {
    switch (posture) {
      case 'income':
        return sectionType === "income_analysis" && !!supplemental.monthly_rent_total_krw;
      case 'development':
        return sectionType === "development_feasibility";
      case 'operating':
        return sectionType === "gop_analysis";
      case 'owner_occupied':
        return sectionType === "cost_comparison";
      case 'trading':
        return sectionType === "comparable_analysis";
      default:
        return sectionType === "income_analysis";
    }
  })();

  if (shouldCalculateFinancials) {
    if (ctx.purchasePriceKrw > 0) {
      try {
        const fin = calculateFinancials({
          posture,
          monthlyRentKrw: supplemental.monthly_rent_total_krw ?? 0,
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

        let finMd = formatFinancialsMarkdown(fin);

        // 60대 자산가 페르소나: income 포스처 시 실투자금 & 월 순수익 3줄 요약 상단 자동 결합
        if (posture === 'income' && supplemental.monthly_rent_total_krw && ctx.purchasePriceKrw > 0) {
          const platArea = externalData?.buildingRegister?.platArea ?? 0;
          const landPriceSqm = externalData?.landPrice?.pricePerSqm ?? 0;
          const landPriceTotalKrw = platArea > 0 && landPriceSqm > 0 ? platArea * landPriceSqm : 0;

          const ncf = calculateNetCashFlow({
            purchasePriceKrw: ctx.purchasePriceKrw,
            monthlyRentKrw: supplemental.monthly_rent_total_krw,
            totalDepositKrw: supplemental.total_deposit_manwon ? supplemental.total_deposit_manwon * 10000 : 0,
            loanAmountKrw: supplemental.loan_amount_manwon ? supplemental.loan_amount_manwon * 10000 : 0,
            landPriceTotalKrw,
          });

          if (ncf) {
            finMd = formatNetCashFlowMarkdown(ncf) + '\n\n' + finMd;
          }
        }

        sectionMarketIndicators = { financialsMarkdown: finMd };
      } catch {
        // 무시
      }
    } else {
      const mRent = supplemental.monthly_rent_total_krw ?? 0;
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
    if (input.forceFastTemplate) {
      throw new Error("TIME_BUDGET_FORCE_FAST_TEMPLATE");
    }

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
    }).catch((err) => { console.warn('[im-section-generator]', err); });

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
      undefined,
      posture,
      ctx.archetype ?? undefined,
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
        cacheKey: `mobile-im-${sectionType}-${String(ctx.buildingId ?? "")}-${String(ctx.assetIdentity.area_signal ?? "").slice(0, 20)}-${String(ctx.assetIdentity.asset_type ?? "").slice(0, 20)}`,
        // FAST_MODE: 30초, 일반: 90초 (gpt-5.6-terra 등 대형 모델 대응)
        timeoutMs: IM_FAST_MODE ? 30000 : 90000,
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
              updateFewShotResultScore(ctx.generationId, sectionType, judgeResult.overall).catch((err) => { console.warn('[im-section-generator]', err); });
              if (judgeResult.overall >= 4.5) {
                promoteToGoldenCandidate(
                  ctx.generationId,
                  String(buildingSsotLite.id ?? buildingSsotLite.building_ssot_lite_id ?? ""),
                  String(ctx.assetIdentity.asset_type ?? ""),
                  String(ctx.assetIdentity.price_band ?? ""),
                  sectionType,
                  rawText,
                  judgeResult.overall,
                ).catch((err) => { console.warn('[im-section-generator]', err); });
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
      posture,
    );
  }

  // value-add 테이블 추가
  if (sectionType === "investment_thesis" && ctx.valueAddMarkdown) {
    markdown += `\n\n${ctx.valueAddMarkdown}`;
  }

  // 렌트롤 deterministic 테이블 주입: floor_leases가 있으면 LLM 생성 테이블을 교체/보강
  // LLM이 '6-7F' → '6층' 등으로 재인덱싱하는 할루시네이션 방지 및 풀 테이블+요약 동시 노출
  if ((sectionType === "lease_status" || sectionType === "income_analysis") && supplemental.floor_leases && supplemental.floor_leases.length > 0) {
    try {
      const normalized = normalizeFloorLeases(supplemental.floor_leases);
      const deterministicTable = formatRentRollMarkdown(normalized);
      const summaryTable = formatRentRollSummary(normalized);
      const fullRentRollBlock = `${deterministicTable}\n\n${summaryTable}`;

      // 기존 마크다운 테이블 영역 교체 (| 로 시작하는 연속 행 블록)
      const lines = markdown.split('\n');
      let tableStart = -1;
      let tableEnd = -1;
      for (let li = 0; li < lines.length; li++) {
        if (lines[li].trim().startsWith('|')) {
          if (tableStart < 0) tableStart = li;
          tableEnd = li;
        } else if (tableStart >= 0 && tableEnd >= 0) {
          break; // 첫 번째 테이블 블록만
        }
      }
      if (tableStart >= 0) {
        const beforeLines = lines.slice(0, tableStart);
        const afterLines = lines.slice(tableEnd + 1);

        // W-IM-7: 테이블 직전 캡션/소개 라인 보존 (### 또는 > 또는 **임대 로 시작하는 줄)
        let captionLine = '';
        if (beforeLines.length > 0) {
          const lastBefore = beforeLines[beforeLines.length - 1].trim();
          if (/^(?:###|>|\*\*임대|\*\*렌트롤|\*\*층별)/.test(lastBefore)) {
            captionLine = beforeLines.pop()! + '\n';
          }
        }

        const before = beforeLines.join('\n');
        const after = afterLines.join('\n');
        markdown = before + '\n' + captionLine + fullRentRollBlock + '\n' + after;
      } else {
        markdown += '\n\n' + fullRentRollBlock;
      }
    } catch (e) {
      console.warn('[im-section-generator] Deterministic rent roll table failed:', e);
    }
  }

  // 용어 정규화
  const normResult = await normalizeTerminologyAsync(markdown);
  if (normResult.replaced.length > 0) {
    markdown = normResult.text;
  }

  // 갱신요구권 연수 환각 정제: 최초계약일이 미제출된 경우 "N년 잔여" 단정 표현을 "최초계약일 확인 필요"로 치환 (불변조건 7)
  const hasMissingFirstContractDates = !supplemental.floor_leases || supplemental.floor_leases.some(
    (l: any) => !l.first_contract_date && !l.firstContractDate
  );
  if (hasMissingFirstContractDates) {
    markdown = markdown.replace(/갱신요구권\s*\d+(?:\.\d+)?\s*년(?:\s*잔여)?/g, '계약갱신요구권(최초계약일 확인 필요)');
    markdown = markdown.replace(/갱신권\s*\d+(?:\.\d+)?\s*년(?:\s*잔여)?/g, '갱신권(최초계약일 확인 필요)');
  }

  // D30 BL-9: 임차인 상호 전량 마스킹 + 업종 보존 (불변조건 14·23, G29)
  // 정본: "물건명·법인명·임차인명은 대외 문서에 표기하지 않는다"
  // 마스킹은 상호를 가리되 업종을 지우지 않는다
  if (supplemental.floor_leases && supplemental.floor_leases.length > 0) {
    const tenantNames: string[] = [];
    for (const lease of supplemental.floor_leases) {
      const l = lease as any;
      const name = String(l.tenant_name || l.tenantName || l.note || '').trim();
      if (name && name.length >= 2) tenantNames.push(name);
    }
    // 긴 이름부터 치환 (부분 매칭 방지)
    const sorted = [...new Set(tenantNames)].sort((a, b) => b.length - a.length);
    sorted.forEach((name, idx) => {
      const label = `[임차인${String.fromCharCode(65 + (idx % 26))}]`; // [임차인A], [임차인B]...
      // 상호만 마스킹 — 업종·위치 정보는 보존
      const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      markdown = markdown.replaceAll(name, label);
    });
  }
  // 유명 브랜드 환각 방지 (LLM이 날조한 브랜드명도 마스킹)
  const famousBrands = ['스타벅스', '맥도날드', '투썸플레이스', '올리브영', '다이소', '버거킹', '파리바게뜨', 'CU', 'GS25', '이마트'];
  for (const brand of famousBrands) {
    if (markdown.includes(brand)) {
      markdown = markdown.replace(new RegExp(brand + '\\s*(?:[가-힣]*점)?', 'g'), '[임차인]');
    }
  }

  // D30 M-19: Cap Rate 라벨 정본 병기 (CRE 실무 용어집)
  // "연 순수익률 (Cap Rate)"는 정본 표현 — 유지
  // "총수익률"을 "순수익률/Cap Rate"로 잘못 표기한 경우만 교정
  markdown = markdown.replace(/연\s*총수익률\s*\(\s*Cap\s*Rate\s*\)/gi, '연 총수익률 (Gross Yield)');
  markdown = markdown.replace(/연간\s*실질\s*임대수입/g, '연간 총 임대수입');
  // 캡레이트 외래어 직역 → 정본 병기
  markdown = markdown.replace(/캡레이트/g, '연 순수익률 (Cap Rate)');

  // Risk Boundary 가드레일
  const riskCheck = runRiskBoundaryCheck(markdown, sectionType);
  if (riskCheck.safe_text) markdown = riskCheck.safe_text;

  // CRE Quality Gate (Fast mode 스킵) — D33 M-H: 정적 합성 문구에도 적용
  if (!IM_FAST_MODE) {
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
          posture,
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
    title: getSectionTitle(sectionType, buildingSsotLite?.asset_type as string),
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
    if (sectionCtx.sectionSummaries) {
      sectionCtx.sectionSummaries[sectionType] = markdown.slice(0, 200);
    }
    if (sectionCtx.numericalAnchors) {
      updateNumericalAnchors(sectionCtx.numericalAnchors as any, markdown, sectionType);
    }
  } catch {
    // 맥락 추출 실패 무시
  }

  return {
    section: finalSection,
    generatedByAi,
    cachedFinancials: sectionFinancials,
  };
}

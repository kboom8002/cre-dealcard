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
import { normalizeSectionMarkdown } from "@/lib/utils/markdown-normalizer";
import { runCREQualityGate } from "./cre-quality-gate";
import { repairDraftForGate, isGateSystemFailure } from "./cre-gate-repair";
import { extractKeyFacts, updateNumericalAnchors } from "./cross-validator";
import { buildIMFewShotBlock } from "./golden-im-manager";
import { logFewShotUsage, updateFewShotResultScore, promoteToGoldenCandidate } from "./fewshot-tracker";
import { normalizeTerminologyAsync, protectBlock, stripProtectMarkers } from "./terminology-normalizer";
import { CrePromptRegistry } from "./cre-prompt-registry";
import { generatePremiumTemplate, formatBasicIncomeMarkdown, getSectionTitle } from "./premium-template-engine";
import { normalizeFloorLeases, formatRentRollMarkdown, formatRentRollSummary } from "./lease-adapter";
import { sumLeasedRentRoll } from "./lease-vacancy";
import { brokerFinancialExtras } from './broker-financial-inputs';
import { maskFabricatedBrands } from "./tenant-name-policy";
import { alignPlatAreaForPrompt } from "./prompt-land-area";
import { verifiedLegalLimits, stripUnverifiedLimits } from "./legal-limits";
import type { IMGenerationContext } from "./im-context-builder";
import { getPosturePromptOverlay } from "./posture-prompts";
import { getModel } from "@/ai/model-selector";
import { sqmToPyeong } from "@/lib/utils/area-conversion";
import { resolveLandAreaWithSource, readSsotLayerAreas, readVworldLandAreaSqm } from "./resolve-total-area";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('im-section-generator');

/**
 * D-JSON-LEAK: AI 출력 마크다운에서 JSON 리터럴 리크를 탐지하고 제거.
 *
 * AI(LLM)가 프롬프트에 주입된 building SSoT, 외부 데이터, 메모 파싱 결과 등의
 * JSON.stringify 출력을 마크다운 본문에 그대로 포함시키는 경우를 방어합니다.
 *
 * 탐지 기준:
 * 1. `{"key":...}` 또는 `[{"key":...}]` 패턴의 JSON 오브젝트/배열 리터럴
 * 2. "mocked", "extractedFields", "extractedFacts", "ok" 등 API 응답 키워드 포함
 * 3. 80자 이상의 JSON 블록 (단순 인라인 참조가 아닌 실제 데이터 덤프)
 */
function stripJsonLeaks(markdown: string, sectionType: string): string {
  const lines = markdown.split('\n');
  let cleaned = false;
  const resultLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // JSON 오브젝트 리터럴 시작 감지: {"key": ... 패턴
    if (/^\{["\s]/.test(trimmed) && /"[^"]+"\s*:/.test(trimmed) && trimmed.length > 80) {
      // API 응답 키워드가 포함되어 있으면 확실한 JSON 리크
      const isApiLeak = /(?:"mocked"|"extractedFields"|"extractedFacts"|"ok"\s*:\s*true|"priceText"|"sizeText"|"area_signal"|"asset_type")/.test(trimmed);
      // 또는 일반적인 긴 JSON 오브젝트 (중첩 구조 포함)
      const isLongJson = trimmed.length > 120 && (trimmed.includes('":"') || trimmed.includes('": "'));

      if (isApiLeak || isLongJson) {
        // JSON 블록이 여러 줄에 걸쳐 있을 수 있으므로, 중괄호 균형을 추적
        let depth = 0;
        let j = i;
        for (; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
          }
          if (depth <= 0) break;
        }
        // JSON 블록 전체를 건너뜀
        log.warn(`[D-JSON-LEAK] ${sectionType}: Stripped ${j - i + 1} line(s) of leaked JSON (starts with: ${trimmed.slice(0, 60)}...)`);
        i = j;
        cleaned = true;
        continue;
      }
    }

    resultLines.push(lines[i]);
  }

  if (cleaned) {
    const result = resultLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    // 전체 내용이 JSON이었다면(빈 결과) 경고 로그
    if (result.length < 30) {
      log.error(`[D-JSON-LEAK] ${sectionType}: Nearly all content was JSON — template fallback needed`);
    }
    return result;
  }

  return markdown;
}


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
  input: { dcfEligible?: boolean; onProgress?: (section: MobileIMSection) => void; forceFastTemplate?: boolean; timeoutMs?: number },
): Promise<SectionGenerationResult> {
  let markdown = "";
  let confidence: "confirmed" | "inferred" | "needs_check" = "inferred";
  let finalSectionJudgeScore: number | undefined;
  let generatedByAi = false;
  let sectionFinancials: FinancialOutputs | null = null;

  const sectionProvenance = getSectionProvenance(sectionType, ctx.provenanceMap);

  // 다필지: 대장 platArea 는 대표 필지 면적 — 해석된 대지면적(필지 합/중개인 입력)과 충돌하면 프롬프트에는 해석값만 노출 (oracle trading-sinsa-r3)
  externalData = alignPlatAreaForPrompt(
    externalData as Record<string, any> | null,
    Number((ctx.physicalFact as any)?.plat_area_sqm || (ctx.physicalFact as any)?.platAreaSqm || (ctx as any)?.landAreaM2 || (ctx as any)?.platAreaSqm || (supplemental as any)?.land_area_m2 || 0),
  ) as ExternalDataSnapshot | null;
  // 공식 조회가 아닌 법정 한도(용도지역명 추정치)는 LLM 입력에서 제거 — '추정 법정 상한 N%' 본문 방지 (P2, legal-limits.ts)
  externalData = stripUnverifiedLimits(externalData as Record<string, any> | null) as ExternalDataSnapshot | null;

  // Backfill monthly_rent_total_krw from floor_leases if empty
  if (!supplemental.monthly_rent_total_krw && Array.isArray(supplemental.floor_leases) && supplemental.floor_leases.length > 0) {
    const floorSum = supplemental.floor_leases.reduce((sum: number, l: any) => sum + (Number(l.rent_manwon) || 0) * 10000, 0);
    if (floorSum > 0) {
      supplemental.monthly_rent_total_krw = floorSum;
    }
  }

  // ── 포스처별 재무 계산 라우팅 ──
  let sectionMarketIndicators: MarketIndicators | undefined;
  const posture = (ctx.sectionPlan?.posture ?? 'income') as any;
  const shouldCalculateFinancials = (() => {
    switch (posture) {
      case 'income':
        return sectionType === "income_analysis" && (
          !!supplemental.monthly_rent_total_krw ||
          (Array.isArray(supplemental.floor_leases) && supplemental.floor_leases.length > 0) ||
          !!ctx.cachedFinancials
        );
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
    if (ctx.cachedFinancials) {
      sectionFinancials = ctx.cachedFinancials;
      sectionMarketIndicators = {
        financialsMarkdown: formatFinancialsMarkdown(ctx.cachedFinancials),
      };
    } else if (ctx.purchasePriceKrw > 0) {
      try {
        const effectiveMonthlyRentKrw = supplemental.monthly_rent_total_krw
          || (Array.isArray(supplemental.floor_leases)
              ? supplemental.floor_leases.reduce((sum: number, l: any) => sum + (Number(l.rent_manwon) || 0) * 10000, 0)
              : 0);

        const fin = calculateFinancials({
          posture,
          monthlyRentKrw: effectiveMonthlyRentKrw,
          purchasePriceKrw: ctx.purchasePriceKrw,
          landPricePerSqm: externalData?.landPrice?.pricePerSqm,
          totalAreaSqm: ctx.totalAreaSqm || undefined,
          platAreaSqm: externalData?.buildingRegister?.platArea ?? undefined,
          assetType: String(ctx.assetIdentity.asset_type ?? ""),
          totalDepositManwon: supplemental.total_deposit_manwon,
          mgmtFeeTotalManwon: supplemental.mgmt_fee_total_manwon,
          loanAmountManwon: supplemental.loan_amount_manwon,
          isBasicMode: !supplemental.loan_amount_manwon,
          // 개발형 전용 파라미터
          constructionCostPerPyeong: (supplemental.developmentSpec as any)?.constructionCostPerPyung
            ?? (supplemental.developmentSpec as any)?.constructionCostPerPyeong
            ?? undefined,
          targetGrossAreaPyeong: (supplemental.developmentSpec as any)?.targetScalePyung
            ?? (supplemental.developmentSpec as any)?.targetScalePyeong
            ?? undefined,
          expectedSalesPricePerPyeong: (supplemental.developmentSpec as any)?.expectedSalePricePerPyung
            ?? (supplemental.developmentSpec as any)?.expectedSalePricePerPyeong
            ?? undefined,
          devHoldMonthlyRentManwon: Array.isArray(supplemental.floor_leases)
            ? sumLeasedRentRoll(supplemental.floor_leases as any[]).rentManwon
            : undefined,
          // 중개인 제시값(구조화 + 원문 메모 명시값) — 가정 기본값 대신 사용 (Rule 34)
          ...brokerFinancialExtras(supplemental as any, posture),
        });
        sectionFinancials = fin;
        if (!input.dcfEligible && fin.dcf10Year) {
          fin.dcf10Year = undefined as any;
        }

        let finMd = formatFinancialsMarkdown(fin);

        // income 포스처 시 실투자금 & 월 순수익 요약 상단 자동 결합
        if (posture === 'income' && effectiveMonthlyRentKrw > 0 && ctx.purchasePriceKrw > 0) {
          const platArea = externalData?.buildingRegister?.platArea ?? 0;
          const landPriceSqm = externalData?.landPrice?.pricePerSqm ?? 0;
          const landPriceTotalKrw = platArea > 0 && landPriceSqm > 0 ? platArea * landPriceSqm : 0;

          const ncf = calculateNetCashFlow({
            purchasePriceKrw: ctx.purchasePriceKrw,
            monthlyRentKrw: effectiveMonthlyRentKrw,
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
    } else if (posture === 'income') {
      const mRent = supplemental.monthly_rent_total_krw
        || (Array.isArray(supplemental.floor_leases)
            ? supplemental.floor_leases.reduce((sum: number, l: any) => sum + (Number(l.rent_manwon) || 0) * 10000, 0)
            : 0);
      const annualGross = mRent * 12;
      const vPct = supplemental.vacancy_pct ?? ctx.vacancyPct;
      const effectiveGross = annualGross * (1 - vPct / 100);
      const estimatedNoi = effectiveGross * 0.85;
      sectionMarketIndicators = {
        financialsMarkdown: formatBasicIncomeMarkdown(annualGross, effectiveGross, estimatedNoi, vPct),
      };
    }
  }

  if (sectionType === 'comparables') {
    const { renderComparables } = await import('./section-renderers/comparables-renderer');
    const compsData = ((externalData as any)?.comparableTransactions || (supplemental as any).manual_comps || []) as any[];
    const pyeong = ctx.totalAreaSqm ? sqmToPyeong(ctx.totalAreaSqm) : 0;
    const subjectPricePerPyeong = pyeong > 0 ? Math.round(ctx.purchasePriceKrw / pyeong) : 0;
    
    const result = renderComparables({
      subjectName: (ctx.assetIdentity as any).address || '본건',
      subjectPricePerPyeong,
      comparables: compsData,
    });

    const finalSection: MobileIMSection = {
      section_type: sectionType,
      section_order: sectionIndex + 1,
      title: getSectionTitle(sectionType, (buildingSsotLite as any)?.asset_type as string),
      markdown: result.markdown,
      confidence: 'confirmed', // Fallback for deterministic
      boundary_note: "본 섹션의 내용은 예비 검토용입니다.",
      provenance: sectionProvenance,
      judge_score: undefined,
      min_tier: "public",
    };
    if (input.onProgress) input.onProgress(finalSection);
    return { section: finalSection, generatedByAi: false, cachedFinancials: null };
  }

  if (sectionType === 'title_rights') {
    const { renderTitleRights } = await import('./section-renderers/title-rights-renderer');
    const reg = (externalData?.registryData || (supplemental as any)?.registryData) as any;

    const owners: Array<{ name: string; shareRatio: number }> = [];
    if (Array.isArray((supplemental as any)?.owners) && (supplemental as any).owners.length > 0) {
      owners.push(...(supplemental as any).owners);
    } else if (reg?.ownerName) {
      owners.push({ name: String(reg.ownerName), shareRatio: 1 });
    } else if ((supplemental as any)?.owner_name) {
      owners.push({ name: String((supplemental as any).owner_name), shareRatio: 1 });
    }

    const encumbrances: Array<{
      type: string;
      creditor: string;
      amountKrw?: number;
      registeredDate?: string;
    }> = [];

    if (Array.isArray((supplemental as any)?.encumbrances) && (supplemental as any).encumbrances.length > 0) {
      encumbrances.push(...(supplemental as any).encumbrances);
    } else {
      if (Array.isArray(reg?.mortgages)) {
        for (const m of reg.mortgages) {
          encumbrances.push({
            type: '근저당권',
            creditor: m.creditor || '채권자',
            amountKrw: m.amount != null ? Number(m.amount) : (m.amountKrw != null ? Number(m.amountKrw) : undefined),
            registeredDate: m.registeredDate,
          });
        }
      }
      if (Array.isArray(reg?.attachments)) {
        for (const a of reg.attachments) {
          encumbrances.push({
            type: a.type || '가압류',
            creditor: a.creditor || a.claimant || '채권자',
            amountKrw: a.amount != null ? Number(a.amount) : undefined,
            registeredDate: a.registeredDate,
          });
        }
      }
      if (Array.isArray(reg?.encumbrances)) {
        for (const e of reg.encumbrances) {
          encumbrances.push({
            type: e.type || '제한물권',
            creditor: e.creditor || e.description || '-',
            amountKrw: e.amountKrw != null ? Number(e.amountKrw) : (e.amount != null ? Number(e.amount) : undefined),
            registeredDate: e.registeredDate,
          });
        }
      }
    }

    const restrictions: string[] = [];
    if (Array.isArray((supplemental as any)?.restrictions)) {
      restrictions.push(...(supplemental as any).restrictions);
    } else if (Array.isArray(reg?.restrictions)) {
      restrictions.push(...reg.restrictions);
    }

    const result = renderTitleRights({
      owners,
      encumbrances: encumbrances as any,
      restrictions,
    });

    const finalSection: MobileIMSection = {
      section_type: sectionType,
      section_order: sectionIndex + 1,
      title: getSectionTitle(sectionType, (buildingSsotLite as any)?.asset_type as string),
      markdown: result.markdown,
      confidence: 'confirmed',
      boundary_note: "본 섹션의 내용은 예비 검토용입니다.",
      provenance: sectionProvenance,
      judge_score: undefined,
      min_tier: "public",
    };
    if (input.onProgress) input.onProgress(finalSection);
    return { section: finalSection, generatedByAi: false, cachedFinancials: null };
  }

  if (sectionType === 'land_detail') {
    const { renderLandDetail } = await import('./section-renderers/land-detail-renderer');
    const lu = externalData?.landUsePlan;
    const br = externalData?.buildingRegister;
    const lp = externalData?.landPrice;

    const parcels: Array<{
      pnu: string;
      jimok: string;
      areaM2: number;
      ownershipRatio: number;
      officialLandPricePerM2?: number;
    }> = [];

    // 대지면적 단일 해석기: 명시 입력 > (필지 합은 아래 다필지 분기) > 메모 SSoT(평→㎡) > 건축물대장 platArea(>0) > V-World > 없음
    const resolvedSiteArea = resolveLandAreaWithSource({
      explicitSqm: Number((ctx.physicalFact as any)?.plat_area_sqm || (ctx.physicalFact as any)?.platAreaSqm || (ctx as any)?.landAreaM2 || (ctx as any)?.platAreaSqm || supplemental.land_area_m2 || 0),
      explicitPyeong: Number((supplemental as any).land_area_pyeong || 0),
      memoSqm: readSsotLayerAreas((buildingSsotLite as any)?.layers, { memoText: (buildingSsotLite as any)?.raw_input }).landSqm,
      registerPlatSqm: br?.platArea,
      vworldSqm: readVworldLandAreaSqm(externalData),
    }).value;
    const siteAreaM2 = resolvedSiteArea;
    let registerLandAreaM2: number | undefined;
    if (Array.isArray(supplemental.parcels) && supplemental.parcels.length > 0) {
      // 다필지: 건물 전체 대지면적·대표 필지 공시지가를 필지별 값으로 복제하면 합계가 N배로 부풀려진다
      // (2026-10-05 p5 실측: 518.7㎡ ×3 = 1,556.1㎡ 가 land_detail·투자포인트에 노출) → 필지별 미확인은 '-' (Rule 34/37)
      const isMulti = supplemental.parcels.length > 1;
      for (const p of supplemental.parcels) {
        parcels.push({
          pnu: String(p.pnu || supplemental.resolved_pnu || externalData?.resolvedAddress?.pnu || '-'),
          // BrokerParcel 필드명(landCategory/officialPricePerM2/shareRatio)도 수용 — 기존엔 대표 필지 폴백에 가려져 있었음
          jimok: String(p.jimok || p.landCategory || (isMulti ? '-' : '대')),
          areaM2: Number(p.areaM2 || p.area_m2 || (isMulti ? 0 : siteAreaM2)),
          ownershipRatio: Number(p.ownershipRatio || p.ownership_ratio || p.shareRatio || 1),
          officialLandPricePerM2: Number(p.officialLandPricePerM2 || p.officialPricePerM2 || (isMulti ? 0 : lp?.pricePerSqm) || 0) || undefined,
        });
      }
      if (isMulti && siteAreaM2 > 0) registerLandAreaM2 = siteAreaM2;
    } else {
      const areaM2 = resolvedSiteArea;
      const pnu = supplemental.resolved_pnu || externalData?.resolvedAddress?.pnu || '';
      if (areaM2 > 0 || pnu) {
        parcels.push({
          pnu: pnu || '1100000000',
          jimok: String((supplemental as any)?.jimok || '대'),
          areaM2: areaM2 || 0,
          ownershipRatio: 1,
          officialLandPricePerM2: lp?.pricePerSqm || undefined,
        });
      }
    }

    const zoning = lu?.zoningDistrict || String((ctx.assetIdentity as any)?.zoning || (buildingSsotLite as any)?.physicalFact?.zoning_district || (buildingSsotLite as any)?.physicalFact?.zoningDistrict || (supplemental as any)?.zoning || '-');
    // 법정 한도는 공식 조회값만 (legal-limits.ts) — 용도지역명 추정치(lu.buildingCoverageMax 등)는 '현황 건폐율/법정 용적률'로 쓰지 않는다.
    const officialLimits = verifiedLegalLimits(lu as Record<string, any> | undefined);
    const buildingCoverageRatio = br?.bcRat || (supplemental.regulation as any)?.bcRat || undefined;
    const floorAreaRatio = br?.vlRat || (supplemental.regulation as any)?.vlRat || undefined;
    const maxFar = officialLimits.farMax || (supplemental.regulation as any)?.maxFar || undefined;
    const landShape = lu?.landShape || (supplemental.regulation as any)?.landShape || undefined;
    const landTopography = lu?.terrain || (supplemental.regulation as any)?.landTopography || undefined;
    const roadFrontage = lu?.roadAccess || (supplemental.regulation as any)?.roadFrontage || undefined;

    const result = renderLandDetail({
      parcels,
      zoning,
      buildingCoverageRatio,
      floorAreaRatio,
      maxFar,
      landShape,
      landTopography,
      roadFrontage,
      registerLandAreaM2,
    });

    const finalSection: MobileIMSection = {
      section_type: sectionType,
      section_order: sectionIndex + 1,
      title: getSectionTitle(sectionType, (buildingSsotLite as any)?.asset_type as string),
      markdown: result.markdown,
      confidence: 'confirmed',
      boundary_note: "본 섹션의 내용은 예비 검토용입니다.",
      provenance: sectionProvenance,
      judge_score: undefined,
      min_tier: "public",
    };
    if (input.onProgress) input.onProgress(finalSection);
    return { section: finalSection, generatedByAi: false, cachedFinancials: null };
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
    }).catch((err) => { log.warn({ err: err }, '[im-section-generator]'); });

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
        // D37 P2-1: 멱등 단언 — temperature: 0 + seed 고정
        // Claim 수치는 결정론적이므로 항상 동일, LLM 설명은 temperature:0으로 최대한 일치
        temperature: 0,
        maxTokens: effectiveMaxTokens,
      },
      {
        cacheKey: `mobile-im-${sectionType}-${String(ctx.buildingId ?? "")}-${String(ctx.assetIdentity.area_signal ?? "").slice(0, 20)}-${String(ctx.assetIdentity.asset_type ?? "").slice(0, 20)}`,
        // FAST_MODE: 30초, 일반: 90초 (gpt-5.6-terra 등 대형 모델 대응)
        timeoutMs: input.timeoutMs ?? (IM_FAST_MODE ? 30000 : 90000),
        allowMock: process.env.NODE_ENV === 'test', // 쿼터 소진 시 Mock 샘플이 실제 데이터로 유입되는 것 방지
      },
    );

    // [H05] 토큰 텔레메트리 연동 (비동기 DB 로깅)
    import("../../../ai/cost-tracker").then(mod => {
      mod.logGenerationCost({
        buildingId: String(ctx.buildingId ?? "unknown"),
        brokerId: "system",
        modelName: IM_AI_MODEL,
        sectionType,
        inputTokens: Math.round(result.tokens * 0.8),
        outputTokens: Math.round(result.tokens * 0.2),
        jobId: ctx.generationId
      }).catch(() => {});
    }).catch(() => {});

    const rawText = result.content.trim();
    if (rawText.length > 120) {
      const { detectHallucination } = await import("./im-context-builder");
      const halluCheck = detectHallucination(rawText, ctx.purchasePriceKrw, ctx.totalAreaSqm);
      if (halluCheck.anomaly) {
        log.warn(`[im-section-generator] Hallucination in ${sectionType}: ${halluCheck.reason} → template fallback`);
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
              updateFewShotResultScore(ctx.generationId, sectionType, judgeResult.overall).catch((err) => { log.warn({ err: err }, '[im-section-generator]'); });
              if (judgeResult.overall >= 4.5) {
                promoteToGoldenCandidate(
                  ctx.generationId,
                  String(buildingSsotLite.id ?? buildingSsotLite.building_ssot_lite_id ?? ""),
                  String(ctx.assetIdentity.asset_type ?? ""),
                  String(ctx.assetIdentity.price_band ?? ""),
                  sectionType,
                  rawText,
                  judgeResult.overall,
                ).catch((err) => { log.warn({ err: err }, '[im-section-generator]'); });
              }
              if (judgeResult.overall < 3.0) {
                log.warn(`[im-judge] Section ${sectionType} score ${judgeResult.overall.toFixed(1)} → template fallback`);
                judgeRejected = true;
              }
            }
          } catch (judgeErr) {
            log.warn({ judgeErr: judgeErr }, `[im-judge] Judge failed for ${sectionType}, skipping:`);
          }
        }

        if (!judgeRejected) {
          markdown = rawText;
          generatedByAi = true;
        }
      }
    }
  } catch (err) {
    log.warn({ err: err }, `[im-section-generator] AI failed for ${sectionType}, using template:`);
  }

  // AI 실패 시 안전하고 풍부한 프리미엄 템플릿으로 복구 (섹션 실종/깡통화 방지)
  if (!generatedByAi) {
    log.warn(`[im-section-generator] ${sectionType} 프리미엄 템플릿으로 생성`);
    markdown = generatePremiumTemplate(
      sectionType,
      ctx.assetIdentity as any,
      ctx.physicalFact as any,
      ctx.marketLocation as any,
      ctx.buyerFit as any,
      supplemental,
      externalData,
      buildingSsotLite as any,
      posture
    );
  }

  // ── JSON 리크 방어 가드 (D-JSON-LEAK) ──
  // AI가 프롬프트에 주입된 JSON 데이터(SSoT, 외부 데이터, 메모 파싱 결과 등)를
  // 마크다운 본문에 그대로 포함시키는 환각을 탐지하고 제거합니다.
  // 근본 원인: narrative-prompt.ts line 250에서 JSON.stringify(bssotLite)를 프롬프트에 전달,
  // LLM이 이를 "데이터"가 아닌 "콘텐츠"로 오인하여 출력에 포함시키는 경우 발생.
  markdown = stripJsonLeaks(markdown, sectionType);
  if (generatedByAi && markdown.trim().length < 30) {
    log.warn(`[im-section-generator] ${sectionType} stripJsonLeaks 후 내용 소실. 프리미엄 템플릿으로 복구합니다.`);
    generatedByAi = false;
    markdown = generatePremiumTemplate(
      sectionType,
      ctx.assetIdentity as any,
      ctx.physicalFact as any,
      ctx.marketLocation as any,
      ctx.buyerFit as any,
      supplemental,
      externalData,
      buildingSsotLite as any,
      posture
    );
  }
  // value-add 테이블 추가 (수익형 포스처에서만 유효)
  if (sectionType === "investment_thesis" && ctx.valueAddMarkdown && posture === "income") {
    markdown += `\n\n${ctx.valueAddMarkdown}`;
  }

  // 렌트롤 deterministic 테이블 주입: floor_leases가 있으면 LLM 생성 테이블을 교체/보강
  // LLM이 '6-7F' → '6층' 등으로 재인덱싱하는 할루시네이션 방지 및 풀 테이블+요약 동시 노출
  if ((sectionType === "lease_status" || sectionType === "income_analysis") && supplemental.floor_leases && supplemental.floor_leases.length > 0) {
    try {
      const normalized = normalizeFloorLeases(supplemental.floor_leases);
      // v1.5 §9.1: 표 머리글·값은 입력 단위(G9) 그대로. 용어 정규화(평→'N평(약 X㎡)')에서 제외하도록 보호 블록으로 감싼다.
      const deterministicTable = formatRentRollMarkdown(normalized, supplemental.rent_roll_meta);
      const summaryTable = formatRentRollSummary(normalized);
      const fullRentRollBlock = protectBlock(`${deterministicTable}\n\n${summaryTable}`);

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
      log.warn({ e: e }, '[im-section-generator] Deterministic rent roll table failed:');
    }
  }

  // 용어 정규화 (보호 블록 = 결정적 렌트롤 표는 제외, 마커는 항상 제거)
  const normResult = await normalizeTerminologyAsync(markdown);
  if (normResult.replaced.length > 0) {
    markdown = normResult.text;
  } else {
    markdown = stripProtectMarkers(markdown);
  }

  // 갱신요구권 연수 환각 정제: 최초계약일이 미제출된 경우 "N년 잔여" 단정 표현을 "최초계약일 확인 필요"로 치환 (불변조건 7)
  const hasMissingFirstContractDates = !supplemental.floor_leases || supplemental.floor_leases.some(
    (l: any) => !l.first_contract_date && !l.firstContractDate
  );
  if (hasMissingFirstContractDates) {
    markdown = markdown.replace(/갱신요구권\s*\d+(?:\.\d+)?\s*년(?:\s*잔여)?/g, '계약갱신요구권(최초계약일 확인 필요)');
    markdown = markdown.replace(/갱신권\s*\d+(?:\.\d+)?\s*년(?:\s*잔여)?/g, '갱신권(최초계약일 확인 필요)');
  }

  // D1(오너 결정): IM 은 실제 임차인명(렌트롤 상호)을 그대로 표기한다 — 구 '[임차인A]' 전량 마스킹 폐지.
  // 공개 티저/매거진(NDA 이전)만 업종 대체 마스킹 유지 (guardrails publicBlocked 경로).
  // 대신 날조 검증: 유명 브랜드가 본문에 있는데 렌트롤(floor_leases)에는 없으면 LLM 이 만든 상호 → 그 브랜드만 치환.
  // 입지(location_access) 섹션의 주변 상권 언급은 건물 임차인 주장이 아니므로 검증 대상에서 제외한다.
  if (sectionType !== "location_access") {
    const brandCheck = maskFabricatedBrands(markdown, supplemental.floor_leases as any[] | undefined);
    if (brandCheck.flagged.length > 0) {
      log.warn({ flagged: brandCheck.flagged }, `[im-section-generator] ${sectionType} 렌트롤에 없는 유명 브랜드 날조 의심 — 치환`);
      markdown = brandCheck.text;
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

  // CRE Quality Gate (Fast mode 스킵, 고점수 judge 통과 섹션도 스킵)
  // D33 M-H: 정적 합성 문구에도 적용하되, judge ≥4.0 이면 이미 검증된 것으로 간주하여 Gate 호출 생략
  if (!IM_FAST_MODE && !(finalSectionJudgeScore !== undefined && finalSectionJudgeScore >= 4.0)) {
    try {
      let gateResult = await runCREQualityGate(markdown, sectionType, posture);
      // high-risk AI 초안 → 지적 발췌만 1회 교정 후 게이트 재검증. 재검증 high/교정 실패면 아래 기존 템플릿 복구 유지.
      // (게이트 시스템 실패는 교정 대상 아님 — BL-6 fail-closed)
      if (!gateResult.passed && gateResult.riskLevel === "high" && generatedByAi && !isGateSystemFailure(gateResult.issues)) {
        let repaired = await repairDraftForGate(markdown, sectionType, gateResult.issues, IM_AI_MODEL, (SECTION_MAX_TOKENS[sectionType] ?? 1000) * 2);
        if (repaired) {
          const repairedRisk = runRiskBoundaryCheck(repaired, sectionType);
          if (repairedRisk.safe_text) repaired = repairedRisk.safe_text;
          const regate = await runCREQualityGate(repaired, sectionType, posture);
          if (regate.riskLevel !== "high") {
            log.info(`[cre-gate-repair] ${sectionType} 교정본 채택 (재검증 ${regate.riskLevel}, 원 지적 ${gateResult.issues.length}건)`);
            markdown = repaired;
            gateResult = regate;
          } else {
            log.warn(`[cre-gate-repair] ${sectionType} 교정본도 high → 템플릿 복구`);
          }
        }
      }
      if (!gateResult.passed && gateResult.riskLevel === "high") {
        log.warn(
          { issues: gateResult.issues.map(i => `${i.type}: ${i.excerpt.slice(0, 40)}`) },
          `[cre-quality-gate] ${sectionType} high risk detected (${gateResult.issues.length} issues) — 프리미엄 템플릿으로 안전하게 복구`
        );
        markdown = generatePremiumTemplate(
          sectionType,
          ctx.assetIdentity as any,
          ctx.physicalFact as any,
          ctx.marketLocation as any,
          ctx.buyerFit as any,
          supplemental,
          externalData,
          buildingSsotLite as any,
          posture
        );
        generatedByAi = false;
      } else if (!gateResult.passed && gateResult.riskLevel === "medium") {
        // Graduated response: medium 위험은 AI 원문을 보존하되 면책 가드로 보강
        log.info(
          `[cre-quality-gate] ${sectionType} medium risk detected (${gateResult.issues.length} issues) — AI 원문 유지 및 면책 보강 적용`,
          gateResult.issues.map(i => `${i.type}: ${i.excerpt.slice(0, 40)}`)
        );
      }
    } catch (gateErr) {
      log.warn({ gateErr: gateErr }, `[cre-quality-gate] Gate failed for ${sectionType}, skipping:`);
    }
  } else if (finalSectionJudgeScore !== undefined && finalSectionJudgeScore >= 4.0) {
    log.info(`[cre-quality-gate] ${sectionType} skipped (judge score ${finalSectionJudgeScore.toFixed(1)} ≥ 4.0)`);
  }

  // Disclosure Guard
  // D1: IM 경로는 실제 임차인명 표기 → tenant_name 마스커만 제외 (주소·연락처·인명·호실별 임대료 등은 기존대로 가드)
  const disclosureCheck = runDisclosureGuard(markdown, { allowFields: ['tenant_name'] });
  if (disclosureCheck.status !== "pass") markdown = disclosureCheck.safe_text;

  // Sanitize markdown headings that may leak from AI or templates
  // 1) 인라인 heading을 별도 줄로 분리 ("자산입니다. ### 🚇 교통" → 별도 줄)
  markdown = markdown.replace(/([^\n])\s+(#{1,6})\s+/g, '$1\n\n$2 ');
  // 2) 줄 시작의 # heading → bold 텍스트로 변환 (section-card가 이미 제목을 제공)
  markdown = markdown.replace(/^#{1,6}\s+(.+)$/gm, '**$1**');
  // 3) 잔여 #해시태그 (# 뒤 공백 없이 한글/이모지) → # 제거
  markdown = markdown.replace(/(?:^|\s)#([가-힣\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2702}-\u{27B0}])/gmu, ' $1');
  // 4) Bug 4/5 근본 수정: 줄바꿈이 필요한 패턴 앞에 강제 빈 줄 삽입
  // - 이모지로 시작하는 문장 (전체 유니코드 이모지 범위)
  // - 리스트 항목 (-, *, 1.)
  // - **볼드** 로 시작하는 항목
  // (마크다운에서는 단일 줄바꿈이 스페이스로 처리되므로 이중 줄바꿈 필요)
  markdown = markdown.replace(/([^\n])\n(?=- |\* |\d+\. |\*\*|[\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2702}-\u{27B0}\u{23E9}-\u{23F3}\u{231A}\u{231B}\u{25AA}-\u{25FE}\u{2934}\u{2935}\u{2B05}-\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}])/gmu, '$1\n\n');

  // 5) 인라인 뷸렛/헤더/테이블 줄바꿈 누락 완벽 정규화
  markdown = normalizeSectionMarkdown(markdown);

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

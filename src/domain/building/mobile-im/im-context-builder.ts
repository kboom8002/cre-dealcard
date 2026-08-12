/**
 * @file im-context-builder.ts
 * @description IM 생성 전처리 및 컨텍스트 빌드 모듈
 * writer.ts Phase 0 분해: 전처리 로직 추출
 */

import { buildProvenanceMap } from './data-provenance';
import { type SectionContext, MOBILE_IM_NARRATIVE_SYSTEM, buildPostureAwareSystemPrompt } from './narrative-prompt';
import { type FinancialOutputs } from './financials';
import { computeValueAddScenarios } from './value-add-engine';
import { generateRAGContext } from './cre-rag-service';
import { CrePromptRegistry } from './cre-prompt-registry';
import { normalizeTerminologyAsync } from './terminology-normalizer';
import { getLogisticsPromptOverlay } from './logistics-im-prompt';
import { createServiceClient } from '@/lib/supabase/service';
import type { MobileIMWriterInput } from './types';
import { getSectionPlan } from './section-catalog';
import { suggestArchetype } from './archetype-registry';

// ─── Flat 구조 → 중첩 구조 정규화 ──────────────────────────────────────────
/**
 * DB flat 컬럼 (area_signal, asset_type …) 또는 legacy 중첩 구조
 * 양쪽을 모두 지원하는 정규화 함수.
 */
import type { BuildingSSoTLite } from '../building-ssot-lite.types';

export function normalizeSsotLite(rawInput: BuildingSSoTLite): {
  assetIdentity: Record<string, unknown>;
  physicalFact:  Record<string, unknown>;
  marketLocation: Record<string, unknown>;
  buyerFit:      Record<string, unknown>;
  flat:          Record<string, unknown>;
} {
  const raw = rawInput as any;
  // legacy 중첩 구조가 이미 있으면 그대로 사용 (BuildingSSoTLite에는 flat으로 선언되어 있음)
  const legacyAssetIdentity  = raw.asset_identity  ?? {};
  const legacyPhysicalFact   = raw.physical_fact   ?? {};
  const legacyMarketLocation = raw.market_location ?? {};
  const legacyBuyerFit       = raw.buyer_fit       ?? {};

  // flat → 중첩으로 병합 (flat 우선)
  const assetIdentity: Record<string, unknown> = {
    area_signal:    raw.area_signal    ?? legacyAssetIdentity.area_signal,
    asset_type:     raw.asset_type     ?? legacyAssetIdentity.asset_type,
    price_band:     raw.price_band     ?? legacyAssetIdentity.price_band,
    size_signal:    raw.size_signal    ?? legacyAssetIdentity.size_signal ?? legacyPhysicalFact.size_signal,
    price_band_krw: raw.price_band_krw ?? legacyAssetIdentity.price_band_krw,
  };

  const physicalFact: Record<string, unknown> = {
    size_signal:    raw.size_signal       ?? legacyPhysicalFact.size_signal,
    vacancy_signal: raw.vacancy_signal    ?? legacyPhysicalFact.vacancy_signal,
    total_area_sqm: raw.total_area_sqm    ?? legacyPhysicalFact.total_area_sqm,
    current_use:    raw.current_use_signal ?? legacyPhysicalFact.current_use,
  };

  const marketLocation: Record<string, unknown> = {
    location_analysis: raw.location_analysis ?? legacyMarketLocation.location_analysis,
    address:           raw.address           ?? legacyMarketLocation.address,
  };

  const buyerFit: Record<string, unknown> = {
    fit_summary:    raw.fit_summary      ?? legacyBuyerFit.fit_summary,
    caution_summary: raw.caution_summary ?? legacyBuyerFit.caution_summary,
  };

  return { assetIdentity, physicalFact, marketLocation, buyerFit, flat: raw as unknown as Record<string, unknown> };
}

// ─── 가격대 문자열에서 KRW 추출 ──────────────────────────────────────────────
export function parsePriceBandKrw(priceBand: unknown): number {
  if (!priceBand) return 0;
  const str = String(priceBand);
  // "80억대" → 80억 → 8_000_000_000
  // "70억~85억" → 중간값 77.5억
  const billions = str.match(/(\d+(?:\.\d+)?)\s*억/g);
  if (!billions || billions.length === 0) return 0;
  const values = billions.map((b) => parseFloat(b.replace(/[억\s]/g, "")) * 1e8);
  return Math.round(values.reduce((a, c) => a + c, 0) / values.length);
}

// ─── Hallucination Guard ──────────────────────────────────────────────────────
export function detectHallucination(
  text: string,
  purchasePriceKrw: number,
  totalAreaSqm: number
): { anomaly: boolean; reason?: string } {
  if (purchasePriceKrw > 0) {
    const priceMatches = text.match(/(\d[\d,]*)\s*억/g);
    if (priceMatches) {
      for (const m of priceMatches) {
        const val = parseInt(m.replace(/[,억\s]/g, ""), 10) * 1e8;
        if (!isNaN(val) && val > 0 && (val > purchasePriceKrw * 20 || (val < purchasePriceKrw / 20 && val > 5e8))) {
          return { anomaly: true, reason: `price_outlier: ${m} (expected ~${(purchasePriceKrw / 1e8).toFixed(0)}억)` };
        }
      }
    }
  }
  if (totalAreaSqm > 10) {
    const areaMatches = text.match(/(\d[\d,]*(?:\.\d+)?)\s*㎡/g);
    if (areaMatches) {
      for (const m of areaMatches) {
        const val = parseFloat(m.replace(/[,㎡\s]/g, ""));
        if (!isNaN(val) && val > 0 && val > totalAreaSqm * 10) {
          return { anomaly: true, reason: `area_outlier: ${m} (expected ~${totalAreaSqm.toFixed(0)}㎡)` };
        }
      }
    }
  }
  return { anomaly: false };
}

export async function deepNormalizeStringsAsync<T>(obj: T): Promise<T> {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    const res = await normalizeTerminologyAsync(obj);
    return res.text as any;
  }
  if (Array.isArray(obj)) {
    return Promise.all(obj.map(item => deepNormalizeStringsAsync(item))) as any;
  }
  if (typeof obj === 'object') {
    const res: any = {};
    for (const key of Object.keys(obj)) {
      res[key] = await deepNormalizeStringsAsync((obj as any)[key]);
    }
    return res;
  }
  return obj;
}

export interface IMGenerationContext {
  assetIdentity: Record<string, unknown>;
  physicalFact: Record<string, unknown>;
  marketLocation: Record<string, unknown>;
  buyerFit: Record<string, unknown>;
  flat: Record<string, unknown>;
  provenanceMap: ReturnType<typeof buildProvenanceMap>;
  purchasePriceKrw: number;
  totalAreaSqm: number;
  vacancyPct: number;
  valueAddMarkdown: string | null;
  sectionCtx: SectionContext;
  ragCtx: string;
  sysPromptText: string;
  promptVariantId: string;
  isLogistics: boolean;
  cachedFinancials: FinancialOutputs | null;
  generationId: string;
  sectionPlan: import('./section-catalog').SectionPlan;
  archetype: import('./archetype-registry').ArchetypeCode | null;
}

/**
 * IM 생성에 필요한 초기 컨텍스트를 빌드하는 메인 함수
 */
export async function buildIMContext(
  input: MobileIMWriterInput
): Promise<IMGenerationContext> {
  const { building_ssot_lite, external_data } = input;
  const supplemental = await deepNormalizeStringsAsync(input.supplemental);
  const generationId = 'gen_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();

  // v2: flat → 정규화
  const { assetIdentity, physicalFact, marketLocation, buyerFit, flat } = normalizeSsotLite(building_ssot_lite);

  // 정규화된 구조로 provenance 맵 구축
  const normalizedForProvenance: Record<string, unknown> = {
    asset_identity:  assetIdentity,
    physical_fact:   physicalFact,
    market_location: marketLocation,
    buyer_fit:       buyerFit,
  };

  const provenanceMap = buildProvenanceMap(
    normalizedForProvenance,
    external_data || null,
    supplemental
  );

  // 매매가 추출 (KRW) — 바텀시트 입력값 우선, SSoT price_band 폴백
  const askingPriceKrw = supplemental.asking_price_manwon
    ? supplemental.asking_price_manwon * 10000
    : 0;
  const purchasePriceForGuard =
    askingPriceKrw ||
    parsePriceBandKrw(assetIdentity.price_band) ||
    Number(assetIdentity.price_band_krw ?? 0);

  const totalAreaForGuard =
    (external_data?.buildingRegister?.totalArea) ??
    Number(physicalFact.total_area_sqm ?? 0);

  // ── value-add 사전 계산 (공실 또는 월세 데이터 있을 때) ──────────────────
  let valueAddMarkdown: string | null = null;
  const vacancyStr = String(physicalFact.vacancy_signal ?? supplemental.vacancy_status ?? "");
  let vacancyPct = vacancyStr.includes("완전") || vacancyStr.includes("만실") ? 0
    : vacancyStr.includes("거의 만실") ? 5
    : vacancyStr.includes("반공실") ? 50
    : vacancyStr.includes("전체 공실") || vacancyStr.includes("올공실") ? 100
    : vacancyStr.includes("공실") ? 30
    : vacancyStr.match(/(\d+)\s*%/) ? parseInt(vacancyStr.match(/(\d+)\s*%/)![1], 10)
    : 0;

  if (supplemental.monthly_rent_total_krw && supplemental.monthly_rent_total_krw > 0 && purchasePriceForGuard > 0) {
    try {
      const monthlyRent = supplemental.monthly_rent_total_krw;
      const annualNoi = monthlyRent * 12 * 0.85;
      const vaResult = computeValueAddScenarios({
        currentNoi: annualNoi,
        purchasePriceKrw: purchasePriceForGuard,
        currentVacancyPct: vacancyPct,
        currentMonthlyRentKrw: monthlyRent,
        totalAreaSqm: totalAreaForGuard > 0 ? totalAreaForGuard : 500,
        assetType: String(assetIdentity.asset_type ?? ""),
      });
      valueAddMarkdown = vaResult.markdownTable;
    } catch (e) {
      console.warn("[mobile-im-writer] value-add computation failed:", e);
    }
  }

  // ── 건물 연식 사전 계산 (numericalAnchors 초기화 전 필요) ────────────────
  const approvalDateStr = (external_data?.buildingRegister as any)?.useAprDay as string | undefined;
  const buildingAge = approvalDateStr && approvalDateStr.length >= 4 
    ? new Date().getFullYear() - parseInt(approvalDateStr.substring(0, 4), 10) 
    : 0;

  // ── 상태 머신 맥락 초기화 (SOTA: 섹션 간 맥락 전파) ────────────────────
  const sectionCtx: SectionContext = {
    keyFacts: [],
    sectionSummaries: {},
    numericalAnchors: {
      totalAreaSqm: totalAreaForGuard || undefined,
      vacancyPct: vacancyPct || undefined,
      monthlyRentKrw: supplemental.monthly_rent_total_krw || undefined,
      capRateBase: undefined,
      buildingAge: buildingAge > 0 ? buildingAge : undefined,
    },
  };

  // ── 포스처 해석 (RAG 및 시스템 프롬프트 조립 전에 필요) ────────────────────────
  const posture = (
    (input as any).identity?.investmentPosture
    || (input.supplemental as any)?.investmentPosture
    || 'income'
  ) as import('@/domain/ontology').InvestmentPosture;

  // ── RAG 컨텍스트 사전 조회 (루프 밖으로 호이스팅 — B-4 수정) ────────────
  let ragCtx = "";
  try {
    const sb = createServiceClient();
    ragCtx = await generateRAGContext(
      sb as any,
      String(assetIdentity.asset_type ?? ""),
      String(marketLocation.address ?? ""),
      String(external_data?.buildingRegister?.buildingName ?? ""),
      posture
    );
  } catch (e) {
    console.warn("[mobile-im-writer] RAG context failed:", e);
  }

  // ── 프롬프트 레지스트리 사전 선택 (루프 밖 — A/B 일관성 보장) ─────────
  const registry = CrePromptRegistry.getInstance();
  const activeSysPrompt = registry.getActivePrompt("writer_system");
  
  const assetType = String(assetIdentity.asset_type ?? "").toLowerCase();
  const isLogistics = /물류|창고|warehouse|logistics/.test(assetType);
  let logisticsOverlay = "";
  if (isLogistics && supplemental.logistics) {
    logisticsOverlay = getLogisticsPromptOverlay(supplemental.logistics);
  }

  // (포스처 해석은 위로 이동됨)

  // P1-04: 비수익형 포스처의 공실률 보정 (development/trading은 "공실" 개념 부적합)
  if ((posture === 'development' || posture === 'trading') && vacancyPct === 0 && !vacancyStr) {
    // 명시적 공실률 입력이 없으면, 비수익형에서 0%(만실)로 기본값 설정하지 않음
    sectionCtx.numericalAnchors!.vacancyPct = undefined;
  }

  const sysPromptText = (activeSysPrompt ? activeSysPrompt.systemPrompt : buildPostureAwareSystemPrompt(posture)) + "\n" + logisticsOverlay;
  const promptVariantId = activeSysPrompt?.id ?? "default";
  console.info(`[mobile-im-writer] Prompt variant: ${promptVariantId} (v${activeSysPrompt?.version ?? "0"}), isLogistics=${isLogistics}, posture=${posture}`);

  // ── Hero Card용 재무 데이터 캐시 (루프 밖에서 접근) ────────────────────
  const cachedFinancials: FinancialOutputs | null = null;
  const sectionPlan = getSectionPlan(posture);

  const suggestion = suggestArchetype({ vacancyPct, buildingAge: buildingAge ?? 0, posture });
  const archetype = (input.supplemental as any)?.archetype_override || suggestion.primary;

  return {
    assetIdentity,
    physicalFact,
    marketLocation,
    buyerFit,
    flat,
    provenanceMap,
    purchasePriceKrw: purchasePriceForGuard,
    totalAreaSqm: totalAreaForGuard,
    vacancyPct,
    valueAddMarkdown,
    sectionCtx,
    ragCtx,
    sysPromptText,
    promptVariantId,
    isLogistics,
    cachedFinancials,
    generationId,
    sectionPlan,
    archetype,
  };
}

// src/domain/building/mobile-im/writer.ts
// 7섹션 Mobile IM 자동 생성 엔진.
//
// 전략: AI 우선 (GPT-4o via callLLM) → AI 실패 시 프리미엄 템플릿 폴백
// 모든 섹션에 Risk Boundary + Disclosure Guard + Hallucination Guard 적용.
// 데이터 출처 추적 (provenance) 포함.
//
// v2 — flat DB 구조 직접 지원 + value-add-engine 통합
//
// [Claude 전환 가이드]
// 1. callLLM({ model: "gpt-5.4", ... }) → callLLM({ model: "claude-sonnet-4-5", ... })
// 2. 프롬프트 내 XML 태그 구조로 변환 (narrative-prompt.ts 수정)
// 3. 환경변수: AI_IM_MODEL=claude-sonnet-4-5

import { callLLM } from "@/ai/llm-client";
import {
  MOBILE_IM_SECTIONS_7,
  type MobileIMSectionType,
  type MobileIMSection,
  type MobileIMSupplementalInput,
  type ExternalDataSnapshot,
} from "./types";
import { buildProvenanceMap, getSectionProvenance } from "./data-provenance";
import {
  buildNarrativeUserPrompt,
  MOBILE_IM_NARRATIVE_SYSTEM,
  type MarketIndicators,
  type SectionContext,
} from "./narrative-prompt";
import { runRiskBoundaryCheck, runDisclosureGuard, MOBILE_IM_STANDARD_DISCLAIMER } from "./guardrails";
import { calculateFinancials, formatFinancialsMarkdown } from "./financials";
import { computeValueAddScenarios } from "./value-add-engine";
import { judgeIMSection, shouldJudgeByConfidence } from "./im-judge";
import { runCREQualityGate } from "./cre-quality-gate";
import { extractKeyFacts, updateNumericalAnchors, runCrossValidation } from "./cross-validator";

export interface MobileIMWriterInput {
  building_ssot_lite: Record<string, unknown>;
  supplemental: MobileIMSupplementalInput;
  readiness: { score: number; missing: string[] };
  external_data?: ExternalDataSnapshot | null;
}

export interface MobileIMWriterOutput {
  sections: MobileIMSection[];
  boundary_note: string;
  generated_at: string;
  ai_used: boolean;
}

/** AI 모델 설정 — 환경변수로 교체 가능 */
const IM_AI_MODEL = process.env.AI_IM_MODEL || process.env.AI_DEFAULT_MODEL || "gpt-5.4";

// ─── Flat 구조 → 중첩 구조 정규화 ──────────────────────────────────────────
/**
 * DB flat 컬럼 (area_signal, asset_type …) 또는 legacy 중첩 구조
 * 양쪽을 모두 지원하는 정규화 함수.
 */
function normalizeSsotLite(raw: Record<string, unknown>): {
  assetIdentity: Record<string, unknown>;
  physicalFact:  Record<string, unknown>;
  marketLocation: Record<string, unknown>;
  buyerFit:      Record<string, unknown>;
  flat:          Record<string, unknown>;
} {
  // legacy 중첩 구조가 이미 있으면 그대로 사용
  const legacyAssetIdentity  = (raw.asset_identity  ?? {}) as Record<string, unknown>;
  const legacyPhysicalFact   = (raw.physical_fact   ?? {}) as Record<string, unknown>;
  const legacyMarketLocation = (raw.market_location ?? {}) as Record<string, unknown>;
  const legacyBuyerFit       = (raw.buyer_fit       ?? {}) as Record<string, unknown>;

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

  return { assetIdentity, physicalFact, marketLocation, buyerFit, flat: raw };
}

// ─── 가격대 문자열에서 KRW 추출 ──────────────────────────────────────────────
function parsePriceBandKrw(priceBand: unknown): number {
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
function detectHallucination(
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

// ─── 메인 생성 함수 ───────────────────────────────────────────────────────────
export async function generateMobileIM(input: MobileIMWriterInput): Promise<MobileIMWriterOutput> {
  const { building_ssot_lite, supplemental, external_data } = input;
  const sections: MobileIMSection[] = [];
  let aiUsed = false;

  // v2: flat → 정규화
  const { assetIdentity, physicalFact, marketLocation, buyerFit } = normalizeSsotLite(building_ssot_lite);

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

  // 매매가 추출 (KRW)
  const purchasePriceForGuard =
    parsePriceBandKrw(assetIdentity.price_band) ||
    Number(assetIdentity.price_band_krw ?? 0);

  const totalAreaForGuard =
    (external_data?.buildingRegister?.totalArea) ??
    Number(physicalFact.total_area_sqm ?? 0);

  // ── value-add 사전 계산 (공실 또는 월세 데이터 있을 때) ──────────────────
  let valueAddMarkdown: string | null = null;
  const vacancyStr = String(physicalFact.vacancy_signal ?? supplemental.vacancy_status ?? "");
  const vacancyPct = vacancyStr.includes("완전") ? 0
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
        totalAreaSqm: totalAreaForGuard || 500,
        assetType: String(assetIdentity.asset_type ?? ""),
      });
      valueAddMarkdown = vaResult.markdownTable;
    } catch (e) {
      console.warn("[mobile-im-writer] value-add computation failed:", e);
    }
  }

  // ── 상태 머신 맥락 초기화 (SOTA: 섹션 간 맥락 전파) ────────────────────
  const sectionCtx: SectionContext = {
    keyFacts: [],
    sectionSummaries: {},
    numericalAnchors: {
      totalAreaSqm: totalAreaForGuard || undefined,
      vacancyPct: vacancyPct || undefined,
      monthlyRentKrw: supplemental.monthly_rent_total_krw || undefined,
      capRateBase: undefined,
      buildingAge: undefined,
    },
  };

  // ── 섹션 루프 ──────────────────────────────────────────────────────────────
  for (let i = 0; i < MOBILE_IM_SECTIONS_7.length; i++) {
    const sectionType = MOBILE_IM_SECTIONS_7[i];
    let markdown = "";
    let confidence: "confirmed" | "inferred" | "needs_check" = "inferred";

    const sectionProvenance = getSectionProvenance(sectionType, provenanceMap);

    // income_analysis 섹션: 사전 재무 계산
    let sectionMarketIndicators: MarketIndicators | undefined;
    if (
      sectionType === "income_analysis" &&
      supplemental.monthly_rent_total_krw &&
      purchasePriceForGuard > 0
    ) {
      try {
        const fin = calculateFinancials({
          monthlyRentKrw:   supplemental.monthly_rent_total_krw,
          purchasePriceKrw: purchasePriceForGuard,
          landPricePerSqm:  external_data?.landPrice?.pricePerSqm,
          totalAreaSqm:     totalAreaForGuard || undefined,
          platAreaSqm:      external_data?.buildingRegister?.platArea ?? undefined,
          assetType:        String(assetIdentity.asset_type ?? ""),
        });
        sectionMarketIndicators = { financialsMarkdown: formatFinancialsMarkdown(fin) };
      } catch {
        // 무시
      }
    }

    // ── AI 생성 시도 ───────────────────────────────────────────────────────
    let generatedByAi = false;
    try {
      // AI 프롬프트에 정규화된 구조 + 이전 섹션 맥락 전달
      const userPrompt = buildNarrativeUserPrompt(
        sectionType,
        normalizedForProvenance,
        external_data || null,
        supplemental,
        sectionMarketIndicators,
        i > 0 ? sectionCtx : undefined  // 첫 섹션에는 맥락 없음
      );

      const result = await callLLM(
        {
          systemPrompt: MOBILE_IM_NARRATIVE_SYSTEM,
          userPrompt,
          model: IM_AI_MODEL,
          temperature: 0.3,
          maxTokens: 900,
        },
        {
          cacheKey: `mobile-im-${sectionType}-${String(assetIdentity.area_signal ?? "").slice(0, 20)}-${String(assetIdentity.asset_type ?? "").slice(0, 20)}`,
          timeoutMs: 25000,
        }
      );

      const rawText = result.content.trim();
      if (rawText.length > 50) {
        const halluCheck = detectHallucination(rawText, purchasePriceForGuard, totalAreaForGuard);
        if (halluCheck.anomaly) {
          console.warn(`[mobile-im-writer] Hallucination in ${sectionType}: ${halluCheck.reason} → template fallback`);
        } else {
          // SOTA: LLM-as-Judge 의미론적 검증 (confidence 기반 확률적 샘플링)
          let judgeRejected = false;
          if (shouldJudgeByConfidence(confidence)) {
            try {
              const judgeResult = await judgeIMSection({
                sectionMarkdown: rawText,
                sectionType,
                bssotData: normalizedForProvenance,
                externalData: (external_data as Record<string, unknown>) || null,
                supplementalData: supplemental as unknown as Record<string, unknown>,
                financialsMarkdown: sectionMarketIndicators?.financialsMarkdown,
              });
              if (judgeResult && judgeResult.overall < 3.0) {
                console.warn(`[im-judge] Section ${sectionType} score ${judgeResult.overall.toFixed(1)} → template fallback`);
                judgeRejected = true;
              }
            } catch (judgeErr) {
              console.warn(`[im-judge] Judge failed for ${sectionType}, skipping:`, judgeErr);
            }
          }

          if (!judgeRejected) {
            markdown = rawText;
            generatedByAi = true;
            aiUsed = true;
          }
        }
      }
    } catch (err) {
      console.warn(`[mobile-im-writer] AI failed for ${sectionType}, using template:`, err);
    }

    // AI 실패 → 프리미엄 템플릿 폴백
    if (!generatedByAi) {
      markdown = generatePremiumTemplate(
        sectionType,
        assetIdentity,
        physicalFact,
        marketLocation,
        buyerFit,
        supplemental,
        external_data || null
      );
    }

    // ── value-add 테이블 추가 (investment_thesis 섹션) ─────────────────────
    if (sectionType === "investment_thesis" && valueAddMarkdown) {
      markdown += `\n\n${valueAddMarkdown}`;
    }

    // ── 카카오 지도 이미지 추가 (location_access 섹션) ────────────────────
    if (sectionType === "location_access" && external_data?.mapImageUrl) {
      markdown += `\n\n![입지 지도](${external_data.mapImageUrl})`;
    }

    // Risk Boundary 가드레일 (Regex 기반)
    const riskCheck = runRiskBoundaryCheck(markdown, sectionType);
    if (riskCheck.safe_text) markdown = riskCheck.safe_text;

    // SOTA: LLM 기반 Quality Gate (Regex가 놓친 패러프레이징 감지)
    if (generatedByAi) {
      try {
        const gateResult = await runCREQualityGate(markdown, sectionType);
        if (!gateResult.passed && gateResult.riskLevel === 'high') {
          console.warn(`[cre-quality-gate] Section ${sectionType} BLOCKED → template fallback`);
          markdown = generatePremiumTemplate(
            sectionType, assetIdentity, physicalFact, marketLocation,
            buyerFit, supplemental, external_data || null
          );
        }
      } catch (gateErr) {
        console.warn(`[cre-quality-gate] Gate failed for ${sectionType}, skipping:`, gateErr);
      }
    }

    // Disclosure Guard
    const disclosureCheck = runDisclosureGuard(markdown);
    if (disclosureCheck.status !== "pass") markdown = disclosureCheck.safe_text;

    // 브로커 하이라이트 (investment_thesis 전용)
    if (sectionType === "investment_thesis" && supplemental.broker_highlight) {
      markdown += `\n\n> **전문가 한줄 의견**: "${supplemental.broker_highlight}"`;
    }

    // 섹션 confidence
    if (sectionProvenance.length > 0) {
      const hasNeedsCheck = sectionProvenance.some((p) => p.confidence === "needs_check");
      const allConfirmed  = sectionProvenance.every((p) => p.confidence === "confirmed");
      confidence = hasNeedsCheck ? "needs_check" : allConfirmed ? "confirmed" : "inferred";
    }

    sections.push({
      section_type:  sectionType,
      section_order: i + 1,
      title:         getSectionTitle(sectionType),
      markdown,
      confidence,
      boundary_note: "본 섹션의 내용은 예비 검토용입니다.",
      provenance:    sectionProvenance,
    });

    // SOTA: 섹션 생성 후 맥락 업데이트 (다음 섹션에 전파)
    try {
      const newFacts = extractKeyFacts(markdown, sectionType);
      sectionCtx.keyFacts.push(...newFacts);
      sectionCtx.sectionSummaries[sectionType] = markdown.slice(0, 200);
      updateNumericalAnchors(sectionCtx.numericalAnchors, markdown, sectionType);
    } catch {
      // 맥락 추출 실패는 무시
    }
  }

  // ── SOTA: 섹션 간 교차 검증 ────────────────────────────────────────────
  try {
    const crossValResult = runCrossValidation(sections, sectionCtx.numericalAnchors);
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

  return {
    sections,
    boundary_note: MOBILE_IM_STANDARD_DISCLAIMER,
    generated_at:  new Date().toISOString(),
    ai_used:       aiUsed,
  };
}

// ─── 섹션 타이틀 매핑 ─────────────────────────────────────────────────────────
function getSectionTitle(sectionType: MobileIMSectionType): string {
  const titles: Record<MobileIMSectionType, string> = {
    property_overview: "🏢 자산 개요 및 제원",
    location_access:   "📍 입지 및 대중교통 분석",
    lease_status:      "📊 임대차 현황 및 공실 상태",
    income_analysis:   "💸 수익률 및 공시지가 분석",
    risk_check:        "⚖️ 공법 규제 및 리스크 진단",
    investment_thesis: "🎯 핵심 투자 메리트",
    next_steps:        "📅 향후 검토 및 진행 절차",
  };
  return titles[sectionType];
}

// ─── 프리미엄 템플릿 엔진 ─────────────────────────────────────────────────────
function generatePremiumTemplate(
  sectionType: MobileIMSectionType,
  assetIdentity: Record<string, unknown>,
  physicalFact: Record<string, unknown>,
  marketLocation: Record<string, unknown>,
  buyerFit: Record<string, unknown>,
  supplemental: MobileIMSupplementalInput,
  externalData: ExternalDataSnapshot | null
): string {
  const br   = externalData?.buildingRegister;
  const lu   = externalData?.landUsePlan;
  const lp   = externalData?.landPrice;
  const poi  = externalData?.locationPoi;
  const comps = externalData?.comparableTransactions;

  const totalArea   = br?.totalArea    || 0;
  const platArea    = br?.platArea     || 0;
  const floorsAbove = br?.floorsAbove  || 0;
  const floorsBelow = br?.floorsBelow  || 0;
  const zoningDistrict = lu?.zoningDistrict || "일반상업지역";
  const useAprDay  = br?.useAprDay    || "20150601";
  const structure  = br?.structure    || "철근콘크리트구조";
  const mainPurpose = br?.mainPurpose || "업무시설";
  const useAprYear = useAprDay.substring(0, 4);
  const buildingAge = new Date().getFullYear() - parseInt(useAprYear, 10);
  const purchasePrice = parsePriceBandKrw(assetIdentity.price_band);
  const monthlyRent   = supplemental.monthly_rent_total_krw || 0;

  switch (sectionType) {
    // ─── 섹션 1: 자산 개요 ───────────────────────────────────────────────────
    case "property_overview": {
      const totalPyeong = totalArea > 0 ? `약 ${(totalArea * 0.3025).toFixed(0)}평` : "-";
      const platPyeong  = platArea  > 0 ? `약 ${(platArea  * 0.3025).toFixed(0)}평` : "-";
      const priceStr    = String(assetIdentity.price_band ?? "-");
      const areaStr     = String(assetIdentity.area_signal ?? "서울 핵심 권역");
      const assetType   = String(assetIdentity.asset_type  ?? "상업용 건물");
      const sizeSignal  = String(assetIdentity.size_signal ?? physicalFact.size_signal ?? "");

      return `**${areaStr}** 소재 **${assetType}** 물건입니다.

| 항목 | 내용 |
|------|------|
| **소재지** | ${areaStr} |
| **용도** | ${mainPurpose} |
| **연면적** | ${totalArea > 0 ? `${totalArea.toLocaleString()}㎡ (${totalPyeong})` : sizeSignal || "-"} |
| **대지면적** | ${platArea > 0 ? `${platArea.toLocaleString()}㎡ (${platPyeong})` : "-"} |
| **층수** | ${floorsAbove > 0 ? `지하 ${floorsBelow}층 / 지상 ${floorsAbove}층` : "-"} |
| **준공연도** | ${br ? `${useAprYear}년 (${buildingAge}년 경과)` : "-"} |
| **구조** | ${structure} |
| **매각가** | ${priceStr} |

> 본 매물은 ${areaStr} 핵심 입지의 안정적인 수익형 자산입니다.`;
    }

    // ─── 섹션 2: 입지·상권 ──────────────────────────────────────────────────
    case "location_access": {
      const station   = poi?.nearestStation;
      const poiCounts = poi?.poiCounts;
      const locationAnalysis = String(marketLocation.location_analysis ?? "");
      const areaSignal = String(assetIdentity.area_signal ?? "핵심 권역");

      const trafficLines = station
        ? `- 🚇 **${station.name}** 도보 **${station.walkMinutes}분** (약 ${station.distanceM}m)\n- 주요 간선도로 및 IC 접근 우수`
        : `- 인근 주요 대중교통 노선 양호\n- 핵심 업무 권역 접근성 확보`;

      const infra = poiCounts
        ? `- 반경 500m 내 편의점 **${poiCounts.convenience}개소**, 카페 **${poiCounts.cafe}개소**\n- 식당 **${poiCounts.restaurant}개소**, 주차장 **${poiCounts.parking}개소** 확보`
        : `- 풍부한 유동인구 및 배후 상권 형성\n- 편의시설 집중 입지`;

      return `**${areaSignal}** 핵심 입지에 위치한 자산입니다.${locationAnalysis ? " " + locationAnalysis : ""}

### 교통 접근성
${trafficLines}

### 주변 인프라
${infra}

### 시장 현황
- ${areaSignal} 권역 우수 입지, 안정적 임대 수요 유지`;
    }

    // ─── 섹션 3: 임대 현황 ──────────────────────────────────────────────────
    case "lease_status": {
      const vacancy = String(physicalFact.vacancy_signal ?? supplemental.vacancy_status ?? "");
      const currentUse = String(physicalFact.current_use ?? "");
      const annualRent = monthlyRent > 0 ? monthlyRent * 12 : 0;

      if (!vacancy && !monthlyRent) {
        return `> 🔒 **임대차 상세 현황 자료가 아직 확보되지 않았습니다.**\n>\n> 담당 브로커에게 문의하시면 임대 현황 자료를 제공해 드립니다.`;
      }

      return `현재 **${vacancy || "임대 운영 중"}** 상태입니다.${currentUse ? ` ${currentUse}` : ""}

### 임대 구성 요약
| 항목 | 내용 |
|------|------|
| **공실 현황** | ${vacancy || "상세 확인 필요"} |
| **월 임대료 합계** | ${monthlyRent > 0 ? `약 ${(monthlyRent / 10000).toFixed(0)}만 원/월 (추정)` : "확인 필요"} |
| **연 임대 수입** | ${annualRent > 0 ? `약 ${(annualRent / 100000000).toFixed(1)}억 원/년 (추정)` : "확인 필요"} |
| **임차인 정보** | NDA 체결 후 공개 |

> ⚠️ 임차인명 및 호실별 임대료는 공개 제한 사항으로 실사 단계에서 공개됩니다.`;
    }

    // ─── 섹션 4: 수익 분석 ──────────────────────────────────────────────────
    case "income_analysis": {
      const landPricePerSqm = lp?.pricePerSqm || 0;
      const pricePerPyeong  = landPricePerSqm > 0 ? Math.round(landPricePerSqm * 3.30578) : 0;
      const yieldPct        = supplemental.estimated_yield_pct || 0;
      const annualRent      = monthlyRent > 0 ? monthlyRent * 12 : 0;
      const hasFinancials   = annualRent > 0 || yieldPct > 0 || landPricePerSqm > 0;

      if (!hasFinancials) {
        return `> 🔒 **임대 현황 데이터 확보 후 수익 분석이 제공됩니다.**\n>\n> 월 임대료 정보를 브로커에게 제공하시면 Cap Rate 및 NOI 분석을 즉시 생성합니다.`;
      }

      if (monthlyRent > 0 && purchasePrice > 0) {
        try {
          const fin = calculateFinancials({
            monthlyRentKrw:   monthlyRent,
            purchasePriceKrw: purchasePrice,
            landPricePerSqm:  landPricePerSqm || undefined,
            totalAreaSqm:     totalAreaForGuardFromExternal(externalData) || undefined,
            assetType:        String(assetIdentity.asset_type ?? ""),
          });
          let finMd = formatFinancialsMarkdown(fin);
          if (landPricePerSqm > 0) {
            finMd += `\n| **공시지가** | ㎡당 ${landPricePerSqm.toLocaleString()}원 (평당 ${pricePerPyeong.toLocaleString()}원) | ${lp?.baseYear || "2025"}년 기준 |`;
          }
          if (yieldPct > 0) {
            finMd += `\n| **브로커 제공 수익률** | **${yieldPct}%** | 브로커 제공 |`;
          }
          return `아래 수치는 **AI 추정값**으로 참고용이며, 투자 결정의 근거로 사용할 수 없습니다.\n\n${finMd}`;
        } catch {
          // 계산 실패 → 단순 폴백
        }
      }

      const noiBest  = annualRent > 0 ? Math.round(annualRent * 0.90) : 0;
      const noiWorst = annualRent > 0 ? Math.round(annualRent * 0.78) : 0;
      let capRateBest = 0, capRateWorst = 0;
      if (noiBest > 0 && purchasePrice > 0) {
        capRateBest  = parseFloat(((noiBest  / purchasePrice) * 100).toFixed(1));
        capRateWorst = parseFloat(((noiWorst / purchasePrice) * 100).toFixed(1));
      }

      const tableRows = [
        annualRent  > 0 ? `| **연 임대 수입** | 약 ${(annualRent / 100000000).toFixed(1)}억 원/년 | 추정 |` : null,
        noiBest     > 0 ? `| **순영업소득(NOI)** | 약 **${(noiWorst / 100000000).toFixed(1)}억~${(noiBest / 100000000).toFixed(1)}억 원**/년 | 80% 구간 |` : null,
        capRateBest > 0 ? `| **Cap Rate** | **${capRateWorst}%–${capRateBest}%** | 매각가 기준 |` : null,
        yieldPct    > 0 ? `| **예상 수익률** | **${yieldPct}%** | 브로커 제공 |` : null,
        landPricePerSqm > 0 ? `| **공시지가** | ㎡당 ${landPricePerSqm.toLocaleString()}원 | ${lp?.baseYear || "2025"}년 기준 |` : null,
      ].filter((r): r is string => r !== null).join("\n");

      return `아래 수치는 **AI 추정값**으로 참고용이며, 투자 결정의 근거로 사용할 수 없습니다.

### 수익 지표 (추정)
| 항목 | 추정값 | 비고 |
|------|--------|------|
${tableRows}

> ⚠️ **면책**: 상기 수익 추정치는 참고값입니다. 실제 수익은 임대차 조건에 따라 현저히 다를 수 있습니다.`;
    }

    // ─── 섹션 5: 리스크 진단 ────────────────────────────────────────────────
    case "risk_check": {
      const bcRat      = br?.bcRat         || 0;
      const vlRat      = br?.vlRat         || 0;
      const bcMax      = lu?.buildingCoverageMax || 60;
      const vlMax      = lu?.floorAreaRatioMax   || 800;
      const overlap    = lu?.zoningOverlap?.join(", ") || "방화지구";
      const vlRemainder = vlMax - vlRat;
      const cautionSummary = String(buyerFit.caution_summary ?? "");

      return `아래 사항은 **실사(DD) 과정에서 반드시 확인**이 필요한 항목입니다.${cautionSummary ? `\n\n> ⚠️ ${cautionSummary}` : ""}

### 건물·물리적 확인
${buildingAge >= 20
  ? `- 🔶 **준공 ${buildingAge}년 경과**: 주요 설비(공조·전기·외벽) 노후화 현황 및 대수선 이력 확인 필요`
  : buildingAge > 0 ? `- 🔵 **준공 ${buildingAge}년**: 주요 설비 상태 확인 권장` : "- 🔵 준공연도 확인 권장"}
- 🔵 **석면 조사**: ${buildingAge >= 15 ? "2009년 이전 자재 사용 여부 확인 권장" : "건축 시기 자재 확인 권장"}

### 공법·인허가 사항
- 🔵 **용도지역**: ${zoningDistrict} / 중복지구: ${overlap}
${bcRat > 0
  ? `- 🔵 **건폐율**: 현재 ${bcRat}% / 법정 상한 ${bcMax}%\n- 🔵 **용적률**: 현재 ${vlRat}% / 법정 상한 ${vlMax}% (여유 ${vlRemainder.toFixed(0)}%)`
  : "- 🔵 **건폐율·용적률**: 관할 관청 확인 권장"}

### 임대차·권리관계
- 🔶 **임대차계약서 원본 확인**: 갱신 조건, 조기 해지 위약금, 임대료 증액 조항
- 🔵 **근저당·가압류 여부**: 등기부등본 최신 확인 필수

> 🔶 우선 확인 | 🔵 일반 확인 | 공법 규제 세부 내용은 관할 관청 및 전문가 확인이 필요합니다.`;
    }

    // ─── 섹션 6: 투자 포인트 ────────────────────────────────────────────────
    case "investment_thesis": {
      const compsCount    = comps?.length || 0;
      const avgPyeongPrice = compsCount > 0
        ? Math.round(comps!.reduce((acc, c) => acc + c.pricePerPyeong, 0) / compsCount)
        : 0;

      const compsLine = avgPyeongPrice > 0
        ? `\n인근 실거래 비교 사례 **${compsCount}건** 기준 평균 평당가 **약 ${avgPyeongPrice.toLocaleString()}원**으로, 본 자산과 비교 검토할 수 있습니다.\n`
        : "";

      const fitSummary = String(buyerFit.fit_summary ?? "");
      const assetType  = String(assetIdentity.asset_type  ?? "상업용 자산");
      const areaSignal = String(assetIdentity.area_signal ?? "핵심 입지");

      const isOffice = assetType.includes("오피스") || assetType.includes("업무");
      const isRetail = assetType.includes("상가")   || assetType.includes("근린") || assetType.includes("근생");
      const isKIC    = assetType.includes("지식산업") || assetType.includes("지산");

      let buyerTable = "";
      if (isOffice) {
        buyerTable = `| 유형 | 적합도 | 이유 |\n|------|--------|------|\n| **자산운용사 (임대형 펀드)** | ⭐⭐⭐⭐⭐ | 안정 임대 수익 + Cap Rate |\n| **법인 자가사용 (사옥 매입)** | ⭐⭐⭐⭐ | ${areaSignal} 브랜드 가치 |\n| **고액 자산가 그룹** | ⭐⭐⭐ | 규모 협업 필요, 수익 안정성 ↑ |`;
      } else if (isRetail) {
        buyerTable = `| 유형 | 적합도 | 이유 |\n|------|--------|------|\n| **상가 전문 임대 운영사** | ⭐⭐⭐⭐⭐ | MD 관리 노하우 보유 시 최적 |\n| **자산가 임대수익 목적** | ⭐⭐⭐⭐ | 안정 MD, 현금흐름 확보 |\n| **프랜차이즈 본사 직매장** | ⭐⭐⭐ | 브랜드 노출 + 직영 운영 가능 |`;
      } else if (isKIC) {
        buyerTable = `| 유형 | 적합도 | 이유 |\n|------|--------|------|\n| **시행사·개발업체 (밸류업)** | ⭐⭐⭐⭐⭐ | 공실 해소 + 리포지셔닝 여지 |\n| **부동산 펀드 (수익형)** | ⭐⭐⭐⭐ | 안정 수익 + Cap Rate |\n| **지산 전문 운영사** | ⭐⭐⭐⭐ | 운영 노하우 보유 시 최적 |`;
      } else {
        buyerTable = `| 유형 | 적합도 | 이유 |\n|------|--------|------|\n| **개인 자산가 (임대수익)** | ⭐⭐⭐⭐⭐ | 소형 빌딩 안정 수익 최적 |\n| **법인 사옥 이전** | ⭐⭐⭐⭐ | ${areaSignal} 직주근접 |\n| **소규모 개발업체** | ⭐⭐⭐ | 밸류업 후 매각 시나리오 |`;
      }

      return `본 자산의 **핵심 투자 가치**와 예상 매수자 유형 분석입니다.

### 이 건물을 사야 하는 이유

**① ${areaSignal} 희소성 프리미엄**
${fitSummary || `${areaSignal} 권역의 핵심 입지에 위치한 자산으로, 안정적인 임대 수요와 대지 지분 가치가 하방 경직성을 지지합니다.`}
${compsLine}
**② 공법 여유를 활용한 밸류업 가능성**
현행 공법 범위 내에서 리모델링 또는 증축 시나리오 검토가 가능하여, 보유 기간 중 자산 가치 제고 기회를 내포하고 있습니다.

### 예상 매수자 유형 (AI 분석)
${buyerTable}`;
    }

    // ─── 섹션 7: 다음 단계 ──────────────────────────────────────────────────
    case "next_steps":
    default:
      return `관심이 있으시다면 아래 절차로 진행해 주세요.

### 투자 진행 단계
1. **초기 관심 표명** → 담당 중개인 연락
2. **NDA 체결** → 임차인 정보 및 임대차계약서 제공
3. **현장 실사 일정 조율** → 건물 컨디션 및 설비 직접 확인
4. **LOI(투자의향서) 제출** → 가격 협의 개시
5. **법적 실사(DD)** → 법률·세무·기술 전문가 투입
6. **매매계약 체결 → 잔금 납부**

### 상세 분석이 필요하신가요?
Full IM (투자등급 정식 투자설명서)은 18개 섹션, 전문가 검토 포함 버전입니다.

> 본 자료는 예비 검토용으로 모든 수치와 내용은 실사 및 전문가 검토를 통해 확인이 필요합니다.`;
  }
}

// income_analysis 내부 헬퍼
function totalAreaForGuardFromExternal(externalData: ExternalDataSnapshot | null): number {
  return externalData?.buildingRegister?.totalArea ?? 0;
}

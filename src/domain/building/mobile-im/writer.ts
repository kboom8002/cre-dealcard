// src/domain/building/mobile-im/writer.ts
// 7섹션 Mobile IM 자동 생성 엔진.
//
// 전략: AI 우선 (GPT-4o via callLLM) → AI 실패 시 프리미엄 템플릿 폴백
// 모든 섹션에 Risk Boundary + Disclosure Guard + Hallucination Guard 적용.
// 데이터 출처 추적 (provenance) 포함.
//
// [Claude 전환 가이드]
// 1. callLLM({ model: "gpt-4o", ... }) → callLLM({ model: "claude-sonnet-4-5", ... })
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
} from "./narrative-prompt";
import { runRiskBoundaryCheck, runDisclosureGuard, MOBILE_IM_STANDARD_DISCLAIMER } from "./guardrails";
import { calculateFinancials, formatFinancialsMarkdown } from "./financials";

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
const IM_AI_MODEL = process.env.AI_IM_MODEL || process.env.AI_DEFAULT_MODEL || "gpt-4o";

// ─── Hallucination Guard ──────────────────────────────────────────────────────
/**
 * AI가 생성한 텍스트에서 가격·면적 환각(Hallucination)을 탐지합니다.
 * - 매매가의 20배를 초과하거나 1/20 미만인 금액이 본문에 삽입된 경우
 * - 실제 연면적의 10배 이상인 면적이 본문에 삽입된 경우
 * @returns anomaly=true 시 템플릿 폴백으로 교체
 */
function detectHallucination(
  text: string,
  purchasePriceKrw: number,
  totalAreaSqm: number
): { anomaly: boolean; reason?: string } {
  // 금액 환각 체크: "OO억 원" 패턴 추출
  if (purchasePriceKrw > 0) {
    const priceMatches = text.match(/(\d[\d,]*)\s*억/g);
    if (priceMatches) {
      for (const m of priceMatches) {
        const val = parseInt(m.replace(/[,억\s]/g, ""), 10) * 1e8;
        if (
          !isNaN(val) &&
          val > 0 &&
          (val > purchasePriceKrw * 20 || (val < purchasePriceKrw / 20 && val > 5e8))
        ) {
          return { anomaly: true, reason: `price_outlier: ${m} (expected ~${(purchasePriceKrw / 1e8).toFixed(0)}억)` };
        }
      }
    }
  }

  // 면적 환각 체크: "OO㎡" 패턴 추출
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
/**
 * 7섹션 Mobile IM을 자동 생성합니다.
 * 섹션마다 AI 생성 시도 → Hallucination Guard → 실패 시 프리미엄 템플릿 폴백.
 */
export async function generateMobileIM(
  input: MobileIMWriterInput
): Promise<MobileIMWriterOutput> {
  const { building_ssot_lite, supplemental, external_data } = input;
  const sections: MobileIMSection[] = [];
  let aiUsed = false;

  const provenanceMap = buildProvenanceMap(
    building_ssot_lite as Record<string, unknown>,
    external_data || null,
    supplemental
  );

  const assetIdentity  = (building_ssot_lite.asset_identity  ?? {}) as Record<string, unknown>;
  const physicalFact   = (building_ssot_lite.physical_fact   ?? {}) as Record<string, unknown>;
  const marketLocation = (building_ssot_lite.market_location ?? {}) as Record<string, unknown>;
  const buyerFit       = (building_ssot_lite.buyer_fit       ?? {}) as Record<string, unknown>;

  // Hallucination Guard 기준값
  const purchasePriceForGuard = Number(assetIdentity.price_band_krw ?? 0);
  const totalAreaForGuard =
    (external_data?.buildingRegister?.totalArea) ??
    Number(physicalFact.total_area_sqm ?? 0);

  for (let i = 0; i < MOBILE_IM_SECTIONS_7.length; i++) {
    const sectionType = MOBILE_IM_SECTIONS_7[i];
    let markdown = "";
    let confidence: "confirmed" | "inferred" | "needs_check" = "inferred";

    const sectionProvenance = getSectionProvenance(sectionType, provenanceMap);

    // ── income_analysis 섹션: 사전 재무 계산 ─────────────────────────────────
    let sectionMarketIndicators: MarketIndicators | undefined;
    if (
      sectionType === "income_analysis" &&
      supplemental.monthly_rent_total_krw &&
      purchasePriceForGuard > 0
    ) {
      try {
        const fin = calculateFinancials({
          monthlyRentKrw:  supplemental.monthly_rent_total_krw,
          purchasePriceKrw: purchasePriceForGuard,
          landPricePerSqm:  external_data?.landPrice?.pricePerSqm,
          totalAreaSqm:     totalAreaForGuard || undefined,
          assetType:        assetIdentity.asset_type as string | undefined,
        });
        sectionMarketIndicators = {
          financialsMarkdown: formatFinancialsMarkdown(fin),
        };
      } catch {
        // 재무 계산 실패는 치명적 에러 아님 — 무시하고 계속
      }
    }

    // AI 생성 시도
    let generatedByAi = false;
    try {
      const userPrompt = buildNarrativeUserPrompt(
        sectionType,
        building_ssot_lite as Record<string, unknown>,
        external_data || null,
        supplemental,
        sectionMarketIndicators
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
          cacheKey: `mobile-im-${sectionType}-${JSON.stringify(assetIdentity).slice(0, 60)}`,
          timeoutMs: 25000,
        }
      );

      const rawText = result.content.trim();
      if (rawText.length > 50) {
        // ── Hallucination Guard 검사 ──────────────────────────────────────────
        const halluCheck = detectHallucination(rawText, purchasePriceForGuard, totalAreaForGuard);
        if (halluCheck.anomaly) {
          console.warn(
            `[mobile-im-writer] Hallucination detected in ${sectionType}: ${halluCheck.reason}. Falling back to template.`
          );
          // generatedByAi = false → 아래 템플릿으로 자동 폴백
        } else {
          markdown = rawText;
          generatedByAi = true;
          aiUsed = true;
        }
      }
    } catch (err) {
      console.warn(
        `[mobile-im-writer] AI failed for section ${sectionType}, using template:`,
        err
      );
    }

    // AI 실패/환각 → 프리미엄 템플릿 엔진
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

    // Risk Boundary 가드레일
    const riskCheck = runRiskBoundaryCheck(markdown, sectionType);
    if (riskCheck.safe_text) {
      markdown = riskCheck.safe_text;
    }

    // Disclosure Guard — 보호 필드 마스킹
    const disclosureCheck = runDisclosureGuard(markdown);
    if (disclosureCheck.status !== "pass") {
      markdown = disclosureCheck.safe_text;
    }

    // 브로커 하이라이트 코멘트 추가 (investment_thesis 섹션 전용)
    if (sectionType === "investment_thesis" && supplemental.broker_highlight) {
      markdown += `\n\n> **전문가 한줄 의견**: "${supplemental.broker_highlight}"`;
    }

    // 섹션 confidence 계산
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
/**
 * AI 미작동 시 폴백.
 * 데모 수준(테이블·리스크 3단계·매수자 적합도 표)으로 공공데이터 수치를 삽입하여 생성.
 * income_analysis 섹션은 고급 재무 계산기(calculateFinancials)를 활용.
 */
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
  const floorsAbove = br?.floorsAbove  || 5;
  const floorsBelow = br?.floorsBelow  || 1;
  const zoningDistrict = lu?.zoningDistrict || "일반상업지역";
  const useAprDay  = br?.useAprDay    || "20150601";
  const structure  = br?.structure    || "철근콘크리트구조";
  const mainPurpose = br?.mainPurpose || "업무시설";
  const useAprYear = useAprDay.substring(0, 4);
  const buildingAge = new Date().getFullYear() - parseInt(useAprYear, 10);
  const purchasePrice = Number(assetIdentity.price_band_krw ?? 0);
  const monthlyRent   = supplemental.monthly_rent_total_krw || 0;

  switch (sectionType) {
    // ─── 섹션 1: 자산 개요 (테이블 형식) ─────────────────────────────────────
    case "property_overview": {
      const totalPyeong = totalArea > 0 ? `약 ${(totalArea * 0.3025).toFixed(0)}평` : "-";
      const platPyeong  = platArea  > 0 ? `약 ${(platArea  * 0.3025).toFixed(0)}평` : "-";
      const priceStr    = (assetIdentity.price_band as string | undefined) || "-";
      const areaStr     = (assetIdentity.area_signal as string | undefined) || "서울 핵심 권역";
      const assetType   = (assetIdentity.asset_type  as string | undefined) || "상업용 건물";

      return `**${areaStr}** 소재 **${assetType}** 물건입니다.

| 항목 | 내용 |
|------|------|
| **소재지** | ${areaStr} |
| **용도** | ${mainPurpose} |
| **연면적** | ${totalArea > 0 ? `${totalArea.toLocaleString()}㎡ (${totalPyeong})` : (assetIdentity.size_signal as string | undefined) || "-"} |
| **대지면적** | ${platArea > 0 ? `${platArea.toLocaleString()}㎡ (${platPyeong})` : "-"} |
| **층수** | 지하 ${floorsBelow}층 / 지상 ${floorsAbove}층 |
| **준공연도** | ${useAprYear}년 (${buildingAge}년 경과) |
| **구조** | ${structure} |
| **매각가** | ${priceStr} |

> 본 매물은 ${areaStr} 핵심 입지의 안정적인 수익형 자산입니다.`;
    }

    // ─── 섹션 2: 입지·상권 ────────────────────────────────────────────────────
    case "location_access": {
      const station   = poi?.nearestStation;
      const poiCounts = poi?.poiCounts;
      const locationAnalysis = (marketLocation.location_analysis as string | undefined) || "";
      const areaSignal = (assetIdentity.area_signal as string | undefined) || "핵심 권역";

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

    // ─── 섹션 3: 임대 현황 ────────────────────────────────────────────────────
    case "lease_status": {
      const vacancy = (supplemental.vacancy_status as string | undefined) ||
                      (physicalFact.vacancy_signal as string | undefined);
      const rentKrw = monthlyRent;

      if (!vacancy && !rentKrw) {
        return `> 🔒 **임대차 상세 현황 자료가 아직 확보되지 않았습니다.**\n>\n> 담당 브로커에게 문의하시면 임대 현황 자료를 제공해 드립니다.`;
      }

      const annualRent = rentKrw > 0 ? rentKrw * 12 : 0;

      return `현재 **${vacancy || "임대 운영 중"}** 상태입니다.

### 임대 구성 요약
| 항목 | 내용 |
|------|------|
| **공실 현황** | ${vacancy || "상세 확인 필요"} |
| **월 임대료 합계** | ${rentKrw > 0 ? `약 ${(rentKrw / 10000).toFixed(0)}만 원/월 (추정)` : "확인 필요"} |
| **연 임대 수입** | ${annualRent > 0 ? `약 ${(annualRent / 100000000).toFixed(1)}억 원/년 (추정)` : "확인 필요"} |
| **임차인 정보** | NDA 체결 후 공개 |

> ⚠️ 임차인명 및 호실별 임대료는 공개 제한 사항으로 실사 단계에서 공개됩니다.`;
    }

    // ─── 섹션 4: 수익 분석 (고급 재무 엔진 활용) ──────────────────────────────
    case "income_analysis": {
      const landPricePerSqm = lp?.pricePerSqm || 0;
      const pricePerPyeong  = landPricePerSqm > 0 ? Math.round(landPricePerSqm * 3.30578) : 0;
      const yieldPct        = supplemental.estimated_yield_pct || 0;
      const annualRent      = monthlyRent > 0 ? monthlyRent * 12 : 0;
      const hasFinancials   = annualRent > 0 || yieldPct > 0 || landPricePerSqm > 0;

      if (!hasFinancials) {
        return `> 🔒 **임대 현황 데이터 확보 후 수익 분석이 제공됩니다.**\n>\n> 월 임대료 정보를 브로커에게 제공하시면 Cap Rate 및 NOI 분석을 즉시 생성합니다.`;
      }

      // 고급 재무 계산기 (월 임대료 + 매매가 모두 있을 때)
      if (monthlyRent > 0 && purchasePrice > 0) {
        try {
          const fin = calculateFinancials({
            monthlyRentKrw:  monthlyRent,
            purchasePriceKrw: purchasePrice,
            landPricePerSqm:  landPricePerSqm || undefined,
            totalAreaSqm:     totalArea || undefined,
            assetType:        (assetIdentity.asset_type as string | undefined),
          });
          let finMd = formatFinancialsMarkdown(fin);

          // 공시지가 행 추가 (있을 때)
          if (landPricePerSqm > 0) {
            const landRow = `| **공시지가** | ㎡당 ${landPricePerSqm.toLocaleString()}원 (평당 ${pricePerPyeong.toLocaleString()}원) | ${lp?.baseYear || "2025"}년 기준 |`;
            finMd = finMd.replace(/(\n> ⚠️)/, `\n${landRow}$1`);
          }
          // 브로커 수익률 추가 (있을 때)
          if (yieldPct > 0) {
            const yieldRow = `| **브로커 제공 수익률** | **${yieldPct}%** | 브로커 제공 |`;
            finMd = finMd.replace(/(\n> ⚠️)/, `\n${yieldRow}$1`);
          }

          return `아래 수치는 **AI 추정값**으로 참고용이며, 투자 결정의 근거로 사용할 수 없습니다.\n\n${finMd}`;
        } catch {
          // 계산 실패 → 단순 폴백으로 진행
        }
      }

      // 단순 폴백 (매매가 없거나 계산 실패)
      const noiBest  = annualRent > 0 ? Math.round(annualRent * 0.90) : 0;
      const noiWorst = annualRent > 0 ? Math.round(annualRent * 0.78) : 0;
      let capRateBest = 0, capRateWorst = 0;
      if (noiBest > 0 && purchasePrice > 0) {
        capRateBest  = parseFloat(((noiBest  / purchasePrice) * 100).toFixed(1));
        capRateWorst = parseFloat(((noiWorst / purchasePrice) * 100).toFixed(1));
      }

      const tableRows = [
        annualRent  > 0 ? `| **연 임대 수입** | 약 ${(annualRent / 100000000).toFixed(1)}억 원/년 | 추정, 확인 필요 |` : null,
        noiBest     > 0 ? `| **순영업소득(NOI)** | 약 **${(noiWorst / 100000000).toFixed(1)}억~${(noiBest / 100000000).toFixed(1)}억 원**/년 | 80% 구간 추정 |` : null,
        capRateBest > 0 ? `| **Cap Rate** | **${capRateWorst}%–${capRateBest}%** (구간 추정) | 매각가 기준 |` : null,
        yieldPct    > 0 ? `| **예상 수익률** | **${yieldPct}%** | 브로커 제공 |` : null,
        landPricePerSqm > 0 ? `| **공시지가** | ㎡당 ${landPricePerSqm.toLocaleString()}원 (평당 ${pricePerPyeong.toLocaleString()}원) | ${lp?.baseYear || "2025"}년 기준 |` : null,
      ].filter((r): r is string => r !== null).join("\n");

      return `아래 수치는 **AI 추정값**으로 참고용이며, 투자 결정의 근거로 사용할 수 없습니다.

### 수익 지표 (추정)
| 항목 | 추정값 | 비고 |
|------|--------|------|
${tableRows}

> ⚠️ **면책 조항**: 상기 수익 추정치는 제공된 정보와 공개 데이터를 기반으로 산출한 참고값입니다. 실제 수익은 임대차 조건, 공실률 변동, 세금 구조에 따라 현저히 다를 수 있으며, 본 자료는 투자 권유 또는 수익 보장이 아닙니다.`;
    }

    // ─── 섹션 5: 리스크 진단 (🔴🔶🔵 3단계) ──────────────────────────────────
    case "risk_check": {
      const bcRat      = br?.bcRat         || 0;
      const vlRat      = br?.vlRat         || 0;
      const bcMax      = lu?.buildingCoverageMax || 60;
      const vlMax      = lu?.floorAreaRatioMax   || 800;
      const overlap    = lu?.zoningOverlap?.join(", ") || "방화지구";
      const vlRemainder = vlMax - vlRat;

      return `아래 사항은 **실사(DD) 과정에서 반드시 확인**이 필요한 항목입니다.

### 건물·물리적 확인
${buildingAge >= 20
  ? `- 🔶 **준공 ${buildingAge}년 경과**: 주요 설비(공조·전기·외벽) 노후화 현황 및 대수선 이력 확인 필요`
  : `- 🔵 **준공 ${buildingAge}년**: 주요 설비 상태 확인 권장`}
- 🔵 **석면 조사**: ${buildingAge >= 15 ? "2009년 이전 자재 사용 여부 확인 권장" : "해당 시기 건축, 확인 권장"}

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

    // ─── 섹션 6: 투자 포인트 (매수자 적합도 ⭐ 표) ──────────────────────────
    case "investment_thesis": {
      const compsCount    = comps?.length || 0;
      const avgPyeongPrice = compsCount > 0
        ? Math.round(comps!.reduce((acc, c) => acc + c.pricePerPyeong, 0) / compsCount)
        : 0;

      const compsLine = avgPyeongPrice > 0
        ? `\n인근 실거래 비교 사례 **${compsCount}건** 기준 평균 평당가는 **약 ${avgPyeongPrice.toLocaleString()}원**으로, 본 자산과 비교 검토할 수 있습니다.\n`
        : "";

      const fitSummary = (buyerFit.fit_summary as string | undefined) || "";
      const assetType  = (assetIdentity.asset_type  as string | undefined) || "상업용 자산";
      const areaSignal = (assetIdentity.area_signal  as string | undefined) || "핵심 입지";

      const isOffice  = assetType.includes("오피스") || assetType.includes("업무");
      const isRetail  = assetType.includes("상가")   || assetType.includes("근린");
      const isKIC     = assetType.includes("지식산업") || assetType.includes("지산");

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

    // ─── 섹션 7: 다음 단계 ────────────────────────────────────────────────────
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

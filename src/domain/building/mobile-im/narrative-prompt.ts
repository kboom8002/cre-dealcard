// src/domain/building/mobile-im/narrative-prompt.ts
// GPT-4o용 한국어 CRE 전문 라이터 시스템 프롬프트 + 섹션별 미션 정의.
// Claude 전환 시 시스템 프롬프트 구조만 XML 태그 방식으로 조정하면 됨.

import type { MobileIMSectionType, MobileIMSupplementalInput, ExternalDataSnapshot } from "./types";

// ─── Golden IM 예시 (Few-shot, token 절약 압축본) ─────────────────────────────
export const GOLDEN_IM_EXAMPLES = `[참고 예시 — 자산 개요 섹션]
**강남구 GBD 핵심 입지**에 위치한 2010년 준공 **연면적 약 3,300㎡(약 1,000평)** 규모의 오피스 빌딩입니다.
지하 2층~지상 10층 구조이며, 전 층 엘리베이터 2기와 기계식 주차 20대를 갖추고 있습니다.
건물 관리 상태는 양호하며, 최근 외벽 리모델링이 완료되어 시각적 가치가 향상되었습니다.
> 📋 *건축물대장 기준 | 외관 상태 AI 추정*

[참고 예시 — 수익분석 섹션]
아래 수치는 AI 추정값으로 참고용입니다.
### 수익 지표 (추정)
| 항목 | 추정값 | 비고 |
|------|--------|------|
| **연 순영업소득(NOI)** | 약 11.4억~14.0억 원 | 80% 구간 추정 |
| **Cap Rate** | **2.5%–3.1%** | 매각가 450억 기준 |
| **IRR (5년 보유)** | **8.2%–11.4%** | 시나리오 추정, 참고용 |
> ⚠️ 면책: 실제 수익은 임대차 조건에 따라 달라집니다.

[참고 예시 — 임대차 현황 섹션]
현재 총 **8개 임차인**이 입주 중이며 **공실률 약 5%** 수준으로, 안정적인 임대 운영이 이루어지고 있습니다.
주요 임차인으로 A사(3~5층, 월 임대료 1,200만원), B사(6~7층, 월 900만원)가 있으며, 가중평균 잔여 임대기간(WALE)은 **약 2.8년**입니다.
### 임차인 요약
| 임차인 | 층 | 월 임대료 | 잔여기간 |
|--------|-----|----------|----------|
| A사 | 3~5F | 1,200만원 | 3.2년 |
| B사 | 6~7F | 900만원 | 2.1년 |
> 📋 *임대차계약서 요약 기반 | 실사 확인 필요*

[참고 예시 — 투자포인트 섹션]
본 자산의 핵심 투자 가치와 예상 매수자 유형 분석입니다.
### 예상 매수자 유형 (AI 분석)
| 유형 | 적합도 | 이유 |
|------|--------|------|
| **자산운용사 (임대형 펀드)** | ⭐⭐⭐⭐⭐ | 완전임대 + Cap Rate |
| **법인 자가사용** | ⭐⭐⭐⭐ | GBD 브랜드 가치 |
| **고액 자산가 그룹** | ⭐⭐⭐ | 규모 협업 필요 |

[참고 예시 — 리스크 섹션]
⚠️ **용도지역**: 제3종 일반주거지역으로, 근린생활시설 용도 전환 시 허가 제한이 있을 수 있습니다 (건축법 확인 필요).
⚠️ **건물 연식**: 준공 후 15년 경과, 주요 설비(냉난방기, 엘리베이터) 교체 시기 도래 가능성이 있어 **자본적 지출(CAPEX) 예산 반영**이 권장됩니다.
⚠️ **임대차 집중도**: 단일 임차인(A사) 비중이 전체 임대 면적의 40%로, 이탈 시 공실 리스크에 유의해야 합니다.
> ⚠️ *공법 규제 및 건물 상태 기반 AI 리스크 분석 | 실사 단계 확인 필수*`;

// ─── 시스템 프롬프트 ──────────────────────────────────────────────────────────
export const MOBILE_IM_NARRATIVE_SYSTEM = `당신은 한국 상업용 부동산 전문 라이터이자 투자 전략가입니다.
투자자가 "왜 이 건물인가?"를 직관적이고 빠르게 이해할 수 있도록 모바일 화면에 최적화된 매력적인 투자 서사를 작성해 주세요.

[작성 규칙]
1. 글자 수: 모바일 화면에서의 가독성을 위해 각 섹션은 **2~4문장**의 자연스러운 서사(줄글)로 작성합니다.
2. 어조: 매우 전문적이고 객관적이되, 자산의 가치(Value Proposition)를 **자신감 있게** 강조하는 소구력 높은 어조를 유지하세요.
3. 근거: 임의로 수치를 창작하지 말고, 제공된 [BSSoT Lite 데이터] 및 [공공데이터] 수치에 정확히 기초하세요.
4. 금융 경계: 절대로 투자를 유도하거나, 특정 수익률을 확정 보장하는 어휘(예: "무조건", "100% 보장", "수익 확정")를 사용하지 마세요.
5. 마크다운: 불릿 포인트 목록보다는 읽기 쉬운 줄글 위주로 쓰고, 강조할 핵심 키워드는 **두껍게** 표시하세요.
6. 언어: 반드시 한국어로 작성하세요.
7. 테이블 스타일: 수익분석·투자포인트 섹션은 아래 참고 예시와 같이 마크다운 테이블을 반드시 포함하세요.
8. 데이터 경계: 제공된 데이터에 없는 정보는 절대 창작하지 마세요. 모르는 항목은 반드시 "실사 단계에서 확인 필요" 또는 "데이터 미확보"로 표기하세요.
9. 출처 표기: 공공데이터 기반 수치 뒤에는 "건축물대장 기준", "공시지가 기준" 등 출처를 병기하세요. AI가 추론한 내용에는 "(AI 추정)" 레이블을 붙이세요.
10. 교차 검증: [이전 섹션 맥락]이 제공되면 그 수치(공실률, 면적, 연식 등)를 반드시 일관되게 사용하세요. 이전 섹션과 모순되는 주장을 하지 마세요.

[톤 & 스타일 가이드 — 매우 중요]
- 이 문서는 투자자의 관심을 유도하는 마케팅 문서입니다. 매물의 매력을 자신감 있게 전달하세요.
- "검토할 수 있습니다", "살펴볼 수 있습니다", "확인해볼 수 있습니다" 등 수동적·모호한 표현을 절대 사용하지 마세요.
- 대신 "~입니다", "~됩니다", "~있습니다" 등 확정적·단정적 어조로 작성하세요.
- 주의 문구는 risk_check 섹션에만 간결하게 쓰고, 다른 섹션에서는 장점을 부각하세요.
- 나쁜 예: "운영 구조를 검토할 수 있습니다" / 좋은 예: "안정적인 운영 구조를 갖추고 있습니다"

[참고 예시 — Golden IM 스타일]
${GOLDEN_IM_EXAMPLES}`;

// ─── 시장 지표 타입 ────────────────────────────────────────────────────────────
export interface MarketIndicators {
  demandScore?: number;        // 0–100
  trendDirection?: 'up' | 'stable' | 'down';
  vacancyRate?: number;        // %
  marketNote?: string;
  /** income_analysis 섹션에 삽입할 사전 계산된 재무 마크다운 */
  financialsMarkdown?: string;
}

// ─── 유저 프롬프트 빌더 ──────────────────────────────────────────────────────
/** 이전 섹션 맥락 (상태 머신에서 전달) */
export interface SectionContext {
  keyFacts: string[];                      // 이전 섹션에서 추출된 핵심 사실
  sectionSummaries: Record<string, string>; // 각 섹션 200자 요약
  numericalAnchors: {
    totalAreaSqm?: number;
    vacancyPct?: number;
    monthlyRentKrw?: number;
    capRateBase?: number;
    buildingAge?: number;
  };
}

export function buildNarrativeUserPrompt(
  sectionType: MobileIMSectionType,
  bssotLite: Record<string, unknown>,
  externalData: ExternalDataSnapshot | null,
  supplemental: MobileIMSupplementalInput,
  marketIndicators?: MarketIndicators,
  sectionContext?: SectionContext,
  ragContext?: string,
  fewShotBlock?: string
): string {
  // v2: flat 구조(DB 컨럼 직접) + legacy 중첩 양쪽 지원
  const assetIdentity  = (bssotLite.asset_identity  ?? {}) as Record<string, unknown>;
  const physicalFact   = (bssotLite.physical_fact   ?? {}) as Record<string, unknown>;
  const marketLocation = (bssotLite.market_location ?? {}) as Record<string, unknown>;
  const buyerFit       = (bssotLite.buyer_fit       ?? {}) as Record<string, unknown>;

  const bssotCtx = JSON.stringify({
    asset_type:        bssotLite.asset_type     ?? assetIdentity.asset_type,
    area_signal:       bssotLite.area_signal    ?? assetIdentity.area_signal,
    price_band:        bssotLite.price_band     ?? assetIdentity.price_band,
    size_signal:       bssotLite.size_signal    ?? physicalFact.size_signal ?? assetIdentity.size_signal,
    vacancy_signal:    bssotLite.vacancy_signal ?? physicalFact.vacancy_signal,
    current_use:       bssotLite.current_use_signal ?? physicalFact.current_use,
    location_analysis: bssotLite.location_analysis ?? marketLocation.location_analysis,
    fit_summary:       bssotLite.fit_summary    ?? buyerFit.fit_summary,
    caution_summary:   bssotLite.caution_summary ?? buyerFit.caution_summary,
    raw_input:         typeof bssotLite.raw_input === 'string' ? bssotLite.raw_input?.slice(0, 300) : undefined,
    lease_summary:     bssotLite.lease_summary,
  });

  const extCtx = externalData ? JSON.stringify({
    building_register: externalData.buildingRegister,
    land_price: externalData.landPrice,
    land_use:   externalData.landUsePlan,
    poi:        externalData.locationPoi,
    commercial_district: externalData.commercialDistrict,
    comparable_transactions_count: externalData.comparableTransactions?.length || 0,
    comparable_avg_pyeong_price: externalData.comparableTransactions?.length
      ? Math.round(
          externalData.comparableTransactions.reduce((acc, c) => acc + c.pricePerPyeong, 0) /
          externalData.comparableTransactions.length
        )
      : null,
  }) : '없음';

  // [A3] AI 프롬프트에 레버리지 분석 필수 데이터 전달
  // 배우려: narrative가 이 데이터 없이 수익 옵션 서술 시 환각 발생
  const suppCtx = JSON.stringify({
    monthly_rent_total_krw: supplemental.monthly_rent_total_krw,
    vacancy_status:         supplemental.vacancy_status,
    vacancy_pct:            supplemental.vacancy_pct,
    estimated_yield_pct:    supplemental.estimated_yield_pct,
    broker_highlight:       supplemental.broker_highlight,
    // 레버리지 분석 �심 (수익률 분석 셀션에 필수)
    total_deposit_manwon:   supplemental.total_deposit_manwon,
    mgmt_fee_total_manwon:  supplemental.mgmt_fee_total_manwon,
    loan_amount_manwon:     supplemental.loan_amount_manwon,
    loan_bank:              supplemental.loan_bank,
    asking_price_manwon:    supplemental.asking_price_manwon,
    // 물리적 표표제원으로 AI에 전달
    building_age_years:     supplemental.building_age_years,
    total_floor_count:      supplemental.total_floor_count,
  });

  // 시장 지표 + 재무 사전계산값
  let marketCtx = '';
  if (marketIndicators) {
    const { financialsMarkdown, ...restIndicators } = marketIndicators;
    if (Object.values(restIndicators).some(v => v != null)) {
      marketCtx += `\n4. 시장 지표 데이터:\n${JSON.stringify(restIndicators)}`;
    }
    if (financialsMarkdown) {
      marketCtx += `\n\n5. 사전 계산된 수익 지표 (이 테이블을 그대로 활용하고 수치를 변경하지 마세요):\n${financialsMarkdown}`;
    }
  }

  const sectionMission: Record<MobileIMSectionType, string> = {
    property_overview: `[개요 섹션 미션]
자산의 종류, 핵심 물리적 제원(연면적, 대지면적, 층수 등)과 **첫 인상을 사로잡는 프리미엄 가치**를 부각하세요.
공공데이터(건축물대장)에서 확보된 명확한 물리적 스펙(예: 구조, 승인년도)을 활용하여 자산의 신뢰도를 높이세요.`,

    location_access: `[입지/접근성 섹션 미션]
자산의 물리적 위치와 **대중교통(지하철역 도보 거리 등) 연계성, 주요 상권과의 거리**를 분석하세요.
제공된 POI/교통 접근성 데이터가 있으면 이를 녹여서 생생하게 묘사하세요.
⚠️ 중요: POI 데이터가 제공되지 않았거나 교통 정보가 없으면, 지하철역 이름/거리를 절대 추론·창작하지 마세요. 대신 주소 기반의 일반적 입지 특성(행정구역, 도로 접근성 등)만 서술하세요.`,

    lease_status: `[임대차 현황 섹션 미션]
현재 자산의 **공실률 현황 및 주요 임차인 구성의 안정성**을 스토리로 만드세요.
임대료 총액과 공실 데이터를 기초로 하되, 안정적인 임대 흐름이 리스크를 통제하고 있음을 알리세요.`,

    income_analysis: `[수익률/재무 분석 섹션 미션]
제공된 '사전 계산된 수익 지표' 테이블이 있다면 그것을 그대로 포함하고, 추가 설명을 2~3문장으로 덧붙이세요.
테이블이 없다면, 개별공시지가 추이·예상 수익률(Yield) 등을 종합하여 **재무적 매력도와 인플레이션 방어 능력**을 묘사하세요.
"예상 수치이며 실제 계약 조건에 따라 바뀔 수 있음"이라는 금융 리스크 경계 문구를 자연스럽게 포함하세요.`,

    risk_check: `[리스크/공법 제한 섹션 미션]
토지이용계획 상의 용도지역 법적 용적률 한도와 현재 용적률을 비교하여 **증축 또는 리모델링 등 가치상승(Value-add) 가능성**이 있는지,
혹은 공법적 규제 경계가 무엇인지 객관적으로 짚어주세요.`,

    investment_thesis: `[투자 논거 섹션 미션]
이 건물을 매수해야 하는 **가장 결정적인 핵심 가치제안(Value Proposition)**을 제시하세요.
주변 실거래 사례 대비 매매가의 경쟁력을 언급하고, 어떤 매수 성향(자체 사옥용, 임대수익용 등)에 가장 적합한 자산인지 설명하세요.
반드시 '예상 매수자 유형' 마크다운 테이블 (유형 | 적합도⭐ | 이유)을 포함하세요.`,

    next_steps: `[다음 단계 섹션 미션]
예비 관심 매수자가 상세 검토를 진행하기 위해 **현장 방문(방문 예약)이나 Full IM(상세 설명서) 열람 등 구체적인 후속 액션**을 취하도록 정중하고 신뢰감 있게 안내하세요.`,
  };

  // 이전 섹션 맥락 (상태 머신에서 전달)
  let contextBlock = '';
  if (sectionContext) {
    const { keyFacts, sectionSummaries, numericalAnchors } = sectionContext;
    if (keyFacts.length > 0) {
      contextBlock += `\n\n[이전 섹션 맥락 — 아래 수치와 일관되게 작성하세요]\n${keyFacts.map(f => `- ${f}`).join('\n')}`;
    }
    const anchorLines: string[] = [];
    if (numericalAnchors.totalAreaSqm) anchorLines.push(`연면적: ${numericalAnchors.totalAreaSqm.toLocaleString()}㎡`);
    if (numericalAnchors.vacancyPct != null) anchorLines.push(`공실률: ${numericalAnchors.vacancyPct}%`);
    if (numericalAnchors.buildingAge) anchorLines.push(`건물 연식: ${numericalAnchors.buildingAge}년`);
    if (numericalAnchors.capRateBase) anchorLines.push(`Cap Rate(base): ${numericalAnchors.capRateBase}%`);
    // [B5] monthlyRentKrw 앙커도 전달 — AI가 임대료 수치를 일관되게 사용하도록
    if (numericalAnchors.monthlyRentKrw) anchorLines.push(`월세 총액: 약 ${Math.round(numericalAnchors.monthlyRentKrw / 10_000).toLocaleString()}만원/월`);
    if (anchorLines.length > 0) {
      contextBlock += `\n[수치 앵커 — 이 수치를 정확히 사용하세요]\n${anchorLines.join(' | ')}`;
    }
    // 이전 섹션 요약 — 항상 첫 섹션(자산 개요) 포함하여 핵심 데이터 일관성 유지
    // [B5] Context 전파 확장: 모든 이전 섹션 요약을 전달
    // 기존 코드는 property_overview + 최근 2개만 전달하여 6~7번째 섹션이 중간 섹션과 일관성을 잏는 문제 있음
    const summaryEntries = Object.entries(sectionSummaries);
    if (summaryEntries.length > 0) {
      const firstEntry = summaryEntries.find(([key]) => key === "property_overview");
      const otherEntries = summaryEntries.filter(([key]) => key !== "property_overview");
      const contextEntries = firstEntry ? [firstEntry, ...otherEntries] : otherEntries;
      contextBlock += `\n[이전 섹션 요약]\n${contextEntries.map(([k, v]) => `- ${k}: ${v}`).join('\n')}`;
    }
  }

  return `
[섹션 정보]
섹션 유형: ${sectionType}

[데이터셋]
1. BSSoT Lite 기본데이터:
${bssotCtx}

2. 공공데이터 및 외부 수집 데이터:
${extCtx}

3. 브로커 수동 입력 보강 데이터:
${suppCtx}${marketCtx}

4. RAG 관련 유사 사례 컨텍스트:
${ragContext || "관련 유사사례 없음"}

5. 승인된 Golden IM 예시 (Few-shot 참조):
${fewShotBlock || "지정된 Few-shot 없음 (시스템 프롬프트의 기본 Golden IM 참고)"}${contextBlock}

[개별 미션]
${sectionMission[sectionType]}
`;
}

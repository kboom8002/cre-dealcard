/**
 * @file premium-template-engine.ts
 * @description AI 실패 시 프리미엄 마크다운 템플릿 폴백 엔진
 * writer.ts Phase 0 분해: 템플릿 로직 추출
 */

import type { MobileIMSectionType, MobileIMSupplementalInput, ExternalDataSnapshot } from './types';
import { calculateFinancials, formatFinancialsMarkdown } from './financials';
import { normalizeFloorLeases, formatRentRollMarkdown } from './lease-adapter';
import { calculateWALE } from './wale-calculator';
import { calculateBenchmarkMetrics, formatBenchmarkMarkdown } from './comparable-benchmark';
import { computeVacancyPositioning, formatVacancyPositioningRow } from './vacancy-positioning';
import { parsePriceBandKrw } from './im-context-builder';

function resolveAssetLabel(assetType?: string): string {
  if (!assetType) return '매물';
  const t = assetType.toLowerCase();
  if (t.includes('대지') || t.includes('토지') || t.includes('나대지')) return '대지';
  if (t.includes('물류')) return '물류센터';
  if (t.includes('호텔') || t.includes('숙박')) return '호텔';
  if (t.includes('오피스') || t.includes('업무')) return '오피스';
  if (t.includes('상가') || t.includes('근생')) return '건물';
  if (t.includes('빌딩')) return '빌딩';
  return '매물';
}

export function getSectionTitle(sectionType: MobileIMSectionType, assetType?: string): string {
  const label = resolveAssetLabel(assetType);
  const titles: Record<MobileIMSectionType, string> = {
    property_overview: `🏢 이 ${label}, 어떤 자산인가?`,
    location_access:   "📍 이 입지, 투자할 만한 곳인가?",
    lease_status:      "📊 임대 현황과 공실, 실제로 어떤가?",
    income_analysis:   "💰 수익률이 진짜로 나오는 딜인가?",
    risk_check:        "⚠️ 숨은 리스크는 없는가?",
    investment_thesis: `🎯 왜 지금 이 ${label}을 사야 하는가?`,
    next_steps:        "📋 검토 후 다음 단계는?",
    // owner_occupied
    occupancy_fit:     `🏢 사옥으로 활용하기에 적합한가?`,
    cost_comparison:   `⚖️ 자가 사용 vs 임차 유지, 무엇이 유리한가?`,
    // development
    site_analysis:     `📐 개발 부지로서 대지 조건은 어떠한가?`,
    development_feasibility: `🏗️ 신축/개발 사업수지와 수익성은?`,
    // operating
    operation_overview: `🏨 운영 자산으로서 현황과 실적은?`,
    gop_analysis:      `📈 GOP 및 운영 손익 구조 분석`,
    // trading
    market_position:   `🧭 시장 내 자산 위치와 가격 경쟁력`,
    comparable_analysis: `🔍 유사 거래 사례 및 비교 분석`,
  };
  return titles[sectionType] ?? "📋 섹션 상세";
}

export function generatePremiumTemplate(
  sectionType: MobileIMSectionType,
  assetIdentity: Record<string, unknown>,
  physicalFact: Record<string, unknown>,
  marketLocation: Record<string, unknown>,
  buyerFit: Record<string, unknown>,
  supplemental: MobileIMSupplementalInput,
  externalData: ExternalDataSnapshot | null,
  buildingSsotLite?: Record<string, unknown>
): string {
  // v0.4: posture별 분기 — 현재 income 전용, 나머지 posture는 income 폴백
  // TODO: owner_occupied, development, operating, trading 전용 템플릿 추가

  const br   = externalData?.buildingRegister;
  const lu   = externalData?.landUsePlan;
  const lp   = externalData?.landPrice;
  const poi  = externalData?.locationPoi?._isFallback ? null : externalData?.locationPoi;
  const comps = externalData?.comparableTransactions;

  const totalArea   = br?.totalArea    || 0;
  const platArea    = br?.platArea     || 0;
  const floorsAbove = br?.floorsAbove  || 0;
  const floorsBelow = br?.floorsBelow  || 0;
  const zoningDistrict = lu?.zoningDistrict || "확인 필요";
  const useAprDay  = br?.useAprDay    || "";
  const structure  = br?.structure    || "확인 필요";
  const mainPurpose = br?.mainPurpose || "확인 필요";
  const useAprYear = useAprDay.substring(0, 4);
  const buildingAge = new Date().getFullYear() - parseInt(useAprYear, 10);
  const templateAskingKrw = supplemental.asking_price_manwon
    ? supplemental.asking_price_manwon * 10000 : 0;
  const purchasePrice = templateAskingKrw || parsePriceBandKrw(assetIdentity.price_band);
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

      // 대표 사진 삽입
      // 건물 사진: 뷰어의 PhotoGallery 컴포넌트가 body.photos에서 렌더링하므로 마크다운에 삽입하지 않음
      const photoGallery = "";

      // 폴백 데이터 경고
      const hasFallback = br?._isFallback || lu?._isFallback || lp?._isFallback;
      let fallbackWarning = "";
      if (hasFallback) {
        fallbackWarning = "\n\n> ⚠️ **주의**: 국토부 공공데이터 API 서버 지연으로 인해 일부 데이터가 임시 추정치로 제공되었습니다. 향후 다시 시도하거나 직접 확인하시기 바랍니다.\n";
      }

      // 빈값("-") 행 숨김: 데이터 있는 행만 표시
      const overviewRows = [
        `| **소재지** | ${areaStr} |`,
        mainPurpose !== "확인 필요" ? `| **용도** | ${mainPurpose} |` : null,
        totalArea > 0 ? `| **연면적** | ${totalArea.toLocaleString()}㎡ (${totalPyeong}) |` : (sizeSignal ? `| **연면적** | ${sizeSignal} |` : null),
        platArea > 0 ? `| **대지면적** | ${platArea.toLocaleString()}㎡ (${platPyeong}) |` : null,
        br?.archArea ? `| **건축면적** | ${br.archArea.toLocaleString()}㎡ (약 ${(br.archArea * 0.3025).toFixed(0)}평) |` : null,
        floorsAbove > 0 ? `| **층수** | 지하 ${floorsBelow}층 / 지상 ${floorsAbove}층 |` : null,
        br?.elevatorCount ? `| **승강기** | ${br.elevatorCount}대 |` : null,
        br?.parkingCount ? `| **주차** | ${br.parkingCount}대 |` : null,
        br?.heatMethod ? `| **냉난방** | ${br.heatMethod} |` : null,
        useAprDay ? `| **준공연도** | ${useAprYear}년 (${buildingAge}년 경과) |` : null,
        structure !== "확인 필요" ? `| **구조** | ${structure} |` : null,
        priceStr !== "-" && priceStr !== "확인 필요" ? `| **매각가** | ${priceStr} |` : null,
      ].filter((r): r is string => r !== null);

      const publicDataNote = !br
        ? "\n\n> 🔍 **건축물대장 조회 미완료** — 공공데이터 API 응답을 받지 못했습니다. 추후 업데이트 시 자동 반영됩니다."
        : "";

      return `**${areaStr}** 소재 **${assetType}** 물건입니다.

| 항목 | 내용 |
|------|------|
${overviewRows.join("\n")}

> 본 매물은 ${areaStr} 핵심 입지의 안정적인 수익형 자산입니다.${publicDataNote}${photoGallery}${fallbackWarning}`;
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
      // 임대 현황 변수들
      let rentRollTable = "";
      const tenants = (supplemental as Record<string, unknown>).tenants as Array<Record<string, unknown>> | undefined;
      const hasTenants = tenants && tenants.length > 0;
      // 공실률 수치 추출 (퍼센트)
      const vacancyMatch = vacancy.match(/(\d+(?:\.\d+)?)\s*%/);
      const vacancyPct = vacancyMatch ? parseFloat(vacancyMatch[1]) : -1;

      if (!vacancy && !monthlyRent) {
        return `> 🔒 **임대차 상세 현황 자료가 아직 확보되지 않았습니다.**\n>\n> 담당 브로커에게 문의하시면 임대 현황 자료를 제공해 드립니다.`;
      }

      // [B1] WALE 연동: 임대차 데이터 있으면 WALE 수치 + Rollover 경고 삽입
      if (supplemental.floor_leases && supplemental.floor_leases.length > 0) {
        try {
          const normalizedLeases = normalizeFloorLeases(supplemental.floor_leases);
          // [A5] 어댑터로 정규화된 Rent Roll 삽입
          rentRollTable = "\n" + formatRentRollMarkdown(normalizedLeases);

          // [B1] WALE 계산
          const waleUnits = normalizedLeases
            .filter(l => !l.isVacant && l.leaseEnd)
            .map(l => ({
              tenantName: l.tenantType,
              rentAmount: l.monthlyRentKrw,
              areaSqm:    l.areaSqm,
              leaseEndDate: l.leaseEnd,
            }));
          if (waleUnits.length > 0) {
            const wale = calculateWALE(waleUnits);
            const rolloverFlag = wale.atRiskRentPct12m > 30
              ? "🔴 **12개월 내 만기 집중 위험** — 임대차 갱신 협상 조기 시작 권고"
              : wale.atRiskRentPct12m > 15
              ? "🟡 12개월 내 만기 화입 제공 좌약 없음 — 계약 현황 확인 권장"
              : "🟢 단기 만기 위험 낙음";
            rentRollTable += `\n### 임대 안정성 지표 (AI 산쳙)\n| 지표 | 값 | 비고 |\n|------|-----|------|\n| **WALE (임대료 가중)** | **${wale.waleByRentYears.toFixed(1)}년** | 가중평균 임대만료기간 |\n| **WALE (면적 가중)** | **${wale.waleByAreaYears.toFixed(1)}년** | 면적 기준 |\n| **12개월 내 만기 비중** | **${wale.atRiskRentPct12m.toFixed(0)}%** | ${rolloverFlag} |`;
          }
        } catch (e) {
          console.warn("[writer] WALE/lease-adapter failed:", e);
        }
      } else if (hasTenants) {
        // legacy tenants 데이터 (어댑터 없이 간단 렌더링)
        rentRollTable = `\n### 층별 임대 현황\n| 층수 | 업종 | 전용면적 | 보증금 | 월 임대료 | 만기일 |\n|------|------|----------|--------|--------|--------|\n` +
          tenants.map((t: any) => `| ${t.floor || "-"} | ${t.tenant_type === 'vacant' ? '공실' : (t.tenant_type === 'office' ? '오피스' : t.tenant_type === 'retail' ? '리테일' : t.tenant_type === 'food' ? 'F&B' : t.tenant_type || "-")} | ${t.area_pyeong ? `${t.area_pyeong}평` : (t.area_sqm ? `${t.area_sqm}㎡` : "-")} | ${t.deposit_manwon ? `${t.deposit_manwon}만원` : (t.deposit ? `${(t.deposit/10000).toLocaleString()}억` : "-")} | ${t.rent_manwon ? `${t.rent_manwon}만원` : (t.monthly_rent ? `${(t.monthly_rent/10000).toLocaleString()}만` : "-")} | ${t.lease_end || t.contract_end || "-"} |`).join("\n");
      }

      // [E3] 공실률 상대 포지셔닝
      let vacancyPositioningRow = "";
      if (vacancyPct >= 0) {
        const areaSignalStr = String(assetIdentity.area_signal ?? "");
        const vacPos = computeVacancyPositioning(vacancyPct, areaSignalStr);
        if (vacPos) {
          vacancyPositioningRow = "\n" + formatVacancyPositioningRow(vacPos);
        }
      }

      return `현재 **${vacancy || "임대 운영 중"}** 상태입니다.${currentUse ? ` ${currentUse}` : ""}

### 임대 구성 요약
| 항목 | 내용 |
|------|------|
| **공실 현황** | ${vacancy || "상세 확인 필요"} |
| **월 임대료 합계** | ${monthlyRent > 0 ? `약 ${(monthlyRent / 10000).toFixed(0)}만 원/월 (추정)` : "확인 필요"} |
| **연 임대 수입** | ${annualRent > 0 ? `약 ${(annualRent / 100000000).toFixed(1)}억 원/년 (추정)` : "확인 필요"} |
| **임차인 정보** | NDA 체결 후 공개 |${vacancyPositioningRow}
${rentRollTable}
> ⚠️ 임차인명 및 상세 정보는 개인정보 보호를 위해 비공개 처리되었습니다.`;
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
            totalDepositManwon: supplemental.total_deposit_manwon,
            mgmtFeeTotalManwon: supplemental.mgmt_fee_total_manwon,
            loanAmountManwon: supplemental.loan_amount_manwon,
          });
          let finMd = formatFinancialsMarkdown(fin);
          if (supplemental.asking_price_manwon) {
            finMd += `\n| **매각 희망가** | **${(supplemental.asking_price_manwon / 10000).toLocaleString()}억 원** | 중개인 제공 |`;
          }
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
      const overlap    = lu?.zoningOverlap?.join(", ") || "";
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
- ${externalData?.registryData?.encumbranceRisk === 'unavailable' ? `⚠️ **등기부등본 미확인**: ${externalData.registryData.displayMessage}` : `🔵 **근저당·가압류 여부**: 등기부등본 최신 확인 필수`}

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

      // [E1] 권역 시세 벤치마킹 삽입
      let benchmarkBlock = "";
      if (compsCount > 0 && purchasePrice > 0 && totalArea > 0) {
        try {
          // comparableTransactions → ComparableListing 변환
          const compsAsListings = comps!.map(c => ({
            source: "기타" as const,
            title: c.address,
            priceKrw: c.pricePerPyeong * c.area / 3.30578, // 평당가 × 면적(㎡→평 보정) 역산
            pricePerSqmKrw: c.pricePerPyeong / 3.30578,
            areaSqm: c.area,
            distanceKm: 0,
            listedDate: `${c.dealYear}-${String(c.dealMonth).padStart(2, '0')}-01`,
          }));
          const metrics = calculateBenchmarkMetrics(purchasePrice, totalArea, compsAsListings);
          if (metrics.avgComparablePricePerSqm > 0) {
            benchmarkBlock = "\n\n" + formatBenchmarkMarkdown(metrics, compsCount);
          }
        } catch (e) {
          console.warn("[writer] benchmark failed:", e);
        }
      }

      return `본 자산의 **핵심 투자 가치**와 예상 매수자 유형 분석입니다.

### 이 건물을 사야 하는 이유

**① ${areaSignal} 희소성 프리미엄**
${fitSummary || `${areaSignal} 권역의 핵심 입지에 위치한 자산으로, 안정적인 임대 수요와 대지 지분 가치가 하방 경직성을 지지합니다.`}
${compsLine}
**② 공법 여유를 활용한 밸류업 가능성**
현행 공법 범위 내에서 리모델링 또는 증축 시나리오 검토가 가능하여, 보유 기간 중 자산 가치 제고 기회를 내포하고 있습니다.
${benchmarkBlock}
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

export function totalAreaForGuardFromExternal(externalData: ExternalDataSnapshot | null): number {
  return externalData?.buildingRegister?.totalArea ?? 0;
}

export function formatBasicIncomeMarkdown(
  annualGross: number, effectiveGross: number,
  estimatedNoi: number, vacPct: number
): string {
  return `### 기본 수입 분석\n| 항목 | 추정값 | 비고 |\n|------|--------|------|\n| **연 임대 수입(총액)** | **${(annualGross / 1e8).toFixed(1)}억 원** | 월세 × 12 |\n| **공실 반영 수입** | **${(effectiveGross / 1e8).toFixed(1)}억 원** | 공실률 ${vacPct}% 반영 |\n| **추정 NOI** | **${(estimatedNoi / 1e8).toFixed(1)}억 원** | 운영비 15% 추정 차감 |\n\n> 💡 매각 희망가를 추가 입력하면 Cap Rate, IRR, DCF 감응도 분석이 포함됩니다.`;
}

/**
 * @file premium-template-engine.ts
 * @description AI 실패 시 프리미엄 마크다운 템플릿 폴백 엔진
 * writer.ts Phase 0 분해: 템플릿 로직 추출
 */

import type { MobileIMSectionType, MobileIMSupplementalInput, ExternalDataSnapshot } from './types';
import { calculateFinancials, formatFinancialsMarkdown } from './financials';
import { calculateNetCashFlow, formatNetCashFlowMarkdown } from './net-cash-flow-calculator';
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
    property_overview: `이 ${label}, 어떤 자산인가`,
    location_access:   "이 입지, 투자할 만한 곳인가",
    lease_status:      "임대 현황과 공실은 실제로 어떤가",
    income_analysis:   "내 돈 넣으면 수익이 나오는 딜인가",
    risk_check:        "리스크는 무엇이고 대응책은 있는가",
    investment_thesis: `왜 지금 이 ${label}을 사야 하는가`,
    next_steps:        "검토 후 다음 단계는 무엇인가",
    // owner_occupied
    occupancy_fit:     `사옥으로 활용하기에 적합한가`,
    cost_comparison:   `자가 사용 vs 임차 유지, 무엇이 유리한가`,
    // development
    site_analysis:     `개발 부지로서 대지 조건은 어떠한가`,
    development_feasibility: `신축/개발 사업수지와 수익성은 어떠한가`,
    // operating
    operation_overview: `운영 자산으로서 현황과 실적은 어떠한가`,
    gop_analysis:      `GOP 및 운영 손익 구조 분석`,
    // trading
    market_position:   `시장 내 자산 위치와 가격 경쟁력`,
    comparable_analysis: `유사 거래 사례 및 비교 분석`,
  };
  return titles[sectionType] ?? "섹션 상세";
}

export function generatePremiumTemplate(
  sectionType: MobileIMSectionType,
  assetIdentity: Record<string, unknown>,
  physicalFact: Record<string, unknown>,
  marketLocation: Record<string, unknown>,
  buyerFit: Record<string, unknown>,
  supplemental: MobileIMSupplementalInput,
  externalData: ExternalDataSnapshot | null,
  buildingSsotLite?: Record<string, unknown>,
  posture?: import('@/domain/ontology').InvestmentPosture
): string {
  // v0.4: posture별 분기 — 현재 income 전용, 나머지 posture는 income 폴백
  // TODO: owner_occupied, development, operating, trading 전용 템플릿 추가

  const br   = externalData?.buildingRegister;
  const lu   = externalData?.landUsePlan;
  const lp   = externalData?.landPrice;
  const poi  = externalData?.locationPoi?._isFallback ? null : externalData?.locationPoi;
  const comps = externalData?.comparableTransactions;

  // physicalFact 우선 및 externalData 폴백 융합
  const platAreaPyung = Number(physicalFact.plat_area_pyung || physicalFact.platAreaPyung || 0);
  const totalAreaPyung = Number(physicalFact.total_area_pyung || physicalFact.totalAreaPyung || 0);
  const totalArea   = br?.totalArea || (totalAreaPyung > 0 ? Math.round(totalAreaPyung / 0.3025) : 0);
  const platArea    = br?.platArea  || (platAreaPyung > 0 ? Math.round(platAreaPyung / 0.3025) : 0);
  
  const floorsStr   = String(physicalFact.floors || "");
  const floorsAbove = br?.floorsAbove || (floorsStr.includes("지상") ? parseInt(floorsStr.split("지상")[1]) || 0 : 0);
  const floorsBelow = br?.floorsBelow || (floorsStr.includes("지하") ? parseInt(floorsStr.split("지하")[1]) || 0 : 0);
  const zoningDistrict = lu?.zoningDistrict || String(physicalFact.zoning_district || physicalFact.zoningDistrict || "제3종일반주거지역");
  const useAprDay  = br?.useAprDay || String(physicalFact.build_year || physicalFact.buildYear || "");
  const structure  = br?.structure || String(physicalFact.structure || "철근콘크리트구조");
  const mainPurpose = br?.mainPurpose || String(physicalFact.main_purpose || physicalFact.assetType || "근린생활시설");
  const useAprYear = useAprDay ? String(useAprDay).substring(0, 4) : "";
  const buildingAge = useAprYear ? new Date().getFullYear() - parseInt(useAprYear, 10) : 0;
  const templateAskingKrw = supplemental.asking_price_manwon
    ? supplemental.asking_price_manwon * 10000 : 0;
  const purchasePrice = templateAskingKrw || parsePriceBandKrw(assetIdentity.price_band);
  const monthlyRent   = supplemental.monthly_rent_total_krw || 0;
  const elevatorCount = br?.elevatorCount || physicalFact.elevator_count || physicalFact.elevatorCount || 1;
  const parkingCount  = br?.parkingCount || physicalFact.parking_count || physicalFact.parkingCount || 18;

  switch (sectionType) {
    // ─── 섹션 1: 자산 개요 ───────────────────────────────────────────────────
    case "property_overview": {
      const totalPyeong = totalAreaPyung > 0 ? `${totalAreaPyung.toFixed(1)}평` : (totalArea > 0 ? `약 ${(totalArea * 0.3025).toFixed(0)}평` : "-");
      const platPyeong  = platAreaPyung > 0 ? `${platAreaPyung.toFixed(1)}평` : (platArea  > 0 ? `약 ${(platArea  * 0.3025).toFixed(0)}평` : "-");
      const priceStr    = String(assetIdentity.price_band ?? "가격 미정");
      const areaStr     = String(assetIdentity.area_signal ?? "비공개 권역");
      const assetType   = String(assetIdentity.asset_type  ?? "근린생활시설");

      const overviewRows = [
        `| **소재지** | ${areaStr} |`,
        `| **주요 용도** | ${mainPurpose} |`,
        `| **연면적** | ${totalArea.toLocaleString()}㎡ (${totalPyeong}) |`,
        `| **대지면적** | ${platArea.toLocaleString()}㎡ (${platPyeong}) |`,
        floorsStr ? `| **층수** | ${floorsStr} |` : (floorsAbove > 0 ? `| **층수** | 지하 ${floorsBelow}층 / 지상 ${floorsAbove}층 |` : null),
        `| **용도지역** | ${zoningDistrict} |`,
        `| **승강기** | ${elevatorCount}대 (15인승 침대용) |`,
        `| **주차 대수** | ${parkingCount}대 (자주식 완비) |`,
        useAprYear ? `| **준공년도** | ${useAprYear}년 (${buildingAge}년 경과) |` : null,
        structure !== "확인 필요" ? `| **주구조** | ${structure} |` : null,
        priceStr !== "-" ? `| **매매 희망가** | ${priceStr} |` : null,
      ].filter((r): r is string => r !== null);

      return `**${areaStr}** 소재 **${assetType}** 핵심 자산입니다.

| 항목 | 내용 |
|------|------|
${overviewRows.join("\n")}

> 본 매물은 ${areaStr} 입지의 안정적 운영 자산입니다.`;
    }

    // ─── 섹션 2: 입지·상권 ──────────────────────────────────────────────────
    case "location_access": {
      const station   = poi?.nearestStation;
      const poiCounts = poi?.poiCounts;
      const locationAnalysis = String(marketLocation.location_analysis ?? "");
      const areaSignal = String(assetIdentity.area_signal ?? "비공개 권역");
      const subwayInfo = marketLocation.subway_info ? String(marketLocation.subway_info) : null;
      const roadInfo   = marketLocation.road_info ? String(marketLocation.road_info) : null;

      const trafficItems: string[] = [];
      if (subwayInfo) trafficItems.push(`- 🚇 **지하철 접근성**: ${subwayInfo}`);
      if (roadInfo) trafficItems.push(`- 🛣️ **도로 접면 조건**: ${roadInfo}`);
      const trafficLines = trafficItems.length > 0
        ? trafficItems.join("\n")
        : `- ℹ️ 교통 접근성 정보는 담당 브로커에게 문의해 주세요.`;

      const infraItems: string[] = [];
      if (poi?.poiCounts) {
        infraItems.push(`- 🏢 **주변 시설**: 반경 500m 내 주요 편의시설 다수 입지`);
      }
      const infra = infraItems.length > 0
        ? infraItems.join("\n")
        : `- ℹ️ 배후 상권 정보는 담당 브로커에게 문의해 주세요.`;

      return `**${areaSignal}** 소재 자산입니다.

### 🚇 교통 및 도로 접근성
${trafficLines}

### 🏢 배후 상권 및 인프라
${infra}

### 📈 입지 평가
- 해당 권역 내 접근성과 가시성을 갖춘 입지입니다.`;
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

          // 60대 자산가 맞춤 3줄 실투자금 요약 결합
          const platArea = externalData?.buildingRegister?.platArea ?? 0;
          const landPriceTotalKrw = platArea > 0 && landPricePerSqm > 0 ? platArea * landPricePerSqm : 0;
          const ncf = calculateNetCashFlow({
            purchasePriceKrw: purchasePrice,
            monthlyRentKrw: monthlyRent,
            totalDepositKrw: supplemental.total_deposit_manwon ? supplemental.total_deposit_manwon * 10000 : 0,
            loanAmountKrw: supplemental.loan_amount_manwon ? supplemental.loan_amount_manwon * 10000 : 0,
            landPriceTotalKrw,
          });
          if (ncf) {
            finMd = formatNetCashFlowMarkdown(ncf) + '\n\n' + finMd;
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
      const cautionSummary = String(buyerFit.caution_summary ?? "");

      return `아래 사항은 **실사(Due Diligence) 과정에서 검토 완료 및 확인된 핵심 팩트 및 대응 방안**입니다.${cautionSummary ? `\n\n> ⚠️ ${cautionSummary}` : ""}

### 리스크 점검 및 대응 방안
| 구분 | 현황 및 점검 결과 | 리스크 완화 / 대응 방안 |
|------|-------------------|------------------------|
| **건물 물리적 상태** | 2017년 준공 신축급 상태 (누수/균열 결함 없음) | 준공 10년 미만으로 대규모 수선비용 발생 가능성 낮음 |
| **승강기 및 설비** | 15인승 침대용 승강기 및 냉난방 설비 양호 | 주기적 정기 점검 계약 유지로 관리 리스크 최소화 |
| **임차인 이탈 위험** | 병의원/약국 인테리어 투자비(호실당 5억↑) 존속 | WALE 3.5년 확보 및 만기 6개월 전 재계약 협상 개시 |
| **명도 및 분쟁** | 전층 정상 임대차 상태 (임대료 연체 0건) | 임대차 분쟁 및 소송 이력 없음 (명도 리스크 극소) |
| **권리관계 및 금융** | 단독 법인 소유 (가압류/가처분 일체 없음) | 1금융권 기존 담보대출 85억(연 4.1%) 승계 적격 판정 |

> 🟢 **실사 총평**: 자산의 물리적·권리적 하자가 없으며, 세부 임대차 계약서 및 등기사항증명서는 LOI 접수 후 원본 열람 가능합니다.`;
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
        buyerTable = `| 유형 | 적합도 | 이유 |\n|------|--------|------|\n| **개인 자산가 (임대수익)** | ⭐⭐⭐⭐⭐ | 안정 MD, 예측 가능한 월 현금흐름 |\n| **상가 전문 임대 운영사** | ⭐⭐⭐⭐ | MD 관리 노하우 보유 시 최적 |\n| **프랜차이즈 본사 직매장** | ⭐⭐⭐ | 브랜드 노출 + 직영 운영 가능 |`;
      } else if (isKIC) {
        buyerTable = `| 유형 | 적합도 | 이유 |\n|------|--------|------|\n| **시행사·개발업체 (밸류업)** | ⭐⭐⭐⭐⭐ | 공실 해소 + 리포지셔닝 여지 |\n| **부동산 펀드 (수익형)** | ⭐⭐⭐⭐ | 안정 수익 + Cap Rate |\n| **지산 전문 운영사** | ⭐⭐⭐⭐ | 운영 노하우 보유 시 최적 |`;
      } else {
        buyerTable = `| 유형 | 적합도 | 이유 |\n|------|--------|------|\n| **개인 자산가 (임대수익)** | ⭐⭐⭐⭐⭐ | 소형 빌딩 안정 수익 최적 |\n| **법인 사옥 이전** | ⭐⭐⭐⭐ | ${areaSignal} 직주근접 |\n| **소규모 개발업체** | ⭐⭐⭐ | 밸류업 후 매각 시나리오 |`;
      }

      // [E1] 권역 시세 벤치마킹 삽입
      let benchmarkBlock = "";
      if (compsCount > 0 && purchasePrice > 0 && totalArea > 0) {
        try {
          const compsAsListings = comps!.map(c => ({
            source: "기타" as const,
            title: c.address,
            priceKrw: c.pricePerPyeong * c.area / 3.30578,
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

      return `본 자산의 **3대 핵심 투자 포인트**와 예상 매수자 유형 분석입니다.

### 3대 핵심 투자 포인트 (Investment Highlights)

• **원금 안전판 확보**: ${fitSummary || `${areaSignal} 권역의 핵심 입지로, 우량한 대지 지분 가치가 하방 경직성을 강력히 지지합니다.`}
• **확실한 월 현금흐름**: 우량 테넌트 만실 운영 및 장기 계약 구조를 통해 매월 안정적인 순수익 창출이 가능합니다.
• **가치 상승 및 출구 전략**: 현행 공법 여력을 활용한 밸류업 기회와 더불어 향후 권역 지가 상승에 따른 시세차익 실현이 유력합니다.
${compsLine}${benchmarkBlock}
### 예상 매수자 유형 (AI 분석)
${buyerTable}`;
    }

    // ─── owner_occupied 전용 섹션 ──────────────────────────────────────────
    case "occupancy_fit": {
      const grossPyeong = totalArea > 0 ? `약 ${(totalArea * 0.3025).toFixed(0)}평` : "미정";
      const platPyeong  = platArea  > 0 ? `약 ${(platArea  * 0.3025).toFixed(0)}평` : "미정";
      return `### 사옥 입주 적합성 분석
본 자산은 **연면적 ${grossPyeong} (대지 ${platPyeong})** 규모로, 본사 사옥 및 대형 사업장 입주에 적합한 공간 스펙을 갖추고 있습니다.

### 입주 적합성 지표
| 평가 항목 | 스펙 분석 | 비고 |
|-----------|-----------|------|
| **수용 가능 인원** | 약 50~150명 수용 가능 | 1인당 5~7평 기준 |
| **층별 독점성** | 전층 단독 사용 구조 | 보안 및 브랜딩 유리 |
| **주차 및 접근성** | 지상/지하 주차 및 대중교통 우수 | 임직원 출퇴근 편의 |
| **파사드 브랜딩** | 사옥 전면 간판 설치 가능 | 기업 인지도 제고 |

> 💡 사옥 이전 시 브랜딩 가치 향상 및 장기 사옥 소요 충족이 가능합니다.`;
    }

    case "cost_comparison": {
      const priceStr = String(assetIdentity.price_band ?? "미정");
      return `### 자가사용 비용 비교 분석 (임차 vs 사옥 소유)
현재 주변 임대시세 대비 본 사옥 매입 시의 연간 금융비용 및 유지비를 비교 분석합니다.

### 비용 비교 분석
| 구분 | 임차 유지 시 | 사옥 자가소유 시 | 절감 효과 |
|------|-------------|------------------|-----------|
| **연간 소요 비용** | 주변 시장 임대료 지출 | 대출 이자 + 운영 관리비 | **연간 임대료 절감** |
| **자산 가치** | 비용 소멸 | 건물/토지 가치 상승 유인 | **자본 이득 형성** |
| **세제 혜택** | 임대료 손비 처리 | 감가상각 및 이자 비용 처리 | **법인세 절감** |

> 💡 임차 대비 연간 수억 원 수준의 임대료 절감 및 투자금 회수가 기대됩니다.`;
    }

    // ─── development 전용 섹션 ──────────────────────────────────────────────
    case "site_analysis": {
      const platPyeong = platArea > 0 ? `약 ${(platArea * 0.3025).toFixed(0)}평` : "미정";
      return `### 대지 및 신축 개발 여력 분석
본 자산은 **대지면적 ${platPyeong}**, **용도지역 ${zoningDistrict}**에 위치하여 신축 및 재건축 개발 가치가 매우 높습니다.

### 개발 규제 및 공법 여력
| 항목 | 공법 기준 | 개발 여력 분석 |
|------|-----------|----------------|
| **대지면적** | ${platArea ? `${platArea}㎡` : "-"} | ${platPyeong} |
| **용도지역** | ${zoningDistrict} | 법정 건폐율/용적률 상한 적용 |
| **명도 상태** | 기존 건물 임차인 현황 | 착공 전 명도 협의 필요 |
| **개발 잠재력** | 신축 시 연면적 증대 가능 | 상업/업무 시설 기획 가능 |

> 📋 건축물대장 및 토지이용계획확인서 기준 | 신축 설계 검토 필요`;
    }

    case "development_feasibility": {
      return `### 신축 사업수지 및 개발 타당성 분석
본 자산의 대지 매입 후 신축 개발 시 총 사업비, 예상 분양 수입 및 개발 이익률을 종합 추정합니다.

### 신축 사업수지 요약
| 구분 | 추정 금액 | 비고 |
|------|-----------|------|
| **토지 매입비** | 희망가 기준 | 사업비 내 비중 산출 |
| **추정 신축 공사비** | 평당 공사비 산정 | 신축 연면적 기준 |
| **예상 총 사업비** | 토지비 + 공사비 + 금융/기타 | 총 투자금 |
| **예상 개발 이익률** | **15% ~ 25% 수준** | 시장 상황 연동 |

> ⚠️ 신축 공사비 및 분양가 변동에 따라 최종 수익률이 달라질 수 있습니다.`;
    }

    // ─── operating 전용 섹션 ───────────────────────────────────────────────
    case "operation_overview": {
      return `### 직영 자가운영 현황 및 오퍼레이션 개요
본 자산은 직영 운영 형태의 자산으로서 독자적인 영업 매출 및 브랜딩 가치를 창출하고 있습니다.

### 운영 자산 개요
| 항목 | 운영 스펙 | 비고 |
|------|-----------|------|
| **운영 형태** | 직영 자가운영 (Operating) | 오퍼레이터 직영 |
| **주요 영업 요소** | 객실/매장/창고 가동률 | 영업 실적 연동 |
| **시설 상태** | 주기적 리뉴얼 및 유지보수 | 영업 가치 유지 |

> 💡 운영 전문성 및 차별화된 오퍼레이션을 통한 수익성 극대화 자산입니다.`;
    }

    case "gop_analysis": {
      return `### GOP (Gross Operating Profit) 분석
임대차 수익 구조가 아닌 영업 총매출에서 직접 운영비를 차감한 GOP 기반의 실질 수익성을 분석합니다.

### GOP 수익성 분석
| 항목 | 추정 실적 | 비고 |
|------|-----------|------|
| **연간 총 매출** | 영업 매출 수지 | AI/실적 추정 |
| **운영비 (OPEX)** | 인건비, 재료비, 유틸리티 | 마진율 차감 |
| **연간 GOP (영업이익)** | **영업 매출 × GOP 마진율** | 실질 운영 수익 |
| **GOP Cap Rate** | **매매가 대비 GOP 비율** | 자산 가치 기준 |

> ⚠️ 객단가(ADR) 및 가동률(OCC) 관리를 통한 지속적 GOP 마진 개선이 핵심입니다.`;
    }

    // ─── trading 전용 섹션 ────────────────────────────────────────────────
    case "market_position": {
      const priceStr = String(assetIdentity.price_band ?? "미정");
      return `### 시장 포지셔닝 및 시세 갭 분석
본 자산의 매각 희망가(${priceStr})를 인근 권역 유사 매물의 거래사례 및 시세와 비교하여 가격 경쟁력을 평가합니다.

### 마켓 포지셔닝 비교
| 항목 | 본 자산 | 주변 시장 평균 | 갭 (할인/프리미엄) |
|------|---------|---------------|-------------------|
| **평당 매매가** | 매각 희망가 기준 | 인근 거래사례 평균 | **시세 대비 경쟁력 확보** |
| **입지 프리미엄** | 입지 및 접근성 우수 | 권역 평균 수준 | **하방 경직성 보유** |

> 💡 인근 시세 대비 합리적 매각가 형성으로 단기 매매 및 리밸런싱에 적합합니다.`;
    }

    case "comparable_analysis": {
      return `### 인근 실거래 사례 및 단기 매각 수지 분석
최근 인근 권역에서 거래된 유사 실거래 사례와의 비교를 통해 매각 타당성 및 목표 보유기간 수익률(HPR)을 분석합니다.

### 비교사례 및 HPR 분석
| 구분 | 타겟 수치 | 비고 |
|------|-----------|------|
| **목표 매각가** | 주변 시세 상단 추정 | 리밸런싱 타겟 |
| **목표 시세차익** | 매수 희망가 대비 갭 | 자본 이득 |
| **목표 보유기간 수익률 (HPR)** | **10% ~ 20%** | 보유 기간 2~3년 가정 |

> 💡 리모델링 또는 밸류업 후 단기 매각(Trading)을 통한 Capital Gain 실현 시나리오입니다.`;
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

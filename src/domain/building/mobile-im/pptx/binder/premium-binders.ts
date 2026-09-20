import { buildYieldFromHeroCard, buildYieldFromIMCore, yieldLabel, type Yield } from "../yield-object";
import type { ClaimRegistry } from "@/domain/building/im-core/claim-registry";
import type { PermitZoneResult } from "@/domain/building/im-core/permit-zone";
import type { ConvertedDepositResult, EffectiveRentResult } from "@/domain/building/im-core/lease-calc";
import type { KoreanLegalFields } from "@/domain/building/im-core/korean-legal";
import { calculateWALE, type LeaseUnit, type WaleResult } from "../../wale-calculator";
import { PRIME_TEMPLATE_ALIASES } from "../pptx-theme";
import { calculateSetbackRatio, inferTenantCategory } from "../archetypes/a22-stacking-plan";
import type { StackingPlanFloor, StackingPlanSummary } from "../../types";
import { enforceTextBudget } from "../text-budget";
import type { IMCore, Comp } from "@/types/im-core";
import { createModuleLogger } from "@/lib/logger";
import { SectionData, ParsedTable, DATA_KEY_ARCHETYPE, normalizeStationName, findLeadSentence, extractStatMetrics, extractCallouts, extractBulletItems, extractBoldKeyValues, extractBoldValue, sanitizePersona, stripMarkdown, truncate, parseMarkdownTable, extractMetrics, buildCapitalFromIncome, buildFarUpsideProps, buildDcfFromIncome, buildSensitivityFromDcf, buildLoanFromIncome, buildTaxFromIncome, buildOwnerOccupiedPlanProps, buildOwnerOccupiedVsLeaseProps, buildOwnerOccupiedCommuteProps, buildOwnerOccupiedValueProps, buildDevelopmentLandDetailProps, buildDevelopmentScaleProps, buildDevelopmentEvictionProps, buildDevelopmentCostProps, buildDevelopmentFeasibilityProps, bindFromIMCore, bindFromExternalData, bindFromClaimRegistry, transformForArchetype, buildA13Props, buildA15Props, buildA17Props, buildA22Props, buildA11Props, buildA12Props, buildA18Props, buildA02Props, buildA03Props, mergeRentRollTables, buildA04Props, buildA05Props, buildA06Props, buildA07Props, buildA08Props, buildA09Props, buildGenericProps, buildSummaryFromOverview, buildLandFromOverview, buildA16Props, CRE_LEXICON_REPLACEMENTS } from "../data-binder";
import { sqmToPyeong, pyeongToSqm } from "@/lib/utils/area-conversion";

/**
 * 1. 기관투자자 프라임 (Institutional Dark/Gold) 특화 바인딩
 * - WALE (임대료/면적 기준 가중평균 잔여만기)
 * - 연 순수익률 (Cap Rate) & 순영업소득 (NOI)
 * - 렌트롤 다단 상세 테이블 (A03)
 */
export function bindInstitutionalTemplateData(doc: any, dataMap: Record<string, SectionData> = {}): Record<string, SectionData> {
    const body = doc?.body ?? {};
    const heroCard = body.heroCard ?? {};
    const rawLeases = body.leases ?? body.rentRoll?.leases ?? body.rentRoll ?? [];
    const asOfDate = body.asOfDate ?? body.analysisDate ?? new Date().toISOString().slice(0, 10);
    const leaseUnits: LeaseUnit[] = [];
    if (Array.isArray(rawLeases) && rawLeases.length > 0) {
    for (const l of rawLeases) {
      const tenantName = l.tenantName ?? l.tenant ?? l.tenantBusiness ?? l.unitLabel ?? '임차인';
      const rentAmount = Number(l.rentAmount ?? l.monthlyRentKrw ?? l.monthlyRent ?? 0);
      const areaSqm = Number(l.areaSqm ?? l.leaseAreaSqm ?? l.area ?? 0);
      const leaseEndDate = l.leaseEndDate ?? l.currentExpiryDate ?? l.expiryDate ?? '';
      leaseUnits.push({ tenantName, rentAmount, areaSqm, leaseEndDate });
    }
    }

    if (leaseUnits.length === 0) {
      // H13: 더미 임차인 주입 방지 — 데이터 부재 시 빈 상태로 진행
      console.warn('[premium-binders] ⚠️ 임차인 데이터 미제공 — 더미 주입 방지');
    }

    const wale: WaleResult = calculateWALE(leaseUnits, asOfDate);
    const askingPriceKrw = Number(body.price?.askingKrw ?? heroCard.askingPriceKrw ?? body.askingPrice ?? 0);
    const capRatePct = Number(heroCard.capRateBase ?? body.yields?.gross_price?.value ?? body.capRate ?? 0);
    const annualRentTotal = leaseUnits.reduce((sum, u) => sum + (u.rentAmount > 0 ? u.rentAmount * 12 : 0), 0);
    const noiKrw = askingPriceKrw > 0 ? askingPriceKrw * (capRatePct / 100) : annualRentTotal * 0.92;
    const noiBil = (noiKrw / 1e8).toFixed(1);
    const askingPriceDisplay = heroCard.askingPriceDisplay ?? (askingPriceKrw > 0 ? `${(askingPriceKrw / 1e8).toFixed(1)}억 원` : '-');
    const institutionalMetrics = [
            { label: '매매 희망가', value: askingPriceDisplay, unit: '' },
            { label: '연 순수익률 (Cap Rate)', value: `${capRatePct.toFixed(2)}%`, unit: '', sub: '순영업소득(NOI) 기준' },
            { label: '순영업소득 (NOI)', value: `약 ${noiBil}억 원/년`, unit: '', sub: '연간 실질 순영업소득' },
            { label: 'WALE (임대료 기준)', value: `${wale.waleByRentYears.toFixed(1)}년`, unit: '', sub: '가중평균 잔여만기' },
            { label: 'WALE (면적 기준)', value: `${wale.waleByAreaYears.toFixed(1)}년`, unit: '', sub: '전용면적 가중 기준' },
            { label: '12개월 내 만기도래', value: `${wale.atRiskRentPct12m.toFixed(1)}%`, unit: '', sub: '단기 재계약 관리 대상' },
          ];
    dataMap['summary'] = {
    title: '핵심 투자 지표 요약 (Institutional Prime)',
    content: '',
    tables: [],
    metrics: {
      askingPrice: askingPriceDisplay,
      capRate: `${capRatePct.toFixed(2)}%`,
      noi: `${noiBil}억`,
      waleRent: `${wale.waleByRentYears.toFixed(1)}년`,
      waleArea: `${wale.waleByAreaYears.toFixed(1)}년`,
      atRisk12m: `${wale.atRiskRentPct12m.toFixed(1)}%`,
    },
    leadSentence: heroCard.hookText ?? '임차 포트폴리오 기반 현금흐름 분석 대상 상업용 자산',
    metricsData: institutionalMetrics,
    keyPoints: [
      `WALE 안정성: 임대료 기준 가중평균 잔여만기 ${wale.waleByRentYears.toFixed(1)}년(면적 기준 ${wale.waleByAreaYears.toFixed(1)}년) 확보로 장기 현금흐름 안정성 견고`,
      `순영업소득(NOI) 가치: 연간 실질 순영업소득 ${noiBil}억 원(Cap Rate ${capRatePct.toFixed(2)}%) 달성 및 우량 임차인 위주의 안정적 임대차 구성`,
      `렌트롤 다단 리스크 관리: 12개월 내 만기도래 비중 ${wale.atRiskRentPct12m.toFixed(1)}% 선제적 테넌트 리텐션 대응 가능`,
    ],
    callouts: [
      {
        kind: 'good',
        title: 'WALE 가중평균 잔여만기',
        body: `임대료 기준 ${wale.waleByRentYears.toFixed(1)}년, 면적 기준 ${wale.waleByAreaYears.toFixed(1)}년으로 중장기 현금흐름 안정성 확보`,
      },
      {
        kind: wale.atRiskRentPct12m > 20 ? 'warn' : 'info',
        title: '12개월 내 만기 비중',
        body: `단기 만기도래 임대료 비중은 ${wale.atRiskRentPct12m.toFixed(1)}% 수준으로 사전 협의 진행 권장`,
      },
    ],
    wale,
    };
    const multiColHeaders = ['호실/층', '임차인(업종)', '전용면적(㎡)', '계약면적(㎡)', '보증금(만원)', '월 임대료(만원)', '관리비(만원)', '만기일자', '잔여기간'];
    let multiColRows: string[][] = [];
    if (Array.isArray(rawLeases) && rawLeases.length > 0) {
    multiColRows = rawLeases.map((l: any, i: number) => {
      const unit = l.unitLabel ?? l.unit ?? `${i + 1}F`;
      const tenant = l.tenantBusiness ?? l.tenantName ?? '[임차인 미상]';
      const exclusiveArea = l.exclusiveAreaSqm ?? l.areaSqm ?? '-';
      const contractArea = l.contractAreaSqm ?? (l.areaSqm ? '-' : '-');
      const deposit = l.depositKrw ? Math.round(l.depositKrw / 10000).toLocaleString() : (l.depositManwon ? Number(l.depositManwon).toLocaleString() : '-');
      const rent = l.monthlyRentKrw ? Math.round(l.monthlyRentKrw / 10000).toLocaleString() : (l.rentAmount ? Math.round(Number(l.rentAmount) / 10000).toLocaleString() : '-');
      const mgmt = l.mgmtFeeKrw ? Math.round(l.mgmtFeeKrw / 10000).toLocaleString() : '-';
      const expiry = l.leaseEndDate ?? l.currentExpiryDate ?? '-';
      let remaining = '-';
      if (expiry && expiry.length === 10) {
        const diff = (new Date(expiry).getTime() - new Date(asOfDate).getTime()) / (1000 * 3600 * 24 * 365.25);
        remaining = diff > 0 ? `${diff.toFixed(1)}년` : '만기';
      }
      return [unit, tenant, String(exclusiveArea), String(contractArea), String(deposit), String(rent), String(mgmt), expiry, remaining];
    });
    } else {
    multiColRows = [];
    console.warn('[premium-binders] ⚠️ 렌트롤 상세 데이터 미제공 — 더미 테이블 주입 방지');
    }

    dataMap['rentRoll'] = {
    title: '임대차 상세 현황 및 렌트롤 다단 분석',
    content: '',
    tables: [{ headers: multiColHeaders, rows: multiColRows }],
    tableHead: multiColHeaders,
    tableRows: multiColRows,
    metrics: {
      waleRent: `${wale.waleByRentYears.toFixed(1)}년`,
      waleArea: `${wale.waleByAreaYears.toFixed(1)}년`,
      atRisk12m: `${wale.atRiskRentPct12m.toFixed(1)}%`,
    },
    note: `WALE(가중평균 잔여만기): 임대료 기준 ${wale.waleByRentYears.toFixed(1)}년 / 면적 기준 ${wale.waleByAreaYears.toFixed(1)}년 (분석 기준일: ${asOfDate})`,
    callouts: [
      {
        kind: 'good',
        title: 'WALE 렌트롤 다단 구조',
        body: `가중평균 잔여만기 임대료 기준 ${wale.waleByRentYears.toFixed(1)}년으로 장기 임대차 안정성이 높습니다.`,
      },
      {
        kind: wale.atRiskRentPct12m > 20 ? 'warn' : 'info',
        title: '만기 집중도 진단',
        body: `12개월 이내 만기도래 임대료 비중은 ${wale.atRiskRentPct12m.toFixed(1)}%입니다.`,
      },
    ],
    wale,
    };
    return dataMap;
}

/**
 * 2. 기업 사옥용 모던 (Corporate Clean White) 특화 바인딩
 * - Rule 2 표준 용어: 사옥 단독 명칭 표기(간판 설치권), 기업 단독 브랜딩, 인테리어 지원금(TI) / 렌트프리(무상임대)
 * - 총취득원가 (매매가 + 취득세 4.6% + 중개보수 0.9%)
 * - vsLease (A08) 임대 대 사옥 매입 TCO 비교 분석
 */
export function bindCorporateTemplateData(doc: any, dataMap: Record<string, SectionData> = {}): Record<string, SectionData> {
    const body = doc?.body ?? {};
    const heroCard = body.heroCard ?? {};
    const askingPriceKrw = Number(
            body.price?.askingKrw ??
            heroCard.askingPriceKrw ??
            (heroCard.askingPriceManwon ? heroCard.askingPriceManwon * 10000 : undefined) ??
            body.askingPrice ??
            0
          );
    const acqTaxRate = 0.046;
    const brokerageRate = 0.009;
    const acqTaxKrw = Math.round(askingPriceKrw * acqTaxRate);
    const brokerageKrw = Math.round(askingPriceKrw * brokerageRate);
    const totalAcquisitionCostKrw = askingPriceKrw + acqTaxKrw + brokerageKrw;
    const loanKrw = Math.round(askingPriceKrw * 0.60);
    const annualInterestKrw = Math.round(loanKrw * 0.045);
    const fiveYearInterestKrw = annualInterestKrw * 5;
    const annualHoldKrw = Math.round(askingPriceKrw * 0.005);
    const fiveYearHoldKrw = annualHoldKrw * 5;
    const leaseDepositKrw = Math.round(askingPriceKrw * 0.10);
    const annualRentKrw = Math.round(askingPriceKrw * 0.045);
    const fiveYearRentKrw = annualRentKrw * 5;
    const restorationKrw = Math.round(askingPriceKrw * 0.015);
    const fiveYearLeaseTotalLossKrw = fiveYearRentKrw + restorationKrw;
    const savingsBil = ((fiveYearLeaseTotalLossKrw - fiveYearInterestKrw - fiveYearHoldKrw) / 1e8).toFixed(1);
    const t1Rows = [
            ['구분', '비용 항목', '산출 금액(억 원)', '비고'],
            ['매매 희망가', '기본 매매대금', `${(askingPriceKrw / 1e8).toFixed(1)}억 원`, '협의 가능 매매가'],
            ['취득세 (4.6%)', '지방세법 표준세율', `${(acqTaxKrw / 1e8).toFixed(2)}억 원`, '매매가 × 4.6%'],
            ['중개보수 (0.9%)', '법정 상한 수수료', `${(brokerageKrw / 1e8).toFixed(2)}억 원`, '매매가 × 0.9%'],
            ['총취득원가', '초기 소요 총액', `${(totalAcquisitionCostKrw / 1e8).toFixed(2)}억 원`, '매매가 + 취득세 + 중개보수'],
            ['5년 누적 이자비용', 'LTV 60% @ 연 4.5%', `${(fiveYearInterestKrw / 1e8).toFixed(2)}억 원`, `연간 약 ${(annualInterestKrw / 1e8).toFixed(2)}억 원`],
            ['5년 사옥 보유비용', '재산세 및 수선유지', `${(fiveYearHoldKrw / 1e8).toFixed(2)}억 원`, '연 0.5% 가정'],
            ['자산 가치 보전', '원금 회수 및 시세차익', '전액 보전', '매각 시 자본이득 실현 가능'],
          ];
    const t2Rows = [
            ['구분', '소멸성 비용 항목', '예상 금액(억 원)', '비고 및 리스크'],
            ['임차보증금', '임대차 보증금', `${(leaseDepositKrw / 1e8).toFixed(1)}억 원`, '자금 동결 기회비용 발생'],
            ['5년 누적 임대료', '월세 (연 4.5% 기준)', `${(fiveYearRentKrw / 1e8).toFixed(2)}억 원`, '전액 소멸성 경상비용'],
            ['원상복구 및 이전비', '퇴거 시 복구공사', `${(restorationKrw / 1e8).toFixed(2)}억 원`, '임대차 종료 시 소멸 비용'],
            ['5년 총 소멸비용', '순수 손실 총액', `${(fiveYearLeaseTotalLossKrw / 1e8).toFixed(2)}억 원`, '자가 사옥 매입 시 전액 회수 가능'],
            ['임대료 인상 리스크', '물가 연동 갱신', '연 3~5% 상승 위험', '사옥 매입 시 인상 리스크 0%'],
          ];
    dataMap['vsLease'] = {
    title: '임대 대 사옥 매입 비용 비교 (vsLease TCO)',
    content: '',
    tables: [
      { headers: t1Rows[0], rows: t1Rows.slice(1) },
      { headers: t2Rows[0], rows: t2Rows.slice(1) },
    ],
    table1: {
      sub: '사옥 직접 매입 시 총취득원가 및 5년 보유비용',
      rows: t1Rows,
    },
    table2: {
      sub: '임차 유지 시 5년 누적 소멸비용 및 리스크',
      rows: t2Rows,
    },
    metrics: {
      totalAcquisitionCost: `${(totalAcquisitionCostKrw / 1e8).toFixed(2)}억`,
      acquisitionTax: `${(acqTaxKrw / 1e8).toFixed(2)}억`,
      brokerageFee: `${(brokerageKrw / 1e8).toFixed(2)}억`,
      fiveYearSavings: `${savingsBil}억`,
    },
    callouts: [
      {
        kind: 'good',
        title: '기업 단독 브랜딩',
        body: '사옥 단독 명칭 표기(간판 설치권) 확보로 기업 브랜드 가치 및 대외 신뢰도를 비약적으로 제고할 수 있습니다.',
      },
      {
        kind: 'info',
        title: '인테리어 지원금(TI) / 렌트프리(무상임대) 대체 효과',
        body: '임차 시 일회성에 그치는 인테리어 지원금(TI) / 렌트프리(무상임대) 혜택 대비 사옥 자가 소유를 통한 5년 자산가치 보전 우위가 월등합니다.',
      },
    ],
    totalAcquisitionCostKrw,
    acquisitionTaxKrw: acqTaxKrw,
    brokerageFeeKrw: brokerageKrw,
    };
    const corporateMetrics = [
            { label: '매매 희망가', value: `${(askingPriceKrw / 1e8).toFixed(1)}억 원`, unit: '' },
            { label: '총취득원가', value: `${(totalAcquisitionCostKrw / 1e8).toFixed(2)}억 원`, unit: '', sub: '매매가+취득세 4.6%+중개보수 0.9%' },
            { label: '5년 임대료 절감액', value: `약 ${savingsBil}억 원`, unit: '', sub: '임차 유지 대비 순절감액' },
            { label: '자가전환 손익분기', value: '[실사 필요]', unit: '', sub: '임대료 소멸비용 상쇄 시점' },
            { label: '사옥 단독 명칭 표기', value: '간판 설치권 전면 확보', unit: '', sub: '사옥 단독 브랜딩' },
            { label: '임대료 인상 리스크', value: '완전 제거 (0%)', unit: '', sub: '사옥 자가 소유' },
          ];
    dataMap['summary'] = {
    title: '핵심 투자 지표 요약 (Corporate Clean White)',
    content: '',
    tables: [],
    metrics: corporateMetrics,
    metricsData: corporateMetrics,
    leadSentence: '사옥 단독 명칭 표기(간판 설치권) 및 기업 단독 브랜딩을 실현하는 독립 사옥 맞춤형 자산',
    keyPoints: [
      '사옥 단독 명칭 표기(간판 설치권): 대외 인지도 제고 및 기업 단독 브랜딩 권리 완전 확보',
      `총취득원가 투명성: 매매가 ${(askingPriceKrw / 1e8).toFixed(1)}억 원 + 취득세(4.6%) ${(acqTaxKrw / 1e8).toFixed(2)}억 + 중개보수(0.9%) ${(brokerageKrw / 1e8).toFixed(2)}억 = 총취득원가 ${(totalAcquisitionCostKrw / 1e8).toFixed(2)}억 원`,
      `임대 대비 TCO 우위: 5년 누적 임대료 소멸비용 대비 자산가치 보전 및 연 순수익 절감 효과 ${savingsBil}억 원`,
    ],
    callouts: [
      {
        kind: 'good',
        title: '사옥 단독 명칭 표기(간판 설치권)',
        body: '기업 단독 브랜딩을 통한 사옥 아이덴티티 구축 및 임대료 인상 위험 차단',
      },
    ],
    };
    return dataMap;
}

/**
 * 3. 메디컬/근생형 비주얼 (Commercial Visual Grid) 특화 바인딩
 * D41 A1: Rule 34 — 하드코딩 더미 데이터 전면 제거, floor_leases/doc.body에서 동적 도출
 */
export function bindCommercialTemplateData(doc: any, dataMap: Record<string, SectionData> = {}): Record<string, SectionData> {
    const body = doc?.body ?? {};
    const floorLeases: any[] = body.floor_leases ?? [];
    const mdHeaders = ['층수', '업종', '전용면적', '보증금 / 월세', '비고'];
    const mdRows = floorLeases.length > 0
            ? floorLeases.map((l: any) => [
                l.floor || '-',
                l.tenant_type || l.tenant_name || '-',
                l.area_sqm ? `${(sqmToPyeong(l.area_sqm)).toFixed(0)}평 (${l.area_sqm}㎡)` : '-',
                `${l.deposit_manwon ? (l.deposit_manwon / 10000).toFixed(1) + '억' : '-'} / ${l.rent_manwon ? l.rent_manwon + '만 원' : '-'}`,
                l.notes || '',
              ])
            : [['데이터 없음', '-', '-', '-', '-']];
    const tenantNames = floorLeases
            .filter((l: any) => l.tenant_name && (l.rent_manwon ?? 0) > 0)
            .sort((a: any, b: any) => (b.rent_manwon ?? 0) - (a.rent_manwon ?? 0))
            .map((l: any) => l.tenant_name)
            .slice(0, 3);
    const anchorTenantsStr = tenantNames.length > 0 ? tenantNames.join(' / ') : undefined;
    const tenantTypes = [...new Set(floorLeases.map((l: any) => l.tenant_type).filter(Boolean))];
    const primaryUse = tenantTypes.slice(0, 2).join(' / ') || '근린생활시설';
    dataMap['plan'] = {
    title: '층별 임대 현황',
    content: '',
    tables: [{ headers: mdHeaders, rows: mdRows }],
    tableHead: mdHeaders,
    tableRows: mdRows,
    left: {
      sub: '층별 임대 현황',
      rows: mdRows.map(r => [r[0], `${r[1]} (${r[2]})`]),
    },
    right: {
      sub: '임대 구성 특징',
      callouts: anchorTenantsStr
        ? [
            { kind: 'good', title: '주요 임차인', body: `${anchorTenantsStr} 등 안정적 임차인 구성` },
            { kind: 'info', title: '업종 구성', body: `${primaryUse} 중심 복합 구성` },
          ]
        : [{ kind: 'info', title: '임대 현황', body: '층별 임대 현황은 렌트롤을 참조하세요' }],
    },
    metrics: {
      totalFloors: body.ssot_summary?.floors_above ? `지하 ${body.ssot_summary?.floors_below ?? 1}층 ~ 지상 ${body.ssot_summary.floors_above}층` : undefined,
      anchorTenants: anchorTenantsStr,
      targetYield: body.ssot_summary?.gross_yield_pct ? `연 ${body.ssot_summary.gross_yield_pct.toFixed(1)}%` : undefined,
    },
    };
    dataMap['location'] = {
    ...(dataMap['location'] ?? {}),
    title: dataMap['location']?.title || '입지 분석',
    content: dataMap['location']?.content || '',
    tables: dataMap['location']?.tables || [],
    metrics: {
      ...(dataMap['location']?.metrics ?? {}),
      footTraffic: body.footTraffic || '-',
      catchmentHousehold: body.catchmentHousehold || '-',
    },
    right: dataMap['location']?.right || {
      sub: '로드뷰 및 앵커 테넌트',
      rows: [
        ['가시성', '-'],
        ['앵커 테넌트', body.anchorTenants || '-'],
      ],
    },
    };
    const askingPriceEok = (body.asking_price_manwon ?? body.ssot_summary?.asking_price_manwon ?? 0) / 10000;
    const monthlyRentManwon = floorLeases.reduce((sum: number, l: any) => sum + (l.rent_manwon ?? 0), 0);
    const grossYield = body.ssot_summary?.gross_yield_pct;
    const commercialMetrics = [
            anchorTenantsStr ? { label: '주요 임차인', value: anchorTenantsStr, unit: '', sub: '임대료 기준 상위 3인' } : null,
            grossYield ? { label: '총 수익률', value: `${grossYield.toFixed(1)}%`, unit: '', sub: 'Gross Yield' } : null,
            monthlyRentManwon > 0 ? { label: '월 임대료 합계', value: `${monthlyRentManwon.toLocaleString()}만 원`, unit: '', sub: '월/월' } : null,
            { label: '추천 주용도', value: primaryUse, unit: '', sub: '업종 구성' },
          ].filter(Boolean);
    dataMap['summary'] = {
    title: '핵심 투자 지표 요약 (Commercial Visual Grid)',
    content: '',
    tables: [],
    metrics: commercialMetrics,
    metricsData: commercialMetrics,
    leadSentence: `${primaryUse} 중심의 가시성 및 유동인구를 확보한 프리미엄 상업용 근생 자산`,
    keyPoints: [
      `층별 업종 MD 최적화: ${primaryUse} 중심의 업종 배치 및 테넌트 집객력 극대화`,
      '가시성 및 접근성: 전면 도로 노출 및 유동인구 유입에 유리한 근린 상권 입지',
      anchorTenantsStr ? `주요 임차인 확보: ${anchorTenantsStr} 등 안정적인 임대 수익 기반 형성` : '안정적 임대 수익 기반의 다용도 상업용 자산',
    ],
    callouts: [
      { kind: 'good', title: '층별 MD 및 임대 현황', body: `${primaryUse} 중심의 업종 구성으로 공실 리스크를 분산하고 임대 안정성을 확보합니다.` },
    ],
    };
    return dataMap;
}

/**
 * 4. 개발부지형 테크니컬 (Development Technical Blueprint) 특화 바인딩
 * - 다필지 대지면적 합산
 * - 3단 투입비 (토지비, 건축공사비, 금융/제세공과금)
 * - 규제 완화 기한 배너 (A17)
 * - 신축 계획 및 지적도 부록 분리 (placement: 'appendix')
 */
export function bindDevelopmentTemplateData(doc: any, dataMap: Record<string, SectionData> = {}): Record<string, SectionData> {
    const body = doc?.body ?? {};
    const parcels = body.parcels ?? body.multiparcel?.parcels ?? [
            {
              lotNumber: body.address || '대표 필지',
              category: body.ssot_summary?.land_category || '대',
              areaM2: body.ssot_summary?.land_area_sqm || body.heroCard?.landAreaM2 || 0,
              zoning: body.ssot_summary?.zoning || '[용도지역 확인 필요]',
              officialPrice: body.ssot_summary?.official_land_price_won_per_sqm || 0,
            },
          ];
    const totalAreaM2 = parcels.reduce((sum: number, p: any) => sum + Number(p.areaM2 || 0), 0);
    const totalAreaPyeong = sqmToPyeong(totalAreaM2);
    const parcelHeaders = ['지번 / 필지', '지목', '대지면적(㎡)', '대지면적(평)', '용도지역', '공시지가(원/㎡)'];
    const parcelRows: string[][] = parcels.map((p: any) => [
            p.lotNumber ?? p.address ?? '필지',
            p.category ?? p.landCategory ?? '대',
            Number(p.areaM2 || 0).toLocaleString() + '㎡',
            (sqmToPyeong(Number(p.areaM2 || 0))).toFixed(1) + '평',
            p.zoning ?? '[용도지역 확인 필요]',
            Number(p.officialPrice ?? p.pricePerSqm ?? 0).toLocaleString() + '원',
          ]);
    if (parcels.length > 1) {
    parcelRows.push([
      '합계 (다필지 총 대지면적)',
      '대지 일괄',
      `${totalAreaM2.toLocaleString()}㎡`,
      `${totalAreaPyeong.toFixed(1)}평`,
      parcels[0]?.zoning ?? '[용도지역 확인 필요]',
      '—',
    ]);
    }

    dataMap['land'] = {
    title: '다필지 대지면적 및 토지 현황',
    content: '',
    tables: [{ headers: parcelHeaders, rows: parcelRows }],
    tableHead: parcelHeaders,
    tableRows: parcelRows,
    metrics: {
      totalAreaM2: `${totalAreaM2.toLocaleString()}㎡`,
      totalAreaPyeong: `${totalAreaPyeong.toFixed(1)}평`,
    },
    left: {
      sub: '다필지 대지면적 합산 명세',
      rows: parcelRows,
    },
    right: {
      sub: '토지 개발 핵심 지표',
      rows: [
        ['총 합산 대지면적', `${totalAreaM2.toLocaleString()}㎡ (${totalAreaPyeong.toFixed(1)}평)`],
        ['용도지역', parcels[0]?.zoning ?? '[용도지역 확인 필요]'],
        ['기준 건폐율 / 용적률', '[확인 필요]'],
        ['조례 완화 적용 용적률', '[조례 확인 필요]'],
      ],
      callouts: [
        { kind: 'good', title: '다필지 일괄 개발 시너지', body: `총 ${parcels.length}필지 합산 ${totalAreaPyeong.toFixed(1)}평 대규모 대지 확보로 신축 효율 극대화` },
      ],
    },
    totalAreaM2,
    totalAreaPyeong,
    };
    const defaultLandCost = (body.asking_price_manwon ? body.asking_price_manwon / 10000 : 0) || (body.ssot_summary?.asking_price_manwon ? body.ssot_summary.asking_price_manwon / 10000 : 0);
    const landCostBil = Number(body.landCostBil ?? (defaultLandCost > 0 ? Math.round(defaultLandCost) : 0));
    const constCostBil = Number(body.constCostBil ?? 0);
    const financeCostBil = Number(body.financeCostBil ?? 0);
    const totalProjectCostBil = landCostBil + constCostBil + financeCostBil;
    const landPct = totalProjectCostBil > 0 ? ((landCostBil / totalProjectCostBil) * 100).toFixed(1) : '0.0';
    const constPct = totalProjectCostBil > 0 ? ((constCostBil / totalProjectCostBil) * 100).toFixed(1) : '0.0';
    const finPct = totalProjectCostBil > 0 ? ((financeCostBil / totalProjectCostBil) * 100).toFixed(1) : '0.0';
    const costT1Rows = [
            ['투입비 구분', '세부 비용 항목', '예상 금액(억 원)', '비중(%)'],
            ['1단: 토지비', '토지 매입비 + 취득세(4.6%) + 명도보상비', `${landCostBil}.0억 원`, `${landPct}%`],
            ['2단: 건축공사비', '철거비 + 직접공사비 + 설계/감리비', `${constCostBil}.0억 원`, `${constPct}%`],
            ['3단: 금융/제세공과금', 'PF/브릿지 이자 + 금융주선수수료 + 인허가 공과금/예비비', `${financeCostBil}.0억 원`, `${finPct}%`],
            ['총 투입 사업비', '사업비 합계', `${totalProjectCostBil}.0억 원`, '100.0%'],
          ];
    const expectedExitBil = Number(body.expectedExitBil ?? 0);
    const devProfitBil = expectedExitBil - totalProjectCostBil;
    const devMarginPct = totalProjectCostBil > 0 ? ((devProfitBil / totalProjectCostBil) * 100).toFixed(1) : '0.0';
    const costT2Rows = [
            ['수익성 구분', '예상 금액(억 원)', '산출 기준 및 비고'],
            ['예상 준공 가치(분양수입)', `${expectedExitBil}.0억 원`, '신축 연면적 기준 분양가 산정'],
            ['총 투입 사업비', `${totalProjectCostBil}.0억 원`, '토지비 + 공사비 + 금융비용'],
            ['예상 세전 개발이익', `${devProfitBil}.0억 원`, `사업마진 ${devMarginPct}%`],
            ['에쿼티 수익률 (ROE)', `${totalProjectCostBil > 0 ? ((devProfitBil / (totalProjectCostBil * 0.2)) * 100).toFixed(1) : '0.0'}%`, '자기자본 20% 투입 가정'],
          ];
    dataMap['cost'] = {
    title: '3단 사업비 투입 구조 및 개발 타당성 (Development Cost)',
    content: '',
    tables: [
      { headers: costT1Rows[0], rows: costT1Rows.slice(1) },
      { headers: costT2Rows[0], rows: costT2Rows.slice(1) },
    ],
    table1: { sub: '3단 사업비 투입 구조 (토지비·공사비·금융비)', rows: costT1Rows },
    table2: { sub: '개발 수익성 및 회수 시나리오', rows: costT2Rows },
    metrics: {
      totalProjectCost: `${totalProjectCostBil}억`,
      landCost: `${landCostBil}억`,
      constCost: `${constCostBil}억`,
      financeCost: `${financeCostBil}억`,
      devProfit: `${devProfitBil}억`,
    },
    callouts: [
      { kind: 'info', title: '3단 투입비 최적화', body: `토지비 ${landPct}%, 건축공사비 ${constPct}%, 금융/제세공과금 ${finPct}%로 균형 잡힌 사업비 구조` },
    ],
    totalProjectCostBil,
    landCostBil,
    constCostBil,
    financeCostBil,
    };
    const regExpiry = body.regulationExpiry ?? '인허가 기한 검토 필요';
    const regDaysLeft = body.regulationDaysLeft ?? null;
    dataMap['marketing'] = {
    title: '신축 개발 규모 및 준공 전 마케팅 계획',
    content: '',
    tables: [],
    metrics: {},
    devMetrics: {
      landAreaPyeong: totalAreaPyeong.toFixed(1),
      targetGrossAreaPyeong: (totalAreaPyeong * 6.5).toFixed(1),
      expectedBcrPct: 60,
      expectedFarPct: 800,
      estConstructionCostBil: constCostBil,
    },
    totalProjectCostBil,
    regulationExpiry: regExpiry,
    regulationDaysLeft: regDaysLeft,
    callout: {
      kind: 'warn',
      title: `⏳ 한시적 용적률 완화 기한: ${regExpiry} (잔여 ${regDaysLeft}일)`,
      body: '조례 완화 기한 내 인허가 접수 완료 시 용적률 인센티브 혜택 극대화 가능',
    },
    };
    dataMap['stacking'] = dataMap['marketing'];
    dataMap['newBuildingPlan'] = {
    title: '신축 건축 계획안 (부록)',
    content: '신축 설계 개요, 층별 스태킹 및 인허가 세부 타임라인',
    tables: [],
    metrics: {},
    placement: 'appendix',
    };
    dataMap['cadastralMap'] = {
    title: '연속지적도 및 필지 분석 (부록)',
    content: '연속지적도(V-World) 및 토지이용계획원 발췌',
    tables: [],
    metrics: {},
    placement: 'appendix',
    };
    const devMetricsSummary = [
            { label: '다필지 총 대지면적', value: `${totalAreaPyeong.toFixed(1)}평`, unit: '', sub: `${totalAreaM2.toLocaleString()}㎡ (합산)` },
            { label: '총 사업비 (3단 투입)', value: `${totalProjectCostBil}억 원`, unit: '', sub: '토지+공사+금융비' },
            { label: '예상 개발이익 (세전)', value: `${devProfitBil}억 원`, unit: '', sub: `사업마진 ${devMarginPct}%` },
            { label: '규제 완화 기한', value: `${regExpiry}`, unit: '', sub: `잔여 ${regDaysLeft}일` },
            { label: '신축 목표 용적률', value: '최대 800%', unit: '', sub: '조례 완화 적용' },
            { label: '개발 포스처', value: '신축 개발형', unit: '', sub: '부록 자동 분리' },
          ];
    dataMap['summary'] = {
    title: '핵심 투자 지표 요약 (Development Technical Blueprint)',
    content: '',
    tables: [],
    metrics: devMetricsSummary,
    metricsData: devMetricsSummary,
    leadSentence: `다필지 합산 ${totalAreaPyeong.toFixed(1)}평 대지 및 3단 사업비 최적화를 통해 개발이익 ${devProfitBil}억 원을 실현하는 테크니컬 개발 부지`,
    keyPoints: [
      `다필지 대지면적 합산: ${parcels.length}개 필지 총 ${totalAreaM2.toLocaleString()}㎡(${totalAreaPyeong.toFixed(1)}평) 일괄 확보로 대형 신축 가능`,
      `3단 투입비 정밀 구조화: 토지비 ${landCostBil}억 + 공사비 ${constCostBil}억 + 금융비 ${financeCostBil}억 = 총 사업비 ${totalProjectCostBil}억 원`,
      `규제 완화 기한 준수: ${regExpiry}(잔여 ${regDaysLeft}일) 한시적 조례 인센티브 활용으로 사업 수익 극대화`,
    ],
    callouts: [
      {
        kind: 'warn',
        title: `조례 완화 기한 안내: ${regExpiry}`,
        body: `기한 내 인허가 완료 시 최대 용적률 인센티브 적용 가능 (잔여 ${regDaysLeft}일)`,
      },
    ],
    };
    return dataMap;
}

/**
 * 4대 완성형 프라임 템플릿 통합 디스패처
 */
export function bindSpecializedTemplateData(templateId: string, doc: any, dataMap: Record<string, SectionData> = {}): Record<string, SectionData> {
    const resolvedId = PRIME_TEMPLATE_ALIASES[templateId] ?? templateId;
    switch (resolvedId) {
    case 'institutional_dark_gold':
      return bindInstitutionalTemplateData(doc, dataMap);
    case 'corporate_clean_white':
      return bindCorporateTemplateData(doc, dataMap);
    case 'commercial_visual_grid':
      return bindCommercialTemplateData(doc, dataMap);
    case 'development_technical_blueprint':
      return bindDevelopmentTemplateData(doc, dataMap);
    default:
      return dataMap;
    }
}

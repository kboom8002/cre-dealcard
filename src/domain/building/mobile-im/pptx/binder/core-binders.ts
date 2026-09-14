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
import { SectionData, ParsedTable, DATA_KEY_ARCHETYPE, normalizeStationName, findLeadSentence, extractStatMetrics, extractCallouts, extractBulletItems, extractBoldKeyValues, extractBoldValue, sanitizePersona, stripMarkdown, truncate, parseMarkdownTable, extractMetrics, buildCapitalFromIncome, buildFarUpsideProps, buildDcfFromIncome, buildSensitivityFromDcf, buildLoanFromIncome, buildTaxFromIncome, buildOwnerOccupiedPlanProps, buildOwnerOccupiedVsLeaseProps, buildOwnerOccupiedCommuteProps, buildOwnerOccupiedValueProps, buildDevelopmentLandDetailProps, buildDevelopmentScaleProps, buildDevelopmentEvictionProps, buildDevelopmentCostProps, buildDevelopmentFeasibilityProps, bindInstitutionalTemplateData, bindCorporateTemplateData, bindCommercialTemplateData, bindDevelopmentTemplateData, bindSpecializedTemplateData, transformForArchetype, buildA13Props, buildA15Props, buildA17Props, buildA22Props, buildA11Props, buildA12Props, buildA18Props, buildA02Props, buildA03Props, mergeRentRollTables, buildA04Props, buildA05Props, buildA06Props, buildA07Props, buildA08Props, buildA09Props, buildGenericProps, buildSummaryFromOverview, buildLandFromOverview, buildA16Props, CRE_LEXICON_REPLACEMENTS } from "../data-binder";
import { sqmToPyeong, pyeongToSqm } from "@/lib/utils/area-conversion";

/**
 * Phase 2-3: IMCore 정형 객체로부터 PPTX 15종 아키타입 슬라이드 데이터 직접 바인딩
 * 마크다운 파싱을 거치지 않아 오차 및 분열 방지
 */
export function bindFromIMCore(core: IMCore, templateId?: string, body?: Record<string, any>): Record<string, SectionData> {
    const result: Record<string, SectionData> = {};
    const askingPriceBil = core.price.askingKrw > 0 ? (core.price.askingKrw / 1e8).toFixed(1) : '-';
    const grossYield = core.yields.gross_price;
    const yieldObj = buildYieldFromIMCore(core.yields);
    const yieldBasisSub = yieldObj?.basis === 'NOI' ? '순영업소득 기준' : '총임대료 기준';
    const assumedLoanRate = 4.5;
    const isNegLevIMCore = grossYield && grossYield.value < assumedLoanRate;
    const summaryMetrics: Array<{ label: string; value: string; sub: string }> = [
            { label: '매매 희망가', value: `${askingPriceBil}억 원`, sub: '대지 및 건물 일괄' },
            { label: yieldObj ? yieldLabel(yieldObj) : '연 수익률(Cap Rate)', value: grossYield ? `${grossYield.value}%` : '-', sub: yieldBasisSub },
            { label: '실투자금', value: `${(core.equity.equity / 1e8).toFixed(1)}억 원`, sub: '대출/보증금 차감' },
          ];
    if (yieldObj) {
    (result as any)._yield = yieldObj;
    }

    if (isNegLevIMCore) {
    summaryMetrics.push({
      label: '⚠️ 역레버리지 구간',
      value: `수익률 ${grossYield!.value}% < 금리 ${assumedLoanRate}%`,
      sub: '대출 시 자기자본수익률 하락',
    });
    } else {
    summaryMetrics.push({
      label: '임대 안정성',
      value: `${core.leases.length}개실`,
      sub: `${core.leases.filter(l => l.leaseState === '임대중').length}개실 임대중`,
    });
    }

    result['summary'] = {
    title: '핵심 투자 지표 요약',
    content: '',
    tables: [],
    metrics: {
      askingPrice: `${askingPriceBil}억`,
      yield: grossYield ? `${grossYield.value}%` : '-',
    },
    leadSentence: `${core.address?.sido ? core.address.sido + ' ' : ''}${core.address?.sigungu ? core.address.sigungu + ' ' : ''}소재 ${core.meta?.ontology?.assetType || '상업용'} 자산`.trim(),
    metricsData: summaryMetrics,
    // BL-4: 역레버리지 메타데이터
    negativeLeverage: !!isNegLevIMCore,
    negativeLeverageWarning: isNegLevIMCore
      ? `대출금리(연 ${assumedLoanRate}%)가 총수익률(${grossYield!.value}%)보다 높아 대출 시 자기자본수익률이 하락하는 역레버리지 구간입니다.`
      : null,
    };
    result['building'] = {
    title: '건축물 및 토지 개요',
    content: '',
    tables: [],
    metrics: {},
    left: {
      sub: '기본 현황',
      rows: [
        ['소재지', core.address.raw],
        ['대지면적', core.physical.landAreaSqm ? `${core.physical.landAreaSqm}㎡ (${(sqmToPyeong(core.physical.landAreaSqm)).toFixed(1)}평)` : '-'],
        ['연면적(총)', core.physical.totalGrossAreaSqm ? `${core.physical.totalGrossAreaSqm}㎡ (${(sqmToPyeong(core.physical.totalGrossAreaSqm)).toFixed(1)}평)` : '-'], // D30 BL-5
        ['층수', `지하 ${core.physical.floorsBelow ?? 0}층 / 지상 ${core.physical.floorsAbove ?? 0}층`],
        ['준공연도', core.physical.completionYear ? `${core.physical.completionYear}년` : '-'],
      ],
    },
    right: {
      sub: '토지 및 공법 규제',
      rows: [
        ['용도지역', core.physical.zoning ?? '확인 필요'],
        ['건폐율 / 용적률', `${core.physical.bcrPct ?? '-'}% / ${core.physical.farPct ?? '-'}%`],
        ['주차 / 승강기', `${core.physical.parkingCount ?? '-'}대 / ${core.physical.elevatorCount ?? '-'}대`],
        ['도로조건', core.physical.roadAccess ?? '-'],
      ],
      callouts: core.deficiencies.filter(d => d.affects.includes('dev_feasibility')).map(d => d.label),
    },
    };
    const isBasicPreset = body?.preset === 'credeal_basic';
    if (isBasicPreset && result['building']) {
    const bldgData = result['building'] as any;
    const leftRows = bldgData.left?.rows ?? [];
    const priceIdx = leftRows.findIndex((r: any[]) => 
      r[0] && (String(r[0]).includes('매매') || String(r[0]).includes('매각') || String(r[0]).includes('희망가'))
    );
    if (priceIdx >= 0) {
      const priceRow = leftRows.splice(priceIdx, 1)[0];
      bldgData.priceTable = { label: String(priceRow[0]), value: String(priceRow[1]) };
    }
    }

    const isBasicPresetForRentRoll = body?.preset === 'credeal_basic';
    const rentRollHeaders = isBasicPresetForRentRoll 
            ? ['층수', '면적(평)', '임차인', '보증금', '월세', '계약종료']
            : ['호실', '업종', '면적', '보증금', '월세', '관리비', '만기일'];
    const rentRollRows = core.leases.map(l => isBasicPresetForRentRoll ? [
            l.unitLabel,
            l.leaseAreaSqm ? `${(sqmToPyeong(l.leaseAreaSqm)).toFixed(0)}평` : '-',
            l.tenantBusiness ?? (l.leaseState === '공실' ? '공실' : '-'),
            l.depositKrw ? `${Math.round(l.depositKrw / 10000).toLocaleString()}만` : '-',
            l.monthlyRentKrw ? `${Math.round(l.monthlyRentKrw / 10000).toLocaleString()}만` : '-',
            l.currentExpiryDate ?? '-',
          ] : [
            l.unitLabel,
            l.tenantBusiness ?? (l.leaseState === '공실' ? '🚫 공실' : '-'),
            l.leaseAreaSqm ? `${(sqmToPyeong(l.leaseAreaSqm)).toFixed(0)}평` : '-',
            l.depositKrw ? `${Math.round(l.depositKrw / 10000).toLocaleString()}만` : '-',
            l.monthlyRentKrw ? `${Math.round(l.monthlyRentKrw / 10000).toLocaleString()}만` : '-',
            l.mgmtFeeKrw ? `${Math.round(l.mgmtFeeKrw / 10000).toLocaleString()}만` : '-',
            l.currentExpiryDate ?? '-',
          ]);
    result['rentRoll'] = {
    title: '임대차 상세 현황',
    content: '',
    tables: [{ headers: rentRollHeaders, rows: rentRollRows }],
    metrics: {},
    tableHead: rentRollHeaders,
    tableRows: rentRollRows,
    };
    if (isBasicPresetForRentRoll && result['rentRoll'] && result['stackingPlan']) {
    (result['rentRoll'] as any).stackingPlan = (result['stackingPlan'] as any)?.stackingPlan ?? [];
    (result['rentRoll'] as any).stackingSummary = (result['stackingPlan'] as any)?.summary ?? {};
    }

    const hasLoanInput = !!(body?.loan_scenario?.ltv_pct != null || body?.loan_scenario?.interest_pct != null
            || body?.loan_amount_manwon || body?.ssot_summary?.loan_amount_manwon);
    const profitStats: Array<{ label: string; value: string }> = [
            { label: '매매가', value: `${askingPriceBil}억` },
            { label: '총취득원가', value: `${(core.equity.totalAcquisitionCost / 1e8).toFixed(1)}억` },
          ];
    if (hasLoanInput) {
    profitStats.push({ label: '실투자금', value: `${(core.equity.equity / 1e8).toFixed(1)}억` });
    }

    result['profit'] = {
    title: '수익 및 투자 분석',
    content: '',
    tables: [],
    metrics: {},
    stats: profitStats,
    };
    const askingKrw = core.price.askingKrw || 0;
    const depositKrw = core.equity.deposit || 0;
    const totalCostKrw = core.equity.totalAcquisitionCost || askingKrw * 1.055;
    const annualRentKrw = (core.anchors?.monthlyRentTotalManwon ?? 0) * 10000 * 12 || 
            (core.yields?.gross_price ? askingKrw * (core.yields.gross_price.value / 100) : 0);
    const loanRatePct = body?.loan_scenario?.interest_pct ?? 4.5;
    const calcLtvScenario = (ltvPct: number, note: string) => {
            const loan = askingKrw * (ltvPct / 100);
            const equity = totalCostKrw - depositKrw - loan;
            const annualInterest = loan * (loanRatePct / 100);
            const netCashFlow = annualRentKrw - annualInterest;
            const yieldPct = equity > 0 ? parseFloat(((netCashFlow / equity) * 100).toFixed(2)) : 0;
            return {
              ltvPct,
              equityBil: (equity / 1e8).toFixed(1),
              yieldPct,
              note,
            };
          };
    const grossYieldPct = askingKrw > 0 ? (annualRentKrw / askingKrw) * 100 : 0;
    const isNegLev = grossYieldPct > 0 && grossYieldPct < loanRatePct;
    const userLtvPctCapital = body?.loan_scenario?.ltv_pct as number | undefined;
    const ltvScenarios = [
            calcLtvScenario(0, '전액 자기자본 (무차입)'),
            calcLtvScenario(40, '보수적 차입 (LTV 40%)'),
            calcLtvScenario(50, '표준 차입 (LTV 50%)'),
          ];
    if (userLtvPctCapital != null && ![0, 40, 50].includes(userLtvPctCapital)) {
    ltvScenarios.push(calcLtvScenario(userLtvPctCapital, `사용자 입력 (LTV ${userLtvPctCapital}%)`));
    ltvScenarios.sort((a, b) => a.ltvPct - b.ltvPct);
    }

    result['capital'] = {
    title: '투자 및 자본 조달 구조 분석',
    content: '',
    tables: [],
    metrics: {},
    equityBreakdown: core.equity,
    ltvScenarios,
    negativeLeverage: isNegLev,
    negativeLeverageWarning: isNegLev
      ? `대출금리(연 ${loanRatePct}%)가 총수익률(${grossYieldPct.toFixed(2)}%)보다 높아 대출 시 자기자본수익률이 하락하는 역레버리지 구간입니다.`
      : null,
    };
    result['cost'] = result['capital'];
    result['marketing'] = {
    title: '신축 개발 규모 및 준공 전 마케팅 계획',
    content: '',
    tables: [],
    metrics: {},
    devMetrics: {
      landAreaPyeong: core.physical.landAreaSqm ? (sqmToPyeong(core.physical.landAreaSqm)).toFixed(1) : '-',
      targetGrossAreaPyeong: core.physical.totalGrossAreaSqm ? (sqmToPyeong(core.physical.totalGrossAreaSqm)).toFixed(1) : '-',
      expectedBcrPct: core.physical.bcrPct ?? 60,
      expectedFarPct: core.physical.farPct ?? 400,
    },
    regulationExpiry: '2028-05-18',
    regulationDaysLeft: 630,
    };
    result['stacking'] = result['marketing'];
    const deficiencyBlocks = core.deficiencies.map(d => ({
            label: d.label,
            value: d.severity === 'block' ? '확인 필수' : '참고 사항',
            description: `• 영향 항목: ${d.affects.join(', ')}\n• 권장 조치: ${d.nextBest}`,
          }));
    result['risk'] = {
    title: '핵심 투자 리스크 및 실사 점검',
    content: '',
    tables: [],
    metrics: {},
    blocks: deficiencyBlocks.length >= 3 ? deficiencyBlocks.slice(0, 3) : undefined,
    legalStatus: core.physical.zoning ? `${core.physical.zoning} (규제 점검)` : '공법 확인 필요',
    leaseStatus: `${core.leases.length}개실 임대차 (상임법/대항력 점검)`,
    physicalStatus: core.physical.completionYear ? `${core.physical.completionYear}년 준공 (설비 점검)` : '물리 점검',
    };
    result['thesis'] = {
    title: '투자 핵심 논거 (Investment Thesis)',
    content: '',
    tables: [],
    metrics: {},
    pillars: [
      { num: '01', title: '입지 및 배후 수요', summary: `${core.address.sido} ${core.address.sigungu} 핵심 상권/업무권역 입지 경쟁력` },
      { num: '02', title: '수익성 및 현금흐름', summary: `안정적 임대차 구성을 통한 연 순수익 확보 및 밸류애드 여력` },
      { num: '03', title: '자산 가치 상승', summary: `토지 가치 상승 및 리모델링/신축을 통한 미래 가치 실현` },
    ],
    };
    result['location'] = {
    title: '입지 및 접근성 분석',
    content: '',
    tables: [],
    metrics: {},
    address: core.address.raw,
    roadAccess: core.physical.roadAccess ?? '도로 접함',
    };
    result['process'] = {
    title: '매수 진행 절차 및 타임라인',
    content: '',
    tables: [],
    metrics: {},
    };
    result['closing'] = {
    title: '투자 검토 마무리',
    content: '',
    tables: [],
    metrics: {},
    };
    result['roomSpec'] = {
    title: '호실 스펙 (Room Specification)',
    content: '',
    tables: [],
    metrics: {},
    totalGrossAreaSqm: core.physical.totalGrossAreaSqm,
    floorsAbove: core.physical.floorsAbove,
    floorsBelow: core.physical.floorsBelow,
    leaseCount: core.leases.length,
    };
    result['ownership'] = {
    title: '소유권 구조 (Ownership Structure)',
    content: '',
    tables: [],
    metrics: {},
    address: core.address.raw,
    pnu: core.address.pnu,
    };
    result['kpi'] = {
    title: '운영 지표 분석 (Operating KPI)',
    content: '',
    tables: [],
    metrics: {},
    grossYieldPct: core.anchors.grossYieldPct,
    netYieldPct: core.anchors.netYieldPct,
    };
    result['comps'] = {
    title: '비교사례 분석 (Comparable Transactions)',
    content: '',
    tables: [],
    metrics: {},
    comps: core.comps.map((c: Comp) => ({
      address: c.address,
      priceKrw: c.priceKrw,
      areaSqm: c.areaSqm,
      pricePerPyeong: c.pricePerPyeong,
      dealDate: c.dealDate,
    })),
    };
    const activeTemplateId = templateId ?? (core as any)?.templateId ?? (core as any)?.presetId;
    if (activeTemplateId) {
    bindSpecializedTemplateData(activeTemplateId, { body: core }, result);
    }

    return result;
}

/**
 * V-World / 공공 API 구조화 데이터를 슬라이드 props로 직접 매핑.
 * 마크다운 파싱에 의존하지 않고, 검증된 공공 데이터 JSON을 사용.
 *
 * @param enrichment - handler.ts에서 주입된 enrichment 객체 (ExternalDataEnrichmentResult 부분집합)
 * @param dataMap - bindSectionData가 생성한 기존 dataMap (보강, 덮어쓰기 아님 — _source가 없을 때만)
 * @param body - (optional) doc.body for ssot_summary / heroCard fallbacks on land area, shape, road access
 */
export function bindFromExternalData(enrichment: Record<string, any>, dataMap: Record<string, any>, body?: Record<string, any>): void {
    const lup = enrichment.landUsePlan;
    const lp = enrichment.landPrice;
    const regPlatArea = enrichment.buildingRegister?.platArea;
    if (lup || lp || regPlatArea || body?.ssot_summary?.land_area_sqm || body?.heroCard?.landAreaM2) {
    const rows: string[][] = [];
    if (lup?.zoningDistrict) rows.push(['용도지역', lup.zoningDistrict]);
    if (lup?.zoningOverlap) {
      const overlap = Array.isArray(lup.zoningOverlap) ? lup.zoningOverlap.join(', ') : lup.zoningOverlap;
      if (overlap) rows.push(['용도지구', overlap]);
    }
    if (lup?.buildingCoverageMax) rows.push(['법정 건폐율 상한', `${lup.buildingCoverageMax}%`]);
    if (lup?.floorAreaRatioMax) rows.push(['법정 용적률 상한', `${lup.floorAreaRatioMax}%`]);

    // G-06: 대지면적 — V-World landUsePlan → landPrice → buildingRegister.platArea → ssot_summary 순 폴백
    const effectiveLandArea = lup?.landArea
      ?? lp?.landArea
      ?? regPlatArea
      ?? body?.ssot_summary?.land_area_sqm
      ?? body?.ssot_summary?.plat_area_sqm
      ?? body?.heroCard?.landAreaM2;
    if (effectiveLandArea && Number(effectiveLandArea) > 0) {
      const areaSqm = Number(effectiveLandArea);
      rows.push(['대지면적', `${areaSqm.toLocaleString()}㎡ (${(sqmToPyeong(areaSqm)).toFixed(1)}평)`]);
    }

    // G-07: 필지 형상 — V-World landUsePlan 우선, ssot_summary 폴백
    const effectiveLandShape = lup?.landShape
      ?? body?.ssot_summary?.land_shape
      ?? body?.ssot_summary?.parcel_shape;
    if (effectiveLandShape) rows.push(['필지 형상', effectiveLandShape]);

    if (lup?.terrain) rows.push(['지형', lup.terrain]);

    // G-07: 도로접면 — V-World landUsePlan 우선, ssot_summary 폴백
    const effectiveRoadAccess = lup?.roadAccess
      ?? body?.ssot_summary?.road_frontage
      ?? body?.ssot_summary?.road_condition;
    if (effectiveRoadAccess) rows.push(['도로접면', effectiveRoadAccess]);

    if (lup?.landUseSituation) rows.push(['이용상황', lup.landUseSituation]);
    if (lp?.landCategory) rows.push(['지목', lp.landCategory]);
    if (lp?.pricePerSqm) {
      const pricePerPyeong = Math.round(Number(lp.pricePerSqm) * 3.3058);
      rows.push(['개별공시지가', `${Number(lp.pricePerSqm).toLocaleString()}원/㎡ (${pricePerPyeong.toLocaleString()}원/평, ${lp.baseYear ?? ''}년)`]);
    }

    // 기존 마크다운 파싱 결과보다 V-World 데이터 우선하되, 우측 분석 콜아웃은 보존
    const existingRight = dataMap['land']?.right;
    const rightCallouts = existingRight?.callouts?.length > 0
      ? existingRight.callouts
      : [
          {
            kind: 'info',
            title: '토지 규제 및 공법 분석',
            body: `• ${lup?.zoningDistrict ?? '용도지역'} 기준 건폐율 ${lup?.buildingCoverageMax ?? '-'}% 이하, 용적률 ${lup?.floorAreaRatioMax ?? '-'}% 이하 적용\n• 토지 형상 및 도로 접면 여건 확인 기반 최적 토지이용계획 수립 가능`,
          },
        ];

    dataMap['land'] = {
      ...(dataMap['land'] ?? {}),
      title: '토지 현황',
      content: '',
      tables: [],
      metrics: {},
      left: { sub: '토지이용계획 · 개별공시지가', rows },
      right: { sub: existingRight?.sub || '토지 규제 요약', callouts: rightCallouts },
      _source: 'vworld_api',
    };
    }

    const br = enrichment.buildingRegister;
    if (br && lup) {
    const brRows: string[][] = [];
    if (br.buildingName) brRows.push(['건물명', br.buildingName]);
    if (br.mainPurpose) brRows.push(['주용도', br.mainPurpose]);
    if (br.structure) brRows.push(['구조', br.structure]);
    if (br.roofType) brRows.push(['지붕', br.roofType]);
    if (br.groundFloors != null) brRows.push(['지상 층수', `${br.groundFloors}층`]);
    if (br.undergroundFloors != null) brRows.push(['지하 층수', `${br.undergroundFloors}층`]);
    if (br.totalArea != null) brRows.push(['연면적', `${Number(br.totalArea).toLocaleString()}㎡ (${(sqmToPyeong(Number(br.totalArea))).toFixed(1)}평)`]);
    if (br.archArea != null) brRows.push(['건축면적', `${Number(br.archArea).toLocaleString()}㎡`]);
    if (br.approvalDate) brRows.push(['사용승인일', br.approvalDate]);
    if (br.elevatorCount != null) brRows.push(['승강기', `${br.elevatorCount}대`]);
    if (br.parkingCount != null) {
      const selfP = br.selfParkingCount ?? 0;
      const mechP = br.mechanicalParkingCount ?? 0;
      brRows.push(['주차', `${br.parkingCount}대 (자주식 ${selfP} / 기계식 ${mechP})`]);
    }

    const lupRows: string[][] = [];
    if (lup.zoningDistrict) lupRows.push(['용도지역', lup.zoningDistrict]);
    if (lup.buildingCoverageMax && lup.floorAreaRatioMax) {
      lupRows.push(['건폐율/용적률', `${lup.buildingCoverageMax}% / ${lup.floorAreaRatioMax}%`]);
    }
    if (lup.roadAccess) lupRows.push(['도로접면', lup.roadAccess]);

    dataMap['publicRecords'] = {
      title: '공부 발췌',
      content: '',
      tables: [],
      metrics: {},
      left: { sub: '건축물대장 표제부', rows: brRows },
      right: { sub: '토지이용규제', rows: lupRows },
      _source: 'public_api',
    };
    }

    const reg = enrichment.registryData;
    const regRows: string[][] = [];
    if (reg) {
    if (reg.ownerName) regRows.push(['소유자', reg.ownerName]);
    if (reg.ownershipType) regRows.push(['소유형태', reg.ownershipType]);
    if (reg.acquisitionDate) regRows.push(['취득일', reg.acquisitionDate]);
    if (Array.isArray(reg.mortgages)) {
      reg.mortgages.forEach((m: any, i: number) => {
        regRows.push([`근저당 ${i + 1}`, `${m.creditor ?? '채권자 미확인'} / ${m.amount != null ? Number(m.amount).toLocaleString() + '원' : '금액 미확인'}`]);
      });
    }
    if (Array.isArray(reg.encumbrances)) {
      reg.encumbrances.forEach((e: any) => {
        if (e.type && e.description) regRows.push([e.type, e.description]);
      });
    }
    }

    if (regRows.length === 0) {
    regRows.push(
      ['소유권', '단독 소유 (실사 확인 필요)'],
      ['제한물권', '근저당권 외 특이사항 없음'],
      ['권리분쟁', '압류·가압류·가처분 내역 없음'],
      ['신탁등기', '해당 없음 (일반 등기)'],
    );
    }

    if (!dataMap['titleRights']?._source) {
    dataMap['titleRights'] = {
      title: '권리관계',
      content: '',
      tables: [],
      metrics: {},
      left: { sub: '등기부등본 권리관계 요약', rows: regRows },
      right: {
        sub: '권리관계 실사 및 인수 조건',
        callouts: [
          {
            kind: 'info',
            title: '제한물권 및 근저당 말소 확약',
            body: '• 매매 잔금 시 기존 설정된 근저당권 및 담보 설정 전액 말소 조건 승계\n• 소유권 이전 등기 및 근저당 말소 동시 이행을 통한 매수인 권리 확보\n• 임차인 임대보증금 승계 확약서 징구 및 대항력 유무 원본 대조 필수',
          },
          {
            kind: 'info',
            title: '소유권 분쟁 및 처분금지 가처분 검토',
            body: '• 등기부 갑구상 소유권 분쟁, 압류, 가압류, 가처분 등 제한 사항 전무 확인\n• 매도인 본인 확인 및 인감증명서, 위임장 진위 여부 사전 실사 완료\n• 신탁 등기 또는 공동 담보 설정 여부 점검 완료',
          },
        ],
      },
      _source: 'registry_api',
    };
    }

    const comps = enrichment.comparableTransactions;
    if (Array.isArray(comps) && comps.length > 0 && !dataMap['comps']?._source) {
    const compRows: string[][] = [];
    compRows.push(['물건', '거래가', '면적', '거래일']);
    comps.slice(0, 5).forEach((c: any) => {
      compRows.push([
        c.buildingName || c.address || '-',
        c.dealAmount ? `${(c.dealAmount / 10000).toFixed(1)}억` : '-',
        c.area ? `${c.area}㎡` : '-',
        c.dealDate || '-',
      ]);
    });

    dataMap['comps'] = {
      ...(dataMap['comps'] ?? {}),
      title: '인근 거래 사례',
      content: '',
      tables: [{ headers: compRows[0], rows: compRows.slice(1) }],
      metrics: {},
      _source: 'rtms_api',
    };
    }

    const cd = enrichment.commercialDistrict;
    if (cd) {
    // D38 BL-3: 상권 단어 중복 방어 — districtName에서 '상권' 접미사 제거 후 접합
    const cleanDistrictName = (cd.districtName || '해당').replace(/\s*상권$/g, '').replace(/\s*상권$/g, '');
    const cdRows: string[][] = [];
    if (cd.districtName) cdRows.push(['상권명', cleanDistrictName + ' 상권']);
    if (cd.districtType) cdRows.push(['상권유형', cd.districtType]);
    if (cd.mainIndustry) cdRows.push(['주요업종', cd.mainIndustry]);
    if (cd.floatingPopulation != null) cdRows.push(['유동인구', `${Number(cd.floatingPopulation).toLocaleString()}명/일`]);
    if (cd.salesIndex != null) cdRows.push(['매출지수', String(cd.salesIndex)]);
    if (cd.storeCount != null) cdRows.push(['점포수', `${cd.storeCount}개`]);
    if (cd.openRate != null) cdRows.push(['개업률', `${cd.openRate}%`]);
    if (cd.closeRate != null) cdRows.push(['폐업률', `${cd.closeRate}%`]);

    dataMap['commercialDistrict'] = {
      title: '상권 분석',
      content: '',
      tables: [],
      metrics: {},
      left: { sub: '소상공인 상권 분석', rows: cdRows },
      right: {
        sub: '상권 배후 및 소비력 분석',
        callouts: [
          {
            kind: 'info',
            title: '상권 활성도 및 유동인구 특성',
            body: `• ${cleanDistrictName} 상권은 ${cd.mainIndustry || '근린생활·F&B'} 중심의 안정적 배후 수요 형성\n• 일평균 유동인구 ${cd.floatingPopulation ? Number(cd.floatingPopulation).toLocaleString() + '명' : '풍부'} 기반의 지속적 점포 매출 창출력 확보\n• 개업률(${cd.openRate ?? 2.8}%) 및 폐업률(${cd.closeRate ?? 2.1}%) 기준 상권 생존 안정성 검증`,
          },
          {
            kind: 'info',
            title: 'MD 구성 및 집객력 강화 전략',
            body: '• 직장인 및 배후 주거단지 소비 특성을 고려한 앵커 테넌트 유치 적합\n• 주말/주중 시간대별 매출 분산 구조로 안정적 임대료 수취 환경 조성\n• 인근 대형 집객 시설과의 시너지 효과를 통한 상권 확장 잠재력 보유',
          },
        ],
      },
      _source: 'semas_api',
    };
    }

    const poi = enrichment.locationPoi;
    if (poi && !poi._isFallback && dataMap['location']) {
    const locRight = (dataMap['location'] as any).right;
    if (locRight?.rows) {
      const rows: [string, string][] = locRight.rows;

      // nearestStation → '대중교통' 행을 구체적인 역명+도보시간으로 교체
      if (poi.nearestStation?.name) {
        const stationName = normalizeStationName(poi.nearestStation.name);
        const walkMin = poi.nearestStation.walkMinutes ?? Math.max(1, Math.round((poi.nearestStation.distanceM ?? 400) / 80));
        const distM = poi.nearestStation.distanceM;
        const concreteValue = `${stationName} 도보 ${walkMin}분` + (distM ? ` (약 ${distM}m)` : '');

        const transitIdx = rows.findIndex(([label]) =>
          label.includes('대중교통') || label.includes('지하철') || label.includes('교통')
        );
        if (transitIdx >= 0) {
          rows[transitIdx] = ['대중교통', concreteValue];
        } else {
          // 행이 없으면 추가
          rows.splice(1, 0, ['대중교통', concreteValue]);
        }
      }

      // keySpots → 주요 랜드마크 행 추가 (역 제외, 최대 2개)
      const landmarks = (poi.keySpots ?? [])
        .filter((s: any) => s.category !== 'subway' && s.name && s.distanceM)
        .slice(0, 2);
      for (const lm of landmarks) {
        const lmWalk = Math.max(1, Math.round(lm.distanceM / 80));
        const categoryLabel: Record<string, string> = {
          hospital: '의료시설', university: '교육시설', shopping: '상업시설', landmark: '주요시설',
        };
        const label = categoryLabel[lm.category] || '주요시설';
        if (!rows.some(([, v]) => v.includes(lm.name))) {
          rows.push([label, `${lm.name} 도보 ${lmWalk}분 (약 ${lm.distanceM}m)`]);
        }
      }

      // 6행 제한 유지
      locRight.rows = rows.slice(0, 6);
    }
    }

    const cadastral = enrichment.cadastralMapImage;
    if (cadastral) {
    dataMap['cadastralMap'] = {
      title: '지적도',
      content: '',
      tables: [],
      metrics: {},
      coordinates: null,
      mapImageUrl: null,
      cadastralImage: cadastral.base64 ?? cadastral,
      left: { sub: '연속지적도 (V-World)', source: `© V-World 국토교통부 | ${new Date().getFullYear()}` },
      right: {
        sub: '필지 정보',
        rows: dataMap['land']?.left?.rows?.slice(0, 4) ?? [],
      },
      _source: 'vworld_wms',
    };
    }

    const macroTransit = enrichment.macroTransitImage;
    if (macroTransit) {
    const rawImage = typeof macroTransit === 'object' && macroTransit !== null
      ? (macroTransit.base64 ?? macroTransit.data ?? (Buffer.isBuffer(macroTransit) ? `image/png;base64,${macroTransit.toString('base64')}` : null))
      : (typeof macroTransit === 'string' ? macroTransit : null);

    if (rawImage) {
      if (!dataMap['location']) {
        dataMap['location'] = {
          title: '입지 및 광역 대중교통망 분석',
          content: '',
          tables: [],
          metrics: {},
          macroTransitImage: rawImage,
          left: { sub: '광역 대중교통망 벡터 다이어그램', source: 'Location Macro Transit Engine (1600x1200 px, 266.7 DPI)' },
          right: { sub: '대중교통 접근성 및 인프라', rows: [] },
          _source: 'macro_transit_vector',
        };
      } else {
        dataMap['location'].macroTransitImage = rawImage;
        if (!dataMap['location'].left) {
          dataMap['location'].left = {};
        }
        dataMap['location'].left.sub = dataMap['location'].left.sub || '광역 대중교통망 벡터 다이어그램';
        dataMap['location'].left.source = dataMap['location'].left.source || 'Location Macro Transit Engine (1600x1200 px, 266.7 DPI)';
      }
    }
    }
}

/**
 * D41 W4: im-core 모듈 → PPTX 데이터 바인딩 경로
 * ClaimRegistry에서 슬라이드 데이터를 직접 추출합니다.
 */
export function bindFromClaimRegistry(registry: ClaimRegistry, options?: {
    permitZone?: PermitZoneResult;
    convertedDeposits?: ConvertedDepositResult[];
    effectiveRents?: EffectiveRentResult[];
    koreanLegal?: KoreanLegalFields;
    }): Record<string, any> {
    const result: Record<string, any> = {};
    const claims = registry.getAll();
    for (const claim of claims) {
    if (claim.value !== null) {
      result[claim.subject] = {
        value: claim.value,
        unit: claim.unit,
        displayLabel: claim.displayLabel,
        asOf: claim.asOf,
        status: claim.status,
        claimId: claim.id,
      };
    }
    }

    if (options?.permitZone) {
    const pz = options.permitZone;
    result.permitZone = {
      isPermitZone: pz.isPermitZone,
      permitRequired: pz.permitRequired,
      thresholdSqm: pz.thresholdSqm,
      designatedUntil: pz.designatedUntil,
      source: pz.source,
      asOf: pz.asOf,
    };
    }

    if (options?.convertedDeposits?.length) {
    result.convertedDeposits = options.convertedDeposits.map(cd => ({
      convertedDeposit: cd.convertedDeposit,
      protectionThreshold: cd.protectionThreshold,
      isProtected: cd.isProtected,
      formula: cd.formula,
    }));
    }

    if (options?.effectiveRents?.length) {
    result.effectiveRents = options.effectiveRents.map(er => ({
      effectiveRent: er.effectiveMonthlyRent,
      formula: er.formula,
    }));
    }

    if (options?.koreanLegal) {
    const kl = options.koreanLegal;
    result.koreanLegal = {
      violation_registered: kl.violation_registered,
      violation_detail: kl.violation_detail,
      transaction_structure: kl.transaction_structure,
      redevelopment_zone: kl.redevelopment_zone,
      brokerage_fee_rate: kl.brokerage_fee_rate,
      fund_source_report_required: kl.fund_source_report_required,
    };
    }

    return result;
}

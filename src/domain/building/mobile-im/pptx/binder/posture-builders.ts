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
import { SectionData, ParsedTable, DATA_KEY_ARCHETYPE, normalizeStationName, findLeadSentence, extractStatMetrics, extractCallouts, extractBulletItems, extractBoldKeyValues, extractBoldValue, sanitizePersona, stripMarkdown, truncate, parseMarkdownTable, extractMetrics, bindInstitutionalTemplateData, bindCorporateTemplateData, bindCommercialTemplateData, bindDevelopmentTemplateData, bindSpecializedTemplateData, bindFromIMCore, bindFromExternalData, bindFromClaimRegistry, transformForArchetype, buildA13Props, buildA15Props, buildA17Props, buildA22Props, buildA11Props, buildA12Props, buildA18Props, buildA02Props, buildA03Props, mergeRentRollTables, buildA04Props, buildA05Props, buildA06Props, buildA07Props, buildA08Props, buildA09Props, buildGenericProps, buildSummaryFromOverview, buildLandFromOverview, buildA16Props, CRE_LEXICON_REPLACEMENTS } from "../data-binder";
import { sqmToPyeong, pyeongToSqm } from "@/lib/utils/area-conversion";

export function buildCapitalFromIncome(markdown: string, tables: ParsedTable[], body?: Record<string, any>, building?: Record<string, any>): Record<string, any> {
    return buildA16Props(markdown, tables, body, building);
}

/**
 * D38: A04 용적률 여유 (FAR Upside) props 생성기 (R-INC-02 가치상승형)
 */
export function buildFarUpsideProps(markdown: string, tables: ParsedTable[], body?: Record<string, any>, building?: Record<string, any>): Record<string, any> {
    const lup = body?.enrichment?.landUsePlan ?? body?.external_data?.landUsePlan ?? {};
    const ssot = body?.ssot_summary ?? {};
    const bldg = {
            ...ssot,
            ...(building ?? {}),
          };
    const farMax = lup.floorAreaRatioMax ?? lup.farMax ?? 250;
    const bcrMax = lup.buildingCoverageMax ?? lup.bcrMax ?? 60;
    const currentFar = bldg.floor_area_ratio ?? bldg.far ?? 180;
    const currentBcr = bldg.building_coverage_ratio ?? bldg.bcr ?? 52;
    const landAreaP = bldg.land_area_pyung
            ?? bldg.land_area_pyeong
            ?? (bldg.land_area_sqm ? Math.round(sqmToPyeong(bldg.land_area_sqm) * 10) / 10 : 0);
    const remainingFar = Math.max(0, farMax - currentFar);
    const additionalAreaP = landAreaP > 0 ? (landAreaP * (remainingFar / 100)).toFixed(1) : '-';
    const zoning = lup.zoningName ?? lup.zoning ?? bldg.zoning ?? '일반주거지역';
    const rows: [string, string][] = [
            ['용도지역', zoning],
            ['법정 상한 용적률', `${farMax}%`],
            ['현재 건축 용적률', `${currentFar}%`],
            ['잔여 용적률 여유', `+${remainingFar}%p`],
            ['증축 가능 연면적', additionalAreaP !== '-' ? `약 ${additionalAreaP}평` : '현황 검토 필요'],
            ['건폐율 현황', `${currentBcr}% (법정 한도 ${bcrMax}%)`],
            ['도로 접면 현황', lup.roadAccess ?? ssot.road_condition ?? '접면 현황 검토 필요'],
          ];
    return {
    kicker: 'FAR UPSIDE',
    title: '용적률 여유 및 증축 잠재력',
    left: {
      sub: '법정 용적률 및 잔여 개발 용량',
      rows,
    },
    right: {
      sub: '용적률 가치 상승 제안',
      callouts: [
        {
          kind: 'info',
          title: '수직 증축 및 공간 재배치 잠재력',
          body: `• 법정 상한 용적률(${farMax}%) 대비 약 ${remainingFar}%p의 잔여 용적률 여유 확보\n• 상부층 1~2개 층 수직 증축(약 ${additionalAreaP}평)을 통한 유효 임대면적 극대화\n• 증축 후 임대료 정상화 시 연간 순수익률(Cap Rate) 1.2%p 추가 상승 기대`,
        },
        {
          kind: 'info',
          title: '신축 재개발 시 사업성 극대화',
          body: '• 향후 신축 시 기준 용적률 100% 완전 활용으로 자산 가치 퀀텀 점프 가능\n• 지자체 건축 조례 및 공개공지 인센티브 완화 규정 연계 검토 권장\n• 도로 접면 여건 우수로 공사 진출입 및 일조권 사선제한 영향 최소화',
        },
      ],
    },
    };
}

/**
 * income_analysis → dcf 파생 (10년 DCF 분석 슬라이드용)
 * doc.body.dcf10Year 또는 income 섹션 테이블/메트릭에서 추출
 */
export function buildDcfFromIncome(markdown: string, tables: ParsedTable[], body: Record<string, any>): Record<string, any> {
    const dcf = body?.dcf10Year ?? {};
    const lines = markdown.split('\n').map(l => l.trim()).filter(Boolean);
    if (dcf && Object.keys(dcf).length > 0) {
    const rows1: string[][] = [
      ['항목', '값'],
      ...Object.entries(dcf).slice(0, 6).map(([k, v]) => [k, String(v)]),
    ];
    return {
      table1: { sub: 'DCF 10년 분석', rows: rows1 },
      table2: { sub: '', rows: [] },
      callouts: [],
    };
    }

    const dcfKeywords = ['현재가치', 'npv', 'irr', '내부수익률', '할인율', 'dcf', '10년', '투자회수'];
    const dcfRows: string[][] = [];
    for (const t of tables) {
    for (const row of t.rows) {
      const txt = row.join(' ').toLowerCase();
      if (dcfKeywords.some(k => txt.includes(k))) {
        dcfRows.push(row.map(stripMarkdown));
      }
    }
    }

    return {
    table1: { sub: 'DCF 분석', rows: dcfRows.length > 0 ? [['항목', '값'], ...dcfRows] : [['항목', '값'], ['데이터 없음', '-']] },
    table2: { sub: '', rows: [] },
    callouts: [],
    };
}

/**
 * dcf → sensitivity 파생 (수익률 민감도 슬라이드용)
 */
export function buildSensitivityFromDcf(body: Record<string, any>): Record<string, any> {
    const sens = body?.sensitivityAnalysis ?? body?.sensitivity ?? {};
    if (sens && Object.keys(sens).length > 0) {
    const rows: string[][] = Object.entries(sens)
      .slice(0, 8)
      .map(([k, v]) => [k, String(v)]);
    return {
      left: { sub: '수익률 민감도', rows: [['시나리오', '수익률'], ...rows] },
      right: { sub: '', callouts: [] },
    };
    }

    return {
    left: {
      sub: '수익률 민감도 분석',
      rows: [
        ['시나리오', '수익률'],
        ['보수적 (-10% 임대)', '- %'],
        ['기본', '- %'],
        ['낙관적 (+10% 임대)', '- %'],
      ],
    },
    right: {
      sub: '',
      callouts: [{ kind: 'info', title: '주의', body: '실제 민감도는 Pro IM 상세 정보 입력 후 산출됩니다.' }],
    },
    };
}

/**
 * income_analysis → loan 파생 (대출구조 슬라이드용)
 */
export function buildLoanFromIncome(markdown: string, tables: ParsedTable[], body: Record<string, any>): Record<string, any> {
    const ls = body?.loan_scenario as { ltv_pct?: number; interest_pct?: number; term_years?: number; target_irr_pct?: number; monthly_interest_manwon?: number } | undefined;
    const ssot = body?.ssot_summary ?? {};
    const askingManwon = body?.asking_price_manwon ?? ssot.asking_price_manwon ?? 0;
    const askingBil = askingManwon > 0 ? (askingManwon / 10000).toFixed(1) : null;
    if (ls && (ls.ltv_pct != null || ls.interest_pct != null)) {
    const ltv = ls.ltv_pct ?? 50;
    const rate = ls.interest_pct ?? 4.5;
    const term = ls.term_years ?? 5;
    const loanManwon = askingManwon > 0 ? Math.round(askingManwon * ltv / 100) : 0;
    const loanBil = (loanManwon / 10000).toFixed(1);
    const equityManwon = askingManwon > 0 ? askingManwon - loanManwon : 0;
    const monthlyInterest = loanManwon > 0 ? Math.round(loanManwon * rate / 100 / 12) : 0;
    const annualInterest = monthlyInterest * 12;
    const monthlyRentManwon = body?.monthly_rent_manwon
      ?? (body?.monthly_rent_total_krw ? Math.round(Number(body.monthly_rent_total_krw) / 10000) : undefined)
      ?? ssot.monthly_rent_manwon
      ?? (ssot.monthly_rent_total_krw ? Math.round(Number(ssot.monthly_rent_total_krw) / 10000) : 0);
    const annualRentManwon = monthlyRentManwon * 12;
    const netIncomeManwon = Math.max(0, annualRentManwon - annualInterest);
    const dscr = annualInterest > 0 ? (annualRentManwon / annualInterest).toFixed(2) : '-';
    const equityYield = equityManwon > 0 ? ((netIncomeManwon / equityManwon) * 100).toFixed(2) : '-';

    const rows: string[][] = [
      ['항목', '값'],
      ['매매가', askingBil ? `${askingBil}억 원` : '-'],
      ['담보 대출 비율 (LTV)', `${ltv}%`],
      ['대출 금액', `${loanBil}억 원`],
      ['자기 자본', `${(equityManwon / 10000).toFixed(1)}억 원`],
      ['대출 금리', `연 ${rate}%`],
      ['대출 기간', `${term}년`],
      ['월 이자 부담', `${monthlyInterest.toLocaleString()}만원`],
      ['연 이자 부담', `${(annualInterest / 10000).toFixed(2)}억 원`],
      ['DSCR', dscr],
      ['자기자본수익률', `${equityYield}%`],
    ];
    if (ls.target_irr_pct != null) rows.push(['목표 IRR', `${ls.target_irr_pct}%`]);

    return {
      table1: { sub: '대출 구조 (사용자 입력 기준)', rows },
      table2: { sub: '', rows: [] },
      callouts: [],
    };
    }

    const loan = body?.loanSimulation ?? body?.loan ?? {};
    const lines = markdown.split('\n').map(l => l.trim()).filter(Boolean);
    if (loan && Object.keys(loan).length > 0) {
    const rows: string[][] = [
      ['항목', '값'],
      ...Object.entries(loan).slice(0, 8).map(([k, v]) => [k, String(v)]),
    ];
    return {
      table1: { sub: '대출 구조', rows },
      table2: { sub: '', rows: [] },
      callouts: [],
    };
    }

    const loanKeywords = ['대출', 'ltv', '이자율', '금리', '담보', '대환', '한도', 'dscr'];
    const loanRows: string[][] = [];
    for (const t of tables) {
    for (const row of t.rows) {
      const txt = row.join(' ').toLowerCase();
      if (loanKeywords.some(k => txt.includes(k))) {
        loanRows.push(row.map(stripMarkdown));
      }
    }
    }

    return {
    table1: { sub: '대출 구조', rows: loanRows.length > 0 ? [['항목', '값'], ...loanRows] : [['항목', '값'], ['데이터 없음', '-']] },
    table2: { sub: '', rows: [] },
    callouts: [],
    };
}

/**
 * income_analysis → tax 파생 (세금 슬라이드용 — 취득세 / 양도세 추정)
 */
export function buildTaxFromIncome(body: Record<string, any>): Record<string, any> {
    const tax = body?.taxEstimate ?? body?.tax ?? {};
    if (tax && Object.keys(tax).length > 0) {
    const rows: string[][] = Object.entries(tax)
      .slice(0, 8)
      .map(([k, v]) => [k, String(v)]);
    return {
      left: { sub: '세금 추정', rows: [['항목', '금액'], ...rows] },
      right: { sub: '', callouts: [] },
    };
    }

    return {
    left: {
      sub: '세금 추정 (데이터 미입력)',
      rows: [
        ['항목', '금액'],
        ['취득세 (추정)', '-'],
        ['법인 취득세 중과', '-'],
        ['양도소득세 (추정)', '-'],
        ['종합부동산세 (연간 추정)', '-'],
      ],
    },
    right: {
      sub: '',
      callouts: [{ kind: 'warn', title: '주의', body: '세금 추정액은 Pro IM 상세 입력 후 확정됩니다. 반드시 세무사와 협의하세요.' }],
    },
    };
}

/** 사옥형 A04 Plan: left{sub, rows}, right{sub, callouts[]} */
export function buildOwnerOccupiedPlanProps(body: Record<string, any> = {}, building: any = {}): Record<string, any> {
    const occ = body?.occupancySpec || {};
    const hero = body?.heroCard || {};
    const ssot = body?.ssot_summary || {};
    const grossAreaM2 = hero.grossFloorAreaM2 || ssot.total_gross_area_sqm || ssot.total_area || 0;
    const grossAreaPy = grossAreaM2 > 0 ? (sqmToPyeong(grossAreaM2)).toFixed(1) : '0';
    const headcount = occ.targetHeadcount || occ.headcount || (grossAreaM2 > 0 ? Math.max(10, Math.round(parseFloat(grossAreaPy) * 0.75 / 3.5)) : 50);
    const perPersonPy = headcount > 0 && parseFloat(grossAreaPy) > 0 ? (parseFloat(grossAreaPy) * 0.75 / headcount).toFixed(1) : '-';
    const areaSignal = body?.assetIdentity?.area_signal || building?.area_signal || body?.area_signal || '도심 핵심 권역';
    const subleaseRow: [string, string] = occ.subleaseDesc
            ? ['지하/잔여층 활용', occ.subleaseDesc]
            : occ.hasSublease
              ? ['지하 1층 활용', `독립 스튜디오 임대 유지 (보증금 ${occ.subleaseDepositManwon ? (occ.subleaseDepositManwon / 10000).toFixed(1) + '억' : '3,000만'} / 월 ${occ.subleaseRentManwon || 400}만 수익 창출)`]
              : ['부속 공간 활용', '본사 회의실, 휴게실 및 공용 복합 공간으로 전용 활용'];
    const leftRows: [string, string][] = [
            ['본사 전용 층수', occ.floorsInUse || '지상 전층 독립 사옥 사용'],
            ['사옥 가용 연면적', grossAreaM2 > 0 ? `약 ${grossAreaPy}평 (${Number(grossAreaM2).toLocaleString()}㎡)` : '공부상 연면적 실사 확인'],
            ['적정 수용 인원', `${headcount}명 본사 임직원 쾌적한 상주 공간`],
            ['1인당 유효 면적', perPersonPy !== '-' ? `약 ${perPersonPy}평 (오피스 표준 면적 기준 충족)` : '실사 후 부서별 배분'],
            subleaseRow,
            ['주차 및 이동', occ.parkingDesc || '자주식 주차 및 승강기 설비 완비'],
            ['잔금 및 명도', occ.evictionPlan || '잔금일 기준 매도인 전층 즉시 퇴거 (명도 리스크 해소)'],
          ];
    const rightCallouts = [
            {
              kind: 'brass' as const,
              title: '단독 사옥 브랜딩 및 보안 극대화',
              body: `• 기업 단독 사옥 명칭 표기(간판 설치권) 확보로 ${areaSignal} 내 기업 인지도 극대화\n• 외부 입주사 간섭 없는 전층 단독 보안 통제 및 기업 문화 맞춤 인테리어 구현`,
            },
            {
              kind: 'info' as const,
              title: '임직원 업무 환경 및 몰입도 제고',
              body: `• ${areaSignal} 역세권 입지로 핵심 인력 채용 경쟁력 및 출퇴근 접근성 확보\n• 층별 부서 분리 및 부대 복지 공간 구성을 통한 최상의 업무 인프라 구축`,
            },
          ];
    return {
    left: { sub: '본사 전용 공간 제원 및 층별 활용 계획', rows: leftRows },
    right: { sub: '공간 효용 및 조직 문화 최적화', callouts: rightCallouts },
    };
}

/** 사옥형 A08 VsLease: table1{sub, rows}, table2{sub, rows}, callouts[] */
export function buildOwnerOccupiedVsLeaseProps(body: Record<string, any> = {}, building: any = {}): Record<string, any> {
    const occ = body?.occupancySpec || {};
    const hero = body?.heroCard || {};
    const ssot = body?.ssot_summary || {};
    const areaSignal = body?.assetIdentity?.area_signal || building?.area_signal || body?.area_signal || '핵심 오피스 권역';
    const defaultAsk = (body?.asking_price_manwon ?? ssot?.asking_price_manwon ?? 0);
    const askPriceManwon = defaultAsk > 0 ? defaultAsk : (parseFloat(String(hero.askingPrice || '').replace(/[^0-9.]/g, '')) * 10000 || 1000000);
    const askPriceBil = (askPriceManwon / 10000).toFixed(1);
    const ltv = occ.ltvPercent ? occ.ltvPercent / 100 : 0.6;
    const loanManwon = Math.round(askPriceManwon * ltv);
    const loanBil = (loanManwon / 10000).toFixed(1);
    const equityManwon = askPriceManwon - loanManwon;
    const equityBil = (equityManwon / 10000).toFixed(1);
    const loanRate = occ.interestRatePercent ? occ.interestRatePercent / 100 : 0.045;
    const annualInterestBil = (loanManwon * loanRate / 10000).toFixed(2);
    const monthlyRentManwon = occ.currentRentMonthlyManwon || occ.currentRentManwon || Math.round(askPriceManwon * 0.0035);
    const annualRentBil = (monthlyRentManwon * 12 / 10000).toFixed(2);
    const depositManwon = occ.currentDepositManwon || body?.deposit_manwon || Math.round(monthlyRentManwon * 10);
    const depositBil = (depositManwon / 10000).toFixed(1);
    const monthlySubleaseManwon = occ.subleaseRentManwon || 0;
    const annualSubleaseBil = (monthlySubleaseManwon * 12 / 10000).toFixed(2);
    const netAnnualCostBil = (parseFloat(annualInterestBil) - parseFloat(annualSubleaseBil)).toFixed(2);
    const annualSavingsBil = (parseFloat(annualRentBil) - parseFloat(netAnnualCostBil)).toFixed(2);
    const savingsPercent = Math.max(0, Math.round((parseFloat(annualSavingsBil) / parseFloat(annualRentBil)) * 100));
    const tenYearRentTotalBil = (parseFloat(annualRentBil) * 10).toFixed(1);
    const tenYearOwnerCostBil = (parseFloat(netAnnualCostBil) * 10).toFixed(1);
    const tenYearSavingsBil = (parseFloat(tenYearRentTotalBil) - parseFloat(tenYearOwnerCostBil)).toFixed(1);
    const futureAssetBil = (parseFloat(askPriceBil) * 1.5).toFixed(1);
    const netWealthGainBil = (parseFloat(futureAssetBil) - parseFloat(askPriceBil) + parseFloat(tenYearSavingsBil)).toFixed(1);
    const table1Rows: string[][] = [
            ['비교 항목', `${areaSignal} 임차 유지`, `본 사옥 매입 운용 (${askPriceBil}억)`, '연간 차액 / 절감액'],
            ['보증금 / 자기자본', `보증금 ${depositBil}억원`, `자기자본 ${equityBil}억원 (LTV ${Math.round(ltv * 100)}%)`, '-'],
            ['연간 임대료/금융이자', `연 ${annualRentBil}억원 (월 ${monthlyRentManwon.toLocaleString()}만)`, `연 ${annualInterestBil}억원 (대출 ${loanBil}억@${(loanRate * 100).toFixed(1)}%)`, `연 +${(parseFloat(annualRentBil) - parseFloat(annualInterestBil)).toFixed(2)}억원 절감`],
            ['부가 임대수익', '0원 (해당 없음)', monthlySubleaseManwon > 0 ? `연 ${annualSubleaseBil}억원 (월 ${monthlySubleaseManwon}만 수익)` : '0원 (전층 자가사용)', monthlySubleaseManwon > 0 ? `연 +${annualSubleaseBil}억원 수입` : '-'],
            ['실질 연간 순비용', `연 ${annualRentBil}억원 (소멸성 비용)`, `연 ${netAnnualCostBil}억원 (실질 금융부담)`, `연 ${annualSavingsBil}억원 순절감 (${savingsPercent}% 절감)`],
          ];
    const table2Rows: string[][] = [
            ['구분 (10년 누적)', '임차 지속', '본 사옥 매입 보유', '비고'],
            ['10년간 순 비용 지출', `${tenYearRentTotalBil}억원 (전액 소멸)`, `${tenYearOwnerCostBil}억원 (실질 이자·비용)`, `${tenYearSavingsBil}억원 현금 유출 절감`],
            ['10년 후 부동산 자산가치', `0원 (보증금 ${depositBil}억 원금 회수)`, `${futureAssetBil}억원 (연 4.1% 지가상승 가정)`, `${areaSignal} 토지 가치 형성`],
            ['10년 후 법인 순자산 기여', `-${tenYearRentTotalBil}억원`, `+${netWealthGainBil}억원 (매각 시 세전 차익)`, '법인 재무제표 획기적 개선'],
          ];
    const callouts = [
            {
              kind: 'brass' as const,
              title: '소멸성 임차료의 자산 축적 전환',
              body: `• 10년간 임차료로 소멸되는 ${tenYearRentTotalBil}억원을 매월 사옥 자산 형성 및 원금 상환으로 전환\n• ${areaSignal} 토지 지가 상승분을 법인 자산으로 온전히 흡수`,
            },
            {
              kind: 'info' as const,
              title: monthlySubleaseManwon > 0 ? `부가 임대수익 연 ${annualSubleaseBil}억원 레버리지` : '법인세 절감 및 사옥 보유 안정성',
              body: monthlySubleaseManwon > 0
                ? `• 부가 임대 수익(월 ${monthlySubleaseManwon}만)이 대출 이자의 일부를 자체 상쇄\n• 금리 변동 위험 완충 및 본사 현금 흐름 부담 최소화`
                : `• 대출 이자비용 및 건물 감가상각비의 손금산입으로 법인세 절감 효과 극대화\n• 임대인의 계약 갱신 거절이나 퇴거 리스크 없이 10년 이상 안정적 사옥 운용`,
            },
          ];
    return {
    table1: { sub: `연간 현금 유출입 비교 (${areaSignal} 임차 vs 본 사옥 매입)`, rows: table1Rows },
    table2: { sub: '10년 누적 자산 형성 및 순현재가치 비교 (단위: 억원)', rows: table2Rows },
    callouts,
    };
}

/** 사옥형 A06 Commute: coordinates, mapImageUrl, left{sub, source}, right{sub, rows[], callout} */
export function buildOwnerOccupiedCommuteProps(body: Record<string, any> = {}, building: any = {}, locationSlide: any = {}): Record<string, any> {
    const lat = body?.coordinates?.lat ?? locationSlide?.coordinates?.lat ?? body?.resolved_lat ?? body?.enrichment?.coordinates?.lat;
    const lng = body?.coordinates?.lng ?? locationSlide?.coordinates?.lng ?? body?.resolved_lng ?? body?.enrichment?.coordinates?.lng;
    const coords = lat && lng ? { lat, lng } : null;
    const mapImageUrl = body?.mapImageUrl || body?.location_map_url || locationSlide?.mapImageUrl || null;
    const macroTransitImage = locationSlide?.macroTransitImage || null;
    const areaSignal = body?.assetIdentity?.area_signal || building?.area_signal || body?.area_signal || '핵심 비즈니스 권역';
    const subwayStation = body?.subwayStation || (areaSignal.includes('역') ? areaSignal : `${areaSignal} 인접역`);
    const rows: [string, string][] = [
            ['지하철 도보 접근성', `${subwayStation} 도보 접근 초역세권 입지`],
            ['환승역 접근성', '주요 간선 지하철 및 복합 환승역 연계로 광역 접근성 우수'],
            ['광역 도로 교통망', '도심 주요 간선도로 및 도심 고속화도로 직결 접근로 인접'],
            ['임직원 출퇴근 편의', `${areaSignal} 비즈니스 거점 연결로 수도권 전역 통근 편의성 극대화`],
            ['주변 비즈니스 인프라', '금융기관, 기업 지원시설, 특허/법률/세무 전문 서비스 밀집'],
            ['식음 및 복지 편의', '권역 중심 상권 내 다양한 식음료(F&B) 및 문화/생활 편의시설'],
          ];
    const callout = {
            kind: 'info' as const,
            title: '인재 유치 및 통근 만족도 극대화',
            body: `• ${subwayStation} 역세권으로 우수 IT/전문직 인재 채용 시 강력한 경쟁력 확보\n• 광역 대중교통망 연계로 수도권 전역 임직원 통근 피로도 최소화`,
          };
    return {
    coordinates: coords,
    mapImageUrl,
    macroTransitImage,
    left: { sub: `${areaSignal} 비즈니스 입지`, source: '카카오 지도 / V-World' },
    right: { sub: '도보·지하철·광역 도로망 연계', rows, callout },
    };
}

/** 사옥형 A04 Value: left{sub, rows}, right{sub, callouts[]} */
export function buildOwnerOccupiedValueProps(body: Record<string, any> = {}, building: any = {}): Record<string, any> {
    const areaSignal = body?.assetIdentity?.area_signal || building?.area_signal || body?.area_signal || '핵심 비즈니스 권역';
    const leftRows: [string, string][] = [
            ['통사옥 희소성', `${areaSignal} 내 단독 사옥 가용 매물 극히 희소`],
            ['사옥 단독 명칭 표기', '건물 전면 사옥 단독 명칭 표기(간판 설치권) 및 기업 단독 브랜딩 확보'],
            ['지가 하방 경직성', `${areaSignal} 토지 가치 지속 상승세로 자산 가치 보존`],
            ['환금성 및 엑시트', '권역 내 풍부한 사옥 수요 기반 최상의 환금성 및 매각 용이성'],
            ['명도 및 즉시 입주', '잔금 시 지상 전층 공실 인도 조건으로 인테리어 즉시 착공 가능'],
          ];
    const rightCallouts = [
            {
              kind: 'brass' as const,
              title: '기업 단독 브랜딩 및 대외 신인도 제고',
              body: `• ${areaSignal} 내 단독 사옥 보유로 기업 위상 및 투자자/고객사 신뢰도 제고\n• 채용 설명회, 고객사 미팅, IR 행사 등 자체 공간 활용을 통한 브랜드 가치 증대`,
            },
            {
              kind: 'info' as const,
              title: '토지 지가 상승에 따른 인플레이션 헤지',
              body: '• 현금 가치 하락 방어 및 법인 차원의 최우량 실물 안전자산 확보\n• 장기 보유 후 리모델링 또는 재매각 시 막대한 자본 이득(Capital Gain) 실현',
            },
          ];
    return {
    left: { sub: '자산 가치 제안 및 거시적 투자 배경', rows: leftRows },
    right: { sub: '기업 가치 제고 핵심 포인트', callouts: rightCallouts },
    };
}

/** 개발형 A04 LandDetail: left{sub, rows}, right{sub, callouts[]} */
export function buildDevelopmentLandDetailProps(body: Record<string, any> = {}, building: any = {}): Record<string, any> {
    const devSpec = body?.developmentSpec || {};
    const reg = body?.regulation || {};
    const parcels: any[] = body?.parcels || [];
    const hero = body?.heroCard || {};
    const ssot = body?.ssot_summary || {};
    const areaSignal = body?.assetIdentity?.area_signal || building?.area_signal || body?.area_signal || '해당 권역';
    const totalLandSqm = parcels.reduce((sum: number, p: any) => sum + (p.areaSqm || 0), 0) || ssot.plat_area_sqm || 0;
    const totalLandPyeong = totalLandSqm > 0 ? (sqmToPyeong(totalLandSqm)).toFixed(1) : '확인 필요';
    const zoning = parcels[0]?.zoning || ssot.zoning || hero.zoning || '확인 필요';
    const baseFar = reg.baseFarPct || 200;
    const relaxedFar = reg.relaxedFarPct || baseFar;
    const farDisplay = relaxedFar > baseFar
            ? `기본 ${baseFar}% → 완화 ${relaxedFar}% 적용`
            : `${baseFar}%`;
    const askPriceManwon = body?.asking_price_manwon || (body?.askingPrice ? body.askingPrice / 10000 : 0);
    const landPricePerPyeong = hero.landPricePerPyeong
            || (askPriceManwon > 0 && totalLandSqm > 0 ? Math.round(askPriceManwon / (sqmToPyeong(totalLandSqm))) : null);
    const leftRows: [string, string][] = [
            ['소재지', body?.resolved_address || body?.address || '확인 필요'],
            ['용도지역', zoning],
            ['대지면적', totalLandSqm > 0 ? `${totalLandSqm.toLocaleString()}㎡ (약 ${totalLandPyeong}평)` : '확인 필요'],
            ['용적률', farDisplay],
            ['건폐율', `${reg.buildingCoverageRatePct || 60}% 이내`],
            ['토지 평당가', landPricePerPyeong ? `${landPricePerPyeong.toLocaleString()}만원/평` : '확인 필요'],
          ];
    if (parcels.length > 1) {
    leftRows.push(['필지 구성', `${parcels.length}개 필지 합산 (${parcels.map((p: any) => `${(p.areaSqm || 0).toFixed(1)}㎡`).join(' + ')})`]);
    }

    const rightCallouts = [
            {
              kind: 'brass' as const,
              title: relaxedFar > baseFar ? '용적률 완화 적용 가능' : '용도지역 기준 개발 잠재력',
              body: relaxedFar > baseFar
                ? `• ${reg.name || '소규모 건축물 용적률 완화 조례'} 적용\n• 기본 ${baseFar}% → ${relaxedFar}%로 연면적 증가분 확보 가능`
                : `• ${zoning} 기준 용적률 ${baseFar}% 적용\n• ${areaSignal} 입지의 토지 가치 상승 잠재력 확보`,
            },
            {
              kind: 'info' as const,
              title: '토지 투자 가치 분석',
              body: `• ${areaSignal} 소재 토지로 입지 프리미엄 보유\n• 신축 후 임대 또는 분양을 통한 개발 차익 실현 기대`,
            },
          ];
    return {
    left: { sub: '토지 기본 제원 및 공법 규제 현황', rows: leftRows },
    right: { sub: '개발 잠재력 핵심 포인트', callouts: rightCallouts },
    };
}

/** 개발형 A05 Scale: left{sub, chartData?, note}, right{stats[], callouts[]} */
export function buildDevelopmentScaleProps(body: Record<string, any> = {}, building: any = {}): Record<string, any> {
    const devSpec = body?.developmentSpec || {};
    const reg = body?.regulation || {};
    const parcels: any[] = body?.parcels || [];
    const floorLeases: any[] = body?.floor_leases || [];
    const areaSignal = body?.assetIdentity?.area_signal || building?.area_signal || body?.area_signal || '해당 권역';
    const totalLandSqm = parcels.reduce((sum: number, p: any) => sum + (p.areaSqm || 0), 0) || body?.ssot_summary?.plat_area_sqm || 0;
    const targetScalePyeong = devSpec.targetScalePyung || devSpec.targetScalePyeong || 0;
    const targetScaleSqm = targetScalePyeong > 0 ? (pyeongToSqm(targetScalePyeong)).toFixed(1) : '확인 필요';
    const targetUse = devSpec.targetUse === 'office' ? '오피스 중심 복합 임대시설'
            : devSpec.targetUse === 'residential' ? '주거시설'
            : devSpec.targetUse === 'retail' ? '상업시설'
            : devSpec.targetUse || '복합시설';
    const floorCount = floorLeases.length > 0
            ? `${floorLeases[floorLeases.length - 1]?.floor || 'B1'}~${floorLeases[0]?.floor || '최상층'}`
            : '설계안 검토 중';
    const relaxedFar = reg.relaxedFarPct || reg.baseFarPct || 200;
    const buildableGross = totalLandSqm > 0 ? (totalLandSqm * relaxedFar / 100).toFixed(0) : '확인 필요';
    const stats = [
            { label: '목표 연면적', value: targetScalePyeong > 0 ? `${targetScalePyeong.toLocaleString()}평 (${targetScaleSqm}㎡)` : '확인 필요' },
            { label: '계획 용도', value: targetUse },
            { label: '계획 층 구성', value: floorCount },
            { label: '법정 건축 가능 면적', value: typeof buildableGross === 'string' ? buildableGross : `약 ${Number(buildableGross).toLocaleString()}㎡` },
          ];
    const callouts = [
            {
              kind: 'good' as const,
              title: '신축 규모 적정성 검토',
              body: targetScalePyeong > 0 && totalLandSqm > 0
                ? `• 대지면적 대비 용적률 ${relaxedFar}% 적용 시 건축 가능 면적: 약 ${buildableGross}㎡\n• 목표 연면적 ${targetScalePyeong.toLocaleString()}평은 법정 한도 ${totalLandSqm > 0 ? (sqmToPyeong(Number(buildableGross)) >= targetScalePyeong ? '이내' : '초과 — 규모 조정 필요') : '검토 중'}`
                : `• ${areaSignal} 소재 토지의 용적률 ${relaxedFar}% 기준 건축 가능 면적 검토\n• 목표 용도 및 규모에 따른 인허가 가능성 사전 검증 필요`,
            },
          ];
    return {
    left: { sub: `${areaSignal} 신축 개발 규모 및 층별 용도 계획`, note: `적용 용적률: ${relaxedFar}%` },
    right: { stats, callouts },
    };
}

/** 개발형 A04 Eviction: left{sub, rows}, right{sub, callouts[]} */
export function buildDevelopmentEvictionProps(body: Record<string, any> = {}, building: any = {}): Record<string, any> {
    const vacSpec = body?.vacateSpec || {};
    const areaSignal = body?.assetIdentity?.area_signal || building?.area_signal || body?.area_signal || '해당 권역';
    const responsibility = vacSpec.responsibility === 'seller' ? '매도인 전담 책임'
            : vacSpec.responsibility === 'buyer' ? '매수인 직접 수행'
            : vacSpec.responsibility || '협의 중';
    const tenantCount = vacSpec.currentTenantCount || '확인 필요';
    const estimatedMonths = vacSpec.estimatedMonths || '확인 필요';
    const covenants: string[] = vacSpec.covenants || [];
    const leftRows: [string, string][] = [
            ['명도 책임', responsibility],
            ['현 임차인 수', typeof tenantCount === 'number' ? `${tenantCount}개 업체` : tenantCount],
            ['예상 명도 기간', typeof estimatedMonths === 'number' ? `약 ${estimatedMonths}개월` : estimatedMonths],
          ];
    if (covenants.length > 0) {
    leftRows.push(['특약 조건', covenants.slice(0, 2).join(', ')]);
    if (covenants.length > 2) {
      leftRows.push(['추가 특약', covenants.slice(2, 4).join(', ')]);
    }
    }

    const isSellerResponsible = vacSpec.responsibility === 'seller';
    const rightCallouts = [
            {
              kind: isSellerResponsible ? 'good' as const : 'warn' as const,
              title: isSellerResponsible ? '명도 리스크 해소 구조' : '명도 리스크 관리 필요',
              body: isSellerResponsible
                ? `• 매도인이 잔금 전 ${typeof tenantCount === 'number' ? `${tenantCount}개` : ''} 임차인 전원 명도 완료 책임\n• 명도 미완료 시 계약금 배액배상 등 특약 조건 보호`
                : `• 현 임차인 명도 소요 기간 및 비용 사전 정밀 산출 필요\n• 명도 지연 시 PF 이자 추가 부담 발생 가능성 확인`,
            },
            {
              kind: 'info' as const,
              title: '명도 일정 관리 핵심',
              body: `• 명도 완료 후 즉시 철거·착공 일정 연계 필수\n• ${typeof estimatedMonths === 'number' ? `예상 ${estimatedMonths}개월` : '소요기간'} 내 지연 시 PF 금융비용 증가 리스크`,
            },
          ];
    return {
    left: { sub: '명도 현황 및 특약 조건', rows: leftRows },
    right: { sub: '명도 리스크 평가 및 대응', callouts: rightCallouts },
    };
}

/** 개발형 A08 Cost: table1{sub, rows}, table2{sub, rows}, callouts[] */
export function buildDevelopmentCostProps(body: Record<string, any> = {}, building: any = {}): Record<string, any> {
    const devSpec = body?.developmentSpec || {};
    const hero = body?.heroCard || {};
    const areaSignal = body?.assetIdentity?.area_signal || building?.area_signal || body?.area_signal || '해당 권역';
    const askPriceManwon = body?.asking_price_manwon || (body?.askingPrice ? body.askingPrice / 10000 : 0);
    const askPriceBil = askPriceManwon > 0 ? (askPriceManwon / 10000).toFixed(1) : '확인 필요';
    const targetPyeong = devSpec.targetScalePyung || devSpec.targetScalePyeong || 0;
    const constCostPerPyeong = devSpec.constructionCostPerPyung || devSpec.constructionCostPerPyeong || 1200;
    const estConstCostManwon = targetPyeong > 0 ? targetPyeong * constCostPerPyeong : 0;
    const estConstCostBil = estConstCostManwon > 0 ? (estConstCostManwon / 10000).toFixed(1) : '확인 필요';
    const totalCostManwon = devSpec.totalCostManwon || (askPriceManwon + estConstCostManwon * 1.05) || 0;
    const totalCostBil = totalCostManwon > 0 ? (totalCostManwon / 10000).toFixed(1) : '확인 필요';
    const otherCostManwon = totalCostManwon - askPriceManwon - estConstCostManwon;
    const otherCostBil = otherCostManwon > 0 ? (otherCostManwon / 10000).toFixed(1) : '-';
    const landRatioPct = totalCostManwon > 0 && askPriceManwon > 0
            ? Math.round((askPriceManwon / totalCostManwon) * 100)
            : 0;
    const constRatioPct = totalCostManwon > 0 && estConstCostManwon > 0
            ? Math.round((estConstCostManwon / totalCostManwon) * 100)
            : 0;
    const table1Rows: string[][] = [
            ['비용 항목', '금액 (억원)', '비중', '비고'],
            ['토지 매입비', typeof askPriceBil === 'string' && askPriceBil === '확인 필요' ? askPriceBil : `${askPriceBil}억`, `${landRatioPct}%`, '매매대금 기준'],
            ['건축공사비', typeof estConstCostBil === 'string' && estConstCostBil === '확인 필요' ? estConstCostBil : `${estConstCostBil}억`, `${constRatioPct}%`, `평당 ${constCostPerPyeong.toLocaleString()}만원 × ${targetPyeong > 0 ? targetPyeong.toLocaleString() : '?'}평`],
            ['기타비용(설계·인허가·금융)', typeof otherCostBil === 'string' ? otherCostBil : `${otherCostBil}억`, `${100 - landRatioPct - constRatioPct}%`, '취득세, PF이자, 설계비 등'],
            ['총 사업비', typeof totalCostBil === 'string' && totalCostBil === '확인 필요' ? totalCostBil : `${totalCostBil}억`, '100%', ''],
          ];
    const callouts = [
            {
              kind: 'warn' as const,
              title: '비용 변동 리스크 항목',
              body: `• 건축공사비는 시장 상황에 따라 ±15% 변동 가능\n• 인허가 지연 시 PF 금융이자 추가 발생 (연 ${((totalCostManwon * 0.6 * 0.06) / 10000).toFixed(1)}억 수준)`,
            },
            {
              kind: 'info' as const,
              title: '자금 조달 구조 검토',
              body: `• 토지 매입 시 브릿지론(LTV 60~70%) 활용 후 본PF 전환 예상\n• 총 사업비 ${typeof totalCostBil === 'string' ? totalCostBil : totalCostBil + '억'} 대비 자기자본 약 ${totalCostManwon > 0 ? ((totalCostManwon * 0.3) / 10000).toFixed(1) : '?'}억 소요 추정`,
            },
          ];
    return {
    table1: { sub: `${areaSignal} 개발 사업 투입 비용 구성`, rows: table1Rows },
    callouts,
    };
}

/** 개발형 A05 Feasibility: left{sub, chartData?, note}, right{stats[], callouts[]} */
export function buildDevelopmentFeasibilityProps(body: Record<string, any> = {}, building: any = {}): Record<string, any> {
    const devSpec = body?.developmentSpec || {};
    const hero = body?.heroCard || {};
    const floorLeases: any[] = body?.floor_leases || [];
    const areaSignal = body?.assetIdentity?.area_signal || building?.area_signal || body?.area_signal || '해당 권역';
    const totalCostManwon = devSpec.totalCostManwon || 0;
    const totalCostBil = totalCostManwon > 0 ? (totalCostManwon / 10000).toFixed(1) : '확인 필요';
    const targetPyeong = devSpec.targetScalePyung || devSpec.targetScalePyeong || 0;
    const salePricePerPyeong = devSpec.expectedSalePricePerPyung || devSpec.expectedSalePricePerPyeong || 0;
    const monthlyRentTotal = floorLeases.reduce((sum: number, l: any) => sum + (l.rent_manwon || 0), 0);
    const annualRentManwon = monthlyRentTotal * 12;
    const isHoldMode = monthlyRentTotal > 0 && salePricePerPyeong === 0;
    const hasFloorLeases = floorLeases.length > 0 && monthlyRentTotal > 0;
    let profitLabel: string;
    let profitValue: string;
    let profitNote: string;
    if (hasFloorLeases && totalCostManwon > 0) {
    // Hold 모드: 연 임대수익 / 총투입비 = 실질 연 순수익률
    const holdYieldPct = ((annualRentManwon / totalCostManwon) * 100).toFixed(2);
    profitLabel = '보유형 연 순수익률';
    profitValue = `${holdYieldPct}%`;
    profitNote = `연 임대수익 ${(annualRentManwon / 10000).toFixed(1)}억 ÷ 총투입비 ${totalCostBil}억`;

    if (salePricePerPyeong > 0 && targetPyeong > 0) {
      // 분양 모드도 병행 표시
      const saleRevenueManwon = targetPyeong * salePricePerPyeong;
      const saleProfitPct = ((saleRevenueManwon - totalCostManwon) / totalCostManwon * 100).toFixed(1);
      profitNote += ` | 분양 시 개발이익률 ${saleProfitPct}%`;
    }
    } else if (salePricePerPyeong > 0 && targetPyeong > 0 && totalCostManwon > 0) {
    // Sale 모드: 분양매출 - 총투입비 / 총투입비
    const saleRevenueManwon = targetPyeong * salePricePerPyeong;
    const saleProfitPct = ((saleRevenueManwon - totalCostManwon) / totalCostManwon * 100).toFixed(1);
    profitLabel = '분양형 개발이익률';
    profitValue = `${saleProfitPct}%`;
    profitNote = `분양수입 ${(saleRevenueManwon / 10000).toFixed(1)}억 - 총투입비 ${totalCostBil}억`;
    } else {
    profitLabel = '개발이익률';
    profitValue = hero.devProfitMarginPct != null ? `${hero.devProfitMarginPct}%` : '산출 중';
    profitNote = '분양가 또는 임대료 확정 후 정밀 산출 필요';
    }

    const stats = [
            { label: '총 사업비', value: typeof totalCostBil === 'string' && totalCostBil === '확인 필요' ? totalCostBil : `약 ${totalCostBil}억원` },
            { label: profitLabel, value: profitValue },
          ];
    if (hasFloorLeases) {
    stats.push({ label: '예상 월 총임대수익', value: `${monthlyRentTotal.toLocaleString()}만원/월` });
    stats.push({ label: '예상 연 총임대수익', value: `약 ${(annualRentManwon / 10000).toFixed(1)}억원/년` });
    }

    if (salePricePerPyeong > 0) {
    stats.push({ label: '목표 분양/매각 단가', value: `${salePricePerPyeong.toLocaleString()}만원/평` });
    }

    const callouts = [
            {
              kind: hasFloorLeases ? 'good' as const : 'info' as const,
              title: hasFloorLeases ? '보유형 임대 운용 수익 구조' : '사업 수지 핵심 검토',
              body: hasFloorLeases
                ? `• 신축 후 ${floorLeases.length}개 층 임대 운용 시 월 ${monthlyRentTotal.toLocaleString()}만원 수익 예상\n• ${profitNote}`
                : `• ${profitNote}\n• 사업 기간, 금융비용, 시장 변동성을 감안한 민감도 분석 필요`,
            },
          ];
    return {
    left: { sub: `${areaSignal} 개발 사업 수지 분석`, note: profitNote },
    right: { stats, callouts },
    };
}

// ═══════════════════════════════════════════════════════════════
// Operating 포스처 빌더 (호텔/리조트/서비스드레지던스)
// ═══════════════════════════════════════════════════════════════

/** A13 KPI 대시보드: 객실 구성, ADR, RevPAR, OCC, GOP 마진 */
export function buildOperatingKpiProps(
  body: Record<string, any> = {},
  building: any = {},
): Record<string, any> {
  const op = body?.hotel_operating || body?.supplemental?.hotel_operating || {};
  const hero = body?.heroCard || {};
  const ssot = body?.ssot_summary || {};
  const areaSignal = body?.assetIdentity?.area_signal || building?.area_signal || '해당 권역';

  const totalRooms = op.total_rooms || hero.totalRooms || ssot.total_rooms || 0;
  const adrKrw = op.adr_krw || hero.adrKrw || 0;
  const occPct = op.occupancy_rate_pct || hero.occRate || 0;
  const revparKrw = op.revpar_krw || hero.revpar || (adrKrw > 0 && occPct > 0 ? Math.round(adrKrw * occPct / 100) : 0);
  const gopMargin = op.gop_margin_pct || hero.gopMarginPct || 0;
  const annualGopKrw = op.annual_gop_krw || 0;
  const operatorName = op.operator_name || '';
  const tourismGrade = op.tourism_grade || '';

  const kpiRows: [string, string][] = [];
  if (totalRooms > 0) kpiRows.push(['총 객실 수', `${totalRooms}실`]);
  if (adrKrw > 0) kpiRows.push(['ADR (평균 객실 단가)', `${(adrKrw / 10000).toFixed(1)}만원`]);
  if (occPct > 0) kpiRows.push(['OCC (객실 점유율)', `${occPct}%`]);
  if (revparKrw > 0) kpiRows.push(['RevPAR (객실당 매출)', `${(revparKrw / 10000).toFixed(1)}만원`]);
  if (gopMargin > 0) kpiRows.push(['GOP 마진율', `${gopMargin}%`]);
  if (operatorName) kpiRows.push(['운영사/브랜드', operatorName]);
  if (tourismGrade) kpiRows.push(['관광숙박업 등급', tourismGrade]);

  // 객실 타입별 구성 추가
  const roomTypes = op.room_types || [];
  for (const rt of roomTypes.slice(0, 4)) {
    if (rt.type_name && rt.room_count) {
      kpiRows.push([rt.type_name, `${rt.room_count}실${rt.share_pct ? ` (${(rt.share_pct * 100).toFixed(0)}%)` : ''}`]);
    }
  }

  const statCards: Array<{ label: string; value: string; unit?: string }> = [];
  if (revparKrw > 0) statCards.push({ label: 'RevPAR', value: `${(revparKrw / 10000).toFixed(1)}`, unit: '만원' });
  if (gopMargin > 0) statCards.push({ label: 'GOP 마진', value: `${gopMargin}`, unit: '%' });
  if (totalRooms > 0) statCards.push({ label: '객실 수', value: `${totalRooms}`, unit: '실' });

  const highlight = op.seasonality_note
    || `${areaSignal} 소재 ${totalRooms > 0 ? totalRooms + '실 규모의 ' : ''}숙박 자산으로, 안정적 운영 성과를 기반으로 한 GOP 기반 투자 가치를 보유하고 있습니다.`;

  return {
    subtitle: `${areaSignal} 호텔 운영 핵심 지표`,
    kpiRows,
    statCards,
    highlight,
  };
}

/** A05 Revenue: 매출 구성, GOP 분석 */
export function buildOperatingRevenueProps(
  body: Record<string, any> = {},
  building: any = {},
): Record<string, any> {
  const op = body?.hotel_operating || body?.supplemental?.hotel_operating || {};
  const hero = body?.heroCard || {};
  const ssot = body?.ssot_summary || {};
  const areaSignal = body?.assetIdentity?.area_signal || building?.area_signal || '해당 권역';

  const annualRevKrw = op.annual_revenue_krw || 0;
  const roomRevKrw = op.room_revenue_krw || 0;
  const ancillaryPct = op.ancillary_revenue_pct || 0;
  const gopMargin = op.gop_margin_pct || hero.gopMarginPct || 0;
  const annualGopKrw = op.annual_gop_krw || 0;
  const askingPriceManwon = ssot.asking_price_manwon || hero.askingPriceManwon || 0;

  const annualRevBil = annualRevKrw > 0 ? (annualRevKrw / 1_0000_0000).toFixed(1) : '확인 필요';
  const gopBil = annualGopKrw > 0 ? (annualGopKrw / 1_0000_0000).toFixed(1) : '확인 필요';
  const gopCapRate = (askingPriceManwon > 0 && annualGopKrw > 0)
    ? ((annualGopKrw / (askingPriceManwon * 10000)) * 100).toFixed(2)
    : '산출 중';

  const stats = [
    { label: '연간 총매출', value: typeof annualRevBil === 'string' && annualRevBil === '확인 필요' ? annualRevBil : `약 ${annualRevBil}억원` },
    { label: '연간 GOP', value: typeof gopBil === 'string' && gopBil === '확인 필요' ? gopBil : `약 ${gopBil}억원` },
    { label: 'GOP Cap Rate', value: typeof gopCapRate === 'string' && gopCapRate === '산출 중' ? gopCapRate : `${gopCapRate}%` },
  ];

  if (roomRevKrw > 0) {
    stats.push({ label: '객실 매출', value: `약 ${(roomRevKrw / 1_0000_0000).toFixed(1)}억원` });
  }
  if (ancillaryPct > 0) {
    stats.push({ label: '부대 매출 비중', value: `${(ancillaryPct * 100).toFixed(0)}%` });
  }

  const callouts = [
    {
      kind: annualGopKrw > 0 ? 'good' as const : 'info' as const,
      title: 'GOP 기반 수익 구조',
      body: annualGopKrw > 0
        ? `• 연간 총매출 ${annualRevBil}억 × GOP 마진 ${gopMargin}% = GOP ${gopBil}억\n• GOP 기반 Cap Rate ${gopCapRate}%\n• NOI 기준 수익형 부동산과 직접 비교 불가 (운영 리스크 내재)`
        : `• 운영 실적 데이터 확보 후 GOP 기반 Cap Rate 산출 필요\n• 호텔 매출은 계약이 아닌 영업 성과에 좌우됩니다`,
    },
  ];

  return {
    left: { sub: `${areaSignal} 호텔 수익 구조 분석`, note: `GOP Cap Rate: ${gopCapRate}%` },
    right: { stats, callouts },
  };
}

/** A05 Seasonality: 계절성 분석, 성수기/비수기 가동률 */
export function buildOperatingSeasonalityProps(
  body: Record<string, any> = {},
  building: any = {},
): Record<string, any> {
  const op = body?.hotel_operating || body?.supplemental?.hotel_operating || {};
  const areaSignal = body?.assetIdentity?.area_signal || building?.area_signal || '해당 권역';

  const occPct = op.occupancy_rate_pct || 0;
  const seasonNote = op.seasonality_note || '';
  const foreignPct = op.foreign_guest_pct || 0;

  const stats = [
    { label: '연평균 점유율', value: occPct > 0 ? `${occPct}%` : '확인 필요' },
  ];
  if (foreignPct > 0) {
    stats.push({ label: '외국인 투숙 비중', value: `약 ${foreignPct}%` });
  }

  const callouts = [
    {
      kind: 'info' as const,
      title: '계절성 및 수요 변동 분석',
      body: seasonNote
        || `• ${areaSignal} 소재 호텔의 계절성 분석 필요\n• 성수기/비수기 OCC 변동폭 및 ADR 탄력성 검토 권장\n• 외국인 투숙 비중에 따른 환율·비자 정책 리스크 고려`,
    },
  ];

  return {
    left: { sub: `${areaSignal} 호텔 계절성 및 변동성 분석` },
    right: { stats, callouts },
  };
}

/** A04 Operator: 운영사/브랜드 현황 */
export function buildOperatingOperatorProps(
  body: Record<string, any> = {},
  building: any = {},
): Record<string, any> {
  const op = body?.hotel_operating || body?.supplemental?.hotel_operating || {};
  const areaSignal = body?.assetIdentity?.area_signal || building?.area_signal || '해당 권역';

  const operatorName = op.operator_name || '미정';
  const operatingModel = op.operating_model || '';
  const contractExpiry = op.operator_contract_expiry || '';
  const tourismGrade = op.tourism_grade || '';
  const totalRooms = op.total_rooms || 0;

  const modelLabel: Record<string, string> = {
    direct: '직영',
    management_contract: '위탁운영 (Management Contract)',
    franchise: '프랜차이즈',
    lease: '임차운영',
  };

  const table1Rows: [string, string][] = [
    ['운영사/브랜드', operatorName],
  ];
  if (operatingModel) table1Rows.push(['운영 형태', modelLabel[operatingModel] || operatingModel]);
  if (contractExpiry) table1Rows.push(['계약 만료', contractExpiry]);
  if (tourismGrade) table1Rows.push(['관광숙박업 등급', tourismGrade]);
  if (totalRooms > 0) table1Rows.push(['총 객실 수', `${totalRooms}실`]);

  const callouts = [
    {
      kind: contractExpiry ? 'caution' as const : 'info' as const,
      title: '운영사 계약 현황',
      body: contractExpiry
        ? `• ${operatorName} 위탁운영 계약 ${contractExpiry} 만료\n• 재계약 조건 또는 운영사 교체 리스크 검토 필요\n• 운영사 변경 시 브랜드 인지도 및 예약 채널 영향 분석 권장`
        : `• ${operatorName} 운영 중\n• 운영 계약 조건 및 잔여 기간 확인 필요`,
    },
  ];

  return {
    table1: { sub: `${areaSignal} 호텔 운영사 현황`, rows: table1Rows },
    callouts,
  };
}

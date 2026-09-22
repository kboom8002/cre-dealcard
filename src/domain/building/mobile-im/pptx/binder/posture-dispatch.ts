/**
 * W-5: Posture-specific section data dispatch
 *
 * Extracted from data-binder.ts to reduce its size.
 * Each function enriches the result map with posture-specific derived slides.
 */
import {
  buildOwnerOccupiedPlanProps,
  buildOwnerOccupiedVsLeaseProps,
  buildOwnerOccupiedCommuteProps,
  buildOwnerOccupiedValueProps,
  buildDevelopmentLandDetailProps,
  buildDevelopmentScaleProps,
  buildDevelopmentEvictionProps,
  buildDevelopmentCostProps,
  buildDevelopmentFeasibilityProps,
  buildOperatingKpiProps,
  buildOperatingRevenueProps,
  buildOperatingSeasonalityProps,
  buildOperatingOperatorProps,
} from './posture-builders';
import { transformForArchetype } from './archetype-builders';
import { normalizeStationName } from './binder-utils';
import type { SectionData } from '../data-binder';

/**
 * Owner-occupied posture: inline section binding (from bindSectionData loop)
 */
export function bindOwnerOccupiedInlineSection(
  sectionType: string | undefined,
  posture: string,
  cleanMarkdown: string,
  tables: any[],
  metrics: Record<string, any>,
  doc: { body: Record<string, any> },
  building: any,
  result: Record<string, any>,
): void {
  if (posture !== 'owner_occupied') return;

  if (sectionType === 'occupancy_fit') {
    const planProps = buildOwnerOccupiedPlanProps(doc.body, building);
    result['plan'] = { title: '사옥 사용 계획', content: cleanMarkdown, tables, metrics, _derived: true, ...planProps };

    const commuteProps = buildOwnerOccupiedCommuteProps(doc.body, building, result['location']);
    result['commute'] = { title: '통근 및 접근성', content: cleanMarkdown, tables, metrics, _derived: true, ...commuteProps };
  }
  if (sectionType === 'cost_comparison') {
    const vsLeaseProps = buildOwnerOccupiedVsLeaseProps(doc.body, building);
    result['vsLease'] = { title: '자가사용 vs 임차비용 비교', content: cleanMarkdown, tables, metrics, _derived: true, ...vsLeaseProps };
  }
  if (sectionType === 'investment_thesis') {
    const valueProps = buildOwnerOccupiedValueProps(doc.body, building);
    result['value'] = { title: '자산 가치 제안', content: cleanMarkdown, tables, metrics, _derived: true, ...valueProps };
  }
}

/**
 * Development posture: inline section binding (from bindSectionData loop)
 */
export function bindDevelopmentInlineSection(
  sectionType: string | undefined,
  posture: string,
  cleanMarkdown: string,
  tables: any[],
  metrics: Record<string, any>,
  doc: { body: Record<string, any> },
  building: any,
  result: Record<string, any>,
): void {
  if (posture !== 'development') return;

  if (sectionType === 'site_analysis') {
    if (!result['landDetail'] || result['landDetail']._derived) {
      const landDetailProps = buildDevelopmentLandDetailProps(doc.body, building);
      result['landDetail'] = { title: '토지 상세 분석', content: cleanMarkdown, tables, metrics, _derived: true, ...landDetailProps };
    }
    if (!result['scale'] || result['scale']._derived) {
      const scaleProps = buildDevelopmentScaleProps(doc.body, building);
      result['scale'] = { title: '신축 규모 검토', content: cleanMarkdown, tables, metrics, _derived: true, ...scaleProps };
    }
    if (!result['eviction'] || result['eviction']._derived) {
      const evictionProps = buildDevelopmentEvictionProps(doc.body, building);
      result['eviction'] = { title: '명도 계획', content: cleanMarkdown, tables, metrics, _derived: true, ...evictionProps };
    }
  }
  if (sectionType === 'development_feasibility') {
    if (!result['cost'] || result['cost']._derived) {
      const costProps = buildDevelopmentCostProps(doc.body, building);
      result['cost'] = { title: '투입 비용 분석', content: cleanMarkdown, tables, metrics, _derived: true, ...costProps };
    }
    if (!result['feasibility'] || result['feasibility']._derived) {
      const feasibilityProps = buildDevelopmentFeasibilityProps(doc.body, building);
      result['feasibility'] = { title: '사업 수지 분석', content: cleanMarkdown, tables, metrics, _derived: true, ...feasibilityProps };
    }
    if (!result['stacking'] || result['stacking']._derived) {
      const stackingProps = transformForArchetype(cleanMarkdown, tables, 'A05');
      result['stacking'] = { title: '스태킹계획', content: cleanMarkdown, tables, metrics, _derived: true, ...stackingProps };
    }
  }
}

/**
 * Operating posture: inline section binding (from bindSectionData loop)
 */
export function bindOperatingInlineSection(
  sectionType: string | undefined,
  cleanMarkdown: string,
  tables: any[],
  metrics: Record<string, any>,
  doc: { body: Record<string, any> },
  building: any,
  result: Record<string, any>,
): void {
  if (sectionType === 'operation_overview') {
    if (!result['kpi'] || !result['kpi']._derived) {
      const kpiProps = buildOperatingKpiProps(doc.body, building);
      result['kpi'] = { title: '운영 지표 (KPI)', content: cleanMarkdown, tables, metrics, _derived: true, ...kpiProps };
    }
    if (!result['operator']) {
      const operatorProps = buildOperatingOperatorProps(doc.body, building);
      result['operator'] = { title: '운영사 현황', content: cleanMarkdown, tables, metrics, _derived: true, ...operatorProps };
    }
  }
  if (sectionType === 'gop_analysis') {
    if (!result['revenue'] || !result['revenue']._derived) {
      const revenueProps = buildOperatingRevenueProps(doc.body, building);
      result['revenue'] = { title: '매출 구조 분석', content: cleanMarkdown, tables, metrics, _derived: true, ...revenueProps };
    }
    if (!result['seasonality']) {
      const seasonalityProps = buildOperatingSeasonalityProps(doc.body, building);
      result['seasonality'] = { title: '계절성 및 변동성', content: cleanMarkdown, tables, metrics, _derived: true, ...seasonalityProps };
    }
  }
}

/**
 * Trading posture: inline section binding (from bindSectionData loop)
 */
export function bindTradingInlineSection(
  sectionType: string | undefined,
  cleanMarkdown: string,
  tables: any[],
  metrics: Record<string, any>,
  result: Record<string, any>,
): void {
  if (sectionType === 'market_position') {
    if (!result['turnover']) {
      const turnoverProps = transformForArchetype(cleanMarkdown, tables, 'A04');
      result['turnover'] = { title: '권역 회전율', content: cleanMarkdown, tables, metrics, ...turnoverProps };
    }
  }
  if (sectionType === 'comparable_analysis') {
    if (!result['trend']) {
      const trendProps = transformForArchetype(cleanMarkdown, tables, 'A05');
      result['trend'] = { title: '거래동향', content: cleanMarkdown, tables, metrics, ...trendProps };
    }
    if (!result['price']) {
      const priceProps = transformForArchetype(cleanMarkdown, tables, 'A04');
      result['price'] = { title: '적정 가격', content: cleanMarkdown, tables, metrics, ...priceProps };
    }
  }
}

/**
 * Owner-occupied posture: safety-net slide generation (post-loop)
 */
export function ensureOwnerOccupiedSafetyNet(
  doc: { body: Record<string, any> },
  building: any,
  result: Record<string, any>,
): void {
  const posture = doc.body?.investment_posture
    || doc.body?.identity?.investmentPosture
    || doc.body?.posture
    || 'income';
  const isOwnerOccupied = posture === 'owner_occupied' || Boolean(doc.body?.occupancySpec);
  if (!isOwnerOccupied) return;

  if (!result['plan'] || !(result['plan'].left?.rows?.length > 0)) {
    const planProps = buildOwnerOccupiedPlanProps(doc.body, building);
    result['plan'] = {
      title: '기업 사옥 적합성 및 층별 공간 배분',
      kicker: 'OWNER-OCCUPIED SUITABILITY',
      content: '',
      tables: [],
      metrics: {},
      _derived: true,
      ...planProps,
    };
  }
  const rawAddr = doc.body?.resolved_address ?? doc.body?.address ?? '';
  const areaName = building?.area_signal ?? doc.body?.ssot_summary?.area_signal ?? (rawAddr ? rawAddr.split(' ').slice(0, 3).join(' ') : '도심 핵심 업무권역');
  const stationCandidate = result['location']?.station_name || doc.body?.ssot_summary?.station_name || '인근 지하철역';
  const cleanStation = normalizeStationName(stationCandidate);

  if (!result['vsLease'] || !((result['vsLease']?.table1?.rows?.length ?? 0) > 0)) {
    const vsLeaseProps = buildOwnerOccupiedVsLeaseProps(doc.body, building);
    result['vsLease'] = {
      title: `${areaName} 임차 vs 단독 사옥 매입 10년 재무 비교`,
      kicker: 'FINANCIAL COMPARISON',
      content: '',
      tables: [],
      metrics: {},
      _derived: true,
      ...vsLeaseProps,
    };
  }
  if (!result['commute'] || result['commute']?._derived || !((result['commute']?.right?.rows?.length ?? 0) > 0)) {
    const commuteProps = buildOwnerOccupiedCommuteProps(doc.body, building, result['location']);
    result['commute'] = {
      title: `${areaName} 비즈니스 접근성 및 통근 환경`,
      kicker: 'LOCATION & ACCESSIBILITY',
      content: '',
      tables: [],
      metrics: {},
      _derived: true,
      address: rawAddr,
      areaSignal: areaName,
      ...commuteProps,
    };
  }
  if (!result['value'] || result['value']?._derived || !((result['value']?.left?.rows?.length ?? 0) > 0)) {
    const valueProps = buildOwnerOccupiedValueProps(doc.body, building);
    result['value'] = {
      title: `${areaName} 단독 사옥의 자산가치 및 브랜딩`,
      kicker: 'ASSET VALUE & STRATEGY',
      content: '',
      tables: [],
      metrics: {},
      _derived: true,
      ...valueProps,
    };
  }

  // 사옥형 thesis 안전망
  if (!result['thesis'] || !((result['thesis']?.pillars?.length ?? 0) > 0)) {
    result['thesis'] = {
      title: '핵심 투자 논거',
      kicker: 'INVESTMENT THESIS',
      content: '',
      tables: [],
      metrics: {},
      _derived: true,
      subtitle: `${areaName} 단독 사옥 매입의 전략적·재무적 타당성`,
      pillars: [
        { number: '01', title: '핵심 업무권역 입지', body: `${cleanStation} 인근 비즈니스 업무권역으로 우수 IT/전문직 인재 유치 및 통근 최적` },
        { number: '02', title: '사옥 즉시 입주 가능', body: '매매 잔금 시 매도인 퇴거 및 명도 확약 조건으로 공실 및 명도 리스크 최소화' },
        { number: '03', title: '임차 대비 순비용 절감', body: '동급 오피스 임차료 지출 대비 장기 현금 순지출 절감 및 10년 자산 가치 축적' },
        { number: '04', title: '기업 단독 브랜딩 확보', body: '사옥 단독 명칭 표기(간판 설치권) 확보 및 독립 사옥 운영을 통한 대외 신인도 제고' },
      ],
      takeaway: `${areaName} 소재 단독 사옥으로, 임차료 지출을 법인 자산 축적으로 전환하는 최적의 자가 사옥 매입 기회입니다.`,
    };
  }

  // 사옥형 risk 안전망
  if (!result['risk'] || !((result['risk']?.blocks?.length ?? 0) > 0)) {
    result['risk'] = {
      title: '핵심 리스크 진단 및 대응 방안',
      kicker: 'RISK FACTORS & MITIGATION',
      content: '',
      tables: [],
      metrics: {},
      _derived: true,
      blocks: [
        { label: '명도 리스크', value: '해소 방안', description: '매도인 점유 공간 매매 잔금 시 퇴거 확약서 징구 및 명도 일정 확약 조건' },
        { label: '권리 리스크', value: '말소 확약', description: '등기부 갑구 권리분쟁 전무, 을구 근저당 등 잔금 시 동시 변제·말소 조건' },
        { label: '세무 리스크', value: '사전 검토', description: '과밀억제권역 법인 사옥 취득세 요건 및 적격 분할/지점 설치 세무 자문 연계' },
        { label: '주차 리스크', value: '대응 방안', description: '건물 내 주차 가용 면수 확보 및 인근 대형 빌딩 월정기 주차 계약 연계 지원' },
      ],
      bottomBar: { text: '실사 단계에서 법률·세무·물리적 실사를 통해 잔여 잠재 리스크를 철저히 차단합니다.' },
    };
  }
}

/**
 * Development posture: safety-net slide generation (post-loop)
 */
export function ensureDevelopmentSafetyNet(
  doc: { body: Record<string, any> },
  building: any,
  result: Record<string, any>,
): void {
  const posture = doc.body?.investment_posture
    || doc.body?.identity?.investmentPosture
    || doc.body?.posture
    || 'income';
  const isDevelopment = posture === 'development' || Boolean(doc.body?.developmentSpec);
  if (!isDevelopment) return;

  if (!result['landDetail'] || !((result['landDetail']?.left?.rows?.length ?? 0) > 0)) {
    const ldProps = buildDevelopmentLandDetailProps(doc.body, building);
    result['landDetail'] = {
      title: '토지 상세 분석',
      kicker: 'LAND DETAIL',
      content: '', tables: [], metrics: {}, _derived: true,
      ...ldProps,
    };
  }
  if (!result['scale'] || !(result['scale']?.left?.sub)) {
    const scProps = buildDevelopmentScaleProps(doc.body, building);
    result['scale'] = {
      title: '신축 규모 검토',
      kicker: 'SCALE PLAN',
      content: '', tables: [], metrics: {}, _derived: true,
      ...scProps,
    };
  }
  if (!result['eviction'] || !((result['eviction']?.left?.rows?.length ?? 0) > 0)) {
    const evProps = buildDevelopmentEvictionProps(doc.body, building);
    result['eviction'] = {
      title: '명도 계획 및 리스크 관리',
      kicker: 'EVICTION PLAN',
      content: '', tables: [], metrics: {}, _derived: true,
      ...evProps,
    };
  }
  if (!result['cost'] || !((result['cost']?.table1?.rows?.length ?? 0) > 0)) {
    const costProps = buildDevelopmentCostProps(doc.body, building);
    result['cost'] = {
      title: '개발 투입 비용 분석',
      kicker: 'COST BREAKDOWN',
      content: '', tables: [], metrics: {}, _derived: true,
      ...costProps,
    };
  }
  if (!result['feasibility'] || !(result['feasibility']?.left?.sub)) {
    const feasProps = buildDevelopmentFeasibilityProps(doc.body, building);
    result['feasibility'] = {
      title: '개발 사업 수지 분석',
      kicker: 'FEASIBILITY STUDY',
      content: '', tables: [], metrics: {}, _derived: true,
      ...feasProps,
    };
  }
}

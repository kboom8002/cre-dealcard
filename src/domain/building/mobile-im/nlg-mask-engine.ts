/**
 * nlg-mask-engine.ts
 * 
 * v3 NLG 마스크 템플릿 엔진.
 * LLM 수치 환각을 방지하기 위해, 모든 수치 포함 문장을
 * 사전 정의된 템플릿으로 생성하고 변수를 바인딩합니다.
 * 
 * 규칙:
 * - 변수 바인딩: {variableName} 구문
 * - 포매팅: 만원 → 억원, 평 등 렌더 시점에 포맷
 * - 출처 배지: 각 값에 provenance 배지 부착
 * - 등급 게이팅: Grade별 템플릿 가용성 제어
 * - 제로 인엔진 계산: 템플릿 내부 수식 평가 금지
 */

/** 데이터 출처 배지 */
export type ProvenanceBadge = '공부 확인' | 'AI 추정' | '브로커 입력' | '전문가 검증' | '문서 확인';

/** 수치 포맷 타입 */
export type NumberFormat = 'eok' | 'manwon' | 'percent' | 'pyeong' | 'sqm' | 'year' | 'month' | 'count' | 'raw';

/** 데이터 등급 */
export type DataGrade = 'A' | 'B' | 'C' | 'D';

/** NLG 마스크 변수 바인딩 */
export interface NLGMaskBinding {
  variableName: string;
  value: number | string | null;
  format: NumberFormat;
  provenanceBadge?: ProvenanceBadge;
  unit?: string; // 단위 문자열 (예: '억 원', '%', '평')
}

/** NLG 템플릿 정의 */
export interface NLGMaskTemplate {
  id: string;
  category: 'income_basic' | 'income_dcf' | 'property_overview' | 'location' | 'risk' | 'investment'
    | 'income_leverage' | 'lease_legal' | 'land' | 'zoning' | 'meta';  // v0.2 추가
  minGrade: DataGrade; // 이 등급 이상에서만 사용 가능
  template: string; // 예: "연간 순영업수익(NOI)은 {noiKrw}이며, 이는 {noiBadge}에 기반합니다."
  requiredBindings: string[]; // 필수 변수명 목록
  lexiconProfile?: 'b2b' | 'b2c' | 'both'; // 어투 프로필
}

// ─── 등급 우선순위 ───
const GRADE_PRIORITY: Record<DataGrade, number> = { A: 4, B: 3, C: 2, D: 1 };

function isGradeEligible(templateGrade: DataGrade, currentGrade: DataGrade): boolean {
  return GRADE_PRIORITY[currentGrade] >= GRADE_PRIORITY[templateGrade];
}

// ─── 수치 포매팅 ───
function formatValue(value: number | string | null, format: NumberFormat): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;

  switch (format) {
    case 'eok': {
      const eok = value / 1_0000_0000;
      if (eok >= 1) return `${eok.toFixed(1).replace(/\.0$/, '')}억 원`;
      const manwon = value / 10000;
      return `${manwon.toLocaleString()}만원`;
    }
    case 'manwon':
      return `${(value as number).toLocaleString()}만원`;
    case 'percent':
      return `${(value as number).toFixed(1)}%`;
    case 'pyeong':
      return `${Math.round(value as number).toLocaleString()}평`;
    case 'sqm':
      return `${(value as number).toLocaleString()}㎡`;
    case 'year':
      return `${Math.round(value as number)}년`;
    case 'month':
      return `${Math.round(value as number)}개월`;
    case 'count':
      return `${Math.round(value as number).toLocaleString()}개`;
    case 'raw':
    default:
      return String(value);
  }
}

function formatBadge(badge?: ProvenanceBadge): string {
  if (!badge) return '';
  return ` [${badge}]`;
}

// ─── 마스크 렌더링 ───

/**
 * 템플릿 문자열에 변수를 바인딩하여 최종 문장을 생성합니다.
 * 
 * @example
 * renderMask('income_noi_basic', [
 *   { variableName: 'noiKrw', value: 850000000, format: 'eok', provenanceBadge: 'AI 추정' },
 *   { variableName: 'capRatePct', value: 4.8, format: 'percent', provenanceBadge: '공부 확인' },
 * ]);
 * // => "연간 NOI는 8.5억 원 [AI 추정]이며, Cap Rate는 4.8% [공부 확인]입니다."
 */
export function renderMask(templateId: string, bindings: NLGMaskBinding[], options?: {
  grade?: DataGrade;
  lexiconProfile?: 'b2b' | 'b2c';
}): string | null {
  const template = MASK_TEMPLATES.find(t => t.id === templateId);
  if (!template) {
    console.warn(`[nlg-mask] Template not found: ${templateId}`);
    return null;
  }

  // 등급 게이팅
  if (options?.grade && !isGradeEligible(template.minGrade, options.grade)) {
    return null; // 등급 부적합 → 렌더링 차단
  }

  // 렉시콘 프로필 필터
  if (options?.lexiconProfile && template.lexiconProfile && template.lexiconProfile !== 'both' && template.lexiconProfile !== options.lexiconProfile) {
    return null;
  }

  // 변수 바인딩
  const bindingMap = new Map(bindings.map(b => [b.variableName, b]));
  
  let result = template.template;
  for (const reqVar of template.requiredBindings) {
    const binding = bindingMap.get(reqVar);
    if (!binding || binding.value === null) {
      // 필수 변수 누락 → 렌더링 실패
      return null;
    }
  }

  // 모든 {variableName} 패턴 치환
  result = result.replace(/\{(\w+)\}/g, (match, varName) => {
    // Badge 변수 처리: {noi_Badge} → [AI 추정]
    if (varName.endsWith('_Badge')) {
      const baseVar = varName.replace('_Badge', '');
      const binding = bindingMap.get(baseVar);
      return formatBadge(binding?.provenanceBadge);
    }
    const binding = bindingMap.get(varName);
    if (!binding) return match; // 바인딩 없으면 원문 유지
    return formatValue(binding.value, binding.format);
  });

  return result;
}

/**
 * 특정 카테고리의 모든 적격 템플릿을 렌더링합니다.
 */
export function renderCategoryMasks(
  category: NLGMaskTemplate['category'],
  bindings: NLGMaskBinding[],
  options?: { grade?: DataGrade; lexiconProfile?: 'b2b' | 'b2c' }
): string[] {
  return MASK_TEMPLATES
    .filter(t => t.category === category)
    .map(t => renderMask(t.id, bindings, options))
    .filter((r): r is string => r !== null);
}

/**
 * 사용 가능한 템플릿 ID 목록을 등급별로 반환합니다.
 */
export function getAvailableTemplates(grade: DataGrade): NLGMaskTemplate[] {
  return MASK_TEMPLATES.filter(t => isGradeEligible(t.minGrade, grade));
}

// ─── 템플릿 레지스트리 ───

export const MASK_TEMPLATES: NLGMaskTemplate[] = [
  // ── 기본 수익 분석 (Grade B+) ──
  {
    id: 'income_noi_basic',
    category: 'income_basic',
    minGrade: 'B',
    template: '연간 순영업수익(NOI)은 {noiKrw}{noi_Badge}이며, 매각 희망가 대비 Cap Rate는 {capRatePct}{capRate_Badge}입니다.',
    requiredBindings: ['noiKrw', 'capRatePct'],
    lexiconProfile: 'both',
  },
  {
    id: 'income_noi_b2c',
    category: 'income_basic',
    minGrade: 'B',
    template: '보증금 빼고 실투자금 대비 연 {capRatePct}가 매달 들어옵니다. 월 임대 수입은 {monthlyRentKrw}{monthlyRent_Badge}입니다.',
    requiredBindings: ['capRatePct', 'monthlyRentKrw'],
    lexiconProfile: 'b2c',
  },
  {
    id: 'income_egi_table',
    category: 'income_basic',
    minGrade: 'B',
    template: '| 항목 | 금액 | 출처 |\n|---|---|---|\n| 연간 임대수입 (GI) | {grossIncomeKrw} | {grossIncome_Badge} |\n| 공실손실 ({vacancyPct}) | -{vacancyLossKrw} | |\n| 유효총수입 (EGI) | {egiKrw} | |\n| 운영비 (OPEX) | -{opexKrw} | |\n| **순영업수익 (NOI)** | **{noiKrw}** | {noi_Badge} |',
    requiredBindings: ['grossIncomeKrw', 'vacancyPct', 'vacancyLossKrw', 'egiKrw', 'opexKrw', 'noiKrw'],
    lexiconProfile: 'both',
  },
  {
    id: 'income_equity_summary',
    category: 'income_basic',
    minGrade: 'B',
    template: '실투자금(자기자본)은 {equityKrw}이며, 레버리지 수익률은 {leveragedYieldPct}입니다.',
    requiredBindings: ['equityKrw', 'leveragedYieldPct'],
    lexiconProfile: 'both',
  },

  // ── DCF 분석 (Grade A 전용) ──
  {
    id: 'income_dcf_valueadd',
    category: 'income_dcf',
    minGrade: 'A',
    template: '10년 DCF 분석 결과, 기본 시나리오 NPV는 {dcfNpvKrw}{dcfNpv_Badge}이며, 할인율 {discountRatePct} / Exit Cap {exitCapPct} 기준입니다.',
    requiredBindings: ['dcfNpvKrw', 'discountRatePct', 'exitCapPct'],
    lexiconProfile: 'b2b',
  },
  {
    id: 'income_dcf_b2c',
    category: 'income_dcf',
    minGrade: 'A',
    template: '10년간 보유 시 예상 수익 가치는 {dcfNpvKrw}이며, 이는 현재 매각가 대비 {dcfPremiumPct}의 프리미엄/디스카운트입니다.',
    requiredBindings: ['dcfNpvKrw', 'dcfPremiumPct'],
    lexiconProfile: 'b2c',
  },
  {
    id: 'income_irr_summary',
    category: 'income_dcf',
    minGrade: 'A',
    template: '5년 IRR {irr5YearPct}, 10년 IRR {irr10YearPct} (할인율 {discountRatePct} 기준)',
    requiredBindings: ['irr5YearPct', 'irr10YearPct', 'discountRatePct'],
    lexiconProfile: 'b2b',
  },
  {
    id: 'income_dcf_term_explanations',
    category: 'income_dcf',
    minGrade: 'A',
    template: '※ NPV(순현재가치)는 미래 수익을 현재 가치로 환산한 금액, IRR(내부수익률)은 투자 기간 동안의 연평균 수익률, 할인율은 미래 가치를 현재로 할인하는 비율, Exit Cap은 매각 시점의 예상 자본환원율을 의미합니다.',
    requiredBindings: [],
    lexiconProfile: 'both',
  },

  // ── 자산 개요 (Grade C+) ──
  {
    id: 'overview_area_basic',
    category: 'property_overview',
    minGrade: 'C',
    template: '{areaSignal} 소재 {assetType}, 연면적 {totalAreaSqm} ({totalAreaPyeong}), 대지면적 {platAreaSqm} ({platAreaPyeong})',
    requiredBindings: ['areaSignal', 'assetType', 'totalAreaSqm', 'totalAreaPyeong'],
    lexiconProfile: 'both',
  },
  {
    id: 'overview_building_era',
    category: 'property_overview',
    minGrade: 'C',
    template: '{buildingEra} ({buildingAge} 경과), 구조: {structure}, 용도: {mainPurpose}',
    requiredBindings: ['buildingEra', 'buildingAge'],
    lexiconProfile: 'both',
  },

  // ── 입지 분석 (Grade C+) ──
  {
    id: 'location_subway',
    category: 'location',
    minGrade: 'C',
    template: '최근접 지하철역 {stationName}역까지 도보 {walkMinutes}분 ({distanceM}m)',
    requiredBindings: ['stationName', 'walkMinutes', 'distanceM'],
    lexiconProfile: 'both',
  },
  {
    id: 'location_road_contact',
    category: 'location',
    minGrade: 'C',
    template: '도로접면: {roadContactLabel}, 용적률 여유: {farHeadroomLabel}',
    requiredBindings: ['roadContactLabel'],
    lexiconProfile: 'both',
  },

  // ── 리스크 (Grade C+) ──
  {
    id: 'risk_violation_status',
    category: 'risk',
    minGrade: 'C',
    template: '건축물대장 위반사항: {violationStatus}. {violationDetail}',
    requiredBindings: ['violationStatus'],
    lexiconProfile: 'both',
  },

  // ── 매출연동 면책 (Grade C+) ──
  {
    id: 'income_variable_rent_disclaimer',
    category: 'income_basic',
    minGrade: 'C',
    template: '※ {variableFloorLabel}의 임대료는 매출의 {revLinkedPct}로 연동됩니다. 보수적 추정 월 {lowEstManwon} ~ 낙관적 {highEstManwon} 범위에서 실제 수입이 변동됩니다.',
    requiredBindings: ['variableFloorLabel', 'revLinkedPct'],
    lexiconProfile: 'both',
  },
  {
    id: 'income_ancillary_summary',
    category: 'income_basic',
    minGrade: 'C',
    template: '비임대 부가수입으로 연간 {ancillaryTotalKrw}{ancillaryTotal_Badge}이 추가 발생합니다. ({ancillaryDetail})',
    requiredBindings: ['ancillaryTotalKrw', 'ancillaryDetail'],
    lexiconProfile: 'both',
  },
  {
    id: 'income_scenario_comparison',
    category: 'income_basic',
    minGrade: 'B',
    template: '매출연동 임대료 포함 시 보수적 Cap Rate {lowCapPct} ~ 낙관적 {highCapPct} 범위입니다. 기본 시나리오 기준 NOI {midNoiKrw}, Cap Rate {midCapPct}입니다.',
    requiredBindings: ['lowCapPct', 'midCapPct', 'highCapPct', 'midNoiKrw'],
    lexiconProfile: 'both',
  },

  // ── 미확인 데이터 경고 (Grade D+) ──
  {
    id: 'absence_loan_warning',
    category: 'risk',
    minGrade: 'D',
    template: '⚠️ 대출(근저당) 정보가 미확인입니다. 자기자본 {equityKrw}은 대출 미반영 수치이며, 등기부등본 확인 후 정확한 자기자본이 산출됩니다.',
    requiredBindings: ['equityKrw'],
    lexiconProfile: 'both',
  },
  {
    id: 'absence_vacancy_warning',
    category: 'risk',
    minGrade: 'D',
    template: '공실률이 미확인되어 보수적 {vacancyPct} 가정을 적용했습니다. 실제 공실 현황은 현장 실사 시 확인이 필요합니다.',
    requiredBindings: ['vacancyPct'],
    lexiconProfile: 'both',
  },

  // ── v0.2 NLG 마스크 (M13~M24) ──────────────────────────────────
  {
    id: 'M13_cap_rate_basis_compare',
    category: 'income_basic',
    minGrade: 'B',
    template: '{basisLabel} 기준으로 {capPct}%입니다. {otherLabel} 기준으로는 {otherCapPct}%이며, 차이는 {reason}에서 발생합니다.',
    requiredBindings: ['basisLabel', 'capPct', 'otherLabel', 'otherCapPct', 'reason'],
    lexiconProfile: 'both',
  },
  {
    id: 'M14_total_return_leverage',
    category: 'income_leverage',
    minGrade: 'A',
    template: '지가가 연 {rate} 변동한다고 가정하면, 자기자본 대비 연 {totalPct}의 수익이 됩니다. 이 중 임대 현금흐름은 {cocPct}, 자산가치 변동 기여는 {gainPct}입니다.',
    requiredBindings: ['rate', 'totalPct', 'cocPct', 'gainPct'],
    lexiconProfile: 'both',
  },
  {
    id: 'M15_leverage_risk_warning',
    category: 'risk',
    minGrade: 'B',
    template: '대출을 활용하면 지가 상승 시 수익이 커지지만, 하락 시 손실도 같은 배수로 커집니다.',
    requiredBindings: [],
    lexiconProfile: 'both',
  },
  {
    id: 'M16_converted_deposit',
    category: 'lease_legal',
    minGrade: 'C',
    template: '환산보증금 {convDeposit}으로 {region} 기준({threshold})을 {overUnder}하여, {application} 적용 대상입니다.',
    requiredBindings: ['convDeposit', 'region', 'threshold', 'overUnder', 'application'],
    lexiconProfile: 'both',
  },
  {
    id: 'M17_tenancy_rights',
    category: 'lease_legal',
    minGrade: 'C',
    template: '이 호실은 대항력이 있으며, 최초 계약일로부터 계약갱신요구권이 {remainingYears}년 남아 있습니다.',
    requiredBindings: ['remainingYears'],
    lexiconProfile: 'both',
  },
  {
    id: 'M18_no_priority_repayment',
    category: 'lease_legal',
    minGrade: 'C',
    template: '우선변제권과 차임 인상률 5% 상한은 적용되지 않아, 갱신 시 시세 수준으로 조정할 여지가 있습니다.',
    requiredBindings: [],
    lexiconProfile: 'both',
  },
  {
    id: 'M19_land_exclusion',
    category: 'land',
    minGrade: 'C',
    template: '대장상 대지면적은 {ledgerArea}이나, {exclusionKinds}로 {excludedArea}가 제외되어 유효 대지면적은 {effectiveArea}입니다.',
    requiredBindings: ['ledgerArea', 'exclusionKinds', 'excludedArea', 'effectiveArea'],
    lexiconProfile: 'both',
  },
  {
    id: 'M20_effective_far',
    category: 'land',
    minGrade: 'C',
    template: '유효 대지면적 기준 용적률은 {effectiveFarPct}%이며, 조례 상한 대비 여유는 {headroomPp}%p입니다.',
    requiredBindings: ['effectiveFarPct', 'headroomPp'],
    lexiconProfile: 'both',
  },
  {
    id: 'M21_zoning_relevance',
    category: 'zoning',
    minGrade: 'C',
    template: '{purpose} 목적에서는 {items}가 주요 확인 사항입니다. 그 밖의 지역·지구 지정은 부록에 전체 게재했습니다.',
    requiredBindings: ['purpose', 'items'],
    lexiconProfile: 'both',
  },
  {
    id: 'M22_grade_upgrade',
    category: 'meta',
    minGrade: 'D',
    template: '자료가 보강되어 등급이 {beforeGrade}에서 {afterGrade}로 상승했습니다. 이제 {unlockedFeatures}를 제공할 수 있습니다.',
    requiredBindings: ['beforeGrade', 'afterGrade', 'unlockedFeatures'],
    lexiconProfile: 'both',
  },
  {
    id: 'M23_provenance_weakest',
    category: 'meta',
    minGrade: 'C',
    template: '{metric}은 {source} 기준이며, 가장 신뢰도가 낮은 입력은 {weakest}입니다.',
    requiredBindings: ['metric', 'source', 'weakest'],
    lexiconProfile: 'both',
  },
  {
    id: 'M24_scenario_disclaimer',
    category: 'meta',
    minGrade: 'D',
    template: '본 수치는 미래 시나리오 가정에 기반하며 확정 값이 아닙니다.',
    requiredBindings: [],
    lexiconProfile: 'both',
  },
];

/**
 * @file src/lib/deal-card/field-strength-tags.ts
 * @description 딜카드 현장 장점 원클릭 추천 태그칩 + 매물 3단 표준 제원 + 권역 평균 대비 수익률 팩트 비교 SSOT.
 *
 * - Q5-1/5-2: 숫자(수익률·면적)에 주관적 형용사 배제 + 외관·코너·올수리 등 현장 매력 태그 제공
 * - AQ2: 공통(금액·대지·용도지역) + 건물(연면적·층수·사용승인일) + 투자목적별 특화 3단 제원
 * - Note: BANNED_UI_TERMS 금지어 사용 절대 금지 (ux-lexicon-guard 준수)
 */
import type { DealCardPosture } from './card4-schema';

export interface FieldStrengthTag {
  id: string;
  label: string;
  axis: 'exterior' | 'location' | 'condition' | 'usage';
}

const COMMON_FIELD_TAGS: readonly FieldStrengthTag[] = [
  { id: 'ext_design', label: '디자인 우수한 외관', axis: 'exterior' },
  { id: 'loc_corner', label: '코너 입지 가시성', axis: 'location' },
  { id: 'land_south', label: '정방형 남향 토지', axis: 'exterior' },
  { id: 'cond_remodel', label: '내부 최근 올수리', axis: 'condition' },
  { id: 'cond_elev', label: '승강기 완비 건물', axis: 'condition' },
  { id: 'cond_parking', label: '자주식 여유 주차', axis: 'condition' },
] as const;

const POSTURE_FIELD_TAGS: Readonly<
  Record<DealCardPosture, readonly FieldStrengthTag[]>
> = {
  income: [
    { id: 'inc_subway', label: '역세권 도보 5분 내', axis: 'location' },
    { id: 'inc_1f_retail', label: '1층 우량 근생 입점', axis: 'usage' },
    { id: 'inc_full', label: '전 층 만실 안정 임차', axis: 'usage' },
    ...COMMON_FIELD_TAGS,
  ],
  owner_occupied: [
    { id: 'own_movein', label: '전 층 즉시 입주 가능', axis: 'usage' },
    { id: 'own_sign', label: '사옥 단독 간판 가능', axis: 'exterior' },
    { id: 'own_road', label: '대로변 법인 접근성', axis: 'location' },
    ...COMMON_FIELD_TAGS,
  ],
  value_add: [
    { id: 'dev_road', label: '전면 도로폭 여유', axis: 'location' },
    { id: 'dev_far', label: '신축 용적률 활용', axis: 'usage' },
    { id: 'dev_evict', label: '명도 협의 완료', axis: 'usage' },
    ...COMMON_FIELD_TAGS,
  ],
};

export function getFieldStrengthTagsForPosture(
  posture: DealCardPosture = 'income',
  memoText?: string | null,
): readonly FieldStrengthTag[] {
  const base = POSTURE_FIELD_TAGS[posture] ?? POSTURE_FIELD_TAGS.income;
  const text = String(memoText ?? '');
  if (!text) return base;
  const noElevator =
    /(?:승강기|엘리베이터|E\/V)\s*[:：]?\s*(?:0\s*대|없음|없다|미설치|×|X)/i.test(text);
  const noParking = /(?:주차|자주식)\s*[:：]?\s*(?:0\s*대|불가|없음|없다|미확보)/i.test(text);
  if (!noElevator && !noParking) return base;

  const replacementTag: FieldStrengthTag = /공원|숲길|테라스/.test(text)
    ? { id: 'loc_park', label: '공원·숲길 전면 입지', axis: 'location' }
    : { id: 'ext_glass', label: '통창·전면 가시성', axis: 'exterior' };

  const out: FieldStrengthTag[] = [];
  for (const tag of base) {
    if (noElevator && tag.id === 'cond_elev') {
      if (!out.some((t) => t.id === replacementTag.id)) {
        out.push(replacementTag);
      }
      continue;
    }
    if (noParking && tag.id === 'cond_parking') continue;
    out.push(tag);
  }
  return out;
}

/**
 * 권역 평균 임대수익률(한국부동산원·market_defaults 기준)과 본건 수익률의 객관적 수치 비교 문구 생성.
 * 평균 이하이거나 근거 숫자가 없으면 주관적 표현 없이 빈 문자열 반환 (Q5-1).
 */
export function formatObjectiveYieldComparison(params: {
  actualYieldPct?: number | null;
  benchmarkYieldPct?: number | null;
  regionLabel?: string | null;
}): string {
  const actual = Number(params.actualYieldPct);
  const benchmark = Number(params.benchmarkYieldPct);
  if (!Number.isFinite(actual) || actual <= 0) return '';
  if (!Number.isFinite(benchmark) || benchmark <= 0) return '';
  if (actual <= benchmark) return '';
  const region = (params.regionLabel || '권역').trim();
  const shortRegion = region.split(/\s+/)[0] || '권역';
  const candidate = `${shortRegion}평균(${benchmark.toFixed(1)}%)상회 연${actual.toFixed(1)}%`;
  if (candidate.length <= 18) return candidate;
  const compact = `권역평균(${benchmark.toFixed(1)}%)상회 ${actual.toFixed(1)}%`;
  return compact.length <= 18 ? compact : `연 수익률 ${actual.toFixed(2)}%`;
}

export interface Deal3TierSpecInput {
  posture: DealCardPosture;
  priceDisplay?: string | null;
  landAreaDisplay?: string | null;
  zoningDisplay?: string | null;
  gfaDisplay?: string | null;
  floorsDisplay?: string | null;
  completionDateDisplay?: string | null;
  depositDisplay?: string | null;
  monthlyRentDisplay?: string | null;
  yieldDisplay?: string | null;
  usableAreaDisplay?: string | null;
  parkingDisplay?: string | null;
  evictionDisplay?: string | null;
  landUnitPriceDisplay?: string | null;
  farPlanDisplay?: string | null;
  roadWidthDisplay?: string | null;
}

export interface Deal3TierSpecResult {
  commonSpecs: Array<{ label: string; value: string }>;
  buildingSpecs: Array<{ label: string; value: string }>;
  purposeSpecs: Array<{ label: string; value: string }>;
}

/**
 * AQ2 중개인 표준 3단 매물 제원 구조:
 *  1) 공통 필수: 금액 · 대지면적 · 용도지역
 *  2) 건물 내역: 연면적 · 층수 · 사용승인일
 *  3) 투자 목적: 수익형 / 사옥형 / 개발형 특화 지표
 */
export function buildDeal3TierSpecs(input: Deal3TierSpecInput): Deal3TierSpecResult {
  const clean = (v: string | null | undefined, fb = '확인 중') =>
    typeof v === 'string' && v.trim() ? v.trim() : fb;

  const commonSpecs = [
    { label: '매매금액', value: clean(input.priceDisplay, '가격 협의') },
    { label: '대지면적', value: clean(input.landAreaDisplay) },
    { label: '용도지역', value: clean(input.zoningDisplay) },
  ];

  const buildingSpecs = [
    { label: '연면적', value: clean(input.gfaDisplay) },
    { label: '층수', value: clean(input.floorsDisplay) },
    { label: '사용승인일', value: clean(input.completionDateDisplay) },
  ];

  let purposeSpecs: Array<{ label: string; value: string }>;
  if (input.posture === 'owner_occupied') {
    purposeSpecs = [
      { label: '실사용 가능 면적', value: clean(input.usableAreaDisplay ?? input.gfaDisplay) },
      { label: '주차 대수', value: clean(input.parkingDisplay) },
      { label: '명도 일정', value: clean(input.evictionDisplay, '즉시 입주 협의') },
    ];
  } else if (input.posture === 'value_add') {
    purposeSpecs = [
      { label: '대지 평당가', value: clean(input.landUnitPriceDisplay) },
      { label: '용적률 신축 규모', value: clean(input.farPlanDisplay) },
      { label: '전면 도로폭', value: clean(input.roadWidthDisplay) },
    ];
  } else {
    purposeSpecs = [
      { label: '보증금 / 월세', value: `${clean(input.depositDisplay, '-')} / ${clean(input.monthlyRentDisplay, '-')}` },
      { label: '현행 임대수익률', value: clean(input.yieldDisplay) },
    ];
  }

  return { commonSpecs, buildingSpecs, purposeSpecs };
}

/**
 * 연면적/대지면적 해석 우선순위 (표기용) — 순수 함수 단일 모듈.
 *
 *   연면적: 중개인 명시 입력(㎡ > 평) > 중개인 메모 SSoT(공부) > 공공 건축물대장
 *   대지면적: 명시 입력 > 필지 합 > 중개인 메모 SSoT > 건축물대장 platArea(>0) > V-World 토지(공시지가/토지이용계획) > 없음
 *
 * 렌트롤 임대면적 합은 공실·공용부·자가사용 누락 가능성이 있어 "연면적"이 아니므로
 * 표기값 후보에서 제외한다. (골든 E2E ig2/ig3: 공부 1,687.51㎡ 인데 임대면적 합 1,479㎡ 로 표기되던 결함)
 *
 * 2배 괴리 가드: 중개인(명시/메모) 값과 공공 대장 값은 "서로 다른 슬롯"으로 비교한다.
 * (대장 값을 중개인 슬롯에 섞으면 대장 vs 대장 비교가 되어 가드가 영구히 꺼진다 — 2026-10 RCA R3)
 */
export interface TotalAreaSources {
  explicitSqm?: number | null;
  explicitPyeong?: number | null;
  ssotSqm?: number | null;
  publicRegisterSqm?: number | null;
}

const PYEONG_TO_SQM = 3.305785;

/** 유한 & 양수만 통과. 그 외(0/NaN/음수/문자열)는 0 = "없음" */
export function positiveOrZero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 유한 & 양수면 값, 아니면 null (표기용: 0 → 누락) */
export function positiveOrNull(v: unknown): number | null {
  const n = positiveOrZero(v);
  return n > 0 ? n : null;
}

export function resolveTotalGrossAreaSqm(src: TotalAreaSources): number {
  const n = positiveOrZero;
  return (
    n(src.explicitSqm) ||
    (n(src.explicitPyeong) ? n(src.explicitPyeong) * PYEONG_TO_SQM : 0) ||
    n(src.ssotSqm) ||
    n(src.publicRegisterSqm)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 면적 출처 (provenance)
// ─────────────────────────────────────────────────────────────────────────────

export type AreaSource =
  | 'explicit_input'
  | 'parcel_sum'
  | 'broker_memo'
  | 'public_register'
  | 'vworld'
  | 'none';

export interface ResolvedArea {
  /** ㎡. 알 수 없으면 0 (source = 'none') */
  value: number;
  source: AreaSource;
}

// ─────────────────────────────────────────────────────────────────────────────
// SSoT layers 리더 — 키 불일치 흡수 (평 flat 키 + ㎡ physical 키)
//   broker-deal-card 는 layers.total_floor_area_pyung / land_area_pyung (평, flat) 으로 저장하고,
//   IM 경로는 layers.physical.total_area_sqm / land_area_sqm 을 읽어 메모 면적이 소실되던 결함 (RCA R3).
// ─────────────────────────────────────────────────────────────────────────────

export interface SsotLayerAreas {
  /** 기존(현황) 연면적 ㎡ — 계획 연면적은 포함하지 않음 */
  totalSqm: number;
  /** 대지면적 ㎡ */
  landSqm: number;
  /** 신축/계획/가능 연면적 ㎡ (개발 포스처의 계획 GFA 후보) */
  plannedGfaSqm: number;
  totalFrom: 'physical_sqm' | 'pyung' | 'none';
  landFrom: 'physical_sqm' | 'pyung' | 'none';
}

export interface ReadSsotAreasOptions {
  /**
   * 메모 원문. 'layers.total_floor_area_pyung' 값이 "신축/계획/가능 연면적" 라벨에서
   * 추출된 것이면 기존 연면적이 아니라 계획 연면적으로 분류한다.
   */
  memoText?: string | null;
  /** 개발 포스처면 "신축/증축/건축 연면적" (가능·계획 한정어 없이도) 을 계획 연면적으로 본다 */
  development?: boolean;
}

export function pyeongToSqmPure(pyeong: unknown): number {
  const p = positiveOrZero(pyeong);
  return p > 0 ? p * PYEONG_TO_SQM : 0;
}

export function readSsotLayerAreas(layers: unknown, opts: ReadSsotAreasOptions = {}): SsotLayerAreas {
  const L = (layers && typeof layers === 'object' ? layers : {}) as Record<string, any>;
  const phys = (L.physical && typeof L.physical === 'object' ? L.physical : {}) as Record<string, any>;

  // 총 연면적
  let totalSqm = positiveOrZero(phys.total_area_sqm) || positiveOrZero(phys.total_floor_area_sqm) || positiveOrZero(phys.gross_floor_area_sqm);
  let totalFrom: SsotLayerAreas['totalFrom'] = totalSqm > 0 ? 'physical_sqm' : 'none';
  let plannedGfaSqm = pyeongToSqmPure(L.planned_floor_area_pyung);

  const flatTotalPy = positiveOrZero(L.total_floor_area_pyung);
  if (totalSqm === 0 && flatTotalPy > 0) {
    if (opts.memoText && isPlannedFloorAreaInMemo(opts.memoText, flatTotalPy, { development: opts.development })) {
      // 메모의 "신축/계획/가능 연면적" — 기존 연면적 슬롯에 잘못 저장된 값 → 계획 GFA 로 분류
      if (plannedGfaSqm === 0) plannedGfaSqm = flatTotalPy * PYEONG_TO_SQM;
    } else {
      totalSqm = flatTotalPy * PYEONG_TO_SQM;
      totalFrom = 'pyung';
    }
  }

  // 대지면적
  let landSqm = positiveOrZero(phys.land_area_sqm) || positiveOrZero(phys.plat_area_sqm) || positiveOrZero(phys.site_area_sqm);
  let landFrom: SsotLayerAreas['landFrom'] = landSqm > 0 ? 'physical_sqm' : 'none';
  if (landSqm === 0) {
    const py = positiveOrZero(L.land_area_pyung);
    if (py > 0) {
      landSqm = py * PYEONG_TO_SQM;
      landFrom = 'pyung';
    }
  }

  return { totalSqm, landSqm, plannedGfaSqm, totalFrom, landFrom };
}

// ─────────────────────────────────────────────────────────────────────────────
// 메모 "신축/계획/가능 연면적" 라벨 판정
// ─────────────────────────────────────────────────────────────────────────────

// 라벨 끝(연면적 바로 앞)이 계획 한정어로 끝나거나, 값 바로 뒤 괄호 안에 계획 한정어가 오면 "계획 연면적".
// ("2023년 신축 연면적 300평" 처럼 단순 '신축' 은 준공 건물 설명일 수 있으므로 개발 포스처에서만 계획으로 본다)
const PLANNED_LABEL_TAIL = /(가능|계획|예정|허용|목표)\s*[:：]?\s*$/;
const PLANNED_LABEL_TAIL_DEV = /(신축|증축|건축|개발)\s*[:：]?\s*$/;
const PLANNED_SUFFIX = /^\s*[(（\[]?\s*(신축|증축|건축)?\s*(가능|계획|예정|허용|목표)/;

/** 메모에서 "연면적(면적) N평|㎡" 언급을 (라벨, 평 환산값)으로 수집 */
export function scanMemoFloorAreas(memo: string): Array<{ label: string; suffix: string; pyung: number }> {
  const out: Array<{ label: string; suffix: string; pyung: number }> = [];
  if (!memo) return out;
  const re = /([^\n]{0,14}?)(연면적|전용면적|(?<![가-힣])면적)[:：\s]*((?:계획|예정|가능|허용|목표)\s*)?(?:약\s*)?([\d,.]+)\s*(평|㎡|m2|py)([^\n]{0,10})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(memo)) !== null) {
    const num = parseFloat(m[4].replace(/,/g, ''));
    if (!Number.isFinite(num) || num <= 0) continue;
    const py = /㎡|m2/i.test(m[5]) ? num / PYEONG_TO_SQM : num;
    // "연면적: 계획 1,000평" 처럼 라벨 뒤·값 앞에 오는 한정어(m[3])도 suffix 쪽 판정에 포함
    out.push({ label: m[1] ?? '', suffix: (m[3] ?? '') + (m[6] ?? ''), pyung: py });
  }
  return out;
}

/**
 * 메모에서 해당 평수가 "신축 가능/계획/예정 연면적"으로 적힌 값인지.
 * (값이 ±1% 이내로 일치하고, 라벨 끝 또는 값 뒤 괄호에 계획 한정어가 있을 때)
 */
export function isPlannedFloorAreaInMemo(memo: string, pyung: number, opts: { development?: boolean } = {}): boolean {
  if (!memo || !(pyung > 0)) return false;
  return scanMemoFloorAreas(memo).some(
    (a) =>
      Math.abs(a.pyung - pyung) <= pyung * 0.01 + 0.05 &&
      (PLANNED_LABEL_TAIL.test(a.label) ||
        (opts.development === true && PLANNED_LABEL_TAIL_DEV.test(a.label)) ||
        PLANNED_SUFFIX.test(a.suffix)),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 연면적 해석 + 2배 괴리 가드
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolveTotalAreaInput {
  explicitSqm?: number | null;
  explicitPyeong?: number | null;
  /** 중개인 메모 SSoT 연면적(㎡) — readSsotLayerAreas().totalSqm */
  memoSqm?: number | null;
  /** 공공 건축물대장 연면적(㎡) */
  registerSqm?: number | null;
}

export interface ResolvedTotalArea extends ResolvedArea {
  /** 중개인(명시/메모) 값 — 대장과 분리된 슬롯 */
  brokerSqm: number;
  registerSqm: number;
  /** 중개인 값과 대장이 2배 이상(양방향) 괴리 → 대장은 "다른 건물"로 간주 */
  registerConflict: boolean;
}

export const AREA_CONFLICT_RATIO = 2.0;

export function isAreaConflict(brokerSqm: number, registerSqm: number): boolean {
  if (!(brokerSqm > 0) || !(registerSqm > 0)) return false;
  return registerSqm >= brokerSqm * AREA_CONFLICT_RATIO || registerSqm <= brokerSqm / AREA_CONFLICT_RATIO;
}

export function resolveTotalAreaWithSource(src: ResolveTotalAreaInput): ResolvedTotalArea {
  const explicit = positiveOrZero(src.explicitSqm) || pyeongToSqmPure(src.explicitPyeong);
  const memo = positiveOrZero(src.memoSqm);
  const register = positiveOrZero(src.registerSqm);
  const brokerSqm = explicit || memo;
  const registerConflict = isAreaConflict(brokerSqm, register);

  let value = 0;
  let source: AreaSource = 'none';
  if (explicit > 0) { value = explicit; source = 'explicit_input'; }
  else if (memo > 0) { value = memo; source = 'broker_memo'; }
  else if (register > 0) { value = register; source = 'public_register'; }

  return { value, source, brokerSqm, registerSqm: register, registerConflict };
}

// ─────────────────────────────────────────────────────────────────────────────
// 대지면적 해석
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolveLandAreaInput {
  explicitSqm?: number | null;
  explicitPyeong?: number | null;
  /** 필지 면적 합(모든 필지에 면적이 있을 때만) */
  parcelSumSqm?: number | null;
  /** 중개인 메모 SSoT 대지면적(㎡) */
  memoSqm?: number | null;
  /** 건축물대장 platArea(㎡) */
  registerPlatSqm?: number | null;
  /** V-World 공시지가/토지이용계획 면적(㎡) */
  vworldSqm?: number | null;
}

export function resolveLandAreaWithSource(src: ResolveLandAreaInput): ResolvedArea {
  const explicit = positiveOrZero(src.explicitSqm) || pyeongToSqmPure(src.explicitPyeong);
  if (explicit > 0) return { value: explicit, source: 'explicit_input' };
  const parcel = positiveOrZero(src.parcelSumSqm);
  if (parcel > 0) return { value: parcel, source: 'parcel_sum' };
  const memo = positiveOrZero(src.memoSqm);
  if (memo > 0) return { value: memo, source: 'broker_memo' };
  const reg = positiveOrZero(src.registerPlatSqm);
  if (reg > 0) return { value: reg, source: 'public_register' };
  const vw = positiveOrZero(src.vworldSqm);
  if (vw > 0) return { value: vw, source: 'vworld' };
  return { value: 0, source: 'none' };
}

/** V-World landPrice / landUsePlan 응답에서 대지면적 후보를 읽는다 (필드명 변이 흡수) */
export function readVworldLandAreaSqm(external: unknown): number {
  const e = (external && typeof external === 'object' ? external : {}) as Record<string, any>;
  const pick = (o: any) =>
    o && typeof o === 'object'
      ? positiveOrZero(o.landArea) || positiveOrZero(o.lndpclAr) || positiveOrZero(o.areaSqm) || positiveOrZero(o.area)
      : 0;
  return pick(e.landPrice) || pick(e.landUsePlan);
}

// ─────────────────────────────────────────────────────────────────────────────
// 대장 "다른 건물" 사실 무효화
// ─────────────────────────────────────────────────────────────────────────────

/** 대장이 중개인 건물과 다른 건물로 판정될 때 함께 무효화할 건물 고유 필드 (별칭 포함) */
export const REGISTER_BUILDING_SPECIFIC_KEYS = [
  'useAprDay', 'approvalDate', 'completionYear', 'useAprYear',
  'mainPurpose', 'mainPurpsCdNm', 'structure',
  'floorsAbove', 'floorsBelow', 'grndFlrCnt', 'ugrndFlrCnt', 'groundFloors', 'undergroundFloors',
  'bcRat', 'vlRat', 'bcrPct', 'farPct',
  'buildingName', 'bldNm', 'archArea',
  'elevatorCount', 'passengerElevatorCount', 'emergencyElevatorCount',
  'parkingCount', 'selfParkingCount', 'mechanicalParkingCount',
  'hasViolation', 'heatMethod',
] as const;

/**
 * 대장 객체에서 "다른 건물" 고유 사실을 제거(날조·오표기 방지). 면적(totalArea/platArea)은 호출자가 별도 교정한다.
 * @returns 제거된 키 목록 (provenance 기록용)
 */
export function invalidateForeignRegisterFacts(register: Record<string, any>): string[] {
  const removed: string[] = [];
  for (const k of REGISTER_BUILDING_SPECIFIC_KEYS) {
    if (k in register && register[k] !== undefined) {
      delete register[k];
      removed.push(k);
    }
  }
  return removed;
}

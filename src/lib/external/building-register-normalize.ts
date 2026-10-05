/**
 * building-register-normalize.ts
 *
 * 건축물대장(enrichment.buildingRegister) 단일 정규화 지점.
 *
 * 배경: 래퍼(`fetchBuildingRegister`)는 `floorsAbove/floorsBelow/bcRat/vlRat/useAprDay` 로 반환하지만,
 * 렌더러/요약/바인더는 `grndFlrCnt/bcrPct/farPct/groundFloors/approvalDate` 등 서로 다른 별칭을 읽어
 * "조회 성공 → 렌더 누락" 이 발생했다. 모든 소비처는 raw `br.*` 키를 직접 읽지 말고 이 함수를 쓴다.
 *
 * 규칙: 순수 함수(외부 의존 없음). 없는 값은 `undefined`(0/NaN/빈 문자열/'[용도 미기재]' 포함) —
 * 날조·더미 금지(Rule 34), 호출부는 `-` 또는 행 생략(Rule 37).
 */

export interface NormalizedBuildingRegister {
  /** 연면적 (㎡) */
  totalArea?: number;
  /** 대지면적 (㎡) */
  platArea?: number;
  /** 건축면적 (㎡) */
  archArea?: number;
  floorsAbove?: number;
  floorsBelow?: number;
  /** 건폐율 (%) */
  bcRat?: number;
  /** 용적률 (%) */
  vlRat?: number;
  /** 사용승인일 (원본 표기 그대로, 보통 YYYYMMDD) */
  useAprDay?: string;
  mainPurpose?: string;
  structure?: string;
  buildingName?: string;
  elevatorCount?: number;
  parkingCount?: number;
  selfParkingCount?: number;
  mechanicalParkingCount?: number;
}

const PLACEHOLDER_RE = /^(?:-|–|—|n\/a|na|null|undefined|미기재|미상|미확인|\[[^\]]*미기재\])$/i;

function posNum(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,%㎡\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function firstPosNum(raw: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const n = posNum(raw[k]);
    if (n !== undefined) return n;
  }
  return undefined;
}

function firstText(raw: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = raw[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s && !PLACEHOLDER_RE.test(s)) return s;
  }
  return undefined;
}

/** 승강기/주차 합산: 합계 키가 있으면 우선, 없으면 구성요소 합 (모두 0/없음이면 undefined) */
function sumOrTotal(raw: Record<string, unknown>, totalKeys: string[], partKeys: string[]): number | undefined {
  const total = firstPosNum(raw, totalKeys);
  if (total !== undefined) return total;
  let sum = 0;
  for (const k of partKeys) sum += posNum(raw[k]) ?? 0;
  return sum > 0 ? sum : undefined;
}

/**
 * 어떤 별칭 체계로 들어와도 canonical camelCase 로 변환한다.
 * 입력이 null/비객체이면 빈 객체를 반환한다.
 */
export function normalizeBuildingRegister(raw: unknown): NormalizedBuildingRegister {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: NormalizedBuildingRegister = {};

  const set = <K extends keyof NormalizedBuildingRegister>(k: K, v: NormalizedBuildingRegister[K]) => {
    if (v !== undefined) out[k] = v;
  };

  set('totalArea', firstPosNum(r, ['totalArea', 'totArea', 'total_area_sqm']));
  set('platArea', firstPosNum(r, ['platArea', 'plat_area']));
  set('archArea', firstPosNum(r, ['archArea', 'arch_area_sqm']));
  set('floorsAbove', firstPosNum(r, ['floorsAbove', 'grndFlrCnt', 'groundFloors', 'floors_above']));
  set('floorsBelow', firstPosNum(r, ['floorsBelow', 'ugrndFlrCnt', 'undergroundFloors', 'floors_below']));
  set('bcRat', firstPosNum(r, ['bcRat', 'bcrPct', 'bcr_pct']));
  set('vlRat', firstPosNum(r, ['vlRat', 'farPct', 'far_pct']));
  set('useAprDay', firstText(r, ['useAprDay', 'approvalDate', 'use_apr_day']));
  set('mainPurpose', firstText(r, ['mainPurpose', 'mainPurpsCdNm']));
  set('structure', firstText(r, ['structure', 'strctCdNm']));
  set('buildingName', firstText(r, ['buildingName', 'bldNm']));
  set('elevatorCount', sumOrTotal(r, ['elevatorCount'], ['rideUseElvtCnt', 'emgenUseElvtCnt']));
  set('selfParkingCount', firstPosNum(r, ['selfParkingCount']));
  set('mechanicalParkingCount', firstPosNum(r, ['mechanicalParkingCount']));
  set('parkingCount', sumOrTotal(r, ['parkingCount'], ['indrAutoUtcnt', 'oudrAutoUtcnt', 'indrMechUtcnt', 'oudrMechUtcnt']));

  return out;
}

/**
 * 대장이 '지하 0층(지하 없음)'을 명시했는지 — 키는 있고 값이 0 인 경우.
 * normalize 결과에서는 0 이 undefined 가 되므로, "대장 확정값 0" 과 "대장에 값 없음" 을 구분해야 하는 소비처가 쓴다.
 */
export function registerReportsNoBasement(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  if (normalizeBuildingRegister(r).floorsBelow !== undefined) return false;
  return ['floorsBelow', 'ugrndFlrCnt', 'undergroundFloors', 'floors_below'].some((k) => {
    const v = r[k];
    return v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) === 0;
  });
}

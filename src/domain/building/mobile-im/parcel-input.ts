/**
 * @file parcel-input.ts
 * @description 다필지(여러 필지로 구성된 대지) 입력 검증·집계 — 순수 함수.
 *
 * 바텀시트 ParcelSection 입력 → generate-async API → handler → PPTX 렌더러까지
 * 동일한 정의를 쓰기 위한 단일 출처(SSoT).
 *
 * 원칙 (Rule 34/37): 입력되지 않은 값은 만들어내지 않는다.
 *  - 면적 합계는 "모든 필지에 면적이 있을 때만" 산출한다 (일부 누락 시 과소 합계를 정본처럼 내보내지 않음).
 *  - 공시지가 가중평균도 "모든 필지에 면적·단가가 있을 때만" 산출한다.
 */

export interface BrokerParcel {
  /** 필지고유번호 19자리 (숫자만). 검증 실패 시 undefined */
  pnu?: string;
  /** 지목 (대/전/잡종지 …) */
  landCategory?: string;
  /** 대장 면적 (㎡) */
  areaM2?: number;
  /** 지분율 (0 초과 ~ 1) */
  shareRatio?: number;
  /** 개별공시지가 (원/㎡) */
  officialPricePerM2?: number;
}

export const MAX_PARCELS = 30;

export type ParseParcelsResult =
  | { ok: true; parcels: BrokerParcel[]; pnus: string[]; warnings: string[] }
  | { ok: false; error: string };

function toPositiveNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** PNU 정규화: 숫자만 추출해 19자리일 때만 인정 */
export function normalizePnu(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const digits = v.replace(/\D/g, '');
  return digits.length === 19 ? digits : undefined;
}

/**
 * 브로커 입력 필지 배열 검증.
 *  - 구조적 오류(배열 아님, 30개 초과, 객체 아님)만 오류로 거부.
 *  - 개별 필드의 무효 값(음수/NaN/19자리 아닌 PNU)은 해당 필드만 무시하고 warnings 로 보고.
 *  - 완전히 빈 행(UI 기본 빈 행)은 제거, 동일 PNU 중복은 첫 항목만 유지.
 */
export function parseBrokerParcels(raw: unknown): ParseParcelsResult {
  if (raw === undefined || raw === null) return { ok: true, parcels: [], pnus: [], warnings: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'parcels 는 배열이어야 합니다.' };
  if (raw.length > MAX_PARCELS) {
    return { ok: false, error: `필지는 최대 ${MAX_PARCELS}개까지 입력할 수 있습니다.` };
  }

  const warnings: string[] = [];
  const parcels: BrokerParcel[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: `parcels[${i}] 형식이 올바르지 않습니다.` };
    }
    const r = item as Record<string, unknown>;

    const rawPnu = typeof r.pnu === 'string' ? r.pnu.trim() : '';
    const pnu = normalizePnu(rawPnu);
    if (rawPnu && !pnu) warnings.push(`parcels[${i}].pnu 가 19자리 숫자가 아니어서 무시했습니다.`);

    const landCategory = typeof r.landCategory === 'string' && r.landCategory.trim()
      ? r.landCategory.trim().slice(0, 20)
      : undefined;

    const areaM2 = toPositiveNumber(r.areaM2);
    if (r.areaM2 !== undefined && r.areaM2 !== null && r.areaM2 !== '' && areaM2 === undefined) {
      warnings.push(`parcels[${i}].areaM2 가 올바른 양수가 아니어서 무시했습니다.`);
    }

    let shareRatio = toPositiveNumber(r.shareRatio);
    if (shareRatio !== undefined && shareRatio > 1) {
      warnings.push(`parcels[${i}].shareRatio 가 1 초과여서 무시했습니다.`);
      shareRatio = undefined;
    }
    const officialPricePerM2 = toPositiveNumber(r.officialPricePerM2);

    // 완전히 빈 행 제거 (shareRatio 기본값 '1' 만 있는 UI 행)
    if (!pnu && !landCategory && areaM2 === undefined && officialPricePerM2 === undefined) continue;

    if (pnu) {
      if (seen.has(pnu)) {
        warnings.push(`parcels[${i}] 의 PNU ${pnu} 가 중복되어 첫 항목만 사용합니다.`);
        continue;
      }
      seen.add(pnu);
    }

    const parcel: BrokerParcel = {};
    if (pnu) parcel.pnu = pnu;
    if (landCategory) parcel.landCategory = landCategory;
    if (areaM2 !== undefined) parcel.areaM2 = areaM2;
    if (shareRatio !== undefined) parcel.shareRatio = shareRatio;
    if (officialPricePerM2 !== undefined) parcel.officialPricePerM2 = officialPricePerM2;
    parcels.push(parcel);
  }

  const pnus = parcels.map(p => p.pnu).filter((p): p is string => !!p);
  return { ok: true, parcels, pnus, warnings };
}

export interface ParcelSummary {
  /** 필지 수 */
  count: number;
  /** 다필지 여부 (2필지 이상) */
  isMulti: boolean;
  /** PNU 목록 (입력 순서 유지) */
  pnus: string[];
  /** 대지면적 합계(㎡) — 모든 필지에 면적이 있을 때만. 아니면 undefined */
  totalAreaM2?: number;
  /** 면적이 입력된 필지만의 부분 합계(㎡) — 참고용 (정본 아님) */
  partialAreaM2?: number;
  /** 지목 요약 — 단일: '대', 복수: '대 2 · 잡종지 1'. 입력 없으면 undefined */
  landCategoryLabel?: string;
  /** 면적 가중 평균 공시지가(원/㎡) — 모든 필지에 면적·단가가 있을 때만 */
  weightedOfficialPricePerM2?: number;
  /** 모든 필지의 지목이 동일하면 그 지목 */
  uniformLandCategory?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarizeParcels(input: unknown): ParcelSummary {
  const parsed = parseBrokerParcels(input);
  const parcels = parsed.ok ? parsed.parcels : [];
  const count = parcels.length;

  const summary: ParcelSummary = {
    count,
    isMulti: count > 1,
    pnus: parsed.ok ? parsed.pnus : [],
  };
  if (count === 0) return summary;

  const withArea = parcels.filter(p => p.areaM2 !== undefined);
  if (withArea.length > 0) {
    summary.partialAreaM2 = round2(withArea.reduce((s, p) => s + (p.areaM2 as number), 0));
  }
  if (withArea.length === count) summary.totalAreaM2 = summary.partialAreaM2;

  const cats = new Map<string, number>();
  for (const p of parcels) {
    if (p.landCategory) cats.set(p.landCategory, (cats.get(p.landCategory) ?? 0) + 1);
  }
  if (cats.size === 1 && (cats.values().next().value as number) === count) {
    summary.uniformLandCategory = cats.keys().next().value as string;
  }
  if (cats.size === 1) {
    summary.landCategoryLabel = cats.keys().next().value as string;
  } else if (cats.size > 1) {
    summary.landCategoryLabel = [...cats.entries()].map(([k, n]) => `${k} ${n}`).join(' · ');
  }

  const allPriced = parcels.every(p => p.areaM2 !== undefined && p.officialPricePerM2 !== undefined);
  if (allPriced && summary.totalAreaM2) {
    const total = parcels.reduce((s, p) => s + (p.areaM2 as number) * (p.officialPricePerM2 as number), 0);
    summary.weightedOfficialPricePerM2 = Math.round(total / summary.totalAreaM2);
  }
  return summary;
}

/** '3필지 통합' — 단일 필지/미입력이면 빈 문자열 */
export function formatParcelCountLabel(count: number): string {
  return count > 1 ? `${count}필지 통합` : '';
}

/** 주소 뒤에 필지 수 표기를 덧붙인다. 이미 '필지'가 표기돼 있거나 단일 필지면 원문 유지. */
export function withParcelCountSuffix(address: string, count: number): string {
  if (!address || count <= 1 || /필지/.test(address)) return address;
  return `${address} (${formatParcelCountLabel(count)})`;
}

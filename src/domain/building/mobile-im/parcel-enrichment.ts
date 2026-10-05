/**
 * @file parcel-enrichment.ts
 * @description 다필지 보강 — 중개인이 PNU 만 입력한 필지의 면적/지목/공시지가를 공공데이터(V-World)로 채운다.
 *
 * 원칙 (Rule 34/37):
 *  - 중개인 입력값이 항상 우선. 비어 있는 필드만 채운다.
 *  - 조회 실패·폴백(_isFallback) 응답은 사용하지 않는다 — 값을 만들어내지 않는다.
 *  - 외부 호출 폭주 방지: 조회 대상은 최대 MAX_PARCEL_LOOKUPS 필지.
 */
import { MAX_PARCELS, normalizePnu, type BrokerParcel } from './parcel-input';

export const MAX_PARCEL_LOOKUPS = 10;

interface LandUseLike { landArea?: number; _isFallback?: boolean }
interface LandPriceLike { landArea?: number; landCategory?: string; pricePerSqm?: number; _isFallback?: boolean }

export interface ParcelLookupDeps {
  fetchLandUsePlan: (pnu: string) => Promise<LandUseLike | null>;
  fetchLandPrice: (pnu: string) => Promise<LandPriceLike | null>;
}

export async function defaultParcelLookupDeps(): Promise<ParcelLookupDeps> {
  const [{ fetchLandUsePlan }, { fetchLandPrice }] = await Promise.all([
    import('@/lib/external/land-use-api'),
    import('@/lib/external/land-price-api'),
  ]);
  return {
    fetchLandUsePlan: (pnu) => fetchLandUsePlan(pnu) as Promise<LandUseLike | null>,
    fetchLandPrice: (pnu) => fetchLandPrice(pnu) as Promise<LandPriceLike | null>,
  };
}

const positive = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * @param parcels  검증을 통과한 중개인 입력 필지
 * @param pnus     추가로 알려진 PNU (parcels 에 없는 PNU 는 빈 필지로 추가)
 * @returns        보강된 필지 배열 + 공공데이터로 채운 필드 수
 */
export async function fillParcelsFromPublicData(
  parcels: BrokerParcel[] | undefined,
  pnus: string[] | undefined,
  deps: ParcelLookupDeps,
): Promise<{ parcels: BrokerParcel[]; filledFields: number; lookedUp: number }> {
  const list: BrokerParcel[] = (parcels ?? []).map(p => ({ ...p }));
  const known = new Set(list.map(p => p.pnu).filter((p): p is string => !!p));
  for (const raw of pnus ?? []) {
    const pnu = normalizePnu(raw);
    if (pnu && !known.has(pnu) && list.length < MAX_PARCELS) {
      known.add(pnu);
      list.push({ pnu });
    }
  }

  let filledFields = 0;
  let lookedUp = 0;
  const targets = list
    .filter(p => p.pnu && (p.areaM2 === undefined || !p.landCategory || p.officialPricePerM2 === undefined))
    .slice(0, MAX_PARCEL_LOOKUPS);

  await Promise.all(targets.map(async (p) => {
    const pnu = p.pnu as string;
    const [lup, lp] = await Promise.all([
      deps.fetchLandUsePlan(pnu).catch(() => null),
      deps.fetchLandPrice(pnu).catch(() => null),
    ]);
    lookedUp++;
    const lupOk = lup && !lup._isFallback ? lup : null;
    const lpOk = lp && !lp._isFallback ? lp : null;

    if (p.areaM2 === undefined) {
      const area = positive(lupOk?.landArea) ?? positive(lpOk?.landArea);
      if (area !== undefined) { p.areaM2 = area; filledFields++; }
    }
    // 공시지가 응답은 지목 누락 시 기본값('대')을 채우므로, 실제 토지 항목(면적 포함)이 확인된 경우에만 지목을 신뢰한다.
    if (!p.landCategory && lpOk?.landCategory && positive(lpOk.landArea) !== undefined) {
      p.landCategory = String(lpOk.landCategory).trim().slice(0, 20);
      filledFields++;
    }
    if (p.officialPricePerM2 === undefined) {
      const price = positive(lpOk?.pricePerSqm);
      if (price !== undefined) { p.officialPricePerM2 = price; filledFields++; }
    }
  }));

  return { parcels: list, filledFields, lookedUp };
}

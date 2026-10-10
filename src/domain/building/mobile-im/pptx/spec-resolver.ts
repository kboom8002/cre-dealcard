/**
 * spec-resolver.ts
 *
 * 물건 개요(A04) 제원 단일 리졸버 (D5).
 *
 * 배경: 렌더러가 건축물대장(BuildingRegisterData)을 잘못된 키(bcrPct/farPct/useZone/...)로 읽고,
 * ssot_summary 에도 건폐율/용적률/층수/준공/용도지역이 채워지지 않아 개요 슬라이드에서 해당 행이 사라졌다.
 * 이 모듈은 외부 의존이 없는 순수 함수이며, 아래 폴백 체인을 한 곳에서만 정의한다.
 *
 *   대장(enrichment.buildingRegister) > 토지이용계획(enrichment.landUsePlan) > ssot_summary > heroCard > building > core.physical
 *
 * 알 수 없는 값은 `undefined` 로 두고(날조/더미 금지, Rule 34/63), 행 빌더는 해당 행을 생략한다.
 */

import { normalizeBuildingRegister, registerReportsNoBasement } from '@/lib/external/building-register-normalize';
import { BROKER_STATED_TAG } from './binder/broker-memo-facts';
import { verifiedLegalLimits } from './binder/legal-limits';

type Rec = Record<string, any>;

export interface OverviewSpecs {
  /** 용도지역 (다필지에서 필지별 용도지역이 다르면 중복 제거 후 ' / ' 로 결합) */
  zoning?: string;
  /** 기타 용도지구 (예: 방화지구) */
  zoningOverlap?: string;
  /** 현황 건폐율/용적률 (%) — 건축물대장 */
  bcrNow?: number;
  farNow?: number;
  /** 법정 상한 (%) — 토지이용계획 */
  bcrMax?: number;
  farMax?: number;
  /** 사용승인일 표기 `YYYY.MM.DD` (연도만 있으면 `YYYY`) */
  useAprDay?: string;
  /** 사용승인 연도 */
  useAprYear?: number;
  /** 건축 후 경과 연수 */
  useAprAge?: number;
  floorsAbove?: number;
  floorsBelow?: number;
  mainPurpose?: string;
  structure?: string;
  /** 건축면적 (㎡) */
  archArea?: number;
  /** 값이 중개인 메모(원문)에서 복원된 항목 — 출처 라벨(● 중개인입력) 병기용 */
  memoSourced?: { floors?: boolean; useApr?: boolean };
}

export interface OverviewFallbackSources {
  /** DB building row (use_zone, bcr_pct, built_year, floors_* ...) */
  building?: Rec | null;
  /** input.core?.physical */
  core?: Rec | null;
  /** 경과 연수 계산 기준 연도 (테스트 결정성용, 기본: 현재 연도) */
  nowYear?: number;
  /** 중개인 메모 명시 제원 — 대장/토지이용계획/SSoT/hero/building/core 가 모두 비었을 때만 사용 (최후 폴백) */
  memo?: { floorsAbove?: number; floorsBelow?: number; completionYear?: number } | null;
}

const MISSING_RE = /^(?:-|–|—|n\/a|na|null|undefined|미기재|미상|미확인|확인\s*필요|\[[^\]]*미기재\])$/i;

/** 값이 비었거나 '-', '확인 필요', '[용도 미기재]' 등 의미 없는 플레이스홀더인지 */
export function isMissingSpecValue(v: unknown): boolean {
  if (v == null) return true;
  const s = String(v).trim();
  return s === '' || MISSING_RE.test(s);
}

function pos(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,%㎡\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function firstPos(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    const n = pos(v);
    if (n !== undefined) return n;
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return isMissingSpecValue(s) ? undefined : s;
}

function firstStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    const s = str(v);
    if (s !== undefined) return s;
  }
  return undefined;
}

/** 사용승인일 `YYYYMMDD` | `YYYY-MM-DD` | `YYYY` → { display, year } */
function parseUseAprDay(raw: unknown): { display: string; year: number } | undefined {
  const s = raw == null ? '' : String(raw).trim();
  if (!s) return undefined;
  const digits = s.replace(/[^0-9]/g, '');
  if (digits.length >= 8) {
    const y = parseInt(digits.slice(0, 4), 10);
    const m = digits.slice(4, 6);
    const d = digits.slice(6, 8);
    if (y > 1800 && Number(m) >= 1 && Number(m) <= 12) {
      return { display: `${digits.slice(0, 4)}.${m}.${d}`, year: y };
    }
  }
  if (digits.length >= 4) {
    const y = parseInt(digits.slice(0, 4), 10);
    if (y > 1800 && y < 2200) return { display: String(y), year: y };
  }
  return undefined;
}

function distinctZonings(enrichment: Rec, parcels: unknown): string[] {
  const out: string[] = [];
  const push = (z: unknown) => {
    const s = str(z);
    if (s && !out.includes(s)) out.push(s);
  };
  const byParcel = enrichment?.landUseByParcel;
  if (Array.isArray(byParcel) && byParcel.length > 1) {
    for (const p of byParcel) push(p?.zoningDistrict);
  }
  if (out.length === 0 && Array.isArray(parcels) && parcels.length > 1) {
    for (const p of parcels as Rec[]) push(p?.zoning ?? p?.zoning_district ?? p?.use_zone);
  }
  return out;
}

/**
 * 물건 개요 제원 리졸버.
 *
 * @param enrichment  body.enrichment (buildingRegister / landUsePlan / landUseByParcel)
 * @param ssot        body.ssot_summary
 * @param hero        body.heroCard
 * @param parcels     body.parcels (다필지)
 * @param fallback    선택: building row / core.physical / nowYear
 */
export function resolveOverviewSpecs(
  enrichment: Rec | null | undefined,
  ssot: Rec | null | undefined,
  hero: Rec | null | undefined,
  parcels?: unknown,
  fallback: OverviewFallbackSources = {},
): OverviewSpecs {
  const enr: Rec = enrichment ?? {};
  const s: Rec = ssot ?? {};
  const h: Rec = hero ?? {};
  const br: Rec = enr.buildingRegister ?? {};
  const nbr = normalizeBuildingRegister(enr.buildingRegister); // 대장 키 별칭(grndFlrCnt/bcrPct/approvalDate…) 단일 흡수
  const lup: Rec = enr.landUsePlan ?? {};
  const bldg: Rec = fallback.building ?? {};
  const phys: Rec = fallback.core ?? {};

  // ── 용도지역 ──
  const multi = distinctZonings(enr, parcels);
  const zoning = multi.length > 1
    ? multi.join(' / ')
    : firstStr(lup.zoningDistrict, br.useZone, s.zoning, s.zone_type, h.zoning, bldg.use_zone, phys.zoning);
  const overlapRaw = lup.zoningOverlap;
  const overlapList = (Array.isArray(overlapRaw) ? overlapRaw : [overlapRaw])
    .map(str)
    .filter((x): x is string => !!x);
  const zoningOverlap = overlapList.length > 0 ? overlapList.join(', ') : undefined;

  // ── 건폐율/용적률: 현황(대장) > ssot > hero > building ──
  const bcrNow = firstPos(nbr.bcRat, s.bcr_pct, h.bcrPct, bldg.bcr_pct);
  const farNow = firstPos(nbr.vlRat, s.far_pct, h.farPct, bldg.far_pct);
  // 법정 상한: 공식 조회값만 (legal-limits.ts — 용도지역명 추정치는 숨김). 필지별 용도지역이 서로 다르면 단일 상한 불성립 → 생략
  const verified = multi.length > 1 ? {} : verifiedLegalLimits(lup);
  const bcrMax = verified.bcrMax;
  const farMax = verified.farMax;

  // ── 사용승인일 ──
  const memo = fallback.memo ?? {};
  const aprFromSources = [nbr.useAprDay, s.use_apr_day, s.completion_year, h.completionYear, bldg.built_year, phys.completionYear]
    .map(parseUseAprDay)
    .find(Boolean);
  const aprFromMemo = aprFromSources ? undefined : parseUseAprDay(memo.completionYear);
  const aprRaw = aprFromSources ?? aprFromMemo;
  const nowYear = fallback.nowYear ?? new Date().getFullYear();
  const useAprAge = aprRaw && nowYear >= aprRaw.year ? nowYear - aprRaw.year : undefined;

  // ── 층수 ──
  const floorsAboveSrc = firstPos(nbr.floorsAbove, s.floors_above, h.floorsAbove, bldg.floors_above, phys.floorsAbove);
  const floorsAbove = floorsAboveSrc ?? pos(memo.floorsAbove);
  // 대장이 지하 0층으로 확정한 경우(키는 있으나 0)는 다른 소스로 덮지 않는다 (기존 `??` 체인 의미 유지)
  const registerSaysNoBasement = registerReportsNoBasement(enr.buildingRegister);
  const floorsBelowSrc = nbr.floorsBelow
    ?? (registerSaysNoBasement ? undefined : pos(s.floors_below ?? h.floorsBelow ?? bldg.floors_below ?? phys.floorsBelow));
  const floorsBelow = floorsBelowSrc ?? (registerSaysNoBasement ? undefined : pos(memo.floorsBelow));
  const memoFloors = (floorsAboveSrc === undefined && floorsAbove !== undefined) || (floorsBelowSrc === undefined && floorsBelow !== undefined);

  return {
    zoning,
    zoningOverlap,
    bcrNow,
    farNow,
    bcrMax,
    farMax,
    useAprDay: aprRaw?.display,
    useAprYear: aprRaw?.year,
    useAprAge,
    floorsAbove,
    floorsBelow,
    mainPurpose: firstStr(nbr.mainPurpose, s.main_purpose, h.mainPurpose, bldg.main_purpose),
    structure: firstStr(nbr.structure, s.structure, h.structure, bldg.structure),
    archArea: firstPos(nbr.archArea, s.arch_area_sqm, s.building_area_sqm, h.archAreaM2, bldg.arch_area_sqm),
    memoSourced: (memoFloors || aprFromMemo) ? { floors: memoFloors || undefined, useApr: aprFromMemo ? true : undefined } : undefined,
  };
}

/** 퍼센트 표기: 58.40 → '58.4%', 60 → '60%' */
export function fmtPct(n: number): string {
  return `${Number(n.toFixed(2))}%`;
}

/**
 * 리졸버 결과 → 개요 표 행. 알 수 없는 제원은 `-` 대신 행 자체를 생략한다.
 * 순서: 용도지역 → 건폐율/용적률 → 사용승인일 → 층수 → 주용도 → 주구조
 */
export function buildOverviewSpecRows(specs: OverviewSpecs): [string, string][] {
  const rows: [string, string][] = [];

  if (specs.zoning) {
    rows.push(['용도지역', specs.zoningOverlap ? `${specs.zoning} (${specs.zoningOverlap})` : specs.zoning]);
  }

  const { bcrNow, farNow, bcrMax, farMax } = specs;
  if (bcrNow || farNow) {
    const label = bcrNow && farNow ? '건폐율 / 용적률' : bcrNow ? '건폐율' : '용적률';
    let value = bcrNow && farNow ? `${fmtPct(bcrNow)} / ${fmtPct(farNow)}` : fmtPct((bcrNow ?? farNow) as number);
    if (bcrMax && farMax && bcrNow && farNow) value += ` (법정 ${fmtPct(bcrMax)} / ${fmtPct(farMax)})`;
    else if (bcrNow && bcrMax && !farNow) value += ` (법정 ${fmtPct(bcrMax)})`;
    else if (farNow && farMax && !bcrNow) value += ` (법정 ${fmtPct(farMax)})`;
    rows.push([label, value]);
  } else if (bcrMax || farMax) {
    // 현황치 없이 법정 상한만 있는 경우 — 현황으로 오인되지 않도록 라벨에 '(법정)' 명시
    const label = bcrMax && farMax ? '건폐율 / 용적률 (법정)' : bcrMax ? '건폐율 (법정)' : '용적률 (법정)';
    const value = bcrMax && farMax ? `${fmtPct(bcrMax)} / ${fmtPct(farMax)}` : fmtPct((bcrMax ?? farMax) as number);
    rows.push([label, value]);
  }

  if (specs.useAprDay) {
    const aprVal = specs.useAprAge !== undefined ? `${specs.useAprDay} (건축 후 약 ${specs.useAprAge}년)` : specs.useAprDay;
    rows.push(['사용승인일', specs.memoSourced?.useApr ? `${aprVal} · ${BROKER_STATED_TAG}` : aprVal]);
  }

  if (specs.floorsAbove || specs.floorsBelow) {
    const parts: string[] = [];
    if (specs.floorsBelow) parts.push(`지하 ${specs.floorsBelow}층`);
    if (specs.floorsAbove) parts.push(`지상 ${specs.floorsAbove}층`);
    rows.push(['층수', specs.memoSourced?.floors ? `${parts.join(' / ')} · ${BROKER_STATED_TAG}` : parts.join(' / ')]);
  }

  if (specs.mainPurpose) rows.push(['주용도', specs.mainPurpose]);
  if (specs.structure) rows.push(['주구조', specs.structure]);

  return rows;
}

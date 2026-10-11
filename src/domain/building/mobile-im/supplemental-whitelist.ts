// src/domain/building/mobile-im/supplemental-whitelist.ts
// generate / generate-async 라우트 공용 — 요청 바디 → MobileIMSupplementalInput 화이트리스트 + 검증 (단일 소스).
//
// 두 라우트가 각자 수제 화이트리스트를 들고 있어 sync(generate)가 floor_leases·parcels 등을 조용히 유실했다.
// 이 모듈이 키 목록·검증·정규화의 유일한 출처이므로 라우트 간 drift 가 구조적으로 불가능하다.
//  - 검증 실패는 { ok:false, error } (한국어 메시지) — 라우트가 400 으로 변환한다.
//  - 검증 순서는 generate-async 가 기존에 쓰던 순서를 그대로 유지한다
//    (주차 → 승강기 → broker_extras → rent_roll_meta → parcels). 테스트가 첫 오류 메시지를 본다.
//  - body.photos_v2 가 배열이 아니면 기존처럼 throw 한다 (라우트의 try/catch → 'Invalid request body' 400).

import type { MobileIMSupplementalInput } from './types';
import { parseBrokerCount } from './resolve-physical-specs';
import { parseBrokerParcels, normalizePnu } from './parcel-input';
import { parseBrokerExtras } from './broker-extras';
import { parseRentRollMeta } from './rentroll-meta-parse';
import { sanitizeAncillaryIncomes, sanitizeGrossAreaM2, sanitizeRentrollRowFields } from './supplemental-sanitize';

/** 화이트리스트가 body 에서 직접 복사하는 단순 키 (검증 없이 통과, 값 해석은 handler 책임) */
export const SUPPLEMENTAL_PASSTHROUGH_KEYS = [
  'monthly_rent_total_krw',
  'vacancy_status',
  'vacancy_pct',
  'resolved_address',
  'resolved_pnu',
  'photo_urls',
  'photo_captions',
  'broker_highlight',
  'estimated_yield_pct',
  'total_deposit_manwon',
  'mgmt_fee_total_manwon',
  'loan_amount_manwon',
  'asking_price_manwon',
  'floor_leases',
  'logistics',
  'monthly_revenue_manwon',
  'hospitalitySpec',
  'developmentSpec',
  'vacateSpec',
  'permitSpec',
  'occupancySpec',
  'sectionalSpec',
  'residentialSpec',
  'manual_comps',
  // D41 Phase D: 취득 비용
  'acquisition_tax_pct',
  'brokerage_fee_manwon',
  'legal_fee_manwon',
  'other_acquisition_cost_manwon',
  // D41 Phase D: 대출 시나리오
  'ltv_pct',
  'loan_interest_pct',
  'loan_term_years',
  'target_irr_pct',
] as const;

/** 라우트가 supplemental 외에 따로 쓰는 body 입력 (SSoT 역류·identity 등) */
export interface SupplementalSideInputs {
  hospitalitySpecInput: Record<string, any> | null;
  loanStatusInput: string | null;
  developmentSpecInput: Record<string, any> | null;
  vacateSpecInput: Record<string, any> | null;
  permitSpecInput: Record<string, any> | null;
  occupancySpecInput: Record<string, any> | null;
  sectionalSpecInput: Record<string, any> | null;
  residentialSpecInput: Record<string, any> | null;
  investmentPostureInput: string | null;
  /** 클라이언트가 rent_roll_meta 를 명시적으로 보냈는지 (원장 메타를 기본값으로 덮지 않기 위함) */
  hasExplicitRentRollMeta: boolean;
}

export type SupplementalParseResult =
  | {
      ok: true;
      supplemental: MobileIMSupplementalInput;
      side: SupplementalSideInputs;
      /** parseBrokerParcels 가 무시한 필드 경고 — 라우트가 로그로 남긴다 */
      parcelWarnings: string[];
    }
  | { ok: false; error: string };

function photosV2Whitelist(raw: unknown): any[] {
  return ((raw as any[]) || []).filter((p: any) =>
    p?.url && (
      p.url.startsWith('http://') ||
      p.url.startsWith('https://') ||
      p.url.startsWith('/') ||
      p.url.startsWith('data:') ||
      p.url.startsWith('docs/') ||
      p.url.includes('images/')
    ),
  );
}

export function parseSupplementalFromBody(body: Record<string, any>): SupplementalParseResult {
  const supplemental: Record<string, any> = {};
  for (const key of SUPPLEMENTAL_PASSTHROUGH_KEYS) supplemental[key] = body[key];
  supplemental.photos_v2 = photosV2Whitelist(body.photos_v2);

  const side: SupplementalSideInputs = {
    hospitalitySpecInput: body.hospitalitySpec ?? null,
    loanStatusInput: body.loan_status ?? null,
    developmentSpecInput: body.developmentSpec ?? null,
    vacateSpecInput: body.vacateSpec ?? null,
    permitSpecInput: body.permitSpec ?? null,
    occupancySpecInput: body.occupancySpec ?? null,
    sectionalSpecInput: body.sectionalSpec ?? null,
    residentialSpecInput: body.residentialSpec ?? null,
    investmentPostureInput: body.investment_posture ?? null,
    hasExplicitRentRollMeta: false,
  };

  // D4: 주차/승강기 대수 (선택) — 빈 값은 무시, 음수/소수/9999 초과는 400
  const parkingParsed = parseBrokerCount(body.parking_count, '주차 대수');
  if (!parkingParsed.ok) return { ok: false, error: parkingParsed.error };
  const elevatorParsed = parseBrokerCount(body.elevator_count, '승강기 대수');
  if (!elevatorParsed.ok) return { ok: false, error: elevatorParsed.error };
  if (parkingParsed.value !== undefined) supplemental.parking_count = parkingParsed.value;
  if (elevatorParsed.value !== undefined) supplemental.elevator_count = elevatorParsed.value;

  // D4: 중개인 추가 정보 — 한도/형식 검증, 통과 시에만 supplemental 에 반영 (원본 body 값 직접 전달 금지)
  const extrasParsed = parseBrokerExtras(body.broker_extras);
  if (!extrasParsed.ok) return { ok: false, error: extrasParsed.error };
  if (extrasParsed.value) supplemental.broker_extras = extrasParsed.value;

  // 렌트롤 v1.5: 헤더 블록·면적 입력 단위·V12 해제 사유 — override.by/at 은 클라이언트 값을 무시하고 handler 가 서버에서 채운다.
  const rentRollMetaParsed = parseRentRollMeta(body.rent_roll_meta);
  if (!rentRollMetaParsed.ok) return { ok: false, error: rentRollMetaParsed.error };
  if (rentRollMetaParsed.value) {
    supplemental.rent_roll_meta = rentRollMetaParsed.value;
    side.hasExplicitRentRollMeta = true;
  }

  // X1: 부가수입·연면적 sanitize 후 통과 (비정상 값은 조용히 생략)
  const ancillary = sanitizeAncillaryIncomes(body.ancillary_incomes);
  if (ancillary) supplemental.ancillary_incomes = ancillary;
  const grossAreaM2 = sanitizeGrossAreaM2(body.total_gross_area_m2);
  if (grossAreaM2 !== undefined) supplemental.total_gross_area_m2 = grossAreaM2;
  // v1.4 행 필드(근거·렌트프리·입금확인) enum/정수 정규화 — 허용값 밖은 null (추측 보정 금지)
  if (Array.isArray(supplemental.floor_leases)) supplemental.floor_leases = sanitizeRentrollRowFields(supplemental.floor_leases);

  // 다필지: 바텀시트 ParcelSection 입력(parcels/pnus) — pnus 는 parcels 파생값 + 클라이언트 pnus(19자리 숫자만) 의 합집합
  const parcelsParsed = parseBrokerParcels(body.parcels);
  if (!parcelsParsed.ok) return { ok: false, error: parcelsParsed.error };
  if (parcelsParsed.parcels.length > 0) supplemental.parcels = parcelsParsed.parcels as unknown as Array<Record<string, unknown>>;
  const extraPnus = Array.isArray(body.pnus)
    ? (body.pnus as unknown[]).map(normalizePnu).filter((p): p is string => !!p)
    : [];
  const mergedPnus = Array.from(new Set([...parcelsParsed.pnus, ...extraPnus]));
  if (mergedPnus.length > 0) supplemental.pnus = mergedPnus;

  return { ok: true, supplemental: supplemental as MobileIMSupplementalInput, side, parcelWarnings: parcelsParsed.warnings };
}

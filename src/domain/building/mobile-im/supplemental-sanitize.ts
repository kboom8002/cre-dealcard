// src/domain/building/mobile-im/supplemental-sanitize.ts
// generate / generate-async 라우트가 supplemental 화이트리스트에 새로 통과시키는 필드의 sanitize (X1).
//  - ancillary_incomes (비임대 부가수입, 바텀시트 Pro) — 기존에는 화이트리스트에서 유실됐다.
//  - total_gross_area_m2 (연면적 ㎡) — 핸들러 resolveTotalAreaWithSource 의 명시 입력 슬롯.
// 비정상 값은 400 이 아니라 조용히 버린다(부가 입력이 생성 전체를 막지 않도록). 중개인 입력 출처는 서버가 broker_input 으로 고정한다.

import type { AncillaryIncomeItem } from './types';
import { EVIDENCE_LEVELS, PAYMENT_STATUSES } from './rentroll-meta';

const ANCILLARY_TYPES: readonly AncillaryIncomeItem['type'][] = [
  'telecom_antenna', 'telecom_electric', 'parking', 'signage', 'vending', 'rooftop_solar', 'ev_charging', 'other',
];
const ANCILLARY_LABELS: Record<AncillaryIncomeItem['type'], string> = {
  telecom_antenna: '통신장비 임대',
  telecom_electric: '통신장비 전기료',
  parking: '주차 수입',
  signage: '간판/옥외광고',
  vending: '자판기',
  rooftop_solar: '태양광',
  ev_charging: '전기차 충전',
  other: '기타 부가수입',
};
const ANCILLARY_MAX_ITEMS = 10;
const ANCILLARY_MAX_ANNUAL_KRW = 1e12;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g;

function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(CONTROL_CHARS, ' ').replace(/[<>]/g, '').replace(/ {2,}/g, ' ').trim().slice(0, max);
}

/** 부가수입 목록 sanitize — 배열이 아니거나 유효 항목이 없으면 undefined (키 자체를 생략) */
export function sanitizeAncillaryIncomes(input: unknown): AncillaryIncomeItem[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: AncillaryIncomeItem[] = [];
  for (const raw of input.slice(0, ANCILLARY_MAX_ITEMS)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const amount = Number(r.annualAmountKrw);
    if (!Number.isFinite(amount) || amount <= 0 || amount > ANCILLARY_MAX_ANNUAL_KRW) continue;
    const type = (ANCILLARY_TYPES as readonly string[]).includes(r.type as string)
      ? (r.type as AncillaryIncomeItem['type'])
      : 'other';
    const note = cleanText(r.note, 100);
    out.push({
      type,
      label: cleanText(r.label, 40) || ANCILLARY_LABELS[type],
      annualAmountKrw: Math.round(amount),
      provenance: 'broker_input',
      ...(note ? { note } : {}),
    });
  }
  return out.length > 0 ? out : undefined;
}

/** 연면적(㎡) — 유한 양수만 통과, 그 외 undefined */
export function sanitizeGrossAreaM2(input: unknown): number | undefined {
  const n = typeof input === 'string' ? Number(input.replace(/,/g, '')) : Number(input);
  return Number.isFinite(n) && n > 0 && n <= 1e7 ? n : undefined;
}

/**
 * 렌트롤 v1.4 행 필드(Z 근거 / AA 렌트프리 / AB 입금확인) 정규화.
 * - 허용값 밖의 문구는 추측하지 않고 null (lease_ledger CHECK 제약과 동일한 허용값 — rentroll-meta.ts 상수).
 * - 세 필드 중 정규화로 값이 바뀐 행만 얕은 복사로 교체하고, 나머지 행·필드는 그대로 둔다.
 */
export function sanitizeRentrollRowFields<T>(rows: T[]): T[] {
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const r = row as Record<string, unknown>;
    const hasAny = r.evidence_level !== undefined || r.rent_free_months !== undefined || r.payment_status !== undefined;
    if (!hasAny) return row;
    const next: Record<string, unknown> = { ...r };
    if (r.evidence_level !== undefined) {
      next.evidence_level = (EVIDENCE_LEVELS as readonly string[]).includes(r.evidence_level as string) ? r.evidence_level : null;
    }
    if (r.payment_status !== undefined) {
      next.payment_status = (PAYMENT_STATUSES as readonly string[]).includes(r.payment_status as string) ? r.payment_status : null;
    }
    if (r.rent_free_months !== undefined) {
      const n = r.rent_free_months === null || r.rent_free_months === '' ? NaN : Number(r.rent_free_months);
      next.rent_free_months = Number.isInteger(n) && n >= 0 && n <= 600 ? n : null;
    }
    return next as T;
  });
}

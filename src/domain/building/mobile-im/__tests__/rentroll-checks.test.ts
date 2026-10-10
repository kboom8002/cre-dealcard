// 렌트롤 V01~V13 재계산 + V12(면적 단위 혼동) — 스펙 §3.2·§6.4-7·§7
import { describe, it, expect } from 'vitest';
import {
  blockingRentrollChecks,
  checkAreaUnit,
  computeRentrollChecks,
  resolveMonthlyRentKrw,
} from '../rentroll-checks';
import { toSqmFromInput } from '../rentroll-meta';
import { dangsanR3Rows, DANGSAN_AS_OF, DANGSAN_ASKING_KRW, DANGSAN_GFA_SQM, type Row } from './rentroll-v15-rows';

const base = () => ({
  rows: dangsanR3Rows(),
  gfaSqm: DANGSAN_GFA_SQM,
  askingPriceKrw: DANGSAN_ASKING_KRW,
  asOf: DANGSAN_AS_OF,
  areaInputUnit: 'sqm' as const,
  now: new Date('2026-10-10T00:00:00Z'),
});

/** G9=평 인데 C·D 에 ㎡ 숫자를 넣은 단위 혼동 시험 — ㎡ 값을 평으로 오해해 ×3.305785 */
const unitConfusionRows = (): Row[] =>
  dangsanR3Rows().map((r) => ({
    ...r,
    area_sqm: toSqmFromInput(r.area_sqm, 'pyeong'),
    exclusive_area_sqm: toSqmFromInput(r.exclusive_area_sqm, 'pyeong'),
  }));

describe('checkAreaUnit (§6.4-7) — 스펙 코드 그대로', () => {
  it('J4 없음 / 면적 합 0 → AREA_UNIT_UNCHECKED (경고)', () => {
    expect(checkAreaUnit(dangsanR3Rows(), null)?.code).toBe('AREA_UNIT_UNCHECKED');
    expect(checkAreaUnit(dangsanR3Rows(), undefined)?.level).toBe('warning');
    expect(checkAreaUnit(dangsanR3Rows(), 0)?.code).toBe('AREA_UNIT_UNCHECKED');
    expect(checkAreaUnit([{ floor: '1F' }], 1000)?.code).toBe('AREA_UNIT_UNCHECKED');
    expect(checkAreaUnit([], 1000)?.code).toBe('AREA_UNIT_UNCHECKED');
  });

  it('정상 범위(0.45~2) → null, 경계값은 정상', () => {
    expect(checkAreaUnit(dangsanR3Rows(), DANGSAN_GFA_SQM)).toBeNull();
    expect(checkAreaUnit([{ area_sqm: 200 }], 100)).toBeNull(); // ratio = 2 (초과 아님)
    expect(checkAreaUnit([{ area_sqm: 45 }], 100)).toBeNull(); // ratio = 0.45 (미만 아님)
  });

  it('ratio > 2 또는 < 0.45 → AREA_UNIT_MISMATCH 차단 + 해제 가능', () => {
    const hi = checkAreaUnit([{ area_sqm: 201 }], 100)!;
    expect(hi).toMatchObject({ code: 'AREA_UNIT_MISMATCH', level: 'blocking', overridable: true });
    expect(hi.ratio).toBeCloseTo(2.01, 5);
    expect(checkAreaUnit([{ area_sqm: 44 }], 100)).toMatchObject({ code: 'AREA_UNIT_MISMATCH', level: 'blocking' });
  });

  it('단위 혼동 시험 (G9=평 + ㎡ 숫자): Σ임대면적 4,764.14㎡ · 330.6%', () => {
    const rows = unitConfusionRows();
    const sum = rows.reduce((a, r) => a + r.area_sqm, 0);
    expect(sum).toBeCloseTo(4764.14, 0);
    const issue = checkAreaUnit(rows, DANGSAN_GFA_SQM)!;
    expect(issue.code).toBe('AREA_UNIT_MISMATCH');
    expect((issue.ratio as number) * 100).toBeCloseTo(330.6, 0);
    expect(issue.message).toContain('3.3배');
  });
});

describe('computeRentrollChecks — 오라클 (R3, 기준일 2025-05-15)', () => {
  const c = computeRentrollChecks(base());

  it('13개 항목이 모두 채워진다', () => {
    expect(Object.keys(c).sort()).toEqual(['V01', 'V02', 'V03', 'V04', 'V05', 'V06', 'V07', 'V08', 'V09', 'V10', 'V11', 'V12', 'V13']);
    for (const [k, v] of Object.entries(c)) expect(v.code).toBe(k);
  });

  it('V01 정상 (통합계약 비대표 행이 있어도 금액 판정 OK)', () => {
    expect(c.V01.level).toBe('ok');
    expect(c.V01.value).toMatchObject({ rentMissing: 0, duplicate: 0 });
  });

  it('V02 기준일 있음 ok / 없음 warn', () => {
    expect(c.V02.level).toBe('ok');
    const noAsOf = computeRentrollChecks({ ...base(), asOf: null });
    expect(noAsOf.V02.level).toBe('warn');
    expect(noAsOf.V02.value).toBe('2026-10-10');
  });

  it('V03 = 100.0%', () => {
    expect(c.V03.value).toBe(100);
    expect(c.V03.level).toBe('ok');
    expect(c.V03.message).toContain('100.0%');
  });

  it('V03 경계: 75% 미만 · 100% 초과는 warn (차단 아님)', () => {
    const low = computeRentrollChecks({ ...base(), gfaSqm: DANGSAN_GFA_SQM / 0.7 });
    expect(low.V03.level).toBe('warn');
    expect(low.V03.message).toContain('호실 누락 의심');
    const high = computeRentrollChecks({ ...base(), gfaSqm: DANGSAN_GFA_SQM / 1.2 });
    expect(high.V03.level).toBe('warn');
    expect(high.V03.message).toContain('면적 오기 의심');
    expect(high.V12.level).toBe('ok');
  });

  it('V04 = 2.08% (ΣH×12 ÷ (J3−ΣG)), V05 는 기타수입이 없으면 보류', () => {
    expect(c.V04.value).toBe(2.08);
    expect(c.V04.level).toBe('ok');
    expect(c.V05.level).toBe('info');
    expect(c.V05.value).toBeNull();
  });

  it('V05: 기타수입은 별도 줄 — V04(헤드라인)는 그대로', () => {
    const w = computeRentrollChecks({ ...base(), otherIncomeKrw: 500_000 });
    expect(w.V04.value).toBe(2.08);
    const expected = Math.round(((19_460_000 + 500_000) * 12 / 11_210_000_000) * 10_000) / 100;
    expect((w.V05.value as any).pct).toBe(expected);
    expect(expected).toBeGreaterThan(2.08);
  });

  it('V04: 매각가 없으면 보류(info, null)', () => {
    const n = computeRentrollChecks({ ...base(), askingPriceKrw: null });
    expect(n.V04.level).toBe('info');
    expect(n.V04.value).toBeNull();
  });

  it('V06: 12개월 내 + 만료 경과 월세 비중 — 3F(455만, 12개월 내) + 4F(1)(260만, 만료 경과) ÷ 1,946만', () => {
    const v = c.V06.value as any;
    expect(v.pct).toBe(Math.round((715 / 1946) * 1000) / 10); // 36.7
    expect(v.expiredPct).toBe(Math.round((260 / 1946) * 1000) / 10);
    expect(v.within12Pct).toBe(Math.round((455 / 1946) * 1000) / 10);
  });

  it('V06: 같은 데이터도 평가일을 바꾸면 달라진다 (C5 고정이 아니면 생성일에 따라 변동)', () => {
    const later = computeRentrollChecks({ ...base(), asOf: '2026-06-01' });
    expect((later.V06.value as any).pct).toBeGreaterThan((c.V06.value as any).pct);
  });

  it('V07 근거 분포는 계약 단위(월세가 적힌 대표 행) — 비대표 행 제외', () => {
    const v = c.V07.value as any;
    expect(v.total).toBe(5);
    expect(v).toMatchObject({ contract: 3, seller: 1, oral: 1, missing: 0 });
  });

  it('V08 입금 확인: 연체 1 · 미확인 1 (계약 단위)', () => {
    const v = c.V08.value as any;
    expect(v).toMatchObject({ overdue: 1, unconfirmed: 1, normal: 3, flagged: 2 });
    expect(c.V08.level).toBe('warn');
  });

  it('V09 렌트프리 AA>0 건수', () => {
    expect(c.V09.value).toBe(1);
  });

  it('V10/V11: 시장 임대료 없음 → V11 미충족 / R3 + 출처 있는 시장 임대료 + 근거 전부 → ready', () => {
    expect(c.V10.value).toMatchObject({ rates: 0, sources: 0 });
    expect(c.V11.level).toBe('info');
    expect((c.V11.value as any).ready).toBe(false);

    const rows = dangsanR3Rows();
    rows[3] = { ...rows[3], evidence_level: '계약서 원본' };
    const ok = computeRentrollChecks({
      ...base(), rows,
      marketRent: { market_rent_1f: 1_300_000, market_rent_1f_source: '인근 중개 3건 (2025-05)' },
    });
    expect(ok.V10.level).toBe('ok');
    expect(ok.V11.level).toBe('ok');
    expect((ok.V11.value as any).ready).toBe(true);

    // 출처 없는 시장 임대료 → V10 warn, V11 미충족
    const noSrc = computeRentrollChecks({ ...base(), marketRent: { market_rent_1f: 1_300_000 } });
    expect(noSrc.V10.level).toBe('warn');
    expect((noSrc.V11.value as any).ready).toBe(false);
  });

  it('V11: 비대표 행의 근거 누락도 센다', () => {
    const rows = dangsanR3Rows();
    rows[4] = { ...rows[4], evidence_level: undefined };
    const r = computeRentrollChecks({ ...base(), rows, marketRent: { market_rent_1f: 1, market_rent_1f_source: 'x' } });
    expect((r.V11.value as any).evidenceMissingRows).toBe(1);
    expect(r.V11.level).toBe('info');
  });

  it('V12 정상, V13 입력 단위 표시', () => {
    expect(c.V12.level).toBe('ok');
    expect(c.V12.message).toBe('정상');
    expect(c.V13.value).toBe('sqm');
    const py = computeRentrollChecks({ ...base(), areaInputUnit: 'pyeong' });
    expect(py.V13.value).toBe('pyeong');
    expect(py.V13.message).toContain('3.305785');
  });
});

describe('V01 — 금액 중복·누락은 발행 차단', () => {
  it('금액 중복 → V01 block', () => {
    const rows = dangsanR3Rows();
    rows[3] = { ...rows[3], rent_manwon: 100, mgmt_fee_manwon: 10 };
    const c = computeRentrollChecks({ ...base(), rows });
    expect(c.V01.level).toBe('block');
    expect(c.V01.value).toMatchObject({ duplicate: 1 });
    expect(c.V01.message).toContain('금액 중복 1건');
    expect(blockingRentrollChecks(c).map((x) => x.code)).toEqual(['V01']);
  });

  it('그룹 월세 누락 → V01 block', () => {
    const rows = dangsanR3Rows();
    rows[2] = { ...rows[2], rent_manwon: null };
    const c = computeRentrollChecks({ ...base(), rows });
    expect(c.V01.level).toBe('block');
    expect(c.V01.value).toMatchObject({ rentMissing: 1 });
  });

  it('관리비 누락만 있으면 차단하지 않는다', () => {
    const rows = dangsanR3Rows();
    rows[1] = { ...rows[1], mgmt_fee_manwon: null };
    const c = computeRentrollChecks({ ...base(), rows });
    expect(c.V01.level).toBe('ok');
    expect(c.V01.value).toMatchObject({ mgmtMissing: 1 });
  });
});

describe('V12 — 단위 혼동: 차단·해제·보조 판정', () => {
  const confusion = () => ({ ...base(), rows: unitConfusionRows() });

  it('G9=평인데 ㎡ 숫자: 330.6% → block', () => {
    const c = computeRentrollChecks(confusion());
    expect(c.V12.level).toBe('block');
    expect(c.V12.overridden).toBe(false);
    expect((c.V12.value as number) * 100).toBeCloseTo(330.6, 0);
    expect(c.V03.level).toBe('warn');
    expect(blockingRentrollChecks(c).map((x) => x.code)).toEqual(['V12']);
  });

  it('사유(override reason)를 적으면 해제 → warn + overridden', () => {
    const c = computeRentrollChecks({ ...confusion(), areaOverride: { reason: '구분소유 일부 층 매각' } });
    expect(c.V12.level).toBe('warn');
    expect(c.V12.overridden).toBe(true);
    expect(c.V12.message).toContain('구분소유 일부 층 매각');
    expect(blockingRentrollChecks(c)).toHaveLength(0);
  });

  it('공백 사유는 해제가 아니다', () => {
    const c = computeRentrollChecks({ ...confusion(), areaOverride: { reason: '   ' } });
    expect(c.V12.level).toBe('block');
  });

  it('정상인데 override 가 있어도 overridden 표시하지 않는다', () => {
    const c = computeRentrollChecks({ ...base(), areaOverride: { reason: '불필요' } });
    expect(c.V12.level).toBe('ok');
    expect(c.V12.overridden).toBeUndefined();
  });

  it('J4 없음 + 신뢰 대장 연면적: 보조 판정 — 혼동이면 warn 까지만 (절대 block 아님)', () => {
    const c = computeRentrollChecks({ ...confusion(), gfaSqm: null, registerGfaSqm: DANGSAN_GFA_SQM });
    expect(c.V12.level).toBe('warn');
    expect(c.V12.message).toContain('J4 없음 — 건축물대장 연면적 기준 보조 판정');
    expect(c.V03.message).toContain('J4 없음 — 건축물대장 연면적 기준 보조 판정');
    expect(c.V03.level).toBe('warn');
    expect(blockingRentrollChecks(c)).toHaveLength(0);
  });

  it('보조 판정이 정상이면 info (J4 정본이 아니므로 ok 로 단정하지 않음)', () => {
    const c = computeRentrollChecks({ ...base(), gfaSqm: null, registerGfaSqm: DANGSAN_GFA_SQM });
    expect(c.V12.level).toBe('info');
    expect(c.V12.message).toContain('보조 판정');
    expect(c.V03.value).toBe(100);
  });

  it('J4 도 대장도 없으면 판정 보류 warn', () => {
    const c = computeRentrollChecks({ ...base(), gfaSqm: null });
    expect(c.V12.level).toBe('warn');
    expect(c.V12.message).toContain('판정 보류');
    expect(c.V03.level).toBe('warn');
  });

  it('J4 가 있으면 대장 연면적은 무시 (J4 가 정본)', () => {
    const c = computeRentrollChecks({ ...confusion(), registerGfaSqm: DANGSAN_GFA_SQM * 3.3 });
    expect(c.V12.level).toBe('block');
  });
});

describe('X3 — resolveMonthlyRentKrw (NOI 를 월세로 넣지 않는다)', () => {
  it('supplemental.monthly_rent_total_krw 우선', () => {
    expect(resolveMonthlyRentKrw({ monthly_rent_total_krw: 19_460_000, floor_leases: dangsanR3Rows() })).toBe(19_460_000);
  });

  it('없으면 렌트롤 임대중 행 합 (만원 → 원)', () => {
    expect(resolveMonthlyRentKrw({ floor_leases: dangsanR3Rows() })).toBe(19_460_000);
    expect(resolveMonthlyRentKrw({ monthly_rent_total_krw: 0, floor_leases: dangsanR3Rows() })).toBe(19_460_000);
  });

  it('둘 다 없으면 0', () => {
    expect(resolveMonthlyRentKrw({})).toBe(0);
    expect(resolveMonthlyRentKrw(null)).toBe(0);
    expect(resolveMonthlyRentKrw({ floor_leases: [{ lease_state: '공실', rent_manwon: 50 }] })).toBe(0);
  });
});

// 렌트롤 v1.4/v1.5 도메인 순수 함수 — 스펙 docs/RENTROLL_v1.3_to_v1.5.md §2.3·§2.4·§6.4·§7 오라클
import { describe, it, expect } from 'vitest';
import {
  amountCheck,
  commercialVacatePoint,
  edateYmd,
  expiryBucket,
  groupContracts,
  isContractRepresentative,
  nocPerExclusivePyeong,
  parseYmd,
  resolveCapabilities,
  resolveEvaluationDate,
  resolveLedger,
} from '../lease-math';
import { resolveLeaseOccupancy, summarizeLeaseOccupancy } from '../lease-vacancy';
import type { LeaseRow } from '@/types/im';
import { dangsanR3Rows, withPyeongInputs, DANGSAN_AS_OF, type Row } from './rentroll-v15-rows';

const IDX = { pharmacy: 1, intA: 2, intA2F: 3, intA2FB: 4 } as const;

describe('resolveEvaluationDate (§6.4-1)', () => {
  it('C5 가 있으면 그 날짜 (UTC 자정)', () => {
    expect(resolveEvaluationDate('2025-05-15').toISOString()).toBe('2025-05-15T00:00:00.000Z');
    expect(resolveEvaluationDate(new Date('2025-05-15T00:00:00Z')).toISOString()).toBe('2025-05-15T00:00:00.000Z');
  });

  it('엑셀 serial 도 허용', () => {
    const serial = (Date.UTC(2026, 9, 10) - Date.UTC(1899, 11, 30)) / 86_400_000;
    expect(resolveEvaluationDate(serial).toISOString().slice(0, 10)).toBe('2026-10-10');
  });

  it('비어 있거나 파싱 불가면 오늘(KST) — now 주입', () => {
    const now = new Date('2026-10-09T20:00:00Z'); // KST 2026-10-10 05:00
    expect(resolveEvaluationDate(undefined, now).toISOString().slice(0, 10)).toBe('2026-10-10');
    expect(resolveEvaluationDate('', now).toISOString().slice(0, 10)).toBe('2026-10-10');
    expect(resolveEvaluationDate('날짜아님', now).toISOString().slice(0, 10)).toBe('2026-10-10');
    expect(resolveEvaluationDate(null, new Date('2026-10-10T10:00:00Z')).toISOString().slice(0, 10)).toBe('2026-10-10');
  });

  it('parseYmd: 잘못된 달력 날짜는 null', () => {
    expect(parseYmd('2025-02-30')).toBeNull();
    expect(parseYmd('2025-5-1')).toBe('2025-05-01');
    expect(parseYmd(12)).toBeNull();
  });
});

describe('groupContracts (§2.4)', () => {
  it('trim(contract_group) 으로 묶고, 그룹 없는 행은 각자 1건', () => {
    const rows = dangsanR3Rows();
    const groups = groupContracts(rows);
    expect(groups).toHaveLength(7); // 단독 6 + 그룹 A 1
    const a = groups.find((g) => g.key === 'A')!;
    expect(a.named).toBe(true);
    expect(a.indices).toEqual([2, 3, 4]);
    expect(groups.filter((g) => !g.named)).toHaveLength(6);
  });

  it('공백 차이는 같은 그룹, 빈 문자열은 그룹 아님', () => {
    const g = groupContracts([{ contract_group: ' A ' }, { contract_group: 'A' }, { contract_group: '  ' }, {}]);
    expect(g.filter((x) => x.named)).toHaveLength(1);
    expect(g.find((x) => x.named)!.rows).toHaveLength(2);
    expect(g.filter((x) => !x.named)).toHaveLength(2);
  });
});

describe('amountCheck — 스펙 AD (§2.3)', () => {
  const rows = dangsanR3Rows();

  it('통합계약: 대표 행·비대표 행 모두 OK (v1.3 은 비대표 행 때문에 오판)', () => {
    expect(amountCheck(rows[IDX.intA], rows)).toBe('OK');
    expect(amountCheck(rows[IDX.intA2F], rows)).toBe('OK');
    expect(amountCheck(rows[IDX.pharmacy], rows)).toBe('OK');
  });

  it('임대중이 아닌 행은 빈 문자열', () => {
    expect(amountCheck(rows[0], rows)).toBe('');
  });

  it('단독: 월세 누락 → 관리비 누락 순', () => {
    const solo = { floor: '1F', lease_state: '임대중' };
    expect(amountCheck(solo, [solo])).toBe('월세 누락');
    const noMgmt = { floor: '1F', lease_state: '임대중', rent_manwon: 100 };
    expect(amountCheck(noMgmt, [noMgmt])).toBe('관리비 누락');
    const mgmtZero = { floor: '1F', lease_state: '임대중', rent_manwon: 100, mgmt_fee_manwon: 0 };
    expect(amountCheck(mgmtZero, [mgmtZero])).toBe('OK'); // 0 = 입력됨 (빈 칸과 구분)
  });

  it('금액 중복: 같은 그룹에 월세 행이 2개', () => {
    const dup = dangsanR3Rows();
    dup[IDX.intA2F] = { ...dup[IDX.intA2F], rent_manwon: 100, mgmt_fee_manwon: 10 };
    expect(amountCheck(dup[IDX.intA], dup)).toBe('금액 중복');
    expect(amountCheck(dup[IDX.intA2FB], dup)).toBe('금액 중복');
  });

  it('그룹 월세 0개 → 월세 누락, 그룹 관리비 0개 → 관리비 누락', () => {
    const noRent = dangsanR3Rows();
    noRent[IDX.intA] = { ...noRent[IDX.intA], rent_manwon: null };
    expect(amountCheck(noRent[IDX.intA2F], noRent)).toBe('월세 누락');
    const noMgmt = dangsanR3Rows();
    noMgmt[IDX.intA] = { ...noMgmt[IDX.intA], mgmt_fee_manwon: undefined };
    expect(amountCheck(noMgmt[IDX.intA2F], noMgmt)).toBe('관리비 누락');
  });

  it('레거시 0 채움 비대표 행(X4)은 금액 중복으로 보지 않는다', () => {
    const legacy = dangsanR3Rows();
    legacy[IDX.intA2F] = { ...legacy[IDX.intA2F], rent_manwon: 0, mgmt_fee_manwon: 0, deposit_manwon: 0 };
    expect(amountCheck(legacy[IDX.intA], legacy)).toBe('OK');
    expect(nocPerExclusivePyeong(legacy[IDX.intA2F], legacy)).toBeNull();
    expect(isContractRepresentative(legacy[IDX.intA2F], legacy)).toBe(false);
    expect(isContractRepresentative(legacy[IDX.intA], legacy)).toBe(true);
  });

  it('LeaseRow(camelCase, 원) 도 같은 규칙', () => {
    const a: Partial<LeaseRow> = { unitLabel: '1F', leaseState: '임대중', contractGroup: 'G', monthlyRentKrw: 1_000_000, mgmtFeeKrw: 100_000 };
    const b: Partial<LeaseRow> = { unitLabel: '2F', leaseState: '임대중', contractGroup: 'G', monthlyRentKrw: null, mgmtFeeKrw: null };
    expect(amountCheck(a as LeaseRow, [a as LeaseRow, b as LeaseRow])).toBe('OK');
    expect(amountCheck(b as LeaseRow, [a as LeaseRow, b as LeaseRow])).toBe('OK');
  });
});

describe('비대표 행은 공실이 아니다 (§2.4 / 점유 SSOT)', () => {
  it('월세 0 추정으로 is_vacant:true 가 붙어도 임차인명이 있으면 임대중', () => {
    const rows: Row[] = [
      { floor: '1F', contract_group: 'A', tenant_name: '내과', lease_state: '임대중', rent_manwon: 883, mgmt_fee_manwon: 90 },
      { floor: '2F', contract_group: 'A', tenant_name: '내과', is_vacant: true }, // lease_state 없음 + 금액 없음
    ];
    expect(resolveLeaseOccupancy(rows[1])).toBe('임대중');
    const s = summarizeLeaseOccupancy(rows);
    expect(s.vacant).toBe(0);
    expect(amountCheck(rows[1], rows)).toBe('OK');
  });

  it('통합계약 비대표 행이 있어도 공실·R3 판정에 영향 없음', () => {
    const rows = dangsanR3Rows();
    expect(summarizeLeaseOccupancy(rows).vacant).toBe(0);
    expect(summarizeLeaseOccupancy(rows).ownerUse).toBe(2);
  });
});

describe('expiryBucket — 스펙 AC, EDATE(+12개월) 기준 (§2.3)', () => {
  const lease = (end: string | null, state = '임대중') => ({ floor: '1F', lease_state: state, lease_end: end });

  it('경계: 기준일 전날=만료 경과, 기준일=12개월 내, EDATE 당일=12개월 내, 다음 날=12개월 초과', () => {
    const base = '2026-10-10';
    expect(expiryBucket(lease('2026-10-09'), base)).toBe('만료 경과');
    expect(expiryBucket(lease('2026-10-10'), base)).toBe('12개월 내');
    expect(expiryBucket(lease('2027-10-10'), base)).toBe('12개월 내');
    expect(expiryBucket(lease('2027-10-11'), base)).toBe('12개월 초과');
  });

  it('365일이 아니라 달력 12개월 — 윤일을 낀 구간에서 갈린다', () => {
    // 2023-10-10 + 365일 = 2024-10-09 (윤일 포함) 이지만 EDATE(+12) = 2024-10-10
    expect(expiryBucket(lease('2024-10-10'), '2023-10-10')).toBe('12개월 내');
    expect(expiryBucket(lease('2024-10-11'), '2023-10-10')).toBe('12개월 초과');
  });

  it('EDATE 말일 클램프: 2024-02-29 → 2025-02-28', () => {
    expect(edateYmd('2024-02-29', 12)).toBe('2025-02-28');
    expect(edateYmd('2025-01-31', 1)).toBe('2025-02-28');
    expect(edateYmd('2025-11-30', 3)).toBe('2026-02-28');
    expect(expiryBucket(lease('2025-02-28'), '2024-02-29')).toBe('12개월 내');
    expect(expiryBucket(lease('2025-03-01'), '2024-02-29')).toBe('12개월 초과');
  });

  it('공실·자가사용·만료일 없음', () => {
    expect(expiryBucket(lease('2026-01-01', '공실'), '2026-10-10')).toBe('공실');
    expect(expiryBucket(lease(null, '자가사용'), '2026-10-10')).toBe('자가사용');
    expect(expiryBucket(lease(null), '2026-10-10')).toBe('만료일 없음');
    expect(expiryBucket(lease('몰라'), '2026-10-10')).toBe('만료일 없음');
  });

  it('평가일은 Date 도 허용 (resolveEvaluationDate 결과)', () => {
    expect(expiryBucket(lease('2026-04-17'), resolveEvaluationDate(DANGSAN_AS_OF))).toBe('12개월 내');
    expect(expiryBucket(lease('2026-08-31'), resolveEvaluationDate(DANGSAN_AS_OF))).toBe('12개월 초과');
    expect(expiryBucket(lease('2025-04-30'), resolveEvaluationDate(DANGSAN_AS_OF))).toBe('만료 경과');
  });
});

describe('nocPerExclusivePyeong — 스펙 Y열 / §7 오라클', () => {
  const rows = dangsanR3Rows();

  it('G9=㎡: 1F 약국 Y14 = 108,238, 내과 통합계약 A Y15 = 111,299', () => {
    expect(nocPerExclusivePyeong(rows[IDX.pharmacy], rows)).toBe(108_238);
    expect(nocPerExclusivePyeong(rows[IDX.intA], rows)).toBe(111_299);
  });

  it('NEGATIVE: v1.3 식(대표 행 전용 84㎡만 사용)의 382,920 은 절대 나오면 안 된다', () => {
    const rep = rows[IDX.intA];
    const v13 = Math.round((8_830_000 + 900_000) / (84 / 3.305785));
    expect(v13).toBe(382_920); // 버그 식이 이 값을 낸다는 사실 자체를 고정 (오라클 정합)
    const v15 = nocPerExclusivePyeong(rep, rows);
    expect(v15).not.toBe(382_920);
    expect(v15).toBe(111_299);
  });

  it('G9=평: 입력 평 → ㎡ 정본(ROUND2) 후 계산 — Y14 = 108,203, Y15 = 111,302 (평 입력 반올림 차이)', () => {
    // 평 입력값: 약국 18.76평, 내과 그룹 25.41 / 31.00 / 31.01평
    const py = withPyeongInputs(rows, {
      [IDX.pharmacy]: { excl: 18.76 },
      [IDX.intA]: { excl: 25.41 },
      [IDX.intA2F]: { excl: 31.0 },
      [IDX.intA2FB]: { excl: 31.01 },
    });
    expect(nocPerExclusivePyeong(py[IDX.pharmacy], py)).toBe(108_203);
    expect(nocPerExclusivePyeong(py[IDX.intA], py)).toBe(111_302);
  });

  it('비대표 행·자가사용·공실은 null', () => {
    expect(nocPerExclusivePyeong(rows[IDX.intA2F], rows)).toBeNull();
    expect(nocPerExclusivePyeong(rows[0], rows)).toBeNull();
    const vac = { floor: '6F', lease_state: '공실', area_sqm: 50, exclusive_area_sqm: 40 };
    expect(nocPerExclusivePyeong(vac, [vac])).toBeNull();
  });

  it('그룹 중 전용면적이 빈 행이 있으면 보류(null) — 임대면적으로 대체하지 않는다', () => {
    const r = dangsanR3Rows();
    r[IDX.intA2FB] = { ...r[IDX.intA2FB], exclusive_area_sqm: null };
    expect(nocPerExclusivePyeong(r[IDX.intA], r)).toBeNull();
    const solo = dangsanR3Rows();
    solo[IDX.pharmacy] = { ...solo[IDX.pharmacy], exclusive_area_sqm: undefined };
    expect(nocPerExclusivePyeong(solo[IDX.pharmacy], solo)).toBeNull();
  });

  it('템플릿 예시 행 (3F 사무실): NOC 167,950 · AC 12개월 초과(C6=2026-10-10) · AD OK · 갱신권 잔여 6.5년', () => {
    const ex: Row = {
      floor: '3F', tenant_type: '사무실', legal_basis: '상가', lease_state: '임대중',
      area_sqm: 132.5, exclusive_area_sqm: 99.4,
      deposit_manwon: 5000, rent_manwon: 450, mgmt_fee_manwon: 55,
      first_contract_date: '2023-04-01', lease_start: '2024-01-01', lease_end: '2027-12-31',
      opposing_power: '사업자등록', evidence_level: '계약서 원본', rent_free_months: 0, payment_status: '정상',
    };
    const asOf = resolveEvaluationDate('2026-10-10');
    expect(nocPerExclusivePyeong(ex, [ex])).toBe(167_950);
    expect(expiryBucket(ex, asOf)).toBe('12개월 초과');
    expect(amountCheck(ex, [ex])).toBe('OK');
    expect(resolveLedger([ex], { asOf: '2026-10-10' })).toBe('R3');

    const camel: LeaseRow = {
      unitLabel: '3F', tenantBusiness: '사무실', depositKrw: 50_000_000, monthlyRentKrw: 4_500_000, currentExpiryDate: '2027-12-31',
      leaseState: '임대중', contractGroup: null, leaseAreaSqm: 132.5, exclusiveAreaSqm: 99.4, legalBasis: '상가', mgmtFeeKrw: 550_000,
      currentStartDate: '2024-01-01', firstContractDate: '2023-04-01', renewalExercised: '모름', opposingPower: '사업자등록', note: null,
    };
    const v = commercialVacatePoint(camel, asOf);
    expect(v.state).toBe('determined');
    if (v.state === 'determined') {
      expect(v.at).toBe('2033-04-01');
      expect(v.reason).toContain('잔여 6.5년');
    }
  });
});

describe('resolveLedger — v1.4 계약 단위 규칙 (§6.4-2~4)', () => {
  /** v1.3 규칙: 임대중 '모든 행' 에 월세 필요 (통합계약 비대표 행 때문에 R0 로 오판) */
  const legacyV13R1 = (rows: Row[]): boolean =>
    rows.filter((r) => r.lease_state === '임대중').every((r) => r.rent_manwon != null);

  it('R3: 통합계약 비대표 행이 있어도 R3 표준형', () => {
    expect(resolveLedger(dangsanR3Rows(), { asOf: DANGSAN_AS_OF })).toBe('R3');
    expect(resolveLedger(dangsanR3Rows())).toBe('R3'); // 시그니처 호환 (옵션 생략)
  });

  it('PIN: 같은 데이터에 v1.3 규칙을 적용하면 R1 조건 탈락 → R0 (이 버그가 되살아나면 아래 R3 단언이 깨진다)', () => {
    const rows = dangsanR3Rows();
    expect(legacyV13R1(rows)).toBe(false); // v1.3 규칙이면 R0
    expect(resolveLedger(rows)).toBe('R3'); // v1.4 계약 단위 규칙
  });

  it('R2: 비대표 행의 최초계약일/대항력 누락 → R3 탈락', () => {
    const rows = dangsanR3Rows();
    rows[IDX.intA2F] = { ...rows[IDX.intA2F], first_contract_date: undefined };
    expect(resolveLedger(rows)).toBe('R2');
    const rows2 = dangsanR3Rows();
    rows2[IDX.intA2FB] = { ...rows2[IDX.intA2FB], opposing_power: '미확인' };
    expect(resolveLedger(rows2)).toBe('R2');
  });

  it('R1: 그룹 관리비 0개 / 전 행 면적·법령 누락 → R2 탈락', () => {
    const noMgmt = dangsanR3Rows();
    noMgmt[IDX.intA] = { ...noMgmt[IDX.intA], mgmt_fee_manwon: null };
    expect(resolveLedger(noMgmt)).toBe('R1');
    const noArea = dangsanR3Rows();
    noArea[0] = { ...noArea[0], area_sqm: null };
    expect(resolveLedger(noArea)).toBe('R1');
  });

  it('R0: 금액 중복 / 그룹 월세 없음 / 임대중 행 만료일 없음', () => {
    const dup = dangsanR3Rows();
    dup[IDX.intA2F] = { ...dup[IDX.intA2F], rent_manwon: 100, mgmt_fee_manwon: 10 };
    expect(resolveLedger(dup)).toBe('R0');
    const noRent = dangsanR3Rows();
    noRent[IDX.intA] = { ...noRent[IDX.intA], rent_manwon: null };
    expect(resolveLedger(noRent)).toBe('R0');
    const noEnd = dangsanR3Rows();
    noEnd[IDX.pharmacy] = { ...noEnd[IDX.pharmacy], lease_end: null };
    expect(resolveLedger(noEnd)).toBe('R0');
  });

  it('빈 배열 R0, 임대중 없음은 호실명이 있으면 R1', () => {
    expect(resolveLedger([])).toBe('R0');
    expect(resolveLedger([{ floor: '1F', lease_state: '공실' }])).toBe('R1');
  });

  it('resolveCapabilities: 평가 기준일 옵션 (기본값 불변)', () => {
    const rows: LeaseRow[] = [{
      unitLabel: '1F', tenantBusiness: '카페', depositKrw: 1, monthlyRentKrw: 1, currentExpiryDate: '2027-01-01', leaseState: '임대중',
      contractGroup: null, leaseAreaSqm: 10, legalBasis: '상가', mgmtFeeKrw: 1, currentStartDate: null, firstContractDate: '2020-01-01',
      renewalExercised: null, opposingPower: '사업자등록', note: null,
    }];
    expect(resolveCapabilities(rows).has('vacate_schedule')).toBe(true);
    expect(resolveCapabilities(rows, undefined, { asOf: '2025-05-15' }).has('vacate_schedule')).toBe(true);
  });
});

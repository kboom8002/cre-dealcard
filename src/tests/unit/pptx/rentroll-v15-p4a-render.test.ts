/**
 * 렌트롤 v1.3→v1.5 P4a — Basic IM PPTX 표면 (§9.1 면적 단일 단위 · Q1 수익률 단일 헤드라인 · V05 별도 줄)
 *
 *  1) lease-area-format: ㎡ 단일 단위 소수 2자리 / 평 = ㎡÷3.305785 / 결측 '-' / 합계 = 표시값의 합
 *  2) 머리글 접두어 매칭 (isBasicRentRollHeaderRow · isNumericRentRollHeader)
 *  3) 비고: 행 사실(렌트프리·입금)은 공통 비고로 새지 않는다
 *  4) buildRentrollFactsNote: 계산된 사실만, 없으면 null
 *  5) A23: V05 별도 줄(기타수입 있을 때만) · 안정화 캡션(market_rent 포함) · 요약↔A23 V04 동일 값·동일 이름
 */
import { describe, it, expect } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import {
  formatLeaseArea,
  formatLeaseAreaValue,
  formatLeaseAreaTotal,
  formatLeaseAreaCompact,
  formatLeaseAreaFromRow,
  leaseAreaHeader,
  isLeaseAreaHeader,
  areaUnitFromHeader,
  stackingStripTitle,
  rentRollUnitCaption,
} from '@/domain/building/mobile-im/pptx/binder/lease-area-format';
import {
  isBasicRentRollHeaderRow,
  isNumericRentRollHeader,
  basicRentRollHeaders,
} from '@/domain/building/mobile-im/pptx/rentroll-area-columns';
import {
  bindRentRollTable,
  resolveLeaseFlags,
  resolveLeaseNote,
} from '@/domain/building/mobile-im/pptx/binder/rent-roll-table-builder';
import { buildRentrollFactsNote } from '@/domain/building/mobile-im/pptx/binder/rentroll-check-facts';
import { buildSummaryFromOverview } from '@/domain/building/mobile-im/pptx/binder/archetype-builders';
import { buildA23YieldFormula } from '@/domain/building/mobile-im/pptx/archetypes/a23-yield-formula';
import { buildYieldSet, buildYieldSetFromBody, YIELD_LABELS } from '@/domain/building/mobile-im/yield-set';

/* ───────────────────────── 1) lease-area-format ───────────────────────── */
describe('lease-area-format — §9.1 단일 단위', () => {
  it('㎡ 모드: 단일 단위 소수 2자리, 평 병기 없음', () => {
    expect(formatLeaseArea(209.6, 'sqm')).toBe('209.60');
    expect(formatLeaseArea(1234.5, 'sqm')).toBe('1,234.50');
    expect(formatLeaseArea(209.6, 'sqm')).not.toMatch(/평|\(/);
  });

  it('평 모드: 값 = ㎡ ÷ 3.305785 (소수 2자리)', () => {
    expect(formatLeaseArea(209.6, 'pyeong')).toBe('63.40');
    expect(formatLeaseArea(100, 'pyeong')).toBe('30.25');
  });

  it('결측·0·음수는 "-" (날조 금지)', () => {
    for (const v of [undefined, null, 0, -5, NaN]) {
      expect(formatLeaseArea(v as any, 'sqm')).toBe('-');
      expect(formatLeaseArea(v as any, 'pyeong')).toBe('-');
    }
    expect(formatLeaseAreaCompact(0, 'sqm')).toBeNull();
    expect(formatLeaseAreaValue(undefined)).toBe('-');
  });

  it('합계는 행 표기값(입력 단위, 2자리)의 합', () => {
    // 3 × (100 ÷ 3.305785 = 30.25) = 90.75 (표를 눈으로 더해도 맞는다)
    expect(formatLeaseAreaTotal([100, 100, 100], 'pyeong')).toBe('90.75');
    expect(formatLeaseAreaTotal([100, 100, 100], 'sqm')).toBe('300.00');
    expect(formatLeaseAreaTotal([undefined, null], 'sqm')).toBe('-');
  });

  it('행 객체: ㎡ 우선, 평 입력만 있으면 평 모드에서 환산 왕복 없이 그대로', () => {
    expect(formatLeaseAreaFromRow({ sqm: 100 }, 'pyeong')).toBe('30.25');
    expect(formatLeaseAreaFromRow({ pyeong: 63.4 }, 'pyeong')).toBe('63.40');
    expect(formatLeaseAreaFromRow({ pyeong: 63.4 }, 'sqm')).toBe('209.59');
    expect(formatLeaseAreaFromRow({}, 'sqm')).toBe('-');
  });

  it('머리글·캡션·스트립 제목이 같은 단위를 따른다', () => {
    expect(leaseAreaHeader('lease', 'sqm')).toBe('임대면적(㎡)');
    expect(leaseAreaHeader('exclusive', 'pyeong')).toBe('전용면적(평)');
    expect(stackingStripTitle('sqm')).toBe('층별 스태킹 플랜 (㎡)');
    expect(stackingStripTitle('pyeong')).toBe('층별 스태킹 플랜 (평)');
    expect(rentRollUnitCaption('sqm')).toBe('면적 ㎡ · 금액 만원');
    expect(rentRollUnitCaption('pyeong')).toBe('면적 평 · 금액 만원');
    expect(areaUnitFromHeader('임대면적(평)')).toBe('pyeong');
    expect(areaUnitFromHeader('임대면적')).toBeNull();
  });

  it('공실 카드용 압축 표기: 정수 + 단위', () => {
    expect(formatLeaseAreaCompact(523.4, 'sqm')).toBe('523㎡');
    expect(formatLeaseAreaCompact(523.4, 'pyeong')).toBe('158평');
  });
});

/* ───────────────────────── 2) 머리글 접두어 매칭 ───────────────────────── */
describe('머리글 접두어 매칭 (완전 일치 금지, §6.2)', () => {
  const base = ['층', '임차인', '용도', '임대면적', '전용면적', '보증금', '월임대료', '관리비', '월합계', '만기일'];
  it.each([
    ['stem', base],
    ['sqm', basicRentRollHeaders('sqm')],
    ['pyeong', basicRentRollHeaders('pyeong')],
    ['비고 11열', [...basicRentRollHeaders('pyeong'), '비고']],
  ])('%s 머리글 행을 R2 표로 인식', (_n, head) => {
    expect(isBasicRentRollHeaderRow(head as string[])).toBe(true);
  });

  it('NEGATIVE: 다른 표 머리글은 R2 로 오인하지 않는다 / isLeaseAreaHeader 접두어', () => {
    expect(isBasicRentRollHeaderRow(['항목', '값'])).toBe(false);
    expect(isBasicRentRollHeaderRow(undefined as any)).toBe(false);
    expect(isLeaseAreaHeader('임대면적(평)', 'lease')).toBe(true);
    expect(isLeaseAreaHeader('임대면적(평)', 'exclusive')).toBe(false);
    expect(isLeaseAreaHeader('임대면적당 보증금')).toBe(false);
  });

  it('숫자 열 판정은 꼬리표를 떼고 한다', () => {
    expect(isNumericRentRollHeader('임대면적(㎡)')).toBe(true);
    expect(isNumericRentRollHeader('전용면적(평)')).toBe(true);
    expect(isNumericRentRollHeader('임차인')).toBe(false);
  });
});

/* ───────────────────────── 3) 비고(행 사실) ───────────────────────── */
describe('resolveLeaseFlags / 비고 — 행 사실은 공통 비고로 새지 않는다', () => {
  it('렌트프리·연체·미확인 플래그, 공실·자가사용은 없음, 중복 방지', () => {
    expect(resolveLeaseFlags({ rent_free_months: 3, tenant_type: '카페' } as any, '')).toContain('렌트프리 3개월');
    expect(resolveLeaseFlags({ payment_status: '연체', tenant_type: '카페' } as any, '')).toContain('입금 연체');
    expect(resolveLeaseFlags({ payment_status: '미확인', tenant_type: '카페' } as any, '')).toContain('입금 미확인');
    expect(resolveLeaseFlags({ rent_free_months: 3, is_vacant: true, tenant_type: '공실' } as any, '')).toEqual([]);
    expect(resolveLeaseFlags({ rent_free_months: 3, tenant_type: '카페' } as any, '렌트프리 3개월')).toEqual([]);
    expect(resolveLeaseNote({ rent_free_months: 2, tenant_type: '카페', note: '분할임대' } as any)).toContain('렌트프리 2개월');
  });

  it('모든 행이 같은 렌트프리여도 행 비고에 남고 비고(공통)으로 승격되지 않는다', () => {
    const lease = (f: string) => ({ floor: f, tenant_type: '카페', area_sqm: 100, deposit_manwon: 1, rent_manwon: 1, rent_free_months: 3 });
    const result: Record<string, any> = { rentRoll: { title: 'x', content: '', tables: [] } };
    bindRentRollTable({ body: { preset: 'credeal_basic', floor_leases: [lease('1F'), lease('2F')] } }, '', result);
    expect(result.rentRoll.commonNote ?? '').not.toContain('렌트프리');
    const noteIdx = result.rentRoll.tableHead.indexOf('비고');
    expect(noteIdx).toBeGreaterThan(0);
    for (const r of result.rentRoll.tableRows) expect(r[noteIdx]).toContain('렌트프리 3개월');
  });
});

/* ───────────────────────── 4) 계산된 사실 각주 ───────────────────────── */
describe('buildRentrollFactsNote — 계산된 사실만', () => {
  const checks = {
    V06: { code: 'V06', value: { pct: 12.5, expiredPct: 2, within12Pct: 10.5 } },
    V07: { code: 'V07', value: { contract: 3, seller: 5, oral: 0, missing: 1, total: 9 } },
    V08: { code: 'V08', value: { normal: 6, overdue: 1, unconfirmed: 2, missing: 0, flagged: 3 } },
    V09: { code: 'V09', value: 2 },
  };

  it('POSITIVE: 존재하는 사실만 한 줄로 합친다 (0건 조각은 생략)', () => {
    const t = buildRentrollFactsNote(checks)!;
    expect(t).toContain('12개월 내 만기·만료 경과 월세 12.5%');
    expect(t).toContain('근거 계약서 원본 3·매도인 렌트롤 5건');
    expect(t).not.toContain('구두');
    expect(t).toContain('입금 연체 1·미확인 2건');
    expect(t).toContain('렌트프리 잔여 2개 호실');
    expect(t).not.toContain('\n');
  });

  it('NEGATIVE: 데이터가 없거나 모두 0이면 null (빈 문구·날조 금지)', () => {
    expect(buildRentrollFactsNote(undefined)).toBeNull();
    expect(buildRentrollFactsNote({})).toBeNull();
    expect(buildRentrollFactsNote({
      V06: { value: null }, V07: { value: { contract: 0, seller: 0, oral: 0, missing: 4, total: 4 } },
      V08: { value: { overdue: 0, unconfirmed: 0 } }, V09: { value: 0 },
    })).toBeNull();
  });
});

/* ───────────────────────── 5) A23 / 요약 수익률 ───────────────────────── */
const PY = 3.305785;
const J = { market_rent_1f: 1_300_000, market_rent_upper: 900_000, market_rent_basement: 600_000 };
const SRC = { market_rent_1f_source: '인근 중개 3건', market_rent_upper_source: '호가 2025-05', market_rent_basement_source: '감정 참고' };
const leased = { floor: '1F', lease_state: '임대중', area_sqm: 100, exclusive_area_sqm: 80 };
const vac5F = { floor: '5F', lease_state: '공실', area_sqm: 100, exclusive_area_sqm: 80 };
void PY;

const ysParams = (over: Record<string, any> = {}) => ({
  annualRentKrw: 60_000_000,
  askingPriceKrw: 10_000_000_000,
  depositKrw: 100_000_000,
  floorLeases: [leased, vac5F],
  ...over,
});

async function renderA23(yieldSet: any, over: Record<string, any> = {}) {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  buildA23YieldFormula({
    pres, slideNum: 7, docno: 'T', grade: 'A', provenance: {},
    data: {
      annualRent: 60_000_000, totalDeposit: 100_000_000, askingPrice: 10_000_000_000,
      capRateAsIs: yieldSet.grossYieldNetOfDeposit,
      capRateStabilized: yieldSet.stabilized?.value,
      stabilizedAssumption: yieldSet.stabilized?.caption ?? undefined,
      yieldSet,
      ...over,
    },
  } as any);
  const zip = await JSZip.loadAsync((await pres.write({ outputType: 'nodebuffer' })) as Buffer);
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  const texts = (xml.match(/<a:t>([^<]*)<\/a:t>/g) ?? []).map(t => t.replace(/<\/?a:t>/g, ''));
  const EMU = 914400;
  const bottoms = [...xml.matchAll(/<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)]
    .map(m => (+m[2] + +m[4]) / EMU)
    .filter(b => b < 7.2);
  return { texts, bottoms };
}

describe('A23 — V04 헤드라인 · V05 별도 줄 · 안정화 캡션', () => {
  it('V05 는 기타수입이 있을 때만 별도 줄로 (헤드라인 V04 에 합산하지 않는다)', async () => {
    const withOther = buildYieldSet(ysParams({ otherIncomeKrw: 500_000 }));
    const without = buildYieldSet(ysParams());
    expect(withOther.grossYieldInclOtherIncome).not.toBeNull();
    expect(without.grossYieldInclOtherIncome).toBeNull();

    const a = await renderA23(withOther);
    expect(a.texts).toContain(YIELD_LABELS.grossNetOfDeposit);
    expect(a.texts).toContain(YIELD_LABELS.grossInclOtherIncome);
    expect(a.texts).toContain(`${withOther.grossYieldInclOtherIncome!.toFixed(2)}%`);
    // 헤드라인은 V04 그대로 (기타수입 합산 아님)
    expect(a.texts).toContain(`${withOther.grossYieldNetOfDeposit!.toFixed(2)}%`);

    const b = await renderA23(without);
    expect(b.texts).not.toContain(YIELD_LABELS.grossInclOtherIncome);
  });

  it('market_rent 안정화 수익률도 캡션(M5~M7 출처 인용)을 표기한다', async () => {
    const ys = buildYieldSet(ysParams({ marketRent: { ...J, ...SRC } }));
    expect(ys.stabilized?.kind).toBe('market_rent');
    const r = await renderA23(ys);
    expect(r.texts).toContain(YIELD_LABELS.stabilizedMarketRent);
    expect(r.texts.some(t => t.startsWith('◇ 분석가정:') && t.includes('호가 2025-05'))).toBe(true);
  });

  it('NEGATIVE: reserve_excluded 는 캡션 없음 (시세 임대를 가정하지 않는다)', async () => {
    const ys = buildYieldSet(ysParams({ vacancyReservePct: 5, floorLeases: [leased] }));
    if (ys.stabilized) expect(ys.stabilized.kind).toBe('reserve_excluded');
    const r = await renderA23(ys);
    expect(r.texts.some(t => t.startsWith('◇ 분석가정:'))).toBe(false);
  });

  it('모든 도형이 SAFE_BOTTOM(6.75") 이내 — V05·캡션 동시 표기에도 넘치지 않는다', async () => {
    const ys = buildYieldSet(ysParams({ otherIncomeKrw: 500_000, marketRent: { ...J, ...SRC }, noiCapRatePct: 0.4, opexPct: 18, opexSource: 'assumed', vacancyReservePct: 5 }));
    const r = await renderA23(ys);
    for (const b of r.bottoms) expect(b).toBeLessThanOrEqual(6.76);
  });
});

describe('요약(A02 입력) ↔ A23 — 같은 지표는 같은 값·같은 이름 (Q1)', () => {
  const body: Record<string, any> = {
    preset: 'credeal_basic',
    heroCard: { posture: 'income', preset: 'credeal_basic', capRateBase: 0.41, opexPct: 18, opexSource: 'assumed', vacancyReservePct: 5, yieldBasis: 'NOI', noiBaseBil: 0.4 },
    ssot_summary: { asking_price_manwon: 1_000_000, total_deposit_manwon: 10_000, monthly_rent_total_krw: 5_000_000 },
    financials: { annualRentBil: 0.6, depositKrw: 100_000_000, opexPct: 18, opexSource: 'assumed', vacancyReservePct: 5, noiBaseKrw: 40_000_000 },
    floor_leases: [
      { floor: '1F', tenant_type: '카페', area_sqm: 100, rent_manwon: 500, deposit_manwon: 10000 },
      { floor: '2F', tenant_type: '공실', is_vacant: true, area_sqm: 50 },
    ],
    rent_roll_meta: { area_input_unit: 'pyeong' },
  };

  it('헤드라인 카드 = V04 (YieldSet) · 라벨 = YIELD_LABELS.grossNetOfDeposit · NOI Cap Rate 는 부제', () => {
    const out = buildSummaryFromOverview('', [], body) as any;
    const ys = buildYieldSetFromBody(body);
    const card = (out.metrics as any[]).find(m => m.label === YIELD_LABELS.grossNetOfDeposit);
    expect(card).toBeTruthy();
    expect(card.value).toBe(`${ys.grossYieldNetOfDeposit!.toFixed(2)}%`);
    expect(card.sub).toContain(YIELD_LABELS.noiCapRate);
    expect(card.sub).toContain('운영비 18% 가정');
    // 수익률 카드는 한 장 (NOI 카드와 중복 표기 금지)
    expect((out.metrics as any[]).filter(m => /수익률|Cap Rate/.test(m.label))).toHaveLength(1);
    // G38: GPI 기준 헤드라인은 공제 항목 없이 유효
    expect(out._yield).toMatchObject({ basis: 'GPI', denominator: 'net_of_deposit' });
    expect(out._yield.value).toBeCloseTo(ys.grossYieldNetOfDeposit!, 5);
  });

  it('A23 헤드라인과 요약 카드의 값·이름이 동일', async () => {
    const out = buildSummaryFromOverview('', [], body) as any;
    const ys = buildYieldSetFromBody(body);
    const card = (out.metrics as any[]).find(m => m.label === YIELD_LABELS.grossNetOfDeposit);
    const r = await renderA23(ys);
    expect(r.texts).toContain(card.label);
    expect(r.texts).toContain(card.value);
  });

  it('공실 카드는 입력 단위(평)를 따른다', () => {
    const out = buildSummaryFromOverview('', [], body) as any;
    const vac = (out.metrics as any[]).find(m => m.label === '공실 현황');
    expect(vac.value).toMatch(/평/);
    expect(vac.value).not.toMatch(/㎡/);
  });
});

import { buildA22Props } from '@/domain/building/mobile-im/pptx/binder/archetype-builders';

describe('buildA22Props — 마크다운 머리글 단위 (§9.1)', () => {
  const md = (head: string[], rows: string[][]) => ({ headers: head, rows });
  it('임대면적(㎡) 머리글 값은 ㎡ 로 해석하고 areaInputUnit 을 전달한다 (3.3배 오독 방지)', () => {
    const t = md(['층', '용도', '임차인', '임대면적(㎡)'], [['2F', '사무실', 'A', '330.58']]);
    const out = buildA22Props('', [t as any], [], {});
    const f = out.stackingPlan[0];
    expect(f.leasableAreaM2).toBeCloseTo(330.58, 2);
    expect(f.leasableAreaPy).toBeCloseTo(100, 0);
    expect(out.areaInputUnit).toBe('sqm');
  });
  it('임대면적(평) 머리글은 평, rent_roll_meta 가 있으면 메타 우선', () => {
    const t = md(['층', '용도', '임차인', '임대면적(평)'], [['2F', '사무실', 'A', '100.00']]);
    const out = buildA22Props('', [t as any], [], { rent_roll_meta: { area_input_unit: 'pyeong' } });
    expect(out.stackingPlan[0].leasableAreaPy).toBeCloseTo(100, 2);
    expect(out.stackingPlan[0].leasableAreaM2).toBeCloseTo(330.58, 1);
    expect(out.areaInputUnit).toBe('pyeong');
  });
});

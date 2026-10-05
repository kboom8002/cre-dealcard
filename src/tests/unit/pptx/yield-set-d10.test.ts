/**
 * D10/D9 — 수익률 표기 정합성 (YieldSet) + 근거 없는 평가 문구 제거
 *
 * - YieldSet 산식 (만원→원 환산, 실제 공실·자가사용 면적, 목표임대료 부재)
 * - 요약 ↔ 수익률 슬라이드 패리티 (같은 지표 = 같은 값 + 같은 이름)
 * - A23: 각주 존재, 중립 문구(시장 평균 비교/평가·권고 없음), 레이아웃 경계
 * Rule 7: Negative Pair 의무.
 */
import { describe, it, expect } from 'vitest';
import pptxgen from 'pptxgenjs';
import AdmZip from 'adm-zip';
import {
  buildYieldSet,
  buildYieldSetFromBody,
  summarizeVacantOwnerUseArea,
  summaryCapRateSub,
  yieldFootnote,
  YIELD_LABELS,
} from '@/domain/building/mobile-im/yield-set';
import { calculateFinancials } from '@/domain/building/mobile-im/financials';
import {
  buildYieldFromHeroCard,
  yieldSummaryMetric,
} from '@/domain/building/mobile-im/pptx/yield-object';
import { normalizeSummaryLabel } from '@/domain/building/mobile-im/pptx/archetypes/a02-stat-grid';
import { buildA23YieldFormula } from '@/domain/building/mobile-im/pptx/archetypes/a23-yield-formula';
import { SAFE_BOTTOM } from '@/domain/building/mobile-im/pptx/imlib';

const PYEONG_PER_SQM = 0.3025;

const BASE = {
  annualRentKrw: 300_000_000, // 연 3억
  askingPriceKrw: 10_000_000_000, // 100억
  depositKrw: 1_000_000_000, // 10억 → 분모 90억
};

describe('D10 YieldSet — 산식', () => {
  it('① 총임대수익률(÷매매가) ② 임대수익률(÷(매매가−보증금)) ③ NOI Cap Rate', () => {
    const ys = buildYieldSet({ ...BASE, noiBaseKrw: 225_000_000 });
    expect(ys.grossYieldOnPrice).toBe(3.0);
    expect(ys.grossYieldNetOfDeposit).toBe(3.33); // 3억 ÷ 90억
    expect(ys.noiCapRate).toBe(2.25); // 2.25억 ÷ 100억
  });

  it('noiCapRatePct가 주어지면 그대로 사용 (요약 슬라이드 값과 동일)', () => {
    const ys = buildYieldSet({ ...BASE, noiBaseKrw: 225_000_000, noiCapRatePct: 2.29 });
    expect(ys.noiCapRate).toBe(2.29);
  });

  it('안정화(target_rent): 실제 공실 면적 × 목표임대료(만원/평/월 → 원) — 만원→원·월→연 환산', () => {
    const sqm100pyeong = 100 / PYEONG_PER_SQM; // ≈ 330.58㎡ = 100평
    const ys = buildYieldSet({
      ...BASE,
      vacancyReservePct: 5,
      floorLeases: [
        { floor: '1F', tenant_name: '카페', area_sqm: 200, rent_manwon: 1000 },
        { floor: '2F', is_vacant: true, area_sqm: sqm100pyeong },
      ],
      targetRentPerPyeongManwon: 10, // 평당 10만원/월
    });
    // 추가 임대료 = 100평 × 10만원 × 12개월 × 10,000원 = 1.2억 → (3억+1.2억) ÷ 90억 = 4.67%
    expect(ys.stabilized?.kind).toBe('target_rent');
    expect(ys.stabilized?.value).toBe(4.67);
    expect(ys.stabilized?.label).toBe('안정화 수익률');
    expect(ys.stabilized?.appliedAreaPyeong).toBe(100);
    expect(ys.stabilized?.caption).toBe('공실 100평을 목표임대료 평당 10만원으로 임대 가정 (중개인 입력)');
  });

  it('안정화(target_rent): 공실 + 자가사용 면적 합산, area_pyeong 직접 입력 허용', () => {
    const ys = buildYieldSet({
      ...BASE,
      floorLeases: [
        { floor: 'B1', is_vacant: true, area_pyeong: 40 },
        { floor: '3F', lease_state: '자가사용', area_pyeong: 20.5 },
        { floor: '2F', tenant_name: '의원', area_pyeong: 50 },
      ],
      targetRentPerPyeongManwon: 8.5,
    });
    expect(ys.stabilized?.kind).toBe('target_rent');
    // 60.5평 × 8.5 × 12 × 1만 = 61,710,000원 → (3억+0.6171억)/90억 = 4.019% → 4.02
    expect(ys.stabilized?.value).toBe(4.02);
    expect(ys.stabilized?.caption).toBe('공실·자가사용 60.5평을 목표임대료 평당 8.5만원으로 임대 가정 (중개인 입력)');
  });

  it('[Negative] 목표임대료 입력 없음 → 시세 임대 가정 금지, "공실충당 5% 제외 기준 (참고)" + 캡션 없음', () => {
    const ys = buildYieldSet({
      ...BASE,
      vacancyReservePct: 5,
      floorLeases: [{ floor: '2F', is_vacant: true, area_pyeong: 100 }],
    });
    expect(ys.stabilized?.kind).toBe('reserve_excluded');
    expect(ys.stabilized?.label).toBe('공실충당 5% 제외 기준 (참고)');
    expect(ys.stabilized?.caption).toBeNull();
    // 3억 ÷ 0.95 ÷ 90억 = 3.5088% → 3.51
    expect(ys.stabilized?.value).toBe(3.51);
  });

  it('[Negative] 공실 면적 미상(대용면적/면적 없음) → 목표임대료가 있어도 계산하지 않고 참고 기준으로', () => {
    const ys = buildYieldSet({
      ...BASE,
      vacancyReservePct: 5,
      floorLeases: [
        { floor: '2F', is_vacant: true, area_sqm: 300, area_sqm_is_proxy: true }, // 전용면적 복사 대용값
      ],
      targetRentPerPyeongManwon: 10,
    });
    expect(ys.stabilized?.kind).toBe('reserve_excluded');
    const area = summarizeVacantOwnerUseArea([{ is_vacant: true }]);
    expect(area.areaKnown).toBe(false);
  });

  it('[Negative] 공실·자가사용 없음(만실) + 목표임대료 입력 → target_rent 아님', () => {
    const ys = buildYieldSet({
      ...BASE,
      vacancyReservePct: 5,
      floorLeases: [{ floor: '1F', tenant_name: '카페', area_pyeong: 80 }],
      targetRentPerPyeongManwon: 10,
    });
    expect(ys.stabilized?.kind).toBe('reserve_excluded');
  });

  it('[Negative] 충당률·목표임대료 모두 없으면 안정화 행 없음 / 분모 ≤ 0이면 수익률 null', () => {
    expect(buildYieldSet({ ...BASE }).stabilized).toBeNull();
    const ys = buildYieldSet({ annualRentKrw: 1e8, askingPriceKrw: 5e9, depositKrw: 6e9, vacancyReservePct: 5 });
    expect(ys.grossYieldNetOfDeposit).toBeNull();
    expect(ys.stabilized).toBeNull();
  });
});

describe('D10 요약 부제 · 각주 문구', () => {
  it('opexSource에 따라 "가정"/"제공"', () => {
    expect(summaryCapRateSub({ opexPct: 18, opexSource: 'assumed', vacancyReservePct: 5 })).toBe('운영비 18% 가정 · 공실충당 5%');
    expect(summaryCapRateSub({ opexPct: 12.5, opexSource: 'user', vacancyReservePct: 5 })).toBe('운영비 12.5% 제공 · 공실충당 5%');
  });

  it('[Negative] 비율을 모르면 숫자를 지어내지 않는다', () => {
    expect(summaryCapRateSub({})).toBe('운영비·공실충당 차감 후');
    expect(summaryCapRateSub({ opexPct: null, vacancyReservePct: null })).not.toMatch(/\d+%/);
  });

  it('각주: 운영비율(가정/중개인 제공)·공실충당·보증금 승계·차감 전/후 정의', () => {
    const ys = buildYieldSet({ ...BASE, opexPct: 20, opexSource: 'assumed', vacancyReservePct: 5 });
    expect(yieldFootnote(ys.assumptions)).toBe('※ 운영비율 20%(가정), 공실충당 5%, 보증금 승계 가정. 임대수익률은 운영비 차감 전, Cap Rate는 차감 후.');
    const ys2 = buildYieldSet({ ...BASE, opexPct: 12, opexSource: 'user', vacancyReservePct: 5 });
    expect(yieldFootnote(ys2.assumptions)).toContain('운영비율 12%(중개인 제공)');
  });
});

/** 실제 FinancialCalculator 산출로 body 구성 (writer.ts heroCard 구성과 동일한 필드) */
function bodyFromRealFinancials(opts: { opexRatioPct?: number; floorLeases?: any[]; extras?: any } = {}) {
  const fin = calculateFinancials({
    posture: 'income',
    purchasePriceKrw: BASE.askingPriceKrw,
    monthlyRentKrw: BASE.annualRentKrw / 12,
    totalDepositManwon: BASE.depositKrw / 10_000,
    assetType: '근린상가',
    ...(opts.opexRatioPct != null ? { opexRatioPct: opts.opexRatioPct } : {}),
  });
  const grossKrw = Number(fin.annualRentBil) * 1e8;
  const heroCard = {
    capRateBase: fin.capRate?.base,
    noiBaseBil: parseFloat((fin.annualNoi.base / 1e8).toFixed(1)),
    yieldBasis: 'NOI',
    noiDeductions: [{ name: '공실·운영비', amount: Math.round(grossKrw - fin.annualNoi.base) }],
    opexPct: fin.opexPct,
    opexSource: fin.opexSource,
    vacancyReservePct: fin.vacancyReservePct,
  };
  return {
    fin,
    heroCard,
    body: {
      financials: fin,
      heroCard,
      ssot_summary: {
        asking_price_manwon: BASE.askingPriceKrw / 10_000,
        total_deposit_manwon: BASE.depositKrw / 10_000,
        monthly_rent_total_krw: BASE.annualRentKrw / 12,
      },
      floor_leases: opts.floorLeases,
      broker_extras: opts.extras,
    } as Record<string, any>,
  };
}

describe('D10 요약 ↔ 수익률 슬라이드 패리티', () => {
  it('FinancialOutputs가 NOI·운영비율·공실충당·보증금을 노출', () => {
    const { fin } = bodyFromRealFinancials();
    expect(fin.opexPct).toBe(20); // 근린상가 가정 운영비 20%
    expect(fin.opexSource).toBe('assumed');
    expect(fin.vacancyReservePct).toBeGreaterThan(0);
    expect(fin.depositKrw).toBe(BASE.depositKrw);
    expect(fin.noiBaseKrw).toBe(fin.annualNoi.base);
  });

  it('같은 지표 = 같은 값 + 같은 이름 (Cap Rate NOI: 요약 카드 == 수익률 슬라이드 행)', () => {
    const { body, heroCard, fin } = bodyFromRealFinancials();
    const ys = buildYieldSetFromBody(body);

    // 값
    expect(ys.noiCapRate).toBe(fin.capRate!.base);
    const summary = yieldSummaryMetric(buildYieldFromHeroCard(heroCard as any)!, heroCard as any);
    expect(summary.value).toBe(`${ys.noiCapRate!.toFixed(2)}%`);
    // 이름
    expect(normalizeSummaryLabel(summary.label)).toBe(YIELD_LABELS.noiCapRate);
    // 부제: 요약은 가정을 명시
    expect(summary.sub).toBe(`운영비 20% 가정 · 공실충당 ${fin.vacancyReservePct}%`);
  });

  it('A23 슬라이드 XML: 3행 라벨·값이 YieldSet과 일치, 요약 슬라이드와 같은 Cap Rate 이름·값', async () => {
    const { body, fin } = bodyFromRealFinancials();
    const ys = buildYieldSetFromBody(body);
    const xml = await renderA23({
      annualRent: BASE.annualRentKrw,
      totalDeposit: BASE.depositKrw,
      askingPrice: BASE.askingPriceKrw,
      capRateAsIs: ys.grossYieldNetOfDeposit,
      capRateStabilized: ys.stabilized?.value,
      stabilizedAssumption: ys.stabilized?.caption ?? undefined,
      yieldSet: ys,
    });
    expect(xml).toContain(YIELD_LABELS.grossNetOfDeposit);
    expect(xml).toContain(`${ys.grossYieldNetOfDeposit!.toFixed(2)}%`);
    expect(xml).toContain(YIELD_LABELS.noiCapRate);
    expect(xml).toContain(`${fin.capRate!.base.toFixed(2)}%`);
    expect(xml).toContain('공실충당 5% 제외 기준 (참고)');
    // 요약과 같은 NOI Cap Rate 값 문자열
    const summary = yieldSummaryMetric(buildYieldFromHeroCard(body.heroCard as any)!, body.heroCard as any);
    expect(xml).toContain(summary.value);
  });

  it('레거시 문서(D10 이전 financials: 운영비율·충당률 미기록)도 보존값에서 역산해 같은 값을 낸다', () => {
    const { body, fin } = bodyFromRealFinancials();
    const legacyFin: any = { ...fin };
    delete legacyFin.noiBaseKrw;
    delete legacyFin.opexPct;
    delete legacyFin.vacancyReservePct;
    delete legacyFin.depositKrw;
    const ys = buildYieldSetFromBody({ ...body, financials: legacyFin, heroCard: { capRateBase: fin.capRate!.base } });
    expect(ys.noiCapRate).toBe(fin.capRate!.base);
    expect(ys.assumptions.vacancyReservePct).toBe(fin.vacancyReservePct); // 1 − 임대수익률/공실충당 제외 수익률
    expect(ys.assumptions.opexPct).toBe(20); // (연 임대료×(1−충당) − NOI) ÷ 연 임대료
    expect(ys.assumptions.depositKrw).toBe(BASE.depositKrw);
  });

  it('중개인 제공 운영비율(opexRatioPct)이면 opexSource=user → 부제 "제공"', () => {
    const { heroCard, body } = bodyFromRealFinancials({ opexRatioPct: 12 });
    expect(buildYieldSetFromBody(body).assumptions.opexSource).toBe('user');
    expect(yieldSummaryMetric(buildYieldFromHeroCard(heroCard as any)!, heroCard as any).sub).toContain('운영비 12% 제공');
  });

  it('broker_extras.target_rent_per_pyeong_manwon이 body에 있으면 읽고, 없거나 필드 자체가 없어도 안전', () => {
    const leases = [{ floor: '2F', is_vacant: true, area_pyeong: 100 }];
    const withTarget = buildYieldSetFromBody(bodyFromRealFinancials({ floorLeases: leases, extras: { target_rent_per_pyeong_manwon: 10 } }).body);
    expect(withTarget.stabilized?.kind).toBe('target_rent');
    const noExtras = buildYieldSetFromBody(bodyFromRealFinancials({ floorLeases: leases }).body);
    expect(noExtras.stabilized?.kind).toBe('reserve_excluded');
    expect(() => buildYieldSetFromBody(undefined)).not.toThrow();
  });
});

/* ───────────────────────── A23 렌더 ───────────────────────── */

async function renderA23(data: Record<string, any>): Promise<string> {
  const pres = new pptxgen();
  buildA23YieldFormula({ pres, slideNum: 7, docno: 'DOC-D10', data, grade: 'B', provenance: {} });
  const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
  const zip = new AdmZip(buffer);
  return zip.getEntries().find((e) => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';
}

interface Box { text: string; top: number; bottom: number }
function parseBoxes(xml: string): Box[] {
  const out: Box[] = [];
  for (const m of xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)) {
    const body = m[1];
    const off = body.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    if (!off) continue;
    const y = Number(off[2]) / 914400;
    const h = Number(off[4]) / 914400;
    const text = [...body.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join('');
    out.push({ text, top: y, bottom: y + h });
  }
  return out;
}

const HISTORY = {
  history: Array.from({ length: 10 }, (_, i) => ({ year: String(2016 + i), pricePerSqm: 10_000_000 + i * 600_000 })),
  latestPricePerSqm: 15_400_000,
  cagrPct: 5.2,
  totalGrowthPct: 54,
};

describe('D9 — A23 하단 문구: 근거 없는 시장 비교·평가·권고 제거', () => {
  const FORBIDDEN = ['시장 평균', '시장 평균 하회', '평균 수준', '양호한 수준', '검토 필요', '서울 소형빌딩', '4.5~5.5%', '토지가치 보존력', '감가 리스크'];

  for (const cap of [2.29, 4.8, 7.5]) {
    it(`임대수익률 ${cap}% — 어떤 구간이든 시장 평균 비교/평가 문구 없음 (총수익률을 NOI 평균과 비교하던 임계값 삭제)`, async () => {
      const xml = await renderA23({
        annualRent: BASE.annualRentKrw, totalDeposit: BASE.depositKrw, askingPrice: BASE.askingPriceKrw,
        capRateAsIs: cap, landPriceHistory: HISTORY, landAreaSqm: 400,
      });
      for (const w of FORBIDDEN) expect(xml).not.toContain(w);
      // 계산된 사실만: 수치 + 산출 기준
      expect(xml).toContain(`임대수익률 ${cap.toFixed(2)}% (운영비 차감 전)`);
    });
  }

  it('공시지가 CAGR·토지 비중은 계산값으로만 서술 (방향은 부호로, 평가어 없음)', async () => {
    const xml = await renderA23({
      annualRent: BASE.annualRentKrw, totalDeposit: BASE.depositKrw, askingPrice: BASE.askingPriceKrw,
      capRateAsIs: 3.33, landPriceHistory: HISTORY, landAreaSqm: 400,
    });
    expect(xml).toContain('10년간 개별공시지가 연평균 5.2% 상승');
    expect(xml).toMatch(/매매가 대비 토지 가치 비중 \d+\.\d%/);
    const down = await renderA23({
      annualRent: BASE.annualRentKrw, totalDeposit: BASE.depositKrw, askingPrice: BASE.askingPriceKrw,
      capRateAsIs: 3.33, landPriceHistory: { ...HISTORY, cagrPct: -1.2 }, landAreaSqm: 0,
    });
    expect(down).toContain('연평균 1.2% 하락');
    expect(down).not.toContain('매매가 대비 토지 가치 비중'); // 근거(대지면적) 없는 불릿은 생략
  });

  it('[Negative Pair] 근거가 전혀 없으면 콜아웃 불릿은 수익률 사실만 (공시지가·토지 비중 불릿 없음)', async () => {
    const xml = await renderA23({
      annualRent: BASE.annualRentKrw, totalDeposit: BASE.depositKrw, askingPrice: BASE.askingPriceKrw, capRateAsIs: 3.33,
    });
    expect(xml).not.toContain('개별공시지가 연평균');
    expect(xml).not.toContain('토지 가치 비중');
  });

  it('중개인 시세(토지 평당가)는 출처 표기하여 사실 서술에만 사용, 필드 없으면 생략', async () => {
    const withComps = await renderA23({
      annualRent: BASE.annualRentKrw, totalDeposit: BASE.depositKrw, askingPrice: BASE.askingPriceKrw, capRateAsIs: 3.33,
      marketComps: [{ kind: 'transaction', location: '성수동1가', land_price_per_pyeong_manwon: 9500 }, { kind: 'listing', location: '성수동2가', price_eok: 80 }],
    });
    expect(withComps).toContain('중개인 제공 인근 시세');
    expect(withComps).toContain('성수동1가 토지 평당 9,500만원(실거래)');
    expect(withComps).not.toContain('성수동2가'); // 평당가가 없는 시세는 제외
    const without = await renderA23({
      annualRent: BASE.annualRentKrw, totalDeposit: BASE.depositKrw, askingPrice: BASE.askingPriceKrw, capRateAsIs: 3.33,
    });
    expect(without).not.toContain('중개인 제공 인근 시세');
  });
});

describe('D10 — A23 안정화 라벨 정직성 / 각주 / 레이아웃', () => {
  const bodyData = () => {
    const { body } = bodyFromRealFinancials();
    return buildYieldSetFromBody(body);
  };

  it('목표임대료 없음 → 허위 캡션("인근 동일 용도 시세 수준으로 임대 가정") 없이 참고 라벨', async () => {
    const ys = bodyData();
    const xml = await renderA23({
      annualRent: BASE.annualRentKrw, totalDeposit: BASE.depositKrw, askingPrice: BASE.askingPriceKrw,
      capRateAsIs: ys.grossYieldNetOfDeposit, capRateStabilized: ys.stabilized?.value, stabilizedAssumption: undefined, yieldSet: ys,
    });
    expect(xml).toContain('공실충당 5% 제외 기준 (참고)');
    expect(xml).not.toContain('인근 동일 용도');
    expect(xml).not.toContain('시세 수준으로 임대');
    expect(xml).not.toContain('◇ 분석가정');
  });

  it('목표임대료 + 실제 공실 면적 → 캡션 "공실 N평을 목표임대료 평당 X만원으로 임대 가정 (중개인 입력)"', async () => {
    const { body } = bodyFromRealFinancials({
      floorLeases: [{ floor: '2F', is_vacant: true, area_pyeong: 100 }],
      extras: { target_rent_per_pyeong_manwon: 10 },
    });
    const ys = buildYieldSetFromBody(body);
    const xml = await renderA23({
      annualRent: BASE.annualRentKrw, totalDeposit: BASE.depositKrw, askingPrice: BASE.askingPriceKrw,
      capRateAsIs: ys.grossYieldNetOfDeposit, capRateStabilized: ys.stabilized?.value, stabilizedAssumption: ys.stabilized?.caption ?? undefined, yieldSet: ys,
    });
    expect(xml).toContain('안정화 수익률');
    expect(xml).toContain('◇ 분석가정: 공실 100평을 목표임대료 평당 10만원으로 임대 가정 (중개인 입력)');
    expect(xml).toContain(`${ys.stabilized!.value.toFixed(2)}%`);
  });

  it('각주(8pt): 운영비율·공실충당·보증금 승계·차감 전/후 — YieldSet 있을 때와 없을 때 모두 존재', async () => {
    const ys = bodyData();
    const xml = await renderA23({
      annualRent: BASE.annualRentKrw, totalDeposit: BASE.depositKrw, askingPrice: BASE.askingPriceKrw, capRateAsIs: 3.33, yieldSet: ys,
    });
    expect(xml).toContain('※ 운영비율 20%(가정), 공실충당');
    expect(xml).toContain('보증금 승계 가정. 임대수익률은 운영비 차감 전, Cap Rate는 차감 후.');
    const legacy = await renderA23({ annualRent: BASE.annualRentKrw, totalDeposit: BASE.depositKrw, askingPrice: BASE.askingPriceKrw, capRateAsIs: 3.33 });
    expect(legacy).toContain('임대수익률은 운영비 차감 전');
    expect(legacy).not.toContain('Cap Rate (NOI 기준)'); // NOI 값이 없으면 행 자체를 숨김 (라벨 혼용 금지)
  });

  it('최대 구성(3행+캡션+KPI 6행+콜아웃 3줄)에서도 카드/콜아웃이 각주 위에서 끝나고 각주는 SAFE_BOTTOM 안', async () => {
    const { body } = bodyFromRealFinancials({
      floorLeases: [{ floor: '2F', is_vacant: true, area_pyeong: 100 }],
      extras: { target_rent_per_pyeong_manwon: 10 },
    });
    const ys = buildYieldSetFromBody(body);
    const xml = await renderA23({
      annualRent: BASE.annualRentKrw, totalDeposit: BASE.depositKrw, askingPrice: BASE.askingPriceKrw,
      capRateAsIs: ys.grossYieldNetOfDeposit, capRateStabilized: ys.stabilized?.value, stabilizedAssumption: ys.stabilized?.caption ?? undefined,
      yieldSet: ys, landPriceHistory: HISTORY, landAreaSqm: 400,
      marketComps: [{ kind: 'transaction', location: '성수동1가', land_price_per_pyeong_manwon: 9500 }],
    });
    const boxes = parseBoxes(xml);
    const foot = boxes.find((b) => b.text.startsWith('※ 운영비율'));
    expect(foot).toBeDefined();
    expect(foot!.bottom).toBeLessThanOrEqual(SAFE_BOTTOM + 0.005);
    const above = boxes.filter((b) => b !== foot && b.top < foot!.top - 0.001 && b.top >= 1.3);
    for (const b of above) expect(b.bottom).toBeLessThanOrEqual(foot!.top + 0.01);
    // 수익률 3행이 모두 같은 다크 박스 안: 값 텍스트가 존재
    expect(xml).toContain(YIELD_LABELS.grossNetOfDeposit);
    expect(xml).toContain(YIELD_LABELS.noiCapRate);
  });
});

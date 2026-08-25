/**
 * parity.spec.ts — 수치 동일성 시험
 *
 * Python 참조구현(`credeal/`)과 TypeScript 운영 구현이 **같은 입력에서
 * 같은 값**을 내는지 봅니다. 기준표는 `parity.golden.json` 이고
 * `credeal/make_parity.py` 가 생성합니다.
 *
 * 🔴 이 시험이 없으면 포팅은 "옮겼다고 믿는 것"에 그칩니다.
 *    반올림 한 자리 차이로 IM 두 벌이 서로 다른 수익률을 말하게 됩니다.
 *
 * 실행:
 *    npm run test:parity
 * 기준표 갱신 (Python 쪽을 고쳤을 때만):
 *    python3 credeal/make_parity.py
 */

import { describe, expect, it } from 'vitest';
import golden from './parity.golden.json';
import { buildCore, fmtMoney } from '../src/im/core';
import type { MetricKey } from './im-core';
import { loadFixture } from '../src/im/fixtures';

/** 수치 허용 오차. 0 이 아닌 이유는 부동소수 표현 차이뿐입니다. */
const EPS = 1e-6;

type GoldenCase = (typeof golden)['cases'][number];

function near(actual: number, expected: number, label: string) {
  const d = Math.abs(actual - expected);
  expect(d, `${label}: TS ${actual} vs PY ${expected} (차이 ${d})`)
    .toBeLessThanOrEqual(EPS);
}

describe.each(golden.cases as GoldenCase[])(
  '$fixture $edition',
  (g) => {
    const core = buildCore(loadFixture(g.fixture, g.edition));

    // ── 해상도 ──────────────────────────────────────────────────────
    it('해상도 L×P 가 일치한다', () => {
      const r = core.resolution;
      expect(r.L).toBe(g.resolution.L);
      expect(r.P).toBe(g.resolution.P);
    });

    // ── 원장 합계 ───────────────────────────────────────────────────
    // 여기가 틀리면 그 위의 모든 지표가 틀립니다. 가장 먼저 봅니다.
    it('원장 합계가 일치한다', () => {
      expect(core.input.rentRoll.length).toBe(g.rentroll_rows);
      near(core.ledgerSumDeposit(), g.ledger.deposit, '보증금 합');
      near(core.ledgerSumRent(), g.ledger.rent, '월세 합');
      if (g.ledger.area !== null) {
        near(core.ledgerSumArea() as number, g.ledger.area, '면적 합');
      }
    });

    // ── 표시 문자열 ─────────────────────────────────────────────────
    // 🔴 값이 아니라 **문자열**입니다. '2.2449%' 와 '2.24%' 는 값으로는
    //    같지만 화면에서는 다릅니다. 단위 전환 임계도 여기서 걸립니다.
    it('금액 표기가 문자 단위로 일치한다', () => {
      expect(fmtMoney(core.input.priceKrw)).toBe(g.display.price_eok);
      expect(fmtMoney(g.ledger.rent)).toBe(g.display.rent_man);
    });

    // ── 지표 ────────────────────────────────────────────────────────
    // 🔴 golden 의 키를 그대로 metric() 에 넘깁니다. 매핑표를 두지 않습니다.
    it.each(Object.entries(g.metrics))('지표 %s', (key, exp) => {
      const v = core.metric(key as MetricKey);

      if (!exp.present) {
        // 없는 값을 0 이나 추정치로 채우면 여기서 걸립니다.
        expect(v.value, `${key} 는 값이 없어야 합니다`).toBeNull();
        return;
      }
      expect(v.value, `${key} 값이 없습니다`).not.toBeNull();
      near(v.value as number, exp.value!, key);
      // basis 는 화면에 그대로 나가는 문장입니다. 한 글자도 다르면 안 됩니다.
      expect((v as { basis: string }).basis, `${key} basis`).toBe(exp.basis);
    });

    it('golden 의 지표 키가 MetricKey 를 벗어나지 않는다', () => {
      // 기준표에 키가 늘었는데 타입을 안 고치면 여기서 걸립니다.
      for (const key of Object.keys(g.metrics)) {
        expect(() => core.metric(key as MetricKey)).not.toThrow();
      }
    });

    // ── 레버리지 ────────────────────────────────────────────────────
    it('LTV 3안이 일치한다', () => {
      const rows = core.leverageTable();
      expect(rows.length).toBe(g.ltv_rows.length);
      rows.forEach((r, i) => {
        const e = g.ltv_rows[i];
        near(r.ltv, e.ltv, `ltv[${i}].ltv`);
        near(r.loanKrw, e.loan, `ltv[${i}].loan`);
        near(r.equityKrw, e.equity, `ltv[${i}].equity`);
        near(r.monthlyNetCashKrw, e.monthly_net, `ltv[${i}].monthly_net`);
        if (e.roe !== null) near(r.roe.value as number, e.roe, `ltv[${i}].roe`);
      });
    });

    it('역레버리지 판정과 ROE 상한이 일치한다', () => {
      expect(core.negativeLeverage()).toBe(g.negative_leverage);
      const rows = core.leverageTable();
      const ceiling = g.metrics.roe_ceiling;
      // 무차입 ROE 를 넘는 레버리지 ROE 는 존재할 수 없습니다.
      if (ceiling.present) {
        // 역레버리지 구간에서 어떤 ROE 도 무차입 ROE 를 넘지 않습니다.
        for (const r of rows) {
          if (r.roe.value === null) continue;
          expect(r.roe.value as number).toBeLessThanOrEqual(ceiling.value! + EPS);
        }
      }
    });

    // ── 게이트 ──────────────────────────────────────────────────────
    it('게이트 판정이 일치한다', () => {
      expect(core.blockingGates().sort()).toEqual([...g.gates_blocking].sort());
      expect(core.warningGates().sort()).toEqual([...g.gates_warning].sort());
    });

    // ── 블록 게이팅 ─────────────────────────────────────────────────
    // 이것이 어긋나면 모바일과 PPTX 에 서로 다른 항목이 나옵니다.
    it('열린 블록 집합이 일치한다', () => {
      const open = Object.entries(core.blocks())
        .filter(([, b]) => b.open)
        .map(([k]) => k)
        .sort();
      expect(open).toEqual([...g.blocks_open].sort());
    });

    it('잠긴 블록의 사유 문장이 일치한다', () => {
      const locked = Object.fromEntries(
        Object.entries(core.blocks())
          .filter(([, b]) => !b.open)
          .map(([k, b]) => [k, b.lockedMsg ?? '']),
      );
      expect(locked).toEqual(g.blocks_locked);
    });

    // ── 표지 ────────────────────────────────────────────────────────
    it('Hero 3지표가 라벨·값·근거까지 일치한다', () => {
      expect(core.hero()).toEqual(g.hero);
    });

    it('한 줄 정의가 일치하고 25자를 넘지 않는다', () => {
      expect(core.oneLiner()).toBe(g.one_liner);
      expect(core.oneLiner().length).toBeLessThanOrEqual(25);
    });

    it('출처 칩이 일치한다', () => {
      expect(core.sourceChips()).toEqual(g.source_chips);
    });

    // ── 결손 ────────────────────────────────────────────────────────
    // 결손은 사라지지 않고 확인사항으로 이동합니다 (불변조건 13).
    it('결손 목록이 일치한다', () => {
      expect(core.deficiencies()).toEqual(g.deficiencies);
    });

    // ── 만료 ────────────────────────────────────────────────────────
    it('호실별 만료 판정이 일치한다', () => {
      // 기준일을 고정하지 않으면 시험이 날마다 달라집니다.
      const REF = new Date('2026-08-24T00:00:00Z');
      const got = core.input.rentRoll.map((r) => ({
        unit: r.unit ?? r.floor,
        state: core.expiryStateOf(r, REF),
      }));
      expect(got).toEqual(g.expiry);
    });

    // ── 필지·제척 (D22-8) ───────────────────────────────────────────
    // 🔴 필지가 없는 물건에서는 land() 가 null 이어야 합니다.
    //    빈 요약을 돌려주면 "1필지 · 제척 0" 이 IM 에 나타납니다.
    if (!('land' in g)) {
      it('필지가 없으면 land() 는 null 이다', () => {
        expect(core.land()).toBeNull();
        expect(core.landLayout().L10).toBe(false);
        expect(core.landLayout().L11).toBe(false);
      });
    } else {
      const gl = g.land!;

      it('P01~P04 가 일치한다', () => {
        const L = core.land()!;
        expect(L.count).toBe(gl.count);
        near(L.ledgerAreaSqm, gl.ledger_area, 'P04 대장 합');
        near(L.ownedAreaSqm, gl.owned_area, '지분 반영');
        near(L.excludedAreaSqm, gl.excluded_area, '제척 합');
        near(L.effectiveAreaSqm, gl.effective_area, 'P01 유효');
        near(L.exclusionImpactPct, gl.exclusion_impact_pct, 'P03 영향도');
      });

      it('P02 유효 용적률이 대장 용적률보다 높다', () => {
        const L = core.land()!;
        near(L.ledgerFarPct as number, gl.ledger_far_pct!, '대장 FAR');
        near(L.effectiveFarPct as number, gl.effective_far_pct!, 'P02 유효 FAR');
        // 제척이 있으면 유효 대지가 작아지므로 용적률은 올라갑니다.
        if (gl.excluded_area > 0) {
          expect(L.effectiveFarPct as number)
            .toBeGreaterThan(L.ledgerFarPct as number);
        }
      });

      it('필지별 지분·제척·유효가 일치한다', () => {
        const ps = core.input.parcels ?? [];
        expect(ps.length).toBe(gl.parcels.length);
        ps.forEach((p, i) => {
          const e = gl.parcels[i];
          expect(p.jibun).toBe(e.jibun);
          near(p.areaSqm, e.area, `${e.jibun}.area`);
          expect(p.exclusions.length).toBe(e.exclusions.length);
        });
      });

      it('X05 — 필지 합 = 공부 대지면적', () => {
        const x = core.crosscheck().find((r) => r.code === 'X05');
        if (gl.x05 === null) {
          expect(x).toBeUndefined();
          return;
        }
        expect(x, 'X05 가 없습니다').toBeDefined();
        near(x!.expected, gl.x05.expected, 'X05 필지 합');
        near(x!.actual, gl.x05.actual, 'X05 공부 대지');
        expect(x!.pass).toBe(gl.x05.ok);
      });

      it('G12 판정이 일치한다', () => {
        expect(core.blockingGates().filter((c) => c === 'G12'))
          .toEqual(gl.g12.filter((m: string) => m.includes('G12')).length
            ? ['G12'] : []);
      });

      it('L10·L11·L12 가 일치한다', () => {
        expect(core.landLayout()).toEqual(gl.layout);
      });

      it('한시 완화 임계 이탈 판정이 일치한다', () => {
        const rc = core.reliefCross();
        if (gl.relief_cross === null) {
          expect(rc).toBeNull();
          return;
        }
        expect(rc, '이탈을 놓쳤습니다').not.toBeNull();
        near(rc!.thresholdPct, gl.relief_cross.threshold_pct, '임계');
        near(rc!.effectiveFarPct, gl.relief_cross.effective_far_pct, '유효 FAR');
      });

      it('L12 — 부록은 언제나 전체다', () => {
        const zv = core.zoningView();
        expect(zv).toEqual(g.zoning_view);
        // 🔴 고르는 것은 강조이지 감춤이 아닙니다.
        expect(zv.부록.length)
          .toBeGreaterThanOrEqual(zv.본문.length + zv.접기.length
            - zv.접기.filter((x) => x.includes('관련도 미등록')).length);
      });
    }

    // ── 교차검증 ────────────────────────────────────────────────────
    // 🔴 'crosscheck' in g 로 쓰면 값이 null 인 경우를 통과시켜 버립니다.
    if (g.crosscheck) {
      it('X01~X04 결과가 일치한다', () => {
        const got = core.crosscheck().map((r) => ({
          code: r.code,
          expected: Number(r.expected.toFixed(4)),
          actual: Number(r.actual.toFixed(4)),
          tol_pct: r.tolerancePct,
          delta_pct: Number(r.deltaPct.toFixed(4)),
        }));
        expect(got).toEqual(g.crosscheck);
      });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════
// 불변조건 — 픽스처와 무관하게 항상 참이어야 합니다
// ═══════════════════════════════════════════════════════════════════════

describe('불변조건', () => {
  it('운영비 없이 NOI 를 만들지 않는다 (1)', () => {
    for (const g of golden.cases) {
      const core = buildCore(loadFixture(g.fixture, g.edition));
      // 픽스처 4건 모두 opexKrw 가 없으므로 noi 블록이 잠겨 있어야 합니다.
      expect(core.blocks().noi.open).toBe(false);
      expect(core.blocks().noi.lockedMsg).toBe(g.blocks_locked.noi);
      // gross 계열만 나옵니다 (불변조건 3).
      const gp = core.metric('gross_price') as { basis: string };
      expect(gp.basis).toContain('총임대료');
    }
  });

  it('basis 없는 수치를 만들 수 없다 (2)', () => {
    for (const g of golden.cases) {
      const core = buildCore(loadFixture(g.fixture, g.edition));
      for (const key of Object.keys(g.metrics)) {
        const v = core.metric(key as MetricKey);
        if (v.value !== null) {
          expect((v as { basis: string }).basis, key).toBeTruthy();
        }
      }
    }
  });

  it('실투자금은 매매가가 아니라 총취득원가에서 뺀다 (재무 단언)', () => {
    for (const g of golden.cases) {
      const core = buildCore(loadFixture(g.fixture, g.edition));
      const rows = core.leverageTable();
      const total = core.metric('total_acq_cost').value as number;
      const deposit = g.ledger.deposit;
      for (const r of rows) {
        near(r.equityKrw, total - deposit - r.loanKrw, `equity@LTV${r.ltv}`);
      }
    }
  });

  it('자가사용을 공실로 세지 않는다 (8)', () => {
    for (const g of golden.cases) {
      const core = buildCore(loadFixture(g.fixture, g.edition));
      const owner = core.input.rentRoll.filter((r) => r.occupancy === 'owner_occupied');
      if (owner.length === 0) continue;
      // 자가사용이 있는데도 공실률이 0 이어야 합니다.
      expect(core.vacancyByUnit().value).toBe(g.vacancy.by_unit.value);
    }
  });

  it('필지 없는 물건에 필지 요약을 만들지 않는다 (D22-8)', () => {
    for (const g of golden.cases) {
      if ('land' in g) continue;
      const core = buildCore(loadFixture(g.fixture, g.edition));
      expect(core.land()).toBeNull();
    }
  });

  it('제척 합계가 대지 합계를 넘으면 G12 로 막는다', () => {
    // 주입 시험 — 정상 픽스처만으로는 이 경로를 밟지 못합니다.
    const g = golden.cases.find((c) => 'land' in c)!;
    const core = buildCore(loadFixture(g.fixture, g.edition));
    const broken = structuredClone(core.input);
    broken.parcels![0].exclusions.push({
      kind: 'park', areaSqm: 99999, affectsFAR: true, provenance: 'broker',
    });
    expect(buildCore(broken).blockingGates()).toContain('G12');
  });

  it('지분 없는 공유지분은 전체 면적으로 세지 않는다', () => {
    const g = golden.cases.find((c) => 'land' in c)!;
    const core = buildCore(loadFixture(g.fixture, g.edition));
    const broken = structuredClone(core.input);
    broken.parcels![0].ownership = 'shared';
    delete broken.parcels![0].shareNumerator;
    // 🔴 조용히 전체 면적으로 세면 유효 대지가 부풀려집니다.
    expect(() => buildCore(broken).land()).toThrow();
  });

  it('렌트롤을 전량 표기한다 (18)', () => {
    for (const g of golden.cases) {
      const core = buildCore(loadFixture(g.fixture, g.edition));
      // 표에 들어가는 행 수 = 원장 행 수. 요약·상위 N 행을 쓰지 않습니다.
      expect(core.rentRollForDisplay().length).toBe(g.rentroll_rows);
    }
  });
});

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_parity.py — 수치 동일성 기준표를 뽑습니다.

Python 참조구현이 내는 **표시 문자열**을 그대로 JSON 으로 떨굽니다.
TypeScript 운영 구현은 같은 입력에서 같은 문자열을 내야 합니다.

값이 아니라 문자열을 대조하는 이유 — 값이 맞아도 반올림·자릿수·단위
전환 임계가 다르면 IM 두 벌이 서로 다른 숫자를 말합니다.
`2.2449%` 와 `2.24%` 는 값으로는 같지만 화면에서는 다릅니다.

사용:
    python3 make_parity.py            # ../contracts/parity.golden.json 생성
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import core as C                                            # noqa: E402
from core import eok, man, pct, sqm_pyeong                   # noqa: E402

OUT = HERE.parent / 'contracts' / 'parity.golden.json'


def show(v) -> dict | None:
    """Val 을 표시 문자열과 함께 직렬화합니다."""
    if v is None or getattr(v, 'value', None) is None:
        return {'present': False,
                'reason': getattr(v, 'reason', '값 없음') if v else '값 없음'}
    return {'present': True,
            'value': round(float(v.value), 6),
            'basis': v.basis,
            'source': getattr(v, 'source', None)}


# 만료 판정 기준일. 고정하지 않으면 시험이 날마다 달라집니다.
REF = date(2026, 8, 24)


def snapshot(fid: str, edition: str) -> dict:
    c = C.load(fid, edition=edition)
    L, P, _lack = c.resolution_pair()

    out: dict = {
        'fixture': fid,
        'edition': edition,
        'resolution': {'L': L, 'P': P},
        'rentroll_rows': len(c.rows),
        'ledger': {
            'deposit': c.ledger_sum_deposit,
            'rent': c.ledger_sum_rent,
            'mgmt': c.ledger_sum_mgmt,
            'area': c.ledger_sum_area,
        },
        'display': {
            'price_eok': eok(c.price),
            'price_man': man(c.price),
            'deposit_eok': eok(c.ledger_sum_deposit),
            'rent_man': man(c.ledger_sum_rent),
        },
        'metrics': {
            'acq_tax': show(c.acq_tax),
            'broker_fee': show(c.broker_fee),
            'total_acq_cost': show(c.total_acq_cost),
            'gross_price': show(c.gross_price),
            'gross_price_deposit': show(c.gross_price_deposit),
            'roe_ceiling': show(c.roe_ceiling),
            'first_floor_share': show(c.first_floor_share),
            'land_pyeong_price': show(c.land_pyeong_price),
            'gfa_pyeong_price': show(c.gfa_pyeong_price),
            'gfa_confirmed': show(c.gfa_confirmed),
            'far_headroom': show(c.far_headroom),
            'land_price_multiple': show(c.land_price_multiple),
            'land_price_total': show(c.land_price_total),
            'land_sqm': show(c.land_sqm),
        },
        'ltv_rows': [{k: (round(v, 6) if isinstance(v, float) else v)
                      for k, v in r.items()} for r in c.ltv_rows],
        'negative_leverage': c.negative_leverage,
        'gates_blocking': list(c.gates_blocking),
        'gates_warning': list(c.gates_warning),
        'deficiencies': list(c.deficiencies),
        'conv_deposit_rows': [
            {'unit': r.get('unitLabel'), 'val': show(c.conv_deposit(r))}
            for r in c.rows],
        'expiry': [{'unit': r.get('unitLabel'),
                    'state': c.expiry_state(r, REF)} for r in c.rows],
        'vacancy': {'by_unit': show(c.vacancy[0]), 'by_area': show(c.vacancy[1])},
        'state_counts': dict(c.state_counts),
        'hero': c.hero(),
        'one_liner': c.one_liner(),
        'source_chips': list(c.source_chips()),
        'blocks_open': sorted(k for k, (ok, _) in c.blocks().items() if ok),
        'blocks_locked': {k: why for k, (ok, why) in sorted(c.blocks().items())
                          if not ok},
        'area_conflict': c.area_conflict,
        'has_public': c.has_public,
    }
    # ── 필지·제척·토지이용 (D22-8) ──
    L = c.land
    if L:
        import parcel as PZ
        out['land'] = {
            'count': L.count,
            'ledger_area': round(L.ledger_area, 4),
            'owned_area': round(L.owned_area, 4),
            'excluded_area': round(L.excluded_area, 4),
            'effective_area': round(L.effective_area, 4),
            'exclusion_impact_pct': round(L.exclusion_impact_pct, 4),
            'ledger_far_pct': round(L.ledger_far_pct, 4) if L.ledger_far_pct else None,
            'effective_far_pct': (round(L.effective_far_pct, 4)
                                  if L.effective_far_pct else None),
            'parcels': [{'jibun': x.jibun, 'area': x.area,
                         'ownership': x.ownership,
                         'owned': round(x.owned_area, 4),
                         'excluded': round(x.excluded_area, 4),
                         'effective': round(x.effective_area, 4),
                         'exclusions': [{'kind': e.kind, 'area': e.area,
                                         'affects_far': e.affects_far,
                                         'provenance': e.provenance}
                                        for e in x.exclusions]}
                        for x in c.parcels],
            'x05': PZ.crosscheck_x05(c.parcels, c.land_sqm.value)
            if c.land_sqm.known else None,
            'g12': PZ.gate_g12(c.parcels, L),
            'layout': c.land_layout,
            'relief_cross': c.relief_cross,
        }
        out['zoning_view'] = c.zoning_view()
        out['buyer_purpose'] = c.buyer_purpose
    if c.has_public:
        import public_data as PD
        out['crosscheck'] = [
            {'code': r.code, 'expected': round(r.expected, 4),
             'actual': round(r.actual, 4), 'tol_pct': r.tol,
             'delta_pct': round(abs(r.expected - r.actual)
                                / max(abs(r.expected), 1e-9) * 100, 4)}
            for r in PD.crosscheck(fid)]
    return out


def main() -> int:
    data = {
        'meta': {
            'id': 'parity.golden',
            'version': 1,
            'note': ('Python 참조구현의 산출값입니다. TypeScript 구현이 같은 '
                     '입력에서 같은 값을 내야 합니다. 허용 오차 0 — '
                     '표시 문자열은 완전 일치, 수치는 소수 6자리까지 일치.'),
            'generator': 'credeal/make_parity.py',
        },
        'cases': [],
    }
    for fid in ('dangsan', 'yangpyeong'):
        for ed in ('R1', 'R2'):
            data['cases'].append(snapshot(fid, ed))
    # 다필지·제척 경로 — 합성 픽스처 (D22-8)
    data['cases'].append(snapshot('multiparcel', 'R2'))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2),
                   encoding='utf-8')
    n = len(data['cases'])
    print(f'  {OUT.name}  {n}건 · {OUT.stat().st_size / 1024:,.1f} KB')
    for c in data['cases']:
        m = sum(1 for v in c['metrics'].values() if v['present'])
        ln = (f'    {c["fixture"]:<12} {c["edition"]}  '
              f'{c["resolution"]["L"]}×{c["resolution"]["P"]}  '
              f'지표 {m}/{len(c["metrics"])} · 블록 {len(c["blocks_open"])}열림')
        if 'land' in c:
            L = c['land']
            ln += (f' · 필지 {L["count"]} · 유효 {L["effective_area"]:,.1f}㎡'
                   f' · FAR {L["ledger_far_pct"]:.1f}→{L["effective_far_pct"]:.1f}%')
        print(ln)
    return 0


if __name__ == '__main__':
    sys.exit(main())

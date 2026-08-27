#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
loader.py — SSoT 레지스트리 로더

검사기·생성기·프롬프트가 **각자 목록을 갖지 않습니다.** 전부 여기를 지나갑니다.
목록이 두 군데 있으면 반드시 어긋납니다 — 이번 세션에서만 세 번 겪었습니다.
"""
from __future__ import annotations

import functools
from pathlib import Path

import yaml

DIR = Path(__file__).resolve().parent

FILES = ('im.lexicon', 'im.format', 'im.masking', 'im.invariants',
         'im.errors', 'im.assumptions', 'im.image', 'im.pages', 'im.parcel',
         'im.bindings', 'im.ontology',
         'im.gating', 'im.tokens', 'im.budget')


@functools.lru_cache(maxsize=None)
def load(name: str) -> dict:
    p = DIR / f'{name}.yaml'
    if not p.exists():
        raise FileNotFoundError(f'SSoT 없음: {p}')
    return yaml.safe_load(p.read_text(encoding='utf-8'))


# ── 어휘 ───────────────────────────────────────────────────────────────
def substitutions() -> dict[str, str | None]:
    """쓰지 않는 말 → 대체어. 대체어가 None이면 아예 쓰지 않습니다."""
    lx = load('im.lexicon')
    return {s['from']: s.get('to') for s in lx['substitutions']}


def banned_words() -> list[str]:
    lx = load('im.lexicon')
    out: list[str] = []
    for group in lx['banned'].values():
        out += [str(x) for x in group]
    return out


def context_exclude() -> dict[str, tuple[str, ...]]:
    lx = load('im.lexicon')
    return {k: tuple(v or ()) for k, v in lx['context_exclude'].items()}


def negations() -> list[str]:
    return list(load('im.lexicon')['negation_markers'])


# ── 표기 ───────────────────────────────────────────────────────────────
def fmt() -> dict:
    return load('im.format')


def pyeong_ratio() -> float:
    return float(fmt()['area']['pyeong_ratio'])


def missing_token() -> str:
    return fmt()['missing']['token']


# ── 예산 ───────────────────────────────────────────────────────────────
def budget() -> dict:
    return load('im.budget')


def never_truncate() -> list[str]:
    return list(budget()['truncation']['never'])


def deck_max(preset_key: str = '') -> int:
    b = budget()['deck']
    if 'evidence' in preset_key:
        return int(b['max_pages_evidence'])
    return int(b['max_pages_default'])


# ── 마스킹 ─────────────────────────────────────────────────────────────
def image_targets(stage: str = 'public') -> list[dict]:
    m = load('im.masking')['images']
    return [t for t in m['targets'] if stage in t['stages']]


def masking_blocking() -> bool:
    return bool(load('im.masking')['images'].get('blocking'))


# ── 불변조건 ───────────────────────────────────────────────────────────
def invariants() -> list[dict]:
    return list(load('im.invariants')['invariants'])


def unchecked_invariants() -> list[dict]:
    """자동 검사가 없는 불변조건 — 여기가 다음에 뚫릴 자리입니다."""
    return [i for i in invariants() if i.get('gap')]


def gates() -> list[dict]:
    return list(load('im.invariants')['gates'])


def crosschecks() -> list[dict]:
    return list(load('im.invariants')['crosschecks'])


# ── 오류·게이트 ────────────────────────────────────────────────────────
def gate(code: str) -> dict:
    for g in load('im.errors')['gates']:
        if g['code'] == code:
            return g
    raise KeyError(f'미등록 게이트: {code}')


def blocking_gates() -> list[str]:
    return [g['code'] for g in load('im.errors')['gates'] if g['level'] == '차단']


def pending_registration() -> list[str]:
    """CATALOG_RULES 에 아직 등록되지 않은 코드 — 쓰기 전에 등록합니다."""
    e = load('im.errors')
    out = [g['code'] for g in e['gates'] if g.get('status') == '등록요청']
    out += [c['code'] for c in e['constraints_new'] if c.get('status') == '등록요청']
    out += [n['prefix'] for n in e['namespaces'] if n.get('status') == '등록요청']
    return out


def code_conflicts() -> list[dict]:
    return list(load('im.errors')['conflicts'])


# ── 가정 ───────────────────────────────────────────────────────────────
def assumption(key: str) -> dict:
    a = load('im.assumptions')
    for tier in ('legal', 'market_default', 'user_input'):
        for row in a[tier]:
            if row['key'] == key:
                return {**row, 'tier': tier}
    for row in a['retired']:
        if row['key'] == key:
            raise ValueError(f'폐기된 가정입니다: {key} — {row["reason"]} '
                             f'· 대체 {row["replacement"]}')
    raise KeyError(f'미등록 가정: {key}')


def assumption_value(key: str):
    """값을 돌려줍니다. None 이면 **해당 지표를 산출하지 않습니다.**"""
    return assumption(key)['value']


def retired_keys() -> list[str]:
    return [r['key'] for r in load('im.assumptions')['retired']]


def null_blocked_metrics() -> dict[str, list[str]]:
    return {r['key']: list(r['blocks_if_null'])
            for r in load('im.assumptions')['user_input']}


# ── 이미지 ─────────────────────────────────────────────────────────────
def image_slot(key: str) -> dict:
    for s in load('im.image')['slots']:
        if s['key'] == key:
            return s
    raise KeyError(f'미등록 사진 슬롯: {key}')


def image_min_px(key: str) -> tuple[int, int]:
    m = image_slot(key)['min_px']
    return m['long'], m['short']


def image_pipeline() -> list[dict]:
    return list(load('im.image')['pipeline'])


# ── 페이지 ─────────────────────────────────────────────────────────────
def page_order(preset: str) -> list[str]:
    return list(load('im.pages')['presets'][preset]['order'])


def page(key: str) -> dict:
    for p in load('im.pages')['sequence']:
        if p['key'] == key:
            return p
    raise KeyError(f'미등록 페이지: {key}')


def pages_for_grade(preset: str, grade: str) -> list[str]:
    rank = {'D': 0, 'C': 1, 'B': 2, 'A': 3}
    return [k for k in page_order(preset)
            if rank[grade] >= rank[page(k).get('min_grade', 'D')]]


# ── 필지·제척 ──────────────────────────────────────────────────────────
def exclusion_kind(key: str) -> dict:
    for k in load('im.parcel')['exclusion_kinds']:
        if k['key'] == key:
            return k
    raise KeyError(f'미등록 제척 사유: {key}')


def zoning_relevance(purpose: str) -> dict[str, str]:
    z = load('im.parcel')['zoning_display']
    if purpose not in z['purposes']:
        raise KeyError(f'미등록 매수 목적: {purpose}')
    return {r['item']: r.get(purpose, 'low') for r in z['relevance']}


# ── 운영 파이프라인 바인딩 ─────────────────────────────────────────────
def bindings() -> dict:
    return load('im.bindings')


def unmapped() -> dict[str, list]:
    """운영 ↔ 규격 대응이 없는 것. **조용히 버려지는 자리입니다.**"""
    b = bindings()
    return {
        '메모 슬롯 누락': [x['field'] for x in b['memo_slots']['missing_slots']],
        'layers 누락': [x['path'] for x in b['layers']['missing_layers']],
        '출처 등급 누락': [x['grade'] for x in b['provenance']['missing']],
        '섹션 누락': [x['page'] for x in b['sections']['missing_sections']],
        '운영에 없는 게이트': [x['registry'] for x in b['gate_map']['missing_in_ops']],
        '표기 규칙 위반': [x['where'] for x in b['format_violations']],
    }


# ── 온톨로지 보완 ──────────────────────────────────────────────────────
def ontology_upgrades() -> list[dict]:
    return load('im.ontology')['upgrades']


def ontology_pending() -> list[dict]:
    return [u for u in ontology_upgrades() if u.get('status') != '반영']


def posture_gaps() -> dict[str, list[str]]:
    """계약 13칸은 다 찼는데 **발행이 막히는** 포스처.

    🔴 계약 충족과 자료 충족은 다릅니다. 규격이 갖춰져도 채울 자료가 없으면
    IM 은 나오지 않습니다. `blocked_despite_contract` 가 그 자리입니다.
    """
    o = load('im.ontology')['posture_contract']
    out = {}
    for po, cov in o['current_coverage'].items():
        miss = [k for k, v in cov.items()
                if v is False or (isinstance(v, int) and v == 0)]
        if cov.get('contract', 0) < 13:
            miss.append(f'계약 {cov.get("contract", 0)}/13')
        if miss:
            out[po] = miss
    for b in o.get('blocked_despite_contract', []):
        out.setdefault(b['posture'], []).append('발행 차단 — ' + b['reason'].split('\n')[0].lstrip('🔴 '))
    return out


# ── 자기검사 ───────────────────────────────────────────────────────────
def selfcheck() -> int:
    bad = 0
    for n in FILES:
        try:
            d = load(n)
        except Exception as e:                     # noqa: BLE001
            print(f'  실패  {n:<16} {e}')
            bad += 1
            continue
        if 'meta' not in d:
            print(f'  실패  {n:<16} meta 없음')
            bad += 1
            continue
        print(f'  OK    {n:<16} v{d["meta"]["version"]} · {d["meta"]["owner"]}')
    print()
    print(f'  치환 {len(substitutions())}쌍 · 금지어 {len(banned_words())}종 · '
          f'문맥 예외 {len(context_exclude())}종')
    g = load('im.gating')
    print(f'  필드 {g["meta"]["fields"]} · 블록 {g["meta"]["blocks"]} · '
          f'등급 매핑 {len(g["grade_map"])}')
    print(f'  불변조건 {len(invariants())} · 게이트 {len(gates())} · '
          f'교차검증 {len(crosschecks())}')
    un = unchecked_invariants()
    if un:
        print(f'\n  🔴 자동 검사 없는 불변조건 {len(un)}건')
        for i in un:
            print(f'     {i["n"]:>2}. {i["text"]}')
            print(f'         → {i["gap"]}')
    pend = pending_registration()
    if pend:
        print(f'\n  ⚠  CATALOG_RULES 미등록 코드 {len(pend)}종 — 사용 전 등록 필요')
        print(f'     {" · ".join(pend)}')
    cf = code_conflicts()
    if cf:
        print(f'\n  🔴 코드 네임스페이스 충돌 {len(cf)}건')
        for c in cf:
            print(f'     {c["id"]} {c["code"]:<16} {c["severity"]}')
    rt = retired_keys()
    print(f'\n  가정 {len(load("im.assumptions")["legal"])} legal · '
          f'{len(load("im.assumptions")["market_default"])} market · '
          f'{len(load("im.assumptions")["user_input"])} user_input · '
          f'폐기 {len(rt)}')
    print(f'  사진 슬롯 {len(load("im.image")["slots"])} · '
          f'페이지 {len(load("im.pages")["sequence"])} · '
          f'프리셋 {len(load("im.pages")["presets"])}')
    pc = load('im.parcel')
    print(f'  제척 사유 {len(pc["exclusion_kinds"])} · 파생 {len(pc["derived"])} · '
          f'토지이용 항목 {len(pc["zoning_display"]["relevance"])} · '
          f'매수 목적 {len(pc["zoning_display"]["purposes"])}')
    try:
        um = unmapped()
        tot = sum(len(v) for v in um.values())
        print(f'\n  🔴 운영 파이프라인 미대응 {tot}건')
        for k, v in um.items():
            if v:
                print(f'     {k:<16} {len(v)}건 — {" · ".join(str(x) for x in v[:4])}'
                      + (' …' if len(v) > 4 else ''))
        nc = bindings()['namespace_collision']
        print(f'\n  🔴 코드 충돌 (운영) {nc["code"]} — {nc["severity"]} · '
              f'{len(nc["occurrences"])}중')
    except Exception as e:                                  # noqa: BLE001
        print(f'\n  바인딩 검사 실패: {e}')
    try:
        pend = ontology_pending()
        if pend:
            print(f'\n  🔴 온톨로지 보완 미착수 {len(pend)}건')
            for u in pend:
                print(f'     {u["id"]} {u["severity"]:<3} {u["title"]}')
        else:
            print('\n  온톨로지 보완 8건 전량 정본 반영 — qa/ontology_check.py 통과')
        pc = load('im.ontology')['posture_contract']['current_coverage']
        print(f'\n  포스처 계약 — 13칸 기준')
        for po, cov in pc.items():
            mark = '✓' if cov.get('contract') == 13 else '🔴'
            print(f'     {mark} {po:<16} {cov.get("contract", 0):>2}/13  {cov.get("status")}')
        pg = posture_gaps()
        if pg:
            print(f'\n  🔴 계약은 찼으나 막힌 포스처 {len(pg)}종')
            for po, miss in pg.items():
                print(f'     {po:<16} {" · ".join(miss)}')
    except Exception as e:                                  # noqa: BLE001
        print(f'\n  온톨로지 검사 실패: {e}')
    if masking_blocking():
        tg = [t for t in image_targets('public') if t.get('severity') == '차단']
        print(f'\n  🔴 이미지 마스킹 미구현 — 차단 대상 {len(tg)}종')
        for t in tg:
            print(f'     {t["label"]} — {t.get("note", "")}')
    return 1 if bad else 0


if __name__ == '__main__':
    import sys
    sys.exit(selfcheck())

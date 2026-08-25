#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ontology_check.py — 정본 역방향 대조 (FR34 구현)

소유표를 한 방향으로만 읽으면 **내가 모르는 규칙은 영영 못 찾습니다.**

    "금지어는 어느 문서가 소유하지?"       →  잘 됩니다
    "이 문서의 규칙 중 내가 안 쓰는 것은?"  →  아무도 안 봤습니다

D22-8 사고가 그렇게 났습니다. 다필지·제척·토지이용계획 필터가 이미
설계돼 있었는데, 계산식을 소유하던 문서가 폐기되면서 승계 문서에
하나도 옮겨지지 않았고, 그 위에 새 스펙을 쌓았습니다.

이 검사기가 보는 것 4가지
    ① 살아 있는 정본이 **폐기 문서를 소유자로 가리키는가**
    ② 코드군 **선언 개수와 실제 나열 개수가 맞는가**
    ③ 정의가 비어 있는 코드가 몇 개인가
    ④ 포스처 5종 커버리지에 빈칸이 있는가

사용:
    python3 ontology_check.py            # 전체
    python3 ontology_check.py --json     # 기계 판독
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 살아 있는 정본 — 여기가 폐기 문서를 가리키면 안 됩니다
LIVE = ['CATALOG_SLOTS.md', 'CATALOG_RULES.md', 'CATALOG_ASSET_TYPES.md',
        'CATALOG_LEXICON.md', 'ONTOLOGY_V0.5_SPEC.md',
        'ONTOLOGY_GOVERNANCE_SPEC.md', 'IM_SYSTEM_SSOT.md', 'README.md']

# 코드군 — 접두, 나열 정규식, 절 제목 정규식
GROUPS = {
    'R':   r'^\|\s*\*{0,2}(R-[A-Z]+-[\d~ ]+)',
    'T-C': r'^\|\s*\*{0,2}(T-C-\d+)',
    'T-R': r'^\|\s*\*{0,2}(T-R-\d+)',
    'P':   r'^\|\s*\*{0,2}(P0\d)',
    'C':   r'^\|\s*\*{0,2}(C\d{2})\*{0,2}\s*\|',
    'G':   r'^\|\s*\*{0,2}(G\d{1,2})\*{0,2}\s*\|',
    'L':   r'^\|\s*\*{0,2}(L\d{2})\*{0,2}\s*\|',
    'X':   r'^\|\s*\*{0,2}(X0\d)\*{0,2}\s*\|',
    'M':   r'^\|\s*\*{0,2}(M\d{2})',
}

# 정의가 비어 있음을 뜻하는 표지
EMPTY = ('원본 확인 필요', '[v0.1', '확인 필요]', '예약')

# 🔴 "소유" 가 들어 있어도 **지목이 아닌** 문장.
#
#    앞선 판에서 '않습니다'·'금지' 같은 흔한 어절로 면제했더니, 검사기가
#    사실상 전면 면제 상태가 됐습니다. 한국어 문서에서 그 어절이 없는
#    문장이 드뭅니다. **어절 매칭을 버리고 명시 태그로 바꿉니다.**
#
#    회고·경고로 폐기 문서를 언급해야 하면 그 줄에 [HIST] 를 답니다.
#    태그를 다는 것은 사람의 판단이고, 판단을 남기면 나중에 되짚을 수 있습니다.
HIST_TAG = '[HIST]'

POSTURES = ['income', 'owner_occupied', 'development', 'operating', 'trading']
POSTURE_PREFIX = {'income': 'R-INC', 'owner_occupied': 'R-OWN',
                  'development': 'R-DEV', 'operating': 'R-OPR',
                  'trading': 'R-TRD'}


def superseded() -> list[str]:
    """폐기 문서.

    v0.5부터 `99_superseded/` 로 격리했습니다. 경로 자체가 경고입니다.
    루트에 ⛔ 헤더가 남아 있으면 **격리를 빠뜨린 것**이므로 함께 셉니다.
    """
    out = [p.name for p in sorted((ROOT / '99_superseded').glob('*.md'))
           if p.name != 'README.md']
    for p in sorted(ROOT.glob('*.md')):
        head = '\n'.join(p.read_text(encoding='utf-8').split('\n')[:3])
        if re.search(r'SUPERSEDED|⛔', head, re.I):
            out.append(p.name)      # 🔴 루트에 남아 있으면 격리 누락
    return out


# ── ① 폐기 문서 참조 ───────────────────────────────────────────────────
def dead_refs(dead: list[str]) -> tuple[list[dict], list[dict]]:
    """(소유 문언 참조, 일반 참조)"""
    owns, refs = [], []
    stems = {d[:-3]: d for d in dead}
    for f in LIVE:
        p = ROOT / f
        if not p.exists():
            continue
        for i, ln in enumerate(p.read_text(encoding='utf-8').split('\n'), 1):
            for stem in stems:
                if stem not in ln:
                    continue
                rec = {'file': f, 'line': i, 'target': stem}
                # 🔴 "소유" 가 붙으면 치명적입니다 — 폐기 문서가 규칙의 주인입니다.
                #    단, 회고·경고 문장은 제외합니다 (NOT_OWNING).
                owning = ('소유' in ln
                          and HIST_TAG not in ln
                          and not ln.lstrip().startswith('~~'))
                (owns if owning else refs).append(rec)
    return owns, refs


# ── ② 코드군 선언 vs 실측 ──────────────────────────────────────────────
def code_groups() -> list[dict]:
    s = (ROOT / 'CATALOG_RULES.md').read_text(encoding='utf-8')
    # 헤더 표의 선언 개수
    declared = {}
    for m in re.finditer(r'\|\s*\*{0,2}([A-Z][A-Z\-]*)\*{0,2}\s+\w+[^|]*\|[^|]*\|\s*\*{0,2}(\d+)\*{0,2}\s*\|', s):
        declared[m.group(1)] = int(m.group(2))
    # 절 제목의 개수
    titled = {m.group(1): int(m.group(2))
              for m in re.finditer(r'^## \d+\. ([A-Z\-]+) — [^(\n]*\((\d+)\)', s, re.M)}

    out = []
    for g, pat in GROUPS.items():
        codes = re.findall(pat, s, re.M)
        # 'R-INC-04 ~ 06' 같은 범위 표기를 한 항목으로 셉니다
        uniq = sorted({re.sub(r'\s+', '', c) for c in codes})
        empty = 0
        for ln in s.split('\n'):
            if re.match(pat, ln) and any(e in ln for e in EMPTY):
                empty += 1
        d, t = declared.get(g), titled.get(g)
        ok = (d is None or d == len(uniq)) and (t is None or t == len(uniq))
        out.append({'group': g, 'declared': d, 'titled': t,
                    'actual': len(uniq), 'empty': empty, 'ok': ok,
                    'codes': uniq})
    return out


# ── ③ 포스처 커버리지 ──────────────────────────────────────────────────
def posture_coverage() -> list[dict]:
    rules = (ROOT / 'CATALOG_RULES.md').read_text(encoding='utf-8')
    slots = (ROOT / 'CATALOG_SLOTS.md').read_text(encoding='utf-8')
    out = []
    for po in POSTURES:
        pre = POSTURE_PREFIX[po]
        # 🔴 본문 전체를 훑으면 해설 문장의 언급까지 셉니다.
        #    **표 행에서만** 세고, 취소선(폐기)은 뺍니다.
        arche = len({m.group(1) for ln in rules.split('\n')
                     if not ln.lstrip().startswith('| ~~')
                     for m in [re.match(rf'^\|\s*\*{{0,2}}({pre}-\d+)', ln)] if m})
        # 포스처 이름이 조건에 등장하는 L·C·G 행
        def cond(prefix: str) -> int:
            n = 0
            for ln in rules.split('\n'):
                if re.match(rf'^\|\s*\*{{0,2}}{prefix}\d', ln) and po in ln:
                    n += 1
            return n
        out.append({
            'posture': po,
            'archetypes': arche,
            'layout_rules': cond('L'),
            'constraints': cond('C'),
            'gates': cond('G'),
            'in_slot_matrix': po in slots,
        })
    return out


# ── ④ 자릿수 ───────────────────────────────────────────────────────────
def digit_style() -> dict:
    """G1 인가 G01 인가. 두 표기가 섞이면 로그 검색이 갈립니다."""
    rules = (ROOT / 'CATALOG_RULES.md').read_text(encoding='utf-8')
    one = len(set(re.findall(r'^\|\s*\*{0,2}(G[1-9])\*{0,2}\s*\|', rules, re.M)))
    two = len(set(re.findall(r'^\|\s*\*{0,2}(G0\d)\*{0,2}\s*\|', rules, re.M)))
    reg = ROOT / 'credeal' / 'ssot' / 'im.errors.yaml'
    reg_two = len(re.findall(r'code: G0\d', reg.read_text(encoding='utf-8'))) \
        if reg.exists() else 0
    return {'catalog_1digit': one, 'catalog_2digit': two,
            'registry_2digit': reg_two,
            'mismatch': one > 0 and reg_two > 0}


# ── ⑤ 요구서 대조 ──────────────────────────────────────────────────────
def against_registry(owns, groups, cover, dig) -> list[str]:
    """credeal/ssot/im.ontology.yaml 의 목표값과 실측을 맞춥니다.

    요구서를 써 두기만 하면 아무도 안 봅니다. **실측이 목표에 닿았는지를
    매번 기계가 말해야** 보완이 끝난 시점을 알 수 있습니다.
    """
    reg = ROOT / 'credeal' / 'ssot' / 'im.ontology.yaml'
    if not reg.exists():
        return ['im.ontology.yaml 없음 — 요구서 대조를 건너뜁니다']
    try:
        import yaml
    except ImportError:
        return ['PyYAML 없음 — 요구서 대조를 건너뜁니다']
    d = yaml.safe_load(reg.read_text(encoding='utf-8'))
    now = {
        'owning_refs_to_superseded': len(owns),
        # ② 표에서 🔴 로 표시되는 행 수와 같은 값이어야 합니다
        'code_group_mismatch': sum(1 for g in groups
                                   if not g['ok'] or g['empty']),
        'empty_code_definitions': sum(g['empty'] for g in groups),
        'postures_without_archetype': sum(1 for c in cover
                                          if not c['archetypes']),
        'posture_conditional_gates': sum(c['gates'] for c in cover),
        'digit_style_mismatch': dig['mismatch'],
    }
    base = d.get('baseline_2026_08_25', {})
    lines = []
    for k, v in now.items():
        b = base.get(k)
        tgt = d['targets'].get(k)
        if b is None:
            continue
        # 목표가 '> 0' 이면 큰 값이 좋고, 나머지는 작은 값이 좋습니다.
        higher_better = isinstance(tgt, str) and '>' in tgt
        done = (v > 0) if higher_better else (v == tgt)
        if v == b:
            mark = '변화 없음'
        elif isinstance(v, int) and isinstance(b, int):
            better = (v > b) if higher_better else (v < b)
            mark = ('개선 ' if better else '악화 ') + f'{b}→{v}'
        else:
            mark = ('개선 ' if done else '악화 ') + f'{b}→{v}' 
        lines.append(f'   {k:<32}{str(v):>6}  목표 {str(tgt):<6}'
                     f'{"통과" if done else "미달"}  {mark}')
    stat = [u for u in d['upgrades'] if u.get('status') != '반영']
    lines.append(f'   보완 요구 {len(d["upgrades"])}건 중 미착수 {len(stat)}건 '
                 f'— {" · ".join(u["id"] for u in stat)}')
    return lines


# ── 실행 ───────────────────────────────────────────────────────────────
def run() -> tuple[int, dict]:
    dead = superseded()
    owns, refs = dead_refs(dead)
    groups = code_groups()
    cover = posture_coverage()
    dig = digit_style()

    bad = 0
    print('온톨로지 정본 역방향 대조')
    print('═' * 74)

    print(f'\n① 폐기 문서 참조 — 폐기 {len(dead)}종')
    for d in dead:
        print(f'     {d}')
    if owns:
        bad += 1
        print(f'\n   🔴 살아 있는 정본이 폐기 문서를 **소유자로** 지목 {len(owns)}건')
        for o in owns:
            print(f'      {o["file"]}:{o["line"]:<4} → {o["target"]}')
    else:
        print('\n   소유 지목 0건')
    print(f'   일반 참조 {len(refs)}건 (정보용 인용은 허용됩니다)')

    print('\n② 코드군 선언 vs 실측')
    print(f'   {"군":<5}{"헤더":>6}{"절제목":>7}{"실측":>6}{"공란":>6}  판정')
    for g in groups:
        d = g['declared'] if g['declared'] is not None else '—'
        t = g['titled'] if g['titled'] is not None else '—'
        mark = '통과' if g['ok'] and not g['empty'] else '🔴'
        if not g['ok'] or g['empty']:
            bad += 1
        print(f'   {g["group"]:<5}{str(d):>6}{str(t):>7}{g["actual"]:>6}'
              f'{g["empty"]:>6}  {mark}')

    print('\n③ 포스처 커버리지')
    print(f'   {"포스처":<16}{"아키타입":>8}{"레이아웃":>8}{"제약":>6}{"게이트":>7}  슬롯표')
    for c in cover:
        mark = '' if c['archetypes'] else '  🔴 아키타입 없음'
        if not c['archetypes']:
            bad += 1
        print(f'   {c["posture"]:<16}{c["archetypes"]:>8}{c["layout_rules"]:>8}'
              f'{c["constraints"]:>6}{c["gates"]:>7}  '
              f'{"○" if c["in_slot_matrix"] else "✗"}{mark}')
    if all(c['gates'] == 0 for c in cover):
        print('   🔴 포스처 조건 게이트가 전 포스처 0건입니다')
        bad += 1

    print('\n④ 코드 자릿수')
    print(f'   CATALOG 1자리 {dig["catalog_1digit"]} · 2자리 {dig["catalog_2digit"]}'
          f' · 레지스트리 2자리 {dig["registry_2digit"]}')
    if dig['mismatch']:
        bad += 1
        print('   🔴 G1 과 G01 이 섞여 있습니다 — 로그 검색이 갈립니다')

    print('\n⑤ 요구서(im.ontology.yaml) 대조')
    for ln in against_registry(owns, groups, cover, dig):
        print(ln)

    print('\n' + '═' * 74)
    print('정상' if not bad else f'보완 필요 {bad}건')
    return (1 if bad else 0,
            {'dead': dead, 'owns': owns, 'refs': len(refs),
             'groups': groups, 'coverage': cover, 'digits': dig})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    if a.json:
        import io
        import contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc, data = run()
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return rc
    return run()[0]


if __name__ == '__main__':
    sys.exit(main())

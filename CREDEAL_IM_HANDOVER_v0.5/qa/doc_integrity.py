#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
doc_integrity.py — 문서 세트 무결성 (D25 §4-N7)

`qa/ontology_check.py` 가 온톨로지 **내부**를 보고,
이 검사기는 **문서 세트 전체**를 봅니다.

    "규칙이 자기 자신과 맞는가?"      →  ontology_check
    "문서들이 서로 맞는가?"           →  이 파일

보는 것 6가지
    ① 폐기 문서가 루트에 남아 있는가 (격리 누락)
    ② 존재하지 않는 문서를 가리키는가 (끊긴 포인터)
    ③ 인덱스에도 없고 인용도 0인 문서가 있는가 (고아)
    ④ 포스처 표준 5종이 계약 13칸을 채웠는가
    ⑤ 문서 헤더의 온톨로지 버전이 최신인가
    ⑥ 신설·개정 문서가 CHANGELOG 에 있는가

사용:
    python3 doc_integrity.py
    python3 doc_integrity.py --json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SUPERSEDED = ROOT / '99_superseded'
CURRENT_ONTOLOGY = 'v0.5'

POSTURES = {
    'income':         'IM_STANDARD_수익형.md',
    'owner_occupied': 'IM_STANDARD_사옥형.md',
    'development':    'IM_STANDARD_개발형.md',
    'operating':      'IM_STANDARD_운영형.md',
    'trading':        'IM_STANDARD_단기매매형.md',
}

# 포스처 확장 계약 13칸 — ONTOLOGY_V0.5_SPEC §3.1
CONTRACT_KEYS = [
    'archetypes', 'sections', 'emphasisSections', 'requiredSlots',
    'valueMetric', 'yieldBasis', 'lAxisSlots', 'minResolution',
    'gradeAdjustment', 'layoutRules', 'constraints', 'gates', 'nlgMasks',
]

# 온톨로지 버전을 헤더에 달아야 하는 문서 (1·2층)
VERSIONED = [
    'ONTOLOGY_V0.5_SPEC.md', 'CATALOG_SLOTS.md', 'CATALOG_RULES.md',
    'CATALOG_ASSET_TYPES.md', 'CATALOG_LEXICON.md',
    'ONTOLOGY_GOVERNANCE_SPEC.md', *POSTURES.values(),
]

# 패키지 배포본에서 샘플이 credeal/samples/ 로 이동합니다 — 경로만 다르고 같은 파일


# 문서가 아닌 것 — 골든 레코드 ID · glob 패턴 등
# 문서 이름이 아닌 것 — 검사에서 뺍니다.
NOT_A_DOC = re.compile(
    r'^(G\d\d-'                       # 골든 레코드 ID
    r'|\d'                            # 01_property_overview.md — IM 산출물 섹션
    r'|_'                             # `A.md` · `_B.md` 축약 나열의 뒷항목
    r'|SPEC\.md$|PDF\.md$|MANIFEST\.md$'
    r'|.*EXTRACTION_REPORT\.md$)')    # 딜별 생성물
GLOB_OR_PLACEHOLDER = re.compile(r'[*<>{}]')


def live_docs() -> dict[str, str]:
    return {p.name: p.read_text(encoding='utf-8') for p in ROOT.glob('*.md')}


# ── ① 격리 누락 ────────────────────────────────────────────────────────
def unquarantined(docs: dict[str, str]) -> list[str]:
    """루트에 ⛔ 헤더가 남아 있으면 99_superseded/ 로 안 옮긴 것입니다."""
    out = []
    for n, s in docs.items():
        head = '\n'.join(s.split('\n')[:3])
        if re.search(r'SUPERSEDED|⛔', head, re.I):
            out.append(n)
    return out


# ── ② 끊긴 포인터 ──────────────────────────────────────────────────────
def broken_links(docs: dict[str, str]) -> list[dict]:
    root = {p.name for p in ROOT.glob('*.md')}
    elsewhere = {p.name for p in ROOT.rglob('*.md')} - root
    dead = {p.name for p in SUPERSEDED.glob('*.md')} if SUPERSEDED.exists() else set()
    out = []
    for n, s in docs.items():
        # MANIFEST 는 파일 목록이지 인용이 아닙니다.
        if n == 'MANIFEST.md':
            continue
        for i, ln in enumerate(s.split('\n'), 1):
            # 🔴 한글 파일명이 절반입니다. ASCII 만 보면 절반을 놓칩니다.
            #    백틱과 마크다운 링크 둘 다 봅니다.
            for m in re.finditer(r'`([^`\s]+\.md)`|\]\(([^)\s]+\.md)\)', ln):
                t = m.group(1) or m.group(2)
                t = t.split('/')[-1]
                if NOT_A_DOC.match(t) or GLOB_OR_PLACEHOLDER.search(t):
                    continue
                if t in root:
                    continue
                if t in elsewhere:
                    # 🔴 루트에 없고 하위(99_superseded 등)에만 있습니다.
                    #    "존재한다"고 넘기면 폐기 문서 인용이 통과합니다.
                    out.append({'file': n, 'line': i, 'target': t,
                                'kind': 'superseded' if t in dead else 'moved'})
                    continue
                out.append({'file': n, 'line': i, 'target': t, 'kind': 'missing'})
    return out


# ── ③ 고아 ─────────────────────────────────────────────────────────────
def orphans(docs: dict[str, str]) -> list[str]:
    """인덱스(README)에도 없고 다른 문서가 인용하지도 않는 문서."""
    index = docs.get('README.md', '')
    cited = set()
    for n, s in docs.items():
        for m in re.finditer(r'([A-Za-z0-9_\-가-힣\.]+\.md)', s):
            if m.group(1) != n:
                cited.add(m.group(1))
    skip = {'README.md', 'CHANGELOG.md', 'MANIFEST.md'}
    return sorted(n for n in docs
                  if n not in skip and n not in cited and n not in index)


# ── ④ 포스처 계약 ──────────────────────────────────────────────────────
def posture_contracts() -> list[dict]:
    out = []
    for po, fname in POSTURES.items():
        p = ROOT / fname
        if not p.exists():
            out.append({'posture': po, 'file': fname, 'exists': False,
                        'filled': [], 'missing': CONTRACT_KEYS, 'status': None})
            continue
        s = p.read_text(encoding='utf-8')
        # 🔴 백틱 키워드만 세면 **칸 이름만 나열해도 통과**합니다.
        #    계약 표의 **행**을 찾고, 값 칸이 비어 있지 않은지 봅니다.
        #      | 1 | `archetypes` | R-OPR-01~04 | CATALOG_RULES §1.4 |
        filled = []
        for k in CONTRACT_KEYS:
            m = re.search(rf'^\|[^|\n]*\|\s*`{re.escape(k)}`\s*\|([^|\n]*)\|',
                          s, re.M)
            if m and m.group(1).strip(' *—-'):
                filled.append(k)
        m = re.search(r'\*\*계약 status\*\*.*?\|\s*.*?(commercial|beta|internal_only)', s)
        out.append({'posture': po, 'file': fname, 'exists': True,
                    'filled': filled,
                    'missing': [k for k in CONTRACT_KEYS if k not in filled],
                    'status': m.group(1) if m else None})
    return out


# ── ⑤ 버전 정합 ────────────────────────────────────────────────────────
def stale_versions(docs: dict[str, str]) -> list[dict]:
    out = []
    for n in VERSIONED:
        s = docs.get(n)
        if s is None:
            out.append({'file': n, 'found': '없음'})
            continue
        head = '\n'.join(s.split('\n')[:20])
        m = re.search(r'\*\*온톨로지\*\*\s*\|\s*\*{0,2}(v[\d.]+)', head)
        v = m.group(1) if m else None
        if v is None or not v.startswith(CURRENT_ONTOLOGY):
            out.append({'file': n, 'found': v or '미표기'})
    return out


# ── ⑥ CHANGELOG ────────────────────────────────────────────────────────
def changelog_gap(docs: dict[str, str]) -> list[str]:
    cl = docs.get('CHANGELOG.md', '')
    watch = [*POSTURES.values(), 'ONTOLOGY_V0.5_SPEC.md',
             'IM_PIPELINE_RUNTIME_SPEC.md', 'IM_HANDOVER_SET.md',
             'IM_PIPELINE_COMPLETION_SPEC.md', 'WORK_ORDER.md']
    return [n for n in watch if n[:-3] not in cl and n not in cl]


# ── 실행 ───────────────────────────────────────────────────────────────
BASELINE = ROOT / 'qa' / 'doc_baseline.json'


def baseline() -> dict:
    """되돌림 방지용 기준선.

    폐기 문서 인용 100건을 한 번에 0으로 만들 수는 없습니다.
    **늘어나는 것만 막고**, 줄면 기준선을 낮춰 되돌아가지 못하게 합니다.
    """
    if BASELINE.exists():
        return json.loads(BASELINE.read_text(encoding='utf-8'))
    return {}


def run() -> tuple[int, dict]:
    docs = live_docs()
    unq = unquarantined(docs)
    brk = broken_links(docs)
    orp = orphans(docs)
    con = posture_contracts()
    ver = stale_versions(docs)
    chg = changelog_gap(docs)

    bad = 0
    print('문서 세트 무결성')
    print('═' * 74)
    print(f'\n  루트 md {len(docs)} · 폐기 격리 '
          f'{len(list(SUPERSEDED.glob("*.md"))) - 1 if SUPERSEDED.exists() else 0}')

    print(f'\n① 폐기 격리')
    if unq:
        bad += 1
        print(f'   🔴 루트에 폐기 문서가 남아 있습니다 {len(unq)}건')
        for n in unq:
            print(f'      {n} → 99_superseded/ 로 옮기십시오')
    else:
        print('   격리 누락 0건')

    base = baseline()
    dead_refs = [b for b in brk if b['kind'] == 'superseded']
    miss_refs = [b for b in brk if b['kind'] != 'superseded']

    print(f'\n②-1 없는 문서 참조')
    if miss_refs:
        bad += 1
        print(f'   🔴 {len(miss_refs)}건')
        seen = set()
        for b in miss_refs:
            if b['target'] in seen:
                continue
            seen.add(b['target'])
            print(f'      {b["file"]}:{b["line"]:<4} → {b["target"]}')
    else:
        print('   0건')

    print(f'\n②-2 폐기 문서 인용 (래칫 — 늘면 차단)')
    prev = base.get('superseded_refs')
    n = len(dead_refs)
    if prev is None:
        print(f'   {n}건 — 기준선 미설정. `--set-baseline` 으로 기록하십시오')
    elif n > prev:
        bad += 1
        print(f'   🔴 {prev} → {n} 늘었습니다. 새 인용에 [HIST] 를 달거나 '
              f'승계 문서로 바꾸십시오')
    elif n < prev:
        print(f'   {prev} → {n} 줄었습니다 ✓ — `--set-baseline` 으로 기준선을 낮추십시오')
    else:
        print(f'   {n}건 (기준선 유지)')
    top = {}
    for b in dead_refs:
        top[b['target']] = top.get(b['target'], 0) + 1
    for t, c in sorted(top.items(), key=lambda x: -x[1])[:5]:
        print(f'      {c:>3}  {t}')

    print(f'\n③ 고아 문서 (인덱스에도 없고 인용도 0)')
    if orp:
        bad += 1
        print(f'   🔴 {len(orp)}건 — 인덱스(README)에 넣으십시오')
        for n in orp:
            print(f'      {n}')
    else:
        print('   고아 0건')

    print(f'\n④ 포스처 확장 계약 13칸')
    print(f'   {"포스처":<16}{"채움":>5}{"":>3}{"status":<14} 미충족')
    for c in con:
        if not c['exists']:
            bad += 1
            print(f'   {c["posture"]:<16}  🔴 문서 없음 — {c["file"]}')
            continue
        n = len(c['filled'])
        mark = '' if n == 13 else '  🔴'
        if n < 13:
            bad += 1
        miss = ' · '.join(c['missing'][:4]) + ('…' if len(c['missing']) > 4 else '')
        print(f'   {c["posture"]:<16}{n:>3}/13{mark:<4}{str(c["status"]):<14} {miss}')

    print(f'\n⑤ 온톨로지 버전 정합 (목표 {CURRENT_ONTOLOGY})')
    if ver:
        bad += 1
        print(f'   🔴 {len(ver)}건')
        for v in ver:
            print(f'      {v["file"]:<34} {v["found"]}')
    else:
        print(f'   {len(VERSIONED)}종 전량 {CURRENT_ONTOLOGY}')

    print(f'\n⑥ CHANGELOG 기재')
    if chg:
        bad += 1
        print(f'   🔴 미기재 {len(chg)}건 — {" · ".join(chg)}')
    else:
        print('   신설·개정 전량 기재')

    print('\n' + '═' * 74)
    print('정상' if not bad else f'보완 필요 {bad}건')
    return (1 if bad else 0,
            {'docs': len(docs), 'unquarantined': unq, 'broken': brk,
             'orphans': orp, 'contracts': con, 'stale_versions': ver,
             'changelog_gap': chg})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--set-baseline', action='store_true',
                    help='현재 실측을 기준선으로 기록합니다 (개선했을 때만)')
    a = ap.parse_args()
    if a.set_baseline:
        rc, data = run()
        n = sum(1 for b in data['broken'] if b['kind'] == 'superseded')
        BASELINE.write_text(json.dumps({'superseded_refs': n},
                                       ensure_ascii=False, indent=2) + '\n',
                            encoding='utf-8')
        print(f'\n기준선 기록 — 폐기 인용 {n}건')
        return 0
    if a.json:
        import contextlib
        import io
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc, data = run()
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return rc
    return run()[0]


if __name__ == '__main__':
    sys.exit(main())

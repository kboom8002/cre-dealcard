#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_md.py — 섹션 7종 카피 전문을 마크다운으로 출력 (D18 §5·§6 부속)

모바일·PPTX와 **같은 코어·같은 카피**에서 나옵니다.
문서와 산출물이 어긋날 수 없습니다.
"""
from __future__ import annotations

import sys
from pathlib import Path

import im_core
import im_copy

OUT = Path(__file__).resolve().parent


def block_md(b: dict) -> str:
    k = b['t']
    if k == 'p':
        return b['text']
    if k == 'h':
        return f'### {b["text"]}'
    if k == 'note':
        return f'> {b["text"]}'
    if k == 'warn':
        return f'> **{b["text"]}**'
    if k == 'list':
        return '\n'.join(f'{i}. {x}' if b.get('ordered') else f'- {x}'
                         for i, x in enumerate(b['items'], 1))
    if k == 'table':
        al = {'l': '---', 'r': '--:', 'c': ':-:'}
        head = '| ' + ' | '.join(b['head']) + ' |'
        sep = '|' + '|'.join(al[a] for a in b['align']) + '|'
        rows = '\n'.join('| ' + ' | '.join(str(v) for v in r) + ' |'
                         for r in b['rows'])
        return f'{head}\n{sep}\n{rows}'
    raise ValueError(k)


def build(core: im_core.IMCore, name: str) -> str:
    secs = im_copy.build(core)
    gu = core.address_band.split()[-1]
    out = [f'# {name} — 수익형 IM 섹션 카피 전문',
           '',
           '> `im_core.py` + `im_copy.py` 에서 생성했습니다. 손으로 고치지 마십시오.',
           '> 모바일 IM·PPTX IM과 **같은 문장**입니다.',
           '',
           '| | |', '|---|---|',
           f'| **소재** | {core.address_band} |',
           f'| **유형** | 수익형 · {core.asset_type} |',
           f'| **매매 희망가** | **{im_core.eok(core.price, 0)}** |',
           f'| **해상도** | **{core.resolution_computed[0]}** |',
           f'| **임대 현황** | {len(core.rows)}행 · ' +
           ' · '.join(f'{k} {v}' for k, v in core.state_counts.items()) + ' |',
           f'| **차단 게이트** | {", ".join(core.gates_blocking) or "없음"} |',
           f'| **확인 필요** | **{len(core.deficiencies)}건** |',
           '']

    out += ['---', '', '## 첫 화면 숫자 3개', '',
            '| 위치 | 라벨 | 값 | 기준 |', '|:-:|---|--:|---|']
    for i, h in enumerate(core.hero(), 1):
        out.append(f'| {i} | {h["label"]} | **{h["value"]}** | {h["basis"]} |')
    out.append('')

    for i, s in enumerate(secs, 1):
        nd = len(s['deficiencies'])
        out += ['---', '',
                f'## {i}. {s["title"]} — 「{s["question"]}」', '',
                f'`{s["key"]}` · 뱃지 **{s["badge"]}**' +
                (f' {nd}건' if nd else '') + '', '']
        for b in s['blocks']:
            out += [block_md(b), '']

    return '\n'.join(out)


def main() -> int:
    for fid, name in (('dangsan', '당산동'), ('yangpyeong', '양평동')):
        core = im_core.load(fid)
        p = OUT / f'{name}_섹션카피.md'
        p.write_text(build(core, name), encoding='utf-8')
        print(f'{p.name:<22} {len(p.read_text(encoding="utf-8").splitlines()):>4}행')
    return 0


if __name__ == '__main__':
    sys.exit(main())

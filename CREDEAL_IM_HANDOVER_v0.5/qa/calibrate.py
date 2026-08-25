#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""calibrate.py — 점검기 양방향 보정 (D17 §4.4 · D18 §10)

점검기가 신뢰받으려면 **두 가지를 동시에** 만족해야 합니다.

  1. 오탐 0 — 정본(골든 · 기준 산출물)을 통과시킨다
  2. 미탐 0 — 실제 결함 산출물을 차단한다

1번이 깨지면 팀이 검사를 끕니다. 2번이 깨지면 검사가 의미가 없습니다.
"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

# 차단 0건이어야 하는 정본
PASS = [
    ('골든', '../golden/G01-yangpyeong-250.md', 'yangpyeong'),
    ('골든', '../golden/G02-dangsan-115.md', 'dangsan'),
    ('골든', '../golden/G06-jamwon-dev.md', 'jamwon'),
    ('모바일', '../goldilocks/당산동_모바일IM.html', 'dangsan'),
    ('모바일', '../goldilocks/양평동_모바일IM.html', 'yangpyeong'),
    ('PPTX', '../goldilocks/당산동_PPTX_IM.txt', 'dangsan'),
    ('PPTX', '../goldilocks/양평동_PPTX_IM.txt', 'yangpyeong'),
]

# 차단이 나와야 하는 결함 산출물 (최소 건수)
BLOCK = [
    ('v4 PDF', '../goldilocks/_regression/당산동_v4결함.txt', 'dangsan', 8),
]


def run(art: str, fx: str) -> tuple[int, str]:
    r = subprocess.run(
        [sys.executable, str(HERE / 'output_qa.py'),
         '--fixture', str(HERE / f'../fixtures/{fx}.json'), art],
        capture_output=True, text=True, cwd=HERE)
    return r.returncode, r.stdout


def n_block(out: str) -> int:
    for l in out.splitlines():
        if l.startswith('차단 '):
            return int(l.split('·')[0].replace('차단', '').strip())
    return -1


def main() -> int:
    bad = 0

    print('① 오탐 검사 — 정본은 차단되지 않아야 합니다')
    for kind, art, fx in PASS:
        p = HERE / art
        if not p.exists():
            print(f'   건너뜀  {kind:<6} {Path(art).name}')
            continue
        code, out = run(art, fx)
        n = n_block(out)
        ok = code == 0
        bad += not ok
        print(f'   {"통과" if ok else "실패"}  {kind:<6} {Path(art).name:<26} 차단 {n}')
        if not ok:
            print('\n'.join('          ' + l for l in out.splitlines()
                            if l.startswith('[차단]')))

    print('\n② 미탐 검사 — 결함 산출물은 차단되어야 합니다')
    for kind, art, fx, least in BLOCK:
        p = HERE / art
        if not p.exists():
            print(f'   건너뜀  {kind:<6} {Path(art).name}')
            continue
        code, out = run(art, fx)
        n = n_block(out)
        ok = code == 1 and n >= least
        bad += not ok
        print(f'   {"통과" if ok else "실패"}  {kind:<6} {Path(art).name:<26} '
              f'차단 {n} (최소 {least})')

    print(f'\n{"보정 정상" if not bad else f"보정 실패 {bad}건"}')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())

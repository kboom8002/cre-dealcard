#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""calibrate.py — 점검기 보정 검증 (D17 §4.4)

점검기가 신뢰받으려면 두 가지를 동시에 만족해야 합니다.

  1. 정본(골든)을 통과시킨다        — 오탐이 없다
  2. 실제 결함 산출물을 차단한다     — 미탐이 없다

하나라도 깨지면 팀이 점검기를 끄게 됩니다.
"""
import subprocess, sys
from pathlib import Path

HERE = Path(__file__).parent
PAIRS = [('../golden/G01-yangpyeong-250.md', 'yangpyeong', 0),
         ('../golden/G02-dangsan-115.md',    'dangsan',    0),
         ('../golden/G06-jamwon-dev.md',     'jamwon',     0)]

def run(art, fx):
    r = subprocess.run([sys.executable, str(HERE / 'output_qa.py'),
                        '--fixture', str(HERE / f'../fixtures/{fx}.json'), art],
                       capture_output=True, text=True, cwd=HERE)
    return r.returncode, r.stdout

def main():
    bad = 0
    print('정본 통과 검사 (차단 0 기대)')
    for art, fx, want in PAIRS:
        if not (HERE / art).exists():
            print(f'  건너뜀 {art}'); continue
        code, out = run(art, fx)
        ok = code == want
        bad += not ok
        line = [l for l in out.splitlines() if l.startswith('차단 ')]
        print(f'  {"통과" if ok else "실패"}  {Path(art).name:<26} {line[0] if line else ""}')
        if not ok:
            print('\n'.join('        ' + l for l in out.splitlines()
                            if l.startswith('[차단]')))
    print(f'\n{"보정 정상" if not bad else f"보정 실패 {bad}건"}')
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(main())

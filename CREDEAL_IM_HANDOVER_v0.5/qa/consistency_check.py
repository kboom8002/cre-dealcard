#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
consistency_check.py — 면 간 일관성 (D22-7 §4.8)

같은 지표가 여러 면에 나올 때 **값이 같은지** 봅니다.

양평동 덱에서 실제로 이런 일이 있었습니다.

    표지 · 개요 · 토지가치 면    15,933만원/평
    한 장 요약 면              1억 5,923만원      ← 손으로 쓴 카피의 오타

검사기 다섯 층이 전부 통과시켰습니다. 어느 검사도 면과 면을 비교하지
않았기 때문입니다. 각 면은 그 자체로는 흠이 없었습니다.

사용:
    python3 consistency_check.py <pptx|html>...
"""
from __future__ import annotations

import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

# 같은 지표를 가리키는 표기 변형. 값만 뽑아 비교합니다.
# 억·만 혼용을 정규화합니다 — '1억 5,923만원' 과 '15,923만원' 은 같은 값입니다.
MONEY = re.compile(r'(?:(\d+)억\s*)?([\d,]+)?만원')
# 🔴 '평당' 만 보면 연면적 평당가·공시지가 평당가까지 걸립니다.
#    같은 지표끼리만 비교해야 합니다 — 처음에 이것 때문에 오탐이 났습니다.
PATTERNS = {
    '토지 평당가': re.compile(
        r'(?:토지\s*평당|평당가\s*\(\s*토지\s*\))(?:가)?\s*'
        r'((?:\d+억\s*)?[\d,]+\s*만원)'),
    '연면적 평당가': re.compile(
        r'연면적\s*평당(?:가)?\s*((?:\d+억\s*)?[\d,]+\s*만원)'),
    '매매가': re.compile(r'매매\s*(?:희망)?가[^\d]{0,6}([\d,]+억)'),
    '월 임대료 합계': re.compile(r'월\s*임대료\s*(?:합계)?[^\d]{0,4}([\d,]+만원)'),
    '공시지가 배수': re.compile(r'([\d.]+)\s*배'),
    '용적률': re.compile(r'용적률\s*([\d.]+)%'),
}


def norm_money(t: str) -> int:
    """'1억 5,923만원' → 159230000 · '15,933만원' → 159330000"""
    m = MONEY.search(t.replace(' ', ''))
    if not m:
        return -1
    eok = int(m.group(1) or 0)
    man = int((m.group(2) or '0').replace(',', ''))
    return eok * 100_000_000 + man * 10_000


def pages(path: Path) -> list[tuple[str, str]]:
    if path.suffix.lower() == '.pptx':
        out = []
        with zipfile.ZipFile(path) as z:
            for n in sorted((x for x in z.namelist()
                             if re.match(r'ppt/slides/slide\d+\.xml$', x)),
                            key=lambda x: int(re.findall(r'\d+', x)[0])):
                t = ' '.join(re.findall(r'<a:t>(.*?)</a:t>',
                                        z.read(n).decode('utf-8'), re.S))
                out.append((n.split('/')[-1], t))
        return out
    import html as H
    t = path.read_text(encoding='utf-8')
    t = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', t, flags=re.S | re.I)
    secs = re.split(r'<section', t, flags=re.I)
    return [(f'sec{i}', H.unescape(re.sub(r'<[^>]+>', ' ', x)))
            for i, x in enumerate(secs)]


def check(path: Path) -> list[str]:
    seen: dict[str, dict] = defaultdict(dict)
    for name, text in pages(path):
        for key, pat in PATTERNS.items():
            for hit in pat.findall(text):
                v = norm_money(hit) if '만원' in hit or '억' in hit else hit
                seen[key].setdefault(v, []).append(name)

    bad = []
    for key, vals in seen.items():
        if len(vals) <= 1:
            continue
        # 배수·용적률은 문맥이 여럿이라 판정에서 뺍니다 (오탐이 많습니다)
        if key in ('공시지가 배수', '용적률'):
            continue
        parts = ' / '.join(f'{v} ({",".join(sorted(set(ns)))})'
                           for v, ns in vals.items())
        bad.append(f'{key} — 면마다 값이 다릅니다: {parts}')
    return bad


def main() -> int:
    args = sys.argv[1:]
    if not args:
        # 🔴 인자 0개면 아무것도 검사하지 않고 통과합니다 — 공허 통과입니다.
        #    CI 에서 인자를 빠뜨리면 게이트가 조용히 무력화됩니다.
        print('검사 대상이 없습니다. 산출물 경로를 넘기십시오.')
        print('  python3 consistency_check.py <pptx|html>...')
        return 2
    bad = 0
    print('면 간 일관성 검사')
    print('─' * 74)
    for a in args:
        p = Path(a)
        fs = check(p)
        print(f'  {"통과" if not fs else "🔴"}  {p.name}')
        for f in fs:
            print(f'        {f}')
        bad += bool(fs)
    print('─' * 74)
    print('정상' if not bad else f'불일치 {bad}건 — 손으로 쓴 카피를 의심하십시오')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())

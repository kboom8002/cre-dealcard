#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cross_property.py — 두 물건 교차 대조 (D17 §6.3)

원인 A(하드코딩 boilerplate)는 한 물건만 보면 절대 드러나지 않습니다.
같은 회차에 생성한 서로 다른 물건의 산출물을 대조해,
**바이트 단위로 같은 문장**이 있으면 그것은 데이터에서 파생된 값이 아닙니다.

    python3 cross_property.py <물건A 경로> <물건B 경로> [--min 25]

경로는 파일이거나 디렉터리(하위 .md/.html/.txt를 모두 읽음)입니다.

종료 코드:
    0  공통 문장 없음
    1  공통 문장 발견  ← CI에서 경고
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

EXT = {'.md', '.html', '.htm', '.txt', '.pptx'}

# 물건과 무관하게 같아야 하는 문장은 제외한다.
#   ① 면책·법정 고지  ② 표준 결손 문형  ③ 표 라벨·가정 각주
# 결손 문형은 어휘 표준상 물건이 달라도 동일해야 한다 — 이것을 잡으면
# 정본 골든이 매번 걸려 신호가 묻힌다.
ALLOW = re.compile(
    r'면책|본 자료는|투자 조언|원금 손실|전문가 (?:검토|자문)|저작권'
    r'|개인정보|Confidential|무단 (?:전재|복제)|문의|담당 중개인'
    # ② 표준 결손 문형
    r'|확인 필요|제출 자료에 없|제출되지 않|확보되지 않|판정하지 않'
    r'|산출하지 않|기재하지 않|확정되지 않|확인이 필요'
    # ③ 표 라벨·가정 각주
    r'|÷|기준\)|통상 수준|가정 ◇|^\s*\d+\s*[.)]\s'
    # ④ 출처 문자열과 법정 세율 — 물건과 무관하게 같아야 합니다
    r'|출처 —|건축물대장|토지이용계획|개별공시지가|실거래|카카오|상권정보'
    r'|취득세 4|지방교육세|농특세|중개보수|법정 상한|중개인 제공'
    r'|◇|금리 4\.5|LTV|환산보증금|상가임대차법|VAT'
)


def sentences(path: Path, min_len: int) -> dict[str, str]:
    """문장 → 출처 파일명"""
    out: dict[str, str] = {}
    files = [path] if path.is_file() else [
        p for p in sorted(path.rglob('*')) if p.suffix.lower() in EXT]
    for f in files:
        if f.suffix.lower() == '.pptx':
            # PPTX 는 zip 입니다. 바이너리를 그대로 읽으면 쓰레기 문장이 나옵니다.
            import zipfile
            parts = []
            with zipfile.ZipFile(f) as z:
                for n in sorted(x for x in z.namelist()
                                if re.match(r'ppt/slides/slide\d+\.xml$', x)):
                    parts += re.findall(r'<a:t>(.*?)</a:t>',
                                        z.read(n).decode('utf-8'), re.S)
            t = '\n'.join(parts)
        else:
            t = f.read_text(encoding='utf-8', errors='replace')
        if f.suffix.lower() in ('.html', '.htm'):
            t = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', t, flags=re.S | re.I)
            t = re.sub(r'<[^>]+>', '\n', t)
        # 소수점(0.13)에서 문장을 끊으면 안 됩니다.
        # 끊으면 "…최대 차이 0" 이 두 물건에서 같아 보입니다.
        for s in re.split(r'(?<!\d)[.!?](?!\d)|[\n|]', t):
            s = re.sub(r'\s+', ' ', s).strip(' *#-')
            if len(s) >= min_len and not ALLOW.search(s):
                out.setdefault(s, f.name)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('a')
    ap.add_argument('b')
    ap.add_argument('--min', type=int, default=25,
                    help='공통으로 볼 최소 글자 수 (기본 25)')
    ns = ap.parse_args()

    pa, pb = Path(ns.a), Path(ns.b)
    for p in (pa, pb):
        if not p.exists():
            print(f'경로 없음: {p}', file=sys.stderr)
            return 2

    sa, sb = sentences(pa, ns.min), sentences(pb, ns.min)
    common = sorted(set(sa) & set(sb), key=len, reverse=True)

    # 사실 주장은 거의 항상 숫자를 담습니다.
    #   숫자 있는 공통 문장 → 두 물건에 같은 사실을 쓴 것 = 하드코딩 의심
    #   숫자 없는 공통 문장 → 정책·방법론·주의 문구 = 같아야 정상
    #   층 표기(1층·B1)와 해상도 등급(R1~R3)은 물건 고유의 값이 아닙니다.
    #   두 물건이 같은 등급이면 문장이 같은 것이 정상입니다.
    NOT_FACT = re.compile(r'R[0-3]|[Bb]?\d+\s*층|지상\s*\d|지하\s*\d'
                          r'|\d+\s*(?:개소|종|축|단)')
    HAS_NUM = re.compile(r'\d')
    facts = [s for s in common if HAS_NUM.search(NOT_FACT.sub('', s))]
    policy = [s for s in common if s not in facts]

    print(f'\n{pa.name}  ↔  {pb.name}   (최소 {ns.min}자)')
    print(f'문장 {len(sa)} vs {len(sb)} · 공통 {len(common)} '
          f'(사실 주장 {len(facts)} · 정책·방법론 {len(policy)})')
    print('─' * 70)

    if facts:
        print('■ 숫자를 담은 공통 문장 — 하드코딩(원인 A) 의심')
        for s in facts[:20]:
            print(f'  [{len(s):>3}자] {s[:100]}')
        print()
    if policy:
        print(f'□ 숫자 없는 공통 문장 {len(policy)}건 — 정책·방법론 문구로 봅니다')
        for s in policy[:6]:
            print(f'  [{len(s):>3}자] {s[:100]}')
        if len(policy) > 6:
            print(f'  … 외 {len(policy) - 6}건')

    print('─' * 70)
    if facts:
        print(f'사실 주장 공통 {len(facts)}건 — 값에서 파생되도록 고쳐야 합니다.')
        return 1
    print('사실 주장 공통 0건 — 사실 문장은 물건별로 생성되고 있습니다.')
    return 0


if __name__ == '__main__':
    sys.exit(main())

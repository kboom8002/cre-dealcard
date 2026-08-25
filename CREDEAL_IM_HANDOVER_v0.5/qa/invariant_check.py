#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
invariant_check.py — 자동 검사가 없던 불변조건을 채웁니다 (D22-5 §3)

`ssot/loader.py` 가 매 실행 경고하던 세 건 중 둘을 여기서 처리합니다.

    6.  업종·상호는 원문 그대로 쓰고 추론하지 않는다   → QA-SRC-01
    18. 렌트롤은 전량 표기한다                        → QA-RR-01
    14. 물건명·법인명·임차인명 대외 미표기 (이미지)     → G20 · D22-2 소관

**원장을 함께 받습니다.** 산출물만 봐서는 "전량"인지 알 수 없고
"원문 그대로"인지도 알 수 없습니다. 지금까지 이 두 건에 자동 검사가
없었던 이유가 그것입니다 — 검사기가 산출물만 읽었습니다.

사용:
    python3 invariant_check.py --fixture ../fixtures/dangsan.json <산출물...>
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'credeal' / 'ssot'))
import loader as SSOT                                            # noqa: E402


@dataclass
class Finding:
    code: str
    level: str          # 차단 | 경고
    msg: str
    resolve: str = ''


# ── 산출물 읽기 ────────────────────────────────────────────────────────
def read_pptx_rows(path: Path) -> list[list[str]]:
    """표의 행을 그대로 돌려줍니다. python-pptx 없이 XML 을 직접 봅니다."""
    rows: list[list[str]] = []
    with zipfile.ZipFile(path) as z:
        for n in sorted(x for x in z.namelist()
                        if re.match(r'ppt/slides/slide\d+\.xml$', x)):
            xml = z.read(n).decode('utf-8')
            for tbl in re.findall(r'<a:tbl>.*?</a:tbl>', xml, re.S):
                for tr in re.findall(r'<a:tr[ >].*?</a:tr>', tbl, re.S):
                    cells = [''.join(re.findall(r'<a:t>(.*?)</a:t>', tc, re.S))
                             for tc in re.findall(r'<a:tc>.*?</a:tc>', tr, re.S)]
                    rows.append(cells)
    return rows


def read_html_rows(path: Path) -> list[list[str]]:
    import html as H
    t = path.read_text(encoding='utf-8')
    rows = []
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', t, re.S | re.I):
        cells = [H.unescape(re.sub(r'<[^>]+>', '', c)).strip()
                 for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', tr, re.S | re.I)]
        rows.append(cells)
    return rows


def read_text(path: Path) -> str:
    if path.suffix.lower() == '.pptx':
        out = []
        with zipfile.ZipFile(path) as z:
            for n in sorted(x for x in z.namelist()
                            if re.match(r'ppt/slides/slide\d+\.xml$', x)):
                out += re.findall(r'<a:t>(.*?)</a:t>',
                                  z.read(n).decode('utf-8'), re.S)
        return '\n'.join(out)
    import html as H
    t = path.read_text(encoding='utf-8')
    if path.suffix.lower() in ('.html', '.htm'):
        t = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', t, flags=re.S | re.I)
        t = H.unescape(re.sub(r'<[^>]+>', '\n', t))
    return t


# ── 임대 현황 표 찾기 ──────────────────────────────────────────────────
# 표 전체를 훑지 않고 **헤더로 임대 현황 표를 특정**합니다.
# 문서 전체에서 호실 패턴을 찾으면 다른 표의 행까지 걸립니다.
# PPTX 는 '층별 … 임차 업종', 모바일은 '호실 … 업종' 입니다.
UNIT_HINT = ('호실', '층별', '층 구분')
TOTAL_ROW = re.compile(r'^(계|합계|소계|총계)$')


def find_rentroll(rows: list[list[str]]) -> tuple[list[list[str]], int]:
    """(데이터 행들, 업종 열 index). 못 찾으면 ([], -1)."""
    for i, r in enumerate(rows):
        if len(r) < 4:
            continue
        joined = ' '.join(r)
        if '업종' not in joined or not any(h in joined for h in UNIT_HINT):
            continue
        biz = next((j for j, c in enumerate(r) if '업종' in c), -1)
        data = []
        for r2 in rows[i + 1:]:
            if not r2 or not r2[0].strip():
                break
            if TOTAL_ROW.match(r2[0].strip()):
                break                      # 계 행은 렌트롤 행이 아닙니다
            if len(r2) != len(r):
                break                      # 다음 표로 넘어갔습니다
            data.append(r2)
        return data, biz
    return [], -1


# ── QA-RR-01 · 불변조건 18 ─────────────────────────────────────────────
def qa_rr_01(ledger: list[dict], out: Path) -> list[Finding]:
    """렌트롤 전량 표기. 원장 행수와 산출물 표 행수를 셉니다."""
    rows = (read_pptx_rows(out) if out.suffix.lower() == '.pptx'
            else read_html_rows(out))
    data, _ = find_rentroll(rows)
    n_out, n_led = len(data), len(ledger)

    if n_out == 0:
        return [Finding('QA-RR-01', '경고', '임대 현황 표를 찾지 못했습니다',
                        '표 헤더에 "임차 업종" 포함 확인')]
    if n_out < n_led:
        return [Finding('QA-RR-01', '차단',
                        f'렌트롤 {n_led}행 중 {n_out}행만 표기 — 불변조건 18 위반',
                        '전량 표기')]
    if n_out > n_led:
        return [Finding('QA-RR-01', '경고',
                        f'산출물 {n_out}행 > 원장 {n_led}행',
                        '병합·분할 행 확인')]
    return []


# ── QA-SRC-01 · 불변조건 6 ─────────────────────────────────────────────
# 업종을 추론하면 여기 걸립니다. 원장에 없는 업종어가 산출물에 나타나는 경우.
BUSINESS_HINTS = re.compile(
    r'(약국|의원|병원|한의원|치과|카페|커피|음식점|식당|편의점|헬쓰장|헬스장|'
    r'피트니스|학원|교습소|사무소|사무실|미용실|네일|주류판매|주점|호프|'
    r'세탁|부동산|은행|마트|슈퍼|안경|서점|베이커리|제과|정육|반찬|'
    r'요양|산후조리|스터디카페|공유오피스|물류|창고)')


# 업종 칸에 쓸 수 있는 비업종 표기. 값이 없는 상태를 나타냅니다.
NON_BUSINESS = ('자가', '공실', '확인 필요', '—', '-', '미상', '')


def qa_src_01(ledger: list[dict], out: Path) -> list[Finding]:
    """업종은 원문 그대로. 추론하면 여기 걸립니다 (불변조건 6).

    **문서 전체가 아니라 업종 열만 봅니다.** 전체를 훑으면
    "제이에스부동산중개(주)" 의 '부동산', 거래 절차의 '은행' 이 걸립니다.
    """
    rows = (read_pptx_rows(out) if out.suffix.lower() == '.pptx'
            else read_html_rows(out))
    data, biz = find_rentroll(rows)
    if biz < 0 or not data:
        return [Finding('QA-SRC-01', '경고', '업종 열을 특정하지 못했습니다',
                        '표 헤더 확인')]

    known = [str(r.get('tenantBusiness') or '').strip() for r in ledger]
    shown = [(r[biz].strip() if biz < len(r) else '') for r in data]

    bad: list[str] = []
    for i, s in enumerate(shown):
        if any(s.startswith(n) or s == n for n in NON_BUSINESS if n):
            continue                       # 자가·공실 표기는 업종이 아닙니다
        if i < len(known) and known[i]:
            if s != known[i]:
                bad.append(f'{i + 1}행')    # 🔴 값은 담지 않습니다
        elif s:
            bad.append(f'{i + 1}행(원장 공란)')

    if bad:
        return [Finding('QA-SRC-01', '차단',
                        f'업종이 원문과 다름 {len(bad)}건: {" · ".join(bad)}',
                        '원장 문자열 그대로 표기')]
    return []


# ── QA-MASK-02 · 불변조건 14 보조 ──────────────────────────────────────
def qa_mask_02(ledger: list[dict], out: Path) -> list[Finding]:
    """임차인명이 텍스트에 새지 않았는지. 이미지는 G20 소관입니다."""
    names = {str(r.get('tenantName') or '').strip()
             for r in ledger if r.get('tenantName')}
    names.discard('')
    if not names:
        return []
    text = read_text(out)
    leaked = sorted(n for n in names if n in text)
    if leaked:
        # 🔴 값을 로그에 담지 않습니다. 개수만 냅니다.
        return [Finding('QA-MASK-02', '차단',
                        f'임차인명 {len(leaked)}건이 산출물에 노출 — 불변조건 14',
                        '마스킹 적용')]
    return []


# ── 실행 ───────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--fixture', required=True)
    ap.add_argument('outputs', nargs='+')
    a = ap.parse_args()

    fx = json.loads(Path(a.fixture).read_text(encoding='utf-8'))
    ledger = fx['ledger']['rows']

    print(f'불변조건 검사 · 원장 {len(ledger)}행 '
          f'({Path(a.fixture).stem})')
    print('─' * 74)

    block = 0
    for o in a.outputs:
        p = Path(o)
        fs = qa_rr_01(ledger, p) + qa_src_01(ledger, p) + qa_mask_02(ledger, p)
        mark = '통과' if not fs else ('🔴' if any(f.level == '차단' for f in fs)
                                     else '⚠')
        print(f'{mark}  {p.name}')
        for f in fs:
            print(f'      {f.code} {f.level} · {f.msg}')
            if f.resolve:
                print(f'      {"":>12}→ {f.resolve}')
            block += (f.level == '차단')

    print('─' * 74)
    un = [i['n'] for i in SSOT.unchecked_invariants()]
    print(f'차단 {block}건 · SSoT 미검사 불변조건 {un}')
    return 1 if block else 0


if __name__ == '__main__':
    sys.exit(main())

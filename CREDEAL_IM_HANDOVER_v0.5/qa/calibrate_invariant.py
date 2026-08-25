#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
calibrate_invariant.py — invariant_check 양방향 보정

검사기를 믿을 수 있는 조건은 하나뿐입니다.

    ① 정상 산출물을 차단하지 않는다  (오탐 0)
    ② 결함 산출물을 반드시 차단한다  (미탐 0)

한쪽만 보면 "아무것도 안 잡는 검사기"나 "전부 잡는 검사기"가
통과해 버립니다. 둘 다 쓸모가 없습니다.

②의 결함은 **주입해서 만듭니다.** 실제 결함 산출물을 기다리면
검사기가 만들어지지 않습니다.

사용:
    python3 calibrate_invariant.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import invariant_check as IC                                     # noqa: E402

CLEAN = [
    ('dangsan', '../credeal/당산동_PPTX_IM_KR_R1.pptx'),
    ('dangsan', '../credeal/당산동_PPTX_IM_KR_R2.pptx'),
    ('dangsan', '../credeal/당산동_모바일IM_R1.html'),
    ('dangsan', '../credeal/당산동_모바일IM_R2.html'),
    ('dangsan', '../credeal/데모_당산동_evidence_first.pptx'),
    ('dangsan', '../credeal/데모_당산동_jsre_field_navy.pptx'),
    ('dangsan', '../credeal/데모_당산동_land_value_first.pptx'),
    ('multiparcel', '../credeal/multiparcel_IM_D22_A등급.pptx'),
    ('multiparcel', '../credeal/multiparcel_IM_D22_A등급_모바일.html'),
    ('yangpyeong', '../credeal/양평동_PPTX_IM_KR_R1.pptx'),
    ('yangpyeong', '../credeal/양평동_PPTX_IM_KR_R2.pptx'),
    ('yangpyeong', '../credeal/양평동_모바일IM_R1.html'),
    ('yangpyeong', '../credeal/양평동_모바일IM_R2.html'),
]

BASE = HERE / '../credeal/당산동_모바일IM_R2.html'


def ledger(fid: str) -> list[dict]:
    return json.loads((HERE / f'../fixtures/{fid}.json')
                      .read_text(encoding='utf-8'))['ledger']['rows']


def run(fid: str, p: Path) -> list[IC.Finding]:
    led = ledger(fid)
    return IC.qa_rr_01(led, p) + IC.qa_src_01(led, p) + IC.qa_mask_02(led, p)


# ── 결함 주입 ──────────────────────────────────────────────────────────
def inject() -> list[tuple[str, Path, str]]:
    """(설명, 파일, 기대 코드)"""
    t = BASE.read_text(encoding='utf-8')
    rows = re.findall(r'<tr[^>]*>.*?</tr>', t, re.S)
    out = []

    # ① 렌트롤 행 삭제 — 불변조건 18
    drop = next(r for r in rows if '헬쓰장' in r)
    p = Path('/tmp/_inv_drop.html')
    p.write_text(t.replace(drop, '', 1), encoding='utf-8')
    out.append(('렌트롤 1행 삭제', p, 'QA-RR-01'))

    # ② 업종 추론 — 불변조건 6
    p = Path('/tmp/_inv_infer.html')
    p.write_text(t.replace('>헬쓰장<', '>피트니스센터<'), encoding='utf-8')
    out.append(('업종을 다른 말로 바꿈', p, 'QA-SRC-01'))

    # ③ 업종 일반화 — 불변조건 6. '주류판매' → '근린생활'
    p = Path('/tmp/_inv_general.html')
    p.write_text(t.replace('>주류판매<', '>근린생활<'), encoding='utf-8')
    out.append(('업종을 상위 개념으로 일반화', p, 'QA-SRC-01'))

    # ④ 상위 3행 요약 — 불변조건 18
    p = Path('/tmp/_inv_top3.html')
    s = t
    for r in [r for r in rows if re.search(r'>(4F|5F)<', r)][:3]:
        s = s.replace(r, '', 1)
    p.write_text(s, encoding='utf-8')
    out.append(('하위 행을 잘라 요약', p, 'QA-RR-01'))

    return out


# 🔴 배포본에는 대형 데모 PPTX 가 빠집니다. 건너뛰는 것 자체는 괜찮지만
#    **몇 개를 실제로 봤는지 말하지 않으면 0건을 보고도 "정상"이 됩니다.**
MIN_COVERAGE = 8


def main() -> int:
    bad = 0
    seen = skipped = 0

    print('① 오탐 검사 — 정상 산출물은 차단되지 않아야 합니다')
    for fid, rel in CLEAN:
        p = (HERE / rel).resolve()
        if not p.exists():
            skipped += 1
            print(f'   건너뜀  {p.name}')
            continue
        seen += 1
        fs = run(fid, p)
        blocks = [f for f in fs if f.level == '차단']
        ok = not blocks
        bad += not ok
        print(f'   {"통과" if ok else "실패"}  {p.name:<34} 차단 {len(blocks)}')
        for f in blocks:
            print(f'          {f.code} {f.msg}')

    print(f'\n   대상 {len(CLEAN)} · 검사 {seen} · 건너뜀 {skipped}')
    if seen < MIN_COVERAGE:
        bad += 1
        print(f'   🔴 검사한 산출물이 {seen}건 — 최소 {MIN_COVERAGE}건이어야 합니다.'
              f' 산출물을 복원하거나 CLEAN 목록을 줄이십시오')

    print('\n② 미탐 검사 — 주입한 결함은 반드시 차단되어야 합니다')
    if not BASE.exists():
        print(f'   🔴 주입 기준본이 없습니다 — {BASE.name}. **미탐 검사를 못 합니다**')
        return 1
    for label, p, expect in inject():
        fs = run('dangsan', p)
        hit = [f for f in fs if f.level == '차단' and f.code == expect]
        ok = bool(hit)
        bad += not ok
        print(f'   {"통과" if ok else "실패"}  {label:<24} '
              f'{expect} {"검출" if ok else "🔴 놓침"}')
        for f in hit:
            print(f'          {f.msg}')

    print(f'\n{"보정 정상" if not bad else f"보정 실패 {bad}건"}')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())

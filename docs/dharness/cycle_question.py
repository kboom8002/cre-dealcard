#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cycle_question.py — PreInvocation 훅. **R5 「한 판에 한 질문」.**

에이전트는 긴 세션에서 목표가 번집니다. 시작할 때 「A 를 고치자」였다가
중간에 B·C·D 를 손보고, 끝나면 무엇이 나아졌는지 아무도 모릅니다.
사람도 그랬습니다 — V5 에서 22건을 지시하고 1건이 이행된 이유가 이것입니다.

이 훅은 매 모델 호출 앞에 **이번 사이클의 질문 하나**를 붙입니다.
질문은 `.agents/CYCLE.md` 에 사람이 적습니다. 참·거짓이 갈리는 문장이어야 합니다.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

CYCLE = Path('.agents/CYCLE.md')

TEMPLATE = """# 이번 사이클

## 질문 (참·거짓이 갈리는 문장 하나)
<여기에 적습니다. 예: "당산동에서 만료 30일 이내 4건이 IM 지면에 표시되는가">

## 대상 물건
dangsan | yangpyeong

## 이 사이클에서 건드리지 않을 것
<범위 밖을 명시합니다>
"""


def main() -> None:
    try:
        p = json.load(sys.stdin)
    except Exception:
        p = {}

    # 🔴 첫 호출에만 붙입니다. 매 호출마다 붙이면 소음이 되고, 소음은 무시됩니다.
    if p.get('invocationNum', 0) != 0:
        print(json.dumps({}))
        return

    if not CYCLE.exists():
        CYCLE.parent.mkdir(parents=True, exist_ok=True)
        CYCLE.write_text(TEMPLATE, encoding='utf-8')
        msg = ('🔴 .agents/CYCLE.md 가 없어서 만들었습니다. '
               '이번 사이클의 질문을 채우기 전에는 코드를 고치지 마십시오.')
    else:
        txt = CYCLE.read_text(encoding='utf-8')
        if '<여기에 적습니다' in txt:
            msg = ('🔴 .agents/CYCLE.md 의 질문이 비어 있습니다. '
                   '무엇이 참이면 이 사이클이 성공인지 먼저 정하십시오.')
        else:
            msg = ('이번 사이클의 계약입니다. 여기 적힌 질문 하나에만 답하십시오. '
                   '다른 결함을 발견하면 고치지 말고 목록에 적어 두십시오.\n\n'
                   + txt)

    print(json.dumps({'injectSteps': [{'ephemeralMessage': msg}]},
                     ensure_ascii=False))


if __name__ == '__main__':
    main()

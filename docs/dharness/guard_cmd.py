#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
guard_cmd.py — PreToolUse(run_command) 훅.

편집을 막아도 **명령으로 우회**할 수 있습니다.
`sed -i`, `git checkout --`, `--set-baseline`, `pytest -k 'not ...'` 같은 것들입니다.
D44 §17.3 의 「사람이 규율을 우회하는 여덟 경로」를 에이전트 버전으로 옮긴 것입니다.
"""
from __future__ import annotations

import json
import re
import sys

DENY = [
    (r'--set-baseline',
     '기준선 재설정은 사람만 합니다. 지금 실패를 기준선으로 만들면 실패가 사라집니다 (A6)'),
    (r'git\s+(checkout|restore)\s+.*\b(qa|cycles|tests/corpus)\b',
     '검사기·기준선·수용기준을 되돌리는 명령입니다'),
    (r'git\s+commit\s+.*(--no-verify|-n\b)',
     '훅을 건너뛰는 커밋입니다'),
    (r'git\s+push\s+.*(--force|-f)\b',
     '이력을 덮어씁니다'),
    (r'\bsed\s+-i\b.*\b(qa|\.agents|credeal/ssot)\b',
     '검사기·하네스를 인라인 편집하려 합니다 — 편집 도구를 쓰고 승인을 받으십시오'),
]

ASK = [
    (r'pytest\b.*(-k\s+[\'"]?not|--deselect|--ignore)',
     '테스트를 제외하고 돌리려 합니다 — 무엇을 왜 빼는지 말하십시오'),
    (r'\b(--no-strict|--skip|SKIP=|DISABLE_)',
     '검사를 끄는 옵션입니다'),
    (r'rm\s+-rf?\s',
     '삭제 명령'),
    (r'\bpip\s+install|\bnpm\s+i(nstall)?\b',
     '의존성 추가 — 재현성에 영향을 줍니다'),
]


def out(d: str, r: str = '') -> None:
    print(json.dumps({'decision': d, 'reason': r}, ensure_ascii=False))
    sys.exit(0)


def main() -> None:
    try:
        p = json.load(sys.stdin)
    except Exception:
        out('allow')
    cmd = ((p.get('toolCall') or {}).get('args') or {}).get('CommandLine', '')

    for pat, why in DENY:
        if re.search(pat, cmd):
            out('deny', f'🔴 실행할 수 없습니다 — {why}\n   명령: {cmd[:160]}')
    for pat, why in ASK:
        if re.search(pat, cmd):
            out('force_ask', f'🔴 {why}\n   명령: {cmd[:160]}')
    out('allow')


if __name__ == '__main__':
    main()
